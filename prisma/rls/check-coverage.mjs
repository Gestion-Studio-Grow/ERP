// Red ESTÁTICA de cobertura RLS — ADR-018. Corre sin tocar la base (CI / sesión).
//
//   node prisma/rls/check-coverage.mjs
//
// La migración 0001_enable_rls.sql es data-driven: le pone policy a TODA tabla
// con columna `tenantId`. El agujero que ESO no cubre es un modelo que pertenece
// a un tenant pero al que le falta la columna `tenantId` escalar — quedaría sin
// forma de ser aislado y sería un leak silencioso. Este chequeo lo caza:
//
//   Para cada modelo con `tenant Tenant @relation(...)`  →  DEBE tener `tenantId String`.
//
// Además imprime el set que la migración va a proteger y las exclusiones
// deliberadas, para que un revisor vea el alcance de un vistazo.
//
// Exit 0 = todo modelo de-tenant es protegible. Exit 1 = hay un modelo sin tenantId.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(here, "..", "schema.prisma"), "utf8");

// "Tenant" es la raíz (no lleva tenantId, se lee pre-contexto). No es un leak.
const ROOT_MODEL = "Tenant";

const protectable = []; // modelos con tenantId → los protege la policy
const orphan = []; // modelos que pertenecen a un tenant pero SIN columna tenantId

for (const [, name, body] of schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
  if (name === ROOT_MODEL) continue;
  const belongsToTenant = /^\s*tenant\s+Tenant\s+@relation/m.test(body);
  const hasTenantIdColumn = /^\s*tenantId\s+String/m.test(body);
  if (hasTenantIdColumn) protectable.push(name);
  else if (belongsToTenant) orphan.push(name);
}

console.log(`Modelos protegidos por la policy (tienen tenantId): ${protectable.length}`);
console.log(`  ${protectable.sort().join(", ")}`);
console.log(`\nExcluido a propósito: ${ROOT_MODEL} (raíz del aislamiento) · ` +
  `_ProfessionalServices (join M2M sin tenantId, protegido transitivamente)`);

if (orphan.length) {
  console.error(
    `\n❌ Modelos que pertenecen a un tenant pero NO tienen columna \`tenantId\`:\n` +
      `   - ${orphan.join("\n   - ")}\n` +
      `   → sin esa columna la policy RLS no puede aislarlos. Agregá \`tenantId String\`\n` +
      `     + su @relation, o documentá por qué es la raíz.`,
  );
  process.exit(1);
}

console.log(`\n✅ Todo modelo de-tenant es protegible por RLS (tiene tenantId).`);
process.exit(0);
