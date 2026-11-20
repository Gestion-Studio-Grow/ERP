// GSG-MIA-091 · huecos H1 y H2 que encontró el par B, de la familia de PRY-100: una cuenta OWNER sin ficha activa es Dirección
// (`rolDelActor`), así que vincularle una ficha, sacársela o darla de baja cambia quién es Dirección. Con «Equipo» en editar y sin
// ser Dirección, eso no se hace; Dirección sí. Contra Postgres, con la app como `app_rls`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";

test("H1 y H2 · con «Equipo» y sin ser Dirección no se cambia quién es Dirección tocando la ficha de una cuenta OWNER", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  const gestion = await import("./acciones-gestion");
  const gs = await import("./gestion.server");
  const como = async <R>(userId: string, fn: () => Promise<R>) => {
    try {
      return await ejecutarAccion({ negocio: a, usuario: { id: userId } }, fn);
    } catch (e) {
      return { tipo: "error", mensaje: String(e) } as const;
    }
  };
  const fd = (c: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(c)) f.set(k, v);
    return f;
  };
  const rolDe = async (userId: string) => {
    const r = await como(userId, () => gs.actorActual());
    return r.tipo === "respuesta" ? (r.valor as { rol: string }).rol : `(${r.tipo})`;
  };

  const adm = await duenio.user.create({ data: { tenantId: a.id, name: "Admin", email: "admin@mia091.test", passwordHash: "x", role: "RECEPTION" }, select: { id: true } });
  const socio = await duenio.user.create({ data: { tenantId: a.id, name: "Socio", email: "socio@mia091.test", passwordHash: "x", role: "OWNER" }, select: { id: true } });
  // MIA-237: Administración ya no tiene «Equipo» (fijo en sin acceso: no administra personas ni roles). El caso es «con Equipo
  // y sin ser Dirección»: lo hace Producción con Equipo abierto por Dirección.
  await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: adm.id, nombre: "Admin", email: "admin@mia091.test", rol: "PRODUCCION" } });
  const fSocio = await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: socio.id, nombre: "Socio", email: "socio@mia091.test", rol: "COMERCIAL" }, select: { id: true } });
  await duenio.proyectoPermiso.create({ data: { tenantId: a.id, rol: "PRODUCCION", modulo: "equipo", ver: true, editar: true } });
  const dueniaMail = (await duenio.user.findUniqueOrThrow({ where: { id: a.duenia.id }, select: { email: true } })).email;
  const foto = () => duenio.proyectoPersona.findMany({ where: { tenantId: a.id }, orderBy: { nombre: "asc" }, select: { id: true, userId: true, rol: true, activa: true } });
  const antes = await foto();
  assert.equal(await rolDe(socio.id), "COMERCIAL");
  assert.equal(await rolDe(a.duenia.id), "DIRECCION");

  // H2a: dar de baja la ficha del socio OWNER lo dejaría sin ficha activa, o sea Dirección.
  const baja = await como(adm.id, () => gestion.cambiarEstadoPersona(fd({ id: fSocio.id, activa: "0" })));
  assert.equal(baja.tipo, "error", "H2a: la baja de la ficha de una cuenta OWNER pasó");
  // H2b: desvincularla, lo mismo.
  const suelta = await como(adm.id, () => gestion.guardarPersona(fd({ id: fSocio.id, nombre: "Socio", email: "socio@mia091.test", rol: "COMERCIAL" })));
  assert.ok(suelta.tipo === "respuesta" && (suelta.valor as { ok: boolean }).ok === false, "H2b: desvincular la cuenta OWNER pasó");
  // H1: vincular la cuenta de la dueña a una ficha de Diseño la baja de Dirección (y ella no lo puede deshacer).
  const pone = await como(adm.id, () => gestion.guardarPersona(fd({ nombre: "Duenia", email: dueniaMail, rol: "DISENO", vincular: "1" })));
  assert.ok(pone.tipo === "respuesta" && (pone.valor as { ok: boolean }).ok === false, "H1: vincular la cuenta de la dueña pasó");

  assert.equal(await rolDe(socio.id), "COMERCIAL");
  assert.equal(await rolDe(a.duenia.id), "DIRECCION");
  assert.deepEqual(await foto(), antes, "el rechazo no deja cambios en las fichas");
  assert.equal(await duenio.proyectoCambio.count({ where: { tenantId: a.id } }), 0, "ni renglones en el registro de cambios");

  // Lo de siempre sigue andando: Administración carga una persona nueva sin cuenta, y Dirección sí da de baja la ficha del socio.
  const nueva = await como(adm.id, () => gestion.guardarPersona(fd({ nombre: "Nueva", email: "nueva@mia091.test", rol: "PRODUCCION" })));
  assert.ok(nueva.tipo === "respuesta" && (nueva.valor as { ok: boolean }).ok === true);
  const deDireccion = await como(a.duenia.id, () => gestion.cambiarEstadoPersona(fd({ id: fSocio.id, activa: "0" })));
  assert.equal(deDireccion.tipo, "respuesta");
  assert.equal((await duenio.proyectoPersona.findUniqueOrThrow({ where: { id: fSocio.id }, select: { activa: true } })).activa, false);
});
