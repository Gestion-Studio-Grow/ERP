/**
 * A1 de DIR-007 (GSG-MIA-091) · el test que recorre la matriz entera. Lee el código: cada acción de servidor de Proyectos y cada
 * página tiene que estar anotada en `matriz-permisos.ts` con la puerta que de verdad pide. Una acción nueva sin anotar, una puerta
 * cambiada sin cambiar la matriz o una `requireCapabilityFueraDeLaAgenda` suelta lo ponen rojo. Después, rol × ruta × acción.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { dejaPasar, PUERTAS_DE_ACCIONES, PUERTAS_DE_RUTAS, recorridoDeLaMatriz, terminosDe } from "./matriz-permisos";

const RAIZ = path.resolve(import.meta.dirname, "../../..");
const LIB = path.join(RAIZ, "src/lib/proyectos");
const APP = path.join(RAIZ, "src/app/admin/(dashboard)/proyectos");
const DASH = path.join(RAIZ, "src/app/admin/(dashboard)");
/** MIA-50 T11 (Adenda 2): las apps del ERP que, con el panel de Proyectos cerrado, piden el módulo «Empresa». */
const APPS_DEL_ERP = ["cuentas-a-cobrar", "cuentas-a-pagar", "flujo"];
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
  [/soloRol\(\w+, "(\w+)"\)/g, (m) => `SOLO:${m[1]}`],
  [/exigirPlataDeDireccion\("(\w+)"\)/g, (m) => `PLATA:${m[1]}`],
  [/sinRendiciones\(\w+, "(\w+)"\)/g, (m) => `REND:${m[1]}`],
  [/puedeReintegrarRendicion\(/g, () => "ROL:aprueba"],
  [/cambiaLosPermisos\(/g, () => "MATRIZ"],
  // MIA-196: el 3er argumento de `exigirPuertaDeGestion` (MIA-194) es la app del aviso de salida, no una puerta: se acepta y se ignora.
  [/(?:exigir|sin)PuertaDeGestion\("(\w+)", "(ver|editar)"(?:, "[\w-]+")?\)/g, (m) => `${m[2] === "ver" ? "V" : "E"}:${m[1]}`],
];
const puertasEn = (codigo: string) => PATRONES.flatMap(([re, f]) => [...codigo.matchAll(re)].map(f));

/** Cada acción exportada con su puerta: la de su cuerpo y la de los ayudantes del mismo archivo que llama. */
function accionesDelCodigo(): Map<string, string[]> {
  const res = new Map<string, string[]>();
  const deProyectos = readdirSync(LIB).filter((n) => /^acciones.*\.ts$/.test(n) && !n.includes(".test.")).sort().map((f) => [f, path.join(LIB, f)] as const);
  const delErp = APPS_DEL_ERP.map((a) => [`${a}/actions.ts`, path.join(DASH, a, "actions.ts")] as const).filter(([, p]) => existsSync(p));
  for (const [f, archivo] of [...deProyectos, ...delErp]) {
    const src = leer(archivo);
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
  const puertas = (f: string) => [...new Set(puertasEn(leer(f)).filter((t) => /^(V|E|PLATA):/.test(t)))].sort();
  const paginas = (dir: string) => archivos(dir).filter((f) => f.endsWith(`${path.sep}page.tsx`));
  const deProyectos = paginas(APP).map((f) => [`/${path.relative(APP, path.dirname(f)).split(path.sep).join("/")}`.replace(/\/$/, "") || "/", puertas(f)] as const);
  // MIA-50 T11: las páginas de las apps del ERP de la Adenda 2, con su ruta entera (`/admin/…`).
  const delErp = APPS_DEL_ERP.flatMap((a) => paginas(path.join(DASH, a))).map((f) => [`/admin/${path.relative(DASH, path.dirname(f)).split(path.sep).join("/")}`, puertas(f)] as const);
  return new Map([...deProyectos, ...delErp]);
}

const ROLES = ["DIRECCION", "ADMINISTRACION", "COMERCIAL", "DISENO", "PRODUCCION", "PRODUCCION_CAMPO", "SIN_FICHA"] as const;

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
  // Dirección pasa por todas las rutas y todas las acciones, salvo las que son sólo de otro rol (`SOLO:`, MIA-50 T10: declarar
  // los costos completos del proyecto es de Administración).
  const deOtroRol = todas.filter((a) => terminosDe(PUERTAS_DE_ACCIONES[a]).some((t) => t.startsWith("SOLO:") && t !== "SOLO:DIRECCION"));
  assert.deepEqual(deOtroRol, ["acciones-liquidacion-proyecto#declararCostosCompletos"]);
  assert.deepEqual(todas.filter((a) => !r.DIRECCION.acciones.includes(a)), deOtroRol);
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
  for (const rol of ["COMERCIAL", "DISENO", "PRODUCCION", "PRODUCCION_CAMPO", "SIN_FICHA"] as const) assert.deepEqual(r[rol].acciones.filter((a) => plataDeLaEmpresa.includes(a)), [], `${rol} toca plata de la empresa`);
  // La foto fijada: cuántas rutas y acciones abre cada rol. Si cambia una puerta o la fábrica, esto cambia a propósito.
  assert.deepEqual(
    Object.fromEntries(recorridoDeLaMatriz().map((f) => [f.rol, [f.rutas.length, f.acciones.length]])),
    // +3 rutas del Taller de c94fa459 (imprimir/productora, taller/piezas, taller/valores-hora), anotadas con su guarda (MIA-095).
    // MIA-50 T05: +7 rutas de Compras (comprobantes, órdenes, IVA, vinculadas) y +9 acciones, para quien ve/edita Proveedores o Pagos.
    // +9 acciones de T06 (acciones-presupuesto, MIA-125): Administración suma sólo las 2 de «pagos»; Comercial 8; Diseño, ninguna.
    // MIA-50 T07: +1 ruta (la calculadora pasó a /precio/calculadora; /precio es el tablero) y +3 acciones de acciones-precio (E:cotizaciones V:costos): de fábrica las pasan Dirección y Producción (que edita cotizaciones y ve costos); Administración sólo ve la ruta nueva.
    // MIA-50 T08 (moneda y bancos, #205): +2 acciones para Dirección y Administración.
    // +4 acciones de T09 (acciones-etapas, MIA-151): las 3 de «pipeline» en editar para Comercial y Producción; cancelar, sólo Dirección.
    // MIA-50 T08 vuelta 3: +1 acción (tiposDeRetencion, la puerta de marcarCuota, E:pagos|empresa) para Dirección, Administración y Producción.
    // Ola 3 integrada (MIA-167, MIA-170): B + Δ T07 + Δ T08 + Δ T09 + Δ T08 vuelta 3.
    // MIA-50 T11 (Adenda 2): +5 rutas del ERP (las listas y los detalles [id] de Cuentas a cobrar y a pagar, y Flujo; la ficha decía
    // «+3» contando sólo las apps) y +4 acciones (el cobro, el pago y los dos de cheques), para quien tiene «Empresa»: Dirección y
    // Administración. Nadie más cambia. Rol nuevo Producción de campo (O47): sólo lo suyo, el proyecto y la ficha en ver.
    // MIA-50 T10 (ola 4, MIA-179): +3 acciones de la liquidación del proyecto. Revisar (E:liquidaciones) para Dirección y
    // Administración; declarar, sólo Administración; aprobar, sólo Dirección. Nadie más cambia.
    // MIA-50 T12: Dirección suma `aprobarAjusteTardio` (SOLO:DIRECCION) → 163; los demás roles no cambian.
    // MIA-229 («Producción no», orden del dueño 20/11): Producción pierde las 15 acciones que pedían «Pagos · editar»
    // (122 → 107); las rutas no cambian (39). Los demás roles, igual.
    { DIRECCION: [48, 163], ADMINISTRACION: [37, 67], COMERCIAL: [24, 89], DISENO: [23, 56], PRODUCCION: [39, 107], PRODUCCION_CAMPO: [15, 12], SIN_FICHA: [10, 11] },
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

// ── MIA-237 · puestos de la productora (dueño, 20/11 13:05Z y 13:25Z: «Es productor comercial y productor de campo. El de
// campo no ve plata. El productor comercial es B ve costos tmb / 2. No se puede / 3. Administración no es dirección pero ve
// toda la adm y los proyectos tmb»). Se lee del código por `import *`: en rojo, lo que falta da false, no rompe el archivo.
test("MIA-237 · productor comercial: ve costos (sin cambiarlos) y cobros, nunca pagos ni deudas; ni Dirección se los da", async () => {
  const core = (await import("./gestion-core")) as unknown as Record<string, unknown> & typeof import("./gestion-core");
  const veLosCobros = (core.veLosCobros as ((r: string) => boolean) | undefined) ?? (() => false);
  const guardado = (modulo: string) => [{ rol: "COMERCIAL", modulo, ver: true, editar: true }];
  assert.deepEqual(core.permisoDe("COMERCIAL", "costos", []), { ver: true, editar: false }, "de fábrica ve los costos");
  assert.deepEqual(core.permisoDe("COMERCIAL", "costos", guardado("costos")), { ver: true, editar: false }, "ve, no los cambia aunque Dirección se lo guarde");
  assert.deepEqual(core.COLUMNAS_OCULTAS_BASE.COMERCIAL, [], "las cuatro columnas de costo a la vista");
  for (const m of ["pagos", "empresa", "liquidaciones"] as const) assert.deepEqual(core.permisoDe("COMERCIAL", m, guardado(m)), { ver: false, editar: false }, m);
  assert.deepEqual(
    Object.fromEntries([...core.ROLES_GESTION, "SIN_FICHA"].map((r) => [r, veLosCobros(r)])),
    { DIRECCION: true, ADMINISTRACION: true, COMERCIAL: true, DISENO: false, PRODUCCION: false, PRODUCCION_CAMPO: false, SIN_FICHA: false },
  );
});

test("MIA-237 · productor de campo: ningún importe (costos, cotizaciones, proveedores, cobros, pagos, empresa, liquidaciones ni tablero), aunque Dirección se los guarde", async () => {
  const core = (await import("./gestion-core")) as unknown as Record<string, unknown> & typeof import("./gestion-core");
  const veImportes = (core.veImportes as ((r: string) => boolean) | undefined) ?? (() => true);
  const todo = core.MODULOS.map((m) => ({ rol: "PRODUCCION_CAMPO", modulo: m.id, ver: true, editar: true }));
  const conImportes = ["costos", "cotizaciones", "proveedores", "pagos", "empresa", "liquidaciones", "direccion"] as const;
  assert.deepEqual(conImportes.filter((m) => core.permisoDe("PRODUCCION_CAMPO", m, todo).ver), [], "módulos con importes que se le abren");
  assert.ok(conImportes.every((m) => core.permisoFijo("PRODUCCION_CAMPO", m)), "la pantalla de permisos no deja dárselos");
  assert.equal(veImportes("PRODUCCION_CAMPO"), false, "ni la venta del proyecto");
  assert.equal(veImportes("SIN_FICHA"), false);
  for (const r of ["DIRECCION", "ADMINISTRACION", "COMERCIAL", "PRODUCCION", "DISENO"]) assert.equal(veImportes(r), true, r);
  // Sigue rindiendo lo suyo.
  assert.deepEqual(core.permisoDe("PRODUCCION_CAMPO", "rendiciones", []), { ver: true, editar: false });
});

test("MIA-237 · Administración: toda la plata y los proyectos, sin administrar usuarios ni permisos (aunque su usuario del ERP sea OWNER)", async () => {
  const core = await import("./gestion-core");
  const { DECISIONES_DE_PUESTOS } = await import("./decisiones-puestos");
  const { permisoEfectivo } = await import("@/lib/capabilities");
  const negadas = (DECISIONES_DE_PUESTOS as unknown as { capacidadesNegadas?: Record<string, readonly string[]> }).capacidadesNegadas;
  assert.deepEqual(negadas?.ADMINISTRACION, ["users:manage"], "el puesto le saca Usuarios al OWNER");
  // El candado del resolvedor: una negación del puesto vale; un «permitido» de users:manage por la base, no.
  const comoAdm = { role: "OWNER" as const, overrides: [{ capability: "users:manage", allowed: false }] };
  assert.equal(permisoEfectivo(comoAdm, "users:manage"), false);
  assert.equal(permisoEfectivo(comoAdm, "billing:manage"), true, "Facturación sigue");
  assert.equal(permisoEfectivo({ role: "RECEPTION", overrides: [{ capability: "users:manage", allowed: true }] }, "users:manage"), false);
  assert.ok(core.appEnLaBarra("proyectos", "ADMINISTRACION"), "Proyectos a la vista de Administración");
  assert.ok(core.veTodosLosProyectos("ADMINISTRACION"));
  for (const m of ["pagos", "empresa", "liquidaciones", "costos"] as const) assert.ok(core.permisoDe("ADMINISTRACION", m, []).ver, m);
  assert.ok(!core.cambiaLosPermisos("ADMINISTRACION"));
  assert.deepEqual(core.permisoDe("ADMINISTRACION", "equipo", [{ rol: "ADMINISTRACION", modulo: "equipo", ver: true, editar: true }]), { ver: false, editar: false }, "ni Equipo guardado");
});

test("MIA-237 · las puertas de MIA-236: % de anticipo de un proveedor sólo con la plata; costos al presupuesto sólo con «Costos · editar»", () => {
  const leerFuente = (f: string) => readFileSync(path.join(RAIZ, f), "utf8");
  assert.match(PUERTAS_DE_ACCIONES["acciones-gestion#guardarProveedor"], /veLaPlata/, "la matriz anota la traba del % de anticipo");
  const gestion = leerFuente("src/lib/proyectos/acciones-gestion.ts");
  const cuerpo = gestion.slice(gestion.indexOf("export async function guardarProveedor"), gestion.indexOf("export async function cambiarEstadoProveedor"));
  assert.match(cuerpo, /veLaPlata\(a\.user\)/, "guardarProveedor pregunta por la plata");
  const taller = leerFuente("src/lib/taller-stands/acciones.ts");
  const pase = taller.slice(taller.indexOf("export async function despieceAlPresupuesto"));
  assert.match(pase.slice(0, 600), /editaCostos: true/, "despieceAlPresupuesto pide editar costos");
});
