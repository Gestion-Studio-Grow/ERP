// ============================================================================
// GUARDIA DEL NEGOCIO — la regla de CH en TODAS las actions del operador, ejecutada y trinqueteada.
// ============================================================================
//
// 1. La decisión (`decidirOperadorParaNegocios`) con sesiones reales armadas por el token firmado.
// 2. TRINQUETE: recorre TODOS los archivos "use server" de la consola (src/lib/operator*,
//    src/lib/operador/**, src/app/operador/**) y exige que cada export espere primero la guardia
//    del negocio. Las únicas excepciones están abajo con su motivo: una action nueva sin guardia
//    rompe este test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
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

// ── 2. Trinquete sobre las actions reales ────────────────────────────────────

const RAIZ = process.cwd();

/** Exports que no reciben ni afectan un negocio, con el porqué. */
const EXENTAS: Record<string, string> = {
  "src/lib/operator-actions.ts#operatorLogin": "todavía no hay sesión: es el login",
  "src/lib/operator-actions.ts#operatorLogout": "sólo borra la cookie del operador",
  "src/lib/operator-actions.ts#resetAllOwnerPasswords": "deshabilitada: no toca ningún negocio y devuelve el motivo",
};

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** Cada `export async function` con su cuerpo (hasta el próximo export o el final). */
function exportsDe(src: string): { nombre: string; cuerpo: string }[] {
  const codigo = sinComentarios(src);
  const re = /export\s+async\s+function\s+(\w+)\s*\(/g;
  const marcas = [...codigo.matchAll(re)].map((m) => ({ nombre: m[1], desde: m.index! }));
  return marcas.map((m, i) => ({ nombre: m.nombre, cuerpo: codigo.slice(m.desde, marcas[i + 1]?.desde ?? codigo.length) }));
}

const ARCHIVOS_DE_LA_CONSOLA = [
  ...readdirSync(join(RAIZ, "src", "lib"))
    .filter((n) => /^operator.*\.ts$/.test(n) && !n.endsWith(".test.ts"))
    .map((n) => join(RAIZ, "src", "lib", n)),
  ...archivos(join(RAIZ, "src", "lib", "operador")),
  ...archivos(join(RAIZ, "src", "app", "operador")),
]
  .map((p) => ({ archivo: relative(RAIZ, p).split(sep).join("/"), src: readFileSync(p, "utf8") }))
  .filter((f) => /^\s*["']use server["'];/.test(f.src));

test("el recorrido encuentra las actions de la consola (si no, el trinquete no mira nada)", () => {
  const nombres = ARCHIVOS_DE_LA_CONSOLA.map((f) => f.archivo).sort();
  assert.deepEqual(nombres, [
    "src/lib/operador/interruptores-actions.ts",
    "src/lib/operador/red-locales-actions.ts",
    "src/lib/operator-actions.ts",
    "src/lib/operator-provisioning-actions.ts",
  ]);
});

test("TRINQUETE: toda action de la consola espera PRIMERO la guardia del negocio (candado de CH)", () => {
  const cubiertas: string[] = [];
  const faltan: string[] = [];
  for (const f of ARCHIVOS_DE_LA_CONSOLA) {
    // Nada más que funciones async: un `export const` sería otro endpoint sin revisar.
    assert.doesNotMatch(sinComentarios(f.src), /export\s+(const|let|var|default|\{|\*)/, f.archivo);
    for (const e of exportsDe(f.src)) {
      const clave = `${f.archivo}#${e.nombre}`;
      if (clave in EXENTAS) continue;
      const primera = e.cuerpo.slice(e.cuerpo.indexOf("await"));
      const guardia = /^await (requireOperadorParaNegocio|operadorParaNegocio)\(/.exec(primera);
      if (!guardia || /\brequireOperator\(/.test(e.cuerpo)) {
        faltan.push(clave);
        continue;
      }
      // `operadorParaNegocio` devuelve el rechazo: la action tiene que mirarlo.
      if (guardia[1] === "operadorParaNegocio") {
        const v = /const (\w+) = await operadorParaNegocio\(/.exec(e.cuerpo)?.[1];
        if (!v || !new RegExp(`\\b${v}\\.ok\\b`).test(e.cuerpo)) {
          faltan.push(`${clave} (no mira el rechazo)`);
          continue;
        }
      }
      cubiertas.push(clave);
    }
  }
  assert.deepEqual(faltan, [], `actions sin la guardia del negocio: ${faltan.join(", ")}`);
  assert.deepEqual(cubiertas.sort(), [
    "src/lib/operador/interruptores-actions.ts#cambiarInterruptor",
    "src/lib/operador/red-locales-actions.ts#darDeBajaLocalAction",
    "src/lib/operador/red-locales-actions.ts#revisarAltaEnRedAction",
    "src/lib/operador/red-locales-actions.ts#sumarAltaALaRedAction",
    "src/lib/operador/red-locales-actions.ts#vincularLocalAction",
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
});

test("el detector del trinquete marca una action sin guardia (no es un test que nunca falla)", () => {
  const mala = `"use server";\nexport async function x(formData: FormData) {\n  const op = await requireOperator();\n  const id = String(formData.get("tenantId"));\n}\n`;
  const [e] = exportsDe(mala);
  assert.doesNotMatch(e.cuerpo.slice(e.cuerpo.indexOf("await")), /^await (requireOperadorParaNegocio|operadorParaNegocio)\(/);
});

test("los cambios de estado, plan, marca y subdominio quedan auditados con el operador", () => {
  const src = sinComentarios(readFileSync(join(RAIZ, "src/lib/operator-actions.ts"), "utf8"));
  const f = src.slice(src.indexOf("async function actualizarTenantAuditado"), src.indexOf("export async function setTenantStatus"));
  assert.match(f, /tx\.auditLog\.create\(/);
  assert.match(f, /actor: `operator:\$\{op\}`/);
  for (const [accion, action] of [
    ["setTenantStatus", "tenant.status"],
    ["setTenantPlan", "tenant.plan"],
    ["setTenantBranding", "tenant.branding"],
    ["setTenantSubdomain", "tenant.subdomain"],
  ]) {
    const cuerpo = exportsDe(src).find((e) => e.nombre === accion)?.cuerpo ?? "";
    assert.match(cuerpo, new RegExp(`actualizarTenantAuditado\\(op, tenantId, "${action.replace(".", "\\.")}"`), accion);
    assert.doesNotMatch(cuerpo, /operatorPrisma\.tenant\.update\(/, `${accion} escribe sin auditar`);
  }
});
