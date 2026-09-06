// Importador del HISTÓRICO DE CAJA de un tenant desde el CSV consolidado de sus planillas.
//
// Carga filas en `CashMovement` (el mismo ledger que lee el Libro de Caja y el arqueo de
// turno) con el MISMO criterio de fecha que la carga manual: `occurredAt` anclado al
// mediodía de la zona del negocio (src/lib/libro-caja-actions.ts, `addLibroEntry`). Si
// no, las filas importadas caerían en otro día que las tipeadas a mano.
//
// Uso (DRY-RUN por default — no escribe nada sin `--write`):
//   DATABASE_URL=... npx tsx scripts/import-caja-historica.ts --tenant <slug> --csv <ruta.csv>
//   ... --write                       escribe de verdad
//   ... --dudoso excluir|incluir      qué hacer con confianza=dudoso (default: excluir)
//   ... --skip-rejected               con --write, sigue aunque haya filas inválidas (se omiten)
//   ... --batch-size 250              filas por transacción
//   ... --actor "user:<id>"           quién corre la importación (queda en AuditLog)
//   ... --rollback [--write]          deshace la importación de ESTE csv (borra por marca)
//
// GARANTÍAS
//   * Idempotente: clave natural por multiconjunto (ver src/lib/caja/import-caja.ts). La
//     segunda corrida inserta 0. Además cada fila lleva un id determinístico (csv+línea):
//     ni una carrera de dos corridas del mismo archivo puede duplicarla (PK).
//   * Scoped por tenant y RLS: todo dentro de `tenantTransaction` con el tenant explícito
//     (con RLS_ENFORCEMENT=on setea el GUC; acá se setea igual, por las dudas), y todas
//     las queries filtran por tenantId de todos modos.
//   * Transaccional por lote + lock consultivo por tenant: un fallo a mitad de un lote no
//     deja ese lote a medias; los lotes ya commiteados quedan, y volver a correr retoma
//     sin duplicar (idempotencia). Dos importadores a la vez se serializan.
//   * Reconciliación obligatoria al final: relee la base y compara mes × medio × tipo con
//     el CSV. Si no cierra al centavo, sale con código 3 y lo grita.
//   * Auditoría: AuditLog por lote + entrada de cierre con la decisión sobre `dudoso`, los
//     rechazos, el hash del CSV y la reconciliación. Mapeo fila a fila (id ↔ origen) en un
//     reporte JSON al lado del CSV (la pantalla de auditoría pinta `changes` inline; un
//     blob de 2000 filas la haría ilegible).
//   * `sessionId` SIEMPRE NULL: el histórico no pertenece a ningún turno de mostrador;
//     engancharlo a un turno abierto inflaría el efectivo esperado del arqueo.
//
// Códigos de salida: 0 ok · 1 error · 2 entrada inválida (rechazos sin --skip-rejected) ·
// 3 reconciliación no cierra.

import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { basePrisma, RLS_ENFORCEMENT } from "@/lib/prisma-base";
import { tenantTransaction } from "@/lib/rls";
import { businessWallTimeToUtc, dateStrInBusinessTz } from "@/lib/datetime";
import { BUSINESS_TIMEZONE } from "@/lib/business-config";
import {
  parseCajaCsv,
  applyDudosoPolicy,
  planImport,
  dedupKey,
  aggregate,
  reconcile,
  coveredByCsv,
  importMarker,
  importRowId,
  centsOf,
  fmtCents,
  IMPORT_TYPES,
  type DudosoPolicy,
  type ExistingRow,
  type ImportRow,
  type Aggregate,
  type ReconcileDiff,
} from "@/lib/caja/import-caja";

const TAG = "[import-caja]";
const DEFAULT_ACTOR = "script:import-caja-historica";

type Args = {
  tenant: string;
  csv: string;
  write: boolean;
  dudoso: DudosoPolicy;
  skipRejected: boolean;
  batchSize: number;
  actor: string;
  rollback: boolean;
  report: string | null;
};

function usage(msg?: string): never {
  if (msg) console.error(`${TAG} ${msg}\n`);
  console.error(
    `Uso: npx tsx scripts/import-caja-historica.ts --tenant <slug> --csv <ruta> [--write] ` +
      `[--dudoso excluir|incluir] [--skip-rejected] [--batch-size N] [--actor <actor>] [--rollback] [--report <ruta>]`,
  );
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const val = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    if (i < 0) return null;
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) usage(`${flag} necesita un valor`);
    return v;
  };
  const tenant = val("--tenant");
  const csv = val("--csv");
  if (!tenant) usage("falta --tenant <slug>");
  if (!csv) usage("falta --csv <ruta>");
  const dudosoRaw = val("--dudoso") ?? "excluir";
  if (dudosoRaw !== "excluir" && dudosoRaw !== "incluir") usage(`--dudoso inválido: "${dudosoRaw}"`);
  const batchRaw = val("--batch-size");
  const batchSize = batchRaw === null ? 250 : Number(batchRaw);
  if (!Number.isInteger(batchSize) || batchSize <= 0 || batchSize > 1000) usage(`--batch-size inválido: "${batchRaw}"`);
  return {
    tenant,
    csv,
    write: argv.includes("--write"),
    dudoso: dudosoRaw,
    skipRejected: argv.includes("--skip-rejected"),
    batchSize,
    actor: val("--actor") ?? DEFAULT_ACTOR,
    rollback: argv.includes("--rollback"),
    report: val("--report"),
  };
}

// ── Helpers de presentación ────────────────────────────────────────────────

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}
function lpad(s: string, n: number): string {
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}

// Tabla mes × medio con ingresos / egresos / neto, a partir de un agregado.
function printAggTable(title: string, agg: Aggregate): void {
  const months = new Set<string>();
  for (const k of agg.keys()) months.add(k.split("|")[0]);
  console.log(`\n  ${title}`);
  if (months.size === 0) {
    console.log("    (sin filas)");
    return;
  }
  console.log(
    `    ${pad("mes", 8)} ${pad("medio", 9)} ${lpad("ingresos", 18)} ${lpad("egresos", 18)} ${lpad("neto", 18)}`,
  );
  let tIn = 0;
  let tOut = 0;
  for (const m of [...months].sort()) {
    for (const method of ["EFECTIVO", "MP", "TARJETA"]) {
      const inC = agg.get(`${m}|${method}|INGRESO`) ?? 0;
      const outC = agg.get(`${m}|${method}|EGRESO`) ?? 0;
      if (inC === 0 && outC === 0) continue;
      tIn += inC;
      tOut += outC;
      console.log(
        `    ${pad(m, 8)} ${pad(method, 9)} ${lpad(fmtCents(inC), 18)} ${lpad(fmtCents(outC), 18)} ${lpad(fmtCents(inC - outC), 18)}`,
      );
    }
  }
  console.log(
    `    ${pad("TOTAL", 8)} ${pad("", 9)} ${lpad(fmtCents(tIn), 18)} ${lpad(fmtCents(tOut), 18)} ${lpad(fmtCents(tIn - tOut), 18)}`,
  );
}

function printDiffs(diffs: ReconcileDiff[]): void {
  console.log(`    ${pad("mes|medio|tipo", 26)} ${lpad("CSV", 18)} ${lpad("BASE", 18)} ${lpad("dif", 18)}`);
  for (const d of diffs) {
    console.log(
      `    ${pad(d.key, 26)} ${lpad(fmtCents(d.csvCents), 18)} ${lpad(fmtCents(d.dbCents), 18)} ${lpad(fmtCents(d.dbCents - d.csvCents), 18)}`,
    );
  }
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

// ── Acceso a datos ─────────────────────────────────────────────────────────

type Tx = Parameters<Parameters<typeof tenantTransaction>[0]>[0];

// Cinturón y tiradores: `tenantTransaction` setea el GUC sólo con RLS_ENFORCEMENT=on.
// Si alguien corre esto con el rol `app_rls` pero sin el flag, sin GUC la policy no deja
// ver ni insertar nada — mejor setearlo siempre (con el flag on es un no-op repetido).
async function scopeTx(tx: Tx, tenantId: string): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
  // Serializa importadores concurrentes sobre el mismo tenant (se libera al commit).
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"import-caja:" + tenantId}))`;
}

// Lee de la base todo lo que puede colisionar con el CSV: los INGRESO/EGRESO del tenant
// en el rango de fechas del CSV, más cualquier fila con la marca de este CSV (para
// detectar huérfanas de una versión anterior). Proyectado al espacio de claves del CSV.
async function readExisting(
  tx: Tx,
  tenantId: string,
  marker: string,
  range: { start: Date; end: Date } | null,
): Promise<ExistingRow[]> {
  const rows = await tx.cashMovement.findMany({
    where: {
      tenantId,
      OR: [
        ...(range
          ? [{ occurredAt: { gte: range.start, lt: range.end }, type: { in: [...IMPORT_TYPES] } }]
          : []),
        { createdBy: marker },
      ],
    },
    select: { id: true, occurredAt: true, type: true, method: true, amount: true, reason: true, createdBy: true },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    createdBy: r.createdBy,
    fecha: dateStrInBusinessTz(r.occurredAt),
    type: r.type,
    method: r.method,
    cents: centsOf(r.amount),
    detail: (r.reason ?? "").replace(/\s+/g, " ").trim(),
  }));
}

function dateRangeOf(rows: readonly ImportRow[]): { start: Date; end: Date; min: string; max: string } | null {
  if (rows.length === 0) return null;
  let min = rows[0].fecha;
  let max = rows[0].fecha;
  for (const r of rows) {
    if (r.fecha < min) min = r.fecha;
    if (r.fecha > max) max = r.fecha;
  }
  // [min 00:00, max+1día 00:00) en hora de pared del negocio.
  const maxNext = new Date(`${max}T12:00:00.000Z`);
  maxNext.setUTCDate(maxNext.getUTCDate() + 1);
  return {
    min,
    max,
    start: businessWallTimeToUtc(min, "00:00"),
    end: businessWallTimeToUtc(maxNext.toISOString().slice(0, 10), "00:00"),
  };
}

function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ── Rollback: deshacer la importación de ESTE csv (por marca) ──────────────

async function runRollback(args: Args, tenantId: string, marker: string): Promise<void> {
  const rows = await tenantTransaction(
    async (tx) => {
      await scopeTx(tx, tenantId);
      return tx.cashMovement.findMany({
        where: { tenantId, createdBy: marker },
        select: { id: true, occurredAt: true, type: true, method: true, amount: true, orderId: true, sessionId: true },
        orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      });
    },
    { tenantId },
  );
  const agg = aggregate(
    rows.map((r) => ({ fecha: dateStrInBusinessTz(r.occurredAt), type: r.type, method: r.method, cents: centsOf(r.amount), detail: "" })),
  );
  console.log(`\n${TAG} ROLLBACK de la marca ${marker}: ${rows.length} fila(s) en la base.`);
  printAggTable("Se borraría:", agg);
  // Sólo se borra lo que este importador puede haber creado. Si algo con la marca tiene
  // pedido o turno, alguien lo tocó a mano: se frena y se avisa.
  const raras = rows.filter((r) => r.orderId || r.sessionId || !(IMPORT_TYPES as readonly string[]).includes(r.type));
  if (raras.length > 0) {
    console.error(`${TAG} ${raras.length} fila(s) con la marca tienen pedido/turno/tipo no importable — no se borra nada:`);
    for (const r of raras) console.error(`    ${r.id} type=${r.type} orderId=${r.orderId} sessionId=${r.sessionId}`);
    process.exit(1);
  }
  if (!args.write) {
    console.log(`\n${TAG} DRY-RUN: no se borró nada. Para borrar de verdad: --rollback --write`);
    return;
  }
  let borradas = 0;
  for (const lote of chunk(rows, args.batchSize)) {
    const n = await tenantTransaction(
      async (tx) => {
        await scopeTx(tx, tenantId);
        const res = await tx.cashMovement.deleteMany({
          where: { tenantId, createdBy: marker, id: { in: lote.map((r) => r.id) }, orderId: null, sessionId: null },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            actor: args.actor,
            action: "libro.import.rollback",
            entity: "CashMovement",
            changes: { marker, borradas: res.count, ids: lote.map((r) => r.id) },
            channel: "admin",
          },
        });
        return res.count;
      },
      { tenantId },
    );
    borradas += n;
    console.log(`${TAG} lote borrado: ${n} fila(s)`);
  }
  const quedan = await basePrisma.cashMovement.count({ where: { tenantId, createdBy: marker } });
  console.log(`${TAG} ROLLBACK listo: ${borradas} fila(s) borradas; quedan ${quedan} con la marca.`);
  if (quedan !== 0) process.exit(1);
}

// ── Importación ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const csvPath = resolvePath(args.csv);
  const csvBuf = readFileSync(csvPath);
  const csvSha256 = createHash("sha256").update(csvBuf).digest("hex");
  const sha8 = csvSha256.slice(0, 8);
  const marker = importMarker(sha8);
  const startedAt = new Date();

  console.log(`${TAG} ${args.write ? "MODO ESCRITURA" : "DRY-RUN (no escribe nada)"}`);
  console.log(`${TAG} base: ${maskDbUrl(process.env.DATABASE_URL)} · RLS_ENFORCEMENT=${RLS_ENFORCEMENT ? "on" : "off"} · zona ${BUSINESS_TIMEZONE}`);
  console.log(`${TAG} csv: ${csvPath} (${csvBuf.length} bytes, sha256 ${csvSha256})`);
  console.log(`${TAG} marca de importación (createdBy): ${marker}`);

  const tenant = await basePrisma.tenant.findUnique({ where: { slug: args.tenant }, select: { id: true, name: true, slug: true } });
  if (!tenant) {
    console.error(`${TAG} no existe un tenant con slug "${args.tenant}"`);
    process.exit(1);
  }
  const tenantId = tenant.id;
  console.log(`${TAG} tenant: ${tenant.slug} (${tenant.name}) id=${tenantId}`);

  if (args.rollback) {
    await runRollback(args, tenantId, marker);
    return;
  }

  // 1. Parseo + validación (puro).
  const { rows: parsed, rejected } = parseCajaCsv(csvBuf.toString("utf8"));
  const { kept, dudosoExcluded } = applyDudosoPolicy(parsed, args.dudoso);
  const dudosoTotal = parsed.filter((r) => r.confianza === "dudoso").length;
  console.log(
    `\n${TAG} CSV: ${parsed.length + rejected.length} fila(s) de datos · válidas ${parsed.length} · rechazadas ${rejected.length} · ` +
      `dudosas ${dudosoTotal} (política: ${args.dudoso} → ${dudosoExcluded.length} excluidas)`,
  );
  if (rejected.length > 0) {
    console.log(`\n  RECHAZADAS (no se importan):`);
    for (const r of rejected) console.log(`    línea ${r.line}: ${r.reason}  ← ${JSON.stringify(r.raw.slice(0, 5))}`);
    if (args.write && !args.skipRejected) {
      console.error(`\n${TAG} hay filas inválidas y no se pasó --skip-rejected: no se escribe nada. Corregí el CSV o pasá --skip-rejected.`);
      process.exit(2);
    }
  }
  if (dudosoExcluded.length > 0) {
    console.log(`\n  DUDOSAS EXCLUIDAS (--dudoso excluir):`);
    for (const r of dudosoExcluded) {
      console.log(`    línea ${r.line}: ${r.fecha} ${r.type} ${r.method} ${fmtCents(r.cents)} "${r.detail}" [${r.origen.archivo}/${r.origen.hoja}/${r.origen.fila}] ${r.nota}`);
    }
  }
  if (kept.length === 0) {
    console.log(`\n${TAG} nada para importar.`);
    return;
  }

  const range = dateRangeOf(kept)!;
  console.log(`\n${TAG} rango contable del CSV: ${range.min} → ${range.max} (occurredAt anclado a las 12:00 de ${BUSINESS_TIMEZONE})`);

  // 2. Estado actual de la base y plan (multiconjunto CSV − DB).
  const [existingBefore, openSessions] = await tenantTransaction(
    async (tx) => {
      await scopeTx(tx, tenantId);
      return Promise.all([
        readExisting(tx, tenantId, marker, range),
        tx.cashSession.count({ where: { tenantId, status: "OPEN" } }),
      ]);
    },
    { tenantId },
  );
  if (openSessions > 0) {
    console.log(`${TAG} aviso: hay ${openSessions} turno(s) de caja ABIERTO(S). Las filas importadas NO se enganchan a ningún turno (sessionId NULL): el arqueo no las ve, el libro sí.`);
  }
  const plan = planImport(kept, existingBefore, marker);
  console.log(
    `\n${TAG} PLAN: insertar ${plan.toInsert.length} · ya existentes ${plan.alreadyExisting.length} · ` +
      `rechazadas ${rejected.length} · dudosas excluidas ${dudosoExcluded.length} · huérfanas con marca ${plan.orphanMarked.length}`,
  );
  console.log(`${TAG} filas INGRESO/EGRESO ya en la base dentro del rango: ${existingBefore.filter((e) => e.createdBy !== marker).length} (de otras cargas) + ${existingBefore.filter((e) => e.createdBy === marker).length} (de este CSV)`);
  printAggTable("A INSERTAR — por mes y medio:", aggregate(plan.toInsert));
  if (plan.alreadyExisting.length > 0) printAggTable("YA EXISTENTES (se omiten) — por mes y medio:", aggregate(plan.alreadyExisting));
  printAggTable("CSV COMPLETO (válidas, sin dudosas excluidas) — por mes y medio:", aggregate(kept));
  if (plan.orphanMarked.length > 0) {
    console.log(`\n  HUÉRFANAS: filas con la marca ${marker} cuya clave YA NO está en el CSV (versión anterior del archivo?). No se tocan; revisá y borrá a mano o con --rollback:`);
    for (const e of plan.orphanMarked) console.log(`    ${e.id} ${e.fecha} ${e.type} ${e.method} ${fmtCents(e.cents)} "${e.detail}"`);
  }

  if (!args.write) {
    const diffs = reconcile(aggregate(kept), aggregate(coveredByCsv(kept, existingBefore)));
    console.log(`\n${TAG} estado actual vs CSV (lo que falta cargar): ${diffs.length === 0 ? "la base YA cubre todo el CSV" : `${diffs.length} celda(s) mes×medio×tipo con diferencia`}`);
    if (diffs.length > 0) printDiffs(diffs);
    console.log(`\n${TAG} DRY-RUN: no se escribió nada. Para importar de verdad agregá --write.`);
    return;
  }

  // 3. Escritura por lotes. Dentro de cada transacción se RE-LEE la base para las claves
  //    del lote y se replanifica: el plan de afuera es informativo; el que manda es el de
  //    adentro del lock (una corrida concurrente o una carga manual entre medio no puede
  //    producir un duplicado).
  const inserted: { id: string; row: ImportRow }[] = [];
  const lotes = chunk(plan.toInsert, args.batchSize);
  console.log(`\n${TAG} escribiendo ${plan.toInsert.length} fila(s) en ${lotes.length} lote(s) de hasta ${args.batchSize}…`);
  for (let i = 0; i < lotes.length; i++) {
    const lote = lotes[i];
    const loteLines = new Set(lote.map((r) => r.line));
    const loteKeys = new Set(lote.map(dedupKey));
    const loteRange = dateRangeOf(lote)!;
    const res = await tenantTransaction(
      async (tx) => {
        await scopeTx(tx, tenantId);
        const existingNow = await readExisting(tx, tenantId, marker, loteRange);
        const rowsForKeys = kept.filter((r) => loteKeys.has(dedupKey(r)));
        const replan = planImport(rowsForKeys, existingNow, marker);
        const toInsert = replan.toInsert.filter((r) => loteLines.has(r.line));
        if (toInsert.length === 0) return { count: 0, ids: [] as { id: string; row: ImportRow }[] };
        const data = toInsert.map((r) => ({
          id: importRowId(sha8, r.line),
          tenantId,
          sessionId: null,
          type: r.type,
          method: r.method,
          amount: r.amount,
          reason: r.detail,
          occurredAt: businessWallTimeToUtc(r.fecha, "12:00"),
          createdBy: marker,
        }));
        const created = await tx.cashMovement.createMany({ data });
        if (created.count !== data.length) {
          throw new Error(`lote ${i + 1}: createMany insertó ${created.count} de ${data.length}`);
        }
        await tx.auditLog.create({
          data: {
            tenantId,
            actor: args.actor,
            action: "libro.import",
            entity: "CashMovement",
            changes: {
              marker,
              csvSha256,
              lote: i + 1,
              deLotes: lotes.length,
              insertadas: created.count,
              lineasCsv: { desde: toInsert[0].line, hasta: toInsert[toInsert.length - 1].line },
              fechas: { desde: loteRange.min, hasta: loteRange.max },
              centavos: toInsert.reduce((a, r) => a + r.cents, 0),
            },
            channel: "admin",
          },
        });
        return { count: created.count, ids: data.map((d, k) => ({ id: d.id, row: toInsert[k] })) };
      },
      { tenantId },
    );
    inserted.push(...res.ids);
    const ajuste = res.count !== lote.length ? ` (plan decía ${lote.length}: la base cambió entre el plan y el lote)` : "";
    console.log(`${TAG} lote ${i + 1}/${lotes.length}: ${res.count} insertada(s)${ajuste}`);
  }

  // 4. Reconciliación OBLIGATORIA: relee la base y compara con el CSV al centavo.
  const existingAfter = await tenantTransaction(
    async (tx) => {
      await scopeTx(tx, tenantId);
      return readExisting(tx, tenantId, marker, range);
    },
    { tenantId },
  );
  const csvAgg = aggregate(kept);
  const covered = coveredByCsv(kept, existingAfter);
  const diffs = reconcile(csvAgg, aggregate(covered));
  const noCubiertas = existingAfter.length - covered.length;
  printAggTable("RECONCILIACIÓN — la base, cubierta por el CSV (mes × medio):", aggregate(covered));
  console.log(`\n${TAG} filas INGRESO/EGRESO en la base dentro del rango: ${existingAfter.length} · cubiertas por el CSV: ${covered.length} · otras (manuales / otro CSV): ${noCubiertas}`);
  if (noCubiertas > 0) {
    printAggTable("OTRAS filas de la base en el rango (NO vienen del CSV, informativo):", aggregate(existingAfter.filter((e) => !covered.includes(e))));
  }

  const finishedAt = new Date();
  const reporte = {
    tenant: { id: tenantId, slug: tenant.slug },
    csv: { path: csvPath, sha256: csvSha256, bytes: csvBuf.length },
    marker,
    actor: args.actor,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    politicaDudoso: args.dudoso,
    resumen: {
      filasCsv: parsed.length + rejected.length,
      validas: parsed.length,
      rechazadas: rejected.length,
      dudosasTotal: dudosoTotal,
      dudosasExcluidas: dudosoExcluded.length,
      planInsertar: plan.toInsert.length,
      insertadas: inserted.length,
      yaExistentes: plan.alreadyExisting.length,
      huerfanasConMarca: plan.orphanMarked.length,
      reconciliacion: diffs.length === 0 ? "OK" : "FALLA",
    },
    rechazadas: rejected.map((r) => ({ linea: r.line, motivo: r.reason })),
    dudosasExcluidas: dudosoExcluded.map((r) => ({ linea: r.line, origen: r.origen, fecha: r.fecha, tipo: r.type, medio: r.method, monto: r.amount, detalle: r.detail, nota: r.nota })),
    diferencias: diffs,
    insertadas: inserted.map(({ id, row }) => ({ id, linea: row.line, origen: row.origen, fecha: row.fecha, tipo: row.type, medio: row.method, monto: row.amount, confianza: row.confianza })),
    yaExistentes: plan.alreadyExisting.map((r) => ({ linea: r.line, origen: r.origen, fecha: r.fecha, tipo: r.type, medio: r.method, monto: r.amount })),
  };
  const reportPath = args.report ? resolvePath(args.report) : `${csvPath}.import-${sha8}-${startedAt.toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(reportPath, JSON.stringify(reporte, null, 2));
  console.log(`${TAG} reporte fila a fila: ${reportPath}`);

  // Entrada de cierre en AuditLog: la decisión sobre dudosas, los rechazos y el veredicto
  // de la reconciliación quedan en la base, junto a los movimientos.
  await tenantTransaction(
    async (tx) => {
      await scopeTx(tx, tenantId);
      await tx.auditLog.create({
        data: {
          tenantId,
          actor: args.actor,
          action: diffs.length === 0 ? "libro.import.cierre" : "libro.import.cierre.FALLA",
          entity: "CashMovement",
          changes: {
            marker,
            csvSha256,
            csvPath,
            politicaDudoso: args.dudoso,
            resumen: reporte.resumen,
            rechazadasLineas: rejected.map((r) => r.line),
            dudosasExcluidasLineas: dudosoExcluded.map((r) => r.line),
            diferencias: diffs,
            reporte: reportPath,
          },
          channel: "admin",
        },
      });
    },
    { tenantId },
  );

  if (diffs.length > 0) {
    console.error(`\n${TAG} ✖ RECONCILIACIÓN FALLÓ: ${diffs.length} celda(s) mes×medio×tipo no cierran al centavo entre el CSV y la base:`);
    printDiffs(diffs);
    console.error(`${TAG} NO des por cargada la caja. Revisá el reporte y el AuditLog (libro.import.cierre.FALLA). Para deshacer este CSV: --rollback --write`);
    process.exit(3);
  }
  console.log(`\n${TAG} ✔ RECONCILIACIÓN OK: la base cubre el CSV al centavo (${covered.length} fila(s), ${csvAgg.size} celda(s) mes×medio×tipo).`);
  console.log(`${TAG} listo: ${inserted.length} insertada(s), ${plan.alreadyExisting.length} ya estaban, ${dudosoExcluded.length} dudosas excluidas, ${rejected.length} rechazadas.`);
}

if (process.argv[1] && /import-caja-historica\.ts$/.test(process.argv[1])) {
  main()
    .catch((e) => {
      console.error(`${TAG} error:`, e);
      process.exitCode = 1;
    })
    .finally(() => basePrisma.$disconnect());
}
