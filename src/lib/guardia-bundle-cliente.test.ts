import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { builtinModules } from "node:module";
import ts from "typescript";

// ============================================================================
// GUARDIA DEL BUNDLE DEL NAVEGADOR — lo que `tsc` y los tests no ven.
// ============================================================================
//
// El build real lo hace Vercel (el dueño decidió no compilar en local). Hay una clase de
// error que `tsc --noEmit` deja pasar y que rompe el build de Turbopack: un módulo
// ALCANZABLE desde un client component ("use client") que importa por VALOR algo de
// servidor. Caso real, medido: `src/lib/turnos/anulacion.ts` hacía
//
//     import { Prisma as PrismaNs } from "@/generated/prisma/client";   // para un instanceof
//
// y como `AppointmentRow.tsx` (client) lo importa, Turbopack arrastró el runtime de Prisma
// al bundle del browser y cortó con "the chunking context (unknown) does not support
// external modules (request: node:module)". Hoy ese archivo usa `import type` y chequea el
// error por forma. Este test hace que la próxima vez falle `npm test` y no el deploy.
//
// Las citas "archivo:línea" de Next/Turbopack de abajo son del fuente de la versión instalada
// (vercel/next.js @ v16.3.4, la de node_modules/next/package.json).
//
// ── QUÉ SE AUDITA (las entradas) ────────────────────────────────────────────
//   · Todo archivo de src/ con prólogo "use client" (.ts .tsx .js .jsx .mjs .cjs .mts .cts)
//     que Next compile: es archivo de ruta (page, layout, error…) o alguien lo importa.
//     Un "use client" que nadie importa (salvo tests) y no es ruta es HUÉRFANO: Turbopack no
//     lo compila (una cadena de archivos muertos que se importan entre sí sigue auditada), así que lo que tenga adentro no rompe el deploy. Se audita igual pero va a
//     `enHuerfanos` (diagnóstico), no a `violaciones`: si no, `npm test` falla por código que
//     Vercel buildea bien y la guardia se vuelve ruido. En cuanto alguien lo importa, cuenta.
//   · `src/instrumentation-client.*` e `instrumentation-client.*` en la raíz: entran al bundle
//     del browser SIN directiva (next_import_map.rs:1461-1468).
//   · Pages Router (`src/pages`, `pages`) y un `app/` en la raíz (que desplazaría a src/app):
//     NO están modelados. Si aparecen, van a `noModelado` y el test del árbol real falla, en
//     vez de dar un verde falso.
//
// ── CÓMO SE RECORRE ─────────────────────────────────────────────────────────
// Desde cada entrada, el grafo de imports de VALOR: `import`, `export … from`, `import()`,
// `require()`, `new Worker|SharedWorker(new URL(…, import.meta.url))` y
// `navigator.serviceWorker.register(new URL(…))` (Turbopack los empaqueta para el browser:
// turbopack-ecmascript/src/references/mod.rs:1940-1985 y :3064). `import(`../lib/${x}`)` con prefijo
// estático se EXPANDE a todos los archivos que calzan, como hace Turbopack (el comodín cruza
// `/` salvo carpetas ocultas, node_modules y __tests__: turbopack-core/src/resolve/pattern.rs:946-975).
// Sin prefijo resoluble (`import(x)`) Turbopack no empaqueta nada: queda en `dinamicos`.
// Resolución con el orden de Turbopack: .tsx .ts .jsx .js .mjs (turbopack-resolve/src/resolve.rs:131-150;
// next.config no define resolveExtensions), alias `@/` → src/, index.
// No entra a archivos "use server" ni "use cache": en la capa cliente Next reemplaza sus
// exports por `createServerReference` (server_actions.rs:2184-2205), así que es legal y lo de
// adentro no viaja.
// PAQUETES DE TERCEROS: se entra, con la resolución del browser (exports con condiciones
// browser/module/production/import|require/default, campo `browser` string, module, main; y
// el campo `browser` objeto del paquete: `"fs": false` o `"./node.js": "./browser.js"`). Así
// `pg-pool` → require("pg") o una lib de sockets → "net" se ven con la cadena. No se entra a
// next, react, react-dom ni scheduler: su código cliente depende de ramas muertas que Next
// poda en compilación y que este análisis no reproduce.
//
// ── QUÉ ES "POR VALOR" ──────────────────────────────────────────────────────
// Hay DOS filtros en Turbopack y corren en momentos distintos:
//   1. El VALIDADOR de Next (react_server_components.rs) corre en Preprocess
//      (next_react_server_components.rs, EcmascriptTransformStage::Preprocess), y los preprocess
//      agregados se ponen ANTES del strip de TypeScript (turbopack/src/lib.rs:553-556 +
//      module_options/mod.rs:755-763). Se aplica en la capa SSR del cliente
//      (next_server/context.rs:705, is_react_server_layer=false) a todo módulo que no sea
//      "use server"/"use cache" ni de node_modules (rsc.rs:867-870, 1153-1161). Ve el TS crudo:
//      sólo descarta `import type` y los especificadores `{ type X }` (rsc.rs:505-536), y
//      corta por la FUENTE aunque no quede ningún especificador. Prohíbe:
//        · fuentes `server-only`, `next/headers`, `next/root-params` (rsc.rs:710-714);
//        · nombres `after` de `next/server` y `revalidatePath`, `revalidateTag`, `cacheLife`,
//          `unstable_cacheLife`, `cacheTag`, `unstable_cacheTag` de `next/cache` (rsc.rs:716-730).
//      Por eso `import { cookies } from "next/headers"` usado SÓLO como tipo, o
//      `import { type cookies } from "next/headers"`, rompen igual: hace falta `import type`.
//   2. El strip de TypeScript (sólo .ts .tsx .mts .cts): `import type`, `{ type X }` puros, y
//      `import { X }` cuyo X sólo aparece en posición de tipo se borran (import elision). No
//      cuentan, pero se listan en `elididos`. En .js/.jsx/.mjs/.cjs NO hay strip: todo import
//      se conserva aunque no se use. Con `verbatimModuleSyntax: true` en el tsconfig (se sigue
//      `extends`, como Turbopack: transform_options.rs:69-75 + turbopack-resolve/src/typescript.rs:89) no hay elisión en ningún lado.
//      Cualquier otro uso (instanceof, `new`, llamada, JSX, `X.algo` en expresión, re-export
//      local) mantiene el import. El análisis de uso es sintáctico y CONSERVADOR: ante la duda
//      cuenta como valor. Puede sobre-reportar; no sub-reportar.
//
// ── QUÉ NO PUEDE ALCANZAR un client component por import de valor ───────────
//   · `@/generated/prisma/*`, salvo las tres entradas que el generador de Prisma marca aptas
//     para el browser y que no tocan Node: `enums`, `browser`, `internal/prismaNamespaceBrowser`.
//     Igual se entra y se recorre adentro: si una regeneración les mete un import de Node, salta.
//   · `@/lib/prisma`, `@/lib/rls`, `@/lib/operator-db`; archivos `*.server.*` de src/;
//   · `pg`, `@prisma/*` (salvo el runtime index-browser), `server-only`, `next/headers`,
//     `next/root-params` (por cualquier vía: `server-only` es ImportMapping::Error en el import
//     map del cliente, next_import_map.rs:1574-1597);
//   · builtins de Node (`node:*` o pelados) SIN polyfill de navegador: fs, module, net, tls,
//     child_process, worker_threads… — `node:module` es exactamente el que rompió; addons `.node`.
// Las reglas de ruta se aplican aunque el archivo no exista (clon sin `prisma generate`).
//
// ── AVISO, NO FALLA ─────────────────────────────────────────────────────────
// Los builtins a los que Next les pone polyfill en el cliente (crypto → crypto-browserify,
// buffer, path, stream, util, events…). Evidencia: NEXT_ALIASES en next_import_map.rs:628-684,
// registrados para el contexto cliente App como `node:{nombre}` (import map, :224-231) y como
// `{nombre}` pelado (fallback, :247-266). El READY de 8cd6119 (dpl_FeaVo1KtwHfueWVKZ54KLrTctPV1),
// con CarteraPanel → … → `node:crypto`, es consistente pero NO es prueba suficiente: con
// turbopackInferModuleSideEffects (true por defecto, config-shared.js:284) Turbopack pudo no
// haber cargado ese módulo. El fuente sí lo es.
//
// ── LÍMITES CONOCIDOS (todos en la dirección de sobre-reportar, salvo donde se dice) ──
//   · Barrels: se recorre TODO lo que un barrel re-exporta. Turbopack, con inferencia de
//     efectos laterales, puede no cargar un re-export que nadie usa; la guardia lo marca igual.
//     Es a propósito: el arreglo (importar del submódulo) es barato; el deploy roto no.
//   · No se podan ramas muertas (`typeof window`, `process.env.X`) ni se tratan como opcionales
//     los `require` dentro de try en paquetes de terceros.
//   · next, react, react-dom y scheduler no se recorren (ver arriba). SUB-reporta si uno de
//     ellos arrastrara algo de servidor; eso lo cubre el propio Next.
//   · No se lee `resolveExtensions` ni `typescript.tsconfigPath` de next.config (hoy no están),
//     ni `require.context`, `import.meta.glob` o comentarios `turbopackIgnore`.

// ── Reglas ──────────────────────────────────────────────────────────────────

/** Entradas de `src/generated/prisma` que el generador declara aptas para el browser. */
const PRISMA_GENERADO_APTO_BROWSER = new Set([
  "generated/prisma/enums",
  "generated/prisma/browser",
  "generated/prisma/internal/prismaNamespaceBrowser",
]);

/** Módulos de servidor del repo, por ruta relativa a src/ sin extensión (ni `/index`). */
const MODULOS_SERVIDOR_DEL_REPO = new Map<string, string>([
  ["lib/prisma", "cliente Prisma del servidor"],
  ["lib/rls", "cliente Prisma con RLS (servidor)"],
  ["lib/operator-db", "cliente de base del operador (servidor)"],
]);

/** Paquetes de @prisma/* que sí están hechos para el browser. */
const PRISMA_PAQUETES_APTOS_BROWSER = new Set(["@prisma/client/runtime/index-browser"]);

/** `invalid_client_imports` del validador de Next (react_server_components.rs:710-714). */
const NEXT_PROHIBIDOS_EN_CLIENTE = new Set(["server-only", "next/headers", "next/root-params"]);

/** `invalid_client_lib_apis_mapping` (react_server_components.rs:716-730): por NOMBRE importado. */
const NEXT_APIS_PROHIBIDAS_EN_CLIENTE = new Map<string, Set<string>>([
  ["next/server", new Set(["after"])],
  ["next/cache", new Set(["revalidatePath", "revalidateTag", "cacheLife", "unstable_cacheLife", "cacheTag", "unstable_cacheTag"])],
]);

/** Paquetes que no se recorren por dentro (ver cabecera). */
const PAQUETES_DE_CONFIANZA = new Set(["next", "react", "react-dom", "scheduler"]);

const BUILTINS_NODE = new Set(builtinModules.filter((m) => !m.startsWith("_")));

/**
 * Builtins que Next resuelve a un polyfill en el bundle del cliente (NEXT_ALIASES,
 * next_import_map.rs:628-684; la misma lista en webpack-config.js:1536-1561). Sólo el nombre
 * exacto: `path/posix`, `stream/web`, `fs/promises`… no tienen polyfill.
 */
const BUILTINS_CON_POLYFILL_DE_NEXT = new Set([
  "assert", "buffer", "constants", "crypto", "domain", "events", "http", "https", "os", "path",
  "process", "punycode", "querystring", "stream", "string_decoder", "sys", "timers", "tty", "url",
  "util", "vm", "zlib",
]);

type Gravedad = "rompe" | "aviso";
type Motivo = { motivo: string; gravedad: Gravedad };
const rompe = (motivo: string): Motivo => ({ motivo, gravedad: "rompe" });

function raizDePaquete(esp: string): string {
  return esp.split("/").slice(0, esp.startsWith("@") ? 2 : 1).join("/");
}

function motivoPaqueteProhibido(esp: string): Motivo | null {
  const sinPrefijo = esp.startsWith("node:") ? esp.slice(5) : esp;
  const raiz = raizDePaquete(sinPrefijo);
  if (esp.startsWith("node:") || BUILTINS_NODE.has(raiz) || BUILTINS_NODE.has(esp)) {
    return BUILTINS_CON_POLYFILL_DE_NEXT.has(sinPrefijo)
      ? { motivo: `builtin de Node con polyfill de Next (${sinPrefijo}): pasa el build, pesa en el bundle`, gravedad: "aviso" }
      : rompe("builtin de Node sin polyfill de navegador");
  }
  if (raiz === "pg") return rompe("driver de Postgres (pg)");
  if (raiz.startsWith("@prisma/") && !PRISMA_PAQUETES_APTOS_BROWSER.has(esp)) return rompe("paquete @prisma/* de servidor");
  if (NEXT_PROHIBIDOS_EN_CLIENTE.has(esp)) return rompe(`${esp}: Next lo prohíbe en el grafo del cliente`);
  return null;
}

/** Sirve con la ruta resuelta o, si el archivo no está en disco, con la ruta pedida sin extensión. */
function motivoArchivoProhibido(absoluto: string, raizSrc: string): Motivo | null {
  if (/\.node$/.test(absoluto)) return rompe("addon nativo de Node (.node)");
  const rel = path.relative(raizSrc, absoluto).split(path.sep).join("/");
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null; // node_modules u otro fuera de src/
  if (/\.server(\.[cm]?[jt]sx?)?$/.test(rel)) return rompe("archivo *.server.*");
  const sinExt = rel.replace(/\.(d\.)?[cm]?[jt]sx?$/, "").replace(/\/index$/, "");
  const delRepo = MODULOS_SERVIDOR_DEL_REPO.get(sinExt);
  if (delRepo) return rompe(delRepo);
  if ((sinExt === "generated/prisma" || sinExt.startsWith("generated/prisma/")) && !PRISMA_GENERADO_APTO_BROWSER.has(sinExt)) {
    return rompe("Prisma generado de servidor (sólo enums/browser son aptos para el cliente)");
  }
  return null;
}

// ── Parseo (compilador de TypeScript) ───────────────────────────────────────

type Directiva = "use client" | "use server" | "use cache" | null;
type TipoArista = "import" | "export-from" | "import()" | "require" | "worker" | "plantilla";
type Arista = {
  especificador: string;
  linea: number;
  tipo: TipoArista;
  /** El validador de Next lo rechaza (corre antes del strip de TS): rompe sin mirar el uso. */
  motivoNext?: string;
  /** `import(`../x/${y}`)`: las partes constantes; entre cada par va un comodín. */
  partes?: string[];
};
type Modulo = { directiva: Directiva; aristas: Arista[]; elididos: Arista[]; dinamicos: Arista[] };

const EXT_CODIGO = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;
const EXT_TS = /\.(ts|tsx|mts|cts)$/;
const ES_TEST = /\.(test|spec)\.[cm]?[jt]sx?$/;

function scriptKind(archivo: string): ts.ScriptKind {
  if (archivo.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (archivo.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (/\.[cm]?js$/.test(archivo)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function leerDirectiva(sf: ts.SourceFile): Directiva {
  // El prólogo de directivas: sentencias de string literal consecutivas al tope del archivo.
  for (const st of sf.statements) {
    if (!ts.isExpressionStatement(st) || !ts.isStringLiteral(st.expression)) break;
    const t = st.expression.text;
    if (t === "use client" || t === "use server") return t;
    if (t === "use cache" || t.startsWith("use cache: ")) return "use cache";
  }
  return null;
}

const esFrontera = (d: Directiva) => d === "use server" || d === "use cache";

/** ¿Este identificador está en posición de tipo? (lo que SWC/tsc borran al emitir JS) */
function enPosicionDeTipo(id: ts.Node): boolean {
  let hijo: ts.Node = id;
  for (let n = id.parent; n; hijo = n, n = n.parent) {
    if (ts.isExpressionWithTypeArguments(n)) {
      // `class A extends B` es VALOR; `implements B` e `interface I extends B` son tipo;
      // una instanciación `f<T>` en expresión también es valor.
      if (hijo !== n.expression) continue; // es un argumento de tipo: seguir subiendo
      const hc = n.parent;
      if (ts.isHeritageClause(hc)) {
        if (hc.token === ts.SyntaxKind.ImplementsKeyword) return true;
        return ts.isInterfaceDeclaration(hc.parent);
      }
      return false;
    }
    if (ts.isTypeNode(n)) return true;
    if (ts.isStatement(n) || ts.isSourceFile(n)) return false;
  }
  return false;
}

/** ¿Este identificador es una REFERENCIA a un binding (y no un nombre de propiedad, etiqueta…)? */
function esReferencia(id: ts.Identifier): boolean {
  const p = id.parent;
  if (!p) return false;
  if (ts.isImportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p) || ts.isImportEqualsDeclaration(p)) return false;
  if (ts.isPropertyAccessExpression(p) && p.name === id) return false;
  if (ts.isQualifiedName(p) && p.right === id) return false;
  if (
    (ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isPropertySignature(p) ||
      ts.isMethodDeclaration(p) || ts.isMethodSignature(p) || ts.isGetAccessorDeclaration(p) ||
      ts.isSetAccessorDeclaration(p) || ts.isEnumMember(p) || ts.isJsxAttribute(p) ||
      ts.isTypeAliasDeclaration(p) || ts.isInterfaceDeclaration(p) || ts.isTypeParameterDeclaration(p)) &&
    p.name === id
  ) return false;
  if (ts.isBindingElement(p) && p.propertyName === id) return false;
  if ((ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p)) && p.label === id) return false;
  if (ts.isExportSpecifier(p)) {
    const decl = p.parent.parent;
    if (decl.moduleSpecifier || decl.isTypeOnly || p.isTypeOnly) return false; // re-export: no es uso local
    if (p.propertyName && p.name === id) return false; // `export { X as Y }`: Y es el alias exportado
  }
  return true;
}

/** Nombres referenciados en posición de VALOR en todo el archivo. */
function nombresUsadosComoValor(sf: ts.SourceFile): Set<string> {
  const usados = new Set<string>();
  const visitar = (n: ts.Node): void => {
    if (ts.isIdentifier(n) && esReferencia(n) && !enPosicionDeTipo(n)) usados.add(n.text);
    ts.forEachChild(n, visitar);
  };
  visitar(sf);
  return usados;
}

/**
 * Réplica de collect_top_level_directives_and_imports + assert_client_graph
 * (react_server_components.rs:505-536 y 867-900): ve el import ANTES del strip de TS.
 */
function motivoDelValidadorDeNext(st: ts.ImportDeclaration, fuente: string): string | null {
  if (st.importClause?.isTypeOnly) return null;
  if (NEXT_PROHIBIDOS_EN_CLIENTE.has(fuente)) {
    return `Next rechaza "${fuente}" en el grafo del cliente; su validador corre ANTES de borrar ` +
      "los tipos, así que ni un uso sólo de tipo ni `{ type X }` lo salvan: usá `import type`";
  }
  const apis = NEXT_APIS_PROHIBIDAS_EN_CLIENTE.get(fuente);
  const nb = st.importClause?.namedBindings;
  if (!apis || !nb || !ts.isNamedImports(nb)) return null;
  const culpable = nb.elements.find((e) => !e.isTypeOnly && apis.has((e.propertyName ?? e.name).text));
  return culpable
    ? `\`${(culpable.propertyName ?? culpable.name).text}\` de "${fuente}" es de servidor: Next lo rechaza en el grafo del cliente`
    : null;
}

/** Partes constantes de un string armado: "a" → ["a"]; `a${x}b` → ["a","b"]; "a" + x → ["a",""]. */
function partesDe(e: ts.Expression): string[] {
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return [e.text];
  if (ts.isParenthesizedExpression(e)) return partesDe(e.expression);
  if (ts.isTemplateExpression(e)) return [e.head.text, ...e.templateSpans.map((s) => s.literal.text)];
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const i = partesDe(e.left);
    const d = partesDe(e.right);
    return [...i.slice(0, -1), i[i.length - 1] + d[0], ...d.slice(1)];
  }
  return ["", ""];
}

/** `new URL(x, import.meta.url)` → x. */
function urlDeImportMeta(e: ts.Expression | undefined): ts.Expression | null {
  if (!e || !ts.isNewExpression(e) || !ts.isIdentifier(e.expression) || e.expression.text !== "URL") return null;
  const [a0, a1] = e.arguments ?? [];
  return a0 && a1 && ts.isPropertyAccessExpression(a1) && a1.name.text === "url" && ts.isMetaProperty(a1.expression) ? a0 : null;
}

const PREFIJO_RESOLUBLE = /^(\.\.?\/|@\/)/;

function analizarModulo(archivo: string, texto: string, opts: { elidir: boolean; validarNext: boolean }): Modulo {
  const sf = ts.createSourceFile(archivo, texto, ts.ScriptTarget.Latest, true, scriptKind(archivo));
  const linea = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const aristas: Arista[] = [];
  const elididos: Arista[] = [];
  const dinamicos: Arista[] = [];
  let usados: Set<string> | null = null;
  const usadosComoValor = () => (usados ??= nombresUsadosComoValor(sf));

  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const arista: Arista = { especificador: st.moduleSpecifier.text, linea: linea(st), tipo: "import" };
      const motivoNext = opts.validarNext ? motivoDelValidadorDeNext(st, arista.especificador) : null;
      if (motivoNext) { aristas.push({ ...arista, motivoNext }); continue; } // antes de cualquier elisión
      const clausula = st.importClause;
      if (!clausula) { aristas.push(arista); continue; } // `import "x"`: efecto lateral, siempre viaja
      if (clausula.isTypeOnly) continue; // `import type …`
      const ligados: string[] = [];
      if (clausula.name) ligados.push(clausula.name.text);
      const nb = clausula.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) ligados.push(nb.name.text);
      let todosSonTipo = true;
      if (nb && ts.isNamedImports(nb)) {
        for (const el of nb.elements) if (!el.isTypeOnly) { ligados.push(el.name.text); todosSonTipo = false; }
      }
      if (!opts.elidir) { aristas.push(arista); continue; } // JS o verbatimModuleSyntax: todo import sin `type` viaja
      if (ligados.length === 0) {
        // `import { type A }` puro se borra; `import {} from "x"` se conserva como efecto lateral.
        if (nb && ts.isNamedImports(nb) && nb.elements.length > 0 && todosSonTipo) continue;
        aristas.push(arista);
        continue;
      }
      if (ligados.some((n) => usadosComoValor().has(n))) aristas.push(arista);
      else elididos.push(arista);
      continue;
    }
    if (ts.isImportEqualsDeclaration(st) && !st.isTypeOnly && ts.isExternalModuleReference(st.moduleReference)) {
      const e = st.moduleReference.expression;
      if (ts.isStringLiteral(e)) aristas.push({ especificador: e.text, linea: linea(st), tipo: "require" });
      continue;
    }
    if (ts.isExportDeclaration(st) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
      if (st.isTypeOnly) continue; // `export type { … } from` / `export type * from`
      const ec = st.exportClause;
      if (ec && ts.isNamedExports(ec) && ec.elements.length > 0 && ec.elements.every((e) => e.isTypeOnly)) continue;
      aristas.push({ especificador: st.moduleSpecifier.text, linea: linea(st), tipo: "export-from" });
    }
  }

  // `import()`, `require()`, workers: en cualquier profundidad, con literal o con plantilla.
  const agregar = (arg: ts.Expression, tipo: TipoArista, nodo: ts.Node): void => {
    const partes = partesDe(arg);
    const l = linea(nodo);
    if (tipo === "worker" && !PREFIJO_RESOLUBLE.test(partes[0])) return; // URL absoluta: no se empaqueta
    if (partes.length === 1) { aristas.push({ especificador: partes[0], linea: l, tipo }); return; }
    const especificador = partes.join("${…}");
    if (PREFIJO_RESOLUBLE.test(partes[0])) aristas.push({ especificador, linea: l, tipo: "plantilla", partes });
    else dinamicos.push({ especificador, linea: l, tipo });
  };
  const visitar = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && n.arguments.length > 0) {
      const f = n.expression;
      if (f.kind === ts.SyntaxKind.ImportKeyword) agregar(n.arguments[0], "import()", n);
      else if (ts.isIdentifier(f) && f.text === "require") agregar(n.arguments[0], "require", n);
      else if (ts.isPropertyAccessExpression(f) && f.name.text === "register" &&
        ts.isPropertyAccessExpression(f.expression) && f.expression.name.text === "serviceWorker") {
        const u = urlDeImportMeta(n.arguments[0]);
        if (u) agregar(u, "worker", n);
      }
    } else if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && /^(Shared)?Worker$/.test(n.expression.text)) {
      const u = urlDeImportMeta(n.arguments?.[0]);
      if (u) agregar(u, "worker", n);
    }
    ts.forEachChild(n, visitar);
  };
  visitar(sf);

  return { directiva: leerDirectiva(sf), aristas, elididos, dinamicos };
}

// ── Resolución ──────────────────────────────────────────────────────────────

/** Orden de Turbopack sin `resolveExtensions` (turbopack-resolve/src/resolve.rs:131-150). */
const EXTENSIONES = [".tsx", ".ts", ".jsx", ".js", ".mjs"];
/** Turbopack no las prueba sin extensión; van al final sólo para no perder de vista el archivo. */
const EXTENSIONES_TODAS = [...EXTENSIONES, ".mts", ".cts", ".cjs"];

function esArchivo(p: string): boolean {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}
function esDirectorio(p: string): boolean {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

/** Archivo, archivo + extensión, `./x.js` escrito al estilo ESM apuntando a `x.ts`, o index. */
function resolverRuta(base: string): string | null {
  const candidatos = [base, ...EXTENSIONES_TODAS.map((e) => base + e)];
  if (/\.[cm]?jsx?$/.test(base)) {
    const sinExt = base.replace(/\.[cm]?jsx?$/, "");
    candidatos.push(...EXTENSIONES_TODAS.map((e) => sinExt + e));
  }
  candidatos.push(...EXTENSIONES_TODAS.map((e) => path.join(base, "index" + e)));
  return candidatos.find(esArchivo) ?? null;
}

/**
 * `null` si no es del repo (paquete). Si es relativo o `@/`: la ruta absoluta del archivo o
 * —si no está en disco— la pedida con `existe: false`, para aplicarle igual las reglas de ruta.
 */
function resolverDelRepo(esp: string, desde: string, raizSrc: string): { ruta: string; existe: boolean } | null {
  let base: string;
  if (esp.startsWith("@/")) base = path.join(raizSrc, esp.slice(2));
  else if (esp.startsWith("./") || esp.startsWith("../") || esp === "." || esp === "..") base = path.resolve(path.dirname(desde), esp);
  else return null;
  const ruta = resolverRuta(base);
  return ruta ? { ruta, existe: true } : { ruta: base, existe: false };
}

const enNodeModules = (p: string) => p.split(path.sep).includes("node_modules");

type Pkg = { dir: string; json: Record<string, unknown> };
const CACHE_PKG = new Map<string, Record<string, unknown> | null>();

function leerPkg(dir: string): Record<string, unknown> | null {
  if (!CACHE_PKG.has(dir)) {
    let json: Record<string, unknown> | null = null;
    try { json = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")); } catch { /* no hay */ }
    CACHE_PKG.set(dir, json);
  }
  return CACHE_PKG.get(dir)!;
}

/** El package.json con `name` más cercano a un archivo de node_modules. */
function paqueteDelArchivo(archivo: string): Pkg | null {
  for (let d = path.dirname(archivo); path.basename(d) !== "node_modules" && path.dirname(d) !== d; d = path.dirname(d)) {
    const json = leerPkg(d);
    if (json?.name) return { dir: d, json };
  }
  return null;
}

/** Campo `browser` objeto del paquete: `"fs": false`, `"./node.js": "./browser.js"`. */
function aliasBrowser(pkg: Pkg | null, pedido: { paquete: string } | { ruta: string }): string | false | undefined {
  const b = pkg?.json.browser;
  if (!b || typeof b !== "object") return undefined;
  const mapa = b as Record<string, string | false>;
  if ("paquete" in pedido) return Object.hasOwn(mapa, pedido.paquete) ? mapa[pedido.paquete] : undefined;
  for (const [k, v] of Object.entries(mapa)) {
    if (k.startsWith(".") && resolverRuta(path.resolve(pkg!.dir, k)) === pedido.ruta) return v;
  }
  return undefined;
}

/** Campo `exports` (algoritmo de Node, condiciones del cliente de Turbopack). */
function resolverExports(exportsCampo: unknown, sub: string, condiciones: string[]): string | null {
  const clave = sub ? `./${sub}` : ".";
  const esMapa = !!exportsCampo && typeof exportsCampo === "object" && !Array.isArray(exportsCampo) &&
    Object.keys(exportsCampo).some((k) => k.startsWith("."));
  const mapa = (esMapa ? exportsCampo : { ".": exportsCampo }) as Record<string, unknown>;
  const objetivo = (t: unknown, estrella: string | null): string | null => {
    if (typeof t === "string") return estrella === null ? t : t.split("*").join(estrella);
    if (Array.isArray(t)) { for (const x of t) { const r = objetivo(x, estrella); if (r) return r; } return null; }
    if (t && typeof t === "object") {
      for (const [k, v] of Object.entries(t)) {
        if (k !== "default" && !condiciones.includes(k)) continue;
        const r = objetivo(v, estrella);
        if (r) return r;
      }
    }
    return null;
  };
  if (Object.hasOwn(mapa, clave)) return objetivo(mapa[clave], null);
  let mejor: { k: string; estrella: string } | null = null;
  for (const k of Object.keys(mapa)) {
    const i = k.indexOf("*");
    if (i < 0) continue;
    const [pre, post] = [k.slice(0, i), k.slice(i + 1)];
    if (clave.length >= pre.length + post.length && clave.startsWith(pre) && clave.endsWith(post) && (!mejor || pre.length > mejor.k.indexOf("*"))) {
      mejor = { k, estrella: clave.slice(pre.length, clave.length - post.length) };
    }
  }
  return mejor ? objetivo(mapa[mejor.k], mejor.estrella) : null;
}

/** Un paquete pelado → el archivo que Turbopack cargaría en el browser, o null si no está. */
function resolverPaquete(esp: string, desde: string, tipo: TipoArista): string | null {
  const nombre = raizDePaquete(esp);
  const sub = esp.slice(nombre.length + 1);
  let dir: string | null = null;
  for (let d = path.dirname(desde); ; d = path.dirname(d)) {
    const c = path.join(d, "node_modules", nombre);
    if (path.basename(d) !== "node_modules" && leerPkg(c)) { dir = c; break; }
    if (path.dirname(d) === d) break;
  }
  if (!dir) return null;
  const json = leerPkg(dir)!;
  let rel: string | null;
  if (json.exports !== undefined) {
    // client/context.rs:184-192 + resolve.rs:77-121: browser y module prendidas; import|require según la referencia.
    rel = resolverExports(json.exports, sub, ["browser", "module", "production", tipo === "require" ? "require" : "import"]);
  } else {
    const campo = (k: string) => (typeof json[k] === "string" ? (json[k] as string) : undefined);
    rel = sub || campo("browser") || campo("module") || campo("main") || "index";
  }
  return rel ? resolverRuta(path.resolve(dir, rel)) : null;
}

/** Los archivos que calzan con `import(`../lib/${x}`)` (pattern.rs:946-975). */
function expandirPlantilla(partes: string[], desde: string, raizSrc: string): string[] {
  const dirPedido = partes[0].slice(0, partes[0].lastIndexOf("/") + 1);
  const base = dirPedido.startsWith("@/") ? path.join(raizSrc, dirPedido.slice(2)) : path.resolve(path.dirname(desde), dirPedido);
  if (!esDirectorio(base)) return [];
  const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${partes.map(escapar).join(".*")}$`);
  const out: string[] = [];
  const recorrer = (dir: string): void => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name.startsWith(".") || ent.name === "node_modules" || /^__tests?__$/.test(ent.name)) continue;
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) { recorrer(p); continue; }
      if (!EXT_CODIGO.test(ent.name) || ent.name.endsWith(".d.ts")) continue;
      const pedido = dirPedido + path.relative(base, p).split(path.sep).join("/");
      const sinExt = pedido.replace(/\.[cm]?[jt]sx?$/, "");
      if ([pedido, sinExt, sinExt.replace(/\/index$/, "")].some((c) => re.test(c))) out.push(p);
    }
  };
  recorrer(base);
  return out.sort();
}

// ── Recorrido ───────────────────────────────────────────────────────────────

type Paso = { archivo: string; linea: number; tipo: TipoArista };
type Violacion = {
  cliente: string;
  /** Saltos cliente → … → último archivo, cada uno con la línea del import que sigue. */
  cadena: Paso[];
  especificador: string;
  resuelto: string | null;
  motivo: string;
  gravedad: Gravedad;
};
type Auditoria = {
  /** Entradas del bundle del browser que Next compila (ver cabecera). */
  clientes: string[];
  /** "use client" que nadie importa y no son ruta: Turbopack no los compila. */
  huerfanos: string[];
  /** Lo que rompe el build de Turbopack. El test del árbol real exige cero. */
  violaciones: Violacion[];
  /** Builtins con polyfill de Next: el build pasa, el bundle engorda. Informativo. */
  avisos: Violacion[];
  /** Lo que rompería si un huérfano se empezara a importar. Informativo. */
  enHuerfanos: Violacion[];
  /** Imports de valor que el strip de TS elide porque el binding sólo se usa como tipo. */
  elididos: { archivo: string; arista: Arista; motivo: string }[];
  noResueltos: { archivo: string; arista: Arista }[];
  /** `import(x)` sin prefijo estático: Turbopack no empaqueta nada (y avisa). */
  dinamicos: { archivo: string; arista: Arista }[];
  /** Partes de la app que la guardia no sabe auditar. El test del árbol real exige cero. */
  noModelado: string[];
  alcance: Map<string, Set<string>>;
};

type Destino =
  | { clase: "archivo"; ruta: string; existe: boolean }
  | { clase: "prohibido"; motivo: Motivo }
  | { clase: "fuera" } // `browser: false`, paquete de confianza
  | { clase: "sinResolver" };

function listarCodigo(dir: string, fuera: Set<string>): string[] {
  const out: string[] = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) { if (!fuera.has(p) && ent.name !== "node_modules") out.push(...listarCodigo(p, fuera)); }
    else if (EXT_CODIGO.test(ent.name) && !ent.name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

/** Convenciones de archivo del App Router (pageExtensions por defecto: tsx, ts, jsx, js). */
const ARCHIVO_DE_RUTA =
  /^(page|layout|template|loading|error|global-error|not-found|global-not-found|forbidden|unauthorized|default|route|sitemap|robots|manifest|(icon|apple-icon|opengraph-image|twitter-image)\d*)\.(tsx|ts|jsx|js)$/;
const ARCHIVO_DE_RAIZ = /^(proxy|middleware|instrumentation|instrumentation-client|mdx-components)\.(tsx|ts|jsx|js)$/;

function esArchivoDeRuta(archivo: string, raizSrc: string): boolean {
  const rel = path.relative(raizSrc, archivo).split(path.sep).join("/");
  return rel.startsWith("app/") ? ARCHIVO_DE_RUTA.test(path.basename(rel)) : ARCHIVO_DE_RAIZ.test(rel);
}

function leerVerbatim(raizSrc: string): boolean {
  const tsconfig = path.join(path.dirname(raizSrc), "tsconfig.json");
  if (!esArchivo(tsconfig)) return false;
  const { config } = ts.readConfigFile(tsconfig, ts.sys.readFile);
  if (!config) return false;
  // Sigue `extends` (ruta o paquete, como tsc). readDirectory vacío: no hace falta listar el proyecto.
  const host: ts.ParseConfigHost = {
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
    readDirectory: () => [],
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
  };
  return ts.parseJsonConfigFileContent(config, host, path.dirname(tsconfig), undefined, tsconfig).options.verbatimModuleSyntax === true;
}

/** Parseos entre auditorías (la mutación en memoria sólo re-parsea el archivo que cambia). */
const CACHE_PARSEO = new Map<string, { texto: string; m: Modulo }>();

function auditar(raizSrc: string, opts: { sobrescribir?: Map<string, string> } = {}): Auditoria {
  const raizRepo = path.dirname(raizSrc);
  const elidirTs = !leerVerbatim(raizSrc);
  const memo = new Map<string, Modulo>();
  const modulo = (archivo: string): Modulo => {
    let m = memo.get(archivo);
    if (m) return m;
    const texto = opts.sobrescribir?.get(archivo) ?? fs.readFileSync(archivo, "utf8");
    const o = { elidir: elidirTs && EXT_TS.test(archivo), validarNext: !enNodeModules(archivo) };
    const clave = `${archivo}\0${o.elidir}\0${o.validarNext}`;
    const c = CACHE_PARSEO.get(clave);
    m = c && c.texto === texto ? c.m : analizarModulo(archivo, texto, o);
    CACHE_PARSEO.set(clave, { texto, m });
    memo.set(archivo, m);
    return m;
  };

  const archivoEnPaquete = (ruta: string): Destino => {
    if (!enNodeModules(ruta)) return { clase: "archivo", ruta, existe: true };
    const pkg = paqueteDelArchivo(ruta);
    const a = aliasBrowser(pkg, { ruta });
    if (a === false) return { clase: "fuera" };
    if (typeof a !== "string") return { clase: "archivo", ruta, existe: true };
    const r = resolverRuta(path.resolve(pkg!.dir, a));
    return r ? { clase: "archivo", ruta: r, existe: true } : { clase: "sinResolver" };
  };

  const destinos = (arista: Arista, desde: string): Destino[] => {
    if (arista.partes) {
      const hallados = expandirPlantilla(arista.partes, desde, raizSrc);
      return hallados.length > 0 ? hallados.map((ruta) => ({ clase: "archivo", ruta, existe: true })) : [{ clase: "sinResolver" }];
    }
    const esp = arista.especificador;
    const desdePaquete = enNodeModules(desde);
    // `@/` es un alias del tsconfig del proyecto; dentro de node_modules no aplica.
    const local = desdePaquete && esp.startsWith("@/") ? null : resolverDelRepo(esp, desde, raizSrc);
    if (local) return [local.existe ? archivoEnPaquete(local.ruta) : { clase: "archivo", ...local }];
    let pedido = esp;
    if (desdePaquete) {
      const pkg = paqueteDelArchivo(desde);
      const a = aliasBrowser(pkg, { paquete: esp });
      if (a === false) return [{ clase: "fuera" }];
      if (typeof a === "string" && a.startsWith(".")) {
        const r = resolverRuta(path.resolve(pkg!.dir, a));
        return [r ? archivoEnPaquete(r) : { clase: "sinResolver" }];
      }
      if (typeof a === "string") pedido = a;
    }
    const motivo = motivoPaqueteProhibido(pedido);
    if (motivo) return [{ clase: "prohibido", motivo }];
    if (PAQUETES_DE_CONFIANZA.has(raizDePaquete(pedido))) return [{ clase: "fuera" }];
    const ruta = resolverPaquete(pedido, desde, arista.tipo);
    return [ruta ? archivoEnPaquete(ruta) : { clase: "sinResolver" }];
  };

  // ── Entradas ──
  const todos = listarCodigo(raizSrc, new Set([path.join(raizSrc, "generated")]));
  const directivos = todos.filter((f) => modulo(f).directiva === "use client");
  const sinDirectiva = [path.join(raizSrc, "instrumentation-client"), path.join(raizRepo, "instrumentation-client")]
    .map(resolverRuta)
    .filter((f): f is string => f !== null);

  const noModelado: string[] = [];
  for (const d of [path.join(raizSrc, "pages"), path.join(raizRepo, "pages")]) {
    if (esDirectorio(d) && listarCodigo(d, new Set()).length > 0) {
      noModelado.push(`${path.relative(raizRepo, d)}/: Pages Router — la guardia no modela su bundle de cliente`);
    }
  }
  if (esDirectorio(path.join(raizRepo, "app"))) noModelado.push("app/ en la raíz: Next lo usaría en lugar de src/app");

  // Huérfanos: sólo si el árbol tiene rutas (los fixtures sin rutas se auditan enteros).
  const importados = new Set<string>();
  for (const f of todos) {
    if (ES_TEST.test(f)) continue; // los tests no los compila Next
    const m = modulo(f);
    for (const a of [...m.aristas, ...m.elididos]) {
      if (a.partes) for (const r of expandirPlantilla(a.partes, f, raizSrc)) importados.add(r);
      else { const d = resolverDelRepo(a.especificador, f, raizSrc); if (d?.existe) importados.add(d.ruta); }
    }
  }
  const hayRutas = todos.some((f) => esArchivoDeRuta(f, raizSrc));
  const huerfanos = hayRutas ? directivos.filter((f) => !esArchivoDeRuta(f, raizSrc) && !importados.has(f)).sort() : [];
  const clientes = [...new Set([...directivos.filter((f) => !huerfanos.includes(f)), ...sinDirectiva])].sort();

  // ── Recorrido ──
  const violaciones: Violacion[] = [];
  const avisos: Violacion[] = [];
  const enHuerfanos: Violacion[] = [];
  const alcance = new Map<string, Set<string>>();
  const elididosVistos = new Map<string, Auditoria["elididos"][number]>();
  const noResueltosVistos = new Map<string, Auditoria["noResueltos"][number]>();
  const dinamicosVistos = new Map<string, Auditoria["dinamicos"][number]>();

  const recorrer = (cliente: string, reportar: (v: Violacion) => void): Set<string> => {
    // BFS: la primera vez que se llega a un archivo es por el camino más corto.
    const padre = new Map<string, { desde: string; arista: Arista } | null>([[cliente, null]]);
    const cola = [cliente];
    const cadenaHasta = (archivo: string, ultima: Arista): Paso[] => {
      const pasos: Paso[] = [];
      let cur: string | undefined = archivo;
      let arista: Arista = ultima;
      while (cur !== undefined) {
        pasos.unshift({ archivo: cur, linea: arista.linea, tipo: arista.tipo });
        const p = padre.get(cur);
        if (!p) break;
        arista = p.arista;
        cur = p.desde;
      }
      return pasos;
    };
    const violacion = (archivo: string, arista: Arista, m: Motivo, resuelto: string | null) =>
      reportar({ cliente, cadena: cadenaHasta(archivo, arista), especificador: arista.especificador, resuelto, ...m });

    while (cola.length > 0) {
      const archivo = cola.shift()!;
      const m = modulo(archivo);
      const delRepo = !enNodeModules(archivo);
      for (const e of delRepo ? m.elididos : []) {
        const destino = resolverDelRepo(e.especificador, archivo, raizSrc);
        const motivo = destino ? motivoArchivoProhibido(destino.ruta, raizSrc) : motivoPaqueteProhibido(e.especificador);
        if (motivo) elididosVistos.set(`${archivo}:${e.linea}`, { archivo, arista: e, motivo: motivo.motivo });
      }
      for (const d of delRepo ? m.dinamicos : []) dinamicosVistos.set(`${archivo}:${d.linea}`, { archivo, arista: d });
      for (const arista of m.aristas) {
        if (arista.motivoNext) { violacion(archivo, arista, rompe(arista.motivoNext), null); continue; }
        for (const d of destinos(arista, archivo)) {
          if (d.clase === "fuera") continue;
          if (d.clase === "sinResolver") { noResueltosVistos.set(`${archivo}:${arista.linea}`, { archivo, arista }); continue; }
          if (d.clase === "prohibido") { violacion(archivo, arista, d.motivo, null); continue; }
          const esCodigo = d.existe && EXT_CODIGO.test(d.ruta) && !d.ruta.endsWith(".d.ts");
          // Referencia a Server Action / "use cache": legal, y no se entra (lo de adentro no viaja).
          if (esCodigo && esFrontera(modulo(d.ruta).directiva)) continue;
          const motivo = motivoArchivoProhibido(d.ruta, raizSrc);
          if (motivo) { violacion(archivo, arista, motivo, d.existe ? d.ruta : null); continue; }
          if (!d.existe) { noResueltosVistos.set(`${archivo}:${arista.linea}`, { archivo, arista }); continue; }
          if (!esCodigo || padre.has(d.ruta)) continue; // css/json/svg, ya visto
          padre.set(d.ruta, { desde: archivo, arista });
          cola.push(d.ruta);
        }
      }
    }
    return new Set(padre.keys());
  };

  for (const cliente of clientes) {
    alcance.set(cliente, recorrer(cliente, (v) => (v.gravedad === "rompe" ? violaciones : avisos).push(v)));
  }
  for (const h of huerfanos) recorrer(h, (v) => { if (v.gravedad === "rompe") enHuerfanos.push(v); });

  return {
    clientes,
    huerfanos,
    violaciones,
    avisos,
    enHuerfanos,
    elididos: [...elididosVistos.values()],
    noResueltos: [...noResueltosVistos.values()],
    dinamicos: [...dinamicosVistos.values()],
    noModelado,
    alcance,
  };
}

// ── Reporte ─────────────────────────────────────────────────────────────────

/** Agrupado por el import culpable (archivo:línea → especificador), que es lo que hay que arreglar. */
function agrupar(lista: Violacion[], raizRepo: string, marca: string): string[] {
  const rel = (p: string) => path.relative(raizRepo, p).split(path.sep).join("/");
  const grupos = new Map<string, Violacion[]>();
  for (const v of lista) {
    const ultimo = v.cadena[v.cadena.length - 1];
    const k = `${rel(ultimo.archivo)}:${ultimo.linea} → "${v.especificador}"`;
    grupos.set(k, [...(grupos.get(k) ?? []), v]);
  }
  const lineas: string[] = [];
  for (const [k, vs] of grupos) {
    vs.sort((x, y) => x.cadena.length - y.cadena.length);
    const ej = vs[0];
    lineas.push(`${marca} ${k}  (${ej.motivo})`);
    lineas.push(`  cadena más corta (desde ${vs.length} client component(s)):`);
    ej.cadena.forEach((p, i) => lineas.push(`    ${i === 0 ? "  " : "→ "}${rel(p.archivo)}:${p.linea}${p.tipo === "import" ? "" : `  [${p.tipo}]`}`));
    lineas.push(`    → ${ej.especificador}${ej.resuelto ? `  (${rel(ej.resuelto)})` : ""}`);
    const otros = vs.slice(1).map((v) => rel(v.cliente));
    if (otros.length > 0) lineas.push(`  otros clientes: ${otros.slice(0, 8).join(", ")}${otros.length > 8 ? ` y ${otros.length - 8} más` : ""}`);
    lineas.push("");
  }
  return lineas;
}

function informe(a: Auditoria, raizRepo: string): string {
  return [
    ...a.noModelado.map((n) => `✗ NO MODELADO: ${n}. Extender la guardia antes de usarlo.`),
    `${a.violaciones.length} cadena(s) client component → módulo de servidor por import de VALOR. ` +
      `Turbopack las mete en el bundle del browser y el build de Vercel falla.`,
    `Arreglo típico: \`import type\`, o mover lo de servidor a un módulo que el cliente no importe.`,
    "",
    ...agrupar(a.violaciones, raizRepo, "✗"),
  ].join("\n");
}

// ── Fixtures: un mini-árbol en os.tmpdir() ──────────────────────────────────

function arbolTemporal(archivos: Record<string, string>): { raiz: string; src: string; limpiar: () => void } {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "guardia-bundle-"));
  fs.writeFileSync(path.join(raiz, "tsconfig.json"), JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }));
  for (const [rel, texto] of Object.entries(archivos)) {
    const p = path.join(raiz, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, texto);
  }
  return { raiz, src: path.join(raiz, "src"), limpiar: () => fs.rmSync(raiz, { recursive: true, force: true }) };
}

/** Audita un fixture y lo borra. */
function conArbol<T>(archivos: Record<string, string>, f: (a: Auditoria, t: { raiz: string; src: string }) => T): T {
  const t = arbolTemporal(archivos);
  try { return f(auditar(t.src), t); } finally { t.limpiar(); }
}

// El Prisma generado, reducido a su forma: client.ts toca Node; enums.ts no importa nada.
const PRISMA_GENERADO = {
  "src/generated/prisma/client.ts":
    `import * as process from "node:process";\nimport * as runtime from "@prisma/client/runtime/client";\n` +
    `export * from "./enums";\nexport namespace Prisma { export class PrismaClientKnownRequestError extends Error { code = ""; } export type Decimal = number; }\n` +
    `export class PrismaClient {}\n`,
  "src/generated/prisma/enums.ts": `export const AppointmentStatus = { PENDING: "PENDING" } as const;\n`,
  "src/generated/prisma/browser.ts":
    `import * as Prisma from "./internal/prismaNamespaceBrowser";\nexport { Prisma };\nexport * from "./enums";\n`,
  "src/generated/prisma/internal/prismaNamespaceBrowser.ts":
    `import * as runtime from "@prisma/client/runtime/index-browser";\nexport type * from "../models";\nexport const Decimal = runtime;\n`,
  "src/lib/round.ts": `export const round2 = (n: number) => Math.round(n * 100) / 100;\n`,
  "src/lib/prisma.ts": `import { PrismaClient } from "@/generated/prisma/client";\nexport const prisma = new PrismaClient();\n`,
};

// La fila de la agenda, client component, tal como importa a anulacion.ts en el repo.
const APPOINTMENT_ROW =
  `"use client";\nimport { useState } from "react";\nimport { cobrosDetalladosPorTurno, type CobroDelTurno } from "@/lib/turnos/anulacion";\n` +
  `export function AppointmentRow() { const [x] = useState<CobroDelTurno | null>(null); return x ? String(cobrosDetalladosPorTurno) : null; }\n`;

// anulacion.ts ANTES del arreglo: el import de valor para el instanceof.
const ANULACION_ROTA =
  `import { round2 } from "@/lib/round";\nimport { Prisma as PrismaNs } from "@/generated/prisma/client";\n` +
  `export type CobroDelTurno = { id: string };\n` +
  `function isSchemaMissing(e: unknown) { return e instanceof PrismaNs.PrismaClientKnownRequestError && (e.code === "P2021" || e.code === "P2022"); }\n` +
  `export async function cobrosDetalladosPorTurno() { try { return round2(1); } catch (e) { if (isSchemaMissing(e)) return 0; throw e; } }\n`;

// anulacion.ts DESPUÉS del arreglo (lo que hay hoy): `import type` + chequeo por forma.
const ANULACION_ARREGLADA =
  `import { round2 } from "@/lib/round";\nimport type { Prisma } from "@/generated/prisma/client";\n` +
  `export type CobroDelTurno = { id: string; tx?: Prisma.Decimal };\n` +
  `function isSchemaMissing(e: unknown) { const c = (e as { code?: unknown })?.code; return c === "P2021" || c === "P2022"; }\n` +
  `export async function cobrosDetalladosPorTurno() { try { return round2(1); } catch (e) { if (isSchemaMissing(e)) return 0; throw e; } }\n`;

/** Un client component que importa `@/lib/<mod>` y lo usa por valor. */
const clienteQueUsa = (mod: string, nombre = "x") =>
  `"use client";\nimport { ${nombre} } from "@/lib/${mod}";\nexport const C = () => String(${nombre});\n`;

const RAIZ_REPO = path.resolve(__dirname, "..", "..");
const SRC_REPO = path.join(RAIZ_REPO, "src");
const relSrc = (src: string) => (p: string) => path.relative(src, p).split(path.sep).join("/");

// ── Tests de la regla (fixtures) ────────────────────────────────────────────

test("caso histórico: AppointmentRow (client) → anulacion.ts → Prisma por valor ROMPE, con la cadena completa", () => {
  conArbol({
    ...PRISMA_GENERADO,
    "src/app/turnos/AppointmentRow.tsx": APPOINTMENT_ROW,
    "src/lib/turnos/anulacion.ts": ANULACION_ROTA,
  }, (a, t) => {
    assert.deepEqual(a.clientes.map(relSrc(t.src)), ["app/turnos/AppointmentRow.tsx"]);
    assert.equal(a.violaciones.length, 1, informe(a, t.raiz));
    const v = a.violaciones[0];
    assert.deepEqual(
      v.cadena.map((p) => `${relSrc(t.src)(p.archivo)}:${p.linea}`),
      ["app/turnos/AppointmentRow.tsx:3", "lib/turnos/anulacion.ts:2"],
    );
    assert.equal(v.especificador, "@/generated/prisma/client");
    assert.match(informe(a, t.raiz), /AppointmentRow\.tsx:3\n\s+→ src\/lib\/turnos\/anulacion\.ts:2\n\s+→ @\/generated\/prisma\/client/);
  });
});

test("caso histórico arreglado: `import type` + chequeo por forma NO rompe", () => {
  conArbol({
    ...PRISMA_GENERADO,
    "src/app/turnos/AppointmentRow.tsx": APPOINTMENT_ROW,
    "src/lib/turnos/anulacion.ts": ANULACION_ARREGLADA,
  }, (a, t) => {
    assert.equal(a.violaciones.length, 0, informe(a, t.raiz));
    assert.ok(a.alcance.get(a.clientes[0])!.has(path.join(t.src, "lib/turnos/anulacion.ts")), "el recorrido sí entró a anulacion.ts");
  });
});

test("prisma-errors: importar Prisma por valor en un helper intermedio también se ve, dos saltos más abajo", () => {
  conArbol({
    ...PRISMA_GENERADO,
    "src/app/X.tsx": `"use client";\nimport { tolera } from "../lib/a";\nexport const X = () => tolera;\n`,
    "src/lib/a.ts": `export { tolera } from "./b";\n`,
    "src/lib/b/index.ts": `import { isPrismaError } from "@/lib/prisma-errors";\nexport const tolera = (e: unknown) => isPrismaError(e, "P2022");\n`,
    "src/lib/prisma-errors.ts": `import { Prisma } from "@/generated/prisma/client";\nexport function isPrismaError(e: unknown, c: string): e is Prisma.PrismaClientKnownRequestError { return e instanceof Prisma.PrismaClientKnownRequestError && e.code === c; }\n`,
  }, (a, t) => {
    assert.equal(a.violaciones.length, 1, informe(a, t.raiz));
    assert.deepEqual(
      a.violaciones[0].cadena.map((p) => `${relSrc(t.src)(p.archivo)}:${p.linea}:${p.tipo}`),
      ["app/X.tsx:2:import", "lib/a.ts:1:export-from", "lib/b/index.ts:1:import", "lib/prisma-errors.ts:1:import"],
    );
  });
});

test("lo que NO cuenta: import type, { type X } puro, uso sólo como tipo (elidido), enums/browser, 'use server' y 'use cache'", () => {
  conArbol({
    ...PRISMA_GENERADO,
    "src/app/Ok.tsx":
      `"use client";\n` +
      `import type { PrismaClient } from "@/generated/prisma/client";\n` +
      `import { type Prisma as P1 } from "@/generated/prisma/client";\n` +
      `import { Prisma } from "@/generated/prisma/client";\n` + // sólo como tipo → SWC lo elide
      `import { AppointmentStatus } from "@/generated/prisma/enums";\n` +
      `import { Prisma as PB } from "@/generated/prisma/browser";\n` +
      `import { guardar } from "./actions";\n` +
      `import { leer } from "./cacheado";\n` +
      `type Fila = { d: Prisma.Decimal; c?: PrismaClient; p?: P1.Decimal; k: typeof Prisma };\n` +
      `export function Ok(f: Fila) { return [AppointmentStatus.PENDING, PB, guardar, leer, f]; }\n`,
    "src/app/actions.ts": `"use server";\nimport { prisma } from "@/lib/prisma";\nimport "server-only";\nexport async function guardar() { return prisma; }\n`,
    "src/app/cacheado.ts": `"use cache: remote";\nimport { prisma } from "@/lib/prisma";\nexport async function leer() { return prisma; }\n`,
  }, (a, t) => {
    assert.equal(a.violaciones.length, 0, informe(a, t.raiz));
    assert.deepEqual(a.elididos.map((e) => `${relSrc(t.src)(e.archivo)}:${e.arista.linea}`), ["app/Ok.tsx:4"]);
    assert.ok(!a.alcance.get(a.clientes[0])!.has(path.join(t.src, "lib/prisma.ts")), "no entra al 'use server' ni al 'use cache'");
  });
});

test("lo que SÍ cuenta: import(), export *, efecto lateral, JSX, extends, builtins, pg, next/headers, *.server.ts, lib/rls", () => {
  const casos: Record<string, [string, string]> = {
    dinamico: [`const m = () => import("@/lib/rls");`, "@/lib/rls"],
    exportEstrella: [`export * from "@/lib/operator-db";`, "@/lib/operator-db"],
    efectoLateral: [`import "server-only";`, "server-only"],
    jsx: [`import { Panel } from "./panel.server";\nexport const J = () => <Panel />;`, "./panel.server"],
    claseExtends: [`import { Prisma } from "@/generated/prisma/client";\nexport class E extends Prisma.PrismaClientKnownRequestError {}`, "@/generated/prisma/client"],
    nodeModule: [`import { createRequire } from "node:module";\nexport const r = createRequire;`, "node:module"],
    builtinPelado: [`import fs from "fs";\nexport const f = fs;`, "fs"],
    builtinSubruta: [`import { posix } from "path/posix";\nexport const p = posix;`, "path/posix"],
    pg: [`import { Pool } from "pg";\nexport const p = Pool;`, "pg"],
    headers: [`import { cookies } from "next/headers";\nexport const c = cookies;`, "next/headers"],
    require: [`const x = require("@prisma/adapter-pg");\nexport default x;`, "@prisma/adapter-pg"],
    reexportLocal: [`import { PrismaClient } from "@/generated/prisma/client";\nexport { PrismaClient };`, "@/generated/prisma/client"],
  };
  for (const [nombre, [cuerpo, esperado]] of Object.entries(casos)) {
    conArbol({
      ...PRISMA_GENERADO,
      "src/app/C.tsx": `"use client";\n${cuerpo}\n`,
      "src/app/panel.server.tsx": `export const Panel = () => null;\n`,
      "src/lib/rls.ts": `export const rls = 1;\n`,
      "src/lib/operator-db.ts": `export const op = 1;\n`,
    }, (a, t) => {
      assert.deepEqual(a.violaciones.map((v) => v.especificador), [esperado], `${nombre}:\n${informe(a, t.raiz)}`);
    });
  }
});

test("builtins con polyfill de Next (crypto, buffer, path…): AVISO con cadena, no falla", () => {
  conArbol({
    "src/app/C.tsx": `"use client";\nimport { hash } from "@/plugins/x";\nexport const C = () => hash;\n`,
    "src/plugins/x/index.ts": `export { hash } from "./valores";\n`,
    "src/plugins/x/valores.ts":
      `import { createHash } from "node:crypto";\nimport { Buffer } from "buffer";\nimport path from "path";\n` +
      `export const hash = (s: string) => [createHash("sha256"), Buffer.from(s), path.sep];\n`,
  }, (a, t) => {
    assert.equal(a.violaciones.length, 0, informe(a, t.raiz));
    assert.deepEqual(a.avisos.map((v) => v.especificador).sort(), ["buffer", "node:crypto", "path"]);
    assert.deepEqual(
      a.avisos[0].cadena.map((p) => `${relSrc(t.src)(p.archivo)}:${p.tipo}`),
      ["app/C.tsx:import", "plugins/x/index.ts:export-from", "plugins/x/valores.ts:import"],
    );
  });
});

test("sin `prisma generate` (src/generated ausente) el import histórico se atrapa igual, por especificador", () => {
  const sinCliente = Object.fromEntries(Object.entries(PRISMA_GENERADO).filter(([k]) => !k.endsWith("/client.ts")));
  conArbol({
    ...sinCliente,
    "src/app/turnos/AppointmentRow.tsx": APPOINTMENT_ROW,
    "src/lib/turnos/anulacion.ts": ANULACION_ROTA,
  }, (a, t) => {
    assert.deepEqual(a.violaciones.map((v) => v.especificador), ["@/generated/prisma/client"], informe(a, t.raiz));
    assert.equal(a.violaciones[0].resuelto, null);
  });
});

// ── Agujeros que encontró el refutador (cada uno, con su fixture) ───────────

test("validador de Next: revalidatePath/revalidateTag/cacheLife/cacheTag de next/cache, after de next/server y next/root-params ROMPEN", () => {
  const casos: Record<string, string> = {
    revalidatePath: `import { revalidatePath } from "next/cache";\nexport const x = () => revalidatePath("/");`,
    revalidateTagConAlias: `import { revalidateTag as rt } from "next/cache";\nexport const x = rt;`,
    cacheLife: `import { cacheLife } from "next/cache";\nexport const x = cacheLife;`,
    unstableCacheTag: `import { unstable_cacheTag } from "next/cache";\nexport const x = unstable_cacheTag;`,
    after: `import { after } from "next/server";\nexport const x = after;`,
    rootParams: `import { lang } from "next/root-params";\nexport const x = lang;`,
  };
  for (const [nombre, cuerpo] of Object.entries(casos)) {
    conArbol({
      "src/app/contador/CarteraPanel.tsx": clienteQueUsa("cartera-core"),
      "src/lib/cartera-core.ts": `${cuerpo}\n`, // sin "use server": el caso realista del refutador
    }, (a, t) => {
      assert.equal(a.violaciones.length, 1, `${nombre}:\n${informe(a, t.raiz)}`);
      assert.deepEqual(a.violaciones[0].cadena.map((p) => relSrc(t.src)(p.archivo)), ["app/contador/CarteraPanel.tsx", "lib/cartera-core.ts"]);
    });
  }
  // Lo que Next deja pasar: unstable_noStore/unstable_cache (comentados en rsc.rs:723 y 728) y `{ type X }` de la API.
  conArbol({
    "src/app/C.tsx": clienteQueUsa("ok"),
    "src/lib/ok.ts":
      `import { unstable_noStore, unstable_cache } from "next/cache";\nimport { type revalidatePath } from "next/cache";\n` +
      `import type { after } from "next/server";\nexport const x = [unstable_noStore, unstable_cache];\nexport type R = typeof revalidatePath | typeof after;\n`,
  }, (a, t) => assert.equal(a.violaciones.length, 0, informe(a, t.raiz)));
});

test("validador de Next corre ANTES del strip de TS: next/headers usado sólo como tipo o con `{ type X }` ROMPE; `import type` no", () => {
  const casos: Record<string, [string, number]> = {
    usoSoloTipo: [`import { cookies } from "next/headers";\nexport type C = ReturnType<typeof cookies>;`, 1],
    especificadorType: [`import { type cookies } from "next/headers";\nexport type C = ReturnType<typeof cookies>;`, 1],
    serverOnlyVacio: [`import {} from "server-only";`, 1],
    importType: [`import type { cookies } from "next/headers";\nexport type C = ReturnType<typeof cookies>;`, 0],
  };
  for (const [nombre, [cuerpo, esperadas]] of Object.entries(casos)) {
    conArbol({ "src/app/C.tsx": clienteQueUsa("h"), "src/lib/h.ts": `${cuerpo}\nexport const x = 1;\n` }, (a, t) => {
      assert.equal(a.violaciones.length, esperadas, `${nombre}:\n${informe(a, t.raiz)}`);
      assert.equal(a.elididos.length, 0, `${nombre}: no debe figurar como elidido`);
    });
  }
});

test("'use client' en .jsx/.js también es entrada", () => {
  conArbol({
    "src/components/Viejo.jsx": `"use client";\nimport { prisma } from "@/lib/prisma";\nexport const Viejo = () => <div>{String(prisma)}</div>;\n`,
    "src/components/Otro.js": `"use client";\nimport fs from "node:fs";\nexport const o = fs;\n`,
  }, (a, t) => {
    assert.deepEqual(a.clientes.map(relSrc(t.src)), ["components/Otro.js", "components/Viejo.jsx"]);
    assert.deepEqual(a.violaciones.map((v) => v.especificador).sort(), ["@/lib/prisma", "node:fs"], informe(a, t.raiz));
  });
});

test("en .js/.jsx/.mjs no hay strip de TS: un import sin usar se conserva y ROMPE; el mismo en .ts se elide", () => {
  const cuerpo = `import { prisma } from "@/lib/prisma";\nexport const x = 1;\n`;
  for (const ext of [".js", ".jsx", ".mjs"]) {
    conArbol({ "src/app/C.tsx": clienteQueUsa(`legado${ext === ".mjs" ? ".mjs" : ""}`), [`src/lib/legado${ext}`]: cuerpo }, (a, t) => {
      assert.deepEqual(a.violaciones.map((v) => v.especificador), ["@/lib/prisma"], `${ext}:\n${informe(a, t.raiz)}`);
    });
  }
  conArbol({ "src/app/C.tsx": clienteQueUsa("legado"), "src/lib/legado.ts": cuerpo }, (a, t) => {
    assert.equal(a.violaciones.length, 0, informe(a, t.raiz));
    assert.equal(a.elididos.length, 1);
  });
});

test("entradas del browser sin directiva: src/instrumentation-client.ts; el Pages Router queda como NO MODELADO", () => {
  conArbol({ "src/instrumentation-client.ts": `import { prisma } from "@/lib/prisma";\nconsole.log(prisma);\n` }, (a, t) => {
    assert.deepEqual(a.clientes.map(relSrc(t.src)), ["instrumentation-client.ts"]);
    assert.deepEqual(a.violaciones.map((v) => v.especificador), ["@/lib/prisma"], informe(a, t.raiz));
  });
  conArbol({ "src/pages/_app.tsx": `import { prisma } from "@/lib/prisma";\nexport default function App() { return String(prisma); }\n` }, (a, t) => {
    assert.equal(a.noModelado.length, 1, informe(a, t.raiz));
    assert.match(informe(a, t.raiz), /NO MODELADO: src\/pages\/: Pages Router/);
  });
});

test("orden de resolución de Turbopack: con x.ts y x.tsx hermanos gana x.tsx", () => {
  conArbol({
    "src/app/C.tsx": clienteQueUsa("x"),
    "src/lib/x.ts": `export const x = 1;\n`,
    "src/lib/x.tsx": `import { prisma } from "@/lib/prisma";\nexport const x = prisma;\n`,
  }, (a, t) => {
    assert.equal(a.violaciones.length, 1, informe(a, t.raiz));
    assert.deepEqual(a.violaciones[0].cadena.map((p) => relSrc(t.src)(p.archivo)), ["app/C.tsx", "lib/x.tsx"]);
  });
});

test("import() con plantilla se expande como en Turbopack; new Worker(new URL(…)) se sigue; import(x) sin prefijo queda en dinamicos", () => {
  conArbol({
    "src/app/C.tsx": `"use client";\nexport const cargar = (n: string) => import(\`../lib/\${n}\`);\n`,
    "src/lib/ok.ts": `export const ok = 1;\n`,
    "src/lib/prisma.ts": `export const prisma = 1;\n`,
    "src/lib/.oculto/x.ts": `import fs from "node:fs";\nexport const x = fs;\n`, // el comodín no entra a carpetas ocultas
  }, (a, t) => {
    assert.deepEqual(a.violaciones.map((v) => `${v.especificador} → ${relSrc(t.src)(v.resuelto!)} [${v.cadena[0].tipo}]`),
      ["../lib/${…} → lib/prisma.ts [plantilla]"], informe(a, t.raiz));
  });
  conArbol({
    "src/app/C.tsx": `"use client";\nexport const w = () => new Worker(new URL("./w.ts", import.meta.url));\nexport const d = (x: string) => import(x);\n`,
    "src/app/w.ts": `import { readFileSync } from "node:fs";\nexport const r = readFileSync;\n`,
  }, (a, t) => {
    assert.deepEqual(a.violaciones.map((v) => v.cadena.map((p) => `${relSrc(t.src)(p.archivo)}:${p.tipo}`)), [["app/C.tsx:worker", "app/w.ts:import"]], informe(a, t.raiz));
    assert.deepEqual(a.dinamicos.map((d) => `${relSrc(t.src)(d.archivo)}:${d.arista.linea}`), ["app/C.tsx:3"]);
  });
});

test("paquetes de terceros: se entra con la resolución del browser (exports, module, campo browser) y se ve lo de servidor adentro", () => {
  conArbol({
    "src/app/C.tsx":
      `"use client";\nimport Pool from "envoltorio-pg";\nimport { s } from "socket-lib";\nimport cb from "con-browser";\n` +
      `import React from "react";\nexport const C = () => [Pool, s, cb, React];\n`,
    // como pg-pool: exports import → esm → ../index.js → require("pg")
    "node_modules/envoltorio-pg/package.json": JSON.stringify({ name: "envoltorio-pg", exports: { import: "./esm/index.mjs", require: "./index.js" } }),
    "node_modules/envoltorio-pg/esm/index.mjs": `import Pool from "../index.js";\nexport default Pool;\n`,
    "node_modules/envoltorio-pg/index.js": `const EventEmitter = require("events");\nmodule.exports = function Pool() { return require("pg").Client; };\n`,
    // como @electric-sql/pglite-socket: module → dist/index.js → chunk → "net"
    "node_modules/socket-lib/package.json": JSON.stringify({ name: "socket-lib", main: "dist/index.cjs", module: "dist/index.js" }),
    "node_modules/socket-lib/dist/index.js": `export { s } from "./chunk.js";\n`,
    "node_modules/socket-lib/dist/chunk.js": `import { createServer } from "net";\nexport const s = createServer;\n`,
    // el campo browser lo arregla: node.js → browser.js y "fs": false
    "node_modules/con-browser/package.json": JSON.stringify({ name: "con-browser", main: "node.js", browser: { "./node.js": "./browser.js", fs: false } }),
    "node_modules/con-browser/node.js": `module.exports = require("net");\n`,
    "node_modules/con-browser/browser.js": `module.exports = require("fs");\n`,
    // de confianza: no se recorre
    "node_modules/react/package.json": JSON.stringify({ name: "react", main: "index.js" }),
    "node_modules/react/index.js": `require("fs");\n`,
  }, (a, t) => {
    const rel = (p: string) => path.relative(t.raiz, p).split(path.sep).join("/");
    assert.deepEqual(a.violaciones.map((v) => v.especificador).sort(), ["net", "pg"], informe(a, t.raiz));
    const pg = a.violaciones.find((v) => v.especificador === "pg")!;
    assert.deepEqual(pg.cadena.map((p) => `${rel(p.archivo)}:${p.tipo}`),
      ["src/app/C.tsx:import", "node_modules/envoltorio-pg/esm/index.mjs:import", "node_modules/envoltorio-pg/index.js:require"]);
    assert.deepEqual(a.avisos.map((v) => v.especificador), ["events"]);
  });
});

test("verbatimModuleSyntax apaga la elisión, también heredado por `extends`", () => {
  const t = arbolTemporal({
    ...PRISMA_GENERADO,
    "src/app/C.tsx": `"use client";\nimport { Prisma } from "@/generated/prisma/client";\nexport type D = Prisma.Decimal;\n`,
  });
  try {
    assert.equal(auditar(t.src).violaciones.length, 0);
    fs.writeFileSync(path.join(t.raiz, "tsconfig.json"), JSON.stringify({ compilerOptions: { verbatimModuleSyntax: true } }));
    assert.equal(auditar(t.src).violaciones.length, 1, "directo");
    fs.writeFileSync(path.join(t.raiz, "tsconfig.base.json"), JSON.stringify({ compilerOptions: { verbatimModuleSyntax: true } }));
    fs.writeFileSync(path.join(t.raiz, "tsconfig.json"), JSON.stringify({ extends: "./tsconfig.base.json", compilerOptions: { strict: true } }));
    assert.equal(auditar(t.src).violaciones.length, 1, "por extends");
  } finally { t.limpiar(); }
});

test("huérfanos: un 'use client' que nadie importa (salvo un test) no rompe el build; en cuanto una ruta lo importa, sí", () => {
  const base = {
    "src/app/page.tsx": `import { Usado } from "@/components/Usado";\nexport default function P() { return <Usado />; }\n`,
    "src/components/Usado.tsx": `"use client";\nexport const Usado = () => null;\n`,
    "src/components/Huerfano.tsx": `"use client";\nimport { prisma } from "@/lib/prisma";\nexport const H = () => String(prisma);\n`,
    "src/components/Huerfano.test.ts": `import { H } from "./Huerfano";\nconsole.log(H);\n`,
  };
  conArbol(base, (a, t) => {
    assert.deepEqual(a.clientes.map(relSrc(t.src)), ["components/Usado.tsx"]);
    assert.deepEqual(a.huerfanos.map(relSrc(t.src)), ["components/Huerfano.tsx"]);
    assert.equal(a.violaciones.length, 0, informe(a, t.raiz));
    assert.deepEqual(a.enHuerfanos.map((v) => v.especificador), ["@/lib/prisma"]);
  });
  conArbol({ ...base, "src/app/otra/page.tsx": `import { H } from "@/components/Huerfano";\nexport default function P() { return <H />; }\n` }, (a, t) => {
    assert.deepEqual(a.huerfanos, []);
    assert.deepEqual(a.violaciones.map((v) => v.especificador), ["@/lib/prisma"], informe(a, t.raiz));
  });
});

// ── El árbol real ───────────────────────────────────────────────────────────

const FILA = path.join(SRC_REPO, "app/admin/(dashboard)/turnos/AppointmentRow.tsx");
const ANULACION = path.join(SRC_REPO, "lib/turnos/anulacion.ts");

function mutarReal(archivo: string, agregado: string): Auditoria {
  return auditar(SRC_REPO, { sobrescribir: new Map([[archivo, fs.readFileSync(archivo, "utf8") + agregado]]) });
}
const ultimo = (v: Violacion) => v.cadena[v.cadena.length - 1];

test("árbol real: ningún client component alcanza por valor un módulo de servidor", (t) => {
  const inicio = Date.now();
  const a = auditar(SRC_REPO);
  const ms = Date.now() - inicio;
  const rel = (p: string) => path.relative(RAIZ_REPO, p).split(path.sep).join("/");
  const modulos = new Set([...a.alcance.values()].flatMap((s) => [...s]));
  t.diagnostic(`${a.clientes.length} client components compilados, ${a.huerfanos.length} huérfanos, ${modulos.size} módulos alcanzables, ${ms} ms`);
  for (const h of a.huerfanos) t.diagnostic(`huérfano (nadie lo importa: Turbopack no lo compila): ${rel(h)}`);
  for (const l of agrupar(a.enHuerfanos, RAIZ_REPO, "rompería si se importa:")) if (l) t.diagnostic(l);
  for (const e of a.elididos) t.diagnostic(`elidido (sólo tipo, SWC lo borra): ${rel(e.archivo)}:${e.arista.linea} "${e.arista.especificador}"`);
  for (const n of a.noResueltos) t.diagnostic(`sin resolver: ${rel(n.archivo)}:${n.arista.linea} "${n.arista.especificador}"`);
  for (const d of a.dinamicos) t.diagnostic(`import dinámico sin prefijo (Turbopack no lo empaqueta): ${rel(d.archivo)}:${d.arista.linea} "${d.arista.especificador}"`);
  // Los avisos no rompen el build (ver cabecera), pero se muestran con su cadena para que se vean.
  for (const l of agrupar(a.avisos, RAIZ_REPO, "aviso:")) if (l) t.diagnostic(l);
  // Cordura: si el recorrido no ve nada, o la detección de rutas se rompe y todo pasa a huérfano,
  // el test pasaría sin probar nada.
  assert.ok(a.clientes.length >= 50, `sólo ${a.clientes.length} "use client" compilados`);
  assert.ok(a.huerfanos.length <= 10, `${a.huerfanos.length} huérfanos: ¿se rompió la detección de rutas/importadores?`);
  assert.ok(a.clientes.includes(FILA), "AppointmentRow.tsx debería ser entrada");
  assert.ok(a.alcance.get(FILA)?.has(ANULACION), "AppointmentRow.tsx debería alcanzar anulacion.ts");
  assert.deepEqual(a.noModelado, [], informe(a, RAIZ_REPO));
  assert.equal(a.violaciones.length, 0, informe(a, RAIZ_REPO));
});

test("mutación sobre el árbol real (en memoria): reintroducir el import histórico en anulacion.ts lo atrapa", () => {
  const original = fs.readFileSync(ANULACION, "utf8");
  const mutado =
    `import { Prisma as PrismaNs } from "@/generated/prisma/client";\n` +
    original +
    `\nexport function __mutante(e: unknown): boolean { return e instanceof PrismaNs.PrismaClientKnownRequestError; }\n`;
  const a = auditar(SRC_REPO, { sobrescribir: new Map([[ANULACION, mutado]]) });
  const deLaFila = a.violaciones.find(
    (v) => v.cliente === FILA && ultimo(v).archivo === ANULACION && v.especificador === "@/generated/prisma/client",
  );
  assert.ok(deLaFila, `la mutación no se detectó desde AppointmentRow.tsx:\n${informe(a, RAIZ_REPO)}`);
  assert.equal(deLaFila.cadena[0].archivo, FILA);
  assert.equal(ultimo(deLaFila).linea, 1);

  // Y si el mismo import se usa sólo como tipo, SWC lo elide: no rompe (ni el build ni este test).
  const soloTipo = `import { Prisma as PrismaNs } from "@/generated/prisma/client";\n` + original +
    `\nexport type __Mutante = PrismaNs.PrismaClientKnownRequestError;\n`;
  const b = auditar(SRC_REPO, { sobrescribir: new Map([[ANULACION, soloTipo]]) });
  assert.ok(!b.violaciones.some((v) => ultimo(v).archivo === ANULACION));
  assert.ok(b.elididos.some((e) => e.archivo === ANULACION && e.arista.linea === 1));
});

test("mutación real: revalidatePath en lib/cartera-core.ts (sin 'use server') rompe desde CarteraPanel.tsx", () => {
  const core = path.join(SRC_REPO, "lib/cartera-core.ts");
  const panel = path.join(SRC_REPO, "app/contador/CarteraPanel.tsx");
  const a = mutarReal(core, `\nimport { revalidatePath } from "next/cache";\nexport function __mutante() { revalidatePath("/contador"); }\n`);
  const v = a.violaciones.find((x) => x.cliente === panel && ultimo(x).archivo === core && x.especificador === "next/cache");
  assert.ok(v, `no se detectó revalidatePath en cartera-core.ts:\n${informe(a, RAIZ_REPO)}`);
  assert.deepEqual(v.cadena.map((p) => path.relative(SRC_REPO, p.archivo)), ["app/contador/CarteraPanel.tsx", "lib/cartera-core.ts"]);
});

test("mutación real: pg-pool y @electric-sql/pglite-socket (node_modules de verdad) rompen, con la cadena adentro del paquete", () => {
  const a = mutarReal(ANULACION,
    `\nimport Pool from "pg-pool";\nimport { PGLiteSocketServer } from "@electric-sql/pglite-socket";\nexport const __mutante = [Pool, PGLiteSocketServer];\n`);
  const deLaFila = a.violaciones.filter((v) => v.cliente === FILA);
  const rel = (p: string) => path.relative(RAIZ_REPO, p).split(path.sep).join("/");
  const pg = deLaFila.find((v) => v.especificador === "pg");
  assert.ok(pg, informe(a, RAIZ_REPO));
  assert.deepEqual(pg.cadena.slice(-2).map((p) => rel(p.archivo)), ["node_modules/pg-pool/esm/index.mjs", "node_modules/pg-pool/index.js"]);
  const net = deLaFila.find((v) => v.especificador === "net");
  assert.ok(net, informe(a, RAIZ_REPO));
  assert.match(rel(ultimo(net).archivo), /^node_modules\/@electric-sql\/pglite-socket\/dist\/chunk-.*\.js$/);
});
