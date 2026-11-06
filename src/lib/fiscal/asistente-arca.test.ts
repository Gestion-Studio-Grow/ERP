// Asistente ARCA: el paso derivado de lo cargado, el pedido de certificado (CSR) de punta a punta con
// cargarCredencialTenant (deps en memoria), la lectura del certificado pegado/subido y los textos.
import { test } from "node:test";
import assert from "node:assert/strict";
import forge from "node-forge";
import {
  certificadoEnPem,
  confirmaElPase,
  errorDeCargaEnCriollo,
  estadoDelAsistente,
  generarPedidoDeCertificado,
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
