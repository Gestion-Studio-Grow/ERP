// RENDÍ tanda 3 — reintegro por liquidación o directo, anticipos y caja, con las Server Actions REALES contra una base
// migrada (Postgres efímero, dos negocios).
//
// Un gasto aprobado entra UNA vez aunque se generen dos liquidaciones (y regenerar no duplica); reintegro directo y
// liquidación a la vez → un solo egreso; pagar dos veces → un egreso; la caja suma los reintegros y nunca el gasto;
// anticipo: entregar dos veces el mismo envío = un egreso, no cierra con pendientes, el sobrante vuelve como INGRESO;
// el negocio B no paga ni ve lo de A; la foto sólo la ven quien rindió y Dirección/Administración.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";

const FOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQ==";

test("Rendí tanda 3: reintegro una sola vez, caja = reintegros, anticipos con cuadratura, aislado por negocio", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;
  const { rendirGasto, aprobarRendicion, rechazarRendicion, reintegrarDirecto, entregarAnticipo, cerrarAnticipo } = await import("./acciones-rendiciones");
  const { generarLiquidaciones, publicarBorradores, pagarLiquidacion } = await import("./acciones-empresa");
  const { comprobanteDeRendicion } = await import("./comprobante.server");

  const usuario = async (nombre: string) => duenio.user.create({ data: { tenantId: a.id, name: nombre, email: `${nombre.toLowerCase()}@a.test`, passwordHash: "x", role: "RECEPTION" }, select: { id: true } });
  const [dis, adm] = await Promise.all([usuario("Disenio"), usuario("Admin")]);
  const persona = (userId: string, rol: string) => duenio.proyectoPersona.create({ data: { tenantId: a.id, userId, nombre: rol, rol }, select: { id: true } });
  const pProd = await persona(a.recepcion.id, "PRODUCCION");
  const pDis = await persona(dis.id, "DISENO");
  const pAdm = await persona(adm.id, "ADMINISTRACION");
  const p1 = await duenio.proyecto.create({ data: { tenantId: a.id, numero: 1, clientId: a.clientes[0], nombre: "Stand 1", servicio: "ARQUITECTURA", etapa: "APROBADO" }, select: { id: true } });
  await duenio.proyectoEquipo.createMany({ data: [pProd, pDis, pAdm].map((p) => ({ tenantId: a.id, proyectoId: p1.id, personaId: p.id })) });

  const enA = (usuarioId: string) => ({ negocio: a, usuario: { id: usuarioId } });
  const enB = { negocio: b, usuario: { id: b.duenia.id } };
  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const correr = async <R,>(pedido: { negocio: typeof a; usuario: { id: string } }, fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion(pedido, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };
  let n = 0;
  const rendir = async (monto: string, extra: Record<string, string> = {}) => {
    const clave = `aaaaaaaa-bbbb-4ccc-8ddd-${String(++n).padStart(12, "0")}`;
    assert.deepEqual(await correr(enA(a.recepcion.id), () => rendirGasto(form({ proyectoId: p1.id, clave, descripcion: `Gasto ${n}`, monto, medio: "PROPIO", fecha: "2026-11-04", foto: FOTO, ...extra }))), { ok: true });
    return (await duenio.proyectoRendicion.findFirstOrThrow({ where: { tenantId: a.id }, orderBy: { createdAt: "desc" } })).id;
  };
  const aprobar = async (id: string) => assert.deepEqual(await correr(enA(adm.id), () => aprobarRendicion(form({ id }))), { ok: true });
  const generar = (quien: string, periodo: string) => correr(enA(quien), () => generarLiquidaciones(form({ periodo })));

  // Tres gastos de su bolsillo, aprobados. Nada de eso toca la caja.
  const r1 = await rendir("12.500");
  const r2 = await rendir("3.000");
  const r3 = await rendir("1.000,50");
  for (const id of [r1, r2, r3]) await aprobar(id);
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: a.id } }), 0, "aprobar no asienta");

  // Dos liquidaciones (dos meses, a la vez) y una regenerada: cada gasto entra una sola vez.
  await Promise.all([generar(a.duenia.id, "2026-11"), generar(adm.id, "2026-12")]);
  await generar(a.duenia.id, "2026-11");
  await generar(adm.id, "2026-12");
  const liqs = await duenio.proyectoLiquidacion.findMany({ where: { tenantId: a.id, personaId: pProd.id } });
  const extras = liqs.flatMap((l) => (l.extras as { gastoId?: string; reintegro?: boolean; monto: number }[] | null) ?? []).filter((e) => e.reintegro);
  assert.equal(extras.length, 3, "tres gastos, tres extras en total entre las dos liquidaciones");
  assert.equal(new Set(extras.map((e) => e.gastoId)).size, 3, "ningún gasto repetido");
  const reclamadas = await duenio.proyectoRendicion.findMany({ where: { id: { in: [r1, r2, r3] } } });
  assert.ok(reclamadas.every((r) => r.liquidacionId), "las tres quedaron reclamadas");
  for (const l of liqs) assert.equal(l.total, Math.round(((l.extras as { monto: number }[]) ?? []).reduce((s, e) => s + e.monto, 0) * 100) / 100);

  // Reintegro directo de una reclamada: no (se paga con la liquidación).
  assert.equal((await correr(enA(adm.id), () => reintegrarDirecto(form({ id: r1 })))).ok, false);

  // Reintegro directo y liquidación a la vez sobre un gasto nuevo: uno solo gana.
  const r4 = await rendir("2.000");
  await aprobar(r4);
  const r4gasto = (await duenio.proyectoRendicion.findUniqueOrThrow({ where: { id: r4 } })).gastoId;
  await Promise.all([correr(enA(a.duenia.id), () => reintegrarDirecto(form({ id: r4, medio: "EFECTIVO" }))), generar(adm.id, "2026-11")]);
  const r4fin = await duenio.proyectoRendicion.findUniqueOrThrow({ where: { id: r4 } });
  const egresoDirecto = await duenio.cashMovement.count({ where: { tenantId: a.id, proyectoGastoId: r4gasto } });
  assert.equal(egresoDirecto + (r4fin.liquidacionId ? 1 : 0), 1, "reintegro directo XOR liquidación");
  assert.ok(!(r4fin.liquidacionId && r4fin.reintegradoEl), "nunca ambos");

  // Dirección/Administración pagan; dos clics = un egreso por liquidación. Producción no paga; B no ve la de A.
  for (const periodo of ["2026-11", "2026-12"]) await correr(enA(a.duenia.id), () => publicarBorradores(form({ periodo })));
  const publicadas = await duenio.proyectoLiquidacion.findMany({ where: { tenantId: a.id, personaId: pProd.id } });
  assert.equal((await correr(enA(a.recepcion.id), () => pagarLiquidacion(form({ id: publicadas[0].id })))).ok, false, "nadie se paga lo propio");
  assert.deepEqual(await correr(enB, () => pagarLiquidacion(form({ id: publicadas[0].id }))), { ok: false, error: "Esa liquidación no existe." });
  assert.deepEqual(await correr(enB, () => reintegrarDirecto(form({ id: r2 }))), { ok: false, error: "Esa rendición no existe." });
  for (const l of publicadas) {
    const dos = await Promise.all([correr(enA(a.duenia.id), () => pagarLiquidacion(form({ id: l.id }))), correr(enA(adm.id), () => pagarLiquidacion(form({ id: l.id })))]);
    assert.equal(dos.filter((r) => r.ok).length, 1, "pagar dos veces = un pago");
    assert.equal(await duenio.cashMovement.count({ where: { tenantId: a.id, proyectoLiquidacionId: l.id } }), l.total > 0 ? 1 : 0, "un egreso por liquidación");
  }
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: b.id } }), 0, "B no movió nada");

  // Caja = suma de reintegros; el gasto en sí nunca asentó nada.
  const todas = await duenio.proyectoRendicion.findMany({ where: { id: { in: [r1, r2, r3, r4] } } });
  assert.ok(todas.every((r) => r.estado === "reintegrada" && r.reintegradoEl), "las cuatro quedaron reintegradas");
  const egresos = await duenio.cashMovement.aggregate({ where: { tenantId: a.id, type: "EGRESO" }, _sum: { amount: true } });
  const reintegros = todas.reduce((s, r) => s + r.montoCentavos, 0) / 100;
  assert.equal(Math.round((egresos._sum.amount ?? 0) * 100), Math.round(reintegros * 100), "la caja suma los reintegros, sin contar el gasto");
  const otrosGastos = todas.filter((r) => r.id !== r4).map((r) => r.gastoId);
  assert.equal(await duenio.cashMovement.count({ where: { proyectoGastoId: { in: otrosGastos } } }), 0, "lo pagado por liquidación no lleva egreso por gasto");

  // Anticipo: el mismo envío dos veces = un anticipo y un egreso.
  const clave = "bbbbbbbb-cccc-4ddd-8eee-000000000001";
  const entregar = () => correr(enA(adm.id), () => entregarAnticipo(form({ personaId: pProd.id, proyectoId: p1.id, monto: "10.000", medio: "EFECTIVO", clave })));
  const entregas = await Promise.all([entregar(), entregar()]);
  assert.ok(entregas.every((r) => r.ok));
  const anticipo = await duenio.proyectoAnticipo.findFirstOrThrow({ where: { tenantId: a.id } });
  assert.equal(await duenio.proyectoAnticipo.count({ where: { tenantId: a.id } }), 1);
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: a.id, proyectoAnticipoId: anticipo.id, type: "EGRESO" } }), 1, "un egreso por anticipo");
  const ra = await rendir("7.000", { medio: "ANTICIPO", anticipoId: anticipo.id });
  await aprobar(ra);
  const pendiente = await rendir("500", { medio: "ANTICIPO", anticipoId: anticipo.id });
  const conPendiente = await correr(enA(adm.id), () => cerrarAnticipo(form({ id: anticipo.id })));
  assert.equal(conPendiente.ok, false, "no se cierra con rendiciones sin revisar");
  assert.equal((await duenio.proyectoAnticipo.findUniqueOrThrow({ where: { id: anticipo.id } })).estado, "ENTREGADO", "el intento fallido no lo cerró");
  assert.deepEqual(await correr(enA(adm.id), () => rechazarRendicion(form({ id: pendiente, comentario: "Duplicado" }))), { ok: true });
  assert.deepEqual(await correr(enB, () => cerrarAnticipo(form({ id: anticipo.id }))), { ok: false, error: "Ese anticipo no existe." });
  const cierres = await Promise.all([correr(enA(adm.id), () => cerrarAnticipo(form({ id: anticipo.id, medio: "EFECTIVO" }))), correr(enA(a.duenia.id), () => cerrarAnticipo(form({ id: anticipo.id, medio: "EFECTIVO" })))]);
  assert.equal(cierres.filter((r) => r.ok).length, 1, "cerrar dos veces = una");
  const devolucion = await duenio.cashMovement.findMany({ where: { tenantId: a.id, proyectoAnticipoId: anticipo.id, type: "INGRESO" } });
  assert.equal(devolucion.length, 1);
  assert.equal(devolucion[0].amount, 3000, "sobrante de $ 3.000 vuelve como INGRESO");
  assert.match(devolucion[0].reason ?? "", /Devolución de anticipo/);
  const cerrado = await duenio.proyectoAnticipo.findUniqueOrThrow({ where: { id: anticipo.id } });
  assert.equal(cerrado.estado, "CERRADO");
  assert.equal(cerrado.devueltoCentavos, 300000);
  assert.equal((await correr(enA(a.recepcion.id), () => rendirGasto(form({ proyectoId: p1.id, clave: "cccccccc-dddd-4eee-8fff-000000000001", descripcion: "Tarde", monto: "100", medio: "ANTICIPO", anticipoId: anticipo.id, foto: FOTO })))).ok, false, "un anticipo cerrado no recibe rendiciones");

  // La foto: quien rindió y Dirección/Administración sí; Diseño y otro negocio no.
  const foto = (pedido: { negocio: typeof a; usuario: { id: string } }) => correr(pedido, () => comprobanteDeRendicion(r1));
  assert.ok(await foto(enA(a.recepcion.id)), "quien rindió la ve");
  assert.ok(await foto(enA(adm.id)), "Administración la ve");
  assert.ok(await foto(enA(a.duenia.id)), "Dirección la ve");
  assert.equal(await foto(enA(dis.id)), null, "Diseño no la ve");
  assert.equal(await foto(enB), null, "otro negocio no la ve");
});
