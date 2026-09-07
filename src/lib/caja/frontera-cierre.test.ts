import test from "node:test";
import assert from "node:assert/strict";
import { maxDay, CIERRE_DIARIO_ENTITY } from "./frontera-cierre";
import { PURGE_EXEMPT_ENTITY, purgeAuditLogs } from "@/lib/audit-retention";
import { CIERRE_DIARIO_ACTOR_PREFIX, cierreMarker, esAjusteDeCierre } from "./cierre-marca";
import { isFrozenDay } from "./cierre-diario";

// ── La frontera se toma de la fuente más nueva ───────────────────────────────

test("gana el día más grande entre el corte inicial y el último cierre", () => {
  assert.equal(maxDay("2026-09-01", "2026-09-06"), "2026-09-06");
  assert.equal(maxDay("2026-09-06", "2026-09-01"), "2026-09-06");
});

test("si sólo hay una fuente, esa manda", () => {
  assert.equal(maxDay("2026-09-01", null), "2026-09-01");
  assert.equal(maxDay(null, "2026-09-01"), "2026-09-01");
});

test("sin ninguna fuente no hay congelamiento", () => {
  assert.equal(maxDay(null, null), null);
  assert.equal(isFrozenDay("2026-09-06", null), false);
});

test("basura en la marca no congela nada (fail-open a propósito: mejor dejar operar que trabar la caja por un dato roto)", () => {
  assert.equal(maxDay("no-es-un-dia", null), null);
  assert.equal(maxDay("2026-13-45", "2026-09-01"), "2026-09-01");
});

// ── La marca de los ajustes ──────────────────────────────────────────────────

test("el ajuste de un cierre se reconoce por su marca", () => {
  const marca = cierreMarker("2026-09-06");
  assert.equal(marca, `${CIERRE_DIARIO_ACTOR_PREFIX}2026-09-06`);
  assert.equal(esAjusteDeCierre({ createdBy: marca }), true);
  assert.equal(esAjusteDeCierre({ createdBy: "user:abc" }), false);
  assert.equal(esAjusteDeCierre({ createdBy: null }), false);
});

// ── Lo que hace que todo esto no se pierda ───────────────────────────────────
//
// La frontera vive en AuditLog. Si la purga de retención la borrara, un día cerrado
// hace 18 meses volvería a aceptar movimientos. Estos dos tests son el candado.

test("la entidad exenta de la purga es exactamente la del cierre", () => {
  assert.equal(PURGE_EXEMPT_ENTITY, CIERRE_DIARIO_ENTITY);
});

test("la purga excluye las filas del cierre diario", async () => {
  const vistos: unknown[] = [];
  const fake = {
    auditLog: {
      count: async (a: unknown) => {
        vistos.push(a);
        return 7;
      },
      deleteMany: async (a: unknown) => {
        vistos.push(a);
        return { count: 7 };
      },
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seco = await purgeAuditLogs(fake as any, { dryRun: true });
  assert.equal(seco.dryRun, true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await purgeAuditLogs(fake as any, { dryRun: false });

  assert.equal(vistos.length, 2);
  for (const v of vistos) {
    const where = (v as { where: Record<string, unknown> }).where;
    assert.deepEqual(
      where.entity,
      { not: CIERRE_DIARIO_ENTITY },
      "la purga tiene que excluir el cierre diario: si no, se pierde la frontera de congelamiento",
    );
    assert.ok(where.createdAt, "la purga sigue acotada por fecha");
  }
});
