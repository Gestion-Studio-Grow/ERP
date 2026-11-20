// ============================================================================
// GSG-MIA-088 · permisos de Proyectos y Administración, contra Postgres real: base efímera migrada, la app conectada como
// `app_rls` (sin BYPASSRLS, sin ser dueña de nada) y las Server Actions reales con sesión. Esperados escritos a mano
// ANTES del arreglo (plan `00-ESTADO/certificacion/GSG-MIA-088.md`, P2, P3 y P5; preguntas 1 y 2 con la opción A,
// provisional a confirmar por el dueño):
//
//  PRY-100  La matriz de permisos la cambia sólo Dirección (pregunta 1, A). Administración con «Equipo» en editar,
//           llamando a `guardarPermisos` por fuera de la pantalla, no cambia ninguna fila ni columna: ni darle
//           `empresa` y `liquidaciones` a Producción (el caso de S1), ni `equipo` o `direccion` a nadie, ni destapar
//           columnas de costo, ni bajar a otro rol, ni el camino de dos pasos, ni un formulario armado a mano. Cada
//           rechazo: 0 filas nuevas en `ProyectoPermiso` y en el registro de cambios. Quien tiene «Equipo» carga
//           personas, pero no se cambia de ficha (desvincularse es el primer paso para cambiarse el rol).
//           Dirección (la dueña sin ficha y una Dirección con ficha) sigue pudiendo todo.
//  PRY-099  Rentabilidad y Configuración de propuestas las decide el rol de gestión (pregunta 2, A: Dirección y a quien
//           Dirección le abra el módulo `direccion`), no la capability `agenda:manage`: Comercial, Administración y
//           Producción con rol del ERP alto no leen `reporteProyectos` ni `proveedoresConGastos` y `guardarConfig` no
//           les guarda nada, aunque se llamen directo. El calendario por token no da Dirección a quien no tiene ficha.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor, type SalidaDeAccion } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const INICIO = "/admin/proyectos/inicio";
const PERMISOS_OK = "/admin/proyectos/equipo?tab=permisos&ok=1";

type Salida<R> = SalidaDeAccion<R> | { tipo: "error"; mensaje: string };

let preparado: ReturnType<typeof armar> | null = null;
async function armar(base: BaseEfimera) {
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;
  for (const n of [a, b]) {
    const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: n.id }, select: { modules: true } });
    await duenio.tenant.update({ where: { id: n.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  }
  const core = await import("./gestion-core");
  const gestion = await import("./acciones-gestion");
  const acciones = await import("./acciones");
  const datos = await import("./datos.server");
  const lecturas = await import("./gestion-lecturas.server");

  // Equipo de A. Todas las cuentas con rol del ERP alto (RECEPTION: tiene `agenda:manage`), salvo la dueña (OWNER, sin ficha).
  const cuenta = (nombre: string) => duenio.user.create({ data: { tenantId: a.id, name: nombre, email: `${nombre.toLowerCase()}@mia088.test`, passwordHash: "x", role: "RECEPTION" }, select: { id: true } });
  const [adm, com, prod, dir] = await Promise.all([cuenta("Admin"), cuenta("Comercial"), cuenta("Produccion"), cuenta("Direccion")]);
  const persona = (userId: string, nombre: string, rol: string) => duenio.proyectoPersona.create({ data: { tenantId: a.id, userId, nombre, email: `${nombre.toLowerCase()}@mia088.test`, rol }, select: { id: true } });
  const fichas = {
    adm: await persona(adm.id, "Admin", "ADMINISTRACION"),
    com: await persona(com.id, "Comercial", "COMERCIAL"),
    prod: await persona(prod.id, "Produccion", "PRODUCCION"),
    dir: await persona(dir.id, "Direccion", "DIRECCION"),
  };
  const usuarios = { duenia: a.duenia.id, adm: adm.id, com: com.id, prod: prod.id, dir: dir.id, sinFicha: a.recepcion.id };

  /** Corre la acción con la sesión de `usuarioId`; un `throw` de la acción vuelve como `{ tipo: "error" }`. */
  const como = async <R>(usuarioId: string | null, fn: () => Promise<R>): Promise<Salida<R>> => {
    try {
      return await ejecutarAccion({ negocio: a, usuario: usuarioId ? { id: usuarioId } : null }, fn);
    } catch (e) {
      return { tipo: "error", mensaje: e instanceof Error ? e.message : String(e) };
    }
  };

  /** Lo que mira el test, como dueño de las tablas y con el negocio fijado (sirve aunque la RLS esté forzada). */
  const mirar = <R>(tenantId: string, fn: (tx: Parameters<Parameters<typeof duenio.$transaction>[0]>[0]) => Promise<R>) =>
    duenio.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      return fn(tx);
    });
  const permisosGuardados = (tenantId = a.id) => mirar(tenantId, (tx) => tx.proyectoPermiso.findMany({ select: { rol: true, modulo: true, ver: true, editar: true, columnasOcultas: true } }));
  /** La foto de todo lo que un cambio de permisos puede tocar, en los dos negocios. */
  const foto = async () => {
    const una = async (tenantId: string) =>
      mirar(tenantId, async (tx) => ({
        permisos: (await tx.proyectoPermiso.findMany({ select: { rol: true, modulo: true, ver: true, editar: true, columnasOcultas: true } }))
          .map((p) => `${p.rol}|${p.modulo}|${p.ver}|${p.editar}|${JSON.stringify(p.columnasOcultas)}`)
          .sort(),
        registro: await tx.proyectoCambio.count(),
        personas: (await tx.proyectoPersona.findMany({ select: { id: true, rol: true, userId: true, activa: true } })).map((p) => `${p.id}|${p.rol}|${p.userId}|${p.activa}`).sort(),
      }));
    return { a: await una(a.id), b: await una(b.id) };
  };

  type Matriz = Record<string, { ver: boolean; editar: boolean }> & { ocultas: Record<string, string[]> };
  const EDITABLES = core.ROLES_GESTION.filter((r) => r !== "DIRECCION");
  /** La matriz vigente de A, tal cual la pinta la pantalla (lo guardado o lo de fábrica). */
  const matrizActual = async (): Promise<Matriz> => {
    const guardados = await permisosGuardados();
    const m = { ocultas: {} } as Matriz;
    for (const rol of EDITABLES) {
      for (const { id } of core.MODULOS) m[`${rol}:${id}`] = core.permisoDe(rol, id, guardados);
      const g = guardados.find((p) => p.rol === rol && p.modulo === "ficha")?.columnasOcultas;
      m.ocultas[rol] = Array.isArray(g) ? (g as string[]) : [...core.COLUMNAS_OCULTAS_BASE[rol]];
    }
    return m;
  };
  /** El formulario de la pantalla con la matriz vigente, más los cambios pedidos; `extra` agrega campos a mano. */
  const formPermisos = async (cambios: Record<string, { ver: boolean; editar: boolean }>, ocultas: Record<string, string[]> = {}, extra: string[] = []) => {
    const m = await matrizActual();
    const fd = new FormData();
    for (const rol of EDITABLES) {
      for (const { id } of core.MODULOS) {
        const p = cambios[`${rol}:${id}`] ?? m[`${rol}:${id}`];
        if (p.ver) fd.set(`ver:${rol}:${id}`, "on");
        if (p.editar) fd.set(`editar:${rol}:${id}`, "on");
      }
      for (const c of ocultas[rol] ?? m.ocultas[rol]) fd.set(`oculta:${rol}:${c}`, "on");
    }
    for (const campo of extra) fd.set(campo, "on");
    return fd;
  };
  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const E = { ver: true, editar: true };
  const V = { ver: true, editar: false };
  const N = { ver: false, editar: false };

  // Precondición del caso de S1: Dirección le abre «Equipo» a Administración. Es Dirección: tiene que poder.
  const abrirEquipo = await como(usuarios.duenia, async () => gestion.guardarPermisos(await formPermisos({ "ADMINISTRACION:equipo": E })));
  assert.deepEqual(abrirEquipo.tipo === "redireccion" && abrirEquipo.destino, PERMISOS_OK, `Dirección le abre Equipo a Administración: ${JSON.stringify(abrirEquipo)}`);

  return { base, duenio, a, b, core, gestion, acciones, datos, lecturas, usuarios, fichas, como, mirar, foto, permisosGuardados, formPermisos, form, E, V, N };
}
async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  preparado ??= armar(base);
  return preparado;
}

const esRechazo = (s: Salida<unknown>) => s.tipo === "error" || (s.tipo === "redireccion" && s.destino !== PERMISOS_OK);

test("PRY-100 · Administración con «Equipo» no cambia la matriz por fuera de la pantalla: ninguna fila, ninguna columna, 0 renglones", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { como, usuarios, gestion, formPermisos, foto, E, V, N } = p;
  const casos: [string, () => Promise<FormData>][] = [
    ["S1: a Producción, Cuentas y Liquidaciones en editar", () => formPermisos({ "PRODUCCION:empresa": E, "PRODUCCION:liquidaciones": E })],
    ["dar «Equipo» a Comercial", () => formPermisos({ "COMERCIAL:equipo": E })],
    ["dar «Tablero y reportes de Dirección» a Diseño", () => formPermisos({ "DISENO:direccion": V })],
    ["destapar las columnas de costo a Comercial", async () => formPermisos({}, { COMERCIAL: [] })],
    ["bajar a Producción (sin Proyectos y leads)", () => formPermisos({ "PRODUCCION:pipeline": N })],
    ["subirse a sí misma «Dirección» (la fila propia)", () => formPermisos({ "ADMINISTRACION:direccion": E })],
    ["formulario armado a mano con rol y módulo que no existen", () => formPermisos({ "PRODUCCION:empresa": E }, {}, ["editar:SUPERADMIN:equipo", "editar:ADMINISTRACION:raiz", "editar:DIRECCION:empresa"])],
  ];
  for (const [nombre, armarForm] of casos) {
    const antes = await foto();
    const r = await como(usuarios.adm, async () => gestion.guardarPermisos(await armarForm()));
    assert.ok(esRechazo(r), `${nombre}: Administración no cambia permisos, y la acción lo rechazó (vino ${JSON.stringify(r)})`);
    assert.deepEqual(await foto(), antes, `${nombre}: 0 filas en ProyectoPermiso y 0 renglones en el registro, en A y en B`);
  }
});

test("PRY-100 · el camino de dos pasos: con «Equipo» en Comercial (se lo dio Dirección), Comercial no le sube nada a Administración", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { como, usuarios, gestion, formPermisos, foto, E } = p;
  // Primer paso por Administración: rechazado (y sin efecto).
  const antes = await foto();
  const paso1 = await como(usuarios.adm, async () => gestion.guardarPermisos(await formPermisos({ "COMERCIAL:equipo": E })));
  assert.ok(esRechazo(paso1), `paso 1: Administración no le da Equipo a Comercial (vino ${JSON.stringify(paso1)})`);
  assert.deepEqual(await foto(), antes, "paso 1: 0 cambios");
  // Aunque Dirección le haya abierto «Equipo» a Comercial, el segundo paso tampoco pasa.
  const abre = await como(usuarios.duenia, async () => gestion.guardarPermisos(await formPermisos({ "COMERCIAL:equipo": E })));
  assert.ok(abre.tipo === "redireccion" && abre.destino === PERMISOS_OK, `Dirección le abre Equipo a Comercial: ${JSON.stringify(abre)}`);
  const medio = await foto();
  const paso2 = await como(usuarios.com, async () => gestion.guardarPermisos(await formPermisos({ "ADMINISTRACION:direccion": E, "ADMINISTRACION:empresa": E })));
  assert.ok(esRechazo(paso2), `paso 2: Comercial no le sube permisos a Administración (vino ${JSON.stringify(paso2)})`);
  assert.deepEqual(await foto(), medio, "paso 2: 0 cambios");
  const cierra = await como(usuarios.duenia, async () => gestion.guardarPermisos(await formPermisos({ "COMERCIAL:equipo": { ver: false, editar: false } })));
  assert.ok(cierra.tipo === "redireccion", "Dirección vuelve a cerrarle Equipo a Comercial");
});

test("PRY-100 · quien tiene «Equipo» carga personas, pero no se cambia de ficha (desvincularse es el primer paso para cambiarse el rol)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { como, usuarios, fichas, gestion, form, foto, formPermisos, E } = p;
  const noPasa = (x: Salida<unknown>) => esRechazo(x) || (x.tipo === "respuesta" && !(x.valor as { ok: boolean }).ok);
  const antes = await foto();
  const suelta = await como(usuarios.adm, () => gestion.guardarPersona(form({ id: fichas.adm.id, nombre: "Admin", email: "admin@mia088.test", rol: "ADMINISTRACION" })));
  assert.ok(noPasa(suelta), `Administración no desvincula su propia cuenta de su ficha (vino ${JSON.stringify(suelta)})`);
  assert.deepEqual(await foto(), antes, "0 cambios: sigue vinculada, con su rol");
  // MIA-237 (dueño, 20/11: «Administración no es dirección»): «Equipo» le queda fijo en sin acceso aunque Dirección se lo
  // guarde (la precondición de `armar`): no carga personas ni roles.
  const altaAdm = await como(usuarios.adm, () => gestion.guardarPersona(form({ nombre: "Armador nuevo", rol: "PRODUCCION" })));
  assert.ok(noPasa(altaAdm), `Administración ya no da de alta personas (vino ${JSON.stringify(altaAdm)})`);
  assert.deepEqual(await foto(), antes, "0 cambios");
  // Cargar a otra persona sí, para quien tiene «Equipo»: Dirección se lo abre a Comercial.
  const abre = await como(usuarios.duenia, async () => gestion.guardarPermisos(await formPermisos({ "COMERCIAL:equipo": E })));
  assert.ok(abre.tipo === "redireccion" && abre.destino === PERMISOS_OK, `Dirección le abre Equipo a Comercial: ${JSON.stringify(abre)}`);
  const alta = await como(usuarios.com, () => gestion.guardarPersona(form({ nombre: "Armador nuevo", rol: "PRODUCCION" })));
  assert.deepEqual(alta.tipo === "respuesta" && alta.valor, { ok: true }, `Comercial con Equipo da de alta a una persona: ${JSON.stringify(alta)}`);
  const cierra = await como(usuarios.duenia, async () => gestion.guardarPermisos(await formPermisos({ "COMERCIAL:equipo": { ver: false, editar: false } })));
  assert.ok(cierra.tipo === "redireccion", "Dirección vuelve a cerrarle Equipo a Comercial");
});

test("PRY-100 · Dirección sigue pudiendo todo: la dueña sin ficha y una Dirección con ficha cambian la matriz, con su renglón", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { como, usuarios, gestion, formPermisos, foto, permisosGuardados, mirar, a, V, N } = p;
  for (const [quien, id] of [["la dueña sin ficha", usuarios.duenia], ["Dirección con ficha", usuarios.dir]] as const) {
    const antes = await foto();
    // Una celda que no toca ningún otro test (Diseño · Proveedores, de fábrica «sin acceso»): el renglón no depende del orden.
    const da = await como(id, async () => gestion.guardarPermisos(await formPermisos({ "DISENO:proveedores": V })));
    assert.ok(da.tipo === "redireccion" && da.destino === PERMISOS_OK, `${quien}: guarda (vino ${JSON.stringify(da)})`);
    const fila = (await permisosGuardados()).find((f) => f.rol === "DISENO" && f.modulo === "proveedores");
    assert.deepEqual([fila?.ver, fila?.editar], [true, false], `${quien}: la fila quedó`);
    assert.equal((await foto()).a.registro, antes.a.registro + 1, `${quien}: un renglón en el registro`);
    const saca = await como(id, async () => gestion.guardarPermisos(await formPermisos({ "DISENO:proveedores": N })));
    assert.ok(saca.tipo === "redireccion", `${quien}: vuelve atrás`);
  }
  // Un formulario armado a mano por Dirección no crea filas de roles ni módulos que no existen.
  const raro = await como(usuarios.duenia, async () => gestion.guardarPermisos(await formPermisos({}, {}, ["editar:SUPERADMIN:equipo", "editar:ADMINISTRACION:raiz", "ver:DIRECCION:empresa"])));
  assert.ok(raro.tipo === "redireccion", "Dirección guarda; lo inventado se ignora");
  const filas = await mirar(a.id, (tx) => tx.proyectoPermiso.findMany({ select: { rol: true, modulo: true } }));
  assert.deepEqual(filas.filter((f) => !["ADMINISTRACION", "COMERCIAL", "DISENO", "PRODUCCION"].includes(f.rol) || f.modulo === "raiz"), [], "ninguna fila inventada");
});

test("PRY-099 · Rentabilidad y Configuración las decide el rol de gestión: Comercial, Administración y Producción con agenda:manage, rechazados aunque llamen directo", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { como, usuarios, datos, acciones, mirar, a, form } = p;
  const config = () => mirar(a.id, (tx) => tx.proyectoConfig.findUnique({ where: { tenantId: a.id }, select: { margenPct: true, condiciones: true, validezDias: true, ivaPct: true } }));
  const antes = await config();
  for (const [rol, id] of [["Comercial", usuarios.com], ["Administración", usuarios.adm], ["Producción", usuarios.prod]] as const) {
    const reporte = await como(id, () => datos.reporteProyectos());
    assert.ok(reporte.tipo !== "respuesta", `${rol}: reporteProyectos no le responde (vino ${reporte.tipo})`);
    const proveedores = await como(id, () => datos.proveedoresConGastos());
    assert.ok(proveedores.tipo !== "respuesta", `${rol}: proveedoresConGastos no le responde (vino ${proveedores.tipo})`);
    const guarda = await como(id, () => acciones.guardarConfig(form({ margenPct: "99", validezDias: "3", ivaPct: "0", condiciones: `puesto por ${rol}` })));
    assert.ok(guarda.tipo !== "respuesta", `${rol}: guardarConfig no le guarda (vino ${guarda.tipo})`);
    assert.deepEqual(await config(), antes, `${rol}: Configuración sin cambios`);
  }
});

test("PRY-099 · Dirección (dueña sin ficha y con ficha) lee Rentabilidad y guarda Configuración; a quien Dirección le abre `direccion`, según ver o editar", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { como, usuarios, datos, acciones, gestion, formPermisos, mirar, a, form, V, E, N } = p;
  const margen = async () => (await mirar(a.id, (tx) => tx.proyectoConfig.findUnique({ where: { tenantId: a.id }, select: { margenPct: true } })))?.margenPct ?? 35;
  for (const [quien, id, pct] of [["la dueña sin ficha", usuarios.duenia, "41"], ["Dirección con ficha", usuarios.dir, "42"]] as const) {
    const reporte = await como(id, () => datos.reporteProyectos());
    assert.ok(reporte.tipo === "respuesta" && Array.isArray(reporte.valor), `${quien}: lee Rentabilidad (vino ${JSON.stringify(reporte).slice(0, 200)})`);
    const proveedores = await como(id, () => datos.proveedoresConGastos());
    assert.equal(proveedores.tipo, "respuesta", `${quien}: lee proveedores con gastos`);
    const guarda = await como(id, () => acciones.guardarConfig(form({ margenPct: pct, validezDias: "15", ivaPct: "21", condiciones: "" })));
    assert.equal(guarda.tipo, "respuesta", `${quien}: guarda Configuración`);
    assert.equal(await margen(), Number(pct), `${quien}: el recargo quedó`);
  }
  // Dirección le abre `direccion` en «ver» a Administración: lee Rentabilidad, no guarda Configuración.
  assert.equal((await como(usuarios.duenia, async () => gestion.guardarPermisos(await formPermisos({ "ADMINISTRACION:direccion": V })))).tipo, "redireccion");
  assert.equal((await como(usuarios.adm, () => datos.reporteProyectos())).tipo, "respuesta", "Administración con `direccion` en ver: lee Rentabilidad");
  const sinEditar = await como(usuarios.adm, () => acciones.guardarConfig(form({ margenPct: "77", validezDias: "15", ivaPct: "21", condiciones: "" })));
  assert.notEqual(sinEditar.tipo, "respuesta", "con `direccion` en ver, Configuración no se guarda");
  assert.equal(await margen(), 42, "el recargo no cambió");
  // En «editar», guarda.
  assert.equal((await como(usuarios.duenia, async () => gestion.guardarPermisos(await formPermisos({ "ADMINISTRACION:direccion": E })))).tipo, "redireccion");
  assert.equal((await como(usuarios.adm, () => acciones.guardarConfig(form({ margenPct: "43", validezDias: "15", ivaPct: "21", condiciones: "" })))).tipo, "respuesta");
  assert.equal(await margen(), 43, "Administración con `direccion` en editar guarda");
  assert.equal((await como(usuarios.duenia, async () => gestion.guardarPermisos(await formPermisos({ "ADMINISTRACION:direccion": N })))).tipo, "redireccion", "Dirección vuelve a cerrarlo");
  assert.notEqual((await como(usuarios.adm, () => datos.reporteProyectos())).tipo, "respuesta", "cerrado, Administración vuelve a no leer Rentabilidad");
});

test("PRY-099 · el calendario por token arma el mismo rol que la sesión: sin ficha no es Dirección", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { como, usuarios, lecturas, a } = p;
  const rol = async (userId: string) => {
    const r = await como(null, () => lecturas.actorDeUsuario(a.id, userId));
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: { rol: string } | null }).valor?.rol ?? null;
  };
  assert.equal(await rol(usuarios.sinFicha), null, "una cuenta con agenda:manage y sin ficha no tiene calendario (en la sesión no abre nada)");
  assert.equal(await rol(usuarios.com), "COMERCIAL", "con ficha, el rol de la ficha");
  assert.equal(await rol(usuarios.duenia), "DIRECCION", "la dueña sin ficha, Dirección (como en la sesión)");
});
