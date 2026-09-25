// El formulario de límites de la consola y el trinquete de quién escribe el plan (R2-F4).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { leerValorDeLimite, VALOR_SIN_TOPE } from "./plan-formulario";
import { TOPE_MAXIMO } from "@/planes/limites";

test("vacío vuelve al tope del plan", () => {
  assert.deepEqual(leerValorDeLimite(""), { ok: true, quitar: true });
  assert.deepEqual(leerValorDeLimite("   "), { ok: true, quitar: true });
});

test("«sin-tope» deja el límite sin tope", () => {
  assert.deepEqual(leerValorDeLimite(VALOR_SIN_TOPE), { ok: true, quitar: false, tope: null });
  assert.deepEqual(leerValorDeLimite(" Sin Tope "), { ok: true, quitar: false, tope: null });
});

test("un entero entre 0 y el máximo es el tope nuevo", () => {
  assert.deepEqual(leerValorDeLimite("0"), { ok: true, quitar: false, tope: 0 });
  assert.deepEqual(leerValorDeLimite("8"), { ok: true, quitar: false, tope: 8 });
  assert.deepEqual(leerValorDeLimite(String(TOPE_MAXIMO)), { ok: true, quitar: false, tope: TOPE_MAXIMO });
});

test("negativos, decimales, texto o más que el máximo se rechazan con un porqué", () => {
  for (const v of ["-1", "2.5", "3,5", "diez", "1e3", String(TOPE_MAXIMO + 1)]) {
    const r = leerValorDeLimite(v);
    assert.equal(r.ok, false, v);
    if (!r.ok) assert.ok(r.motivo.length > 10, v);
  }
});

// ── Trinquete: sólo la consola escribe el plan y sus excepciones ──────────────────────────────
// Las excepciones de límites y el cambio de plan son filas que el panel del negocio NUNCA escribe.
// `audit()` fija el canal en "admin" o "public" y la lectura sólo acepta el canal del operador;
// esto cierra el otro camino: que otro archivo arme o escriba esas filas.

const RAIZ = join(__dirname, "..", "..", "..");
const PERMITIDOS = new Map<string, string>([
  ["scripts/qa/r2f4-plan-magra-lab.ts", "recorrido de laboratorio de R2-F4: escribe con la consola SÓLO contra el Postgres local (erp_lab) y deja el negocio como estaba"],
  ["src/planes/limites.ts", "define la fila y su filtro de lectura"],
  ["src/app/operador/(console)/tenants/[id]/plan-del-negocio.ts", "arma las filas que cierran excepciones (pura)"],
  ["src/lib/operador/plan-escritura.server.ts", "la única escritura, con el candado y la auditoría"],
  ["src/lib/operador/plan-actions.ts", "la action de la consola, detrás de requireOperadorParaNegocio"],
]);
const DETECTOR =
  /["'`]LimiteDelPlan["'`]|\bENTIDAD_LIMITE\b|\bfilaDeExcepcionDeLimite\b|\bfilasQueCierranExcepciones\b|\bescribirExcepcionDeLimite\b|\bescribirPlanConCandado\b|["'`]tenant\.plan\.aplicar["'`]/;

function archivos(dir: string): string[] {
  let entradas;
  try {
    entradas = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entradas.flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" || e.name === "generated" ? [] : archivos(p);
    return /\.(ts|tsx|mts|mjs|js)$/.test(e.name) ? [p] : [];
  });
}

test("trinquete: sólo la consola del operador arma o escribe el plan y las excepciones de límites", () => {
  const usan = [...archivos(join(RAIZ, "src")), ...archivos(join(RAIZ, "scripts"))]
    .map((p) => relative(RAIZ, p).split("\\").join("/"))
    .filter((r) => !/\.test\.(ts|tsx|mts)$/.test(r))
    .filter((r) => DETECTOR.test(readFileSync(join(RAIZ, r), "utf8")));
  const ajenos = usan.filter((r) => !PERMITIDOS.has(r));
  assert.deepEqual(ajenos, [], `archivos nuevos que tocan el plan o sus límites: ${ajenos.join(", ")}`);
  assert.ok(usan.includes("src/lib/operador/plan-escritura.server.ts"), "el detector encuentra la escritura real");
});

test("trinquete: el detector reconoce los caminos de escritura", () => {
  for (const s of [
    `await prisma.auditLog.create({ data: { entity: "LimiteDelPlan" } })`,
    `await tx.auditLog.createMany({ data: filasQueCierranExcepciones(id, op, v) })`,
    `const f = filaDeExcepcionDeLimite({ tenantId, operador, plan, limite })`,
    `await auditAdmin({ action: "tenant.plan.aplicar", entity: "Tenant" })`,
  ]) {
    assert.ok(DETECTOR.test(s), s);
  }
});
