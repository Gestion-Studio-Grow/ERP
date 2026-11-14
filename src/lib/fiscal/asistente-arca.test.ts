// Asistente ARCA: el paso derivado de lo cargado, el pedido de certificado (CSR) de punta a punta con
// cargarCredencialTenant (deps en memoria), la lectura del certificado pegado/subido y los textos.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import forge from "node-forge";
import {
  certificadoEnPem,
  confirmaElPase,
  errorDeCargaEnCriollo,
  estadoDelAsistente,
  generarPedidoDeCertificado,
  hayPedidoEnCurso,
  leerPedidoConEstado,
  motivoParaNoReemplazarPedido,
  problemaDelPedido,
  organizacionDelPedido,
  type EntradaAsistente,
} from "./asistente-arca";
import { cargarCredencialTenant, type RegistroCredencialFiscal } from "./tenant-cert";
import { cuitDesdeCertPem } from "@/plugins/arca/afip/cert-inspect";
import type { FichaFiscalDelPase } from "@/lib/operador/pase-a-real";

const CUIT = "20123456786";
const OTRO_CUIT = "20304050609";

const FICHA: FichaFiscalDelPase = {
  slug: "magra-canning",
  arcaCuit: CUIT,
  arcaPuntoVenta: 3,
  arcaHomologacion: true,
  arcaCondicionIva: "MONOTRIBUTO",
  credencial: null,
  delegacion: null,
  modoArca: "real",
  enListaReal: true,
  comprobantesDePrueba: { esperandoCae: 0, enviosAbiertos: 0, autorizados: 0, desde: null },
};
const CRED = (entorno: "produccion" | "homologacion", certCuit = CUIT) => ({
  certCuit,
  entorno,
  emisor: "AFIP",
  error: null,
  actualizada: "2026-11-01T12:00:00.000Z",
});
const entrada = (f: Partial<FichaFiscalDelPase>, extra: Partial<EntradaAsistente> = {}): EntradaAsistente => ({
  ficha: { ...FICHA, ...f },
  pedidoPendiente: null,
  problemaDelPedido: null,
  pedidoDePase: null,
  ...extra,
});

test("paso 1: sin CUIT, punto de venta o condición frente al IVA, toca «datos» y dice qué falta", () => {
  const e = estadoDelAsistente(entrada({ arcaCuit: null, arcaCondicionIva: null }));
  assert.equal(e.paso, "datos");
  assert.equal(e.faltanDatos.length, 2);
  assert.match(e.faltanDatos.join(" "), /Falta el CUIT/);
  assert.deepEqual(e.pasos.map((p) => p.estado), ["actual", "falta", "falta", "falta"]);
  assert.equal(e.puedePedirPase, false);
});

test("paso 2 → 3 → 4 → listo, según lo cargado", () => {
  assert.equal(estadoDelAsistente(entrada({})).paso, "pedido");
  const pendiente = { pedidoPendiente: { creadoEn: "2026-11-05T10:00:00.000Z" } };
  assert.equal(estadoDelAsistente(entrada({}, pendiente)).paso, "certificado");
  // Con certificado de pruebas: ya se puede probar; el paso 4 muestra que falta el de producción.
  const pruebas = estadoDelAsistente(entrada({ credencial: CRED("homologacion") }));
  assert.equal(pruebas.paso, "produccion");
  assert.equal(pruebas.certificado, "pruebas");
  assert.equal(pruebas.puedePedirPase, false);
  // Renovación: un pedido nuevo con un certificado ya cargado vuelve al paso 3.
  assert.equal(estadoDelAsistente(entrada({ credencial: CRED("produccion") }, pendiente)).paso, "certificado");
  const prod = estadoDelAsistente(entrada({ credencial: CRED("produccion") }));
  assert.equal(prod.paso, "produccion");
  assert.equal(prod.puedePedirPase, true);
  assert.deepEqual(prod.pasos.map((p) => p.estado), ["hecho", "hecho", "hecho", "actual"]);
  const listo = estadoDelAsistente(entrada({ credencial: CRED("produccion"), arcaHomologacion: false }));
  assert.equal(listo.paso, "listo");
  assert.ok(listo.pasos.every((p) => p.estado === "hecho"));
});

test("certificado de otro CUIT: vuelve al paso 2 y no deja pedir el pase", () => {
  const e = estadoDelAsistente(entrada({ credencial: CRED("produccion", OTRO_CUIT) }));
  assert.equal(e.paso, "pedido");
  assert.equal(e.certificado, "con-problema");
  assert.equal(e.puedePedirPase, false);
});

test("el pedido de pase: uno solo, y no depende del modo de la plataforma ni de la limpieza de GSG", () => {
  const ya = { pedidoDePase: { pedidoEn: "2026-11-05T10:00:00.000Z", por: "user:1" } };
  assert.equal(estadoDelAsistente(entrada({ credencial: CRED("produccion") }, ya)).puedePedirPase, false);
  const conPruebas = entrada({
    credencial: CRED("produccion"),
    modoArca: "homologacion",
    comprobantesDePrueba: { esperandoCae: 2, enviosAbiertos: 0, autorizados: 0, desde: null },
  });
  assert.equal(estadoDelAsistente(conPruebas).puedePedirPase, true);
});

test("pedido que no se pudo leer (base) o sin configuración: NO se ofrece generar otro", () => {
  for (const problema of ["ilegible", "sin-configuracion"] as const) {
    const e = estadoDelAsistente(entrada({}, { problemaDelPedido: problema }));
    assert.equal(e.problemaDelPedido, problema);
    assert.equal(e.puedeGenerarPedido, false, problema);
    // Con certificado cargado tampoco: no sabemos si hay una renovación en curso.
    const conCert = estadoDelAsistente(entrada({ credencial: CRED("produccion") }, { problemaDelPedido: problema }));
    assert.equal(conCert.puedeGenerarPedido, false, problema);
  }
});

test("pedido dañado (se leyó y no abre con la clave presente): se puede generar uno nuevo", () => {
  const e = estadoDelAsistente(entrada({}, { problemaDelPedido: "dañado" }));
  assert.equal(e.problemaDelPedido, "dañado");
  assert.equal(e.puedeGenerarPedido, true);
  // Sin datos del paso 1, igual no.
  assert.equal(estadoDelAsistente(entrada({ arcaCuit: null }, { problemaDelPedido: "dañado" })).puedeGenerarPedido, false);
});

test("pedido que se lee bien (o que no existe): igual que siempre, se puede generar", () => {
  const sinPedido = estadoDelAsistente(entrada({}));
  assert.equal(sinPedido.problemaDelPedido, null);
  assert.equal(sinPedido.puedeGenerarPedido, true);
  const pendiente = estadoDelAsistente(entrada({}, { pedidoPendiente: { creadoEn: "2026-11-05T10:00:00.000Z" } }));
  assert.equal(pendiente.paso, "certificado");
  assert.equal(pendiente.problemaDelPedido, null);
  assert.equal(pendiente.puedeGenerarPedido, true);
  // Sin datos del paso 1 no se genera (como hoy: la pantalla no muestra el botón).
  assert.equal(estadoDelAsistente(entrada({ arcaCuit: null })).puedeGenerarPedido, false);
});

describe("lectura del pedido: cada causa de falla tiene su estado", () => {
  const FILA = { sellado: "x", creadoEn: "2026-11-05T10:00:00.000Z" };
  const abrirOk = (f: typeof FILA) => ({ csrPem: "CSR", creadoEn: f.creadoEn });
  const sinClave = () => {
    throw new Error("FISCAL_MASTER_KEY no está seteada");
  };
  const lectura = (p: Partial<Parameters<typeof leerPedidoConEstado<typeof FILA, string>>[0]>) => {
    const fallas: string[] = [];
    const r = leerPedidoConEstado<typeof FILA, string>({
      leerFila: async () => FILA,
      clave: () => "K",
      abrir: abrirOk,
      alFallar: (causa) => fallas.push(causa),
      ...p,
    });
    return r.then((l) => ({ l, fallas }));
  };

  test("se lee bien → pendiente; sin fila → ninguno", async () => {
    assert.deepEqual((await lectura({})).l, { estado: "pendiente", csrPem: "CSR", creadoEn: FILA.creadoEn });
    assert.deepEqual((await lectura({ leerFila: async () => null })).l, { estado: "ninguno" });
  });

  test("(a) falla la base al leer → ilegible (transitorio: reintentar, no generar)", async () => {
    const { l, fallas } = await lectura({
      leerFila: async () => {
        throw new Error("conexión");
      },
    });
    assert.deepEqual(l, { estado: "ilegible" });
    assert.deepEqual(fallas, ["ilegible"]);
    assert.equal(estadoDelAsistente(entrada({}, { problemaDelPedido: problemaDelPedido(l) })).puedeGenerarPedido, false);
  });

  test("(b) falta la clave maestra → sin-configuracion, con o sin fila; no se ofrece generar", async () => {
    const conFila = await lectura({ clave: sinClave });
    assert.deepEqual(conFila.l, { estado: "sin-configuracion", hayPedido: true });
    assert.deepEqual(conFila.fallas, ["sin-configuracion"]);
    const sinFila = await lectura({ clave: sinClave, leerFila: async () => null });
    assert.deepEqual(sinFila.l, { estado: "sin-configuracion", hayPedido: false });
    for (const { l } of [conFila, sinFila]) {
      assert.equal(estadoDelAsistente(entrada({}, { problemaDelPedido: problemaDelPedido(l) })).puedeGenerarPedido, false);
    }
  });

  test("(c) la fila se leyó pero no abre (descifrado o JSON) con la clave presente → dañado; se puede generar", async () => {
    const descifrado = await lectura({
      abrir: () => {
        throw new Error("Unsupported state or unable to authenticate data");
      },
    });
    assert.deepEqual(descifrado.l, { estado: "dañado" });
    assert.deepEqual(descifrado.fallas, ["dañado"]);
    const json = await lectura({ abrir: () => JSON.parse("{roto") });
    assert.deepEqual(json.l, { estado: "dañado" });
    assert.equal(estadoDelAsistente(entrada({}, { problemaDelPedido: problemaDelPedido(json.l) })).puedeGenerarPedido, true);
  });

  test("lo que bloquea es lo mismo en la pantalla y en el servidor", async () => {
    for (const l of [
      { estado: "ninguno" },
      { estado: "pendiente", csrPem: "CSR", creadoEn: FILA.creadoEn },
      { estado: "ilegible" },
      { estado: "sin-configuracion", hayPedido: true },
      { estado: "sin-configuracion", hayPedido: false },
      { estado: "dañado" },
    ] as const) {
      const bloquea = motivoParaNoReemplazarPedido(l) !== null;
      const enPantalla = estadoDelAsistente(entrada({}, { problemaDelPedido: problemaDelPedido(l) })).puedeGenerarPedido;
      assert.equal(bloquea, !enPantalla, l.estado);
    }
  });
});

test("servidor: ilegible y sin configuración no se pisan; ninguno, legible o dañado, sí", () => {
  assert.match(motivoParaNoReemplazarPedido({ estado: "ilegible" }) ?? "", /no pudimos leer/i);
  assert.equal(
    motivoParaNoReemplazarPedido({ estado: "sin-configuracion", hayPedido: false }),
    "Falta la configuración para guardar certificados cifrados. Avisale a GSG.",
  );
  assert.equal(motivoParaNoReemplazarPedido({ estado: "ninguno" }), null);
  assert.equal(motivoParaNoReemplazarPedido({ estado: "dañado" }), null);
  assert.equal(motivoParaNoReemplazarPedido({ estado: "pendiente", csrPem: "CSR", creadoEn: "2026-11-05T10:00:00.000Z" }), null);
});

test("pedido en curso para el contador: hay fila (aunque no se pueda leer o abrir)", () => {
  assert.equal(hayPedidoEnCurso({ estado: "ninguno" }), false);
  assert.equal(hayPedidoEnCurso({ estado: "pendiente", csrPem: "CSR", creadoEn: "2026-11-05T10:00:00.000Z" }), true);
  assert.equal(hayPedidoEnCurso({ estado: "ilegible" }), true);
  assert.equal(hayPedidoEnCurso({ estado: "dañado" }), true);
  assert.equal(hayPedidoEnCurso({ estado: "sin-configuracion", hayPedido: true }), true);
  assert.equal(hayPedidoEnCurso({ estado: "sin-configuracion", hayPedido: false }), false);
});

test("confirmación tipeada: PRODUCCIÓN con o sin tilde, sin importar mayúsculas", () => {
  for (const ok of ["PRODUCCION", "producción", "  Producción "]) assert.equal(confirmaElPase(ok), true, ok);
  for (const no of ["", "si", "PRODUCCIONES", null, 3]) assert.equal(confirmaElPase(no), false, String(no));
});

test("la razón social del CSR va sin tildes ni caracteres raros y recortada a 64", () => {
  assert.equal(organizacionDelPedido("  Peñaloza & Hijos S.R.L. / “Carnes” "), "Penaloza & Hijos S.R.L. Carnes");
  assert.equal(organizacionDelPedido("x".repeat(80)).length, 64);
  assert.equal(organizacionDelPedido("“”"), "");
});

test("el pedido no se genera sin CUIT válido o sin razón social", () => {
  assert.deepEqual(generarPedidoDeCertificado({ razonSocial: "Magra", cuit: "20123456780" }).ok, false);
  const r = generarPedidoDeCertificado({ razonSocial: "  ", cuit: CUIT });
  assert.equal(r.ok, false);
  assert.match((r as { motivo: string }).motivo, /razón social/);
});

/** Lo que hace ARCA con el .csr: firma un certificado con la clave pública y el subject del pedido. */
function firmarComoArca(csrPem: string): { pem: string; der: Uint8Array } {
  const csr = forge.pki.certificationRequestFromPem(csrPem);
  assert.ok(csr.verify(), "el CSR tiene que venir firmado con su propia clave");
  const ca = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = csr.publicKey!;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date("2026-11-01T00:00:00Z");
  cert.validity.notAfter = new Date("2028-11-01T00:00:00Z");
  cert.setSubject(csr.subject.attributes);
  cert.setIssuer([{ shortName: "CN", value: "Computadores Test" }, { shortName: "O", value: "AFIP" }]);
  cert.sign(ca.privateKey, forge.md.sha256.create());
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  return { pem: forge.pki.certificateToPem(cert), der: Uint8Array.from(der, (c) => c.charCodeAt(0)) };
}

test("pedido de punta a punta: CSR con el subject de ARCA → certificado → cargarCredencialTenant", async () => {
  const r = generarPedidoDeCertificado({ razonSocial: "Magra Canning SRL", cuit: "20-12345678-6" });
  assert.ok(r.ok);
  assert.equal(r.subject, `/C=AR/O=Magra Canning SRL/CN=gsg-erp/serialNumber=CUIT ${CUIT}`);
  assert.match(r.keyPem, /BEGIN PRIVATE KEY/);
  const csr = forge.pki.certificationRequestFromPem(r.csrPem);
  assert.equal((csr.publicKey as forge.pki.rsa.PublicKey).n.bitLength(), 2048);
  assert.equal(csr.subject.getField({ name: "serialNumber" })?.value, `CUIT ${CUIT}`);

  const cert = firmarComoArca(r.csrPem);
  assert.equal(cuitDesdeCertPem(cert.pem), CUIT);
  // Pegado, subido en DER o en base64 suelto: siempre el mismo PEM.
  assert.equal(certificadoEnPem(`hola\n${cert.pem}\nchau`)?.trim(), cert.pem.trim());
  assert.equal(certificadoEnPem(cert.der)?.trim(), cert.pem.trim());
  assert.equal(certificadoEnPem(Buffer.from(cert.der).toString("base64"))?.trim(), cert.pem.trim());
  assert.equal(certificadoEnPem("cualquier cosa"), null);

  const guardados: RegistroCredencialFiscal[] = [];
  const deps = {
    leerCuitTenant: async () => CUIT,
    leerRegistro: async () => null,
    guardarRegistro: async (_t: string, reg: RegistroCredencialFiscal) => {
      guardados.push(reg);
      return { id: "c1", yaExistia: false };
    },
    auditar: async () => {},
    master: () => ({ key: Buffer.alloc(32, 3), id: "test:v1" }),
  };
  const cargado = await cargarCredencialTenant({ tenantId: "t1", certPem: cert.pem, keyPem: r.keyPem, actor: "user:1" }, deps);
  assert.equal(cargado.certCuit, CUIT);
  assert.equal(guardados.length, 1);

  // Un certificado de OTRO pedido (otra clave) se rechaza con un texto en criollo.
  const otro = generarPedidoDeCertificado({ razonSocial: "Magra", cuit: CUIT });
  assert.ok(otro.ok);
  await assert.rejects(
    cargarCredencialTenant({ tenantId: "t1", certPem: cert.pem, keyPem: otro.keyPem, actor: "user:1" }, deps),
    (e) => /último pedido/.test(errorDeCargaEnCriollo(e)),
  );
  // Y uno de otro CUIT, también.
  await assert.rejects(
    cargarCredencialTenant({ tenantId: "t1", certPem: cert.pem, keyPem: r.keyPem, actor: "user:1" }, { ...deps, leerCuitTenant: async () => OTRO_CUIT }),
    (e) => /otro CUIT/.test(errorDeCargaEnCriollo(e)),
  );
});

test("los errores no reconocidos no muestran el texto crudo", () => {
  assert.doesNotMatch(errorDeCargaEnCriollo(new Error("-----BEGIN PRIVATE KEY----- xyz")), /BEGIN/);
});
