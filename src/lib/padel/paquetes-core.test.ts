// T5 · Reglas puras de paquetes y precio por club (paquetes-core.ts) + la tolerancia a la tabla
// que todavía no existe (isTableMissing, P2021).
//
//   node --import tsx --test src/lib/padel/paquetes-core.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@/generated/prisma/client";
import { isTableMissing } from "@/lib/prisma-errors";
import { pagoAlCancelar, pagoAlNoVino, precioDelTitular, montoPorPersona, saldoAFavor } from "./core";
import {
  FILTRO_PLATA_NUEVA,
  MEDIOS_SIN_PLATA_NUEVA,
  elegirPaquete,
  listaDelClub,
  paqueteValido,
  precioClubValido,
  puedeAnularPaquete,
  quedanDe,
  quedanEnTotal,
  textoQuedan,
} from "./paquetes-core";

const d = (s: string) => new Date(`${s}T12:00:00.000Z`);

test("paqueteValido: cantidad 1..100, plata leída como en Argentina, medio de cobro", () => {
  assert.deepEqual(paqueteValido({ clases: "8", precio: "160.000", medio: "EFECTIVO" }), { ok: true, clases: 8, precio: 160_000, medio: "EFECTIVO" });
  assert.deepEqual(paqueteValido({ clases: 4, precio: "$ 50.000,50", medio: "MERCADO_PAGO" }), { ok: true, clases: 4, precio: 50_000.5, medio: "MERCADO_PAGO" });
  assert.equal(paqueteValido({ clases: "0", precio: "1000", medio: "EFECTIVO" }).ok, false);
  assert.equal(paqueteValido({ clases: "101", precio: "1000", medio: "EFECTIVO" }).ok, false);
  assert.equal(paqueteValido({ clases: "2.5", precio: "1000", medio: "EFECTIVO" }).ok, false);
  assert.equal(paqueteValido({ clases: "4", precio: "", medio: "EFECTIVO" }).ok, false, "sin precio no hay paquete");
  assert.equal(paqueteValido({ clases: "4", precio: "0", medio: "EFECTIVO" }).ok, false);
  assert.equal(paqueteValido({ clases: "4", precio: "abc", medio: "EFECTIVO" }).ok, false);
  assert.equal(paqueteValido({ clases: "4", precio: "99999999", medio: "EFECTIVO" }).ok, false, "tope de precio");
  assert.equal(paqueteValido({ clases: "4", precio: "1000", medio: "SALDO_A_FAVOR" }).ok, false, "el saldo no compra paquetes");
  assert.equal(paqueteValido({ clases: "4", precio: "1000", medio: "PAQUETE" }).ok, false);
});

test("quedan: clases − usadas, nunca negativo; anulado no tiene", () => {
  assert.equal(quedanDe({ clases: 8, usadas: 3 }), 5);
  assert.equal(quedanDe({ clases: 2, usadas: 5 }), 0);
  assert.equal(quedanDe({ clases: 8, usadas: 0, anuladoEl: new Date() }), 0);
  assert.equal(quedanEnTotal([{ clases: 4, usadas: 4 }, { clases: 8, usadas: 1 }, { clases: 5, usadas: 0, anuladoEl: new Date() }]), 7);
  assert.equal(textoQuedan(0), "No le quedan clases");
  assert.equal(textoQuedan(1), "Queda 1 clase");
  assert.equal(textoQuedan(3), "Quedan 3 clases");
});

test("elegirPaquete: el más viejo con clases (FIFO); ninguno → null", () => {
  const viejo = { id: "b", clases: 4, usadas: 4, pagadoEl: d("2026-10-01") };
  const medio = { id: "c", clases: 4, usadas: 1, pagadoEl: d("2026-10-10") };
  const nuevo = { id: "a", clases: 8, usadas: 0, pagadoEl: d("2026-11-01") };
  assert.equal(elegirPaquete([nuevo, viejo, medio])?.id, "c", "el viejo está agotado: sigue el del medio");
  assert.equal(elegirPaquete([viejo]), null);
  assert.equal(elegirPaquete([]), null);
  assert.equal(elegirPaquete([{ ...nuevo, anuladoEl: new Date() }]), null, "uno anulado no se usa");
  // Mismo día: desempata el id (estable entre dos cobros).
  assert.equal(elegirPaquete([{ id: "z", clases: 1, usadas: 0, pagadoEl: d("2026-11-01") }, { id: "y", clases: 1, usadas: 0, pagadoEl: d("2026-11-01") }])?.id, "y");
});

test("anular: sólo un paquete sin clases usadas y no anulado", () => {
  assert.equal(puedeAnularPaquete({ usadas: 0 }), true);
  assert.equal(puedeAnularPaquete({ usadas: 1 }), false);
  assert.equal(puedeAnularPaquete({ usadas: 0, anuladoEl: new Date() }), false);
});

test("pagada con el paquete y cancelada (o «no vino, no se cobra»): vuelve a PENDIENTE, nunca a favor", () => {
  assert.deepEqual(pagoAlCancelar({ pagoEstado: "PAGADO", pagoMedio: "PAQUETE" }), { pagoEstado: "PENDIENTE", pagoMedio: null });
  assert.deepEqual(pagoAlNoVino({ pagoEstado: "PAGADO", pagoMedio: "PAQUETE" }, false), { pagoEstado: "PENDIENTE", pagoMedio: null });
  assert.deepEqual(pagoAlCancelar({ pagoEstado: "PAGADO", pagoMedio: "EFECTIVO" }), { pagoEstado: "ACREDITADO" }, "lo de siempre no cambia");
  // Una clase del paquete no suma saldo a favor.
  assert.equal(saldoAFavor([{ estado: "DADA", pagoEstado: "PAGADO", pagoMedio: "PAQUETE", precio: 25_000 }]), 0);
});

test("lo pagado del paquete no es plata nueva (no suma en lo cobrado)", () => {
  assert.ok(MEDIOS_SIN_PLATA_NUEVA.includes("PAQUETE"));
  assert.ok(MEDIOS_SIN_PLATA_NUEVA.includes("SALDO_A_FAVOR"));
  assert.ok(!MEDIOS_SIN_PLATA_NUEVA.includes("EFECTIVO"));
  assert.deepEqual(FILTRO_PLATA_NUEVA, { OR: [{ pagoMedio: null }, { pagoMedio: { notIn: ["SALDO_A_FAVOR", "PAQUETE"] } }] });
});

test("listaDelClub: el precio del club pisa al general campo por campo; sin club, el general", () => {
  const general = { precioIndividual: 25_000, precioGrupal: 12_000, duracionMin: 60 };
  assert.equal(listaDelClub(general, null), general);
  assert.deepEqual(listaDelClub(general, { precioIndividual: 30_000, precioGrupal: null }), { precioIndividual: 30_000, precioGrupal: 12_000, duracionMin: 60 });
  assert.deepEqual(listaDelClub(general, { precioIndividual: null, precioGrupal: 15_000 }), { precioIndividual: 25_000, precioGrupal: 15_000, duracionMin: 60 });
  // Con los mismos cálculos que agendar.
  const club = listaDelClub(general, { precioIndividual: 30_000, precioGrupal: 14_000 });
  assert.equal(precioDelTitular(club, "INDIVIDUAL", 1, 0), 30_000);
  assert.equal(precioDelTitular(club, "GRUPAL", 3, 2), 14_000);
  assert.equal(montoPorPersona(club), 14_000);
});

test("precioClubValido: vacío = el de la lista (null); si no, plata > 0", () => {
  assert.deepEqual(precioClubValido({ precioIndividual: "30.000", precioGrupal: "" }), { ok: true, precioIndividual: 30_000, precioGrupal: null });
  assert.deepEqual(precioClubValido({ precioIndividual: "", precioGrupal: "" }), { ok: true, precioIndividual: null, precioGrupal: null });
  assert.equal(precioClubValido({ precioIndividual: "0", precioGrupal: "" }).ok, false);
  assert.equal(precioClubValido({ precioIndividual: "", precioGrupal: "x" }).ok, false);
});

test("isTableMissing: P2021 (con o sin tabla) sí; P2022, P2002 y un error común, no", () => {
  const p2021 = new Prisma.PrismaClientKnownRequestError("The table `public.PadelPaquete` does not exist in the current database.", { code: "P2021", clientVersion: "7", meta: { modelName: "PadelPaquete", table: "public.PadelPaquete" } });
  assert.equal(isTableMissing(p2021), true);
  assert.equal(isTableMissing(p2021, "PadelPaquete"), true);
  assert.equal(isTableMissing(p2021, "PadelPrecioClub"), false);
  const p2022 = new Prisma.PrismaClientKnownRequestError("column", { code: "P2022", clientVersion: "7" });
  assert.equal(isTableMissing(p2022), false);
  const p2010 = new Prisma.PrismaClientKnownRequestError('Raw query failed. Code: `42P01`. Message: `relation "PadelPaquete" does not exist`', { code: "P2010", clientVersion: "7" });
  assert.equal(isTableMissing(p2010), true, "el 42P01 de una consulta cruda también");
  assert.equal(isTableMissing(new Error("P2021")), false);
});
