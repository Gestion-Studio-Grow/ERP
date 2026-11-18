// MIA-50 · T05: lo puro de comprobantes, imputación, orden de pago y el costo real. Esperados a mano (R7), en centavos
// salvo `resultadoReal` (pesos).
import { csvIvaCredito } from "./iva-credito-csv";
import { mesDelParametro } from "./comprobantes-core";
import { test } from "node:test";
import assert from "node:assert/strict";
import { costoDeLinea, errorDeAdjunto, errorDeCarga, esVinculada, normalizarNumero, normalizarReferencia, tratamientoDelTipo } from "./comprobantes-core";
import { errorDeImputacion, faltaImputar, imputadoPorProyecto, repartirIva, type LineaEntrada } from "./imputacion-core";
import { errorDeAprobacion, errorDeOrden, numeroDeOrden, saldoDe, type ComprobanteParaOrden } from "./orden-pago-core";
import { resultadoReal, type Totales } from "./core";

const IVA_POR_DEFECTO = { A: "CREDITO", B: "COSTO", C: "COSTO", SIN_FACTURA: "COSTO" };

test("normalizarNumero: «1-234», «00001-00000234» y «0000100000234» son el mismo; un ticket queda en mayúsculas", () => {
  assert.equal(normalizarNumero("1-234"), "00001-00000234");
  assert.equal(normalizarNumero("00001-00000234"), "00001-00000234");
  assert.equal(normalizarNumero("0000100000234"), "00001-00000234");
  assert.equal(normalizarNumero("234"), "00000-00000234");
  assert.equal(normalizarNumero(" tk 12a "), "TK12A");
  assert.equal(normalizarNumero(""), null);
  assert.equal(normalizarNumero("<script>"), null);
});

test("errorDeCarga: total = neto + IVA al centavo; tipo de la lista; número y fecha", () => {
  const ok = { tipo: "A", numero: "00001-00000001", fecha: new Date(), netoCentavos: 100000, ivaCentavos: 21000, totalCentavos: 121000 };
  const tipos = ["A", "B", "C", "SIN_FACTURA"];
  assert.equal(errorDeCarga(ok, tipos), null);
  assert.match(String(errorDeCarga({ ...ok, totalCentavos: 120999 }, tipos)), /neto más el IVA/);
  assert.match(String(errorDeCarga({ ...ok, tipo: "M" }, tipos)), /tipo/);
  assert.match(String(errorDeCarga({ ...ok, numero: "" }, tipos)), /número/);
  assert.match(String(errorDeCarga({ ...ok, fecha: null }, tipos)), /fecha/);
  assert.match(String(errorDeCarga({ ...ok, netoCentavos: 0, ivaCentavos: 0, totalCentavos: 0 }, tipos)), /mayor que cero/);
});

test("tratamientoDelTipo: A → crédito, B/C/sin factura → costo, un tipo que el parámetro no nombra → costo; la marca viaja", () => {
  assert.deepEqual(tratamientoDelTipo("A", IVA_POR_DEFECTO, true), { tratamiento: "CREDITO", provisional: true });
  assert.deepEqual(tratamientoDelTipo("B", IVA_POR_DEFECTO, false), { tratamiento: "COSTO", provisional: false });
  assert.deepEqual(tratamientoDelTipo("X", IVA_POR_DEFECTO, true), { tratamiento: "COSTO", provisional: true });
  assert.equal(costoDeLinea(60000000, 12600000, "CREDITO"), 60000000, "C1 de la demo: al proyecto va el neto 600.000");
  assert.equal(costoDeLinea(100000, 21000, "COSTO"), 121000);
});

test("esVinculada y referencia: por nombre o CUIT, sin importar puntos, guiones ni mayúsculas", () => {
  assert.equal(esVinculada({ name: "Hermana S.A.", taxId: null }, ["hermana sa"]), true);
  assert.equal(esVinculada({ name: "Otra", taxId: "30-71234567-8" }, ["30712345678"]), true);
  assert.equal(esVinculada({ name: "Otra", taxId: null }, []), false);
  assert.equal(normalizarReferencia("  ref  entre 77 "), "REF ENTRE 77");
  assert.equal(normalizarReferencia(" "), null);
});

test("errorDeAdjunto: PDF o foto, hasta 2,5 MB, no vacío", () => {
  assert.equal(errorDeAdjunto(null), null);
  assert.equal(errorDeAdjunto({ tipo: "application/pdf", tamano: 10 }), null);
  assert.match(String(errorDeAdjunto({ tipo: "application/zip", tamano: 10 })), /PDF/);
  assert.match(String(errorDeAdjunto({ tipo: "image/png", tamano: 2_500_001 })), /2,5 MB/);
  assert.match(String(errorDeAdjunto({ tipo: "image/png", tamano: 0 })), /vacío/);
});

const listas = { sectores: ["Producción"], categorias: ["Catering"], categoriasAdministracion: ["Alquiler"] };
const l = (x: Partial<LineaEntrada>): LineaEntrada => ({ destino: "PROYECTO", proyectoId: "p1", sector: null, categoria: "Catering", detalle: "", netoCentavos: 0, ivaCentavos: 0, ivaTratamiento: "CREDITO", ivaProvisional: false, ...x });

test("repartirIva y faltaImputar: el IVA se reparte al centavo y la suma da exacta", () => {
  assert.deepEqual(repartirIva(21000, [60000, 30000, 10000]), [12600, 6300, 2100]);
  const tres = repartirIva(100, [1, 1, 1]);
  assert.equal(tres.reduce((s, n) => s + n, 0), 100, "33,33… × 3: el centavo que sobra va a una línea");
  assert.deepEqual(repartirIva(50, [0, 0]), [50, 0]);
  assert.equal(faltaImputar(121000, [{ netoCentavos: 60000, ivaCentavos: 12600 }]), 48400);
});

test("errorDeImputacion: suma al centavo o nada; categoría y sector de la lista; administración sin proyecto", () => {
  const c = { netoCentavos: 100000, ivaCentavos: 21000 };
  const bien = [l({ netoCentavos: 90000, ivaCentavos: 18900 }), l({ destino: "ADMINISTRACION", proyectoId: null, categoria: "Alquiler", netoCentavos: 10000, ivaCentavos: 2100 })];
  assert.equal(errorDeImputacion(c, bien, listas), null);
  assert.match(String(errorDeImputacion(c, [l({ netoCentavos: 99999, ivaCentavos: 21000 })], listas)), /falta imputar 0,01/);
  assert.match(String(errorDeImputacion(c, [l({ categoria: "Inventada", netoCentavos: 100000, ivaCentavos: 21000 })], listas)), /no está en la lista/);
  assert.match(String(errorDeImputacion(c, [l({ sector: "Marte", netoCentavos: 100000, ivaCentavos: 21000 })], listas)), /sector/);
  assert.match(String(errorDeImputacion(c, [l({ proyectoId: null, netoCentavos: 100000, ivaCentavos: 21000 })], listas)), /elegí el proyecto/);
  assert.match(String(errorDeImputacion(c, [l({ destino: "ADMINISTRACION", categoria: "Alquiler", netoCentavos: 100000, ivaCentavos: 21000 })], listas)), /no lleva proyecto/);
  assert.match(String(errorDeImputacion(c, [], listas)), /al menos una/);
});

test("imputadoPorProyecto: costo por línea; lo pagado se reparte en proporción; administración y anulados no van", () => {
  const m = imputadoPorProyecto([
    { totalCentavos: 121000, pagadoCentavos: 60500, anulado: false, lineas: [{ proyectoId: "p1", netoCentavos: 60000, ivaCentavos: 12600, costoCentavos: 60000 }, { proyectoId: "p2", netoCentavos: 30000, ivaCentavos: 6300, costoCentavos: 30000 }, { proyectoId: null, netoCentavos: 10000, ivaCentavos: 2100, costoCentavos: 10000 }] },
    { totalCentavos: 5000, pagadoCentavos: 0, anulado: true, lineas: [{ proyectoId: "p1", netoCentavos: 5000, ivaCentavos: 0, costoCentavos: 5000 }] },
  ]);
  assert.deepEqual(m.get("p1"), { costo: 60000, pagado: 36300, porPagar: 36300 }, "a mano: pagado la mitad de 72.600");
  assert.deepEqual(m.get("p2"), { costo: 30000, pagado: 18150, porPagar: 18150 });
  assert.equal(m.size, 2);
});

const comp = (x: Partial<ComprobanteParaOrden> = {}): ComprobanteParaOrden => ({ id: "c1", supplierId: "s1", totalCentavos: 121000, anulado: false, cargadoPorId: "u1", enOrdenesCentavos: 0, cuotas: [], ...x });

test("errorDeOrden: un proveedor, no pasa el saldo (sumando renglones), ni el de la cuota; números «OP 00000012»", () => {
  const m = new Map([["c1", comp({ enOrdenesCentavos: 50000, cuotas: [{ id: "q1", montoCentavos: 60000, enOrdenesCentavos: 50000 }] })]]);
  assert.equal(saldoDe(121000, 50000), 71000);
  assert.equal(saldoDe(100, 500), 0);
  assert.equal(errorDeOrden("s1", [{ comprobanteId: "c1", cuotaId: null, importeCentavos: 71000 }], m), null);
  assert.match(String(errorDeOrden("s1", [{ comprobanteId: "c1", cuotaId: null, importeCentavos: 40000 }, { comprobanteId: "c1", cuotaId: null, importeCentavos: 31001 }], m)), /pasa lo que falta pagar/);
  assert.match(String(errorDeOrden("s1", [{ comprobanteId: "c1", cuotaId: "q1", importeCentavos: 10001 }], m)), /de esa cuota/);
  assert.match(String(errorDeOrden("s2", [{ comprobanteId: "c1", cuotaId: null, importeCentavos: 1 }], m)), /un solo proveedor/);
  assert.match(String(errorDeOrden("s1", [{ comprobanteId: "c1", cuotaId: null, importeCentavos: 0 }], m)), /mayor que cero/);
  assert.match(String(errorDeOrden("s1", [{ comprobanteId: "c9", cuotaId: null, importeCentavos: 1 }], m)), /no existe/);
  assert.match(String(errorDeOrden("s1", [{ comprobanteId: "c1", cuotaId: null, importeCentavos: 1 }], new Map([["c1", comp({ anulado: true })]]))), /anulado/);
  assert.equal(numeroDeOrden(12), "OP 00000012");
  assert.match(String(errorDeAprobacion("u1", ["u1", "u2"])), /otra persona/);
  assert.equal(errorDeAprobacion("u3", ["u1"]), null);
});

test("resultadoReal (O13): imputado + gastos + previsto; el premio sin lo rendido sin aprobar; sin nada, sin ganancia", () => {
  const t: Totales = { costo: 1000, neto: 2000, iva: 420, total: 2420, ganancia: 1000, margenPct: 50 };
  const r = resultadoReal(t, [{ rubro: "Catering", neto: 200, iva: 0, pagadoEl: null, anuladoEl: null }, { rubro: "Catering", neto: 50, iva: 0, pagadoEl: null, anuladoEl: null, sinAprobar: true }, { rubro: "Catering", neto: 999, iva: 0, pagadoEl: null, anuladoEl: new Date() }], 400, { costo: 1000, pagado: 0, porPagar: 1210 });
  assert.deepEqual([r.costoReal, r.costoParaElPremio, r.imputado, r.gastos, r.previsto], [1650, 1600, 1000, 250, 400], "a mano: 1.000 + 250 + 400");
  assert.equal(r.porPagar, 250 + 400 + 1210);
  assert.equal(r.gananciaReal, 2000 - 1650);
  const vacio = resultadoReal(t, []);
  assert.deepEqual([vacio.conGastos, vacio.costoReal, vacio.gananciaReal], [false, 0, null]);
});

test("O30 · CSV del IVA crédito: «;», coma decimal, CUIT, total y sin fórmulas", () => {
  const csv = csvIvaCredito("2026-11", [
    { fecha: new Date("2026-11-05T15:00:00Z"), tipo: "A", numero: "00003-00000088", proveedor: "=Catering Sur", cuit: "30-11111111-1", neto: 100_000_00, iva: 21_000_00 },
    { fecha: new Date("2026-11-20T15:00:00Z"), tipo: "A", numero: "00001-00000002", proveedor: "Luces; SRL", cuit: null, neto: 50_000_00, iva: 10_500_00 },
  ]);
  const filas = csv.trimEnd().split("\r\n");
  assert.equal(filas.length, 5);
  assert.equal(filas[2], "05/11/2026;A;00003-00000088;'=Catering Sur;30-11111111-1;100000,00;21000,00");
  assert.equal(filas[3], '20/11/2026;A;00001-00000002;"Luces; SRL";;50000,00;10500,00');
  assert.equal(filas[4], "Total;;;;;150000,00;31500,00");
});

test("O30 · mes del parámetro: AAAA-MM válido o el mes corriente en Argentina", () => {
  assert.equal(mesDelParametro("2026-02"), "2026-02");
  assert.equal(mesDelParametro("2026-13", new Date("2026-11-01T02:00:00Z")), "2026-10");
  assert.equal(mesDelParametro(null, new Date("2026-11-18T12:00:00Z")), "2026-11");
});
