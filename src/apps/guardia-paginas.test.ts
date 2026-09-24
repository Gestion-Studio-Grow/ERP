// ============================================================================
// GUARDIA EN CADA PÁGINA — trinquete y coherencia con el registro.
// ============================================================================
//
// Esconder una app del menú no la protege: se abre tecleando la URL. La guardia es
// `requireApp(id)` en la PÁGINA (no en el layout, que Next no re-renderiza al navegar del
// lado del cliente). Estos tests recorren las páginas REALES de src/app/admin/(dashboard):
//
//   1. TRINQUETE: la cantidad de páginas sin `requireApp` no puede subir. Eran 34 (todas); ver
//      LIMITE_PAGINAS_SIN_REQUIRE_APP.
//      Cada frente la agrega en sus páginas; una página nueva sin guardia rompe el test.
//   2. Toda página pertenece a una app del registro (SIN_APP lista las excepciones; hoy ninguna).
//   3. Si una página llama a `requireApp`, es con el id de SU app: proteger la app vecina
//      dejaría la propia abierta.
//   4. La capability del registro es la que exige la página raíz de cada app: la que pide
//      directo con `requireCapability` o, si no, la que pide el loader que la página llama
//      (tabla GUARDIA_EN_EL_LOADER, verificada contra el código del loader). Si divergen,
//      `requireApp` cambiaría quién entra.
//   5. Los route handlers de (dashboard) (exportaciones y planillas) también sirven datos por
//      URL: mismo trinquete, mismas reglas de pertenencia.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep, dirname } from "node:path";
import { appDeRuta } from "./rutas";

/**
 * Páginas en (dashboard) sin requireApp. Sólo puede bajar. Eran 34 al arrancar la ola 1;
 * medido en la integración de la ola 2: 24; en la de la ola 3: 11; en la tanda 2b, 10, al
 * borrarse /admin/modulos (quedan apariencia, auditoria, caja, caja/libro, campania,
 * facturacion/bancos, facturacion/bancos/configuracion, localizacion, el Inicio y usuarios).
 */
const LIMITE_PAGINAS_SIN_REQUIRE_APP = 10;

/** Páginas que no son de ninguna app, con el motivo. */
const SIN_APP: Record<string, string> = {};

const RAIZ = join(process.cwd(), "src", "app", "admin", "(dashboard)");

function paginas(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return paginas(p);
    return e.name === "page.tsx" ? [p] : [];
  });
}

/** src/app/admin/(dashboard)/clientes/[id]/page.tsx → /admin/clientes/_id */
function rutaDe(archivo: string): string {
  const segmentos = relative(RAIZ, dirname(archivo))
    .split(sep)
    .filter((s) => s && !/^\(.*\)$/.test(s))
    .map((s) => s.replace(/^\[(.*)\]$/, "_$1"));
  return ["/admin", ...segmentos].join("/");
}

/** El código sin comentarios: una capability citada en un comentario no es una guardia. */
function codigo(archivo: string): string {
  return readFileSync(archivo, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const llamadas = (src: string, fn: string) =>
  [...src.matchAll(new RegExp(`\\b${fn}\\(\\s*["']([^"']+)["']\\s*\\)`, "g"))].map((m) => m[1]);

function leer(archivo: string) {
  const src = codigo(archivo);
  return {
    archivo: relative(process.cwd(), archivo),
    ruta: rutaDe(archivo),
    src,
    // `requireAppAccion` también cuenta como guardia (un route handler puede preferir el error).
    requireApp: [...llamadas(src, "requireApp"), ...llamadas(src, "requireAppAccion")],
    requireCapability: llamadas(src, "requireCapability"),
  };
}

const PAGINAS = paginas(RAIZ).map(leer);

/**
 * Route handlers en (dashboard) sin requireApp. Sólo puede bajar. Eran 5 (de 5) al arrancar la
 * ola 1; medido en la integración de la ola 2: 0 de 7, todos con su guardia.
 */
const LIMITE_HANDLERS_SIN_REQUIRE_APP = 0;

function handlers(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return handlers(p);
    return e.name === "route.ts" ? [p] : [];
  });
}

const HANDLERS = handlers(RAIZ).map(leer);

/**
 * Páginas raíz que NO piden su capability directo: la pide el loader que llaman primero.
 * Medido el 2026-09-23 contra el código. El test abre el loader, busca la función y compara
 * su primer `requireCapability` con el registro; una página raíz nueva sin capability
 * directa tiene que figurar acá (o pedirla en la página).
 */
const GUARDIA_EN_EL_LOADER: Record<string, { archivo: string; funcion: string }> = {
  "/admin/auditoria": { archivo: "src/lib/audit.ts", funcion: "getAuditLog" },
  "/admin/caja": { archivo: "src/lib/cierre-diario-actions.ts", funcion: "getCierreDiarioData" },
  "/admin/caja/libro": { archivo: "src/lib/libro-caja-actions.ts", funcion: "getLibroCajaData" },
};

test("GUARDIA_EN_EL_LOADER sólo lista páginas que todavía dependen de su loader (sin requireApp)", () => {
  // Cuando una página pasa a requireApp, su guardia la pone el registro y la entrada de la
  // tabla queda muerta: nadie la vuelve a mirar. Se saca, así la tabla dice lo que es.
  for (const ruta of Object.keys(GUARDIA_EN_EL_LOADER)) {
    const p = PAGINAS.find((x) => x.ruta === ruta);
    assert.ok(p, `${ruta} figura en GUARDIA_EN_EL_LOADER y no hay página`);
    assert.deepEqual(p.requireApp, [], `${ruta} ya llama requireApp: sacala de GUARDIA_EN_EL_LOADER`);
  }
});

/** El cuerpo de `export (async) function nombre(...)` hasta su `}` de cierre en la columna 0. */
function cuerpoDe(src: string, funcion: string): string | undefined {
  const inicio = src.search(new RegExp(`export\\s+(async\\s+)?function\\s+${funcion}\\s*\\(`));
  if (inicio === -1) return undefined;
  const fin = src.indexOf("\n}", inicio);
  return src.slice(inicio, fin === -1 ? undefined : fin);
}

/** ¿La página importa `funcion` desde `archivo` (por el alias @/)? */
function importaDe(src: string, funcion: string, archivo: string): boolean {
  const modulo = "@/" + archivo.replace(/^src\//, "").replace(/\.tsx?$/, "");
  return [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)].some(
    (m) => m[2] === modulo && new RegExp(`\\b${funcion}\\b`).test(m[1]),
  );
}

test("el recorrido encuentra las páginas del panel", () => {
  // Si esto da 0, los demás tests pasarían sin mirar nada.
  assert.ok(PAGINAS.length >= 34, `sólo ${PAGINAS.length} páginas: ¿cambió la carpeta?`);
  assert.ok(PAGINAS.some((p) => p.ruta === "/admin"));
  assert.ok(PAGINAS.some((p) => p.ruta === "/admin/clientes/_id"));
});

test(`trinquete: páginas sin requireApp ≤ ${LIMITE_PAGINAS_SIN_REQUIRE_APP}`, () => {
  const sinGuardia = PAGINAS.filter((p) => p.requireApp.length === 0).map((p) => p.ruta);
  assert.ok(
    sinGuardia.length <= LIMITE_PAGINAS_SIN_REQUIRE_APP,
    `${sinGuardia.length} páginas sin requireApp (límite ${LIMITE_PAGINAS_SIN_REQUIRE_APP}). ` +
      `Una página nueva lleva requireApp("<su app>") al tope. Sin guardia: ${sinGuardia.join(", ")}`,
  );
});

test("toda página del panel pertenece a una app del registro", () => {
  for (const p of PAGINAS) {
    const app = appDeRuta(p.ruta);
    if (p.ruta in SIN_APP) {
      assert.equal(app, undefined, `${p.ruta} figura como sin app pero el registro la cubre`);
      continue;
    }
    assert.ok(app, `${p.archivo} (${p.ruta}) no pertenece a ninguna app: registrala`);
  }
});

test("requireApp protege la app de SU ruta, no otra", () => {
  for (const p of PAGINAS) {
    const app = appDeRuta(p.ruta);
    for (const id of p.requireApp) {
      assert.equal(id, app?.id, `${p.archivo} llama requireApp("${id}") pero su ruta es de "${app?.id}"`);
    }
  }
});

test("la capability del registro es la que pide la página raíz de cada app (directo o en su loader)", () => {
  // Sólo la página raíz: una sub-ruta puede exigir más (turnos/lista pide agenda:manage).
  // Al arrancar la ola 1 (2026-09-23): 28 páginas raíz; 14 pedían su capability directo en la
  // página y 14 en el loader que llaman (GUARDIA_EN_EL_LOADER). Cuando una página pasa a
  // requireApp y deja requireCapability, la capability la pone el registro y sale de las dos
  // listas (en la integración de la ola 2 quedaron 7 en la tabla).
  const raices = PAGINAS.filter((p) => appDeRuta(p.ruta)?.ruta === p.ruta);
  assert.ok(raices.length >= 25, `sólo ${raices.length} páginas raíz: ¿cambió la carpeta?`);
  let comparadas = 0;
  for (const p of raices) {
    const app = appDeRuta(p.ruta)!;
    if (p.requireCapability.length > 0) {
      for (const cap of p.requireCapability) {
        assert.equal(cap, app.capability, `${p.archivo} pide "${cap}" y el registro dice "${app.capability}" para ${app.id}`);
      }
      comparadas++;
      continue;
    }
    if (p.requireApp.length > 0) continue; // la capability la aplica requireApp desde el registro
    const loader = GUARDIA_EN_EL_LOADER[p.ruta];
    assert.ok(loader, `${p.archivo} no pide capability ni requireApp: sumale requireApp("${app.id}")`);
    assert.ok(
      importaDe(p.src, loader.funcion, loader.archivo) && new RegExp(`\\b${loader.funcion}\\(`).test(p.src),
      `${p.archivo} ya no llama a ${loader.funcion} de ${loader.archivo}: actualizá GUARDIA_EN_EL_LOADER`,
    );
    const cuerpo = cuerpoDe(codigo(join(process.cwd(), loader.archivo)), loader.funcion);
    assert.ok(cuerpo, `${loader.archivo} no exporta ${loader.funcion}`);
    const [cap] = llamadas(cuerpo, "requireCapability");
    assert.equal(cap, app.capability, `${loader.funcion} (${loader.archivo}) pide "${cap}" y el registro dice "${app.capability}" para ${app.id}`);
    comparadas++;
  }
  // Toda página raíz sin requireApp se comparó: ninguna quedó sin mirar.
  assert.equal(comparadas, raices.filter((p) => p.requireApp.length === 0).length);
  // Y la tabla no guarda rutas que ya no existen o que ya piden la capability en la página.
  for (const ruta of Object.keys(GUARDIA_EN_EL_LOADER)) {
    const p = raices.find((r) => r.ruta === ruta);
    assert.ok(p, `GUARDIA_EN_EL_LOADER nombra ${ruta}, que no es una página raíz`);
    assert.equal(p.requireCapability.length, 0, `${ruta} ya pide la capability en la página: sacala de la tabla`);
  }
});

test("el recorrido encuentra los route handlers del panel", () => {
  assert.ok(HANDLERS.length >= 5, `sólo ${HANDLERS.length} route handlers: ¿cambió la carpeta?`);
  assert.ok(HANDLERS.some((h) => h.ruta === "/admin/libros/export"));
});

test(`trinquete: route handlers sin requireApp ≤ ${LIMITE_HANDLERS_SIN_REQUIRE_APP}`, () => {
  // Una exportación sirve los mismos datos que su pantalla: si la pantalla exige el módulo y
  // la exportación no, esconder la pantalla no protege nada (libros/export pide el perfil
  // Empresa, no el módulo `libros`).
  const sinGuardia = HANDLERS.filter((h) => h.requireApp.length === 0).map((h) => h.ruta);
  assert.ok(
    sinGuardia.length <= LIMITE_HANDLERS_SIN_REQUIRE_APP,
    `${sinGuardia.length} route handlers sin requireApp (límite ${LIMITE_HANDLERS_SIN_REQUIRE_APP}): ${sinGuardia.join(", ")}`,
  );
});

test("todo route handler pertenece a una app, y su requireApp es el de esa app", () => {
  for (const h of HANDLERS) {
    const app = appDeRuta(h.ruta);
    assert.ok(app, `${h.archivo} (${h.ruta}) no pertenece a ninguna app: registrala`);
    for (const id of h.requireApp) {
      assert.equal(id, app.id, `${h.archivo} llama requireApp("${id}") pero su ruta es de "${app.id}"`);
    }
  }
});
