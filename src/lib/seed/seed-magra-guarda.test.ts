// La semilla de MAGRA con `MAGRA_SLUG` (el slug REAL, `magra`) sólo corre contra un Postgres de esta
// máquina: en Neon ese slug es el negocio del cliente y la semilla borra sus datos. La guarda mira el
// host de la URL, no el texto entero: una contraseña con "qa" o "dev" adentro pasaba la baranda vieja
// (Gate del frente MAGRA nivel BP, B1). Se corre la semilla de verdad, como proceso aparte, con una
// URL de Neon inventada: tiene que abortar antes de conectarse.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../../..");

function sembrar(env: Record<string, string>): Promise<{ codigo: number; salida: string }> {
  return new Promise((ok) => {
    execFile(process.execPath, ["--import", "tsx", "prisma/seed-magra.ts"], { cwd: RAIZ, env: { ...process.env, ...env }, timeout: 60_000 }, (err, stdout, stderr) =>
      ok({ codigo: err ? Number((err as { code?: number }).code ?? 1) : 0, salida: `${stdout}${stderr}` }),
    );
  });
}

test("con MAGRA_SLUG, la semilla de MAGRA aborta contra una base que no es de esta máquina, aunque la contraseña diga «qa»", async () => {
  const r = await sembrar({ DATABASE_URL: "postgresql://neondb_owner:npg_aQaDev1@ep-ejemplo-123.sa-east-1.aws.neon.tech/neondb?sslmode=require", MAGRA_SLUG: "magra" });
  assert.notEqual(r.codigo, 0);
  assert.match(r.salida, /MAGRA_SLUG sólo contra una base LOCAL/);
  assert.match(r.salida, /ep-ejemplo-123\.sa-east-1\.aws\.neon\.tech/);
});
