// Trinquete de accesibilidad (QA 26/09): el CUIT inválido y la confirmación del pedido se anunciaban
// 2 o 3 veces (aria-live + role="alert" + role="status" de la franja, anidados). Una sola región viva.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

test("el alta de cliente tiene UNA sola región viva (sin role alert/status ni Franja adentro)", () => {
  const fuente = readFileSync(fileURLToPath(new URL("./AltaCliente.tsx", import.meta.url)), "utf8").replace(/\/\/.*$/gm, "");
  const regiones = fuente.match(/aria-live=|role="alert"|role="status"|<Franja\b|\berror=\{/g) ?? [];
  assert.deepEqual(regiones, ["aria-live="]);
});
