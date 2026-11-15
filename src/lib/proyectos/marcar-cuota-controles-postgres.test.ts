// ============================================================================
// «Marcar» una cuota del evento (`marcarCuota`) contra Postgres real (base efímera migrada, app_rls + RLS) y con la Server
// Action real. Es plata: marca la cuota y asienta el pago (gasto pagado + EGRESO en la caja). La acción pide lo mismo que
// el botón: «Pagos: editar» en la ficha (`_pestanas-plata.tsx`) o «Empresa: editar» en Administración
// (`administracion/page.tsx`), y que el proyecto sea visible. Ninguno de los dos botones pide ver la plata (`veLaPlata`).
//
//  (1) Sin permiso no se averigua nada: una cuota prevista, una de la empresa, una real y un id inventado responden igual.
//  (2) Con permiso pero sin ver el proyecto: sus cuotas (reales o previstas) responden como un id inventado y no se marcan.
//      En el equipo, sí (control).
//  (3) Otro negocio no marca nada de éste y no distingue sus cuotas de un id inventado.
//  (4) El permiso es exactamente el del botón: «Empresa: editar» sin «Pagos: editar» marca (Administración); sin ninguno de
//      los dos, no; sin ver la plata pero con «Pagos: editar», sí (la ficha muestra el botón).
//  (5) Doble envío (mismo `envio`) y cinco marcas a la vez de la misma cuota: un solo pago y un solo asiento.
// En cada caso se mira el efecto en la base (cuota, gasto y caja), no sólo la respuesta.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
/** Fecha fija de los datos: el resultado no depende del reloj. */
const AHORA = Date.parse("2026-11-10T12:00:00Z");
const INVENTADO = "cuota-que-no-existe-0000";

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
  const ficha = await import("./acciones-ficha");
  const proveedor = (await duenio.supplier.create({ data: { tenantId: a.id, name: "Proveedor cuotas" }, select: { id: true } })).id;

  let numero = (await duenio.proyecto.count()) + 8800;
  /** Proyecto aprobado de A con una cuota a pagar de $ 500 (y, si se pide, prevista). */
  const cuotaDePago = async (prevista = false) => {
    const evento = new Date(AHORA + 20 * DIA);
    const p = await duenio.proyecto.create({
      data: { tenantId: a.id, numero: ++numero, clientId: a.clientes[0], nombre: `Stand ${numero}`, servicio: "ARQUITECTURA", etapa: "APROBADO", fechaArmado: new Date(evento.getTime() - 2 * DIA), fechaEvento: evento, fechaDesarme: new Date(evento.getTime() + DIA) },
      select: { id: true },
    });
    const c = await duenio.proyectoCuota.create({ data: { tenantId: a.id, proyectoId: p.id, supplierId: proveedor, tipo: "PAGO", concepto: "Flete", monto: 500, prevista, venceEl: new Date(AHORA + 5 * DIA) }, select: { id: true } });
    return { proyectoId: p.id, cuotaId: c.id };
  };
  /** Cuota de la empresa (sin proyecto). */
  const cuotaDeEmpresa = async () => (await duenio.proyectoCuota.create({ data: { tenantId: a.id, tipo: "PAGO", concepto: "Alquiler", monto: 900, venceEl: new Date(AHORA + 5 * DIA) }, select: { id: true } })).id;
  /** La recepcionista de A con ficha en el equipo de gestión, con este rol. */
  const conFicha = async (rol: string) => {
    const existente = await duenio.proyectoPersona.findFirst({ where: { tenantId: a.id, userId: a.recepcion.id }, select: { id: true } });
    if (existente) return (await duenio.proyectoPersona.update({ where: { id: existente.id }, data: { rol, activa: true }, select: { id: true } })).id;
    return (await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: a.recepcion.id, nombre: a.recepcion.nombre, rol }, select: { id: true } })).id;
  };
  const alEquipo = (proyectoId: string, personaId: string) => duenio.proyectoEquipo.create({ data: { tenantId: a.id, proyectoId, personaId } });
  /** Marca la cuota con la sesión de este usuario. Devuelve «ok» o el error que ve la persona. */
  const marcar = async (usuario: { id: string }, negocio: typeof a, cuotaId: string, extra: Record<string, string> = {}): Promise<string> => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ id: cuotaId, medio: "TRANSFERENCIA", ...extra })) fd.set(k, v);
    try {
      const r = await ejecutarAccion({ negocio, usuario }, () => ficha.marcarCuota(fd));
      if (r.tipo !== "respuesta") return r.tipo;
      const v = r.valor as { ok: boolean; error?: string };
      return v.ok ? "ok" : String(v.error);
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };
  /** La cuota, sus gastos y su caja, vistos como dueño de las tablas. */
  const plata = async (cuotaId: string) => {
    const c = await duenio.proyectoCuota.findUniqueOrThrow({ where: { id: cuotaId }, select: { pagadoEl: true, proyectoId: true } });
    const gastos = c.proyectoId ? await duenio.proyectoGasto.findMany({ where: { proyectoId: c.proyectoId }, select: { id: true } }) : [];
    const asientos = await duenio.cashMovement.findMany({ where: { proyectoGastoId: { in: gastos.map((g) => g.id) } }, select: { type: true, amount: true } });
    return { marcada: c.pagadoEl !== null, gastos: gastos.length, asientos: asientos.length, egreso: asientos.reduce((s, m) => s + (m.type === "EGRESO" ? m.amount : -m.amount), 0) };
  };
  const SIN_MARCAR = { marcada: false, gastos: 0, asientos: 0, egreso: 0 };
  const MARCADA_UNA_VEZ = { marcada: true, gastos: 1, asientos: 1, egreso: 500 };
  return { duenio, a, b, cuotaDePago, cuotaDeEmpresa, conFicha, alEquipo, marcar, plata, SIN_MARCAR, MARCADA_UNA_VEZ };
}

test("(1) sin permiso de Pagos ni Empresa: prevista, de la empresa, real e inventada responden igual y nada se mueve", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  await p.conFicha("COMERCIAL"); // ve todos los proyectos, pero no edita Pagos ni Empresa
  const real = await p.cuotaDePago();
  const prevista = await p.cuotaDePago(true);
  const deEmpresa = await p.cuotaDeEmpresa();
  const respuestas = {
    real: await p.marcar(p.a.recepcion, p.a, real.cuotaId),
    prevista: await p.marcar(p.a.recepcion, p.a, prevista.cuotaId),
    deEmpresa: await p.marcar(p.a.recepcion, p.a, deEmpresa),
    inventada: await p.marcar(p.a.recepcion, p.a, INVENTADO),
  };
  const permiso = "No tenés permiso para hacer esto.";
  assert.deepEqual(respuestas, { real: permiso, prevista: permiso, deEmpresa: permiso, inventada: permiso }, "sin permiso no se lee la cuota: no se averigua si existe ni cómo está");
  assert.deepEqual(await p.plata(real.cuotaId), p.SIN_MARCAR);
  assert.deepEqual(await p.plata(prevista.cuotaId), p.SIN_MARCAR);
});

test("(2) edita Pagos pero no ve el proyecto: sus cuotas responden como un id inventado y no se marcan; en el equipo, sí", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const persona = await p.conFicha("PRODUCCION"); // edita Pagos, sólo ve los proyectos de su equipo, no ve Empresa
  const real = await p.cuotaDePago();
  const prevista = await p.cuotaDePago(true);
  const deEmpresa = await p.cuotaDeEmpresa();
  const inventada = await p.marcar(p.a.recepcion, p.a, INVENTADO);
  const respuestas = {
    real: await p.marcar(p.a.recepcion, p.a, real.cuotaId),
    prevista: await p.marcar(p.a.recepcion, p.a, prevista.cuotaId),
    deEmpresa: await p.marcar(p.a.recepcion, p.a, deEmpresa),
  };
  assert.deepEqual(respuestas, { real: inventada, prevista: inventada, deEmpresa: inventada }, "un proyecto que no ve no existe: tampoco sus cuotas, ni si están previstas");
  assert.deepEqual(await p.plata(real.cuotaId), p.SIN_MARCAR);

  // Control: el mismo usuario, ya en el equipo, la marca. El rojo de arriba es por el proyecto, no por otra cosa.
  await p.alEquipo(real.proyectoId, persona);
  assert.equal(await p.marcar(p.a.recepcion, p.a, real.cuotaId), "ok");
  assert.deepEqual(await p.plata(real.cuotaId), p.MARCADA_UNA_VEZ);
});

test("(3) la dueña de otro negocio no marca una cuota de éste ni la distingue de un id inventado", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const real = await p.cuotaDePago();
  const prevista = await p.cuotaDePago(true);
  const inventada = await p.marcar(p.b.duenia, p.b, INVENTADO);
  assert.equal(await p.marcar(p.b.duenia, p.b, real.cuotaId), inventada);
  assert.equal(await p.marcar(p.b.duenia, p.b, prevista.cuotaId), inventada);
  assert.deepEqual(await p.plata(real.cuotaId), p.SIN_MARCAR);
});

test("(4) el permiso es el del botón: Empresa sin Pagos marca; ninguno de los dos, no; sin ver la plata pero con Pagos, sí", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  await p.conFicha("ADMINISTRACION"); // ve todos los proyectos, edita Pagos y Empresa
  const sinPagos = await p.duenio.proyectoPermiso.create({ data: { tenantId: p.a.id, rol: "ADMINISTRACION", modulo: "pagos", ver: true, editar: false } });
  try {
    // Administración: el botón se muestra con «Empresa: editar» aunque no edite Pagos.
    const conEmpresa = await p.cuotaDePago();
    assert.equal(await p.marcar(p.a.recepcion, p.a, conEmpresa.cuotaId), "ok");
    assert.deepEqual(await p.plata(conEmpresa.cuotaId), p.MARCADA_UNA_VEZ);

    // Sin Empresa ni Pagos no hay botón en ninguna pantalla: la acción tampoco marca.
    const sinEmpresa = await p.duenio.proyectoPermiso.create({ data: { tenantId: p.a.id, rol: "ADMINISTRACION", modulo: "empresa", ver: true, editar: false } });
    try {
      const ninguno = await p.cuotaDePago();
      assert.equal(await p.marcar(p.a.recepcion, p.a, ninguno.cuotaId), "No tenés permiso para hacer esto.");
      assert.deepEqual(await p.plata(ninguno.cuotaId), p.SIN_MARCAR);
    } finally {
      await p.duenio.proyectoPermiso.delete({ where: { id: sinEmpresa.id } });
    }
  } finally {
    await p.duenio.proyectoPermiso.delete({ where: { id: sinPagos.id } });
  }
  // La ficha muestra «Marcar» con «Pagos: editar», sin mirar `veLaPlata`: la acción pide lo mismo (ni más ni menos).
  const override = await p.duenio.userPermissionOverride.create({ data: { tenantId: p.a.id, userId: p.a.recepcion.id, capability: "agenda:manage", allowed: false } });
  try {
    const sinPlata = await p.cuotaDePago();
    assert.equal(await p.marcar(p.a.recepcion, p.a, sinPlata.cuotaId), "ok");
    assert.deepEqual(await p.plata(sinPlata.cuotaId), p.MARCADA_UNA_VEZ);
  } finally {
    await p.duenio.userPermissionOverride.delete({ where: { id: override.id } });
  }
});

test("(5) doble envío y cinco marcas a la vez de la misma cuota: un solo pago y un solo asiento", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  // Doble envío: el mismo formulario (mismo `envio`) dos veces.
  const uno = await p.cuotaDePago();
  assert.equal(await p.marcar(p.a.duenia, p.a, uno.cuotaId, { envio: "form-1" }), "ok");
  assert.notEqual(await p.marcar(p.a.duenia, p.a, uno.cuotaId, { envio: "form-1" }), "ok", "el segundo envío no asienta otra vez");
  assert.deepEqual(await p.plata(uno.cuotaId), p.MARCADA_UNA_VEZ);

  // Cinco pestañas a la vez, cada una con su formulario.
  const dos = await p.cuotaDePago();
  const r = await Promise.all(Array.from({ length: 5 }, (_, i) => p.marcar(p.a.duenia, p.a, dos.cuotaId, { envio: `pestana-${i}` })));
  assert.equal(r.filter((x) => x === "ok").length, 1, `una sola gana: ${JSON.stringify(r)}`);
  assert.deepEqual(await p.plata(dos.cuotaId), p.MARCADA_UNA_VEZ, "cinco pedidos a la vez: una sola salida de caja");
});
