// Chequeos ESTÁTICOS del paquete Gate 2 nivel 2 (sin base; corren en `npm test`).
//
// Regla `// N2-enum:` (cert. S2): los valores que agrega prisma/pending-gate2/N2_enums.sql y los
// que schema.prisma marca con `// N2-enum: ` (o ya encendió) tienen que ser EXACTAMENTE los
// mismos. Si alguien agrega un ADD VALUE sin su marca (o al revés), el cliente de Prisma y la base
// se desalinean y una lectura de una fila con el valor nuevo falla. También fija D-C01: Débito y
// Crédito separados, sin un valor "TARJETA" en PaymentMethod.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();
const SQL_ENUMS = readFileSync(path.join(RAIZ, "prisma/pending-gate2/N2_enums.sql"), "utf8");
const SCHEMA = readFileSync(path.join(RAIZ, "prisma/schema.prisma"), "utf8");

/** Sentencias vivas (sin comentarios `--`). */
const sentencias = SQL_ENUMS.split(/\r?\n/)
  .map((l) => l.replace(/--.*$/, "").trim())
  .filter(Boolean);

function valoresDelSql(): string[] {
  const out: string[] = [];
  for (const s of sentencias) {
    const m = /^ALTER TYPE "(\w+)" ADD VALUE IF NOT EXISTS '(\w+)';$/.exec(s);
    assert.ok(m, `N2_enums.sql: sentencia inesperada (sólo ADD VALUE IF NOT EXISTS, una por línea): ${s}`);
    out.push(`${m[1]}.${m[2]}`);
  }
  return out;
}

/** Cuerpo de `enum Nombre { … }` en schema.prisma (líneas entre la llave que abre y la que cierra). */
function cuerpoDelEnum(nombre: string): string[] {
  const lineas = SCHEMA.split(/\r?\n/);
  const ini = lineas.findIndex((l) => l.trim() === `enum ${nombre} {`);
  assert.ok(ini >= 0, `schema.prisma: falta enum ${nombre}`);
  const fin = lineas.findIndex((l, i) => i > ini && l.trim() === "}");
  return lineas.slice(ini + 1, fin);
}

test("N2_enums.sql: sin BEGIN/COMMIT y un ADD VALUE IF NOT EXISTS por sentencia (cada uno su paso)", () => {
  assert.ok(!sentencias.some((s) => /^(BEGIN|COMMIT|START TRANSACTION)\b/i.test(s)), "no lleva transacción");
  assert.ok(valoresDelSql().length > 0);
});

test("D-C01: PaymentMethod agrega DEBITO y CREDITO, y ningún TARJETA", () => {
  const pm = valoresDelSql().filter((v) => v.startsWith("PaymentMethod."));
  assert.deepEqual(pm, ["PaymentMethod.DEBITO", "PaymentMethod.CREDITO"]);
  for (const l of cuerpoDelEnum("PaymentMethod")) {
    assert.ok(!/^\s*(\/\/ N2-enum: )?TARJETA\b/.test(l), `schema.prisma PaymentMethod no lleva TARJETA: ${l.trim()}`);
  }
});

test("regla N2-enum: cada valor del SQL tiene su marca (o está encendido) en schema.prisma, y viceversa", () => {
  const delSql = valoresDelSql();
  const tipos = [...new Set(delSql.map((v) => v.split(".")[0]))];
  const marcados: string[] = [];
  const encendidos: string[] = [];
  for (const tipo of tipos) {
    for (const l of cuerpoDelEnum(tipo)) {
      const marca = /^\s*\/\/ N2-enum: (\w+)/.exec(l);
      if (marca) marcados.push(`${tipo}.${marca[1]}`);
      const vivo = /^\s*([A-Z][A-Z0-9_]*)\b/.exec(l);
      if (vivo) encendidos.push(`${tipo}.${vivo[1]}`);
    }
  }
  for (const v of delSql) {
    assert.ok(marcados.includes(v) || encendidos.includes(v), `${v}: falta \`// N2-enum: \` en schema.prisma`);
  }
  for (const v of marcados) {
    assert.ok(delSql.includes(v), `${v}: marcado \`// N2-enum:\` en schema.prisma pero N2_enums.sql no lo agrega`);
  }
});
