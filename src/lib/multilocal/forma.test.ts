// ============================================================================
// MIS LOCALES — la FORMA que sostiene el aislamiento. Esto sí lee el código, a propósito.
// ============================================================================
//
// Lo que se prohíbe acá es una manera de escribir, no un resultado que se pueda ejecutar:
//   · el núcleo (que lee y escribe con el id que le pasan) no puede ser "use server": cada
//     export sería un endpoint que cualquiera con sesión llama con un id ajeno;
//   · cada export de las actions de Mis locales arranca con `exigirCasa` y ninguno recibe un id
//     de negocio;
//   · cada página y cada export de /admin/locales pasa por `requireApp` y por `exigirCasa`;
//   · nadie fuera de la consola de GSG (y de la cartera del contador, que es la dueña de sus
//     filas) escribe CarteraCliente, y las escrituras del vínculo sólo las importa la consola;
//   · `trasladoTransaction` (la transacción que escribe en DOS negocios) sólo la importa
//     multilocal-actions, donde los dos ids salen de las filas de la red de la casa;
//   · el número del Inicio no arrastra la base al importarse (los tests de loaders lo cargan).
// Se lee el código sin comentarios: un comentario que explica la regla no la rompe.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const RAIZ = process.cwd();
const SRC = join(RAIZ, "src");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");
}

/** ¿La primera sentencia del archivo es la directiva "use server"? */
function esUseServer(src: string): boolean {
  return /^\s*["']use server["'];?/.test(sinComentarios(src));
}

function archivos(dir: string, filtro: (nombre: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === "generated" || e.name === "node_modules" ? [] : archivos(p, filtro);
    return filtro(e.name) ? [p] : [];
  });
}

/** Los `export async function nombre(params) { cuerpo }` de un archivo. */
function exportsDe(src: string): { nombre: string; params: string; cuerpo: string }[] {
  const codigo = sinComentarios(src);
  const salida: { nombre: string; params: string; cuerpo: string }[] = [];
  const re = /export\s+async\s+function\s+(\w+)\s*\(([\s\S]*?)\)\s*(?::[^{]*)?\{/g;
  for (let m = re.exec(codigo); m; m = re.exec(codigo)) {
    const inicio = m.index + m[0].length;
    const fin = codigo.indexOf("\n}", inicio);
    salida.push({ nombre: m[1], params: m[2], cuerpo: codigo.slice(inicio, fin === -1 ? undefined : fin) });
  }
  return salida;
}

test("el núcleo de Mis locales y exigirCasa no son 'use server'", () => {
  for (const nucleo of ["multilocal-core.ts", "traslado-core.ts", "catalogo-marca-core.ts"]) {
    assert.equal(esUseServer(leer(`src/lib/multilocal/${nucleo}`)), false, `${nucleo} es 'use server'`);
  }
  const casa = leer("src/lib/multilocal/casa.server.ts");
  assert.equal(esUseServer(casa), false);
  assert.match(sinComentarios(casa), /import\s+["']server-only["']/, "casa.server.ts importa la base: server-only");
});

test("cada export de multilocal-actions arranca con exigirCasa y ninguno recibe un id de negocio", () => {
  const src = leer("src/lib/multilocal/multilocal-actions.ts");
  assert.ok(esUseServer(src), "las actions son 'use server'");
  const exps = exportsDe(src);
  assert.ok(exps.length >= 3, `sólo ${exps.length} exports: ¿cambió el archivo?`);
  for (const e of exps) {
    const primera = e.cuerpo.trim().split("\n")[0];
    assert.match(primera, /^const \w+ = await exigirCasa\(/, `${e.nombre} no arranca con exigirCasa: "${primera}"`);
    assert.doesNotMatch(e.params, /tenant|casa|local|Id\b/i, `${e.nombre} recibe un id de negocio: (${e.params})`);
  }
  // Nada más que funciones async y tipos: un `export const` o un re-export sería otro endpoint.
  const codigo = sinComentarios(src);
  assert.doesNotMatch(codigo, /export\s+(const|let|var|default|\{|\*)/, "sólo se exportan funciones async y tipos");
});

test("las actions de la red de locales (consola) esperan primero la guardia del negocio (sesión + candado de CH)", () => {
  const src = leer("src/lib/operador/red-locales-actions.ts");
  assert.ok(esUseServer(src));
  const exps = exportsDe(src);
  assert.deepEqual(exps.map((e) => e.nombre).sort(), [
    "darDeBajaLocalAction",
    "revisarAltaEnRedAction",
    "sumarAltaALaRedAction",
    "vincularLocalAction",
  ]);
  for (const e of exps) {
    const primeraEspera = e.cuerpo.slice(e.cuerpo.indexOf("await")).split("\n")[0];
    assert.match(primeraEspera, /^await (requireOperadorParaNegocio|operadorParaNegocio)\(\{ id: casaId \}/, `${e.nombre} sin la guardia del negocio`);
  }
});

test("cada página y cada exportación de /admin/locales pasa por requireApp y exigirCasa", () => {
  const dir = join(SRC, "app", "admin", "(dashboard)", "locales");
  const entradas = archivos(dir, (n) => n === "page.tsx" || n === "route.ts");
  assert.ok(entradas.length >= 5, `sólo ${entradas.length} páginas/exports en /admin/locales`);
  for (const f of entradas) {
    const src = sinComentarios(readFileSync(f, "utf8"));
    const rel = relative(RAIZ, f);
    assert.match(src, /\brequireApp\(\s*["'][a-z-]+["']\s*\)/, `${rel} sin requireApp`);
    assert.match(src, /\bexigirCasa\(\s*["'](multilocal:manage|stock:read|traslados:manage)["']\s*\)/, `${rel} sin exigirCasa`);
    // La guardia va ANTES de leer la red: requireApp y exigirCasa preceden a la primera action.
    const guardia = Math.max(src.search(/\brequireApp\(/), src.search(/\bexigirCasa\(/));
    const lectura = src.search(
      /\b(redDeLaCasaAction|stockDeLaRedAction|ventasDeLaRedAction|catalogoDeLaMarcaAction|trasladosAction|remitoAction)\(/,
    );
    assert.ok(lectura === -1 || guardia < lectura, `${rel} lee la red antes de la guardia`);
  }
});

test("nadie fuera de la consola de GSG (y de la cartera del contador) escribe CarteraCliente", () => {
  const PERMITIDOS = new Set([
    // La cartera del contador: alta, re-alta y estado de SUS clientes (exigirEstudio).
    ["src", "lib", "cartera-actions.ts"].join(sep),
    // El vínculo casa → local: vincularEnTx / darDeBajaEnTx, que sólo importa la consola.
    ["src", "lib", "multilocal", "multilocal-core.ts"].join(sep),
  ]);
  const escribe = /\bcarteraCliente\s*\.\s*(create|createMany|createManyAndReturn|upsert|update|updateMany|updateManyAndReturn|delete|deleteMany)\s*\(/;
  const fuentes = archivos(SRC, (n) => /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n));
  assert.ok(fuentes.length > 100, "¿se movió src?");
  const escriben = fuentes.filter((f) => escribe.test(sinComentarios(readFileSync(f, "utf8")))).map((f) => relative(RAIZ, f));
  assert.deepEqual(escriben.filter((f) => !PERMITIDOS.has(f)), [], "escriben CarteraCliente sin permiso");
  assert.ok(escriben.length >= 2, "el test dejó de encontrar las escrituras que sí existen");

  // Las escrituras del vínculo (y el alta de un local dentro de la red) sólo las importa la
  // consola de GSG.
  const importan = fuentes
    .filter((f) => /\b(vincularEnTx|darDeBajaEnTx|sumarAltaEnTx)\b/.test(sinComentarios(readFileSync(f, "utf8"))))
    .map((f) => relative(RAIZ, f))
    .filter((f) => !f.endsWith(["multilocal", "multilocal-core.ts"].join(sep)));
  assert.deepEqual(importan, [["src", "lib", "operador", "red-locales-actions.ts"].join(sep)]);
});

test("trasladoTransaction (escribe en dos negocios) sólo la importa multilocal-actions", () => {
  const fuentes = archivos(SRC, (n) => /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n));
  const importan = fuentes
    .filter((f) => /\btrasladoTransaction\b/.test(sinComentarios(readFileSync(f, "utf8"))))
    .map((f) => relative(RAIZ, f))
    .sort();
  assert.deepEqual(importan, [
    ["src", "lib", "multilocal", "multilocal-actions.ts"].join(sep),
    ["src", "lib", "rls.ts"].join(sep),
  ]);
  // Las fases sueltas (sobre un `tx` cualquiera) no las usa nadie fuera de rls.ts: se prueban
  // en los tests, pero en el código van siempre dentro de trasladoTransaction.
  const fases = fuentes
    .filter((f) => /\bfasesSobre\b/.test(sinComentarios(readFileSync(f, "utf8"))))
    .map((f) => relative(RAIZ, f));
  assert.deepEqual(fases, [["src", "lib", "rls.ts"].join(sep)]);
  // Y en multilocal-actions la llama sólo la action del traslado, después de elegir el origen y
  // el destino entre los lugares de la red (validarUbicaciones).
  const acciones = exportsDe(leer("src/lib/multilocal/multilocal-actions.ts"));
  const conTraslado = acciones.filter((e) => /\btrasladoTransaction\(/.test(e.cuerpo));
  assert.deepEqual(conTraslado.map((e) => e.nombre), ["trasladarAction"]);
  const cuerpo = conTraslado[0].cuerpo;
  assert.ok(cuerpo.search(/\bvalidarUbicaciones\(/) !== -1 && cuerpo.search(/\bvalidarUbicaciones\(/) < cuerpo.search(/\btrasladoTransaction\(/));
  assert.ok(cuerpo.search(/\blocalesDeLaRed\(/) < cuerpo.search(/\bvalidarUbicaciones\(/), "los lugares salen de las filas de la casa");
});

test("el número del Inicio de Mis locales no importa la base al cargarse", () => {
  const src = sinComentarios(leer("src/apps/kpis/locales.server.ts"));
  // Sólo `import type` de las actions; el valor se importa recién al usarlo (import dinámico).
  for (const m of src.matchAll(/import\s+(type\s+)?[^;]*from\s+["']@\/lib\/multilocal\/multilocal-actions["']/g)) {
    assert.ok(m[1], "import de VALOR de multilocal-actions en locales.server.ts");
  }
  assert.doesNotMatch(src, /from\s+["']@\/lib\/(prisma|prisma-base|rls|operator-db)["']/);
});

test("los chequeos de forma de verdad detectan lo que prohíben (no pasan en vacío)", () => {
  const malo = `"use server";\nexport async function leerLocal(localTenantId: string) {\n  return tenantTransaction(() => 1, { tenantId: localTenantId });\n}\n`;
  assert.ok(esUseServer(malo));
  assert.equal(esUseServer(`// "use server"\nexport const x = 1;`), false);
  const [e] = exportsDe(malo);
  assert.equal(e.nombre, "leerLocal");
  assert.doesNotMatch(e.cuerpo.trim().split("\n")[0], /^const \w+ = await exigirCasa\(/);
  assert.match(e.params, /tenant|casa|local|Id\b/i);
});
