// ============================================================================
// TEST-GATE — seña obligatoria para confirmar (interruptor «sena-obligatoria»)
// ============================================================================
//
// Lo que queda blindado:
//  · Apagado, confirmar es lo de siempre (la regla dice que sí sin mirar la plata).
//  · Prendido, un servicio con seña no pasa a CONFIRMED sin un cobro vigente; un cobro ANULADO no
//    cuenta; una condonación tampoco.
//  · La guarda del servidor lee el interruptor con el `tx` (sólo filas de la consola) y tira
//    `RechazoDeDominio` para que la transacción vuelva atrás.
//  · «Confirmar sin seña»: sólo con la capability (sólo OWNER), motivo ≥ 10 letras, escritura
//    condicional PENDING y auditoría con usuario y motivo.
//  · Trinquete: todo archivo que escribe `status: "CONFIRMED"` pasa por la guarda.
//  · «Pendiente de seña»: vence en min(creado + H, inicio − 2 h); H por SENA_VENCE_HORAS.
//
// Sin DB: la guarda corre contra un doble del `tx`. Estilo node:test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  MENSAJE_FALTA_SENIA,
  decidirConfirmacionConSenia,
  hayCobroDeSeniaVigente,
  horasDeVencimientoDelNegocio,
  leerHorasDeVencimiento,
  marcaDeSeniaDelTurno,
  marcaDeSeniaPendiente,
  validarConfirmarSinSenia,
  vencimientoDeLaSenia,
} from "./sena-obligatoria-core";
import { estadoInicialSinCobro, exigirSeniaParaConfirmar, veredictoSeniaParaConfirmar, type TxDeSenia } from "./sena-obligatoria";
import { RechazoDeDominio } from "@/lib/rechazo-de-dominio";
import { roleHasCapability, permisoEfectivo } from "@/lib/capabilities";
import { esInterruptorId, interruptorPorId } from "@/cambios/interruptores";

const COBRO = { id: "c1", amount: 5000, note: "Seña al reservar" };
const ANULACION_DE_C1 = { id: "c2", amount: -5000, note: "ANULACION:c1 — cobré de más" };

// ── 1. La regla pura ─────────────────────────────────────────────────────────

test("apagado: confirma siempre, aunque el servicio pida seña y no haya plata", () => {
  assert.deepEqual(decidirConfirmacionConSenia({ prendida: false, senia: 5000, cobros: [] }), { ok: true });
});

test("prendido: servicio sin seña (0) confirma", () => {
  assert.deepEqual(decidirConfirmacionConSenia({ prendida: true, senia: 0, cobros: [] }), { ok: true });
});

test("prendido: con seña y sin cobro, rechaza con el mensaje claro", () => {
  assert.deepEqual(decidirConfirmacionConSenia({ prendida: true, senia: 5000, cobros: [] }), { ok: false, motivo: MENSAJE_FALTA_SENIA });
});

test("prendido: con un cobro vigente, confirma", () => {
  assert.equal(decidirConfirmacionConSenia({ prendida: true, senia: 5000, cobros: [COBRO] }).ok, true);
});

test("prendido: un cobro ANULADO no cuenta como seña", () => {
  assert.equal(hayCobroDeSeniaVigente([COBRO, ANULACION_DE_C1]), false);
  assert.equal(decidirConfirmacionConSenia({ prendida: true, senia: 5000, cobros: [COBRO, ANULACION_DE_C1] }).ok, false);
});

test("prendido: una condonación no es plata que entró", () => {
  const condonacion = { id: "c3", amount: 5000, note: "CONDONACION: descuento" };
  assert.equal(hayCobroDeSeniaVigente([condonacion]), false);
});

test("prendido: el pago viejo aprobado cuenta; el pendiente no", () => {
  assert.equal(decidirConfirmacionConSenia({ prendida: true, senia: 5000, cobros: [], pagoLegado: { status: "APPROVED", amount: 9000 } }).ok, true);
  assert.equal(decidirConfirmacionConSenia({ prendida: true, senia: 5000, cobros: [], pagoLegado: { status: "PENDING", amount: 9000 } }).ok, false);
});

test("el mensaje entra en un RechazoDeDominio mostrable (≤ 300)", () => {
  assert.ok(MENSAJE_FALTA_SENIA.length <= 300);
});

// ── 2. La guarda del servidor, contra un doble del tx ───────────────────────

type Fila = { id: string; entity: string; entityId: string; action: string; actor: string; channel: string; createdAt: Date };
const filaInterruptor = (action: "interruptor.encender" | "interruptor.apagar", extra: Partial<Fila> = {}): Fila => ({
  id: "a1",
  entity: "Interruptor",
  entityId: "sena-obligatoria",
  action,
  actor: "operator:gsg",
  channel: "operador",
  createdAt: new Date("2026-11-01T10:00:00Z"),
  ...extra,
});

function txDoble(p: {
  filas: Fila[];
  turno?: { priceAtBooking: number | null; service: { price: number; depositAmount: number | null }; payment: { status: string; amount: number } | null } | null;
  cobros?: { id: string; amount: number; note: string | null }[];
}) {
  const vistos: { auditLog: unknown[]; appointment: unknown[]; collection: unknown[] } = { auditLog: [], appointment: [], collection: [] };
  const tx = {
    auditLog: { findMany: async (args: unknown) => (vistos.auditLog.push(args), p.filas) },
    appointment: { findFirst: async (args: unknown) => (vistos.appointment.push(args), p.turno === undefined ? null : p.turno) },
    collection: {
      findMany: async (args: unknown) => (
        vistos.collection.push(args),
        (p.cobros ?? []).map((c) => ({
          ...c,
          originId: "t1",
          method: "TRANSFERENCIA",
          createdAt: new Date(),
          collectedBy: "user:1",
          amount: { toNumber: () => c.amount },
        }))
      ),
    },
  };
  return { tx: tx as unknown as TxDeSenia, vistos };
}

const TURNO_CON_SENIA = { priceAtBooking: 20000, service: { price: 20000, depositAmount: 5000 }, payment: null };

test("guarda apagada (nunca tocada): no lee el turno ni la plata, pasa", async () => {
  const { tx, vistos } = txDoble({ filas: [], turno: TURNO_CON_SENIA });
  await exigirSeniaParaConfirmar(tx, { tenantId: "t", appointmentId: "t1" });
  assert.equal(vistos.appointment.length, 0);
  assert.equal(vistos.collection.length, 0);
});

test("guarda apagada por la consola (última fila = apagar): pasa", async () => {
  const { tx } = txDoble({ filas: [filaInterruptor("interruptor.apagar")], turno: TURNO_CON_SENIA });
  assert.deepEqual(await veredictoSeniaParaConfirmar(tx, { tenantId: "t", appointmentId: "t1" }), { ok: true });
});

test("guarda prendida, seña sin cobrar: tira RechazoDeDominio (la tx vuelve atrás)", async () => {
  const { tx } = txDoble({ filas: [filaInterruptor("interruptor.encender")], turno: TURNO_CON_SENIA });
  await assert.rejects(exigirSeniaParaConfirmar(tx, { tenantId: "t", appointmentId: "t1" }), (e: unknown) => e instanceof RechazoDeDominio && e.message === MENSAJE_FALTA_SENIA);
});

test("guarda prendida, seña cobrada: pasa", async () => {
  const { tx } = txDoble({ filas: [filaInterruptor("interruptor.encender")], turno: TURNO_CON_SENIA, cobros: [COBRO] });
  await exigirSeniaParaConfirmar(tx, { tenantId: "t", appointmentId: "t1" });
});

test("guarda prendida, seña cobrada y ANULADA: rechaza", async () => {
  const { tx } = txDoble({ filas: [filaInterruptor("interruptor.encender")], turno: TURNO_CON_SENIA, cobros: [COBRO, ANULACION_DE_C1] });
  await assert.rejects(exigirSeniaParaConfirmar(tx, { tenantId: "t", appointmentId: "t1" }), RechazoDeDominio);
});

test("guarda prendida, servicio sin seña: pasa", async () => {
  const { tx } = txDoble({ filas: [filaInterruptor("interruptor.encender")], turno: { ...TURNO_CON_SENIA, service: { price: 20000, depositAmount: null } } });
  await exigirSeniaParaConfirmar(tx, { tenantId: "t", appointmentId: "t1" });
});

test("una fila forjada (no es de la consola) NO prende la guarda", async () => {
  const forjada = filaInterruptor("interruptor.encender", { channel: "admin", actor: "user:9" });
  const { tx } = txDoble({ filas: [forjada], turno: TURNO_CON_SENIA });
  assert.deepEqual(await veredictoSeniaParaConfirmar(tx, { tenantId: "t", appointmentId: "t1" }), { ok: true });
});

test("la guarda consulta con el tenant y acotada al interruptor y al turno", async () => {
  const { tx, vistos } = txDoble({ filas: [filaInterruptor("interruptor.encender")], turno: TURNO_CON_SENIA, cobros: [COBRO] });
  await exigirSeniaParaConfirmar(tx, { tenantId: "neg-1", appointmentId: "t1" });
  const w = (vistos.auditLog[0] as { where: Record<string, unknown> }).where;
  assert.equal(w.tenantId, "neg-1");
  assert.equal(w.entityId, "sena-obligatoria");
  assert.equal(w.channel, "operador");
  assert.deepEqual((vistos.appointment[0] as { where: unknown }).where, { id: "t1", tenantId: "neg-1" });
  assert.equal((vistos.collection[0] as { where: { tenantId: string } }).where.tenantId, "neg-1");
});

test("lista de espera: con la regla en contra nace Reservado; apagado o sin seña, Confirmado", async () => {
  const on = txDoble({ filas: [filaInterruptor("interruptor.encender")] }).tx;
  const off = txDoble({ filas: [] }).tx;
  assert.equal(await estadoInicialSinCobro(on, { tenantId: "t", depositAmount: 5000, precio: 20000 }), "PENDING");
  assert.equal(await estadoInicialSinCobro(on, { tenantId: "t", depositAmount: null, precio: 20000 }), "CONFIRMED");
  assert.equal(await estadoInicialSinCobro(off, { tenantId: "t", depositAmount: 5000, precio: 20000 }), "CONFIRMED");
});

// ── 3. La excepción: «Confirmar sin seña» ───────────────────────────────────

test("excepción: sin el permiso, no", () => {
  const r = validarConfirmarSinSenia({ puede: false, motivo: "La clienta pagó en el local" });
  assert.equal(r.ok, false);
});

test("excepción: motivo corto (< 10) o vacío, no", () => {
  assert.equal(validarConfirmarSinSenia({ puede: true, motivo: "porque sí" }).ok, false); // 9 letras
  assert.equal(validarConfirmarSinSenia({ puede: true, motivo: "   " }).ok, false);
  assert.equal(validarConfirmarSinSenia({ puede: true, motivo: undefined }).ok, false);
  assert.equal(validarConfirmarSinSenia({ puede: true, motivo: "a    b    c" }).ok, false); // espacios no suman
});

test("excepción: con permiso y motivo ≥ 10, sí (motivo normalizado)", () => {
  assert.deepEqual(validarConfirmarSinSenia({ puede: true, motivo: "  clienta  de años " }), { ok: true, motivo: "clienta de años" });
});

test("la capability es sólo de la dueña por defecto y ningún override la da", () => {
  assert.equal(roleHasCapability("OWNER", "agenda:confirmar-sin-senia"), true);
  assert.equal(roleHasCapability("RECEPTION", "agenda:confirmar-sin-senia"), false);
  assert.equal(roleHasCapability("PROFESSIONAL", "agenda:confirmar-sin-senia"), false);
  const recepConOverride = { role: "RECEPTION" as const, overrides: [{ capability: "agenda:confirmar-sin-senia", allowed: true }] };
  assert.equal(permisoEfectivo(recepConOverride, "agenda:confirmar-sin-senia"), false);
});

test("la acción exige la capability, escribe condicional PENDING y audita usuario y motivo", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/turnos/sena-obligatoria-actions.ts"), "utf8");
  assert.match(src, /^"use server";/);
  assert.match(src, /requireCapability\("agenda:confirmar-sin-senia"\)/);
  assert.match(src, /validarConfirmarSinSenia\(/);
  assert.match(src, /where: \{ id, tenantId, status: "PENDING"/);
  assert.match(src, /action: "confirm_sin_senia"/);
  assert.match(src, /motivo: v\.motivo, usuario: \{ id: user\.id/);
  // Un solo endpoint.
  assert.equal((src.match(/^export async function/gm) ?? []).length, 1);
});

test("el interruptor existe en el catálogo, no es incorporado (apagado por defecto)", () => {
  assert.equal(esInterruptorId("sena-obligatoria"), true);
  assert.notEqual(interruptorPorId("sena-obligatoria").incorporado, true);
});

// ── 4. Trinquete: todo camino que escribe CONFIRMED pasa por la guarda ───────

function archivosTs(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) {
      if (n === "generated" || n === "node_modules" || n === "e2e") continue;
      out.push(...archivosTs(p));
    } else if (/\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}

test("trinquete: cada archivo que escribe status CONFIRMED en un turno usa la guarda", () => {
  // La excepción (la dueña) es la única que escribe CONFIRMED sin la guarda.
  const EXENTOS = new Set(["src/lib/turnos/sena-obligatoria-actions.ts"]);
  const raiz = process.cwd();
  const escriben: string[] = [];
  for (const abs of archivosTs(join(raiz, "src/lib"))) {
    const rel = abs.slice(raiz.length + 1);
    const src = readFileSync(abs, "utf8");
    // `data: { status: "CONFIRMED" }` (update) o `status: "CONFIRMED",` dentro de un appointment.create.
    const escribe = /data:\s*\{\s*status:\s*"CONFIRMED"/.test(src) || /appointment\.create\([\s\S]{0,600}?status:\s*"CONFIRMED"/.test(src);
    if (!escribe || EXENTOS.has(rel)) continue;
    escriben.push(rel);
    assert.match(src, /exigirSeniaParaConfirmar|estadoInicialSinCobro/, `${rel} escribe CONFIRMED sin la guarda de la seña`);
  }
  // Los caminos conocidos están en la lista (si alguno desaparece, que se revise el trinquete).
  for (const f of ["src/lib/actions.ts", "src/lib/turnos/cobro-actions.ts"]) assert.ok(escriben.includes(f), `${f} ya no escribe CONFIRMED`);
});

test("trinquete: el alta con estado (bookAppointment) llama la guarda si nace CONFIRMED", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/actions.ts"), "utf8");
  assert.match(src, /if \(status === "CONFIRMED"\) await exigirSeniaParaConfirmar\(tx, \{ tenantId, appointmentId: appointment\.id \}\)/);
  const waitlist = readFileSync(join(process.cwd(), "src/lib/waitlist-actions.ts"), "utf8");
  assert.match(waitlist, /const status = await estadoInicialSinCobro\(tx,/);
  assert.doesNotMatch(waitlist, /status:\s*"CONFIRMED"/);
});

// ── 5. «Pendiente de seña» ───────────────────────────────────────────────────

test("SENA_VENCE_HORAS: mismo formato que CANCELACION_ONLINE_HORAS", () => {
  const m = leerHorasDeVencimiento("beauty-spa=24; magra=12;roto=x;cero=0");
  assert.equal(m.get("beauty-spa"), 24);
  assert.equal(m.get("magra"), 12);
  assert.equal(m.has("roto"), false);
  assert.equal(m.has("cero"), false);
  assert.equal(horasDeVencimientoDelNegocio("beauty-spa", { SENA_VENCE_HORAS: "beauty-spa=24" }), 24);
  assert.equal(horasDeVencimientoDelNegocio("shinevelas", { SENA_VENCE_HORAS: "beauty-spa=24" }), null);
});

test("vence = min(creado + H, inicio − 2 h)", () => {
  const creado = "2026-11-07T10:00:00Z";
  // Turno lejos: manda creado + 24 h.
  assert.equal(vencimientoDeLaSenia({ creado, inicio: "2026-11-12T15:00:00Z", horas: 24 }).toISOString(), "2026-11-08T10:00:00.000Z");
  // Turno cerca: manda inicio − 2 h.
  assert.equal(vencimientoDeLaSenia({ creado, inicio: "2026-11-07T18:00:00Z", horas: 24 }).toISOString(), "2026-11-07T16:00:00.000Z");
  // Sin H: inicio − 2 h.
  assert.equal(vencimientoDeLaSenia({ creado, inicio: "2026-11-12T15:00:00Z", horas: null }).toISOString(), "2026-11-12T13:00:00.000Z");
});

test("marca: pendiente con vencimiento, o vencida (no cancela nada: sólo texto)", () => {
  const ahora = new Date("2026-11-07T12:00:00Z");
  const p = marcaDeSeniaPendiente("2026-11-08T10:00:00Z", ahora);
  assert.equal(p.tipo, "pendiente");
  assert.match(p.texto, /^Pendiente de seña · vence /);
  assert.deepEqual(marcaDeSeniaPendiente("2026-11-07T11:00:00Z", ahora), { tipo: "vencida", vence: "2026-11-07T11:00:00.000Z", texto: "Seña vencida" });
});

test("marca del turno: sólo prendido, Reservado futuro, con seña y sin cobro vigente", () => {
  const base = {
    prendida: true,
    status: "PENDING",
    inicio: "2026-11-10T15:00:00Z",
    creado: "2026-11-07T10:00:00Z",
    senia: 5000,
    cobros: [] as { id: string; amount: number; note: string | null }[],
    horas: 24,
    ahora: new Date("2026-11-07T12:00:00Z"),
  };
  assert.equal(marcaDeSeniaDelTurno(base)?.tipo, "pendiente");
  assert.equal(marcaDeSeniaDelTurno({ ...base, prendida: false }), null);
  assert.equal(marcaDeSeniaDelTurno({ ...base, status: "CONFIRMED" }), null);
  assert.equal(marcaDeSeniaDelTurno({ ...base, senia: 0 }), null);
  assert.equal(marcaDeSeniaDelTurno({ ...base, cobros: [COBRO] }), null);
  assert.equal(marcaDeSeniaDelTurno({ ...base, cobros: [COBRO, ANULACION_DE_C1] })?.tipo, "pendiente");
  assert.equal(marcaDeSeniaDelTurno({ ...base, ahora: new Date("2026-11-09T12:00:00Z") })?.tipo, "vencida");
  assert.equal(marcaDeSeniaDelTurno({ ...base, ahora: new Date("2026-11-10T16:00:00Z") }), null); // ya empezó
});
