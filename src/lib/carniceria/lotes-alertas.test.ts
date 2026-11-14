// T3 · alertas de vencimiento y guarda de venta de un lote vencido. Puro + la guarda de la
// transacción contra un doble que anota cada consulta (negocio y estado en el SQL).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alertaDeVencimiento,
  instanteDelDia,
  motivoDeVentaVencida,
  resumenDeAlertas,
  textoDelAvisoDeVencimientos,
  type BatchStatus,
} from "./lotes";
import { controlarLotesVencidosEnTx } from "./lotes-registro";
import { RechazoDeDominio, motivoMostrable } from "@/lib/rechazo-de-dominio";

const HOY = "2026-11-10";
const v = (dia: string) => instanteDelDia(dia);

test("alertaDeVencimiento: vencido / vence hoy / por vencer (≤N) / ok / sin fecha", () => {
  assert.equal(alertaDeVencimiento(v("2026-11-09"), HOY), "vencido");
  assert.equal(alertaDeVencimiento(v("2026-11-10"), HOY), "vence-hoy");
  assert.equal(alertaDeVencimiento(v("2026-11-11"), HOY), "por-vencer");
  assert.equal(alertaDeVencimiento(v("2026-11-13"), HOY), "por-vencer", "3 días: por defecto entra");
  assert.equal(alertaDeVencimiento(v("2026-11-14"), HOY), "ok");
  assert.equal(alertaDeVencimiento(null, HOY), "sin-fecha");
  // N configurable.
  assert.equal(alertaDeVencimiento(v("2026-11-14"), HOY, 5), "por-vencer");
  assert.equal(alertaDeVencimiento(v("2026-11-11"), HOY, 0), "ok", "con N=0 sólo avisa hoy");
  // Lo guardado antes de la ola 3 (medianoche UTC) es el mismo día.
  assert.equal(alertaDeVencimiento(new Date("2026-11-10T00:00:00.000Z"), HOY), "vence-hoy");
});

test("alertaDeVencimiento usa el día del NEGOCIO que recibe, no la hora del servidor", () => {
  // 10/11 23:30 en Argentina = 11/11 02:30 UTC: el negocio sigue en el 10 → vence hoy, no vencido.
  assert.equal(alertaDeVencimiento(v("2026-11-10"), "2026-11-10"), "vence-hoy");
  assert.equal(alertaDeVencimiento(v("2026-11-10"), "2026-11-11"), "vencido");
});

test("resumenDeAlertas cuenta sólo lo disponible, y el aviso sale en criollo", () => {
  const lotes = [
    { status: "AVAILABLE" as BatchStatus, expiresAt: v("2026-11-01") },
    { status: "AVAILABLE" as BatchStatus, expiresAt: v("2026-11-10") },
    { status: "AVAILABLE" as BatchStatus, expiresAt: v("2026-11-10") },
    { status: "AVAILABLE" as BatchStatus, expiresAt: v("2026-11-12") },
    { status: "AVAILABLE" as BatchStatus, expiresAt: v("2026-12-01") },
    { status: "WITHDRAWN" as BatchStatus, expiresAt: v("2026-11-01") },
    { status: "DEPLETED" as BatchStatus, expiresAt: v("2026-11-10") },
  ];
  const r = resumenDeAlertas(lotes, HOY);
  assert.deepEqual(r, { vencidos: 1, venceHoy: 2, porVencer: 1, dias: 3 });
  assert.equal(textoDelAvisoDeVencimientos(r), "1 lote vencido en la heladera · 2 vencen hoy · 1 vence en 3 días o menos.");
  assert.equal(textoDelAvisoDeVencimientos({ vencidos: 0, venceHoy: 0, porVencer: 0, dias: 3 }), null);
  assert.equal(textoDelAvisoDeVencimientos({ vencidos: 0, venceHoy: 0, porVencer: 2, dias: 1 }), "2 vencen mañana.");
});

test("motivoDeVentaVencida: frena sólo si TODOS los lotes disponibles del corte vencieron", () => {
  const lote = (code: string, dia: string | null, status: BatchStatus = "AVAILABLE") => ({ code, expiresAt: dia ? v(dia) : null, status });
  assert.equal(motivoDeVentaVencida("Vacío", [], HOY), null, "sin lotes cargados se vende como siempre");
  assert.equal(motivoDeVentaVencida("Vacío", [lote("L1", "2026-11-09", "WITHDRAWN")], HOY), null, "lo retirado no cuenta");
  assert.equal(motivoDeVentaVencida("Vacío", [lote("L1", "2026-11-09"), lote("L2", "2026-11-15")], HOY), null, "queda uno vendible (FEFO)");
  assert.equal(motivoDeVentaVencida("Vacío", [lote("L1", "2026-11-10")], HOY), null, "el que vence hoy todavía se vende");
  assert.equal(motivoDeVentaVencida("Vacío", [lote("L1", null)], HOY), null, "sin fecha no se presume vencido");
  const uno = motivoDeVentaVencida("Vacío", [lote("L1", "2026-11-09")], HOY);
  assert.equal(uno, 'No se puede vender "Vacío": su lote L1 venció el 09/11/2026. Sacalo de la venta y marcá el lote como retirado en Lotes y vencimientos.');
  const dos = motivoDeVentaVencida("Vacío", [lote("L1", "2026-11-01"), lote("L2", "2026-11-08")], HOY)!;
  assert.match(dos, /sus 2 lotes en la heladera están vencidos \(el último, L2, venció el 08\/11\/2026\)/);
  const largo = motivoDeVentaVencida("x".repeat(500), [lote("L1", "2026-11-09")], HOY)!;
  assert.ok(largo.length <= 300, "entra en un rechazo mostrable");
});

function txDoble(filas: { productId: string; code: string; expiresAt: Date | null }[]) {
  const consultas: { sql: string; values: unknown[] }[] = [];
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      consultas.push({ sql: strings.join("?"), values });
      return filas;
    },
  };
  return { tx: tx as never, consultas };
}

test("controlarLotesVencidosEnTx: rechazo de dominio mostrable, con el negocio y AVAILABLE en el SQL", async () => {
  const { tx, consultas } = txDoble([{ productId: "vacio", code: "L1", expiresAt: v("2026-11-09") }]);
  await assert.rejects(
    controlarLotesVencidosEnTx(tx, "t-magra", [{ productId: "vacio", name: "Vacío" }, { productId: "lomo", name: "Lomo" }], HOY),
    (err: unknown) => err instanceof RechazoDeDominio && motivoMostrable(err) !== null && /Vacío/.test((err as Error).message),
  );
  assert.equal(consultas.length, 1);
  assert.match(consultas[0].sql, /"tenantId" = \?/);
  assert.match(consultas[0].sql, /"status" = 'AVAILABLE'/);
  assert.equal(consultas[0].values[0], "t-magra");
});

test("controlarLotesVencidosEnTx: sin líneas no consulta; con lote vigente deja vender", async () => {
  const vacio = txDoble([]);
  await controlarLotesVencidosEnTx(vacio.tx, "t-magra", [], HOY);
  assert.equal(vacio.consultas.length, 0);
  const vigente = txDoble([
    { productId: "vacio", code: "L1", expiresAt: v("2026-11-09") },
    { productId: "vacio", code: "L2", expiresAt: v("2026-11-20") },
  ]);
  await controlarLotesVencidosEnTx(vigente.tx, "t-magra", [{ productId: "vacio", name: "Vacío" }], HOY);
});
