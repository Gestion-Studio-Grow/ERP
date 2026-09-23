// VETO de la carpeta de números del Inicio. Esto sí lee el código, a propósito: lo que se
// prohíbe es una forma de escribir, no un resultado que se pueda ejecutar.
//   · `unstable_cache` / "use cache": una caché entre requests cuya clave no lleve el negocio
//     le muestra a un negocio los números de otro. Cuatro negocios comparten una base.
//   · `tenantTransaction`: con RLS encendido, el `prisma` global adentro de una transacción
//     sale por otra conexión sin el negocio puesto y devuelve 0 sin error (rls.ts). El tile
//     diría 0 en producción y el número correcto en desarrollo.
//   · `basePrisma` / `operatorPrisma`: clientes sin el candado de negocio.
// Se miran todos los archivos de la carpeta menos los tests, sin comentarios (un comentario
// que explica la regla no la rompe).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CARPETA = join(process.cwd(), "src", "apps", "kpis");

const PROHIBIDO: { patron: RegExp; porque: string }[] = [
  { patron: /\bunstable_cache\b/, porque: "caché entre requests: filtra números entre negocios" },
  { patron: /["']use cache(?::[^"']*)?["']/, porque: "caché entre requests: filtra números entre negocios" },
  { patron: /\btenantTransaction\b/, porque: "con RLS encendido el tile devuelve 0 sin error" },
  { patron: /\bbasePrisma\b/, porque: "cliente sin el candado de negocio" },
  { patron: /\boperatorPrisma\b/, porque: "cliente sin el candado de negocio" },
];

function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
}

test("src/apps/kpis no usa unstable_cache, 'use cache', tenantTransaction ni clientes sin candado", () => {
  const archivos = readdirSync(CARPETA).filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts"));
  assert.ok(archivos.includes("index.server.ts"), "¿se movió la carpeta?");
  assert.ok(archivos.length >= 6, `sólo ${archivos.length} archivos`);
  for (const archivo of archivos) {
    const codigo = sinComentarios(readFileSync(join(CARPETA, archivo), "utf8"));
    for (const { patron, porque } of PROHIBIDO) {
      assert.doesNotMatch(codigo, patron, `${archivo}: ${patron} — ${porque}`);
    }
  }
});

test("el veto de verdad detecta lo que prohíbe (no pasa en vacío)", () => {
  const malo = `"use cache";\nimport { unstable_cache } from "next/cache";\nawait tenantTransaction(() => 1);`;
  const codigo = sinComentarios(malo);
  assert.match(codigo, PROHIBIDO[0].patron);
  assert.match(codigo, PROHIBIDO[1].patron);
  assert.match(codigo, PROHIBIDO[2].patron);
  assert.doesNotMatch(sinComentarios("// nunca tenantTransaction acá"), PROHIBIDO[2].patron);
});
