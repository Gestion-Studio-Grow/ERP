// GSG-MIA-004 · T3 — horas y mano de obra del taller.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  costoManoObraReal,
  costoManoObraTeorico,
  desvio,
  horasReales,
  horasTeoricas,
  leerFecha,
  personaDelNegocio,
  validarHoras,
  validarValorHora,
  valorHoraReferencia,
  valorHoraVigente,
} from "./horas";

const f = (s: string) => new Date(`${s}T00:00:00Z`);

test("valor hora vigente: el más reciente que no sea posterior a la fecha", () => {
  const valores = [
    { valorHora: 5000, vigenteDesde: f("2026-01-01") },
    { valorHora: 6500, vigenteDesde: f("2026-07-01") },
    { valorHora: 8000, vigenteDesde: f("2026-12-01") },
  ];
  assert.equal(valorHoraVigente(valores, f("2026-03-15")), 5000);
  assert.equal(valorHoraVigente(valores, f("2026-07-01")), 6500); // el mismo día ya rige
  assert.equal(valorHoraVigente(valores, new Date("2026-07-01T23:59:00Z")), 6500);
  assert.equal(valorHoraVigente(valores, f("2026-11-30")), 6500);
  assert.equal(valorHoraVigente(valores, f("2027-01-01")), 8000);
  assert.equal(valorHoraVigente(valores, f("2025-12-31")), null); // antes del primero: no hay
  assert.equal(valorHoraVigente([], f("2026-01-01")), null);
  assert.equal(valorHoraVigente(valores, new Date("x")), null);
});

test("costo real: suma de horas × valor congelado", () => {
  const cargas = [
    { horas: 8, valorHoraSnap: 5000 },
    { horas: 2.5, valorHoraSnap: 6500.5 },
  ];
  assert.equal(costoManoObraReal(cargas), 56251.25);
  assert.equal(horasReales(cargas), 10.5);
  assert.equal(costoManoObraReal([]), 0);
});

test("teórico: horas estándar del despiece × promedio de los vigentes (provisional)", () => {
  const hs = horasTeoricas([
    { cantidad: 4, horasStd: 1.5 },
    { cantidad: 2, horasStd: 0 },
    { cantidad: 1, horasStd: 3 },
  ]);
  assert.equal(hs, 9);
  const ref = valorHoraReferencia([5000, 7000, null, NaN, 0]);
  assert.equal(ref, 6000);
  assert.equal(costoManoObraTeorico(hs, ref), 54000);
  assert.equal(valorHoraReferencia([]), null);
  assert.equal(costoManoObraTeorico(hs, null), null);
});

test("desvío: real − teórico, con porcentaje sobre el teórico", () => {
  assert.deepEqual(desvio(54000, 56251.25), { monto: 2251.25, pct: 4.2 });
  assert.deepEqual(desvio(54000, 27000), { monto: -27000, pct: -50 });
  assert.deepEqual(desvio(0, 1000), { monto: 1000, pct: null });
});

test("validaciones: horas > 0 y ≤ 24, sin NaN ni negativos", () => {
  assert.deepEqual(validarHoras(8), { ok: true, horas: 8 });
  assert.deepEqual(validarHoras(24), { ok: true, horas: 24 });
  for (const malo of [0, -1, 24.01, NaN, Infinity]) assert.equal(validarHoras(malo).ok, false, String(malo));
  assert.deepEqual(validarValorHora(5000), { ok: true, valor: 5000 });
  for (const malo of [0, -5, NaN, Infinity]) assert.equal(validarValorHora(malo).ok, false, String(malo));
});

test("fecha del formulario: AAAA-MM-DD válida o null", () => {
  assert.equal(leerFecha("2026-11-09")?.toISOString(), "2026-11-09T00:00:00.000Z");
  assert.equal(leerFecha("2026-02-30"), null);
  assert.equal(leerFecha("09/11/2026"), null);
  assert.equal(leerFecha(""), null);
});

test("aislamiento: un personaId de otro negocio no pasa el filtro", () => {
  const delNegocio = [{ id: "p-ale-1" }, { id: "p-ale-2" }];
  assert.equal(personaDelNegocio("p-ale-1", delNegocio), true);
  assert.equal(personaDelNegocio("p-mia-1", delNegocio), false); // persona de la productora
  assert.equal(personaDelNegocio("", delNegocio), false);
  assert.equal(personaDelNegocio("p-ale-1", []), false);
});

test("migración T3: FKs compuestas (persona y proyecto del mismo negocio) y RLS forzada en las dos tablas", async () => {
  const { readFileSync } = await import("node:fs");
  const sql = readFileSync(new URL("../../../prisma/migrations/20261109140000_taller_horas/migration.sql", import.meta.url), "utf8");
  for (const t of ["TallerValorHora", "TallerHora"]) {
    assert.match(sql, new RegExp(`FOREIGN KEY \\("personaId", "tenantId"\\) REFERENCES "ProyectoPersona"\\("id", "tenantId"\\)[^;]*;`));
    assert.ok(sql.includes(`ALTER TABLE "${t}" FORCE ROW LEVEL SECURITY;`), t);
    assert.ok(sql.includes(`CREATE POLICY tenant_isolation ON "${t}"`), t);
  }
  assert.ok(sql.includes(`"TallerHora_personaId_tenantId_fkey" FOREIGN KEY ("personaId", "tenantId")`));
  assert.ok(sql.includes(`"TallerValorHora_personaId_tenantId_fkey" FOREIGN KEY ("personaId", "tenantId")`));
  assert.ok(sql.includes(`FOREIGN KEY ("proyectoId", "tenantId") REFERENCES "Proyecto"("id", "tenantId")`));
  assert.ok(!/ALTER TABLE "ProyectoPersona"/.test(sql), "ProyectoPersona no se toca");
});
