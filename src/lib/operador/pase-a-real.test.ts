// Pase a facturación real (R2-F5): la decisión pura, ejecutada con fichas armadas a mano.
// Criterio del backlog: de 6 combinaciones de precondiciones, 5 se niegan con motivo en castellano;
// CH exige el slug y el dueño de GSG; la vuelta a pruebas nunca se bloquea. Con la corrección del
// refutador fiscal hay una sexta condición (comprobantes de la etapa de pruebas): 7 combinaciones,
// 6 negadas; y la delegación ya no reemplaza al certificado de producción.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cambiosParaAuditoria,
  decidirPase,
  entornoDelEmisor,
  FICHA_CAMBIO_MIENTRAS_MIRABAS,
  huellaDeLaFicha,
  MOTIVO_CANDADO_CH,
  precondicionesDelPase,
  type FichaFiscalDelPase,
  type PedidoDePase,
} from "./pase-a-real";

// 20-12345678-6 y 20-30405060-9 tienen el dígito verificador bien (pesos 5432765432, módulo 11).
const CUIT = "20123456786";
const OTRO_CUIT = "20304050609";

const LISTA: FichaFiscalDelPase = {
  slug: "magra-canning",
  arcaCuit: CUIT,
  arcaPuntoVenta: 3,
  arcaHomologacion: true,
  arcaCondicionIva: "MONOTRIBUTO",
  credencial: {
    certCuit: CUIT,
    entorno: "produccion",
    emisor: "Computadores · AFIP",
    error: null,
    actualizada: "2026-09-20T12:00:00.000Z",
  },
  delegacion: null,
  modoArca: "real",
  comprobantesDePrueba: { esperandoCae: 0, enviosAbiertos: 0, autorizados: 0, desde: null },
};
const SIN_COMPROBANTES = LISTA.comprobantesDePrueba;
const FACU = { nombre: "facu", esDuenio: false };
const DUENIO = { nombre: "gsg", esDuenio: true };

function pedir(f: FichaFiscalDelPase, extra: Partial<PedidoDePase> = {}): PedidoDePase {
  return { accion: "pasar-a-real", huellaVista: huellaDeLaFicha(f), slugTipeado: f.slug, ...extra };
}

const COMBINACIONES: [string, Partial<FichaFiscalDelPase>, RegExp][] = [
  ["sin CUIT", { arcaCuit: null }, /Falta el CUIT del negocio\./],
  ["sin punto de venta", { arcaPuntoVenta: null }, /Falta el punto de venta que ARCA habilitó para este CUIT\./],
  ["sin certificado de producción ni delegación", { credencial: null }, /Falta el certificado de producción de ARCA/],
  ["sin condición frente al IVA", { arcaCondicionIva: null }, /Falta la condición del negocio frente al IVA\./],
  ["con la plataforma en pruebas", { modoArca: "homologacion" }, /La plataforma está en modo pruebas \(homologación\)/],
  [
    "con un comprobante de la etapa de pruebas esperando CAE",
    { comprobantesDePrueba: { ...SIN_COMPROBANTES, esperandoCae: 1, enviosAbiertos: 1 } },
    /Hay 1 comprobante de la etapa de pruebas esperando CAE \(1 envío a ARCA sin cerrar\); si pasás a real saldrían con validez fiscal/,
  ],
];

test("de las 7 combinaciones de precondiciones sólo la completa pasa; las otras 6 se niegan con su motivo en castellano", () => {
  assert.deepEqual(decidirPase(LISTA, pedir(LISTA), FACU), { tipo: "aplicar", accion: "pasar-a-real", homologacion: false });
  assert.ok(precondicionesDelPase(LISTA).every((p) => p.ok));
  let negadas = 0;
  for (const [nombre, cambio, motivo] of COMBINACIONES) {
    const f = { ...LISTA, ...cambio };
    const d = decidirPase(f, pedir(f), FACU);
    assert.equal(d.tipo, "rechazado", nombre);
    if (d.tipo !== "rechazado") continue;
    assert.match(d.motivo, /^No se puede pasar a facturación real\. /, nombre);
    assert.match(d.motivo, motivo, nombre);
    assert.match(d.motivo, /No se hizo nada\.$/, nombre);
    negadas++;
  }
  assert.equal(negadas, 6);
});

test("el certificado tiene que ser de producción y del mismo CUIT; una delegación, aunque figure verificada, no lo reemplaza", () => {
  const cred = LISTA.credencial!;
  const casos: [string, Partial<FichaFiscalDelPase>, RegExp][] = [
    ["certificado de pruebas", { credencial: { ...cred, entorno: "homologacion", emisor: "Computadores Test · AFIP" } }, /es de pruebas \(lo firmó Computadores Test · AFIP\): cargá el de producción/],
    ["certificado de otro CUIT", { credencial: { ...cred, certCuit: OTRO_CUIT } }, /tiene que ser del mismo CUIT/],
    ["certificado que no se pudo abrir", { credencial: { ...cred, entorno: "desconocido", emisor: null, error: "falta la clave maestra." } }, /No se pudo abrir el certificado para ver quién lo firmó: falta la clave maestra\./],
    ["certificado de un emisor desconocido", { credencial: { ...cred, entorno: "desconocido", emisor: "lab · GSG" } }, /No se pudo confirmar que el certificado sea de producción de ARCA \(lo firmó lab · GSG\)/],
    // La emisión firma con el certificado del negocio (credencialParaTenant) y no usa la delegación.
    ["delegación verificada del CUIT, sin certificado", { credencial: null, delegacion: { estado: "verificada", cuitRepresentado: CUIT, verificadaEn: "2026-09-21T10:00:00.000Z" } }, /Falta el certificado de producción de ARCA del CUIT del negocio\. Hay una delegación cargada \(«verificada»\), pero hoy no sirve para facturar/],
    ["certificado de PRUEBAS con delegación verificada del mismo CUIT", { credencial: { ...cred, entorno: "homologacion", emisor: "Computadores Test · AFIP" }, delegacion: { estado: "verificada", cuitRepresentado: CUIT, verificadaEn: "2026-09-21T10:00:00.000Z" } }, /El certificado cargado es de pruebas .*hoy no sirve para facturar: la emisión firma con el certificado del negocio\./],
    ["delegación declarada sin verificar", { credencial: null, delegacion: { estado: "declarada", cuitRepresentado: CUIT, verificadaEn: null } }, /Hay una delegación cargada \(«declarada»\), pero hoy no sirve para facturar/],
    ["delegación verificada de otro CUIT", { credencial: null, delegacion: { estado: "verificada", cuitRepresentado: OTRO_CUIT, verificadaEn: "2026-09-21T10:00:00.000Z" } }, /Falta el certificado de producción de ARCA/],
    ["CUIT con el dígito verificador mal", { arcaCuit: "20123456780" }, /El CUIT cargado no es válido/],
    ["consumidor final", { arcaCondicionIva: "CONSUMIDOR_FINAL" }, /consumidor final, que no emite facturas/],
    ["condición inventada", { arcaCondicionIva: "GRANDE" }, /«GRANDE» no es una condición frente al IVA conocida/],
    ["punto de venta 0", { arcaPuntoVenta: 0 }, /entre 1 y 99999/],
    ["punto de venta fuera de rango", { arcaPuntoVenta: 100_000 }, /entre 1 y 99999/],
    ["plataforma apagada", { modoArca: "stub" }, /modo apagado \(simulado\)/],
  ];
  for (const [nombre, cambio, motivo] of casos) {
    const f = { ...LISTA, ...cambio };
    const d = decidirPase(f, pedir(f), FACU);
    assert.equal(d.tipo, "rechazado", nombre);
    if (d.tipo === "rechazado") assert.match(d.motivo, motivo, nombre);
  }
});

test("CH: sólo el dueño de GSG, y escribiendo el slug", () => {
  const ch = { ...LISTA, slug: "beauty-spa" };
  assert.deepEqual(decidirPase(ch, pedir(ch), FACU), { tipo: "rechazado", motivo: MOTIVO_CANDADO_CH });
  const sinSlug = decidirPase(ch, pedir(ch, { slugTipeado: "" }), DUENIO);
  assert.equal(sinSlug.tipo, "rechazado");
  if (sinSlug.tipo === "rechazado") assert.match(sinSlug.motivo, /escribí exactamente el nombre corto del negocio \(«beauty-spa»\)/);
  assert.equal(decidirPase(ch, pedir(ch, { slugTipeado: "beauty" }), DUENIO).tipo, "rechazado");
  assert.deepEqual(decidirPase(ch, pedir(ch), DUENIO), { tipo: "aplicar", accion: "pasar-a-real", homologacion: false });
});

test("cualquier negocio pide escribir su slug para pasar a real (sin distinguir mayúsculas ni espacios)", () => {
  assert.equal(decidirPase(LISTA, pedir(LISTA, { slugTipeado: "" }), FACU).tipo, "rechazado");
  assert.equal(decidirPase(LISTA, pedir(LISTA, { slugTipeado: "magra" }), DUENIO).tipo, "rechazado");
  assert.equal(decidirPase(LISTA, pedir(LISTA, { slugTipeado: "  MAGRA-Canning " }), FACU).tipo, "aplicar");
  const sinSlug = { ...LISTA, slug: "" };
  assert.equal(decidirPase(sinSlug, pedir(sinSlug, { slugTipeado: "" }), FACU).tipo, "rechazado");
});

test("si la ficha fiscal cambió entre que el operador miró y confirmó, no se hace nada", () => {
  const vista = huellaDeLaFicha(LISTA);
  const cambios: Partial<FichaFiscalDelPase>[] = [
    { arcaCuit: OTRO_CUIT, credencial: { ...LISTA.credencial!, certCuit: OTRO_CUIT } },
    { arcaPuntoVenta: 4 },
    { arcaCondicionIva: "RESPONSABLE_INSCRIPTO" },
    { credencial: { ...LISTA.credencial!, actualizada: "2026-09-25T09:00:00.000Z" } },
    { delegacion: { estado: "verificada", cuitRepresentado: CUIT, verificadaEn: "2026-09-21T10:00:00.000Z" } },
  ];
  for (const cambio of cambios) {
    const ahora = { ...LISTA, ...cambio };
    assert.notEqual(huellaDeLaFicha(ahora), vista, JSON.stringify(cambio));
    assert.deepEqual(decidirPase(ahora, pedir(ahora, { huellaVista: vista }), FACU), {
      tipo: "rechazado",
      motivo: FICHA_CAMBIO_MIENTRAS_MIRABAS,
    });
  }
  // El modo de la plataforma no es de la ficha: si cambia, lo frena la precondición, no la huella.
  assert.equal(huellaDeLaFicha({ ...LISTA, modoArca: "stub" }), vista);
});

test("la vuelta a pruebas nunca se bloquea: ni por datos, ni por la huella, ni por el slug", () => {
  const variantes: Partial<FichaFiscalDelPase>[] = [{}, ...COMBINACIONES.map(([, c]) => c), { modoArca: "stub" }, { arcaCuit: null, credencial: null, arcaCondicionIva: null, arcaPuntoVenta: null }];
  for (const slug of ["magra-canning", "beauty-spa"]) {
    for (const cambio of variantes) {
      const enReal = { ...LISTA, ...cambio, slug, arcaHomologacion: false };
      const d = decidirPase(enReal, { accion: "volver-a-pruebas", huellaVista: "otra", slugTipeado: "" }, FACU);
      assert.deepEqual(d, { tipo: "aplicar", accion: "volver-a-pruebas", homologacion: true }, `${slug} ${JSON.stringify(cambio)}`);
    }
  }
  const yaEnPruebas = decidirPase(LISTA, { accion: "volver-a-pruebas", huellaVista: "", slugTipeado: "" }, FACU);
  assert.equal(yaEnPruebas.tipo, "sin-cambios");
});

test("pasar a real un negocio que ya factura en real no cambia nada; un pedido raro se niega", () => {
  const enReal = { ...LISTA, arcaHomologacion: false };
  assert.equal(decidirPase(enReal, pedir(enReal), FACU).tipo, "sin-cambios");
  const raro = decidirPase(LISTA, pedir(LISTA, { accion: "borrar" }), DUENIO);
  assert.deepEqual(raro, { tipo: "rechazado", motivo: "No se entendió qué había que hacer. No se hizo nada." });
});

test("el entorno del certificado sale de quién lo firmó; lo que no se reconoce no es de producción", () => {
  assert.equal(entornoDelEmisor({ cn: "Computadores", o: "AFIP" }), "produccion");
  assert.equal(entornoDelEmisor({ cn: " computadores ", o: "ARCA" }), "produccion");
  assert.equal(entornoDelEmisor({ cn: "Computadores Test", o: "AFIP" }), "homologacion");
  assert.equal(entornoDelEmisor({ cn: "AC Homologacion", o: "AFIP" }), "homologacion");
  assert.equal(entornoDelEmisor({ cn: "Computadores", o: "GSG lab" }), "desconocido");
  assert.equal(entornoDelEmisor({ cn: "Computadores Producción", o: "AFIP" }), "desconocido");
  assert.equal(entornoDelEmisor({ cn: null, o: null }), "desconocido");
});

test("con comprobantes de la etapa de pruebas esperando CAE, con el envío abierto o autorizados en pruebas, no pasa", () => {
  const casos: [string, Partial<typeof SIN_COMPROBANTES>, RegExp[]][] = [
    ["1 esperando CAE", { esperandoCae: 1 }, [/^No se puede pasar a facturación real\. Hay 1 comprobante de la etapa de pruebas esperando CAE; si pasás a real saldrían con validez fiscal, con los datos cargados en pruebas\./, /Sacalos al limpiar los datos de prueba \(sólo movimientos, nunca productos, clientes ni servicios: guía de salida en vivo, punto 1\.5\)/]],
    ["3 esperando CAE y 2 envíos", { esperandoCae: 3, enviosAbiertos: 2 }, [/Hay 3 comprobantes de la etapa de pruebas esperando CAE \(2 envíos a ARCA sin cerrar\)/]],
    ["sólo un envío abierto", { enviosAbiertos: 1 }, [/Hay 1 envío a ARCA de la etapa de pruebas sin cerrar; si pasás a real se despacharían en producción\./]],
    ["1 autorizado en pruebas (nunca pasó a real)", { autorizados: 1 }, [/Hay 1 comprobante autorizado en pruebas, con CAE de homologación: si pasa a real se mezclan con los reales/, /Un comprobante con CAE no se borra ni se edita/, /Avisale al dueño de GSG\./]],
    // 01:30 UTC del 22 son las 22:30 del 21 en Argentina.
    ["2 autorizados desde la última vuelta", { autorizados: 2, desde: "2026-09-22T01:30:00.000Z" }, [/Hay 2 comprobantes autorizados en pruebas desde que volvió a pruebas el 21\/09\/2026/]],
  ];
  for (const [nombre, cambio, motivos] of casos) {
    const f = { ...LISTA, comprobantesDePrueba: { ...SIN_COMPROBANTES, ...cambio } };
    const d = decidirPase(f, pedir(f), DUENIO);
    assert.equal(d.tipo, "rechazado", nombre);
    if (d.tipo !== "rechazado") continue;
    for (const m of motivos) assert.match(d.motivo, m, nombre);
    assert.match(d.motivo, /No se hizo nada\.$/, nombre);
    const sexta = precondicionesDelPase(f).find((p) => p.id === "comprobantesDePrueba");
    assert.equal(sexta?.ok, false, nombre);
  }
  const ok = precondicionesDelPase(LISTA).find((p) => p.id === "comprobantesDePrueba");
  assert.deepEqual(ok && { ok: ok.ok, detalle: ok.detalle }, { ok: true, detalle: "No quedan comprobantes de la etapa de pruebas." });
});

test("el conteo de comprobantes no entra en la huella: lo frena la condición (releída bajo bloqueo), con su motivo", () => {
  const vista = huellaDeLaFicha(LISTA);
  const conUno = { ...LISTA, comprobantesDePrueba: { ...SIN_COMPROBANTES, esperandoCae: 1 } };
  assert.equal(huellaDeLaFicha(conUno), vista);
  const d = decidirPase(conUno, pedir(LISTA), FACU);
  assert.equal(d.tipo, "rechazado");
  if (d.tipo === "rechazado") assert.match(d.motivo, /esperando CAE/);
});

test("la auditoría del pase dice antes, después, respaldo, modo y el conteo de comprobantes de prueba, sin material del certificado", () => {
  const d = decidirPase(LISTA, pedir(LISTA), FACU);
  assert.equal(d.tipo, "aplicar");
  if (d.tipo !== "aplicar") return;
  const c = cambiosParaAuditoria(LISTA, d);
  assert.deepEqual(c.arcaHomologacion, { antes: true, despues: false });
  assert.deepEqual(c.respaldo, { tipo: "certificado", certCuit: CUIT, entorno: "produccion", emisor: "Computadores · AFIP" });
  assert.deepEqual(c.comprobantesDePrueba, { esperandoCae: 0, enviosAbiertos: 0, autorizados: 0, desde: null });
  assert.equal(c.modoArca, "real");
  assert.equal(c.huella, huellaDeLaFicha(LISTA));
  assert.doesNotMatch(JSON.stringify(c), /PRIVATE|BEGIN|sealed|wrappedDek/);
  // La vuelta también deja el conteo (informativo: la vuelta nunca se frena).
  const enReal = { ...LISTA, arcaHomologacion: false, comprobantesDePrueba: { ...SIN_COMPROBANTES, esperandoCae: 2 } };
  const v = decidirPase(enReal, { accion: "volver-a-pruebas", huellaVista: "", slugTipeado: "" }, FACU);
  assert.equal(v.tipo, "aplicar");
  if (v.tipo === "aplicar") {
    const cv = cambiosParaAuditoria(enReal, v);
    assert.deepEqual(cv.arcaHomologacion, { antes: false, despues: true });
    assert.equal((cv.comprobantesDePrueba as { esperandoCae: number }).esperandoCae, 2);
  }
});
