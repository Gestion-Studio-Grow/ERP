// CORTE INICIAL de caja de un tenant: arranca el saldo operativo de un arqueo físico.
//
// Es el primer cierre diario del tenant, ejecutado como script porque la pantalla y el
// modelo `CashDayClose` del cierre diario todavía no existen (docs/producto/
// diseno-cierre-diario-caja.md §5-7). Cuando existan, este script queda obsoleto: el corte
// se hace desde /admin/caja/cierre como cualquier cierre, con la validación de
// `validateCorteInicial`. Mientras tanto, esto escribe EXACTAMENTE lo que el cierre
// escribiría: los movimientos de ajuste (INGRESO/EGRESO) en `CashMovement`, fechados al
// final del día de corte, con la marca `corte-inicial:<día>` en `createdBy`.
//
// Uso (DRY-RUN por default — no escribe nada sin `--write`):
//   DATABASE_URL=... npx tsx scripts/corte-inicial.ts --tenant <slug> --dia YYYY-MM-DD \
//       --efectivo 498034 --mp 120000 --tarjeta 0 --nota "cajón contado 20:10; MP app 20:15"
//   ... --write                 escribe de verdad
//   ... --actor "user:<id>"     quién ejecuta (queda en AuditLog)
//   ... --rollback [--write]    deshace el corte de ESE día (borra por marca)
//
// GARANTÍAS
//   * La aritmética es la de src/lib/caja/corte-inicial.ts (pura, testeada): acá sólo se
//     lee el ledger, se llama, se imprime y se escribe.
//   * Un solo corte por tenant: si ya hay filas con marca de corte (cualquier día), se
//     frena. Rehacer = --rollback del corte anterior + correr de nuevo (ver el doc).
//   * Ids determinísticos (`corte-<día>-<n>`): una doble corrida choca contra la PK.
//   * Scoped por tenant + RLS (GUC seteado siempre) + lock consultivo por tenant, igual que
//     el importador del histórico (scripts/import-caja-historica.ts).
//   * Verificación OBLIGATORIA después de escribir: relee el ledger y comprueba el
//     invariante `openingFromHistory(≤ día de corte) === declarado`. Si no cierra, exit 3.
//   * `sessionId` siempre NULL: el corte no pertenece a ningún turno de mostrador.
//
// Códigos de salida: 0 ok · 1 error · 2 validación del corte · 3 invariante no cierra.

import "dotenv/config";
import { basePrisma, RLS_ENFORCEMENT } from "@/lib/prisma-base";
import { tenantTransaction } from "@/lib/rls";
import { businessWallTimeToUtc, dateStrInBusinessTz, todayInBusinessTz } from "@/lib/datetime";
import { BUSINESS_TIMEZONE } from "@/lib/business-config";
import { isDayKey, nextDayKey, type DayKey } from "@/lib/caja/cierre-diario";
import {
  buildCorteInicial,
  corteAsMovements,
  validateCorteInicial,
  verificarInvarianteCorte,
  resumenCorte,
  corteMarker,
  CORTE_INICIAL_ACTOR_PREFIX,
  type ArqueoInicial,
  type CorteMovement,
} from "@/lib/caja/corte-inicial";
import { centsOf, fmtCents } from "@/lib/caja/import-caja";
import type { CashMethod, CashMovementType } from "@/lib/caja/cash-register";

const TAG = "[corte-inicial]";
const DEFAULT_ACTOR = "script:corte-inicial";

type Args = {
  tenant: string;
  dia: DayKey;
  arqueo: ArqueoInicial;
  nota: string;
  write: boolean;
  actor: string;
  rollback: boolean;
};

function usage(msg?: string): never {
  if (msg) console.error(`${TAG} ${msg}\n`);
  console.error(
    `Uso: npx tsx scripts/corte-inicial.ts --tenant <slug> --dia YYYY-MM-DD --efectivo N --mp N --tarjeta N ` +
      `--nota "<cómo se contó>" [--write] [--actor <actor>] [--rollback]`,
  );
  process.exit(1);
}

function parseMonto(flag: string, raw: string | null): number {
  if (raw === null) usage(`falta ${flag} <monto> (poné 0 si no hay nada en ese medio)`);
  const n = Number(raw.trim().replace(",", "."));
  if (!Number.isFinite(n) || n < 0) usage(`${flag} inválido: "${raw}" (número >= 0, punto decimal)`);
  return n;
}

function parseArgs(argv: string[]): Args {
  const val = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    if (i < 0) return null;
    const v = argv[i + 1];
    if (v === undefined || (v.startsWith("--") && !/^--?\d/.test(v))) usage(`${flag} necesita un valor`);
    return v;
  };
  const tenant = val("--tenant");
  const dia = val("--dia");
  if (!tenant) usage("falta --tenant <slug>");
  if (!dia || !isDayKey(dia)) usage(`falta o es inválido --dia YYYY-MM-DD (recibido: "${dia}")`);
  const rollback = argv.includes("--rollback");
  // En rollback los montos y la nota no hacen falta.
  const arqueo: ArqueoInicial = rollback
    ? { EFECTIVO: 0, MP: 0, TARJETA: 0 }
    : { EFECTIVO: parseMonto("--efectivo", val("--efectivo")), MP: parseMonto("--mp", val("--mp")), TARJETA: parseMonto("--tarjeta", val("--tarjeta")) };
  return {
    tenant,
    dia,
    arqueo,
    nota: (val("--nota") ?? "").trim(),
    write: argv.includes("--write"),
    actor: val("--actor") ?? DEFAULT_ACTOR,
    rollback,
  };
}

function fmt(n: number): string {
  return fmtCents(centsOf(n));
}
function lpad(s: string, n: number): string {
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}
function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function maskDbUrl(url: string | undefined): string {
  if (!url) return "(sin DATABASE_URL)";
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username ? u.username + "@" : ""}${u.host}${u.pathname}`;
  } catch {
    return "(DATABASE_URL ilegible)";
  }
}

type Tx = Parameters<Parameters<typeof tenantTransaction>[0]>[0];

// Igual que el importador: GUC de RLS siempre + lock consultivo por tenant.
async function scopeTx(tx: Tx, tenantId: string): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"corte-inicial:" + tenantId}))`;
}

// TODO el ledger del tenant, proyectado al dominio del corte. Se trae completo (no un
// groupBy) porque el corte informa cuántas filas absorbe, señala posteriores y, tras
// escribir, verifica el invariante fila a fila. ~1.100 filas para CH: trivial.
async function readLedger(tx: Tx, tenantId: string): Promise<CorteMovement[]> {
  const rows = await tx.cashMovement.findMany({
    where: { tenantId },
    select: { id: true, occurredAt: true, type: true, method: true, amount: true, reason: true, createdAt: true, createdBy: true },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    occurredAt: r.occurredAt,
    type: r.type as CashMovementType,
    method: r.method as CashMethod,
    amount: r.amount,
    detail: r.reason ?? "",
    createdAt: r.createdAt,
  }));
}

async function readMarcadas(tx: Tx, tenantId: string) {
  return tx.cashMovement.findMany({
    where: { tenantId, createdBy: { startsWith: CORTE_INICIAL_ACTOR_PREFIX } },
    select: { id: true, occurredAt: true, type: true, method: true, amount: true, reason: true, createdBy: true, orderId: true, sessionId: true },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
  });
}

// ── Rollback ───────────────────────────────────────────────────────────────

async function runRollback(args: Args, tenantId: string): Promise<void> {
  const marker = corteMarker(args.dia);
  const marcadas = await tenantTransaction(
    async (tx) => {
      await scopeTx(tx, tenantId);
      return readMarcadas(tx, tenantId);
    },
    { tenantId },
  );
  const deEsteDia = marcadas.filter((m) => m.createdBy === marker);
  const deOtroDia = marcadas.filter((m) => m.createdBy !== marker);
  console.log(`\n${TAG} ROLLBACK del corte ${args.dia} (marca ${marker}): ${deEsteDia.length} fila(s) en la base.`);
  for (const m of deEsteDia) {
    console.log(`    ${m.id} ${dateStrInBusinessTz(m.occurredAt)} ${m.type} ${pad(m.method, 8)} ${lpad(fmt(m.amount), 18)}  ${m.reason ?? ""}`);
  }
  if (deOtroDia.length > 0) {
    console.error(`${TAG} hay ${deOtroDia.length} fila(s) con marca de corte de OTRO día (${[...new Set(deOtroDia.map((m) => m.createdBy))].join(", ")}). Este rollback no las toca.`);
  }
  const raras = deEsteDia.filter((m) => m.orderId || m.sessionId || (m.type !== "INGRESO" && m.type !== "EGRESO"));
  if (raras.length > 0) {
    console.error(`${TAG} ${raras.length} fila(s) con la marca tienen pedido/turno/tipo inesperado — no se borra nada.`);
    process.exit(1);
  }
  if (deEsteDia.length === 0) return;
  if (!args.write) {
    console.log(`\n${TAG} DRY-RUN: no se borró nada. Para borrar de verdad: --rollback --write`);
    return;
  }
  // Aviso fuerte: si ya hay movimientos operativos (posteriores al corte), deshacer el
  // corte los deja colgando de un saldo derivado del histórico. El doc explica cuándo
  // corresponde rollback y cuándo corrección hacia adelante; acá sólo se avisa.
  const operativos = await basePrisma.cashMovement.count({
    where: { tenantId, occurredAt: { gte: businessWallTimeToUtc(nextDayKey(args.dia), "00:00") } },
  });
  if (operativos > 0) {
    console.error(`${TAG} AVISO: hay ${operativos} movimiento(s) posteriores al corte. Deshacerlo cambia el saldo del que parten. Se sigue porque pediste --write, pero leé docs/producto/corte-inicial-caja.md §"Si el corte salió mal".`);
  }
  const borradas = await tenantTransaction(
    async (tx) => {
      await scopeTx(tx, tenantId);
      const res = await tx.cashMovement.deleteMany({
        where: { tenantId, createdBy: marker, id: { in: deEsteDia.map((m) => m.id) }, orderId: null, sessionId: null },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actor: args.actor,
          action: "caja.corte-inicial.rollback",
          entity: "CashMovement",
          changes: { dia: args.dia, marker, borradas: res.count, ids: deEsteDia.map((m) => m.id), movimientosOperativosExistentes: operativos },
          channel: "admin",
        },
      });
      return res.count;
    },
    { tenantId },
  );
  const quedan = await basePrisma.cashMovement.count({ where: { tenantId, createdBy: marker } });
  console.log(`${TAG} ROLLBACK listo: ${borradas} fila(s) borradas; quedan ${quedan} con la marca.`);
  if (quedan !== 0) process.exit(1);
}

// ── Corte ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const marker = corteMarker(args.dia);
  const dayOf = (d: Date) => dateStrInBusinessTz(d);
  const finDelDia = businessWallTimeToUtc(args.dia, "23:59");

  console.log(`${TAG} ${args.write ? "MODO ESCRITURA" : "DRY-RUN (no escribe nada)"}`);
  console.log(`${TAG} base: ${maskDbUrl(process.env.DATABASE_URL)} · RLS_ENFORCEMENT=${RLS_ENFORCEMENT ? "on" : "off"} · zona ${BUSINESS_TIMEZONE}`);

  const tenant = await basePrisma.tenant.findUnique({ where: { slug: args.tenant }, select: { id: true, name: true, slug: true } });
  if (!tenant) {
    console.error(`${TAG} no existe un tenant con slug "${args.tenant}"`);
    process.exit(1);
  }
  const tenantId = tenant.id;
  console.log(`${TAG} tenant: ${tenant.slug} (${tenant.name}) id=${tenantId}`);
  console.log(`${TAG} día de corte: ${args.dia} (último día del histórico; los ajustes van a las 23:59 de ${BUSINESS_TIMEZONE} = ${finDelDia.toISOString()})`);

  if (args.rollback) {
    await runRollback(args, tenantId);
    return;
  }

  // 1. Ledger completo + estado del corte (¿ya hay uno?).
  const [ledger, marcadas, openSessions] = await tenantTransaction(
    async (tx) => {
      await scopeTx(tx, tenantId);
      return Promise.all([readLedger(tx, tenantId), readMarcadas(tx, tenantId), tx.cashSession.count({ where: { tenantId, status: "OPEN" } })]);
    },
    { tenantId },
  );
  // Sin `CashDayClose` todavía, el último cierre del tenant es el día del corte ya
  // hecho (si lo hay). Es lo que `validateCorteInicial` usa para negarse a un segundo corte.
  const lastClosedDay: DayKey | null =
    marcadas.length > 0 ? marcadas.map((m) => m.createdBy.slice(CORTE_INICIAL_ACTOR_PREFIX.length)).sort().at(-1)! : null;
  if (openSessions > 0) {
    console.log(`${TAG} aviso: hay ${openSessions} turno(s) de caja ABIERTO(S). El corte no se engancha a ningún turno (sessionId NULL).`);
  }

  // 2. Aritmética pura.
  const corte = buildCorteInicial({ day: args.dia, all: ledger, arqueo: args.arqueo, dayOf });
  const r = resumenCorte(corte);
  console.log(`\n${TAG} histórico absorbido: ${r.historicoCount} movimiento(s) hasta el ${r.dayLabel} inclusive · posteriores al corte ya cargados: ${r.posterioresAlCorte}`);
  console.log(`\n    ${pad("medio", 12)} ${lpad("histórico decía", 20)} ${lpad("se contó", 20)} ${lpad("desvío", 20)}`);
  for (const p of r.porMedio) {
    console.log(`    ${pad(p.label, 12)} ${lpad(fmt(p.historico), 20)} ${lpad(fmt(p.declarado), 20)} ${lpad(fmt(p.desvio), 20)}`);
  }
  console.log(`    ${pad("TOTAL", 12)} ${lpad(fmt(r.total.historico), 20)} ${lpad(fmt(r.total.declarado), 20)} ${lpad(fmt(r.total.desvio), 20)}`);
  console.log(`\n  AJUSTES que se asientan (${corte.ajustes.length}):`);
  if (corte.ajustes.length === 0) console.log("    (ninguno: el histórico coincide al centavo con lo contado)");
  for (const f of corteAsMovements(corte, finDelDia)) {
    console.log(`    ${f.id} ${f.type} ${pad(f.method, 8)} ${lpad(fmt(f.amount), 18)}  ${f.detail}`);
  }
  if (r.posterioresAlCorte > 0) {
    console.log(`\n${TAG} AVISO: ya hay ${r.posterioresAlCorte} movimiento(s) fechados DESPUÉS del ${r.dayLabel}. No entran al corte (son operativos), pero lo normal es cortar ANTES de cargar lo operativo. Revisalos.`);
  }

  // 3. Validación (misma que tendrá la pantalla).
  const v = validateCorteInicial(corte, { nota: args.nota, today: todayInBusinessTz(), lastClosedDay });
  if (!v.ok) {
    console.error(`\n${TAG} el corte NO es válido:`);
    for (const e of v.errors) console.error(`    · ${e}`);
    process.exit(2);
  }
  console.log(`\n${TAG} validación OK · nota: "${args.nota}"`);

  if (!args.write) {
    console.log(`\n${TAG} DRY-RUN: no se escribió nada. Para ejecutar el corte de verdad agregá --write.`);
    return;
  }

  // 4. Escritura: una transacción. Se RE-LEE adentro del lock que no haya corte previo.
  const filas = corteAsMovements(corte, finDelDia);
  const executedAt = new Date();
  await tenantTransaction(
    async (tx) => {
      await scopeTx(tx, tenantId);
      const yaHay = await tx.cashMovement.count({ where: { tenantId, createdBy: { startsWith: CORTE_INICIAL_ACTOR_PREFIX } } });
      if (yaHay > 0) throw new Error(`ya hay ${yaHay} fila(s) de corte en la base (carrera con otra corrida?). No se escribe nada.`);
      if (filas.length > 0) {
        const created = await tx.cashMovement.createMany({
          data: filas.map((f) => ({
            id: f.id,
            tenantId,
            sessionId: null,
            type: f.type,
            method: f.method,
            amount: f.amount,
            reason: f.detail,
            occurredAt: f.occurredAt,
            createdBy: marker,
          })),
        });
        if (created.count !== filas.length) throw new Error(`createMany insertó ${created.count} de ${filas.length}`);
      }
      await tx.auditLog.create({
        data: {
          tenantId,
          actor: args.actor,
          action: "caja.corte-inicial",
          entity: "CashMovement",
          changes: {
            dia: args.dia,
            marker,
            nota: args.nota,
            historicoCount: corte.historicoCount,
            posterioresAlCorte: corte.posterioresAlCorte,
            historico: corte.historico,
            declarado: corte.declarado,
            desvio: corte.desvio,
            ajustes: filas.map((f) => ({ id: f.id, type: f.type, method: f.method, amount: f.amount, detail: f.detail })),
            executedAt: executedAt.toISOString(),
          },
          channel: "admin",
        },
      });
    },
    { tenantId },
  );
  console.log(`\n${TAG} escrito: ${filas.length} ajuste(s) + AuditLog caja.corte-inicial.`);

  // 5. Verificación OBLIGATORIA del invariante contra la base.
  const despues = await tenantTransaction(
    async (tx) => {
      await scopeTx(tx, tenantId);
      return readLedger(tx, tenantId);
    },
    { tenantId },
  );
  const inv = verificarInvarianteCorte(despues, corte, { dayOf, executedAt: new Date(executedAt.getTime() - 1000) });
  console.log(`\n${TAG} VERIFICACIÓN: openingFromHistory(≤ ${args.dia}) = ` + (["EFECTIVO", "MP", "TARJETA"] as CashMethod[]).map((k) => `${k} ${fmt(inv.actual[k])}`).join(" · "));
  if (!inv.ok) {
    console.error(`${TAG} EL INVARIANTE NO CIERRA: desvío ${JSON.stringify(inv.desvio)}. El saldo operativo NO es el declarado. Revisar antes de seguir.`);
    process.exit(3);
  }
  console.log(`${TAG} OK: el saldo operativo desde el ${nextDayKey(args.dia)} es exactamente lo contado.`);
  console.log(`${TAG} pendiente de integración: congelar todo lo fechado ≤ ${args.dia} en las acciones del libro (isFrozenDay) — hasta entonces, nadie carga nada con fecha anterior al corte.`);
}

main()
  .catch((err) => {
    console.error(`${TAG} error:`, err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await basePrisma.$disconnect().catch(() => undefined);
  });
