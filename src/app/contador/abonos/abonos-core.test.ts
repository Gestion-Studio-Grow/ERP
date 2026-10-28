// Abonos (abonos-core.ts): validar la regla, reconstruir las vigentes, preparar el lote y armar
// el comprobante. CUITs ficticios con dígito verificador válido.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  armarComprobante,
  bloqueoDelCliente,
  decidirEmision,
  filaDesdeRegla,
  prepararLote,
  reglaDesdeFila,
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

test("validarReglaAbono: consumidor final sin identificar, desde el umbral vigente de ARCA, pide CUIT o DNI", () => {
  const cf = { ...base, receptorDocTipo: "CF", receptorDocNro: "", receptorCondicionIva: "" };
  const v = validarReglaAbono({ ...cf, importe: "10.000.000" });
  assert.equal(v.ok, false);
  if (!v.ok) {
    assert.equal(v.campo, "receptorDocTipo");
    assert.equal(v.error, "Desde $10.000.000, ARCA pide identificar al comprador: cargale CUIT o DNI.");
  }
  assert.equal(validarReglaAbono({ ...cf, importe: "9.999.999,99" }).ok, true);
  assert.equal(
    validarReglaAbono({ ...base, receptorDocTipo: "DNI", receptorDocNro: "30123456", receptorCondicionIva: "CONSUMIDOR_FINAL", importe: "10.000.000" }).ok,
    true,
  );
});

test("filaDesdeRegla / reglaDesdeFila: ida y vuelta con los códigos de ARCA; una fila rara no entra", () => {
  const r = regla({ importe: 150000.5 });
  const fila = { id: r.id, ...filaDesdeRegla(r) };
  assert.equal(fila.receptorDocTipo, 80);
  assert.equal(fila.concepto, 2);
  assert.deepEqual(reglaDesdeFila(fila), r);
  const cf = regla({ receptorDocTipo: "CF", receptorDocNro: null, receptorCondicionIva: "CONSUMIDOR_FINAL", concepto: "productos" });
  const filaCf = { id: cf.id, ...filaDesdeRegla(cf) };
  assert.equal(filaCf.receptorDocTipo, 99);
  assert.equal(filaCf.concepto, 1);
  assert.deepEqual(reglaDesdeFila(filaCf), cf);
  assert.equal(reglaDesdeFila({ ...fila, receptorDocTipo: 86 }), null);
  assert.equal(reglaDesdeFila({ ...fila, concepto: 3 }), null);
  assert.equal(reglaDesdeFila({ ...fila, importe: 0 }), null);
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

test("bloqueoDelCliente: pausa y faltas de datos frenan con el motivo; monotributo, exento e inscripto pasan", () => {
  assert.equal(bloqueoDelCliente(cliente()), null);
  assert.equal(bloqueoDelCliente(cliente({ condicionIva: "EXENTO" })), null);
  assert.match(bloqueoDelCliente(undefined)!, /no está en tu cartera/);
  assert.match(bloqueoDelCliente(cliente({ estado: "pausada" }))!, /pausa/);
  assert.match(bloqueoDelCliente(cliente({ sinLeer: true }))!, /No se pudo leer/);
  assert.match(bloqueoDelCliente(cliente({ cuit: null }))!, /CUIT/);
  assert.match(bloqueoDelCliente(cliente({ puntoVenta: null }))!, /punto de venta/);
  assert.equal(bloqueoDelCliente(cliente({ condicionIva: "RESPONSABLE_INSCRIPTO" })), null, "el inscripto ya emite (IVA por renglón)");
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
      { reglaId: "b", status: "AUTHORIZED" },
      { reglaId: "e", status: "REJECTED" },
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
    [{ reglaId: "r1", status: "PENDING" }],
    "2026-10",
  );
  assert.equal(lote[0].estado, "ya_emitida");
});

test("armarComprobante: servicio de un monotributista = Factura C con el período del mes y el vencimiento a N días", () => {
  const a = armarComprobante(regla({ importe: 150000.5, diasVencimiento: 10 }), { cuit: 27222222228, condicionIva: "MONOTRIBUTO", puntoVenta: 3 }, "2026-10", "20261028");
  assert.ok(a.ok);
  const c = a.comprobante;
  assert.equal(c.descripcion, "Honorarios · octubre 2026");
  assert.equal("ivaPorProducto" in c, false);
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
  const a = armarComprobante(
    regla({ concepto: "productos", receptorDocTipo: "CF", receptorDocNro: null, receptorCondicionIva: "CONSUMIDOR_FINAL" }),
    { cuit: 27222222228, condicionIva: "EXENTO", puntoVenta: 1 },
    "2027-02",
    "20270301",
  );
  assert.ok(a.ok);
  const c = a.comprobante;
  assert.equal(c.concepto, 1);
  assert.equal("servicioDesde" in c, false);
  assert.deepEqual(c.receptor, { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" });
  const s = armarComprobante(regla(), { cuit: 27222222228, condicionIva: "MONOTRIBUTO", puntoVenta: 1 }, "2027-02", "20270301");
  assert.ok(s.ok);
  assert.equal(s.comprobante.servicioHasta, "20270228");
});

test("armarComprobante: responsable inscripto = IVA 21 % declarado por renglón (neto + IVA = importe)", () => {
  const a = armarComprobante(regla({ importe: 121000 }), { cuit: 27222222228, condicionIva: "RESPONSABLE_INSCRIPTO", puntoVenta: 2 }, "2026-10", "20261028");
  assert.ok(a.ok);
  const c = a.comprobante;
  assert.equal(c.total, 121000);
  assert.equal(c.neto, 100000);
  assert.deepEqual(c.iva, [{ alicuotaId: 5, base: 100000, importe: 21000 }]);
  assert.equal(c.ivaPorProducto, true);
});

test("sumarDias: cruza meses y años sin corrimientos", () => {
  assert.equal(sumarDias("20261225", 10), "20270104");
  assert.equal(sumarDias("20260228", 1), "20260301");
  assert.equal(sumarDias("20261010", 0), "20261010");
});
