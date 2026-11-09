"use server";

// ============================================================================
// TALLER DE STANDS — escrituras (GSG-MIA-004 · T2): ABM de piezas, despiece del stand y «pasar a presupuesto».
// Cada acción vuelve a pedir el permiso de su módulo de proyectos, que el taller esté activo (flag + módulo + rubro)
// y que el proyecto sea visible: esconder un botón no protege nada. Las escrituras van en tenantTransaction.
// Los formularios son de server components: el resultado vuelve como `?aviso=` en la URL.
// ============================================================================

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { leerNumero } from "@/lib/proyectos/core";
import { configProyectos } from "@/lib/proyectos/datos.server";
import { actorActual, proyectoVisible, puede, regenerarCuotas, registrarCambio, type Actor } from "@/lib/proyectos/gestion.server";
import type { ModuloGestion } from "@/lib/proyectos/gestion-core";
import { faltaLaTabla, itemsDelDespiece, planDePase, validarPieza, RUBRO_DESPIECE } from "./core";
import { tallerActivo } from "./datos.server";
import { leerFecha, personaDelNegocio, validarHoras, validarValorHora, valorHoraVigente } from "./horas";

const RUTA_PIEZAS = "/admin/proyectos/taller/piezas";
const RUTA_VALORES = "/admin/proyectos/taller/valores-hora";
const rutaDespiece = (proyectoId: string) => `/admin/proyectos/${proyectoId}?tab=despiece`;
const SIN_MIGRAR = "Falta habilitar las tablas del taller (migración pendiente). Avisale a GSG.";

const txt = (v: FormDataEntryValue | null): string => String(v ?? "").trim();
const numero = (v: FormDataEntryValue | null): number => leerNumero(String(v ?? ""));
const token = () => randomBytes(18).toString("base64url");

function volver(ruta: string, aviso: string): never {
  const sep = ruta.includes("?") ? "&" : "?";
  redirect(`${ruta}${sep}aviso=${encodeURIComponent(aviso)}`);
}

/** Permiso de edición de alguno de estos módulos de proyectos + ver costos + taller activo. Devuelve el motivo si no. */
async function entrar(modulos: readonly ModuloGestion[]): Promise<Actor | string> {
  const a = await actorActual();
  // El despiece y el catálogo muestran el costo interno: además, el permiso de ver costos.
  if (!modulos.some((m) => puede(a, m, "editar")) || !puede(a, "costos", "ver")) return "No tenés permiso para hacer esto.";
  if (!(await tallerActivo(a.tenantId))) return "El taller de stands no está activo en este negocio.";
  return a;
}

/** Corre la escritura; si la tabla todavía no existe, vuelve con un aviso en vez de reventar. */
async function conTabla<T>(fn: () => Promise<T>): Promise<T | typeof SIN_MIGRAR> {
  try {
    return await fn();
  } catch (e) {
    if (faltaLaTabla(e)) return SIN_MIGRAR;
    throw e;
  }
}

// ── Catálogo de piezas ─────────────────────────────────────────────────────

export async function guardarPieza(formData: FormData): Promise<void> {
  const a = await entrar(["cotizaciones"]);
  if (typeof a === "string") volver(RUTA_PIEZAS, a);
  const id = txt(formData.get("id"));
  const v = validarPieza({ nombre: txt(formData.get("nombre")), unidad: txt(formData.get("unidad")), costoUnit: numero(formData.get("costoUnit")), horasStd: numero(formData.get("horasStd")) });
  if (!v.ok) volver(RUTA_PIEZAS, v.error);
  const { tenantId } = a;
  const r = await conTabla(() =>
    tenantTransaction(async (tx) => {
      if (id) return (await tx.tallerPieza.updateMany({ where: { id, tenantId }, data: v.pieza })).count > 0;
      await tx.tallerPieza.create({ data: { tenantId, ...v.pieza } });
      return true;
    }),
  );
  if (r === SIN_MIGRAR) volver(RUTA_PIEZAS, r);
  revalidatePath(RUTA_PIEZAS);
  volver(RUTA_PIEZAS, r ? "Pieza guardada." : "Esa pieza no existe.");
}

/** Baja lógica: una pieza usada en un despiece no se borra, se desactiva. */
export async function cambiarActivaPieza(formData: FormData): Promise<void> {
  const a = await entrar(["cotizaciones"]);
  if (typeof a === "string") volver(RUTA_PIEZAS, a);
  const id = txt(formData.get("id"));
  const activa = txt(formData.get("activa")) === "1";
  const { tenantId } = a;
  const r = await conTabla(() => tenantTransaction(async (tx) => (await tx.tallerPieza.updateMany({ where: { id, tenantId }, data: { activa } })).count > 0));
  if (r === SIN_MIGRAR) volver(RUTA_PIEZAS, r);
  revalidatePath(RUTA_PIEZAS);
  volver(RUTA_PIEZAS, !r ? "Esa pieza no existe." : activa ? "Pieza activada." : "Pieza dada de baja.");
}

// ── Despiece del stand ─────────────────────────────────────────────────────

/** Suma una pieza al despiece o, si ya está, le cambia la cantidad. Congela el costo de la pieza en ese momento. */
export async function guardarLineaDespiece(formData: FormData): Promise<void> {
  const proyectoId = txt(formData.get("proyectoId"));
  const ruta = rutaDespiece(proyectoId);
  const a = await entrar(["ficha", "cotizaciones"]);
  if (typeof a === "string") volver(ruta, a);
  if (!proyectoId || !(await proyectoVisible(a, proyectoId))) volver("/admin/proyectos", "Ese proyecto no existe.");
  const piezaId = txt(formData.get("piezaId"));
  const cantidad = numero(formData.get("cantidad"));
  if (!(cantidad > 0)) volver(ruta, "La cantidad tiene que ser mayor que cero.");
  const { tenantId } = a;
  const r = await conTabla(() =>
    tenantTransaction(async (tx) => {
      const pieza = await tx.tallerPieza.findFirst({ where: { id: piezaId, tenantId, activa: true }, select: { costoUnit: true, nombre: true } });
      if (!pieza) return "Esa pieza no existe o está dada de baja.";
      await tx.tallerDespiece.upsert({
        where: { proyectoId_piezaId: { proyectoId, piezaId } },
        create: { tenantId, proyectoId, piezaId, cantidad, costoUnitSnap: pieza.costoUnit },
        update: { cantidad, costoUnitSnap: pieza.costoUnit },
      });
      await registrarCambio(tx, { tenantId, proyectoId, entidad: "TallerDespiece", entidadId: piezaId, campo: "Despiece", despues: `${pieza.nombre} × ${cantidad}`, autor: a.nombre });
      return "Despiece actualizado.";
    }),
  );
  revalidatePath(`/admin/proyectos/${proyectoId}`);
  volver(ruta, r);
}

export async function quitarLineaDespiece(formData: FormData): Promise<void> {
  const proyectoId = txt(formData.get("proyectoId"));
  const ruta = rutaDespiece(proyectoId);
  const a = await entrar(["ficha", "cotizaciones"]);
  if (typeof a === "string") volver(ruta, a);
  if (!proyectoId || !(await proyectoVisible(a, proyectoId))) volver("/admin/proyectos", "Ese proyecto no existe.");
  const id = txt(formData.get("id"));
  const { tenantId } = a;
  const r = await conTabla(() => tenantTransaction(async (tx) => (await tx.tallerDespiece.deleteMany({ where: { id, tenantId, proyectoId } })).count > 0));
  if (r === SIN_MIGRAR) volver(ruta, r);
  revalidatePath(`/admin/proyectos/${proyectoId}`);
  volver(ruta, r ? "Pieza quitada del despiece. Volvé a pasarlo al presupuesto para actualizarlo." : "Esa línea ya no estaba.");
}

/**
 * Pasa el despiece al presupuesto en borrador, rubro «Materiales». Volver a pasarlo actualiza los ítems que vinieron
 * de él (`origen = despiece:<id>`), crea los nuevos y saca los de piezas quitadas; lo cargado a mano no se toca.
 */
export async function despieceAlPresupuesto(formData: FormData): Promise<void> {
  const proyectoId = txt(formData.get("proyectoId"));
  const ruta = rutaDespiece(proyectoId);
  const a = await entrar(["cotizaciones"]);
  if (typeof a === "string") volver(ruta, a);
  if (!proyectoId || !(await proyectoVisible(a, proyectoId))) volver("/admin/proyectos", "Ese proyecto no existe.");
  const { tenantId } = a;
  const config = await configProyectos(tenantId);
  const [conBorrador, versiones] = await Promise.all([
    prisma.proyectoPresupuesto.count({ where: { tenantId, proyectoId, estado: "BORRADOR" } }),
    prisma.proyectoPresupuesto.count({ where: { tenantId, proyectoId } }),
  ]);
  if (conBorrador === 0 && versiones > 0) volver(ruta, "La cotización ya se envió. Abrí una versión nueva en Cotización y volvé a pasar el despiece.");
  const r = await conTabla(() =>
    tenantTransaction(async (tx) => {
      // Un pase por proyecto a la vez: dos pedidos simultáneos (doble clic) leerían los mismos ítems y duplicarían
      // «Materiales». El bloqueo de la fila del proyecto los pone en fila; el segundo ve lo que escribió el primero.
      await tx.$queryRaw`SELECT 1 FROM "Proyecto" WHERE "id" = ${proyectoId} AND "tenantId" = ${tenantId} FOR UPDATE`;
      const filas = await tx.tallerDespiece.findMany({ where: { tenantId, proyectoId }, orderBy: { createdAt: "asc" }, select: { id: true, cantidad: true, costoUnitSnap: true, pieza: { select: { nombre: true, unidad: true } } } });
      const items = itemsDelDespiece(filas.map((f) => ({ id: f.id, nombre: f.pieza.nombre, unidad: f.pieza.unidad, cantidad: f.cantidad, costoUnitSnap: f.costoUnitSnap })), config.margenPct);
      let borrador = await tx.proyectoPresupuesto.findFirst({ where: { tenantId, proyectoId, estado: "BORRADOR" }, select: { id: true } });
      if (!borrador) {
        if (items.length === 0) return 0;
        const ultima = await tx.proyectoPresupuesto.findFirst({ where: { tenantId, proyectoId }, orderBy: { version: "desc" }, select: { version: true } });
        borrador = await tx.proyectoPresupuesto.create({
          data: { tenantId, proyectoId, version: (ultima?.version ?? 0) + 1, token: token(), ivaPct: config.ivaPct, condiciones: config.condiciones },
          select: { id: true },
        });
      }
      const presupuestoId = borrador.id;
      const existentes = await tx.proyectoItem.findMany({ where: { tenantId, presupuestoId, origen: { startsWith: "despiece:" } }, select: { id: true, origen: true, costoReal: true, estadoItem: true } });
      const plan = planDePase(existentes, items);
      // Un ítem que ya avanzó (tiene costo real o dejó de estar PENDIENTE) no se borra solo: queda para revisarlo a mano.
      const conAvance = new Set(existentes.filter((e) => e.costoReal != null || (e.estadoItem && e.estadoItem !== "PENDIENTE")).map((e) => e.id));
      const borrar = plan.borrar.filter((id) => !conAvance.has(id));
      if (borrar.length > 0) await tx.proyectoItem.deleteMany({ where: { tenantId, presupuestoId, id: { in: borrar } } });
      for (const { id, item } of plan.actualizar) {
        await tx.proyectoItem.updateMany({ where: { id, tenantId, presupuestoId }, data: { rubro: item.rubro, descripcion: item.descripcion, unidad: item.unidad, cantidad: item.cantidad, costo: item.costo, precio: item.precio } });
      }
      if (plan.crear.length > 0) {
        const base = await tx.proyectoItem.count({ where: { tenantId, presupuestoId } });
        await tx.proyectoItem.createMany({ data: plan.crear.map((item, i) => ({ tenantId, presupuestoId, ...item, posicion: base + i })) });
      }
      await tx.proyectoPresupuesto.updateMany({ where: { id: presupuestoId, tenantId, estado: "BORRADOR" }, data: { aprobadoInternoEl: null, aprobadoInternoPor: null } });
      await registrarCambio(tx, { tenantId, proyectoId, entidad: "ProyectoPresupuesto", entidadId: presupuestoId, campo: `Despiece → ${RUBRO_DESPIECE}`, despues: `${items.length} ítems`, autor: a.nombre });
      return items.length;
    }),
  );
  if (r === SIN_MIGRAR) volver(ruta, r);
  // Como cualquier cambio de la ficha: los precios nuevos piden aprobación, y las cuotas siguen a los ítems.
  await regenerarCuotas(tenantId, proyectoId);
  revalidatePath(`/admin/proyectos/${proyectoId}`);
  volver(ruta, r === 0 ? "El despiece está vacío: no hay nada para pasar." : `Pasaste ${r} ítems de «${RUBRO_DESPIECE}» al presupuesto en borrador.`);
}

// ── Valor hora por persona y carga de horas (T3) ───────────────────────────

/**
 * Valor hora de una persona desde una fecha. Repetir la misma fecha lo corrige (upsert por persona + fecha): no
 * duplica. La persona se busca con el `tenantId` del actor; la FK compuesta de la base es la segunda barrera.
 */
export async function guardarValorHora(formData: FormData): Promise<void> {
  const a = await entrar(["equipo", "cotizaciones"]);
  if (typeof a === "string") volver(RUTA_VALORES, a);
  const personaId = txt(formData.get("personaId"));
  const v = validarValorHora(numero(formData.get("valorHora")));
  if (!v.ok) volver(RUTA_VALORES, v.error);
  const vigenteDesde = leerFecha(txt(formData.get("vigenteDesde")));
  if (!vigenteDesde) volver(RUTA_VALORES, "Poné desde qué fecha rige el valor.");
  const { tenantId } = a;
  const r = await conTabla(() =>
    tenantTransaction(async (tx) => {
      const personas = await tx.proyectoPersona.findMany({ where: { tenantId, id: personaId }, select: { id: true } });
      if (!personaDelNegocio(personaId, personas)) return "Esa persona no es de este negocio.";
      await tx.tallerValorHora.upsert({
        where: { tenantId_personaId_vigenteDesde: { tenantId, personaId, vigenteDesde } },
        create: { tenantId, personaId, valorHora: v.valor, vigenteDesde },
        update: { valorHora: v.valor },
      });
      return "Valor hora guardado.";
    }),
  );
  revalidatePath(RUTA_VALORES);
  volver(RUTA_VALORES, r);
}

/**
 * Carga horas de una persona en el stand, con el valor hora vigente en esa fecha congelado en `valorHoraSnap`.
 * Si la persona no tiene valor hora vigente, avisa y no carga nada.
 */
export async function cargarHoras(formData: FormData): Promise<void> {
  const proyectoId = txt(formData.get("proyectoId"));
  const ruta = rutaDespiece(proyectoId);
  const a = await entrar(["ficha", "cotizaciones"]);
  if (typeof a === "string") volver(ruta, a);
  if (!proyectoId || !(await proyectoVisible(a, proyectoId))) volver("/admin/proyectos", "Ese proyecto no existe.");
  const personaId = txt(formData.get("personaId"));
  const h = validarHoras(numero(formData.get("horas")));
  if (!h.ok) volver(ruta, h.error);
  const fecha = leerFecha(txt(formData.get("fecha")));
  if (!fecha) volver(ruta, "Poné la fecha de las horas.");
  const nota = txt(formData.get("nota")).slice(0, 200) || null;
  const { tenantId } = a;
  const r = await conTabla(() =>
    tenantTransaction(async (tx) => {
      const persona = await tx.proyectoPersona.findFirst({ where: { tenantId, id: personaId }, select: { id: true, nombre: true } });
      if (!persona || !personaDelNegocio(personaId, [persona])) return "Esa persona no es de este negocio.";
      const valores = await tx.tallerValorHora.findMany({ where: { tenantId, personaId }, select: { valorHora: true, vigenteDesde: true } });
      const snap = valorHoraVigente(valores, fecha);
      if (snap == null) return `${persona.nombre} no tiene valor hora para esa fecha. Cargalo en «Valor hora por persona» y volvé a intentar.`;
      const carga = await tx.tallerHora.create({ data: { tenantId, proyectoId, personaId, fecha, horas: h.horas, valorHoraSnap: snap, nota }, select: { id: true } });
      await registrarCambio(tx, { tenantId, proyectoId, entidad: "TallerHora", entidadId: carga.id, campo: "Horas", despues: `${persona.nombre}: ${h.horas} h`, autor: a.nombre });
      return "Horas cargadas.";
    }),
  );
  revalidatePath(`/admin/proyectos/${proyectoId}`);
  volver(ruta, r);
}

export async function borrarHoras(formData: FormData): Promise<void> {
  const proyectoId = txt(formData.get("proyectoId"));
  const ruta = rutaDespiece(proyectoId);
  const a = await entrar(["ficha", "cotizaciones"]);
  if (typeof a === "string") volver(ruta, a);
  if (!proyectoId || !(await proyectoVisible(a, proyectoId))) volver("/admin/proyectos", "Ese proyecto no existe.");
  const id = txt(formData.get("id"));
  const { tenantId } = a;
  const r = await conTabla(() =>
    tenantTransaction(async (tx) => {
      const borradas = (await tx.tallerHora.deleteMany({ where: { id, tenantId, proyectoId } })).count;
      if (borradas > 0) await registrarCambio(tx, { tenantId, proyectoId, entidad: "TallerHora", entidadId: id, campo: "Horas", despues: "carga borrada", autor: a.nombre });
      return borradas > 0;
    }),
  );
  if (r === SIN_MIGRAR) volver(ruta, r);
  revalidatePath(`/admin/proyectos/${proyectoId}`);
  volver(ruta, r ? "Carga de horas borrada." : "Esa carga ya no estaba.");
}
