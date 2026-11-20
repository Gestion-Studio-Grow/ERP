// MIA T03 (O45, O46) — las Server Actions REALES de parámetros y vistas, con sesiones de verdad, contra una base efímera
// migrada (incluida M7a) y la app conectada como `app_rls` (sin BYPASSRLS, sin ser dueña de nada).
//
// C-O45: por cada grupo, cambiar un valor deja 1 fila y 1 renglón de historial; el mismo envío repetido o 5 a la vez,
// uno solo; un valor inválido se rechaza; Comercial y Administración llamando a la acción, rechazo y 0 cambios; el negocio
// B no ve los valores del A. C-O46: con «costo» oculto, Comercial pide una vista con el monto de A pagar y la respuesta
// no lo trae; una vista personal no la ve otro usuario. M7a: RLS forzada y política en las 3 tablas; sin las tablas
// (vuelta atrás aplicada), el código lee los valores del rubro y no rompe.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";

const TABLAS = ["ProyectoParametro", "ProyectoParametroHistorial", "ProyectoVista"];

const form = (campos: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
  return fd;
};

/** Un cambio válido por grupo del catálogo, como lo manda la pantalla. */
const CAMBIO_POR_GRUPO: Record<string, Record<string, string | string[]>> = {
  etapas: { clave: "etapas.lista", nombre_0: "Idea", nombre_1: "Venta", nombre_2: "Preparación", nombre_3: "En el predio", nombre_4: "Cierre", estado_PEDIDO: "0", estado_DISENO: "1", estado_RENDER: "1", estado_PRESUPUESTO: "1", estado_PROPUESTA: "1", estado_APROBADO: "2", estado_PRODUCCION: "2", estado_ARMADO: "3", estado_DESARME: "3", estado_CIERRE: "4" },
  precio: { clave: "precio.rentabilidad", valor: "32,5", min: "20", max: "40", provisional: "on" },
  reparto: { clave: "reparto.matriz", m_DEFENSA_EMPRESA: "70", m_DEFENSA_PRODUCTOR: "30" },
  equipo: { clave: "equipo.funciones", n: "3", id_0: "COMERCIAL", nombre_0: "Comercial", id_1: "PRODUCTOR", nombre_1: "Productor", id_2: "PRODUCTOR_CAMPO", nombre_2: "Productor de campo", nuevo: "Técnica" },
  costos: { clave: "costos.sectores", valor: "Escenografía\nTécnica\nLogística" },
  plan: { clave: "plan.saldoClienteDiasAntes", valor: "7" },
  prevision: { clave: "prevision.palabras", valor_sinConfirmar: "A confirmar", valor_confirmado: "Firme" },
  iva: { clave: "iva.porComprobante", valor_A: "CREDITO", valor_B: "COSTO", valor_C: "COSTO", valor_SIN_FACTURA: "COSTO" },
  moneda: { clave: "moneda.habilitadas", valor: ["ARS", "USD", "EUR"] },
  retenciones: { clave: "retenciones.cuentanComoCobrado", valor: "0" },
  cierre: { clave: "cierre.dia", valor: "5" },
  calendario: { clave: "calendario.diasAviso", valor: "4" },
  antiguedad: { clave: "antiguedad.tramos", valor: "15, 45, 90, 180" },
  sociedades: { clave: "sociedades.vinculadas", valor: "Sociedad Z (ficticia)" },
  cancelacion: { clave: "cancelacion.despuesDeAprobado", valor: "SOLO_DIRECCION_CON_LIQUIDACION" },
  palabras: { clave: "palabras.textos", valor_defensa: "Ahorro", valor_redondeo: "Redondeo", valor_rendicion: "Rendición", valor_prevision: "Previsión" },
};

test("M7a · parámetros (C-O45) y vistas (C-O46) con app_rls: permisos, historial, ×1, aislamiento y sin migración", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;
  const { guardarParametro, volverAlValorDelRubro } = await import("./acciones-parametros");
  const { guardarVista, borrarVista } = await import("./acciones-vistas");
  const { parametrosDelNegocio } = await import("./parametros/leer.server");
  const { leerListaConVista, vistaAplicable } = await import("./vistas.server");
  const { actorActual } = await import("./gestion.server");
  const { crearPagoEmpresa } = await import("./acciones-empresa");
  const { GRUPOS, CLAVES } = await import("./parametros/catalogo");
  const { prisma } = await import("@/lib/prisma");

  // ── M7a en la base: RLS forzada y la política por negocio en cada tabla nueva ──
  const forzada = await duenio.$queryRaw<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = ANY(${TABLAS}) ORDER BY relname`;
  assert.deepEqual(forzada.map((r) => [r.relname, r.relrowsecurity, r.relforcerowsecurity]), [...TABLAS].sort().map((n) => [n, true, true]));
  const politicas = await duenio.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_policies WHERE policyname = 'tenant_isolation' AND tablename = ANY(${TABLAS}) ORDER BY tablename`;
  assert.deepEqual(politicas.map((p) => p.tablename), [...TABLAS].sort());

  // Equipo de A: Dirección es la dueña (OWNER sin ficha); Administración y Comercial con su ficha.
  const usuario = (nombre: string) => duenio.user.create({ data: { tenantId: a.id, name: nombre, email: `${nombre.toLowerCase()}@a.test`, passwordHash: "x", role: "RECEPTION" }, select: { id: true } });
  const [adm, com] = await Promise.all([usuario("Admin"), usuario("Comercial")]);
  await duenio.proyectoPersona.createMany({ data: [{ tenantId: a.id, userId: adm.id, nombre: "Admin", rol: "ADMINISTRACION" }, { tenantId: a.id, userId: com.id, nombre: "Comercial", rol: "COMERCIAL" }] });
  const en = (negocio: typeof a, usuarioId: string) => ({ negocio, usuario: { id: usuarioId } });
  const correr = async <R>(pedido: ReturnType<typeof en>, fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion(pedido, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };
  const dir = en(a, a.duenia.id);

  /** Conteo como dueño de las tablas: con la RLS forzada, hasta el dueño necesita el negocio fijado. */
  const contar = (tenantId: string) =>
    duenio.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      return { filas: await tx.proyectoParametro.count(), historial: await tx.proyectoParametroHistorial.count(), vistas: await tx.proyectoVista.count() };
    });
  assert.equal(await duenio.proyectoParametro.count(), 0, "sin negocio fijado, el dueño no ve nada (FORCE)");

  // ── C-O45 · por cada grupo, un cambio = 1 fila + 1 renglón de historial ──
  assert.deepEqual(Object.keys(CAMBIO_POR_GRUPO).sort(), GRUPOS.map((g) => g.id).sort(), "un caso por grupo");
  for (const [grupo, campos] of Object.entries(CAMBIO_POR_GRUPO)) {
    const antes = await contar(a.id);
    assert.deepEqual(await correr(dir, () => guardarParametro(form(campos))), { ok: true }, grupo);
    const despues = await contar(a.id);
    assert.deepEqual([despues.filas - antes.filas, despues.historial - antes.historial], [1, 1], grupo);
  }
  const p = await correr(dir, () => parametrosDelNegocio(a.id));
  assert.equal(p["precio.rentabilidad"].origen, "NEGOCIO");
  assert.deepEqual(p["precio.rentabilidad"].valor, { valor: 32.5, min: 20, max: 40 });
  assert.equal(p["precio.rentabilidad"].provisional, true, "la marca de provisional queda en la fila");
  assert.equal(p["plan.saldoClienteDiasAntes"].provisional, false);
  assert.deepEqual(p["etapas.lista"].valor.map((e) => e.nombre), ["Idea", "Venta", "Preparación", "En el predio", "Cierre"]);
  assert.deepEqual(p["precio.comision"].valor.TECNICA, { valor: 0, min: 0, max: 100 }, "la función nueva arranca en 0");
  assert.equal(p["precio.modo"].origen, "RUBRO", "sin fila rige el rubro");
  const historial = await duenio.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${a.id}, true)`;
    return tx.proyectoParametroHistorial.findFirst({ where: { clave: "plan.saldoClienteDiasAntes" } });
  });
  assert.deepEqual([historial?.antes, historial?.despues, historial?.autorId], [5, 7, a.duenia.id], "antes y después, y quién");

  // ×1: el mismo envío otra vez, y 5 a la vez con un valor nuevo, dejan un solo renglón.
  let n = await contar(a.id);
  assert.deepEqual(await correr(dir, () => guardarParametro(form(CAMBIO_POR_GRUPO.cierre))), { ok: true, sinCambios: true });
  assert.deepEqual(await contar(a.id), n);
  const cinco = await Promise.all(Array.from({ length: 5 }, () => correr(dir, () => guardarParametro(form({ clave: "cierre.dia", valor: "6" })))));
  assert.equal(cinco.filter((r) => r.ok && !("sinCambios" in r && r.sinCambios)).length, 1, JSON.stringify(cinco));
  assert.deepEqual(await contar(a.id), { ...n, historial: n.historial + 1 });

  // Inválidos: rechazo y 0 cambios.
  n = await contar(a.id);
  for (const malo of <Record<string, string>[]>[{ clave: "precio.redondeo.tope", valor: "101" }, { clave: "reparto.matriz", m_DEFENSA_EMPRESA: "70", m_DEFENSA_PRODUCTOR: "20" }, { clave: "cierre.dia", valor: "7,5" }, { clave: "no.existe", valor: "1" }, { clave: "equipo.funciones", n: "1", id_0: "COMERCIAL", nombre_0: "Comercial" }]) {
    const r = await correr(dir, () => guardarParametro(form(malo)));
    assert.equal(r.ok, false, JSON.stringify(malo));
  }
  assert.deepEqual(await contar(a.id), n);

  // Comercial y Administración llamando a la acción directo: rechazo y 0 cambios.
  for (const quien of [com.id, adm.id]) {
    assert.deepEqual(await correr(en(a, quien), () => guardarParametro(form({ clave: "cierre.dia", valor: "9" }))), { ok: false, error: "Sólo Dirección cambia los parámetros." });
    assert.equal((await correr(en(a, quien), () => volverAlValorDelRubro(form({ clave: "cierre.dia" })))).ok, false);
  }
  assert.deepEqual(await contar(a.id), n);

  // Volver al valor del rubro: borra la fila y deja renglón.
  assert.deepEqual(await correr(dir, () => volverAlValorDelRubro(form({ clave: "calendario.diasAviso" }))), { ok: true });
  assert.deepEqual(await contar(a.id), { ...n, filas: n.filas - 1, historial: n.historial + 1 });
  assert.equal((await correr(dir, () => parametrosDelNegocio(a.id)))["calendario.diasAviso"].origen, "RUBRO");

  // ── El negocio B no ve los valores del A (ni con la consulta directa: la política lo corta) ──
  assert.deepEqual(await correr(en(b, b.duenia.id), () => guardarParametro(form({ clave: "cierre.dia", valor: "20" }))), { ok: true });
  const deB = await correr(en(b, b.duenia.id), () => parametrosDelNegocio(b.id));
  assert.equal(deB["cierre.dia"].valor, 20);
  assert.equal(deB["precio.rentabilidad"].origen, "RUBRO", "B no hereda lo de A");
  assert.equal((await correr(dir, () => parametrosDelNegocio(a.id)))["cierre.dia"].valor, 6);
  assert.equal(await correr(dir, async () => await prisma.proyectoParametro.count({ where: { tenantId: b.id } })), 0, "desde A, las filas de B no existen");
  const app = new PrismaClient({ adapter: new PrismaPg({ connectionString: base.urlApp }) });
  base.alBorrar(() => app.$disconnect());
  assert.equal(await app.proyectoParametro.count(), 0, "app_rls sin negocio fijado: nada");

  // ── C-O46 · vistas ──
  // Comercial ve A pagar (permiso de empresa dado por Dirección) pero tiene «costo» oculto (de fábrica).
  await duenio.proyectoPermiso.create({ data: { tenantId: a.id, rol: "COMERCIAL", modulo: "empresa", ver: true, editar: false } });
  assert.deepEqual(await correr(dir, () => crearPagoEmpresa(form({ tipo: "PAGO", concepto: "Alquiler de depósito (ficticio)", venceEl: "2026-11-20", monto: "150000", moneda: "ARS" }))), { ok: true });
  const vistaRol = await correr(dir, () => guardarVista(form({ lista: "a-pagar", nombre: "Comercial: lo que vence", alcance: "ROL", rol: "COMERCIAL", columnas: ["evento", "concepto", "monto", "enPesos"], estado: "pendientes", origen: "todos", moneda: "todas", venceEnDias: "0", agrupacion: "", orden: "monto:desc" })));
  assert.equal(vistaRol.ok, true);
  const idRol = (vistaRol as { id: string }).id;
  // MIA-229: «Empresa» es de Dirección y Administración; el permiso guardado para Comercial no lo abre (permisoFijo,
  // gestion-core.ts), así que tampoco la vista de su rol: no recibe ni la lista.
  const leida = await correr(en(a, com.id), async () => leerListaConVista(await actorActual(), "a-pagar", idRol));
  assert.equal(leida.ok, false);
  assert.doesNotMatch(JSON.stringify(leida), /150000/, "el importe no aparece en ningún lado");
  const deDireccion = await correr(dir, async () => leerListaConVista(await actorActual(), "a-pagar", "sistema:todas"));
  assert.ok(deDireccion.ok && deDireccion.grupos[0].filas[0].monto === 150000, "Dirección sí lo ve");

  // Personal: Administración guarda la suya; Comercial no la ve, no la lee por id y no la borra (MIA-229: Comercial ya no
  // abre «a pagar», así que la vista personal se prueba al revés).
  const propia = await correr(en(a, adm.id), () => guardarVista(form({ lista: "a-pagar", nombre: "Mía", alcance: "PERSONA", columnas: ["concepto", "monto"] })));
  assert.equal(propia.ok, true);
  const idPropia = (propia as { id: string }).id;
  const deCom = await correr(en(a, com.id), async () => vistaAplicable(await actorActual(), "a-pagar", idPropia));
  assert.equal(deCom.vistas.some((v) => v.id === idPropia), false);
  assert.notEqual(deCom.actual.id, idPropia, "pedida por id, cae en la del sistema");
  assert.equal((await correr(en(a, com.id), () => borrarVista(form({ id: idPropia })))).ok, false);
  // Comercial no guarda vistas de rol; sin permiso de la lista, tampoco personales.
  assert.equal((await correr(en(a, com.id), () => guardarVista(form({ lista: "a-pagar", nombre: "De todos", alcance: "ROL", rol: "COMERCIAL", columnas: ["concepto"] })))).ok, false);
  assert.equal((await correr(en(a, com.id), () => guardarVista(form({ lista: "a-pagar", nombre: "Mía", alcance: "PERSONA", columnas: ["concepto"] })))).ok, false);
  assert.equal((await correr(en(b, b.duenia.id), async () => vistaAplicable(await actorActual(), "a-pagar", idRol))).vistas.some((v) => v.id === idRol), false, "B no ve las de A");
  assert.equal((await contar(b.id)).vistas, 0);
  assert.equal((await contar(a.id)).vistas, 2);
  assert.deepEqual(await correr(en(a, adm.id), () => borrarVista(form({ id: idPropia }))), { ok: true });

  // ── Sin la migración (vuelta atrás aplicada): el código lee el rubro y no rompe ──
  const rollback = await readFile(new URL("../../../prisma/migrations/20261117120000_mia_m7a_parametros_vistas/rollback.sql", import.meta.url), "utf8");
  for (const sentencia of rollback.replace(/--.*$/gm, "").split(";").map((x) => x.trim()).filter(Boolean)) await duenio.$executeRawUnsafe(sentencia);
  const sinTabla = await correr(dir, () => parametrosDelNegocio(a.id));
  assert.ok(CLAVES.every((k) => sinTabla[k].origen === "RUBRO"));
  assert.equal((await correr(dir, () => guardarParametro(form({ clave: "cierre.dia", valor: "9" })))).ok, false);
  assert.deepEqual((await correr(dir, async () => vistaAplicable(await actorActual(), "a-pagar"))).vistas.map((v) => v.alcance), ["SISTEMA", "SISTEMA"]);
});
