// node --test scripts/git-hooks/*.test.mjs
// Control de push que frena una rama vieja (sin el vercel.json de fbf64d7) antes de que Vercel la reciba.
// Orden del dueño 15/11/2026, VERCEL-RAMAS-VIEJAS opción A. Método: Factory-GSG 10-GOBIERNO/despliegues-vercel.md §5.3.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { configFrenaRamas, revisarPush } from "./pre-push.mjs";

const HOOK = fileURLToPath(new URL("./pre-push.mjs", import.meta.url));
const VERCEL_JSON = readFileSync(new URL("../../vercel.json", import.meta.url), "utf8");
const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const CEROS = "0".repeat(40);

const NUEVO = JSON.stringify({ git: { deploymentEnabled: { "**": false, main: true, "tanda/**": false } } });
const VIEJO = JSON.stringify({ framework: "nextjs", buildCommand: "node scripts/vercel-build.mjs" });

test("configFrenaRamas: sólo cuenta si las ramas comunes NO despliegan", () => {
  assert.equal(configFrenaRamas(JSON.parse(NUEVO)), true);
  assert.equal(configFrenaRamas({ git: { deploymentEnabled: false } }), true);
  assert.equal(configFrenaRamas({ github: { enabled: false } }), true);
  assert.equal(configFrenaRamas(JSON.parse(VIEJO)), false);
  assert.equal(configFrenaRamas({ git: { deploymentEnabled: { dev: false } } }), false);
  assert.equal(configFrenaRamas({ git: { deploymentEnabled: { "**": true } } }), false);
  assert.equal(configFrenaRamas({ git: { deploymentEnabled: true } }), false);
  assert.equal(configFrenaRamas(null), false);
});

test("vercel.json del repo: sólo main despliega (\"**\" y \"tanda/**\" en false, ninguna otra regla en true)", () => {
  const d = JSON.parse(VERCEL_JSON).git.deploymentEnabled;
  assert.equal(d["**"], false);
  assert.equal(d.main, true);
  // Vercel: si una rama cumple varias reglas y al menos una es true, despliega
  // (https://vercel.com/docs/project-configuration/git-configuration). Por eso ninguna otra en true.
  assert.equal(d["tanda/**"], false);
  assert.deepEqual(Object.entries(d).filter(([, v]) => v === true).map(([k]) => k), ["main"]);
  assert.equal(configFrenaRamas(JSON.parse(VERCEL_JSON)), true);
});

test("revisarPush: frena la rama vieja, deja pasar la nueva, el borrado y los tags", () => {
  const leer = (sha) => ({ [SHA_A]: VIEJO, [SHA_B]: NUEVO })[sha] ?? null;
  const entrada = [
    `refs/heads/vieja ${SHA_A} refs/heads/claude/vieja ${CEROS}`,
    `refs/heads/nueva ${SHA_B} refs/heads/claude/nueva ${CEROS}`,
    `(delete) ${CEROS} refs/heads/claude/borrar ${SHA_A}`,
    `refs/tags/v1 ${SHA_A} refs/tags/v1 ${CEROS}`,
    "",
  ].join("\n");
  const r = revisarPush(entrada, leer);
  assert.deepEqual(r.map((x) => x.rama), ["claude/vieja"]);
  assert.match(r[0].motivo, /deploymentEnabled/);
});

test("revisarPush: sin vercel.json o con JSON roto también frena (sin él, Vercel despliega toda rama)", () => {
  const r = revisarPush(`refs/heads/x ${SHA_A} refs/heads/x ${CEROS}\nrefs/heads/y ${SHA_B} refs/heads/y ${CEROS}`, (sha) =>
    sha === SHA_A ? null : "{ roto",
  );
  assert.deepEqual(r.map((x) => x.rama), ["x", "y"]);
  assert.match(r[0].motivo, /no trae vercel\.json/);
  assert.match(r[1].motivo, /JSON/);
});

test("revisarPush: si leer el commit falla, frena (y el mensaje lo dice)", () => {
  const r = revisarPush(`refs/heads/x ${SHA_A} refs/heads/x ${CEROS}`, () => {
    throw new Error("git roto");
  });
  assert.equal(r.length, 1);
});

// ── De punta a punta, con git de verdad: instala el gancho y empuja a un remoto local ──────────────
const git = (cwd, ...args) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

test("e2e: instalado en .git/hooks, rechaza el push de una rama vieja y deja el de una nueva", (t) => {
  const raiz = mkdtempSync(join(tmpdir(), "gsg-prepush-"));
  t.after(() => rmSync(raiz, { recursive: true, force: true }));
  const remoto = join(raiz, "remoto.git");
  const repo = join(raiz, "repo");
  execFileSync("git", ["init", "-q", "--bare", remoto]);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  git(repo, "remote", "add", "origin", remoto);

  writeFileSync(join(repo, "vercel.json"), VIEJO);
  git(repo, "add", "vercel.json");
  git(repo, "commit", "-q", "-m", "viejo");
  git(repo, "branch", "claude/vieja");
  writeFileSync(join(repo, "vercel.json"), NUEVO);
  git(repo, "add", "vercel.json");
  git(repo, "commit", "-q", "-m", "nuevo");

  const inst = spawnSync(process.execPath, [HOOK, "--instalar"], { cwd: repo, encoding: "utf8" });
  assert.equal(inst.status, 0, inst.stdout + inst.stderr);
  assert.ok(existsSync(join(repo, ".git", "hooks", "pre-push")));
  // Vive en .git/hooks: sigue ahí aunque se cambie a una rama vieja que no trae el script.
  git(repo, "switch", "-q", "claude/vieja");

  const malo = spawnSync("git", ["push", "-q", "origin", "claude/vieja"], { cwd: repo, encoding: "utf8" });
  assert.notEqual(malo.status, 0, "la rama vieja tenía que rechazarse");
  assert.match(malo.stderr, /claude\/vieja/);
  assert.match(malo.stderr, /git merge origin\/main/);
  assert.throws(() => git(remoto, "rev-parse", "--verify", "refs/heads/claude/vieja"), "no llegó nada al remoto");

  const bueno = spawnSync("git", ["push", "-q", "origin", "main"], { cwd: repo, encoding: "utf8" });
  assert.equal(bueno.status, 0, bueno.stderr);

  // Instalar dos veces no duplica ni rompe.
  const otra = spawnSync(process.execPath, [HOOK, "--instalar"], { cwd: repo, encoding: "utf8" });
  assert.equal(otra.status, 0, otra.stdout + otra.stderr);
});

test("e2e: no pisa un pre-push ajeno que ya estaba", (t) => {
  const repo = mkdtempSync(join(tmpdir(), "gsg-prepush-ajeno-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q", repo]);
  writeFileSync(join(repo, ".git", "hooks", "pre-push"), "#!/bin/sh\necho ajeno\n");
  const inst = spawnSync(process.execPath, [HOOK, "--instalar"], { cwd: repo, encoding: "utf8" });
  assert.equal(inst.status, 0);
  assert.match(inst.stdout, /ya hay un pre-push/);
  assert.equal(readFileSync(join(repo, ".git", "hooks", "pre-push"), "utf8"), "#!/bin/sh\necho ajeno\n");
});
