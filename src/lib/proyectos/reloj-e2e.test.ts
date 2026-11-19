// MIA-194 · punto 7 (recorrido MIA-193): el reloj fijo del ambiente E2E estaba sólo en el navegador; el servidor usaba la hora
// real. `scripts/proyectos/reloj-fijo.mjs` se precarga con `--import` (lo pone `ambiente-e2e.mjs --start`) y hace arrancar el
// reloj del proceso en `E2E_RELOJ`. Sin la variable, no toca nada. Esperados a mano.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import path from "node:path";

const RELOJ = path.resolve(process.cwd(), "scripts/proyectos/reloj-fijo.mjs");
const correr = (env: Record<string, string>) => {
  const codigo = "console.log(JSON.stringify({ now: Date.now(), nuevo: new Date().getTime(), texto: Date(), fijo: new Date(0).getTime(), es: new Date() instanceof Date, utc: Date.UTC(2026, 0, 1) }))";
  const r = spawnSync(process.execPath, ["--import", pathToFileURL(RELOJ).href, "-e", codigo], { encoding: "utf8", env: { PATH: process.env.PATH ?? "", ...env } as unknown as NodeJS.ProcessEnv });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout) as { now: number; nuevo: number; texto: string; fijo: number; es: boolean; utc: number };
};

test("con E2E_RELOJ, el proceso arranca en esa hora (y sigue corriendo); las fechas explícitas no cambian", () => {
  const base = Date.parse("2026-11-02T10:00:00-03:00");
  const r = correr({ E2E_RELOJ: "2026-11-02T10:00:00-03:00", TZ: "America/Argentina/Buenos_Aires" });
  assert.ok(r.now >= base && r.now - base < 5_000, `now ${new Date(r.now).toISOString()}`);
  assert.ok(r.nuevo >= base && r.nuevo - base < 5_000, `new Date() ${new Date(r.nuevo).toISOString()}`);
  assert.match(r.texto, /Nov 02 2026 10:00/);
  assert.equal(r.fijo, 0);
  assert.equal(r.es, true);
  assert.equal(r.utc, Date.UTC(2026, 0, 1));
});

test("sin E2E_RELOJ, la hora real; con un valor que no es fecha, no arranca", () => {
  const r = correr({});
  assert.ok(Math.abs(r.now - Date.now()) < 5_000);
  const mal = spawnSync(process.execPath, ["--import", pathToFileURL(RELOJ).href, "-e", "1"], { encoding: "utf8", env: { PATH: process.env.PATH ?? "", E2E_RELOJ: "mañana" } as unknown as NodeJS.ProcessEnv });
  assert.notEqual(mal.status, 0);
  assert.match(mal.stderr, /E2E_RELOJ/);
});
