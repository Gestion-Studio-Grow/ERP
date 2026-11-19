"use server";

// ============================================================================
// MIA T07 (GSG-MIA-149) · las acciones del precio «por total» (O14, O15) y del reparto del equipo (O50).
// Todas: permiso del módulo y proyecto visible; un candado por proyecto (`trabarPrecio`) con el envío y la aprobación;
// un rechazo no cambia nada (la transacción entera vuelve atrás). Sin M3 (o M4 para el reparto) responden que falta la base.
// ============================================================================

import { revalidatePath } from "next/cache";
import { tenantTransaction } from "@/lib/rls";
import { centavosDe } from "@/lib/dinero/redondeo";
import { sePuedeEditar } from "./core";
import { avisar, exigirEditar, proyectoVisible, puede, registrarCambio, usuariosDeDireccion, type Actor } from "./gestion.server";
import { hayBaseAprobada } from "./presupuesto-base.server";
import { calcularTablero, decisionDelTotal, errorDePorcentajes, topeDelNegocio, validarReparto, type PorcentajesProyecto } from "./precio-proyecto-core";
import { contextoDelPrecio, estadoDelPrecio, fueraDelNegocio, hayM3, hayM4, trabarPrecio, type ContextoPrecio, type EstadoPrecio } from "./precio-proyecto.server";
import type { Prisma } from "@/generated/prisma/client";

export interface ResultadoPrecio {
  ok: boolean;
  error?: string;
  listo?: string;
}

const RAIZ = "/admin/proyectos";
const txt = (v: FormDataEntryValue | null): string => String(v ?? "").trim();
const mal = (error: string): ResultadoPrecio => ({ ok: false, error });
const FALTA_M3 = "Falta preparar la base para guardar el precio (migración M3): avisale a quien administra el sistema.";
const FALTA_M4 = "Falta preparar la base para guardar el reparto (migración M4): avisale a quien administra el sistema.";

/** Un rechazo adentro de la transacción: la vuelve atrás entera y se responde con su texto. */
class Rechazo extends Error {}

/** Un número escrito a la argentina («1.490.000,50») o con punto decimal. Null: no se entiende. */
function numero(texto: string): number | null {
  const s = texto.replace(/\s|\$/g, "");
  if (!/^-?[\d.,]+$/.test(s)) return null;
  const limpio = /^-?\d+\.\d{1,2}$/.test(s) ? s : s.replace(/\./g, "").replace(",", ".");
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/** Cotizaciones para editar (como la ficha de precios) y ver costos (el tablero los muestra). Proyecto visible. */
async function entrar(proyectoId: string): Promise<Actor | string> {
  let a: Actor;
  try {
    a = await exigirEditar("cotizaciones");
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("No tenés permiso")) return e.message;
    throw e;
  }
  if (!puede(a, "costos", "ver")) return "El precio por total muestra costos: no tenés permiso para verlos.";
  if (!proyectoId || !(await proyectoVisible(a, proyectoId))) return "Ese proyecto no existe.";
  return a;
}

const textoPct = (p: PorcentajesProyecto) => JSON.stringify(p);

/** En qué momento está el proyecto: con la propuesta aprobada, el precio lo cambia sólo Dirección y con motivo. */
async function momento(tx: Prisma.TransactionClient, a: Actor, proyectoId: string, motivo: string): Promise<"libre" | "aprobada"> {
  if (await hayBaseAprobada(tx, a.tenantId, proyectoId)) {
    if (a.rol !== "DIRECCION") throw new Rechazo("Con la propuesta aprobada por el cliente, esto lo cambia sólo Dirección.");
    if (!motivo) throw new Rechazo("Escribí el motivo del cambio: la propuesta ya está aprobada.");
    return "aprobada";
  }
  const viva = await tx.proyectoPresupuesto.findFirst({ where: { tenantId: a.tenantId, proyectoId }, orderBy: { version: "desc" }, select: { estado: true } });
  if (viva && !sePuedeEditar(viva.estado)) throw new Rechazo("La versión ya se envió: para cambiar el precio, hacé una versión nueva.");
  return "libre";
}

function porcentajesDelFormulario(f: FormData, e: EstadoPrecio, ctx: ContextoPrecio): PorcentajesProyecto | string {
  const leer = (campo: string, actual: number): number | string => {
    const t = txt(f.get(campo));
    if (!t) return actual;
    const n = numero(t);
    return n === null ? `«${t}» no se entiende como porcentaje.` : n;
  };
  const p: PorcentajesProyecto = { rentabilidad: 0, margenError: 0, iibGa: 0, comision: {} };
  for (const k of ["rentabilidad", "margenError", "iibGa"] as const) {
    const v = leer(k, e.vigentes[k]);
    if (typeof v === "string") return v;
    p[k] = v;
  }
  for (const fn of ctx.valores["equipo.funciones"]) {
    const v = leer(`comision.${fn.id}`, e.vigentes.comision[fn.id] ?? 0);
    if (typeof v === "string") return v;
    p.comision[fn.id] = v;
  }
  return errorDePorcentajes(p) ?? p;
}

/**
 * Guarda el total de venta y los porcentajes del proyecto (O14, O15). Total menor que el subtotal: rechazo, cero cambios.
 * Redondeo sobre el tope: según `precio.redondeo.accion` (FRENA rechaza; AVISA_APRUEBA_DIRECCION guarda y el envío espera a
 * Dirección; INFORMA guarda). Un porcentaje fuera del rango del negocio queda pedido y espera a Dirección; Dirección lo aplica.
 */
export async function guardarPrecio(formData: FormData): Promise<ResultadoPrecio> {
  const proyectoId = txt(formData.get("proyectoId"));
  const a = await entrar(proyectoId);
  if (typeof a === "string") return mal(a);
  const { tenantId } = a;
  if (!(await hayM3())) return mal(FALTA_M3);
  const ctx = await contextoDelPrecio(tenantId);
  const motivo = txt(formData.get("motivo")).slice(0, 300);
  const textoTotal = txt(formData.get("total"));
  let total: number | null = null;
  if (textoTotal) {
    const n = numero(textoTotal);
    if (n === null || n < 0) return mal("El total de venta no se entiende: escribilo en pesos, como 1.490.000.");
    total = centavosDe(n);
  }
  const direccion = await usuariosDeDireccion(tenantId);
  try {
    const r = await tenantTransaction(async (tx) => {
      await trabarPrecio(tx, tenantId, proyectoId);
      const cuando = await momento(tx, a, proyectoId, motivo);
      const e = await estadoDelPrecio(tenantId, proyectoId, ctx, tx);
      const pedidos = porcentajesDelFormulario(formData, e, ctx);
      if (typeof pedidos === "string") throw new Rechazo(pedidos);
      if (cuando === "aprobada" && total !== e.totalVenta) throw new Rechazo("La propuesta ya está aprobada: el total quedó en la foto y no cambia. Un cambio va como adicional.");
      if (total !== null && (await tx.proyecto.findFirst({ where: { id: proyectoId, tenantId }, select: { moneda: true } }))?.moneda !== "ARS") {
        throw new Rechazo("El precio por total va en pesos: este proyecto se vende en otra moneda (provisional a confirmar).");
      }
      const fuera = fueraDelNegocio(pedidos, ctx);
      const esperan = fuera.length > 0 && a.rol !== "DIRECCION";
      const aplicados = esperan ? e.vigentes : pedidos;
      const t = calcularTablero({ costoOriginal: e.costoOriginal, adicionales: e.adicionales, porcentajes: aplicados, funciones: ctx.valores["equipo.funciones"], totalVenta: total, tope: topeDelNegocio(ctx.valores) });
      const d = decisionDelTotal(t, ctx.valores["precio.redondeo.accion"]);
      if ("rechazo" in d) throw new Rechazo(d.rechazo);
      // La aprobación del redondeo es de un monto: si Dirección guarda, queda aprobado ése; si cambia, hay que volver a aprobar.
      const topeAprobado = d.esperaDireccion ? (a.rol === "DIRECCION" ? t.redondeoBruto : e.topeAprobado) : null;
      const ahora = new Date();
      const datos = {
        totalVentaCentavos: total === null ? null : BigInt(total),
        subtotalCentavos: BigInt(t.subtotal),
        redondeoBrutoCentavos: t.redondeoBruto === null ? null : BigInt(t.redondeoBruto),
        redondeoNetoCentavos: t.redondeoNeto === null ? null : BigInt(t.redondeoNeto),
        porcentajes: aplicados as unknown as Prisma.InputJsonValue,
        pendientes: esperan ? (pedidos as unknown as Prisma.InputJsonValue) : (null as unknown as Prisma.InputJsonValue),
        pendientesPor: esperan ? a.nombre : null,
        pendientesMotivo: esperan ? motivo || null : null,
        topeAprobadoCentavos: topeAprobado === null ? null : BigInt(topeAprobado),
        topeAprobadoPor: topeAprobado === null ? null : topeAprobado === e.topeAprobado ? e.topeAprobadoPor : a.nombre,
        topeAprobadoEl: topeAprobado === null ? null : topeAprobado === e.topeAprobado ? undefined : ahora,
        actualizadoPor: a.nombre,
      };
      await tx.proyectoPrecio.upsert({ where: { proyectoId }, create: { tenantId, proyectoId, ...datos, topeAprobadoEl: datos.topeAprobadoEl ?? null }, update: datos });
      const quien = cuando === "aprobada" ? `${a.nombre} (motivo: ${motivo})` : a.nombre;
      await registrarCambio(tx, { tenantId, proyectoId, entidad: "ProyectoPrecio", entidadId: proyectoId, campo: "Total de venta", antes: e.totalVenta === null ? null : e.totalVenta / 100, despues: total === null ? null : total / 100, autor: quien });
      await registrarCambio(tx, { tenantId, proyectoId, entidad: "ProyectoPrecio", entidadId: proyectoId, campo: "Porcentajes del precio", antes: textoPct(e.vigentes), despues: textoPct(aplicados), autor: quien });
      if (esperan) await registrarCambio(tx, { tenantId, proyectoId, entidad: "ProyectoPrecio", entidadId: proyectoId, campo: "Porcentajes pedidos fuera de rango", despues: textoPct(pedidos), autor: quien });
      // Lo aprobado internamente tiene que ser lo que se envía: un total nuevo pide aprobar los precios otra vez.
      if (total !== e.totalVenta) await tx.proyectoPresupuesto.updateMany({ where: { tenantId, proyectoId, estado: "BORRADOR", aprobadoInternoEl: { not: null } }, data: { aprobadoInternoEl: null, aprobadoInternoPor: null } });
      const esperaTope = d.esperaDireccion && topeAprobado !== t.redondeoBruto;
      if (esperan || esperaTope) {
        const p = await tx.proyecto.findFirst({ where: { id: proyectoId, tenantId }, select: { nombre: true } });
        const que = esperan ? `porcentajes fuera de rango (${fuera.map((x) => x.nombre).join(", ")})` : "un redondeo sobre el tope";
        await avisar(tx, { tenantId, destinatarios: direccion.filter((u) => u !== a.user.id), tipo: "aprobacion", texto: `${a.nombre} pide aprobar ${que} en ${p?.nombre ?? "un proyecto"}`, enlace: `${RAIZ}/${proyectoId}/precio` });
      }
      if (esperan) return `Guardado. Los porcentajes fuera del rango (${fuera.map((x) => x.nombre).join(", ")}) esperan a Dirección.`;
      if (esperaTope) return "Guardado. El redondeo pasa el tope: la propuesta no sale hasta que Dirección lo apruebe.";
      return "Listo: precio guardado.";
    }, { tenantId });
    revalidatePath(`${RAIZ}/${proyectoId}`);
    revalidatePath(`${RAIZ}/${proyectoId}/precio`);
    return { ok: true, listo: r };
  } catch (e) {
    if (e instanceof Rechazo) return mal(e.message);
    throw e;
  }
}

/** Dirección aprueba lo que espera: los porcentajes pedidos fuera de rango y el redondeo sobre el tope (el monto de hoy). */
export async function aprobarPrecio(formData: FormData): Promise<ResultadoPrecio> {
  const proyectoId = txt(formData.get("proyectoId"));
  const a = await entrar(proyectoId);
  if (typeof a === "string") return mal(a);
  if (a.rol !== "DIRECCION") return mal("Esto lo aprueba Dirección.");
  const { tenantId } = a;
  if (!(await hayM3())) return mal(FALTA_M3);
  const ctx = await contextoDelPrecio(tenantId);
  try {
    const r = await tenantTransaction(async (tx) => {
      await trabarPrecio(tx, tenantId, proyectoId);
      await momento(tx, a, proyectoId, "aprobación de Dirección");
      const e = await estadoDelPrecio(tenantId, proyectoId, ctx, tx);
      if (!e.pendientes && !e.tablero?.pasaTope) throw new Rechazo("No hay nada esperando a Dirección.");
      const porcentajes = e.pendientes ?? e.vigentes;
      const t = calcularTablero({ costoOriginal: e.costoOriginal, adicionales: e.adicionales, porcentajes, funciones: ctx.valores["equipo.funciones"], totalVenta: e.totalVenta, tope: topeDelNegocio(ctx.valores) });
      const d = decisionDelTotal(t, ctx.valores["precio.redondeo.accion"]);
      if ("rechazo" in d) throw new Rechazo(d.rechazo);
      const tope = t.pasaTope ? t.redondeoBruto : null;
      await tx.proyectoPrecio.update({
        where: { proyectoId },
        data: {
          porcentajes: porcentajes as unknown as Prisma.InputJsonValue,
          pendientes: null as unknown as Prisma.InputJsonValue,
          pendientesPor: null,
          pendientesMotivo: null,
          subtotalCentavos: BigInt(t.subtotal),
          redondeoBrutoCentavos: t.redondeoBruto === null ? null : BigInt(t.redondeoBruto),
          redondeoNetoCentavos: t.redondeoNeto === null ? null : BigInt(t.redondeoNeto),
          topeAprobadoCentavos: tope === null ? null : BigInt(tope),
          topeAprobadoPor: tope === null ? null : a.nombre,
          topeAprobadoEl: tope === null ? null : new Date(),
          actualizadoPor: a.nombre,
        },
      });
      await registrarCambio(tx, { tenantId, proyectoId, entidad: "ProyectoPrecio", entidadId: proyectoId, campo: "Aprobación de Dirección · precio", antes: textoPct(e.vigentes), despues: `${textoPct(porcentajes)}${tope === null ? "" : ` · redondeo ${tope / 100}`}`, autor: a.nombre });
      return "Listo: aprobaste el precio.";
    }, { tenantId });
    revalidatePath(`${RAIZ}/${proyectoId}/precio`);
    return { ok: true, listo: r };
  } catch (e) {
    if (e instanceof Rechazo) return mal(e.message);
    throw e;
  }
}

/**
 * El reparto por persona y concepto (O50). Campos `reparto.<CONCEPTO>.<idDelEquipo>` y, opcional, `reparto.<CONCEPTO>.EMPRESA`.
 * Las personas no pasan 100; con el de la empresa escrito, todo suma 100 exacto; el redondeo no se reparte. Se reemplaza
 * entero, adentro del candado del precio. Con la propuesta aprobada, sólo Dirección y con motivo (la foto no cambia).
 */
export async function guardarReparto(formData: FormData): Promise<ResultadoPrecio> {
  const proyectoId = txt(formData.get("proyectoId"));
  const a = await entrar(proyectoId);
  if (typeof a === "string") return mal(a);
  const { tenantId } = a;
  if (!(await hayM4())) return mal(FALTA_M4);
  const ctx = await contextoDelPrecio(tenantId);
  const motivo = txt(formData.get("motivo")).slice(0, 300);
  const entrada: Record<string, Record<string, number>> = {};
  for (const [k, v] of formData.entries()) {
    const m = /^reparto\.([^.]+)\.([^.]+)$/.exec(k);
    if (!m) continue;
    const t = txt(v as string);
    if (!t) continue;
    const n = numero(t);
    if (n === null) return mal(`«${t}» no se entiende como porcentaje.`);
    (entrada[m[1]] ??= {})[m[2]] = n;
  }
  try {
    const r = await tenantTransaction(async (tx) => {
      await trabarPrecio(tx, tenantId, proyectoId);
      const cuando = await momento(tx, a, proyectoId, motivo);
      const e = await estadoDelPrecio(tenantId, proyectoId, ctx, tx);
      const v = validarReparto(entrada, ctx.valores["reparto.conceptos"], e.equipo);
      if (!v.ok) throw new Rechazo(v.error);
      await tx.proyectoEquipoReparto.deleteMany({ where: { tenantId, proyectoId } });
      if (v.filas.length > 0) await tx.proyectoEquipoReparto.createMany({ data: v.filas.map((f) => ({ tenantId, proyectoId, equipoId: f.equipoId, concepto: f.concepto, puntos: f.puntos, creadoPor: a.nombre })) });
      const quien = cuando === "aprobada" ? `${a.nombre} (motivo: ${motivo})` : a.nombre;
      await registrarCambio(tx, { tenantId, proyectoId, entidad: "ProyectoEquipoReparto", entidadId: proyectoId, campo: "Reparto del equipo", antes: JSON.stringify(e.reparto), despues: JSON.stringify(entrada), autor: quien });
      return "Listo: reparto guardado.";
    }, { tenantId });
    revalidatePath(`${RAIZ}/${proyectoId}/precio`);
    return { ok: true, listo: r };
  } catch (e) {
    if (e instanceof Rechazo) return mal(e.message);
    throw e;
  }
}
