#!/usr/bin/env node
// scripts/auto-save.mjs — Práctica automática de guardado GSG
// -----------------------------------------------------------------------------
// Regla (docs/PRACTICA-DE-GUARDADO.md): nada vive solo en una sesión; todo avance
// se commitea y se pushea a origin. Este script hace exactamente eso, de forma
// IDEMPOTENTE y SEGURA:
//   1. Si NO hay cambios → no hace nada (exit 0).
//   2. Si hay cambios → git add -A + commit (mensaje con timestamp) + push a origin.
//   3. NUNCA auto-commitea sobre `main` (el merge a main pasa por Gate) salvo --allow-main.
//   4. cwd-independiente: opera sobre el repo derivado de la ubicación del script,
//      o el que indique la variable de entorno AUTOSAVE_REPO (para programarlo).
//
// Uso:
//   node scripts/auto-save.mjs                 # guarda el repo de este script
//   AUTOSAVE_REPO=C:\ruta\repo node auto-save.mjs   # guarda otro repo/worktree
//   node scripts/auto-save.mjs --no-push       # commitea local, no pushea
//   node scripts/auto-save.mjs --allow-main    # permite guardar estando en main
// Salidas: 0 ok/nada-que-hacer · 2 abortado en main · 3 push falló (commit local OK)
// -----------------------------------------------------------------------------
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const REPO = process.env.AUTOSAVE_REPO || resolve(dirname(__filename), '..');
const ALLOW_MAIN = process.argv.includes('--allow-main');
const NO_PUSH = process.argv.includes('--no-push');

const q = (s) => `"${s}"`;
const read = (args) => execSync(`git -C ${q(REPO)} ${args}`, { encoding: 'utf8' }).trim();
const run = (args) => execSync(`git -C ${q(REPO)} ${args}`, { stdio: 'inherit' });

// 1. ¿es un repo?
let branch;
try { branch = read('rev-parse --abbrev-ref HEAD'); }
catch { console.error(`auto-save: ${REPO} no es un repo git.`); process.exit(1); }

// 2. guarda anti-main
if (branch === 'main' && !ALLOW_MAIN) {
  console.error(`auto-save: rama 'main' — abortado. El merge a main pasa por Gate. Usá --allow-main solo a propósito.`);
  process.exit(2);
}

// 3. ¿hay cambios?
const dirty = read('status --porcelain');
if (!dirty) { console.log(`auto-save: ${branch} sin cambios, nada que guardar.`); process.exit(0); }

// 4. add + commit
const stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
run('add -A');
try {
  execSync(`git -C ${q(REPO)} commit -m ${q(`auto-save: ${stamp} (${branch})`)}`, { stdio: 'inherit' });
} catch {
  console.log('auto-save: no quedó nada staged (posible .gitignore); sin commit.');
  process.exit(0);
}

// 5. push
if (NO_PUSH) { console.log(`auto-save: commit hecho en ${branch}, push omitido (--no-push).`); process.exit(0); }
try {
  run('push origin HEAD');
  console.log(`auto-save: guardado + pusheado a origin (${branch} @ ${stamp}).`);
} catch {
  console.error('auto-save: commit LOCAL OK pero el PUSH FALLÓ. Reintentá manualmente: git push origin HEAD');
  process.exit(3);
}
