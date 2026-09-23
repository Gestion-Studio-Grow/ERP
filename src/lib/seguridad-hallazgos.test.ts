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
  // Desde 5f7314e el secreto del operador vive en `operatorSecret()`: en producción exige
  // OPERATOR_SECRET (distinta de AUTH_SECRET) y tira si falta; la cadena con el fallback de
  // desarrollo sólo se alcanza DESPUÉS de ese bloque. La decisión se EJECUTA en
  // operator-auth.test.ts ("producción: sin OPERATOR_SECRET, o igual a AUTH_SECRET, falla
  // cerrado"); acá queda la forma, para que nadie suba el fallback arriba del bloque.
  const src = leer("src/lib/operator-auth.ts");
  const inicio = src.indexOf("function operatorSecret(");
  assert.ok(inicio >= 0, "operator-auth.ts ya no tiene operatorSecret()");
  const cuerpo = src.slice(inicio, src.indexOf("\n}\n", inicio));
  const prod = cuerpo.indexOf('if (process.env.NODE_ENV === "production") {');
  assert.ok(prod >= 0, "operatorSecret() perdió el bloque de producción");
  const fallback = cuerpo.search(/\?\?\s*"dev-operator-secret"/);
  assert.ok(fallback === -1 || fallback > prod, "operator-auth.ts volvió al fallback en la cadena de secretos antes del bloque de producción.");
  const bloque = cuerpo.slice(prod, fallback === -1 ? undefined : fallback);
  assert.match(bloque, /throw new Error\("OPERATOR_SECRET no está configurado/, "en producción, sin OPERATOR_SECRET, tira");
  assert.match(bloque, /return propio;/, "en producción devuelve SÓLO el secreto propio");
  // Fuera de operatorSecret() no hay otra cadena con el fallback.
  assert.ok(!/\?\?\s*"dev-operator-secret"/.test(src.replace(cuerpo, "")), "apareció otra cadena con el fallback fuera de operatorSecret()");
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

// ── El candado de Mis locales vale en el SERVIDOR, no sólo en la vista previa ─

test("activar/apagar un módulo en la consola decide con los vínculos leídos de la base", () => {
  const src = leer("src/lib/operator-actions.ts");
  const cuerpo = src.slice(src.indexOf("export async function toggleTenantModule"), src.indexOf("export async function fijarAsignacionActual"));
  assert.match(
    cuerpo,
    /validarCambio\(\{ \.\.\.tenant, vinculosActivos: await vinculosActivosDe\(tenantId\) \}/,
    "toggleTenantModule tiene que pasarle a validarCambio los vínculos activos: sin ellos, un POST a mano apaga Mis locales con locales colgando.",
  );
});

test("el panel del contador no abre con cartera y Mis locales juntos, y lo dice antes de leer la cartera", () => {
  const src = leer("src/app/contador/page.tsx");
  const decide = src.indexOf('decidirAcceso(estudio.modules, "estudio")');
  assert.ok(decide > 0, "la página tiene que decidir con decidirAcceso (la misma regla que las actions)");
  assert.ok(decide < src.indexOf("await monitorCarteraAction()"), "la decisión va ANTES de leer la cartera");
});

test("getProductExtras lee adentro de tenantTransaction: afuera, con RLS, no ve ninguna fila", () => {
  // Medido en la integración de la ola 2 contra el Postgres local con el rol app_rls: la misma
  // consulta sin el GUC del negocio da 0 filas; con el GUC, las del negocio.
  const src = leer("src/lib/carniceria/product-extras.ts");
  const cuerpo = src.slice(src.indexOf("export async function getProductExtras"), src.indexOf("export async function writeProductExtras"));
  assert.match(cuerpo, /await tenantTransaction\(\s*\(tx\) => tx\.\$queryRaw/);
  assert.ok(!/prisma\.\$queryRaw/.test(cuerpo), "volvió la consulta cruda con el cliente global (sin el negocio puesto)");
  assert.match(cuerpo, /to_jsonb\(p\) ->> 'category'/, "sin la migración cárnica la columna no existe: to_jsonb da NULL en vez de un error");
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
