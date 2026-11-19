/**
 * A1 de DIR-007 (GSG-MIA-091) · el test que recorre la matriz entera. Lee el código: cada acción de servidor de Proyectos y cada
 * página tiene que estar anotada en `matriz-permisos.ts` con la puerta que de verdad pide. Una acción nueva sin anotar, una puerta
 * cambiada sin cambiar la matriz o una `requireCapabilityFueraDeLaAgenda` suelta lo ponen rojo. Después, rol × ruta × acción.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { dejaPasar, PUERTAS_DE_ACCIONES, PUERTAS_DE_RUTAS, recorridoDeLaMatriz, terminosDe } from "./matriz-permisos";

const RAIZ = path.resolve(import.meta.dirname, "../../..");
const LIB = path.join(RAIZ, "src/lib/proyectos");
const APP = path.join(RAIZ, "src/app/admin/(dashboard)/proyectos");
const leer = (f: string) => readFileSync(f, "utf8");
const archivos = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(path.join(dir, n)).isDirectory() ? archivos(path.join(dir, n)) : [path.join(dir, n)]));

/** Lo que el código pide, en el mismo idioma de la matriz. */
const lista = (s: string) => s.replace(/[" ]/g, "").split(",").join("|");
const PATRONES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/exigirEditar\("(\w+)"\)/g, (m) => `E:${m[1]}`],
  [/exigirVer\("(\w+)"\)/g, (m) => `V:${m[1]}`],
  [/(?:actorCon|exigirAlguno|entrar)\(\[([^\]]*)\]/g, (m) => `E:${lista(m[1])}`],
  [/entrar\("(\w+)"/g, (m) => `E:${m[1]}`],
  [/!puede\(\w+, "(\w+)", "(ver|editar)"\)/g, (m) => `${m[2] === "ver" ? "V" : "E"}:${m[1]}`],
  [/exigirDireccion\(\)/g, () => "DIR"],
  [/exigirPlataDeDireccion\("(\w+)"\)/g, (m) => `PLATA:${m[1]}`],
  [/sinRendiciones\(\w+, "(\w+)"\)/g, (m) => `REND:${m[1]}`],
  [/puedeReintegrarRendicion\(/g, () => "ROL:aprueba"],
  [/cambiaLosPermisos\(/g, () => "MATRIZ"],
];
const puertasEn = (codigo: string) => PATRONES.flatMap(([re, f]) => [...codigo.matchAll(re)].map(f));

/** Cada acción exportada con su puerta: la de su cuerpo y la de los ayudantes del mismo archivo que llama. */
function accionesDelCodigo(): Map<string, string[]> {
  const res = new Map<string, string[]>();
  for (const f of readdirSync(LIB).filter((n) => /^acciones.*\.ts$/.test(n) && !n.includes(".test.")).sort()) {
    const src = leer(path.join(LIB, f));
    const marcas = [...src.matchAll(/^(export )?(async )?function (\w+)|^const (\w+) = /gm)].map((m) => ({ nombre: m[3] ?? m[4], exportada: !!m[1], en: m.index ?? 0 }));
    const cuerpos = new Map(marcas.map((m, i) => [m.nombre, { ...m, cuerpo: src.slice(m.en, marcas[i + 1]?.en ?? src.length).replace(/^[^{]*\{/, "{") }]));
    const puertas = (nombre: string, vistos = new Set<string>()): string[] => {
      if (vistos.has(nombre)) return [];
      vistos.add(nombre);
      const { cuerpo } = cuerpos.get(nombre)!;
      const ayudantes = [...cuerpos.values()].filter((c) => !c.exportada && c.nombre !== nombre && new RegExp(`\\b${c.nombre}\\(`).test(cuerpo));
      return [...puertasEn(cuerpo), ...ayudantes.flatMap((c) => puertas(c.nombre, vistos))];
    };
    for (const c of cuerpos.values()) if (c.exportada) res.set(`${f.replace(/\.ts$/, "")}#${c.nombre}`, [...new Set(puertas(c.nombre))].sort());
  }
  return res;
}

/** La puerta de entrada de cada página (lo de adentro, como las casillas de Permisos, lo deciden sus acciones). */
function rutasDelCodigo(): Map<string, string[]> {
  return new Map(
    archivos(APP)
      .filter((f) => f.endsWith(`${path.sep}page.tsx`))
      .map((f) => [`/${path.relative(APP, path.dirname(f)).split(path.sep).join("/")}`.replace(/\/$/, "") || "/", [...new Set(puertasEn(leer(f)).filter((t) => /^(V|E|PLATA):/.test(t)))].sort()] as const),
  );
}

const ROLES = ["DIRECCION", "ADMINISTRACION", "COMERCIAL", "DISENO", "PRODUCCION", "SIN_FICHA"] as const;

test("A1 · cada acción de Proyectos está en la matriz con la puerta que pide su código, y ninguna sobra", () => {
  const codigo = accionesDelCodigo();
  assert.deepEqual([...codigo.keys()].sort(), Object.keys(PUERTAS_DE_ACCIONES).sort(), "acción sin anotar en matriz-permisos.ts, o anotada y borrada");
  for (const [accion, pide] of codigo) {
    const escrita = PUERTAS_DE_ACCIONES[accion];
    if (pide.length === 0) assert.match(escrita, /^(SESION|LINK) — \S/, `${accion}: sin puerta de módulo en el código; la matriz tiene que decir por qué`);
    else assert.deepEqual(pide, [...terminosDe(escrita)].sort(), `${accion}: el código pide ${pide.join(" ")} y la matriz dice ${escrita}`);
  }
});

test("A1 · cada página de Proyectos está en la matriz con la puerta que pide su código, y ninguna sobra", () => {
  const codigo = rutasDelCodigo();
  assert.deepEqual([...codigo.keys()].sort(), Object.keys(PUERTAS_DE_RUTAS).sort(), "página sin anotar en matriz-permisos.ts, o anotada y borrada");
  for (const [ruta, pide] of codigo) {
    const escrita = PUERTAS_DE_RUTAS[ruta];
    if (pide.length === 0) assert.match(escrita, /^SESION — \S/, `${ruta}: sin puerta de módulo; la matriz tiene que decir por qué`);
    else assert.deepEqual(pide, [...terminosDe(escrita)].sort(), `${ruta}: el código pide ${pide.join(" ")} y la matriz dice ${escrita}`);
  }
});

test("A1 · guarda única: nadie llama a requireCapabilityFueraDeLaAgenda suelto en Proyectos", () => {
  const sueltas = [...archivos(LIB), ...archivos(APP)]
    .filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."))
    .filter((f) => /requireCapabilityFueraDeLaAgenda\(/.test(leer(f)))
    .map((f) => path.relative(RAIZ, f));
  assert.deepEqual(sueltas, ["src/lib/proyectos/gestion.server.ts"], "la capability va sólo dentro de exigirPlataDeDireccion");
});

test("A1 · rol × ruta × acción, con la matriz de fábrica", () => {
  const r = Object.fromEntries(recorridoDeLaMatriz().map((f) => [f.rol, f]));
  const todas = Object.keys(PUERTAS_DE_ACCIONES);
  // Dirección pasa por todas las rutas y todas las acciones.
  assert.equal(r.DIRECCION.acciones.length, todas.length);
  assert.equal(r.DIRECCION.rutas.length, Object.keys(PUERTAS_DE_RUTAS).length);
  // Sin ficha: sólo lo suyo y los links del cliente.
  assert.ok(r.SIN_FICHA.acciones.every((a) => /^(SESION|LINK) — /.test(PUERTAS_DE_ACCIONES[a])));
  assert.ok(r.SIN_FICHA.rutas.every((x) => /^SESION — /.test(PUERTAS_DE_RUTAS[x])));
  // PRY-100 (1-A): la matriz la guarda sólo Dirección. PRY-099 (2-A): Rentabilidad y Configuración, sólo Dirección.
  for (const rol of ROLES.filter((x) => x !== "DIRECCION")) {
    assert.ok(!r[rol].acciones.includes("acciones-gestion#guardarPermisos"), `${rol} guarda la matriz`);
    assert.ok(!r[rol].rutas.includes("/reportes") && !r[rol].rutas.includes("/config"), `${rol} abre Rentabilidad o Configuración`);
  }
  // Nadie fuera de Dirección y Administración mueve cuentas, liquidaciones ni revisa rendiciones.
  const plataDeLaEmpresa = todas.filter((a) => /E:(empresa|liquidaciones)|REND:revisar|ROL:aprueba/.test(PUERTAS_DE_ACCIONES[a]) && !/\|/.test(PUERTAS_DE_ACCIONES[a].split(" — ")[0]));
  for (const rol of ["COMERCIAL", "DISENO", "PRODUCCION", "SIN_FICHA"] as const) assert.deepEqual(r[rol].acciones.filter((a) => plataDeLaEmpresa.includes(a)), [], `${rol} toca plata de la empresa`);
  // La foto fijada: cuántas rutas y acciones abre cada rol. Si cambia una puerta o la fábrica, esto cambia a propósito.
  assert.deepEqual(
    Object.fromEntries(recorridoDeLaMatriz().map((f) => [f.rol, [f.rutas.length, f.acciones.length]])),
    // +3 rutas del Taller de c94fa459 (imprimir/productora, taller/piezas, taller/valores-hora), anotadas con su guarda (MIA-095).
    // MIA-50 T05: +7 rutas de Compras (comprobantes, órdenes, IVA, vinculadas) y +9 acciones, para quien ve/edita Proveedores o Pagos.
    // +9 acciones de T06 (acciones-presupuesto, MIA-125): Administración suma sólo las 2 de «pagos»; Comercial 8; Diseño, ninguna.
    // MIA-50 T07: +1 ruta (la calculadora pasó a /precio/calculadora; /precio es el tablero) y +3 acciones de acciones-precio (E:cotizaciones V:costos): de fábrica las pasan Dirección y Producción (que edita cotizaciones y ve costos); Administración sólo ve la ruta nueva.
    // MIA-50 T08 (moneda y bancos, #205): +2 acciones para Dirección y Administración. Ola 3 integrada (MIA-167): B + Δ T07 + Δ T08.
    { DIRECCION: [43, 151], ADMINISTRACION: [32, 60], COMERCIAL: [24, 86], DISENO: [23, 56], PRODUCCION: [39, 118], SIN_FICHA: [10, 11] },
  );
});

test("A1 · lo guardado por Dirección mueve el recorrido: Administración con «direccion» en ver abre Rentabilidad, no Configuración", () => {
  const g = [{ rol: "ADMINISTRACION", modulo: "direccion", ver: true, editar: false }];
  assert.ok(dejaPasar("ADMINISTRACION", PUERTAS_DE_RUTAS["/reportes"], g));
  assert.ok(!dejaPasar("ADMINISTRACION", PUERTAS_DE_RUTAS["/config"], g));
  assert.ok(!dejaPasar("ADMINISTRACION", PUERTAS_DE_ACCIONES["acciones#guardarConfig"], g));
  // Ni con «equipo» en editar cambia la matriz.
  assert.ok(!dejaPasar("ADMINISTRACION", PUERTAS_DE_ACCIONES["acciones-gestion#guardarPermisos"], [{ rol: "ADMINISTRACION", modulo: "equipo", ver: true, editar: true }]));
});
