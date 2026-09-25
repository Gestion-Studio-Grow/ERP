// ============================================================================
// GUARDIA DEL NEGOCIO — la regla de CH en TODAS las actions del operador, ejecutada y trinqueteada.
// ============================================================================
//
// 1. La decisión (`decidirOperadorParaNegocios`) con sesiones reales armadas por el token firmado.
// 2. TRINQUETE, con el AST de TypeScript (no con expresiones regulares: un regex se engaña con un
//    comentario antes de la directiva, un genérico <T> o un efecto sin await). Recorre TODOS los
//    archivos de src/, encuentra cada endpoint como lo ve Next (la directiva "use server" en el
//    prólogo del archivo o de una función) y, en los que tienen privilegio de operador, exige que la
//    PRIMERA sentencia con efecto sea la guardia del negocio. Cada engaño conocido tiene su caso.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";
import { decidirOperadorParaNegocios } from "./guardia-negocio-core";
import { createOperatorToken, leerSesionOperador } from "@/lib/operator-auth";
import { valorDeClave } from "./clave-operador";

function conEntorno<T>(env: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const antes: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) antes[k] = process.env[k];
  const e = process.env as Record<string, string | undefined>;
  const poner = (vals: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(vals)) {
      if (v === undefined) delete e[k];
      else e[k] = v;
    }
  };
  poner(env);
  return fn().finally(() => poner(antes));
}

// ── 1. La decisión, con sesiones de verdad ──────────────────────────────────

test("CH sólo con la sesión del dueño; el resto de los negocios, cualquier operador", async () => {
  const linea = `facu=${await valorDeClave("clave-de-facu", new Uint8Array(16).fill(9))}`;
  await conEntorno(
    { NODE_ENV: "development", AUTH_SECRET: "a", OPERATOR_SECRET: "b", OPERADOR_DUENIO: "tomas", OPERADORES: linea },
    async () => {
      const facu = await leerSesionOperador(await createOperatorToken("facu"));
      const duenio = await leerSesionOperador(await createOperatorToken("tomas"));
      assert.ok(facu && duenio);
      assert.deepEqual({ rol: facu.rol, esDuenio: facu.esDuenio }, { rol: "o", esDuenio: false });
      assert.deepEqual({ rol: duenio.rol, esDuenio: duenio.esDuenio }, { rol: "d", esDuenio: true });

      const r = decidirOperadorParaNegocios(facu, ["beauty-spa"]);
      assert.equal(r.ok, false);
      assert.match((r as { motivo: string }).motivo, /sólo el dueño de GSG.*Entraste como «facu»/);
      // Cualquiera de los negocios que toca la action: casa y local, por ejemplo.
      assert.equal(decidirOperadorParaNegocios(facu, ["magra", " Beauty-Spa "]).ok, false);
      assert.equal(decidirOperadorParaNegocios(facu, ["magra", "magra-lomas", null]).ok, true);
      assert.equal(decidirOperadorParaNegocios(duenio, ["beauty-spa"]).ok, true);
    },
  );
});

// ── 2. Trinquete sobre las actions reales (AST) ─────────────────────────────

const RAIZ = process.cwd();

/** Endpoints que no reciben ni afectan un negocio, con el porqué. */
const EXENTAS: Record<string, string> = {
  "src/lib/operator-actions.ts#operatorLogin": "todavía no hay sesión: es el login",
  "src/lib/operator-actions.ts#operatorLogout": "sólo borra la cookie del operador",
  "src/lib/operator-actions.ts#resetAllOwnerPasswords": "deshabilitada: no toca ningún negocio y devuelve el motivo",
};

/**
 * Las guardias aceptadas. `negocio`: recibe el negocio ({ id } / { slug }) y se exige que salga de la
 * entrada. `rechazo`: devuelve el rechazo en vez de redirigir, y hay que chequearlo en la sentencia
 * siguiente con `if (!g.ok) return …`.
 */
const GUARDIAS: Record<string, { negocio: boolean; rechazo: boolean }> = {
  requireOperadorParaNegocio: { negocio: true, rechazo: false },
  operadorParaNegocio: { negocio: true, rechazo: true },
};

/**
 * Archivos con privilegio que NO son del plano del operador: sus endpoints los usa una persona de un
 * negocio, con su propia guardia. Se acepta esa guardia sólo en ese archivo, con la misma forma.
 */
const OTRO_PLANO: Record<string, { guardias: Record<string, { negocio: boolean; rechazo: boolean }>; motivo: string }> = {
  "src/lib/cartera-actions.ts": {
    guardias: { exigirEstudio: { negocio: false, rechazo: true } },
    motivo:
      "panel del estudio contable (/contador): la sesión es de una usuaria del estudio, no de un operador; " +
      "exigirEstudio verifica cartera:manage y el módulo cartera, y el negocio sale de su sesión, no del pedido",
  },
};

/**
 * ¿El archivo tiene privilegio de operador? Usa `operatorPrisma` (la conexión que saltea RLS) o
 * importa algo del plano del operador: sesión, base, consola o cores de la consola.
 */
const IMPORTA_PRIVILEGIO =
  /(^|\/)operator-[\w-]+$|(^|\/)operador\/|negocio\.server$|interruptores-escritura|provisioning\/runtime|provision-tenant$/;

/** Llamadas que sólo leen lo que llegó (formData, parámetros) sin tocar nada. */
const FUNCIONES_PURAS = new Set(["String", "Number", "Boolean", "isModuleId"]);
const METODOS_PUROS = new Set(["get", "getAll", "trim", "toLowerCase", "toUpperCase", "map", "filter", "slice"]);

export interface Juicio {
  nombre: string;
  ok: boolean;
  motivo: string;
}

export interface RevisionDeArchivo {
  useServer: "archivo" | "funciones" | null;
  privilegiado: boolean;
  endpoints: Juicio[];
}

function directivas(stmts: ts.NodeArray<ts.Statement>): string[] {
  const out: string[] = [];
  for (const st of stmts) {
    if (ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression)) out.push(st.expression.text);
    else break;
  }
  return out;
}

type Funcion = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration;

function esFuncion(n: ts.Node): n is Funcion {
  return ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n);
}

function nombresDe(b: ts.BindingName, out: Set<string>) {
  if (ts.isIdentifier(b)) out.add(b.text);
  else for (const e of b.elements) if (!ts.isOmittedExpression(e)) nombresDe(e.name, out);
}

/** Helpers locales que se pueden usar para leer el formulario: funciones del mismo archivo sin efectos. */
function helpersPuros(sf: ts.SourceFile): Set<string> {
  const out = new Set<string>();
  for (const st of sf.statements) {
    if (!ts.isFunctionDeclaration(st) || !st.name || !st.body) continue;
    if (st.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword || m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    const texto = st.body.getText(sf);
    if (/\b(await|operatorPrisma|prisma|redirect|revalidatePath|cookies|fetch)\b/.test(texto)) continue;
    out.add(st.name.text);
  }
  return out;
}

/** ¿La expresión sólo lee (sin llamadas con efecto, sin await, sin asignaciones)? */
function esLecturaPura(e: ts.Expression, helpers: Set<string>): boolean {
  const pura = (x: ts.Expression): boolean => esLecturaPura(x, helpers);
  if (ts.isIdentifier(e) || ts.isStringLiteral(e) || ts.isNumericLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return true;
  if ([ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(e.kind)) return true;
  if (ts.isTemplateExpression(e)) return e.templateSpans.every((sp) => pura(sp.expression));
  if (ts.isPropertyAccessExpression(e)) return pura(e.expression);
  if (ts.isElementAccessExpression(e)) return pura(e.expression) && pura(e.argumentExpression);
  if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isSatisfiesExpression(e)) {
    return pura(e.expression);
  }
  if (ts.isConditionalExpression(e)) return pura(e.condition) && pura(e.whenTrue) && pura(e.whenFalse);
  if (ts.isPrefixUnaryExpression(e)) return pura(e.operand);
  if (ts.isBinaryExpression(e)) {
    const k = e.operatorToken.kind;
    if (k >= ts.SyntaxKind.FirstAssignment && k <= ts.SyntaxKind.LastAssignment) return false;
    return pura(e.left) && pura(e.right);
  }
  if (ts.isCallExpression(e)) {
    const c = e.expression;
    const llamadaPura =
      (ts.isIdentifier(c) && (FUNCIONES_PURAS.has(c.text) || helpers.has(c.text))) ||
      (ts.isPropertyAccessExpression(c) && METODOS_PUROS.has(c.name.text) && pura(c.expression));
    return llamadaPura && e.arguments.every(pura);
  }
  return false;
}

/** ¿Alguno de los identificadores de la expresión es una entrada (parámetro o leído de él)? */
function usaEntrada(e: ts.Node, entradas: Set<string>): boolean {
  let si = false;
  const ver = (n: ts.Node) => {
    if (si) return;
    if (ts.isIdentifier(n) && entradas.has(n.text) && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n)) si = true;
    else ts.forEachChild(n, ver);
  };
  ver(e);
  return si;
}

/** `await <guardia>(…)` suelto o como inicializador; devuelve la llamada y el nombre de la variable. */
function llamadaDeGuardia(
  st: ts.Statement,
  guardias: Record<string, { negocio: boolean; rechazo: boolean }>,
): { llamada: ts.CallExpression; variable: string | null; guardia: string } | null {
  let expr: ts.Expression | undefined;
  let variable: string | null = null;
  if (ts.isVariableStatement(st) && st.declarationList.declarations.length === 1) {
    const d = st.declarationList.declarations[0];
    expr = d.initializer;
    variable = ts.isIdentifier(d.name) ? d.name.text : null;
  } else if (ts.isExpressionStatement(st)) {
    expr = st.expression;
  }
  if (!expr || !ts.isAwaitExpression(expr) || !ts.isCallExpression(expr.expression)) return null;
  const c = expr.expression;
  if (!ts.isIdentifier(c.expression) || !(c.expression.text in guardias)) return null;
  return { llamada: c, variable, guardia: c.expression.text };
}

/** `if (!g.ok) return …;` exacto: sin else y sin condiciones de más. */
function esChequeoDelRechazo(st: ts.Statement | undefined, v: string): boolean {
  if (!st || !ts.isIfStatement(st) || st.elseStatement) return false;
  const c = st.expression;
  const condicionExacta =
    ts.isPrefixUnaryExpression(c) &&
    c.operator === ts.SyntaxKind.ExclamationToken &&
    ts.isPropertyAccessExpression(c.operand) &&
    ts.isIdentifier(c.operand.expression) &&
    c.operand.expression.text === v &&
    c.operand.name.text === "ok";
  const t = st.thenStatement;
  const soloReturn = ts.isReturnStatement(t) || (ts.isBlock(t) && t.statements.length === 1 && ts.isReturnStatement(t.statements[0]));
  return condicionExacta && soloReturn;
}

function juzgarEndpoint(
  nombre: string,
  fn: Funcion,
  sf: ts.SourceFile,
  helpers: Set<string>,
  guardias: Record<string, { negocio: boolean; rechazo: boolean }>,
): Juicio {
  const mal = (motivo: string): Juicio => ({ nombre, ok: false, motivo });
  const cuerpo = fn.body;
  if (!cuerpo || !ts.isBlock(cuerpo)) return mal("el cuerpo no es un bloque: no hay dónde poner la guardia primero");
  // requireOperator a secas en cualquier lugar del endpoint: es la guardia sin el candado de CH.
  let pelado = false;
  const buscar = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "requireOperator") pelado = true;
    ts.forEachChild(n, buscar);
  };
  buscar(cuerpo);
  if (pelado) return mal("llama a requireOperator a secas (sin el candado de CH)");

  const entradas = new Set<string>();
  for (const p of fn.parameters) nombresDe(p.name, entradas);
  const sentencias = cuerpo.statements.filter((st) => !(ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression)));
  for (let i = 0; i < sentencias.length; i++) {
    const st = sentencias[i];
    const g = llamadaDeGuardia(st, guardias);
    if (g) {
      const regla = guardias[g.guardia];
      const args = g.llamada.arguments;
      if (regla.negocio && args.length === 0) return mal("la guardia no recibe ningún negocio");
      if (!regla.negocio && args.length > 0) return mal("esta guardia saca el negocio de la sesión: no recibe argumentos");
      for (const a of args) {
        if (!ts.isObjectLiteralExpression(a) || a.properties.length !== 1) return mal("cada negocio va como { id } o { slug }");
        const prop = a.properties[0];
        if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) return mal("referencia rara a un negocio");
        const clave = prop.name.getText(sf);
        if (clave !== "id" && clave !== "slug") return mal(`la guardia recibe «${clave}»: va id o slug`);
        const valor = ts.isPropertyAssignment(prop) ? prop.initializer : prop.name;
        if (!usaEntrada(valor, entradas)) return mal("el negocio de la guardia no sale de lo que recibe la action (formData o parámetro)");
      }
      if (regla.rechazo) {
        if (!g.variable) return mal(`el resultado de ${g.guardia} no se guarda en una variable`);
        if (!esChequeoDelRechazo(sentencias[i + 1], g.variable)) {
          return mal(`después de ${g.guardia} va \`if (!${g.variable}.ok) return …\`, sin condiciones de más`);
        }
      }
      return { nombre, ok: true, motivo: g.guardia };
    }
    // Antes de la guardia sólo se lee lo que llegó: `const x = <lectura pura>`.
    const esLectura =
      ts.isVariableStatement(st) &&
      st.declarationList.declarations.every((d) => d.initializer && esLecturaPura(d.initializer, helpers));
    if (!esLectura) return mal(`antes de la guardia hay una sentencia con efecto: «${st.getText(sf).slice(0, 60)}»`);
    for (const d of (st as ts.VariableStatement).declarationList.declarations) {
      if (usaEntrada(d.initializer!, entradas)) nombresDe(d.name, entradas);
    }
  }
  return mal("no llama a la guardia del negocio");
}

/** Revisa un archivo como lo ve Next: endpoints por la directiva del archivo o de cada función. */
export function revisarArchivo(ruta: string, texto: string): RevisionDeArchivo {
  const sf = ts.createSourceFile(ruta, texto, ts.ScriptTarget.Latest, true, ruta.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const helpers = helpersPuros(sf);
  const guardias = { ...GUARDIAS, ...(OTRO_PLANO[ruta]?.guardias ?? {}) };
  const deArchivo = directivas(sf.statements).includes("use server");
  let privilegiado = false;
  const mirar = (n: ts.Node) => {
    if (ts.isIdentifier(n) && n.text === "operatorPrisma") privilegiado = true;
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier) && IMPORTA_PRIVILEGIO.test(n.moduleSpecifier.text)) {
      privilegiado = true;
    }
    ts.forEachChild(n, mirar);
  };
  mirar(sf);

  const endpoints: Juicio[] = [];
  if (deArchivo) {
    for (const st of sf.statements) {
      const exportado = ts.canHaveModifiers(st) && ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      if (ts.isFunctionDeclaration(st) && exportado) {
        endpoints.push(juzgarEndpoint(st.name?.text ?? "default", st, sf, helpers, guardias));
      } else if (ts.isVariableStatement(st) && exportado) {
        for (const d of st.declarationList.declarations) {
          const n = d.name.getText(sf);
          endpoints.push(
            d.initializer && esFuncion(d.initializer)
              ? juzgarEndpoint(n, d.initializer, sf, helpers, guardias)
              : { nombre: n, ok: false, motivo: "export que no es una función: endpoint sin revisar" },
          );
        }
      } else if (ts.isExportAssignment(st) || (ts.isExportDeclaration(st) && !st.isTypeOnly)) {
        endpoints.push({ nombre: "export", ok: false, motivo: "export default o re-export: endpoint sin revisar" });
      }
    }
  }
  // "use server" dentro de una función (acción en línea): cada una es un endpoint.
  let enLinea = false;
  const funciones = (n: ts.Node) => {
    if (esFuncion(n) && n.body && ts.isBlock(n.body) && directivas(n.body.statements).includes("use server")) {
      enLinea = true;
      const nombre = (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) && n.name ? n.name.getText(sf) : "(en línea)";
      endpoints.push(juzgarEndpoint(nombre, n, sf, helpers, guardias));
    }
    ts.forEachChild(n, funciones);
  };
  funciones(sf);
  return { useServer: deArchivo ? "archivo" : enLinea ? "funciones" : null, privilegiado, endpoints };
}

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === "generated" || n === "node_modules" ? [] : archivos(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) && !n.endsWith(".d.ts") ? [p] : [];
  });
}

const REVISADOS = archivos(join(RAIZ, "src"))
  .map((p) => {
    const archivo = relative(RAIZ, p).split(sep).join("/");
    return { archivo, ...revisarArchivo(archivo, readFileSync(p, "utf8")) };
  })
  .filter((r) => r.useServer && r.privilegiado);

test("el recorrido encuentra los endpoints con privilegio de operador en TODO src/ (si no, el trinquete no mira nada)", () => {
  assert.deepEqual(REVISADOS.map((r) => r.archivo).sort(), [
    "src/lib/cartera-actions.ts",
    "src/lib/operador/interruptores-actions.ts",
    "src/lib/operador/plan-actions.ts",
    "src/lib/operador/red-locales-actions.ts",
    "src/lib/operator-actions.ts",
    "src/lib/operator-provisioning-actions.ts",
  ]);
});

test("TRINQUETE: todo endpoint con privilegio de operador tiene PRIMERO la guardia del negocio (candado de CH)", () => {
  const cubiertas: string[] = [];
  const faltan: string[] = [];
  for (const r of REVISADOS) {
    for (const e of r.endpoints) {
      const clave = `${r.archivo}#${e.nombre}`;
      if (clave in EXENTAS) continue;
      if (e.ok) cubiertas.push(clave);
      else faltan.push(`${clave}: ${e.motivo}`);
    }
  }
  assert.deepEqual(faltan, [], `endpoints sin la guardia del negocio:\n${faltan.join("\n")}`);
  assert.deepEqual(cubiertas.sort(), [
    "src/lib/cartera-actions.ts#altaClienteCarteraAction",
    "src/lib/cartera-actions.ts#emitirAutomaticasClienteAction",
    "src/lib/cartera-actions.ts#monitorCarteraAction",
    "src/lib/cartera-actions.ts#setEstadoCarteraAction",
    "src/lib/operador/interruptores-actions.ts#cambiarInterruptor",
    "src/lib/operador/plan-actions.ts#ajustarLimiteDelNegocio",
    "src/lib/operador/plan-actions.ts#aplicarPlanDelNegocio",
    "src/lib/operador/red-locales-actions.ts#darDeBajaLocalAction",
    "src/lib/operador/red-locales-actions.ts#revisarAltaEnRedAction",
    "src/lib/operador/red-locales-actions.ts#sumarAltaALaRedAction",
    "src/lib/operador/red-locales-actions.ts#vincularLocalAction",
    "src/lib/operator-actions.ts#cambiarFacturacionReal",
    "src/lib/operator-actions.ts#cargarCredencialFiscal",
    "src/lib/operator-actions.ts#fijarAsignacionActual",
    "src/lib/operator-actions.ts#resetOwnerPassword",
    "src/lib/operator-actions.ts#resetOwnerPasswordDeTenant",
    "src/lib/operator-actions.ts#setTenantArcaCuit",
    "src/lib/operator-actions.ts#setTenantArcaPuntoVenta",
    "src/lib/operator-actions.ts#setTenantBranding",
    "src/lib/operator-actions.ts#setTenantPlan",
    "src/lib/operator-actions.ts#setTenantStatus",
    "src/lib/operator-actions.ts#setTenantSubdomain",
    "src/lib/operator-actions.ts#toggleTenantModule",
    "src/lib/operator-provisioning-actions.ts#commitTenantAction",
    "src/lib/operator-provisioning-actions.ts#planTenantAction",
  ]);
  // Las exentas existen de verdad (una exención huérfana tapa un endpoint nuevo con el mismo nombre).
  for (const clave of Object.keys(EXENTAS)) {
    const [archivo, nombre] = clave.split("#");
    assert.ok(REVISADOS.find((r) => r.archivo === archivo)?.endpoints.some((e) => e.nombre === nombre), clave);
  }
});

// Los engaños del refutador (scratchpad/trinquete.mjs) y los que se le suman: todos tienen que caer.
const ENGANIOS: Record<string, { ruta: string; src: string }> = {
  "comentario antes de use server": {
    ruta: "src/lib/operator-x.ts",
    src: `// acciones nuevas\n"use server";\nexport async function borrarCH(fd: FormData) { await operatorPrisma.tenant.delete({ where: { id: String(fd.get("tenantId")) } }); }\n`,
  },
  "use server sin punto y coma": {
    ruta: "src/lib/operator-x.ts",
    src: `"use server"\nexport async function borrarCH(fd: FormData) { await operatorPrisma.tenant.delete({ where: { id: String(fd.get("tenantId")) } }); }\n`,
  },
  "export genérico <T>": {
    ruta: "src/lib/operator-x.ts",
    src: `"use server";\nexport async function borrarCH<T>(fd: T) { await operatorPrisma.tenant.delete({ where: { id: "x" } }); }\n`,
  },
  "use server en línea dentro de una función, fuera de las carpetas de la consola": {
    ruta: "src/app/otra/page.tsx",
    src: `import { operatorPrisma } from "@/lib/operator-db";\nexport default function P() {\n  async function borrar(fd: FormData) {\n    "use server";\n    await operatorPrisma.tenant.delete({ where: { id: String(fd.get("tenantId")) } });\n  }\n  return <form action={borrar} />;\n}\n`,
  },
  "archivo use server fuera de src/lib/operator*": {
    ruta: "src/lib/otra/cosas.ts",
    src: `"use server";\nimport { operatorPrisma } from "@/lib/operator-db";\nexport async function x(fd: FormData) { await operatorPrisma.tenant.delete({ where: { id: String(fd.get("tenantId")) } }); }\n`,
  },
  "efecto sin await antes de la guardia": {
    ruta: "src/lib/operator-x.ts",
    src: `"use server";\nexport async function x(fd: FormData) {\n  const id = String(fd.get("tenantId"));\n  void operatorPrisma.tenant.update({ where: { id }, data: { status: "SUSPENDED" } });\n  await requireOperadorParaNegocio({ id });\n}\n`,
  },
  "efecto escondido en la inicialización": {
    ruta: "src/lib/operator-x.ts",
    src: `"use server";\nexport async function x(fd: FormData) {\n  const id = String(fd.get("tenantId"));\n  const t = operatorPrisma.tenant.update({ where: { id }, data: { status: "SUSPENDED" } });\n  await requireOperadorParaNegocio({ id });\n}\n`,
  },
  "guardia con referencia vacía": {
    ruta: "src/lib/operator-x.ts",
    src: `"use server";\nexport async function x(fd: FormData) {\n  await requireOperadorParaNegocio({ id: "" });\n  await operatorPrisma.tenant.update({ where: { id: String(fd.get("tenantId")) }, data: { status: "SUSPENDED" } });\n}\n`,
  },
  "guardia sin negocios": {
    ruta: "src/lib/operator-x.ts",
    src: `"use server";\nexport async function x(fd: FormData) {\n  await requireOperadorParaNegocio();\n  await operatorPrisma.tenant.delete({ where: { id: String(fd.get("tenantId")) } });\n}\n`,
  },
  "ok mirado pero ignorado (g.ok || true)": {
    ruta: "src/lib/operator-x.ts",
    src: `"use server";\nexport async function x(fd: string) {\n  const g = await operadorParaNegocio({ id: fd });\n  if (g.ok || true) await operatorPrisma.tenant.delete({ where: { id: fd } });\n}\n`,
  },
  "rechazo chequeado con condición de más": {
    ruta: "src/lib/operator-x.ts",
    src: `"use server";\nexport async function x(fd: string) {\n  const g = await operadorParaNegocio({ id: fd });\n  if (!g.ok && fd !== "beauty") return;\n  await operatorPrisma.tenant.delete({ where: { id: fd } });\n}\n`,
  },
  "sin await: devuelve la promesa": {
    ruta: "src/lib/operator-x.ts",
    src: `"use server";\nexport async function x(fd: FormData) {\n  return operatorPrisma.tenant.delete({ where: { id: String(fd.get("tenantId")) } });\n}\n`,
  },
  "export const flecha": {
    ruta: "src/lib/operator-x.ts",
    src: `"use server";\nexport const x = async (fd: FormData) => { await operatorPrisma.tenant.delete({ where: { id: String(fd.get("tenantId")) } }); };\n`,
  },
  "guardia metida en un if": {
    ruta: "src/lib/operator-x.ts",
    src: `"use server";\nexport async function x(fd: FormData) {\n  const id = String(fd.get("tenantId"));\n  if (id) await requireOperadorParaNegocio({ id });\n  await operatorPrisma.tenant.delete({ where: { id } });\n}\n`,
  },
  "la guardia del estudio fuera de su archivo": {
    ruta: "src/lib/operator-x.ts",
    src: `"use server";\nexport async function x(fd: FormData) {\n  const gate = await exigirEstudio();\n  if (!gate.ok) return gate;\n  await operatorPrisma.tenant.delete({ where: { id: String(fd.get("tenantId")) } });\n}\n`,
  },
  "control: requireOperator a secas": {
    ruta: "src/lib/operator-x.ts",
    src: `"use server";\nexport async function x(fd: FormData) {\n  await requireOperator();\n  await requireOperadorParaNegocio({ id: String(fd.get("tenantId")) });\n  await operatorPrisma.tenant.delete({ where: { id: "x" } });\n}\n`,
  },
};

test("cada engaño conocido pone el trinquete en rojo", () => {
  for (const [nombre, { ruta, src }] of Object.entries(ENGANIOS)) {
    const r = revisarArchivo(ruta, src);
    assert.ok(r.useServer, `${nombre}: no vio la directiva`);
    assert.ok(r.privilegiado, `${nombre}: no lo reconoció como privilegiado`);
    assert.ok(r.endpoints.length > 0, `${nombre}: no encontró el endpoint`);
    assert.ok(r.endpoints.some((e) => !e.ok), `${nombre}: el trinquete lo dejó pasar`);
  }
});

test("y una action bien hecha pasa (el detector no rechaza todo)", () => {
  const bien = `"use server";\nfunction campo(fd: FormData, n: string) { return String(fd.get(n) ?? "").trim(); }\nexport async function x(fd: FormData) {\n  const casaId = campo(fd, "casaId");\n  const g = await operadorParaNegocio({ id: casaId });\n  if (!g.ok) return { ok: false, motivo: g.motivo };\n  await operatorPrisma.tenant.update({ where: { id: casaId }, data: {} });\n}\n`;
  const r = revisarArchivo("src/lib/operator-x.ts", bien);
  assert.deepEqual(r.endpoints, [{ nombre: "x", ok: true, motivo: "operadorParaNegocio" }]);
});

test("los cambios de estado, plan, marca y subdominio quedan auditados con el operador", () => {
  const src = readFileSync(join(RAIZ, "src/lib/operator-actions.ts"), "utf8");
  const f = src.slice(src.indexOf("async function actualizarTenantAuditado"), src.indexOf("export async function setTenantStatus"));
  assert.match(f, /tx\.auditLog\.create\(/);
  assert.match(f, /actor: `operator:\$\{op\}`/);
  for (const [accion, action] of [
    ["setTenantStatus", "tenant.status"],
    ["setTenantPlan", "tenant.plan"],
    ["setTenantBranding", "tenant.branding"],
    ["setTenantSubdomain", "tenant.subdomain"],
  ]) {
    const desde = src.indexOf(`export async function ${accion}(`);
    const cuerpo = src.slice(desde, src.indexOf("\n}\n", desde));
    assert.match(cuerpo, new RegExp(`actualizarTenantAuditado\\(op, tenantId, "${action.replace(".", "\\.")}"`), accion);
    assert.doesNotMatch(cuerpo, /operatorPrisma\.tenant\.update\(/, `${accion} escribe sin auditar`);
  }
});
