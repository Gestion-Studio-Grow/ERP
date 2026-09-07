// Regresiones de los hallazgos de la auditoría de seguridad (2026-07-13) que
// SEGUÍAN VIVOS en `main` —o sea, en producción— cuando se verificaron el 2026-09-07.
//
// Son tests de forma sobre el código fuente, no de comportamiento: los tres primeros
// hallazgos dependen de `NODE_ENV`, de una carrera entre transacciones o de una
// redirección de Next, y montar eso de verdad cuesta más de lo que protege. Lo que
// importa es que nadie los deshaga sin enterarse.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const raiz = process.cwd();
const leer = (p: string) => readFileSync(join(raiz, p), "utf8");

// ── A-1 · el secreto de sesión no puede caer a un string público ────────────

test("A-1 · auth: sin AUTH_SECRET en producción, rompe (no firma con una clave pública)", () => {
  const src = leer("src/lib/auth.ts");
  assert.ok(!/AUTH_SECRET\s*\?\?\s*"dev-secret"/.test(src),
    'auth.ts volvió al fallback `AUTH_SECRET ?? "dev-secret"`: con el env faltante en producción, cualquiera puede forjar una cookie de sesión.');
  assert.match(src, /NODE_ENV === "production"/);
  assert.match(src, /throw new Error/);
});

test("A-1 · operador: el plano cross-tenant también falla cerrado", () => {
  const src = leer("src/lib/operator-auth.ts");
  assert.ok(!/\?\?\s*"dev-operator-secret"\s*;/.test(src.replace(/return "dev-operator-secret";/, "")),
    "operator-auth.ts volvió al fallback en la cadena de secretos.");
  assert.match(src, /NODE_ENV === "production"/);
});

// ── C-1 · la liquidación de comisiones no puede pagar dos veces ─────────────

test("C-1 · comisiones: la transacción es Serializable", () => {
  assert.match(leer("src/lib/commission-actions.ts"), /TransactionIsolationLevel\.Serializable/,
    "settleCommissions perdió el nivel Serializable: dos liquidaciones concurrentes vuelven a poder leer el mismo set pendiente.");
});

test("C-1 · comisiones: sólo se reclaman los turnos que siguen sin liquidar", () => {
  const src = leer("src/lib/commission-actions.ts");
  // La guarda estructural: el updateMany filtra por commissionPayoutId null…
  assert.match(src, /updateMany\(\{\s*\n?\s*where:\s*\{\s*id:\s*\{\s*in:\s*ids\s*\}\s*,\s*commissionPayoutId:\s*null\s*\}/,
    "el updateMany dejó de filtrar por `commissionPayoutId: null`: vuelve a poder pisar una liquidación ajena.");
  // …y si reclama menos de los que contó, aborta en vez de emitir un comprobante que miente.
  assert.match(src, /reclamados\.count !== ids\.length/);
});

// ── C-2 · el secreto no viaja por la URL ────────────────────────────────────

test("C-2 · la contraseña de bootstrap no va en el query string", () => {
  const src = leer("src/lib/operator-actions.ts");
  assert.ok(!/bootstrap=\$\{/.test(src),
    "volvió `&bootstrap=<clave>` a la URL: el secreto queda en el historial del navegador y en los access-logs.");
});

// ── A-2 · el límite de la API pública está CABLEADO, no sólo construido ─────

test("A-2 · las dos rutas públicas llaman al limitador", () => {
  for (const ruta of [
    "src/app/api/public/v1/orders/route.ts",
    "src/app/api/public/v1/orders/[code]/route.ts",
  ]) {
    const src = leer(ruta);
    assert.match(src, /checkPublicApiRate/, `${ruta} no llama a checkPublicApiRate: la api-key se puede fuerza-brutear sin freno.`);
    assert.match(src, /429/, `${ruta} no devuelve 429 al superar el límite.`);
  }
});

test("A-2 · el límite se aplica ANTES de autenticar", () => {
  const src = leer("src/app/api/public/v1/orders/route.ts");
  assert.ok(src.indexOf("checkPublicApiRate") < src.indexOf("authenticatePublicApi("),
    "el límite quedó DESPUÉS de autenticar: cada intento de fuerza bruta pagaría una consulta a la base antes de ser frenado.");
});
