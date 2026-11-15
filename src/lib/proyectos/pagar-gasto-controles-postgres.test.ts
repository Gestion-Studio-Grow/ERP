// ============================================================================
// «Pagar» un gasto de proyecto (`pagarGasto`) contra Postgres real (base efímera migrada, app_rls + RLS) y con la Server
// Action real. Es plata: marca el gasto pagado y asienta un EGRESO en la caja. Pantalla y acción piden lo mismo
// (`_pestanas-plata.tsx` y `proveedores/page.tsx`: editar pagos + ver la plata), porque esconder el botón no protege nada.
//
//  (1) Proyecto ajeno: quien no ve el proyecto no paga sus gastos, aunque conozca el id (igual que `registrarGasto`).
//  (2) Sólo «Proveedores: editar» no alcanza: pagar es del módulo «Pagos».
//  (3) Sin ver la plata (`agenda:manage` apagado en su matriz) no se paga.
//  (4) Otro negocio no paga nada de éste.
//  (5) Doble envío y cinco pagos a la vez del mismo gasto: un solo pago y un solo asiento.
//  (6) «Registrar gasto» con «Ya está pagado» también mueve caja: sin ver la plata, tampoco (lo encontró la certificación).
// En cada caso se mira el efecto en la base (gasto y caja), no la respuesta: lo que importa es que la plata no se mueva.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
/** Fecha fija de los datos: el resultado no depende del reloj. */
const AHORA = Date.parse("2026-11-10T12:00:00Z");

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { NODE_ENV: "development", DB_CONNECTION_LIMIT: "12", DB_CONNECT_TIMEOUT_MS: "5000" });
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  const acciones = await import("./acciones");

  let numero = (await duenio.proyecto.count()) + 7700;
  /** Proyecto de A con un gasto de $ 1.000 + IVA 210, sin pagar. */
  const gastoSinPagar = async () => {
    const evento = new Date(AHORA + 20 * DIA);
    const p = await duenio.proyecto.create({
      data: { tenantId: a.id, numero: ++numero, clientId: a.clientes[0], nombre: `Stand ${numero}`, servicio: "ARQUITECTURA", etapa: "APROBADO", fechaArmado: new Date(evento.getTime() - 2 * DIA), fechaEvento: evento, fechaDesarme: new Date(evento.getTime() + DIA) },
      select: { id: true },
    });
    const g = await duenio.proyectoGasto.create({ data: { tenantId: a.id, proyectoId: p.id, descripcion: "Carpintería", neto: 1000, iva: 210, fecha: new Date(AHORA) }, select: { id: true } });
    return { proyectoId: p.id, gastoId: g.id };
  };
  /** La recepcionista de A con ficha en el equipo de gestión, con este rol. */
  const ficha = async (rol: string) => {
    const existente = await duenio.proyectoPersona.findFirst({ where: { tenantId: a.id, userId: a.recepcion.id }, select: { id: true } });
    if (existente) return (await duenio.proyectoPersona.update({ where: { id: existente.id }, data: { rol, activa: true }, select: { id: true } })).id;
    return (await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: a.recepcion.id, nombre: a.recepcion.nombre, rol }, select: { id: true } })).id;
  };
  const alEquipo = (proyectoId: string, personaId: string) => duenio.proyectoEquipo.create({ data: { tenantId: a.id, proyectoId, personaId } });
  /** Paga el gasto con la sesión de este usuario. Devuelve «ok» o el error de la acción: el test mira la base, no esto. */
  const pagar = async (usuario: { id: string }, negocio: typeof a, gastoId: string): Promise<string> => {
    const fd = new FormData();
    fd.set("id", gastoId);
    fd.set("medio", "TRANSFERENCIA");
    try {
      const r = await ejecutarAccion({ negocio, usuario }, () => acciones.pagarGasto(fd));
      return r.tipo === "respuesta" ? "ok" : r.tipo;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };
  /** El gasto y su caja, vistos como dueño de las tablas. */
  const plata = async (gastoId: string) => {
    const g = await duenio.proyectoGasto.findUniqueOrThrow({ where: { id: gastoId }, select: { pagadoEl: true } });
    const asientos = await duenio.cashMovement.findMany({ where: { proyectoGastoId: gastoId }, select: { type: true, amount: true } });
    return { pagado: g.pagadoEl !== null, asientos: asientos.length, egreso: asientos.reduce((s, m) => s + (m.type === "EGRESO" ? m.amount : -m.amount), 0) };
  };
  const SIN_PAGAR = { pagado: false, asientos: 0, egreso: 0 };
  const PAGADO_UNA_VEZ = { pagado: true, asientos: 1, egreso: 1210 };
  return { duenio, a, b, acciones, gastoSinPagar, ficha, alEquipo, pagar, plata, SIN_PAGAR, PAGADO_UNA_VEZ };
}

test("(1) proyecto ajeno: quien no ve el proyecto no paga su gasto aunque conozca el id; dentro del equipo, sí", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  // Producción edita Pagos y Proveedores, ve la plata, pero sólo ve los proyectos de su equipo.
  const persona = await p.ficha("PRODUCCION");
  const { proyectoId, gastoId } = await p.gastoSinPagar();
  await p.pagar(p.a.recepcion, p.a, gastoId);
  assert.deepEqual(await p.plata(gastoId), p.SIN_PAGAR, "un proyecto que no ve no existe: el gasto sigue sin pagar y la caja no se mueve");

  // Control: el mismo usuario, ya en el equipo, paga. El rojo de arriba es por el proyecto, no por otra cosa.
  await p.alEquipo(proyectoId, persona);
  assert.equal(await p.pagar(p.a.recepcion, p.a, gastoId), "ok");
  assert.deepEqual(await p.plata(gastoId), p.PAGADO_UNA_VEZ);
});

test("(2) con «Proveedores: editar» pero sin «Pagos: editar» no se paga", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const persona = await p.ficha("PRODUCCION");
  const { proyectoId, gastoId } = await p.gastoSinPagar();
  await p.alEquipo(proyectoId, persona);
  const permiso = await p.duenio.proyectoPermiso.create({ data: { tenantId: p.a.id, rol: "PRODUCCION", modulo: "pagos", ver: true, editar: false } });
  try {
    await p.pagar(p.a.recepcion, p.a, gastoId);
    assert.deepEqual(await p.plata(gastoId), p.SIN_PAGAR, "pagar es del módulo Pagos: Proveedores no alcanza");
  } finally {
    await p.duenio.proyectoPermiso.delete({ where: { id: permiso.id } });
  }
});

test("(3) sin ver la plata (agenda:manage apagado) no se paga, aunque edite Pagos y vea el proyecto", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  await p.ficha("ADMINISTRACION"); // ve todos los proyectos y edita Pagos
  const { gastoId } = await p.gastoSinPagar();
  const override = await p.duenio.userPermissionOverride.create({ data: { tenantId: p.a.id, userId: p.a.recepcion.id, capability: "agenda:manage", allowed: false } });
  try {
    await p.pagar(p.a.recepcion, p.a, gastoId);
    assert.deepEqual(await p.plata(gastoId), p.SIN_PAGAR, "la pantalla esconde el botón a quien no ve la plata: la acción tampoco paga");
  } finally {
    await p.duenio.userPermissionOverride.delete({ where: { id: override.id } });
  }
});

test("(4) la dueña de otro negocio no paga un gasto de éste", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { gastoId } = await p.gastoSinPagar();
  await p.pagar(p.b.duenia, p.b, gastoId);
  assert.deepEqual(await p.plata(gastoId), p.SIN_PAGAR);
});

test("(5) doble envío y cinco pagos a la vez del mismo gasto: un solo pago y un solo asiento", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  // Doble envío: dos clics seguidos.
  const uno = await p.gastoSinPagar();
  assert.equal(await p.pagar(p.a.duenia, p.a, uno.gastoId), "ok");
  assert.equal(await p.pagar(p.a.duenia, p.a, uno.gastoId), "ok", "el segundo clic no es un error: no hace nada");
  assert.deepEqual(await p.plata(uno.gastoId), p.PAGADO_UNA_VEZ);

  // Cinco pestañas a la vez.
  const dos = await p.gastoSinPagar();
  const r = await Promise.all(Array.from({ length: 5 }, () => p.pagar(p.a.duenia, p.a, dos.gastoId)));
  assert.deepEqual(r, ["ok", "ok", "ok", "ok", "ok"]);
  assert.deepEqual(await p.plata(dos.gastoId), p.PAGADO_UNA_VEZ, "cinco pedidos a la vez: una sola salida de caja");
});

test("(6) «Registrar gasto» ya pagado, sin ver la plata: no graba el gasto ni mueve la caja; con la plata, sí", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  await p.ficha("ADMINISTRACION"); // ve todos los proyectos y edita Pagos
  const { proyectoId } = await p.gastoSinPagar();
  const registrar = async () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ proyectoId, descripcion: "Flete", neto: "500", iva: "105", pagado: "on", medio: "TRANSFERENCIA" })) fd.set(k, v);
    const r = await ejecutarAccion({ negocio: p.a, usuario: p.a.recepcion }, () => p.acciones.registrarGasto(fd));
    return r.tipo === "respuesta" ? r.valor : r.tipo;
  };
  const fletes = async () => {
    const gastos = await p.duenio.proyectoGasto.findMany({ where: { proyectoId, descripcion: "Flete" }, select: { id: true } });
    return { gastos: gastos.length, asientos: await p.duenio.cashMovement.count({ where: { proyectoGastoId: { in: gastos.map((g) => g.id) } } }) };
  };
  const override = await p.duenio.userPermissionOverride.create({ data: { tenantId: p.a.id, userId: p.a.recepcion.id, capability: "agenda:manage", allowed: false } });
  try {
    assert.equal((await registrar() as { ok: boolean }).ok, false);
    assert.deepEqual(await fletes(), { gastos: 0, asientos: 0 }, "sin ver la plata no se graba el gasto ni sale plata de la caja");
  } finally {
    await p.duenio.userPermissionOverride.delete({ where: { id: override.id } });
  }
  // Control: el mismo usuario, con la plata a la vista, lo registra pagado.
  assert.deepEqual(await registrar(), { ok: true });
  assert.deepEqual(await fletes(), { gastos: 1, asientos: 1 });
});
