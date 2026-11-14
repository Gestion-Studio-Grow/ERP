// ============================================================================
// D13 en centavos (GSG-MIA-009), invariantes estáticas sobre el repo:
//   · las cuatro columnas son Gate 2: SQL en `prisma/pending-gate2/D13_cobro_fijado.sql`, nunca en `prisma/migrations/`;
//   · en `schema.prisma` van comentadas con `// GATE2-D13: ` (el predeploy-check no las exige) y sin Float;
//   · el SQL pendiente: BIGINT, NUMERIC(18,6), CHECKs, índice, trigger «lo contabilizado no se edita» y vuelta atrás;
//   · ningún `number` con decimales en el fijado; ningún resto de la columna vieja `montoMoneda`;
//   · todo UPDATE de `ProyectoPago` en `src/` escribe sólo `anuladoEl`/`anuladoPor`/`nota` o va por `fijarCobroTx`.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");
const D13 = ["cuotaId", "moneda", "montoMonedaCentavos", "tipoCambio"] as const;

function cuerpoDelModelo(schema: string, modelo: string): string {
  const m = new RegExp(`^model\\s+${modelo}\\s*\\{([\\s\\S]*?)\\n\\}`, "m").exec(schema);
  assert.ok(m, `falta el modelo ${modelo}`);
  return m[1];
}

/**
 * Las columnas que el predeploy-check espera de un modelo: la MISMA regla de `parseExpectedColumns`
 * (scripts/predeploy-check.mts): se saltean las líneas vacías, las `//`, las `@@` y la llave; cuenta `campo Tipo`.
 */
function columnasEsperadas(cuerpo: string): Set<string> {
  const cols = new Set<string>();
  for (const cruda of cuerpo.split("\n")) {
    const linea = cruda.trim();
    if (!linea || linea.startsWith("//") || linea.startsWith("@@") || linea.startsWith("}")) continue;
    const m = /^(\w+)\s+(\w+)(\[\])?(\?)?/.exec(linea);
    if (m) cols.add(m[1]);
  }
  return cols;
}

function archivos(dir: string, salida: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    const ruta = path.join(dir, nombre);
    if (statSync(ruta).isDirectory()) {
      if (nombre === "generated" || nombre === "node_modules") continue;
      archivos(ruta, salida);
    } else if (/\.(ts|tsx|mts|mjs)$/.test(nombre)) salida.push(ruta);
  }
  return salida;
}

test("D13 · schema.prisma: los cuatro campos y el índice comentados con `// GATE2-D13: `, sin Float", () => {
  const cuerpo = cuerpoDelModelo(leer("prisma/schema.prisma"), "ProyectoPago");
  const esperadas = columnasEsperadas(cuerpo);
  for (const c of D13) assert.ok(!esperadas.has(c), `«${c}» está activo: el predeploy-check lo exigiría antes del Gate 2`);
  for (const linea of cuerpo.split("\n").map((l) => l.trim())) {
    if (linea.startsWith("@@")) assert.doesNotMatch(linea, /cuotaId/, "el índice (tenantId, cuotaId) va comentado");
  }
  const gate2 = cuerpo.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("// GATE2-D13: "));
  for (const c of D13) assert.ok(gate2.some((l) => new RegExp(`^// GATE2-D13: ${c}\\s`).test(l)), `falta «// GATE2-D13: ${c}»`);
  assert.ok(gate2.some((l) => /@@index\(\[tenantId, cuotaId\]\)/.test(l)), "falta el índice comentado");
  for (const l of gate2) assert.doesNotMatch(l, /\bFloat\b/, l);
  assert.ok(gate2.some((l) => /montoMonedaCentavos\s+BigInt\?/.test(l)));
  assert.ok(gate2.some((l) => /tipoCambio\s+Decimal\?\s+@db\.Decimal\(18,\s*6\)/.test(l)));
  // La regla del predeploy-check sigue salteando los comentarios (si cambia, este test deja de representarla).
  assert.match(leer("scripts/predeploy-check.mts"), /line\.startsWith\("\/\/"\)/);
});

test("D13 · prisma/migrations/ no toca las columnas del cobro fijado (son Gate 2)", () => {
  const dir = path.join(RAIZ, "prisma", "migrations");
  assert.ok(!existsSync(path.join(dir, "20261114120000_proyecto_pago_cuota")), "la migración vieja (DOUBLE) se borró");
  for (const nombre of readdirSync(dir)) {
    const sql = path.join(dir, nombre, "migration.sql");
    if (!existsSync(sql)) continue;
    const texto = readFileSync(sql, "utf8");
    assert.doesNotMatch(texto, /montoMoneda/, nombre);
    assert.doesNotMatch(texto, /ProyectoPago_tenantId_cuotaId_idx/, nombre);
    assert.doesNotMatch(texto, /ALTER TABLE "ProyectoPago"[^;]*"(cuotaId|tipoCambio|moneda)"/, nombre);
  }
});

test("D13 · el SQL pendiente: BIGINT, NUMERIC(18,6), CHECKs, índice, trigger, idempotente y con vuelta atrás", () => {
  const sql = leer("prisma/pending-gate2/D13_cobro_fijado.sql");
  const codigo = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  assert.match(codigo, /ADD COLUMN IF NOT EXISTS "cuotaId" TEXT/);
  assert.match(codigo, /ADD COLUMN IF NOT EXISTS "moneda" TEXT/);
  assert.match(codigo, /ADD COLUMN IF NOT EXISTS "montoMonedaCentavos" BIGINT/);
  assert.match(codigo, /ADD COLUMN IF NOT EXISTS "tipoCambio" NUMERIC\(18,\s*6\)/);
  assert.doesNotMatch(codigo, /DOUBLE|FLOAT|\bREAL\b/i);
  assert.match(codigo, /CREATE INDEX IF NOT EXISTS "ProyectoPago_tenantId_cuotaId_idx" ON "ProyectoPago"\s*\("tenantId",\s*"cuotaId"\)/);
  assert.match(codigo, /"montoMonedaCentavos" >= 0/);
  assert.match(codigo, /"tipoCambio" > 0/);
  assert.match(codigo, /BEFORE UPDATE ON "ProyectoPago"/);
  assert.doesNotMatch(codigo, /\bDROP\s+(TABLE|COLUMN)\b/i, "el archivo no borra nada (la vuelta atrás va comentada)");
  assert.match(sql, /^-- VUELTA ATRÁS/m);
  const readme = leer("prisma/pending-gate2/README.md");
  assert.match(readme, /`D13_cobro_fijado\.sql`/);
});

test("D13 · el fijado no usa number con decimales ni la columna vieja", () => {
  const core = leer("src/lib/proyectos/gestion-core.ts");
  const tipo = /export type CambioDelCobro = \{[^}]*\}/.exec(core);
  assert.ok(tipo, "falta el tipo CambioDelCobro");
  assert.match(tipo[0], /montoMonedaCentavos: bigint \| null/);
  assert.match(tipo[0], /tipoCambio: string \| null/);
  assert.doesNotMatch(tipo[0], /number/);
  for (const ruta of archivos(path.join(RAIZ, "src"))) {
    if (/\.test\.tsx?$/.test(ruta)) continue;
    assert.doesNotMatch(readFileSync(ruta, "utf8"), /\bmontoMoneda\b/, `${path.relative(RAIZ, ruta)} nombra la columna vieja`);
  }
});

test("D13 · todo UPDATE de ProyectoPago en src/ toca sólo anuladoEl/anuladoPor/nota o va por fijarCobroTx", () => {
  const permitidos = new Set(["anuladoEl", "anuladoPor", "nota"]);
  let fijar = 0;
  for (const ruta of archivos(path.join(RAIZ, "src"))) {
    if (/\.test\.tsx?$/.test(ruta)) continue;
    const rel = path.relative(RAIZ, ruta);
    const texto = readFileSync(ruta, "utf8");
    assert.doesNotMatch(texto, /proyectoPago\.upsert/, `${rel}: upsert de un cobro`);
    for (const m of texto.matchAll(/proyectoPago\.update(Many)?\(\{([\s\S]*?)\}\s*\)/g)) {
      const data = /data:\s*\{([^}]*)\}/.exec(m[2]);
      assert.ok(data, `${rel}: update de un cobro sin data literal`);
      const claves = [...data[1].matchAll(/(\w+)\s*:/g)].map((x) => x[1]);
      for (const c of claves) assert.ok(permitidos.has(c), `${rel}: un update de ProyectoPago escribe «${c}»`);
    }
    for (const m of texto.matchAll(/UPDATE\s+"ProyectoPago"/g)) {
      const antes = texto.slice(0, m.index);
      const fn = antes.lastIndexOf("export async function ");
      assert.ok(fn >= 0 && antes.slice(fn).startsWith("export async function fijarCobroTx("), `${rel}: UPDATE "ProyectoPago" fuera de fijarCobroTx`);
      fijar++;
    }
  }
  assert.equal(fijar, 1, "un solo UPDATE crudo de ProyectoPago: el de fijarCobroTx");
});

test("cert. D13 · R7: regenerarCuotas pregunta la sonda de facturas ANTES de la transacción y la pasa adentro", () => {
  const src = readFileSync(path.join(process.cwd(), "src/lib/proyectos/gestion.server.ts"), "utf8");
  const cuerpo = src.slice(src.indexOf("export async function regenerarCuotas("), src.indexOf("async function aplicarPlan("));
  const sonda = cuerpo.indexOf("await hayColumnaCuotaEnInvoice()");
  assert.ok(sonda > 0 && sonda < cuerpo.indexOf("tenantTransaction("), "la sonda va antes de abrir la transacción");
  const plan = src.slice(src.indexOf("async function aplicarPlan("));
  assert.doesNotMatch(plan.slice(0, plan.indexOf("\n}\n")), /hayColumnaCuotaEnInvoice\(/, "adentro no se pregunta de nuevo");
  assert.equal((plan.match(/\{ tx, conColumna \}\)/g) ?? []).length, 2, "las dos escrituras usan el candado con la sonda de afuera");
});

test("cert. D13 · R7 (2ª vuelta): la sonda de facturas de cuota no confunde «no pude preguntar» con «no está la columna»", () => {
  const src = readFileSync(path.join(process.cwd(), "src/lib/proyectos/facturar-cuota.server.ts"), "utf8");
  const ini = src.indexOf("export async function hayColumnaCuotaEnInvoice(");
  const sonda = src.slice(ini, src.indexOf("\n}\n", ini));
  assert.doesNotMatch(sonda, /\.catch\(/, "un error de conexión no puede volverse `false` (sin candado)");
  assert.match(sonda, /throw new Error\(SONDA_FACTURAS_SIN_RESPUESTA/, "sin respuesta, la operación no sigue");
});
