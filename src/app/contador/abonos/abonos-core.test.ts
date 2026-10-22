// Abonos (abonos-core.ts): validar la regla, reconstruir las vigentes, preparar el lote y armar
// el comprobante. CUITs ficticios con dígito verificador válido.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  armarComprobante,
  bloqueoDelCliente,
  claveDeEmision,
  decidirEmision,
  plegarReglas,
  prepararLote,
  resumirLote,
  sumarDias,
  textoVigencia,
  validarReglaAbono,
  vigenteEnMes,
  type ClienteDelLote,
  type ReglaAbono,
} from "./abonos-core";

const CUIT_RECEPTOR = "20111111112"; // ficticio, verificador válido

const base = {
  clienteTenantId: "cli-1",
  receptorNombre: "Inmobiliaria Ejemplo",
  receptorDocTipo: "CUIT",
  receptorDocNro: "20-11111111-2",
  receptorCondicionIva: "MONOTRIBUTO",
  descripcion: "Honorarios mensuales",
  importe: "150.000,50",
  concepto: "servicios",
  desde: "2026-10",
  hasta: "",
  diasVencimiento: "",
};

function regla(p: Partial<ReglaAbono> = {}): ReglaAbono {
  return {
    id: "r1",
    clienteTenantId: "cli-1",
    receptorNombre: "Inmobiliaria Ejemplo",
    receptorDocTipo: "CUIT",
    receptorDocNro: CUIT_RECEPTOR,
    receptorCondicionIva: "MONOTRIBUTO",
    descripcion: "Honorarios",
    importe: 150000,
    concepto: "servicios",
    desde: "2026-10",
    hasta: null,
    diasVencimiento: 10,
    ...p,
  };
}

function cliente(p: Partial<ClienteDelLote> = {}): ClienteDelLote {
  return { clienteTenantId: "cli-1", alias: "Kiosco de Marta", estado: "activa", condicionIva: "MONOTRIBUTO", cuit: "27222222228", puntoVenta: 3, ...p };
}

test("validarReglaAbono: una regla completa sale normalizada (CUIT sin guiones, importe en número, 10 días por defecto)", () => {
  const v = validarReglaAbono(base);
  assert.ok(v.ok);
  assert.equal(v.regla.receptorDocNro, CUIT_RECEPTOR);
  assert.equal(v.regla.importe, 150000.5);
  assert.equal(v.regla.diasVencimiento, 10);
  assert.equal(v.regla.hasta, null);
});

test("validarReglaAbono: cada error dice qué corregir y en qué campo", () => {
  const casos: [Record<string, unknown>, string][] = [
    [{ ...base, clienteTenantId: "" }, "clienteTenantId"],
    [{ ...base, receptorDocNro: "20111111113" }, "receptorDocNro"],
    [{ ...base, receptorDocTipo: "DNI", receptorDocNro: "12.34", receptorCondicionIva: "CONSUMIDOR_FINAL" }, "receptorDocNro"],
    [{ ...base, receptorDocTipo: "DNI", receptorDocNro: "30123456", receptorCondicionIva: "MONOTRIBUTO" }, "receptorCondicionIva"],
    [{ ...base, importe: "0" }, "importe"],
    [{ ...base, importe: "abc" }, "importe"],
    [{ ...base, importe: "-5" }, "importe"],
    [{ ...base, concepto: "otro" }, "concepto"],
    [{ ...base, desde: "2026-13" }, "desde"],
    [{ ...base, hasta: "2026-09" }, "hasta"],
    [{ ...base, diasVencimiento: "61" }, "diasVencimiento"],
    [{ ...base, descripcion: "x" }, "descripcion"],
  ];
  for (const [input, campo] of casos) {
    const v = validarReglaAbono(input);
    assert.equal(v.ok, false, JSON.stringify(input));
    if (!v.ok) assert.equal(v.campo, campo, JSON.stringify(input));
  }
});

test("validarReglaAbono: consumidor final sin identificar no lleva documento", () => {
  const v = validarReglaAbono({ ...base, receptorDocTipo: "CF", receptorDocNro: "", receptorCondicionIva: "" });
  assert.ok(v.ok);
  assert.equal(v.regla.receptorDocNro, null);
  assert.equal(v.regla.receptorCondicionIva, "CONSUMIDOR_FINAL");
});

test("plegarReglas: gana la última versión; la baja la saca; volver a guardarla la reactiva; lo roto se ignora", () => {
  const v1 = { ...regla(), importe: 100000 };
  const v2 = { ...regla(), importe: 120000 };
  const r2 = regla({ id: "r2", descripcion: "Alquiler" });
  const vivas = plegarReglas([
    { tipo: "guardada", reglaId: "r1", en: "2026-10-01T10:00:00Z", datos: v1 },
    { tipo: "guardada", reglaId: "r1", en: "2026-10-02T10:00:00Z", datos: v2 },
    { tipo: "guardada", reglaId: "r2", en: "2026-10-01T10:00:00Z", datos: r2 },
    { tipo: "baja", reglaId: "r2", en: "2026-10-03T10:00:00Z" },
    { tipo: "guardada", reglaId: "r3", en: "2026-10-01T10:00:00Z", datos: { basura: true } },
  ]);
  assert.deepEqual(vivas.map((r) => [r.id, r.importe]), [["r1", 120000]]);

  const reactivada = plegarReglas([
    { tipo: "guardada", reglaId: "r2", en: "2026-10-01T10:00:00Z", datos: r2 },
    { tipo: "baja", reglaId: "r2", en: "2026-10-03T10:00:00Z" },
    { tipo: "guardada", reglaId: "r2", en: "2026-10-04T10:00:00Z", datos: r2 },
  ]);
  assert.equal(reactivada.length, 1);
});

test("vigencia: desde/hasta inclusive y el texto para la pantalla", () => {
  const r = regla({ desde: "2026-10", hasta: "2026-12" });
  assert.equal(vigenteEnMes(r, "2026-09"), false);
  assert.equal(vigenteEnMes(r, "2026-10"), true);
  assert.equal(vigenteEnMes(r, "2026-12"), true);
  assert.equal(vigenteEnMes(r, "2027-01"), false);
  assert.equal(textoVigencia(r), "De octubre 2026 a diciembre 2026");
  assert.equal(textoVigencia(regla()), "Todos los meses desde octubre 2026");
});

test("decidirEmision: pendiente o autorizada no se repite; sólo rechazadas se vuelve a emitir; ante la duda, no se duplica", () => {
  assert.equal(decidirEmision([]), "emitir");
  assert.equal(decidirEmision([{ status: "PENDING" }]), "ya_emitida");
  assert.equal(decidirEmision([{ status: "AUTHORIZED" }]), "ya_emitida");
  assert.equal(decidirEmision([{ status: "REJECTED" }]), "reemitir");
  assert.equal(decidirEmision([{ status: "REJECTED" }, { status: "AUTHORIZED" }]), "ya_emitida");
  assert.equal(decidirEmision([{ status: "DESCONOCIDO" }]), "ya_emitida");
});

test("bloqueoDelCliente: pausa, faltas de datos e inscripto frenan con el motivo; monotributo y exento pasan", () => {
  assert.equal(bloqueoDelCliente(cliente()), null);
  assert.equal(bloqueoDelCliente(cliente({ condicionIva: "EXENTO" })), null);
  assert.match(bloqueoDelCliente(undefined)!, /no está en tu cartera/);
  assert.match(bloqueoDelCliente(cliente({ estado: "pausada" }))!, /pausa/);
  assert.match(bloqueoDelCliente(cliente({ sinLeer: true }))!, /No se pudo leer/);
  assert.match(bloqueoDelCliente(cliente({ cuit: null }))!, /CUIT/);
  assert.match(bloqueoDelCliente(cliente({ puntoVenta: null }))!, /punto de venta/);
  assert.match(bloqueoDelCliente(cliente({ condicionIva: "RESPONSABLE_INSCRIPTO" }))!, /inscripto/);
});

test("prepararLote: sólo lo vigente del mes, con su estado; primero lo que se emite, al final lo ya emitido", () => {
  const reglas = [
    regla({ id: "a", descripcion: "Honorarios" }),
    regla({ id: "b", descripcion: "Alquiler" }),
    regla({ id: "c", descripcion: "Viejo", desde: "2026-01", hasta: "2026-03" }),
    regla({ id: "d", clienteTenantId: "cli-2", descripcion: "Cuota" }),
    regla({ id: "e", descripcion: "Mantenimiento" }),
  ];
  const clientes = new Map([
    ["cli-1", cliente()],
    ["cli-2", cliente({ clienteTenantId: "cli-2", alias: "Almacén", estado: "pausada" })],
  ]);
  const lote = prepararLote(
    reglas,
    clientes,
    [
      { clave: claveDeEmision("b", "2026-10"), status: "AUTHORIZED" },
      { clave: claveDeEmision("e", "2026-10"), status: "REJECTED" },
      { clave: claveDeEmision("a", "2026-09"), status: "AUTHORIZED" }, // otro mes: no cuenta
    ],
    "2026-10",
  );
  assert.deepEqual(
    lote.map((r) => [r.regla.id, r.estado]),
    [
      ["a", "para_emitir"],
      ["e", "reemitir"],
      ["d", "bloqueada"],
      ["b", "ya_emitida"],
    ],
  );
  const res = resumirLote(lote);
  assert.deepEqual(res, { paraEmitir: 2, importeParaEmitir: 300000, bloqueadas: 1, yaEmitidas: 1 });
});

test("prepararLote: lo ya emitido se muestra aunque hoy el cliente esté bloqueado (no se esconde una factura hecha)", () => {
  const lote = prepararLote(
    [regla()],
    new Map([["cli-1", cliente({ estado: "pausada" })]]),
    [{ clave: claveDeEmision("r1", "2026-10"), status: "PENDING" }],
    "2026-10",
  );
  assert.equal(lote[0].estado, "ya_emitida");
});

test("armarComprobante: servicio de un monotributista = Factura C con el período del mes y el vencimiento a N días", () => {
  const c = armarComprobante(regla({ importe: 150000.5, diasVencimiento: 10 }), { cuit: 27222222228, condicionIva: "MONOTRIBUTO", puntoVenta: 3 }, "2026-10", "20261028");
  assert.equal(c.concepto, 2);
  assert.equal(c.fecha, "20261028");
  assert.equal(c.servicioDesde, "20261001");
  assert.equal(c.servicioHasta, "20261031");
  assert.equal(c.vencimientoPago, "20261107");
  assert.deepEqual(c.receptor, { docTipo: 80, docNro: Number(CUIT_RECEPTOR), condicionIva: "MONOTRIBUTO" });
  assert.equal(c.total, 150000.5);
  assert.equal(c.neto, 150000.5);
  assert.deepEqual(c.emisor, { cuit: 27222222228, condicionIva: "MONOTRIBUTO", puntoVenta: 3 });
});

test("armarComprobante: productos a consumidor final sin identificar, sin período de servicio; febrero cierra el 28", () => {
  const c = armarComprobante(
    regla({ concepto: "productos", receptorDocTipo: "CF", receptorDocNro: null, receptorCondicionIva: "CONSUMIDOR_FINAL" }),
    { cuit: 27222222228, condicionIva: "EXENTO", puntoVenta: 1 },
    "2027-02",
    "20270301",
  );
  assert.equal(c.concepto, 1);
  assert.equal("servicioDesde" in c, false);
  assert.deepEqual(c.receptor, { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" });
  const s = armarComprobante(regla(), { cuit: 27222222228, condicionIva: "MONOTRIBUTO", puntoVenta: 1 }, "2027-02", "20270301");
  assert.equal(s.servicioHasta, "20270228");
});

test("sumarDias: cruza meses y años sin corrimientos", () => {
  assert.equal(sumarDias("20261225", 10), "20270104");
  assert.equal(sumarDias("20260228", 1), "20260301");
  assert.equal(sumarDias("20261010", 0), "20261010");
});
