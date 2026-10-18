#!/usr/bin/env node
// Resincroniza la copia controlada del dominio del club (src/lib/club/) con su fuente del piloto
// (public/previews/breakpoint/**). BP-1 de docs/producto/PLAN-TERMINALES-MOSTRADOR.md §4.3.
//
//   node scripts/club-resync.mjs                    # dry-run: compara la copia con la fuente del árbol actual
//   node scripts/club-resync.mjs --ref <sha|rama>   # dry-run contra la fuente de ese commit (git show <ref>:<ruta>)
//   node scripts/club-resync.mjs [--ref <x>] --apply
//        copia la fuente sobre la copia y deja en ORIGEN.json el commit (el de --ref, o HEAD) y los sha256.
//
// No está enganchado a `npm test` ni a los gates: se corre a mano cuando la sesión del club avisa que la fuente
// cambió. Después de --apply: `npx tsc --noEmit` y `node --import tsx --test src/lib/club/*.test.ts`
// (el contrato de motor.d.mts avisa si un export tipado desapareció o cambió de tipo).
//
// — Elaborado por GSG
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const RUTA_ORIGEN = join(RAIZ, "src/lib/club/ORIGEN.json");
const RUTA_TIPOS = join(RAIZ, "src/lib/club/motor.d.mts");
const COPIA_MOTOR = "src/lib/club/motor.mjs";

function salir(mensaje) {
  console.error(`club-resync: ${mensaje}`);
  process.exit(2);
}

function leerArgs(argv) {
  const args = { apply: false, ref: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") args.apply = true;
    else if (a === "--ref") args.ref = argv[++i] ?? salir("--ref necesita un commit o una rama");
    else if (a.startsWith("--ref=")) args.ref = a.slice("--ref=".length);
    else if (a === "--help" || a === "-h") {
      console.log("uso: node scripts/club-resync.mjs [--ref <sha|rama>] [--apply]");
      process.exit(0);
    } else salir(`argumento desconocido «${a}»`);
  }
  if (args.ref !== null && (!args.ref || args.ref.startsWith("-") || /\s/.test(args.ref))) salir(`ref inválida «${args.ref}»`);
  return args;
}

const git = (...a) => execFileSync("git", a, { cwd: RAIZ, encoding: "buffer", stdio: ["ignore", "pipe", "pipe"] });
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const exportsDe = (texto, re) => new Set([...texto.matchAll(re)].map((m) => m[1]));

function main() {
  const { apply, ref } = leerArgs(process.argv.slice(2));
  const origen = JSON.parse(readFileSync(RUTA_ORIGEN, "utf8"));

  let commit;
  try {
    commit = git("rev-parse", "--verify", `${ref ?? "HEAD"}^{commit}`).toString().trim();
  } catch {
    salir(`no encuentro el commit «${ref ?? "HEAD"}» (¿falta un git fetch?)`);
  }

  const leerFuente = (fuente) => {
    if (ref) {
      try {
        return git("show", `${commit}:${fuente}`);
      } catch {
        salir(`${fuente} no existe en ${commit}`);
      }
    }
    const abs = join(RAIZ, fuente);
    if (!existsSync(abs)) salir(`${fuente} no existe en el árbol`);
    return readFileSync(abs);
  };

  console.log(`Fuente: ${ref ? `commit ${commit} (${ref})` : `árbol actual (HEAD ${commit})`}`);
  console.log(`Copia fijada en: ${origen.commit}\n`);

  const cambios = [];
  for (const [copia, { fuente, sha256: fijado }] of Object.entries(origen.archivos)) {
    const nuevo = leerFuente(fuente);
    const hashNuevo = sha256(nuevo);
    const abs = join(RAIZ, copia);
    const actual = existsSync(abs) ? readFileSync(abs) : null;
    const hashCopia = actual ? sha256(actual) : null;
    if (hashCopia !== fijado) console.log(`  ! ${copia}: la copia NO coincide con ORIGEN.json (¿se editó a mano?)`);
    if (hashNuevo === hashCopia) {
      console.log(`  = ${copia}`);
      continue;
    }
    const lineas = (b) => (b ? b.toString("utf8").split("\n").length : 0);
    console.log(`  ~ ${copia} ← ${fuente} (${lineas(actual)} → ${lineas(nuevo)} líneas)`);
    cambios.push({ copia, fuente, abs, nuevo, hashNuevo });
  }

  // Exports del motor que motor.d.mts no tipa (nuevos) o que tipa y ya no existen (rompe el contrato).
  const motor = cambios.find((c) => c.copia === COPIA_MOTOR)?.nuevo ?? readFileSync(join(RAIZ, COPIA_MOTOR));
  const enMotor = exportsDe(motor.toString("utf8"), /^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm);
  const tipados = exportsDe(readFileSync(RUTA_TIPOS, "utf8"), /^export\s+declare\s+(?:function|const)\s+([A-Za-z_$][\w$]*)/gm);
  const faltan = [...tipados].filter((n) => !enMotor.has(n));
  const sinTipar = [...enMotor].filter((n) => !tipados.has(n));
  console.log(`\nmotor.d.mts tipa ${tipados.size} de ${enMotor.size} exports.`);
  if (faltan.length) console.log(`  ✗ tipados que ya no existen en el motor (hay que sacarlos de motor.d.mts): ${faltan.join(", ")}`);
  if (ref || cambios.length) {
    const fijados = exportsDe(readFileSync(join(RAIZ, COPIA_MOTOR), "utf8"), /^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm);
    const nuevos = sinTipar.filter((n) => !fijados.has(n));
    if (nuevos.length) console.log(`  + exports nuevos en la fuente (sin tipar; se tipan si una pantalla los usa): ${nuevos.join(", ")}`);
  }

  if (!cambios.length) {
    console.log("\nLa copia ya está al día con esa fuente.");
    if (apply && origen.commit !== commit) {
      origen.commit = commit;
      writeFileSync(RUTA_ORIGEN, JSON.stringify(origen, null, 2) + "\n");
      console.log(`ORIGEN.json: commit → ${commit}`);
    }
    return;
  }
  if (!apply) {
    console.log(`\nDry-run: ${cambios.length} archivo(s) cambiarían. Para aplicar: agregá --apply.`);
    return;
  }

  // Sin --ref, el commit que queda registrado es HEAD: la fuente del árbol tiene que ser la de HEAD.
  if (!ref) {
    for (const { fuente } of cambios) {
      try {
        git("diff", "--quiet", "HEAD", "--", fuente);
      } catch {
        salir(`${fuente} tiene cambios sin commitear: ORIGEN.json no podría decir de qué commit sale. Commiteá la fuente o usá --ref.`);
      }
    }
  }
  for (const { copia, abs, nuevo, hashNuevo } of cambios) {
    writeFileSync(abs, nuevo);
    origen.archivos[copia].sha256 = hashNuevo;
  }
  origen.commit = commit;
  writeFileSync(RUTA_ORIGEN, JSON.stringify(origen, null, 2) + "\n");
  console.log(`\nAplicado: ${cambios.length} archivo(s) copiados; ORIGEN.json → ${commit}.`);
  console.log("Ahora: npx tsc --noEmit && node --import tsx --test src/lib/club/*.test.ts");
}

main();
