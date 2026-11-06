// RENDÍ — regresión de la certificación adversarial de la tanda 3, contra una base migrada (las Server Actions REALES).
//
// ALTA: editar los extras de un borrador en paralelo con generar no pisa los reintegros reclamados (la rendición
// reclamada figura en el JSON y en el total), y un pago cuyo JSON no cuadra con lo reclamado se aborta entero.
// MEDIA: pagar exige el permiso `liquidaciones` en edición, no sólo el rol. Corre también con PGlite
// (`node scripts/qa/p1-pglite.mjs <este archivo>`).

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";

const FOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQ==";

test("Rendí regresión t3: liquidación con candado al editar, pago que cuadra, permiso al pagar", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  const { rendirGasto, aprobarRendicion } = await import("./acciones-rendiciones");
  const { generarLiquidaciones, publicarBorradores, pagarLiquidacion, editarExtrasLiquidacion, borrarLiquidacion } = await import("./acciones-empresa");

  const usuario = (nombre: string) => duenio.user.create({ data: { tenantId: a.id, name: nombre, email: `${nombre.toLowerCase()}@a.test`, passwordHash: "x", role: "RECEPTION" }, select: { id: true } });
  const adm = await usuario("Admin");
  const persona = (userId: string, rol: string) => duenio.proyectoPersona.create({ data: { tenantId: a.id, userId, nombre: rol, rol }, select: { id: true } });
  const pProd = await persona(a.recepcion.id, "PRODUCCION");
  const pAdm = await persona(adm.id, "ADMINISTRACION");
  const p1 = await duenio.proyecto.create({ data: { tenantId: a.id, numero: 1, clientId: a.clientes[0], nombre: "Stand 1", servicio: "ARQUITECTURA", etapa: "APROBADO" }, select: { id: true } });
  await duenio.proyectoEquipo.createMany({ data: [pProd, pAdm].map((p) => ({ tenantId: a.id, proyectoId: p1.id, personaId: p.id })) });
  const enA = (u: string) => ({ negocio: a, usuario: { id: u } });
  const form = (c: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(c)) fd.set(k, v); return fd; };
  const correr = async <R,>(p: { negocio: typeof a; usuario: { id: string } }, fn: () => Promise<R>): Promise<R | { lanzo: string }> => {
    const r = await ejecutarAccion(p, fn);
    if (r.tipo !== "respuesta") return { lanzo: JSON.stringify(r).slice(0, 120) };
    return (r as { valor: R }).valor;
  };
  let n = 0;
  const rendir = async (monto: string) => {
    const clave = `aaaaaaaa-bbbb-4ccc-8ddd-${String(++n).padStart(12, "0")}`;
    await correr(enA(a.recepcion.id), () => rendirGasto(form({ proyectoId: p1.id, clave, descripcion: `G${n}`, monto, medio: "PROPIO", fecha: "2026-11-04", foto: FOTO })));
    return (await duenio.proyectoRendicion.findFirstOrThrow({ where: { tenantId: a.id }, orderBy: { createdAt: "desc" } })).id;
  };
  const aprobar = (id: string) => correr(enA(adm.id), () => aprobarRendicion(form({ id })));
  const gastosEnJson = (extras: unknown) => new Set(((extras as { gastoId?: string }[]) ?? []).map((e) => e.gastoId).filter(Boolean));

  await t.test("carrera editar/generar: lo reclamado figura siempre en el JSON (6 vueltas)", async () => {
    for (let i = 0; i < 6; i++) {
      const periodo = `2027-0${i + 1}`;
      await aprobar(await rendir("100")); // sin base ni plus, la liquidación nace por un reintegro pendiente
      await correr(enA(adm.id), () => generarLiquidaciones(form({ periodo })));
      const l = await duenio.proyectoLiquidacion.findFirstOrThrow({ where: { tenantId: a.id, personaId: pProd.id, periodo } });
      await aprobar(await rendir("500"));
      await Promise.all([
        correr(enA(a.duenia.id), () => editarExtrasLiquidacion({ id: l.id, manuales: [{ nombre: "Bono", monto: "10" }] })),
        correr(enA(adm.id), () => generarLiquidaciones(form({ periodo }))),
      ]);
      const fin = await duenio.proyectoLiquidacion.findUniqueOrThrow({ where: { id: l.id } });
      const reclamadas = await duenio.proyectoRendicion.findMany({ where: { liquidacionId: l.id } });
      const enJson = gastosEnJson(fin.extras);
      assert.ok(reclamadas.every((r) => enJson.has(r.gastoId)), `vuelta ${i + 1}: reclamada fuera del JSON`);
      assert.equal(enJson.size, reclamadas.length, `vuelta ${i + 1}: JSON con reintegros no reclamados`);
      assert.equal(await correr(enA(adm.id), () => borrarLiquidacion(form({ id: l.id }))).then((x) => (x as { ok?: boolean }).ok), true);
    }
  });

  await t.test("carrera determinística: generar espera el candado, editar en el medio, se suelta", async () => {
    const periodo = "2027-08";
    await aprobar(await rendir("100"));
    await correr(enA(adm.id), () => generarLiquidaciones(form({ periodo })));
    const l = await duenio.proyectoLiquidacion.findFirstOrThrow({ where: { tenantId: a.id, personaId: pProd.id, periodo } });
    const nueva = await rendir("777");
    await aprobar(nueva);
    let soltar!: () => void;
    const candado = new Promise<void>((r) => (soltar = r));
    const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const tenedor = duenio.$transaction(async (tx) => { await tx.$queryRaw`SELECT id FROM "ProyectoLiquidacion" WHERE id = ${l.id} FOR UPDATE`; await candado; }, { timeout: 30000 });
    await dormir(300);
    const gen = correr(enA(adm.id), () => generarLiquidaciones(form({ periodo })));
    await dormir(800);
    const edi = correr(enA(a.duenia.id), () => editarExtrasLiquidacion({ id: l.id, manuales: [{ nombre: "Bono", monto: "10" }] }));
    await dormir(800);
    soltar();
    await tenedor;
    await Promise.all([gen, edi]);
    const fin = await duenio.proyectoLiquidacion.findUniqueOrThrow({ where: { id: l.id } });
    const r = await duenio.proyectoRendicion.findUniqueOrThrow({ where: { id: nueva } });
    assert.equal(r.liquidacionId, l.id);
    assert.ok(gastosEnJson(fin.extras).has(r.gastoId), "la rendición reclamada está en el JSON");
    const extras = fin.extras as { nombre: string; monto: number; reintegro?: true }[];
    assert.ok(extras.some((e) => e.nombre === "Bono" && e.monto === 10), "el extra manual no se perdió");
    assert.equal(fin.total, Math.round((fin.base + extras.reduce((s, e) => s + e.monto, 0)) * 100) / 100);
    assert.ok(fin.total >= 777 + 10);
    // Editar a mano no saca los reintegros.
    await correr(enA(a.duenia.id), () => editarExtrasLiquidacion({ id: l.id, manuales: [] }));
    const tras = await duenio.proyectoLiquidacion.findUniqueOrThrow({ where: { id: l.id } });
    assert.ok(gastosEnJson(tras.extras).has(r.gastoId), "editar no quita un reintegro");
    // Se paga y cuadra: un egreso por el total y la rendición reintegrada.
    await correr(enA(a.duenia.id), () => publicarBorradores(form({ periodo })));
    assert.deepEqual(await correr(enA(adm.id), () => pagarLiquidacion(form({ id: l.id }))), { ok: true });
    const egreso = await duenio.cashMovement.findFirstOrThrow({ where: { proyectoLiquidacionId: l.id } });
    assert.equal(egreso.amount, tras.total);
    assert.equal((await duenio.proyectoRendicion.findUniqueOrThrow({ where: { id: nueva } })).estado, "reintegrada");
  });

  await t.test("pago que no cuadra con lo reclamado: se aborta entero", async () => {
    const periodo = "2027-10";
    const r = await rendir("300");
    await aprobar(r);
    await correr(enA(adm.id), () => generarLiquidaciones(form({ periodo })));
    await correr(enA(a.duenia.id), () => publicarBorradores(form({ periodo })));
    const l = await duenio.proyectoLiquidacion.findFirstOrThrow({ where: { tenantId: a.id, personaId: pProd.id, periodo } });
    // Estado heredado del bug: el JSON perdió el reintegro, la rendición sigue reclamada.
    const sinReintegro = ((l.extras as { reintegro?: true }[]) ?? []).filter((e) => !e.reintegro);
    await duenio.proyectoLiquidacion.update({ where: { id: l.id }, data: { extras: sinReintegro } });
    const x = await correr(enA(adm.id), () => pagarLiquidacion(form({ id: l.id })));
    assert.equal((x as { ok?: boolean }).ok, false);
    assert.equal(await duenio.cashMovement.count({ where: { proyectoLiquidacionId: l.id } }), 0);
    assert.equal((await duenio.proyectoLiquidacion.findUniqueOrThrow({ where: { id: l.id } })).estado, "PUBLICADA");
    assert.equal((await duenio.proyectoRendicion.findUniqueOrThrow({ where: { id: r } })).estado, "aprobada");
  });

  await t.test("pagar sin el permiso liquidaciones: no paga", async () => {
    const periodo = "2027-11";
    await aprobar(await rendir("50"));
    await correr(enA(adm.id), () => generarLiquidaciones(form({ periodo })));
    await correr(enA(a.duenia.id), () => publicarBorradores(form({ periodo })));
    const l = await duenio.proyectoLiquidacion.findFirstOrThrow({ where: { tenantId: a.id, personaId: pProd.id, periodo } });
    await duenio.proyectoPermiso.create({ data: { tenantId: a.id, rol: "ADMINISTRACION", modulo: "liquidaciones", ver: false, editar: false } });
    const x = await correr(enA(adm.id), () => pagarLiquidacion(form({ id: l.id })));
    assert.notDeepEqual(x, { ok: true });
    assert.equal(await duenio.cashMovement.count({ where: { proyectoLiquidacionId: l.id } }), 0);
    assert.equal((await duenio.proyectoLiquidacion.findUniqueOrThrow({ where: { id: l.id } })).estado, "PUBLICADA");
    // Borrar ya lo exigía: sin permiso, la acción corta antes de tocar nada.
    await assert.rejects(correr(enA(adm.id), () => borrarLiquidacion(form({ id: l.id }))), /permiso/);
  });
});
