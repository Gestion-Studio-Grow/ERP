// ============================================================================
// TEST DE FORMA — las escrituras de auditoría NO pueden ser Server Actions.
// ============================================================================
//
// `"use server"` no significa "esto corre en el servidor": significa que **cada export del
// archivo es un endpoint HTTP**. Con la directiva en `audit.ts`, `audit()` quedaba publicada
// y registrada en los workers de rutas públicas sin sesión — y no tiene guarda: recibe
// `actor`, `action`, `entity` y `entityId` del llamador.
//
// Y `AuditLog` no es sólo bitácora: `lastClosedDay` resuelve con ella hasta qué día está
// CONGELADO el libro de caja del tenant. Una fila forjada con `entity:"CierreDiario"` y un
// `entityId` futuro dejaba el libro sin poder cargar ni borrar nada, sin pantalla que lo
// revierta y exenta de la purga.
//
// Este test no prueba comportamiento: prueba la FORMA del archivo. Es a propósito. El
// defecto no fue una función mal escrita, fue una directiva en la línea 1 — y eso sólo lo
// atrapa algo que mire la línea 1.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const leer = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("audit-core.ts NO lleva \"use server\": sus exports escriben sin guarda propia", () => {
  const core = leer("./audit-core.ts");
  assert.ok(
    !/^\s*["']use server["']/m.test(core),
    "audit-core.ts exporta funciones que escriben AuditLog con el actor que les pasen. Con " +
      '"use server" quedarían publicadas como endpoint desde cualquier ruta, incluidas las ' +
      "públicas sin sesión.",
  );
});

test("audit.ts, que sí es Server Action, sólo expone lectura con capability", () => {
  const publico = leer("./audit.ts");
  assert.ok(/^\s*["']use server["']/m.test(publico), "audit.ts es la superficie pública");
  const exports = [...publico.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map((m) => m[1]);
  assert.deepEqual(exports, ["getAuditLog"], `audit.ts sólo puede exportar getAuditLog, exporta: ${exports.join(", ")}`);
  assert.ok(
    /requireCapability\(\s*["']audit:read["']\s*\)/.test(publico),
    "getAuditLog tiene que exigir audit:read",
  );
  assert.ok(
    !/export\s*\{[^}]*\}\s*from\s*["']@\/lib\/audit-core["']/.test(publico),
    "re-exportar audit-core desde acá las volvería a publicar como endpoint",
  );
});
