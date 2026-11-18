// GSG-MIA-104 · H3 (hallazgo de GSG-MIA-103 sobre #195): con «Equipo» en editar y sin ser Dirección se le cambiaba el ROL a la
// ficha de otra persona (Comercial pasó a Diseño a Administración y esa cuenta, después, a Comercial). Es la subida en dos pasos
// de PRY-100, pero por el rol y no por la matriz. Opción A, provisional a confirmar por el dueño: el rol de una ficha lo cambia
// sólo Dirección, y por la misma razón la cuenta del ERP vinculada a una ficha (vincular una cuenta a una ficha le da ese rol;
// desvincularla y volver a vincularla a otra ficha era el mismo cambio por otro camino).
// Contra Postgres, con la app como `app_rls`, y con ingreso REAL: cada cuenta entra por `login` con mail y contraseña y las
// acciones corren con la cookie que dejó ese ingreso (no una firmada a mano).
import assert from "node:assert/strict";
import { test } from "node:test";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";

// Sólo para la prueba: nunca se imprime.
const CLAVE = ["clave", "de", "prueba", "mia104"].join("-");

test("H3 · con «Equipo» y sin ser Dirección no se cambia el rol de una ficha ni la cuenta vinculada; Dirección sí", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  const { hashPassword } = await import("@/lib/auth-password");
  const { getSessionCookieName } = await import("@/lib/auth");
  const { login } = await import("@/lib/auth-actions");
  const gestion = await import("./acciones-gestion");
  const gs = await import("./gestion.server");
  const fd = (c: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(c)) f.set(k, v);
    return f;
  };

  const hash = await hashPassword(CLAVE);
  const cuenta = (nombre: string) => duenio.user.create({ data: { tenantId: a.id, name: nombre, email: `${nombre.toLowerCase()}@mia104.test`, passwordHash: hash, role: "RECEPTION" }, select: { id: true } });
  const [com, dis, nuevo] = await Promise.all([cuenta("Comercial"), cuenta("Diseno"), cuenta("Nuevo")]);
  await duenio.user.update({ where: { id: a.duenia.id }, data: { passwordHash: hash } });
  const dueniaMail = (await duenio.user.findUniqueOrThrow({ where: { id: a.duenia.id }, select: { email: true } })).email;
  const fCom = await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: com.id, nombre: "Comercial", email: "comercial@mia104.test", rol: "COMERCIAL" }, select: { id: true } });
  const fDis = await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: dis.id, nombre: "Diseno", email: "diseno@mia104.test", rol: "DISENO" }, select: { id: true } });
  const fArm = await duenio.proyectoPersona.create({ data: { tenantId: a.id, nombre: "Armador", email: "armador@mia104.test", rol: "PRODUCCION" }, select: { id: true } });
  // La condición de H3 (la misma de PRY-100): Dirección le abrió «Equipo» en editar a Comercial.
  await duenio.proyectoPermiso.create({ data: { tenantId: a.id, rol: "COMERCIAL", modulo: "equipo", ver: true, editar: true } });

  /** Ingreso real: `login` con mail y contraseña; devuelve la cookie de sesión que dejó. */
  const entrar = async (email: string) => {
    const r = await ejecutarAccion({ negocio: a }, () => login(fd({ email, password: CLAVE, next: "/admin/proyectos/equipo" })));
    const sesion = r.cookiesPuestas[getSessionCookieName()];
    assert.ok(r.tipo === "redireccion" && sesion, `el ingreso de ${email} no dejó sesión: ${JSON.stringify(r.tipo === "redireccion" ? r.destino : r.tipo)}`);
    return sesion;
  };
  const como = async <R>(sesion: string, fn: () => Promise<R>) => {
    try {
      return await ejecutarAccion({ negocio: a, cookies: { [getSessionCookieName()]: sesion } }, fn);
    } catch (e) {
      return { tipo: "error", mensaje: String(e) } as const;
    }
  };
  const rechazo = (r: Awaited<ReturnType<typeof como>>) => r.tipo === "error" || (r.tipo === "respuesta" && (r.valor as { ok: boolean }).ok === false);
  const rolDe = async (sesion: string) => {
    const r = await como(sesion, () => gs.actorActual());
    return r.tipo === "respuesta" ? (r.valor as { rol: string }).rol : `(${r.tipo})`;
  };
  const foto = () => duenio.proyectoPersona.findMany({ where: { tenantId: a.id }, orderBy: { nombre: "asc" }, select: { id: true, userId: true, rol: true, email: true, activa: true } });

  const sCom = await entrar("comercial@mia104.test");
  const sDis = await entrar("diseno@mia104.test");
  const sNuevo = await entrar("nuevo@mia104.test");
  const sDuenia = await entrar(dueniaMail);
  assert.equal(await rolDe(sCom), "COMERCIAL");
  assert.equal(await rolDe(sDis), "DISENO");
  assert.equal(await rolDe(sDuenia), "DIRECCION");
  const antes = await foto();
  // Cada intento que pasa queda anotado: el rojo nombra todos, no sólo el primero.
  const pasaron: string[] = [];
  const debeRechazar = (caso: string, r: Awaited<ReturnType<typeof como>>) => {
    if (!rechazo(r)) pasaron.push(`${caso} (vino ${JSON.stringify(r.tipo === "respuesta" ? r.valor : r)})`);
  };

  // H3, el caso de MIA-103: Comercial pasa la ficha de Diseño a Administración.
  const sube = await como(sCom, () => gestion.guardarPersona(fd({ id: fDis.id, nombre: "Diseno", email: "diseno@mia104.test", rol: "ADMINISTRACION", vincular: "1" })));
  debeRechazar("H3: Comercial cambió el rol de la ficha de Diseño", sube);
  // El rol de una ficha sin cuenta, tampoco: cuando Dirección la vincule, la cuenta entra con ese rol.
  const sinCuenta = await como(sCom, () => gestion.guardarPersona(fd({ id: fArm.id, nombre: "Armador", email: "armador@mia104.test", rol: "ADMINISTRACION" })));
  debeRechazar("H3: Comercial cambió el rol de una ficha sin cuenta", sinCuenta);
  // El mismo cambio por la cuenta: desvincular la de Diseño (primer paso para pasarla a otra ficha con otro rol)…
  const suelta = await como(sCom, () => gestion.guardarPersona(fd({ id: fDis.id, nombre: "Diseno", email: "diseno@mia104.test", rol: "DISENO" })));
  debeRechazar("H3: Comercial desvinculó la cuenta de Diseño", suelta);
  // …vincular una cuenta sin ficha a una ficha nueva de Administración…
  const daRol = await como(sCom, () => gestion.guardarPersona(fd({ nombre: "Nuevo", email: "nuevo@mia104.test", rol: "ADMINISTRACION", vincular: "1" })));
  debeRechazar("H3: Comercial le dio un rol a una cuenta vinculándola a una ficha nueva", daRol);
  // …o a una ficha que ya existe, cambiándole el mail.
  const reapunta = await como(sCom, () => gestion.guardarPersona(fd({ id: fArm.id, nombre: "Armador", email: "nuevo@mia104.test", rol: "PRODUCCION", vincular: "1" })));
  debeRechazar("H3: Comercial vinculó una cuenta a una ficha existente", reapunta);

  assert.deepEqual(pasaron, [], "con «Equipo» y sin ser Dirección, ninguno de estos cambios pasa");
  assert.equal(await rolDe(sDis), "DISENO", "Diseño sigue en Diseño");
  assert.notEqual(await rolDe(sNuevo), "ADMINISTRACION", "la cuenta sin ficha no quedó en Administración");
  assert.deepEqual(await foto(), antes, "los rechazos no dejan cambios en las fichas");
  assert.equal(await duenio.proyectoCambio.count({ where: { tenantId: a.id } }), 0, "ni renglones en el registro de cambios");

  // Lo de siempre sigue andando con «Equipo»: editar el puesto de otra ficha sin tocar rol ni cuenta, y cargar una persona sin cuenta.
  const puesto = await como(sCom, () => gestion.guardarPersona(fd({ id: fDis.id, nombre: "Diseno", email: "diseno@mia104.test", rol: "DISENO", puesto: "Gráfica", vincular: "1" })));
  assert.deepEqual(puesto.tipo === "respuesta" && puesto.valor, { ok: true }, `Comercial con Equipo edita el puesto: ${JSON.stringify(puesto)}`);
  const alta = await como(sCom, () => gestion.guardarPersona(fd({ nombre: "Otra", email: "otra@mia104.test", rol: "PRODUCCION" })));
  assert.deepEqual(alta.tipo === "respuesta" && alta.valor, { ok: true }, `Comercial con Equipo da de alta a una persona sin cuenta: ${JSON.stringify(alta)}`);
  assert.equal(await rolDe(sDis), "DISENO");

  // Dirección (la dueña sin ficha, con su ingreso) sí cambia el rol y vincula la cuenta.
  const dir1 = await como(sDuenia, () => gestion.guardarPersona(fd({ id: fDis.id, nombre: "Diseno", email: "diseno@mia104.test", rol: "ADMINISTRACION", puesto: "Gráfica", vincular: "1" })));
  assert.deepEqual(dir1.tipo === "respuesta" && dir1.valor, { ok: true }, `Dirección cambia el rol: ${JSON.stringify(dir1)}`);
  assert.equal(await rolDe(sDis), "ADMINISTRACION");
  const dir2 = await como(sDuenia, () => gestion.guardarPersona(fd({ id: fArm.id, nombre: "Armador", email: "nuevo@mia104.test", rol: "PRODUCCION", vincular: "1" })));
  assert.deepEqual(dir2.tipo === "respuesta" && dir2.valor, { ok: true }, `Dirección vincula una cuenta: ${JSON.stringify(dir2)}`);
  assert.equal(await rolDe(sNuevo), "PRODUCCION");
  assert.equal((await duenio.proyectoPersona.findUniqueOrThrow({ where: { id: fCom.id }, select: { rol: true } })).rol, "COMERCIAL");
});
