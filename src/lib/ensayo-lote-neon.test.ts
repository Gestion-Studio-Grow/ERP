// El SQL del ensayo en Neon tiene que ser EXACTAMENTE el lote que se va a aplicar. Si alguien
// cambia una migración o el lote y no regenera (node scripts/ensayo-lote-neon.mjs), el ensayo
// probaría otra cosa y daría una falsa tranquilidad. Este test lo impide.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("el ensayo de Neon está al día con el lote y sus checksums", async () => {
  const { generarEnsayo } = await import("../../scripts/ensayo-lote-neon.mjs");
  const enDisco = readFileSync("docs/runbooks/ensayo-neon/1-lote-en-branch.sql", "utf8");
  assert.equal(enDisco, generarEnsayo("."), "regenerá con: node scripts/ensayo-lote-neon.mjs");
});

test("el paso de RLS del ensayo es el mismo archivo que el del runbook", () => {
  assert.equal(
    readFileSync("docs/runbooks/ensayo-neon/2-rls-despues-del-lote.sql", "utf8"),
    readFileSync("prisma/rls/0001_enable_rls.sql", "utf8"),
  );
});

test("el SQL del pase a producción es el mismo cuerpo que el ensayado", () => {
  const cuerpo = (f: string) => { const s = readFileSync(f, "utf8"); return s.slice(s.indexOf("BEGIN;")); };
  assert.equal(
    cuerpo("docs/runbooks/pase-produccion/1-lote-en-produccion.sql"),
    cuerpo("docs/runbooks/ensayo-neon/1-lote-en-branch.sql"),
  );
  assert.equal(
    readFileSync("docs/runbooks/pase-produccion/2-rls-despues-del-lote.sql", "utf8"),
    readFileSync("prisma/rls/0001_enable_rls.sql", "utf8"),
  );
});
