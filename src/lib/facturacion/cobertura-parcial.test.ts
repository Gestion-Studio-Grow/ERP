// Re-certificación del PR #38 (MEDIA-ALTA, subfacturación): un cobro de MP cubierto EN PARTE por la
// factura de un pago de MP (`mp:<pago>`) consume esa parte para siempre. Antes, una vez que el cobro
// tenía su factura propia, la parte cubierta se «liberaba» y cubría a OTRO cobro de MP, que quedaba
// sin factura (cobrado 2.500, facturado 1.500). Invariante: Σ facturado − Σ NC = Σ cobrado vivo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { planFacturasPorCobro, mpSinPareja, type FilaDelLibro, type FilaFacturada } from "@/lib/facturacion/factura-por-cobro";
import { claveNotaDeCobroMP, coberturaMP, facturadoPropioPorCobro, saldosMPSinPareja } from "@/lib/facturacion/cobertura-mp";
import { claveCobroDelLibro, cobroDeLaClave } from "@/lib/facturacion/clave-cobro-del-libro";
import { claseDeCobro, cobroAnuladoPor, notaDeAnulacion } from "@/lib/turnos/anulacion";
import { centavosDe } from "@/lib/dinero/redondeo";

const t = (s: number) => new Date(2026, 10, 6, 10, 0, s);
const cobro = (id: string, amount: number, s: number, method = "MERCADOPAGO"): FilaDelLibro => ({ id, amount, method, note: null, createdAt: t(s) });
const X: FilaFacturada = { clave: "mp:111", invoiceId: "X", importe: 1000, status: "AUTHORIZED", createdAt: t(0) };

test("ADV · cobro MP cubierto EN PARTE por mp:<pago>: la parte cubierta no se libera para otro cobro", () => {
  const A = cobro("A", 1500, 1);
  const p1 = planFacturasPorCobro({ filas: [A], conFila: new Set(), mpSinPareja: mpSinPareja([X]) });
  assert.deepEqual(p1.map((p) => [p.collectionId, p.importe]), [["A", 500]]);
  const facturadas: FilaFacturada[] = [X, { clave: claveCobroDelLibro("A"), invoiceId: "FA", importe: 500, status: "AUTHORIZED", createdAt: t(2) }];
  const B = cobro("B", 1000, 3);
  const p2 = planFacturasPorCobro({
    filas: [A, B],
    conFila: new Set(["A"]),
    mpSinPareja: mpSinPareja(facturadas),
    propias: facturadoPropioPorCobro(facturadas),
  });
  assert.deepEqual(p2.map((p) => [p.collectionId, p.importe]), [["B", 1000]]);
  // La anulación ve el mismo reparto: X cubre 1.000 de A (no a B).
  const cob = coberturaMP({
    vivos: [{ id: "A", method: "MERCADOPAGO", centavos: 150000 }, { id: "B", method: "MERCADOPAGO", centavos: 100000 }],
    conFila: new Set(["A"]),
    saldos: saldosMPSinPareja(facturadas),
    propias: facturadoPropioPorCobro(facturadas),
  });
  assert.deepEqual([...cob], [["A", [{ invoiceId: "X", centavos: 100000 }]]]);
});

// ── Simulador puro del turno: plan después de cada cobro, anulación con NC de la factura propia y
//    de la parte de MP (la misma cuenta que `turnos/anulacion.ts`). ──
function simular(pagosMP: number[], eventos: ({ cobro: FilaDelLibro } | { anular: string })[]) {
  const libro: FilaDelLibro[] = [];
  const facturadas: FilaFacturada[] = pagosMP.map((m, i) => ({ clave: `mp:p${i}`, invoiceId: `MP${i}`, importe: m, status: "AUTHORIZED", createdAt: t(0) }));
  let nc = 0;
  let seq = 100;
  const facturar = () => {
    const conFila = new Set(facturadas.map((f) => cobroDeLaClave(f.clave)).filter((id): id is string => id != null));
    for (const p of planFacturasPorCobro({ filas: libro, conFila, mpSinPareja: mpSinPareja(facturadas), propias: facturadoPropioPorCobro(facturadas) })) {
      facturadas.push({ clave: claveCobroDelLibro(p.collectionId), invoiceId: `F${p.collectionId}`, importe: p.importe, status: "AUTHORIZED", createdAt: t(seq++) });
    }
  };
  for (const e of eventos) {
    if ("cobro" in e) libro.push(e.cobro);
    else {
      const original = libro.find((f) => f.id === e.anular)!;
      const anulados = new Set(libro.map((f) => cobroAnuladoPor(f.note)).filter(Boolean));
      const vivos = libro
        .filter((f) => claseDeCobro(f.note) === "cobro" && f.amount > 0 && !anulados.has(f.id))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
        .map((f) => ({ id: f.id, method: f.method, centavos: centavosDe(f.amount) }));
      const conFila = new Set(facturadas.map((f) => cobroDeLaClave(f.clave)).filter((id): id is string => id != null));
      const propia = facturadas.find((f) => f.clave === claveCobroDelLibro(e.anular));
      if (propia) nc += propia.importe;
      if (original.method === "MERCADOPAGO") {
        const partes = coberturaMP({ vivos, conFila, saldos: saldosMPSinPareja(facturadas), propias: facturadoPropioPorCobro(facturadas) }).get(e.anular) ?? [];
        for (const p of partes) {
          nc += p.centavos / 100;
          facturadas.push({ clave: claveNotaDeCobroMP(e.anular, p.invoiceId), invoiceId: `NC${seq}`, importe: p.centavos / 100, status: "AUTHORIZED", createdAt: t(seq++), asociada: p.invoiceId });
        }
      }
      libro.push({ id: `R${e.anular}`, amount: -original.amount, method: original.method, note: notaDeAnulacion(e.anular, "x"), createdAt: t(seq++) });
    }
    facturar();
  }
  const facturado = facturadas.filter((f) => !f.clave.startsWith("turno:nc-mp:")).reduce((a, f) => a + f.importe, 0);
  const cobrado = libro.reduce((a, f) => a + f.amount, 0);
  return { facturado, nc, cobrado };
}

function permutaciones<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutaciones([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

test("invariante: Σ facturado − Σ NC = Σ cobrado vivo, en todos los órdenes de cobro (con y sin anulación)", () => {
  const cobros = [cobro("A", 1500, 1), cobro("B", 1000, 2), cobro("C", 800, 3, "EFECTIVO"), cobro("D", 300, 4)];
  let casos = 0;
  for (const pagos of [[1000], [1000, 700], [2500], [400, 400, 400]]) {
    for (const orden of permutaciones(cobros)) {
      // Los cobros llegan en este orden (createdAt según el orden de llegada).
      const llegados = orden.map((c, i) => ({ ...c, createdAt: t(10 + i) }));
      const base = llegados.map((c) => ({ cobro: c }));
      const variantes = [base, ...llegados.map((c) => [...base, { anular: c.id }]), [...base.slice(0, 2), { anular: llegados[0].id }, ...base.slice(2)]];
      for (const ev of variantes) {
        const r = simular(pagos, ev);
        const mpCobrado = ev.filter((e): e is { cobro: FilaDelLibro } => "cobro" in e).filter((e) => e.cobro.method === "MERCADOPAGO");
        // Sólo cuando lo pagado por MP no supera lo anotado con medio MP (si no, sobra factura de MP por diseño).
        const anulado = ev.flatMap((e) => ("anular" in e ? [e.anular] : []));
        const mpVivo = mpCobrado.filter((e) => !anulado.includes(e.cobro.id)).reduce((a, e) => a + e.cobro.amount, 0);
        if (pagos.reduce((a, b) => a + b, 0) > mpVivo) continue;
        assert.equal(Math.round((r.facturado - r.nc) * 100), Math.round(r.cobrado * 100), `pagos ${pagos} · ${JSON.stringify(ev.map((e) => ("cobro" in e ? e.cobro.id : `-${e.anular}`)))}`);
        casos++;
      }
    }
  }
  assert.ok(casos > 100, `casos ${casos}`);
});
