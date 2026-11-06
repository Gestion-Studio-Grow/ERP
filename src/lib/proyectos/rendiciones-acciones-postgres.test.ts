// RENDÍ tanda 2 — las Server Actions REALES (`acciones-rendiciones.ts`) con sesiones de verdad, contra una base migrada.
//
// Producción rinde donde está en el equipo y no donde no está; Comercial rinde; Diseño no; nadie aprueba lo propio aunque
// mande el POST directo; el mismo envío dos veces es una rendición; dos aprobaciones a la vez dan una; el negocio B no ve
// ni aprueba las de A; rendir, aprobar y rechazar no asientan caja. Corre también con PGlite (`node scripts/qa/p1-pglite.mjs
// <este archivo>`): ahí el aislamiento que se prueba es el de la app (tenantId de la sesión), no el de RLS.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";

const FOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQ==";

test("Rendí: quién rinde, nadie aprueba lo propio, un envío = una rendición, una aprobación, aislado por negocio, sin caja", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;
  const { rendirGasto, aprobarRendicion, rechazarRendicion, devolverRendicion } = await import("./acciones-rendiciones");

  const usuario = async (nombre: string) => duenio.user.create({ data: { tenantId: a.id, name: nombre, email: `${nombre.toLowerCase()}@a.test`, passwordHash: "x", role: "RECEPTION" }, select: { id: true } });
  const [com, dis, adm] = await Promise.all([usuario("Comercial"), usuario("Disenio"), usuario("Admin")]);
  const persona = (userId: string, rol: string) => duenio.proyectoPersona.create({ data: { tenantId: a.id, userId, nombre: rol, rol }, select: { id: true } });
  const pProd = await persona(a.recepcion.id, "PRODUCCION");
  const pCom = await persona(com.id, "COMERCIAL");
  const pDis = await persona(dis.id, "DISENO");
  const pAdm = await persona(adm.id, "ADMINISTRACION");
  const proyecto = (numero: number) => duenio.proyecto.create({ data: { tenantId: a.id, numero, clientId: a.clientes[0], nombre: `Stand ${numero}`, servicio: "ARQUITECTURA", etapa: "APROBADO" }, select: { id: true } });
  const p1 = await proyecto(1);
  const p2 = await proyecto(2);
  await duenio.proyectoEquipo.createMany({ data: [pProd, pCom, pDis, pAdm].map((p) => ({ tenantId: a.id, proyectoId: p1.id, personaId: p.id })) });
  // En P2 no está Producción (sí Comercial, para que el proyecto exista para alguien más).
  await duenio.proyectoEquipo.create({ data: { tenantId: a.id, proyectoId: p2.id, personaId: pCom.id } });

  const enA = (usuarioId: string) => ({ negocio: a, usuario: { id: usuarioId } });
  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const rendir = async (usuarioId: string, proyectoId: string, clave: string, extra: Record<string, string> = {}) => {
    const r = await ejecutarAccion(enA(usuarioId), () => rendirGasto(form({ proyectoId, clave, descripcion: "Taxi al predio", monto: "12.500", medio: "PROPIO", fecha: "2026-11-04", foto: FOTO, ...extra })));
    assert.equal(r.tipo, "respuesta");
    return (r as { valor: Awaited<ReturnType<typeof rendirGasto>> }).valor;
  };
  const revisar = async (pedido: { negocio: typeof a; usuario: { id: string } }, fn: typeof aprobarRendicion, id: string, comentario = "") => {
    const r = await ejecutarAccion(pedido, () => fn(form({ id, comentario })));
    assert.equal(r.tipo, "respuesta");
    return (r as { valor: Awaited<ReturnType<typeof aprobarRendicion>> }).valor;
  };
  const rendiciones = () => duenio.proyectoRendicion.findMany({ where: { tenantId: a.id }, orderBy: { createdAt: "asc" } });

  // Producción rinde donde está; el mismo envío dos veces (doble clic, reintento) es UNA rendición.
  const clave = "3f2c1a9e-6b7d-4c1e-9a0b-1234567890ab";
  assert.deepEqual(await rendir(a.recepcion.id, p1.id, clave), { ok: true });
  assert.deepEqual(await rendir(a.recepcion.id, p1.id, clave), { ok: true, repetida: true });
  let todas = await rendiciones();
  assert.equal(todas.length, 1, "doble envío = una rendición");
  const deProd = todas[0];
  assert.equal(deProd.estado, "enviada");
  assert.equal(deProd.montoCentavos, 1250000);
  assert.equal(deProd.personaId, pProd.id, "la persona sale de la sesión");
  const archivo = await duenio.proyectoArchivo.findFirst({ where: { id: deProd.archivoId ?? "-" } });
  assert.equal(archivo?.tipo, "COMPROBANTE");

  // Producción NO rinde donde no está; Diseño no rinde; monto 0 no entra.
  assert.equal((await rendir(a.recepcion.id, p2.id, "aaaaaaaa-bbbb-4ccc-8ddd-000000000002")).ok, false);
  assert.equal((await rendir(dis.id, p1.id, "aaaaaaaa-bbbb-4ccc-8ddd-000000000003")).ok, false);
  assert.equal((await rendir(a.recepcion.id, p1.id, "aaaaaaaa-bbbb-4ccc-8ddd-000000000004", { monto: "0" })).ok, false);
  // Comercial rinde; Administración también (y no se aprueba a sí misma).
  assert.deepEqual(await rendir(com.id, p1.id, "aaaaaaaa-bbbb-4ccc-8ddd-000000000005"), { ok: true });
  assert.deepEqual(await rendir(adm.id, p1.id, "aaaaaaaa-bbbb-4ccc-8ddd-000000000006"), { ok: true });
  todas = await rendiciones();
  assert.equal(todas.length, 3);
  const deCom = todas.find((r) => r.personaId === pCom.id)!;
  const deAdm = todas.find((r) => r.personaId === pAdm.id)!;

  // Nadie aprueba lo propio, aunque mande el POST directo; Producción y Comercial no aprueban.
  assert.match(JSON.stringify(await revisar(enA(adm.id), aprobarRendicion, deAdm.id)), /lo propio/);
  assert.equal((await revisar(enA(a.recepcion.id), aprobarRendicion, deProd.id)).ok, false);
  assert.equal((await revisar(enA(com.id), aprobarRendicion, deProd.id)).ok, false);

  // El negocio B no ve ni aprueba las de A.
  const deB = await revisar({ negocio: b, usuario: { id: b.duenia.id } }, aprobarRendicion, deProd.id);
  assert.deepEqual(deB, { ok: false, error: "Esa rendición no existe." });
  assert.equal((await duenio.proyectoRendicion.findUnique({ where: { id: deProd.id } }))?.estado, "enviada");

  // Dos aprobaciones a la vez (dos clics, dos pestañas): una sola pasa.
  const dos = await Promise.all([revisar(enA(a.duenia.id), aprobarRendicion, deProd.id), revisar(enA(adm.id), aprobarRendicion, deProd.id)]);
  assert.equal(dos.filter((r) => r.ok).length, 1, "aprobar dos veces = una");
  const aprobada = await duenio.proyectoRendicion.findUnique({ where: { id: deProd.id } });
  assert.equal(aprobada?.estado, "aprobada");
  assert.equal((aprobada?.eventos as unknown[]).length, 2, "enviar + una sola aprobación en la bitácora");
  assert.equal((await revisar(enA(adm.id), aprobarRendicion, deProd.id)).ok, false, "una aprobada no se vuelve a aprobar");

  // Devolver y rechazar piden comentario; rechazar anula el gasto, sin caja.
  assert.equal((await revisar(enA(adm.id), rechazarRendicion, deCom.id)).ok, false);
  assert.deepEqual(await revisar(enA(adm.id), rechazarRendicion, deCom.id, "No es de este evento"), { ok: true });
  assert.ok((await duenio.proyectoGasto.findUnique({ where: { id: deCom.gastoId } }))?.anuladoEl, "el gasto rechazado queda anulado");
  assert.deepEqual(await revisar(enA(a.duenia.id), devolverRendicion, deAdm.id, "Falta la factura"), { ok: true });
  assert.equal((await duenio.proyectoRendicion.findUnique({ where: { id: deAdm.id } }))?.estado, "devuelta");

  // Regla de caja: nada de esto asentó un movimiento.
  const gastos = todas.map((r) => r.gastoId);
  assert.equal(await duenio.cashMovement.count({ where: { proyectoGastoId: { in: gastos } } }), 0, "rendir, aprobar y rechazar no tocan la caja");
  const bitacora = await duenio.proyectoCambio.count({ where: { tenantId: a.id, entidad: "ProyectoRendicion" } });
  assert.equal(bitacora, 3 + 3, "tres rendidas + aprobar, rechazar y devolver");
});
