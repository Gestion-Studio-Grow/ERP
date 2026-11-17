// ============================================================================
// MIA-075 · T01b · trinquete: ninguna escritura a `CashMovement` fuera de `transaccionQueAsienta`.
//
// Se cuenta contra el código, no contra una lista a mano. Con el analizador de sintaxis de TypeScript (sin tipos, rápido)
// se recorre todo `src/` (sin tests ni el cliente generado) y:
//   A. se buscan las escrituras al libro: un método que escribe sobre el delegado `cashMovement` (create, update,
//      delete…), una escritura anidada sobre una relación que apunta a `CashMovement` (sacadas de schema.prisma, por
//      modelo y campo) y SQL a mano con INSERT/UPDATE/DELETE sobre "CashMovement". Todas tienen que estar en
//      `src/lib/caja/candado-asiento.server.ts`, y cada función de ese archivo que escribe tiene que entrar al candado.
//   B. se sigue hacia arriba cada llamada a las funciones que escriben (por nombre, resolviendo los imports) hasta la
//      transacción que la abre: tiene que ser `transaccionQueAsienta`. Una que llega a `tenantTransaction`, a
//      `$transaction` o a una función que nadie llama adentro de una transacción, falla con el camino entero.
// Si este test falla por una escritura nueva: que pase por `asentarEnCajaTx` (o las otras de candado-asiento.server.ts)
// y que su transacción sea `transaccionQueAsienta`. Ver el porqué en la cabecera de ese archivo.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

const RAIZ = process.cwd();
const SRC = join(RAIZ, "src");
const MODULO = "src/lib/caja/candado-asiento.server.ts";
const SCRIPTS = join(RAIZ, "scripts");
const ESCRITORES = ["asentarEnCajaTx", "borrarDeCajaTx", "asentarAjustesDelCierreTx", "quitarDelLibroTx"];
const LA_TRANSACCION = "transaccionQueAsienta";
/** Las que abren una transacción que no es la del candado. */
const OTRAS_TRANSACCIONES = new Set(["tenantTransaction", "$transaction", "bookingTransaction", "trasladoTransaction", "serializableTenantTransaction"]);
const ESCRIBE = /^(create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)$/;
const ANIDADA = new Set(["create", "createMany", "connectOrCreate", "connect", "upsert", "update", "updateMany", "delete", "deleteMany", "set", "disconnect"]);

type Archivo = { ruta: string; fuente: ts.SourceFile };

function archivosDe(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) {
      if (n === "generated" || n === "node_modules" || p === join(SRC, "test")) continue;
      archivosDe(p, out);
    } else if (/\.(tsx?|mts)$/.test(n) && !/\.(test|e2e|spec)\.tsx?$/.test(n) && !n.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

const leer = (p: string): Archivo => ({
  ruta: relative(RAIZ, p),
  fuente: ts.createSourceFile(p, readFileSync(p, "utf8"), ts.ScriptTarget.Latest, true, p.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS),
});
/** El código de la app: donde se buscan las escrituras (A) y las llamadas (B). */
const archivos: Archivo[] = archivosDe(SRC).map(leer);
/**
 * Los scripts que corre el dueño (`scripts/`): sólo como LLAMADORES en B (el reseteo previo a salir en vivo vacía el libro
 * desde ahí). Sus escrituras propias (corte inicial, importar la caja histórica) son herramientas fuera de línea, fuera
 * del alcance de T01b.
 */
const scripts: Archivo[] = archivosDe(SCRIPTS).map(leer);
const porRuta = new Map([...archivos, ...scripts].map((a) => [a.ruta, a]));

/** Relaciones (modelo → campos) que apuntan a CashMovement, leídas de schema.prisma. */
function relacionesAlLibro(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  let modelo = "";
  for (const linea of readFileSync(join(RAIZ, "prisma/schema.prisma"), "utf8").split("\n")) {
    const m = /^model (\w+) \{/.exec(linea);
    if (m) modelo = m[1];
    const c = /^\s+(\w+)\s+CashMovement(\[\])?\??\s/.exec(linea + " ");
    if (c && modelo) out.set(modelo[0].toLowerCase() + modelo.slice(1), (out.get(modelo[0].toLowerCase() + modelo.slice(1)) ?? new Set()).add(c[1]));
  }
  return out;
}

const donde = (a: Archivo, n: ts.Node) => `${a.ruta}:${a.fuente.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
const nombreLlamado = (c: ts.CallExpression): string | null =>
  ts.isIdentifier(c.expression) ? c.expression.text : ts.isPropertyAccessExpression(c.expression) ? c.expression.name.text : null;

function recorrer(n: ts.Node, f: (n: ts.Node) => void) {
  f(n);
  n.forEachChild((h) => recorrer(h, f));
}

type Funcion = ts.FunctionLikeDeclaration;
const esFuncion = (n: ts.Node): n is Funcion =>
  ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isMethodDeclaration(n);
function funcionQueEnvuelve(n: ts.Node): Funcion | null {
  for (let p = n.parent; p; p = p.parent) if (esFuncion(p)) return p;
  return null;
}
/** El nombre con el que se la llama: declaración, variable, propiedad o método. */
function nombreDe(f: Funcion): string | null {
  if ((ts.isFunctionDeclaration(f) || ts.isMethodDeclaration(f)) && f.name && ts.isIdentifier(f.name)) return f.name.text;
  const p = f.parent;
  if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
  if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) return p.name.text;
  return null;
}

/** A qué archivo del repo apunta un import, siguiendo un `export { x } from` si lo hay. */
function resolverImport(desde: string, spec: string, nombre: string, vistos = new Set<string>()): string | null {
  const base = spec.startsWith("@/") ? join(SRC, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(join(RAIZ, desde)), spec) : null;
  if (!base) return null;
  const ruta = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find((r) => existsSync(r) && statSync(r).isFile());
  if (!ruta) return null;
  const rel = relative(RAIZ, ruta);
  const a = porRuta.get(rel);
  if (!a || vistos.has(rel)) return rel;
  vistos.add(rel);
  for (const s of a.fuente.statements) {
    if (ts.isExportDeclaration(s) && s.moduleSpecifier && ts.isStringLiteral(s.moduleSpecifier) && s.exportClause && ts.isNamedExports(s.exportClause)) {
      if (s.exportClause.elements.some((e) => e.name.text === nombre)) return resolverImport(rel, s.moduleSpecifier.text, nombre, vistos) ?? rel;
    }
  }
  return rel;
}

/** ¿El identificador `nombre`, usado en `a`, es la función definida en `definida`? */
function apuntaA(a: Archivo, nombre: string, definida: string): boolean {
  if (a.ruta === definida) return true;
  for (const s of a.fuente.statements) {
    if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier)) continue;
    const nb = s.importClause?.namedBindings;
    if (nb && ts.isNamedImports(nb) && nb.elements.some((e) => e.name.text === nombre)) return resolverImport(a.ruta, s.moduleSpecifier.text, nombre) === definida;
  }
  return false;
}

/** `typeof f` en un tipo no es un uso: no corre nada. */
function enUnTipo(n: ts.Node): boolean {
  for (let p = n.parent; p; p = p.parent) if (ts.isTypeNode(p) || ts.isTypeAliasDeclaration(p) || ts.isInterfaceDeclaration(p)) return true;
  return false;
}

/** Usos de un nombre: llamadas `nombre(…)`/`x.nombre(…)` y referencias sueltas (`tenantTransaction(nombre)`). */
function usosDe(nombre: string, definida: string, esPropiedad: boolean): { a: Archivo; n: ts.Node }[] {
  const out: { a: Archivo; n: ts.Node }[] = [];
  for (const a of [...archivos, ...scripts]) {
    if (!a.fuente.text.includes(nombre)) continue;
    const propio = apuntaA(a, nombre, definida);
    recorrer(a.fuente, (n) => {
      if (ts.isCallExpression(n) && nombreLlamado(n) === nombre) {
        if (ts.isPropertyAccessExpression(n.expression) ? esPropiedad || propio : propio) out.push({ a, n });
      } else if (ts.isIdentifier(n) && n.text === nombre && propio && !ts.isCallExpression(n.parent) && !enUnTipo(n)) {
        const p = n.parent;
        const esDeclaracion = (ts.isFunctionDeclaration(p) || ts.isVariableDeclaration(p) || ts.isImportSpecifier(p) || ts.isExportSpecifier(p) || ts.isPropertyAccessExpression(p) || ts.isPropertyAssignment(p)) && (p as { name?: ts.Node }).name === n;
        if (!esDeclaracion) out.push({ a, n });
      } else if (ts.isIdentifier(n) && n.text === nombre && propio && ts.isCallExpression(n.parent) && n.parent.expression !== n) {
        out.push({ a, n }); // pasada como argumento: `tenantTransaction(nombre)`
      }
    });
  }
  return out;
}

/**
 * Sube desde un uso hasta la transacción. Devuelve los caminos que NO terminan en `transaccionQueAsienta`.
 * `vistos` corta los ciclos y lo ya probado.
 */
function caminosFuera(a: Archivo, uso: ts.Node, vistos: Map<string, string[]>, rastro: string[]): string[] {
  // Una función pasada por nombre a quien abre la transacción.
  if (ts.isIdentifier(uso) && ts.isCallExpression(uso.parent) && uso.parent.expression !== uso) {
    const quien = nombreLlamado(uso.parent);
    if (quien === LA_TRANSACCION) return [];
    if (quien && OTRAS_TRANSACCIONES.has(quien)) return [[...rastro, `${quien} en ${donde(a, uso)}`].join(" ← ")];
  }
  if (ts.isIdentifier(uso) && ts.isPropertyAssignment(uso.parent) && uso.parent.initializer === uso) {
    const prop = uso.parent.name.getText(a.fuente);
    return subirPorNombre(a, prop, true, vistos, [...rastro, `{ ${prop}: … } en ${donde(a, uso)}`]);
  }
  const f = funcionQueEnvuelve(uso);
  if (!f) return [[...rastro, `fuera de toda función en ${donde(a, uso)}`].join(" ← ")];
  // Una función anónima pasada a otra: si es la transacción, se terminó; si no (map, Promise.all…), corre donde la llaman.
  if (ts.isCallExpression(f.parent) && f.parent.arguments.includes(f as ts.Expression)) {
    const quien = nombreLlamado(f.parent);
    if (quien === LA_TRANSACCION) return [];
    if (quien && OTRAS_TRANSACCIONES.has(quien)) return [[...rastro, `${quien} en ${donde(a, f.parent)}`].join(" ← ")];
    return caminosFuera(a, f.parent, vistos, rastro);
  }
  const nombre = nombreDe(f);
  if (!nombre) return [[...rastro, `función sin nombre en ${donde(a, f)}: no se puede seguir`].join(" ← ")];
  return subirPorNombre(a, nombre, ts.isPropertyAssignment(f.parent) || ts.isMethodDeclaration(f), vistos, [...rastro, `${nombre} (${donde(a, f)})`]);
}

function subirPorNombre(a: Archivo, nombre: string, esPropiedad: boolean, vistos: Map<string, string[]>, rastro: string[]): string[] {
  const clave = `${a.ruta}#${nombre}`;
  if (vistos.has(clave)) return vistos.get(clave)!;
  vistos.set(clave, []);
  const usos = usosDe(nombre, a.ruta, esPropiedad);
  const fuera = usos.length === 0 ? [[...rastro, "nadie la llama adentro de una transacción"].join(" ← ")] : usos.flatMap((u) => caminosFuera(u.a, u.n, vistos, rastro));
  vistos.set(clave, fuera);
  return fuera;
}

/** Las escrituras al libro que hay en el código, con dónde y en qué función. */
function escriturasAlLibro(): { a: Archivo; n: ts.Node; que: string }[] {
  const relaciones = relacionesAlLibro();
  const out: { a: Archivo; n: ts.Node; que: string }[] = [];
  for (const a of archivos) {
    recorrer(a.fuente, (n) => {
      // tx.cashMovement.create(…), prisma.cashMovement.deleteMany(…), …
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ESCRIBE.test(n.expression.name.text)) {
        const del = n.expression.expression;
        if (ts.isPropertyAccessExpression(del) && del.name.text === "cashMovement") out.push({ a, n, que: `cashMovement.${n.expression.name.text}` });
        // Escritura anidada: tx.cashSession.create({ data: { movements: { create: … } } }).
        if (ts.isPropertyAccessExpression(del) && relaciones.has(del.name.text)) {
          const campos = relaciones.get(del.name.text)!;
          recorrer(n, (m) => {
            if (ts.isPropertyAssignment(m) && campos.has(m.name.getText(a.fuente)) && ts.isObjectLiteralExpression(m.initializer)) {
              const ops = m.initializer.properties.map((p) => p.name?.getText(a.fuente) ?? "").filter((x) => ANIDADA.has(x));
              if (ops.length) out.push({ a, n: m, que: `${del.name.text}.${m.name.getText(a.fuente)}: { ${ops.join(", ")} }` });
            }
          });
        }
      }
      // SQL a mano.
      if ((ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isStringLiteral(n)) && /"CashMovement"/.test(n.text) && /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"CashMovement"/i.test(n.text)) {
        out.push({ a, n, que: "SQL a mano" });
      }
    });
  }
  return out;
}

test("T01b · trinquete A: toda escritura a CashMovement del código está en candado-asiento.server.ts, y entra al candado", () => {
  const todas = escriturasAlLibro();
  const fuera = todas.filter((e) => e.a.ruta !== MODULO).map((e) => `${donde(e.a, e.n)} · ${e.que}`);
  assert.deepEqual(fuera, [], `escrituras al libro fuera de ${MODULO}: que pasen por asentarEnCajaTx (o las otras de ese archivo)`);
  const adentro = todas.filter((e) => e.a.ruta === MODULO);
  assert.ok(adentro.length >= ESCRITORES.length, `el módulo escribe (${adentro.length}): la búsqueda no puede quedar vacía`);
  for (const e of adentro) {
    const f = funcionQueEnvuelve(e.n);
    const nombre = f && nombreDe(f);
    assert.ok(nombre && ESCRITORES.includes(nombre), `${donde(e.a, e.n)}: escribe fuera de las funciones del candado (${nombre})`);
    assert.match(f!.getText(e.a.fuente), /entrarAlCandadoTx\(tx,/, `${nombre}: entra al candado (Serializable + cierre-dia) antes de escribir`);
  }
});

test("T01b · trinquete B: cada llamada a las funciones que escriben corre en transaccionQueAsienta, siguiendo el código hasta la transacción", () => {
  const modulo = porRuta.get(MODULO)!;
  const vistos = new Map<string, string[]>();
  let llamadas = 0;
  const fuera: string[] = [];
  for (const nombre of ESCRITORES) {
    const usos = usosDe(nombre, MODULO, false).filter((u) => u.a.ruta !== MODULO);
    llamadas += usos.length;
    for (const u of usos) fuera.push(...caminosFuera(u.a, u.n, vistos, [`${nombre} en ${donde(u.a, u.n)}`]));
  }
  assert.ok(modulo, MODULO);
  assert.ok(llamadas >= 20, `se encontraron ${llamadas} llamadas a las funciones que escriben: la búsqueda no puede quedar vacía`);
  assert.deepEqual([...new Set(fuera)].sort(), [], "caminos que escriben en la caja sin transaccionQueAsienta");
});

test("T01b · trinquete, el detector: encuentra las escrituras de un archivo de muestra (que no puede pasar vacío)", () => {
  const muestra = ts.createSourceFile(
    "x.ts",
    `async function f(tx) { await tx.cashMovement.create({ data: {} }); await tx.cashSession.create({ data: { movements: { create: {} } } }); await tx.$executeRaw\`DELETE FROM "CashMovement" WHERE id = 1\`; await tx.ejercicio.create({ data: { asientos: { create: {} } } }); }`,
    ts.ScriptTarget.Latest,
    true,
  );
  archivos.push({ ruta: "muestra.ts", fuente: muestra });
  try {
    const encontradas = escriturasAlLibro().filter((e) => e.a.ruta === "muestra.ts").map((e) => e.que);
    assert.deepEqual(encontradas, ["cashMovement.create", "cashSession.movements: { create }", "SQL a mano"], "Ejercicio.asientos es contabilidad, no el libro");
  } finally {
    archivos.pop();
  }
});
