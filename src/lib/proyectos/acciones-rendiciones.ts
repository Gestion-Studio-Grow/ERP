"use server";

// ============================================================================
// RENDÍ en MIA — cargar y revisar rendiciones (plan `docs/tenants/mia-producciones/PLAN-RENDI.md` §5.2).
// El negocio y la persona salen SIEMPRE de la sesión, nunca del formulario. Regla de caja: rendir, aprobar y rechazar
// NO asientan nada (la plata salió del bolsillo de la persona o de un anticipo ya asentado); el reintegro es la tanda 3.
// Si la migración `20261104121000_rendiciones` no está aplicada, cada acción lo dice en criollo, sin un 500.
// ============================================================================

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { auditAdmin } from "@/lib/audit-core";
import { aplicarAccion } from "@/lib/rendiciones/rendicion";
import { formatearPesos } from "@/lib/rendiciones/dinero";
import type { Prisma } from "@/generated/prisma/client";
import { actorActual, avisar, proyectoVisible, registrarCambio, usuariosDeLaPlata, type Actor } from "./gestion.server";
import { cierreDeAnticipo, leerMontoArgentino, motivoNoMuevePlata, rendicionDelMotor } from "./rendiciones-core";
import { MEDIOS, metodoDeCaja, type MedioPago } from "./core";
import { marcaDeGastoProyecto } from "./marcas";
import { transferenciaEnElLibroTx } from "@/lib/caja/transferencia-en-el-libro";
import type { RolActor } from "@/lib/rendiciones/tipos";
import { ESTADO_RENDICION_LABEL, MAX_COMPROBANTES_MES, SIN_MIGRACION, actorDelMotor, inicioDelMesArgentino, decidirRevision, claveValida, esClaveRepetida, faltaLaMigracion, leerRendicion, medioDelMotor, motivoNoRinde, type AccionDeRevision } from "./rendiciones-core";

export type ResultadoRendicion = { ok: true; repetida?: boolean } | { ok: false; error: string };

const RAIZ = "/admin/proyectos";
const MAX_FOTO = 1_400_000; // caracteres del data URL: la foto llega achicada del teléfono
const MAX_COMPROBANTES = 300; // por proyecto: los comprobantes viven en la base como imagen achicada

const txt = (v: FormDataEntryValue | null): string => String(v ?? "").trim();
const fotoValida = (d: string): boolean => /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(d) && d.length <= MAX_FOTO;

/**
 * La clave del envío → el id del gasto. El mismo envío dos veces (doble toque, reintento de la red) cae en el mismo id y
 * la base lo frena: una sola rendición. Atada al negocio y a la persona: no choca con la de otro.
 */
function idDelGastoRendido(tenantId: string, userId: string, clave: string): string | null {
  if (!claveValida(clave)) return null;
  return `rnd${createHash("sha256").update(`${tenantId}|${userId}|${clave}`).digest("hex").slice(0, 28)}`;
}

function refrescar(proyectoId: string) {
  revalidatePath(`${RAIZ}/${proyectoId}`);
  revalidatePath(`${RAIZ}/mi-liquidacion/rendiciones`);
}

/** Corre la acción y traduce «falta la migración» a un mensaje claro. Lo demás sigue su camino. */
async function conMigracion(fn: () => Promise<ResultadoRendicion>): Promise<ResultadoRendicion> {
  try {
    return await fn();
  } catch (e) {
    if (faltaLaMigracion(e)) return { ok: false, error: SIN_MIGRACION };
    throw e;
  }
}

/**
 * Rendir un gasto propio: crea el gasto del proyecto YA PAGADO por la persona (sin egreso de caja: no salió de la
 * caja), su rendición «para revisar» y la foto del comprobante. El campo `clave` del formulario hace que el mismo
 * envío dos veces sea una sola rendición.
 */
export async function rendirGasto(formData: FormData): Promise<ResultadoRendicion> {
  const a = await actorActual();
  const { tenantId, user } = a;
  const proyectoId = txt(formData.get("proyectoId"));
  if (!(await proyectoVisible(a, proyectoId))) return { ok: false, error: "Ese proyecto no existe." };
  const enEquipo = a.personaId ? !!(await prisma.proyectoEquipo.findFirst({ where: { tenantId, proyectoId, personaId: a.personaId }, select: { id: true } })) : false;
  const noRinde = motivoNoRinde(a.rol, a.personaId, enEquipo);
  if (noRinde) return { ok: false, error: noRinde };
  const personaId = a.personaId!;
  const leido = leerRendicion({ descripcion: txt(formData.get("descripcion")), rubro: txt(formData.get("rubro")), monto: txt(formData.get("monto")), medio: txt(formData.get("medio")), anticipoId: txt(formData.get("anticipoId")), fecha: txt(formData.get("fecha")) });
  if (!leido.ok) return leido;
  const d = leido.datos;
  const foto = txt(formData.get("foto"));
  if (!foto) return { ok: false, error: "Sacale una foto al comprobante (o subila de la galería)." };
  if (!fotoValida(foto)) return { ok: false, error: "La foto es demasiado pesada o no es una imagen. Probá de nuevo." };
  const gastoId = idDelGastoRendido(tenantId, user.id, txt(formData.get("clave")));
  if (!gastoId) return { ok: false, error: "El formulario venció. Recargá la página y cargalo de nuevo." };

  return conMigracion(async () => {
    if (await prisma.proyectoGasto.findFirst({ where: { id: gastoId, tenantId }, select: { id: true } })) return { ok: true, repetida: true };
    if (d.medio === "ANTICIPO") {
      // Un anticipo SUYO y abierto, de este proyecto o sin proyecto. El id del formulario no alcanza.
      const anticipo = await prisma.proyectoAnticipo.findFirst({ where: { id: d.anticipoId!, tenantId, personaId, estado: "ENTREGADO", OR: [{ proyectoId: null }, { proyectoId }] }, select: { id: true } });
      if (!anticipo) return { ok: false, error: "Ese anticipo no es tuyo o ya está cerrado." };
    }
    if ((await prisma.proyectoArchivo.count({ where: { tenantId, proyectoId, tipo: "COMPROBANTE" } })) >= MAX_COMPROBANTES) {
      return { ok: false, error: `Este proyecto ya tiene ${MAX_COMPROBANTES} comprobantes. Avisale a Administración.` };
    }
    const ahora = new Date();
    // Tope por negocio por mes: las fotos viven en la base (Neon free). Provisional a confirmar.
    if ((await prisma.proyectoArchivo.count({ where: { tenantId, tipo: "COMPROBANTE", createdAt: { gte: inicioDelMesArgentino(ahora) } } })) >= MAX_COMPROBANTES_MES) {
      return { ok: false, error: `Este mes el negocio ya cargó ${MAX_COMPROBANTES_MES} comprobantes, el máximo por ahora. Avisale a Dirección para ampliarlo.` };
    }
    const actorId = actorDelMotor({ personaId, userId: user.id });
    const enviada = aplicarAccion(
      { id: "", gastoId, rindeId: personaId, medio: medioDelMotor(d.medio), ...(d.anticipoId ? { anticipoId: d.anticipoId } : {}), montoCentavos: d.montoCentavos, estado: "borrador", eventos: [] },
      "enviar",
      { fecha: ahora.toISOString(), actorId, rolActor: a.rol },
    );
    if (!enviada.ok) return { ok: false, error: `${enviada.motivo}.` };
    const neto = d.montoCentavos / 100;
    try {
      await tenantTransaction(async (tx) => {
        if (d.medio === "ANTICIPO") {
          // Toma el anticipo: si lo están cerrando ahora, esta rendición espera y, si quedó cerrado, no entra.
          const vivo = await tx.proyectoAnticipo.updateMany({ where: { id: d.anticipoId!, tenantId, personaId, estado: "ENTREGADO" }, data: { estado: "ENTREGADO" } });
          if (vivo.count === 0) throw new AnticipoCerrado();
        }
        await tx.proyectoGasto.create({
          data: {
            id: gastoId,
            tenantId,
            proyectoId,
            rubro: d.rubro,
            descripcion: d.descripcion,
            neto,
            iva: 0,
            fecha: d.fecha ? new Date(`${d.fecha}T12:00:00-03:00`) : ahora,
            comprobante: "Rendición",
            cargadoPor: a.nombre,
            // Pagado por la persona, no por la caja: así «Pagar» no lo vuelve a asentar. Sin CashMovement.
            pagadoEl: ahora,
            medio: "EFECTIVO",
            pagadoPor: `${a.nombre} (rendición)`,
          },
        });
        const archivo = await tx.proyectoArchivo.create({
          data: { tenantId, proyectoId, tipo: "COMPROBANTE", nombre: `Comprobante · ${d.descripcion}`.slice(0, 120), datos: foto, subidoPor: a.nombre },
          select: { id: true },
        });
        const r = await tx.proyectoRendicion.create({
          data: {
            tenantId,
            proyectoId,
            gastoId,
            personaId,
            medio: d.medio,
            anticipoId: d.anticipoId,
            montoCentavos: d.montoCentavos,
            archivoId: archivo.id,
            estado: enviada.rendicion.estado,
            eventos: enviada.rendicion.eventos as unknown as Prisma.InputJsonValue,
          },
          select: { id: true },
        });
        await registrarCambio(tx, { tenantId, proyectoId, entidad: "ProyectoRendicion", entidadId: r.id, campo: "Rendición", despues: `${d.descripcion} · ${formatearPesos(d.montoCentavos)} · ${d.medio === "PROPIO" ? "de su bolsillo" : "con anticipo"}`, autor: a.nombre });
        await avisar(tx, { tenantId, destinatarios: await usuariosDeLaPlata(tx, tenantId, user.id), tipo: "rendicion", texto: `${a.nombre} rindió ${formatearPesos(d.montoCentavos)}: ${d.descripcion}`, enlace: `${RAIZ}/${proyectoId}?tab=rendiciones` });
      });
    } catch (e) {
      if (e instanceof AnticipoCerrado) return { ok: false, error: "Ese anticipo ya está cerrado." };
      // El mismo envío llegó dos veces a la vez: la base dejó pasar uno solo.
      if (esClaveRepetida(e)) return { ok: true, repetida: true };
      throw e;
    }
    await auditAdmin({ action: "proyecto.rendicion.rendir", entity: "ProyectoGasto", entityId: gastoId, changes: { montoCentavos: d.montoCentavos, medio: d.medio } });
    refrescar(proyectoId);
    return { ok: true };
  });
}

async function revisar(accion: AccionDeRevision, formData: FormData): Promise<ResultadoRendicion> {
  const a: Actor = await actorActual();
  const { tenantId, user } = a;
  const id = txt(formData.get("id"));
  const comentario = txt(formData.get("comentario")).slice(0, 500);
  return conMigracion(async () => {
    // Del negocio de la sesión: la de otro negocio no existe.
    const f = await prisma.proyectoRendicion.findFirst({
      where: { id, tenantId },
      select: { id: true, gastoId: true, personaId: true, proyectoId: true, medio: true, anticipoId: true, montoCentavos: true, estado: true, eventos: true, persona: { select: { userId: true, nombre: true } }, gasto: { select: { descripcion: true, anuladoEl: true } } },
    });
    if (!f) return { ok: false, error: "Esa rendición no existe." };
    const ahora = new Date();
    const actorId = actorDelMotor({ personaId: a.personaId, userId: user.id });
    const dec = decidirRevision(f, accion, { rol: a.rol, actorId, fecha: ahora.toISOString(), comentario, actorUserId: user.id, rindeUserId: f.persona.userId });
    if (!dec.ok) return { ok: false, error: dec.error };
    if (accion === "aprobar" && f.gasto.anuladoEl) return { ok: false, error: "El gasto de esta rendición está anulado: no se puede aprobar. Rechazala." };
    const hecho = await tenantTransaction(async (tx) => {
      // El claim: si otro ya la movió (dos clics, dos pestañas), no pasa nada dos veces.
      const r = await tx.proyectoRendicion.updateMany({
        // Aprobar exige, dentro del mismo claim, que el gasto siga vivo (nadie lo anuló entre la lectura y acá).
        where: { id, tenantId, estado: dec.desde, ...(accion === "aprobar" ? { gasto: { anuladoEl: null } } : {}) },
        data: { estado: dec.hacia, eventos: dec.eventos as unknown as Prisma.InputJsonValue, ...(accion === "aprobar" ? { aprobadoPor: a.nombre, aprobadoEl: ahora } : {}) },
      });
      if (r.count === 0) return false;
      // Rechazar anula el gasto del proyecto. Sin caja: nunca se asentó un egreso por él.
      if (accion === "rechazar") await tx.proyectoGasto.updateMany({ where: { id: f.gastoId, tenantId, anuladoEl: null }, data: { anuladoEl: ahora, anuladoPor: a.nombre } });
      await registrarCambio(tx, { tenantId, proyectoId: f.proyectoId, entidad: "ProyectoRendicion", entidadId: id, campo: "Rendición", antes: ESTADO_RENDICION_LABEL[dec.desde], despues: `${ESTADO_RENDICION_LABEL[dec.hacia]}${comentario ? ` · ${comentario}` : ""}`, autor: a.nombre });
      if (f.persona.userId) {
        await avisar(tx, { tenantId, destinatarios: [f.persona.userId], tipo: "rendicion", texto: `Tu rendición «${f.gasto.descripcion}» quedó ${ESTADO_RENDICION_LABEL[dec.hacia].toLowerCase()}${comentario ? `: ${comentario}` : ""}`, enlace: `${RAIZ}/mi-liquidacion/rendiciones` });
      }
      return true;
    });
    if (!hecho) return { ok: false, error: "Alguien ya la revisó o anuló su gasto. Recargá para ver cómo quedó." };
    await auditAdmin({ action: `proyecto.rendicion.${accion}`, entity: "ProyectoRendicion", entityId: id, changes: { desde: dec.desde, hacia: dec.hacia } });
    refrescar(f.proyectoId);
    return { ok: true };
  });
}

export async function aprobarRendicion(formData: FormData): Promise<ResultadoRendicion> {
  return revisar("aprobar", formData);
}

export async function devolverRendicion(formData: FormData): Promise<ResultadoRendicion> {
  return revisar("devolver", formData);
}

export async function rechazarRendicion(formData: FormData): Promise<ResultadoRendicion> {
  return revisar("rechazar", formData);
}

// ── Tanda 3: reintegro directo y anticipos ──────────────────────────────────
// Regla de caja: el único egreso de un gasto PROPIO es su reintegro, por liquidación pagada o directo, nunca ambos. El
// claim de los dos caminos es el mismo (`liquidacionId IS NULL AND reintegradoEl IS NULL AND estado = 'aprobada'`).

const medioDelForm = (v: FormDataEntryValue | null): MedioPago | null => {
  const m = txt(v) || "TRANSFERENCIA";
  return (MEDIOS as readonly string[]).includes(m) ? (m as MedioPago) : null;
};

async function asentarTx(tx: Prisma.TransactionClient, tenantId: string, d: { type: "EGRESO" | "INGRESO"; medio: MedioPago; centavos: number; reason: string; marca: string; proyectoGastoId?: string; proyectoAnticipoId?: string }) {
  const session = await tx.cashSession.findFirst({ where: { tenantId, status: "OPEN" }, select: { id: true } });
  await tx.cashMovement.create({
    data: {
      tenantId,
      sessionId: session?.id ?? null,
      type: d.type,
      method: metodoDeCaja(d.medio, await transferenciaEnElLibroTx(tx)),
      amount: d.centavos / 100,
      reason: d.reason,
      createdBy: marcaDeGastoProyecto(d.marca),
      ...(d.proyectoGastoId ? { proyectoGastoId: d.proyectoGastoId } : {}),
      ...(d.proyectoAnticipoId ? { proyectoAnticipoId: d.proyectoAnticipoId } : {}),
    },
  });
}

/** Reintegrar ahora una rendición aprobada de su bolsillo, sin esperar la liquidación. Un egreso con `proyectoGastoId`. */
export async function reintegrarDirecto(formData: FormData): Promise<ResultadoRendicion> {
  const a = await actorActual();
  const { tenantId, user } = a;
  const id = txt(formData.get("id"));
  const medio = medioDelForm(formData.get("medio"));
  if (!medio) return { ok: false, error: "Elegí cómo se reintegra." };
  return conMigracion(async () => {
    const f = await prisma.proyectoRendicion.findFirst({
      where: { id, tenantId },
      select: { id: true, gastoId: true, personaId: true, proyectoId: true, medio: true, anticipoId: true, montoCentavos: true, estado: true, eventos: true, liquidacionId: true, persona: { select: { userId: true, nombre: true } }, gasto: { select: { descripcion: true } } },
    });
    if (!f) return { ok: false, error: "Esa rendición no existe." };
    const noMueve = motivoNoMuevePlata(a.rol, { personaId: a.personaId, userId: user.id }, { personaId: f.personaId, userId: f.persona.userId });
    if (noMueve) return { ok: false, error: noMueve };
    if (f.liquidacionId) return { ok: false, error: "Ya está en una liquidación: se reintegra cuando se pague." };
    const ahora = new Date();
    const res = aplicarAccion(rendicionDelMotor(f), "reintegrar", { fecha: ahora.toISOString(), actorId: actorDelMotor({ personaId: a.personaId, userId: user.id }), rolActor: a.rol as RolActor, comentario: "Reintegro directo" });
    if (!res.ok) return { ok: false, error: `${res.motivo}.` };
    const hecho = await tenantTransaction(async (tx) => {
      // El claim compartido con la liquidación: si una la reclamó (o otro clic la reintegró), acá no pasa nada.
      const r = await tx.proyectoRendicion.updateMany({
        where: { id, tenantId, medio: "PROPIO", estado: "aprobada", liquidacionId: null, reintegradoEl: null },
        data: { estado: "reintegrada", reintegradoEl: ahora, eventos: res.rendicion.eventos as unknown as Prisma.InputJsonValue },
      });
      if (r.count === 0) return false;
      await asentarTx(tx, tenantId, { type: "EGRESO", medio, centavos: f.montoCentavos, reason: `Reintegro · ${f.persona.nombre} · ${f.gasto.descripcion}`, marca: f.gastoId, proyectoGastoId: f.gastoId });
      await registrarCambio(tx, { tenantId, proyectoId: f.proyectoId, entidad: "ProyectoRendicion", entidadId: id, campo: "Rendición", antes: ESTADO_RENDICION_LABEL.aprobada, despues: `${ESTADO_RENDICION_LABEL.reintegrada} · ${formatearPesos(f.montoCentavos)}`, autor: a.nombre });
      if (f.persona.userId) await avisar(tx, { tenantId, destinatarios: [f.persona.userId], tipo: "rendicion", texto: `Te reintegramos ${formatearPesos(f.montoCentavos)} de «${f.gasto.descripcion}».`, enlace: `${RAIZ}/mi-liquidacion/rendiciones` });
      return true;
    });
    if (!hecho) return { ok: false, error: "Ya se reintegró o entró en una liquidación. Recargá para ver cómo quedó." };
    await auditAdmin({ action: "proyecto.rendicion.reintegrar", entity: "ProyectoRendicion", entityId: id, changes: { montoCentavos: f.montoCentavos, medio } });
    refrescar(f.proyectoId);
    return { ok: true };
  });
}

/**
 * Entregar un anticipo: el anticipo y su egreso van juntos (`proyectoAnticipoId` único por tipo). La `clave` del
 * formulario da el id: el mismo envío dos veces es un anticipo y un egreso.
 */
export async function entregarAnticipo(formData: FormData): Promise<ResultadoRendicion> {
  const a = await actorActual();
  const { tenantId, user } = a;
  const personaId = txt(formData.get("personaId"));
  const proyectoId = txt(formData.get("proyectoId")) || null;
  const medio = medioDelForm(formData.get("medio"));
  if (!medio) return { ok: false, error: "Elegí cómo se entrega." };
  const montoCentavos = leerMontoArgentino(txt(formData.get("monto"))) ?? 0;
  if (!(montoCentavos > 0) || !Number.isSafeInteger(montoCentavos) || montoCentavos > 100_000_000_00) return { ok: false, error: "Escribí cuánto se entrega: un importe mayor a cero." };
  const id = idDelGastoRendido(tenantId, user.id, txt(formData.get("clave")))?.replace(/^rnd/, "ant");
  if (!id) return { ok: false, error: "El formulario venció. Recargá la página y cargalo de nuevo." };
  return conMigracion(async () => {
    const p = await prisma.proyectoPersona.findFirst({ where: { id: personaId, tenantId, activa: true }, select: { id: true, nombre: true, userId: true } });
    if (!p) return { ok: false, error: "Esa persona no está en el equipo." };
    const noMueve = motivoNoMuevePlata(a.rol, { personaId: a.personaId, userId: user.id }, { personaId: p.id, userId: p.userId });
    if (noMueve) return { ok: false, error: noMueve };
    if (proyectoId && !(await prisma.proyecto.findFirst({ where: { id: proyectoId, tenantId }, select: { id: true } }))) return { ok: false, error: "Ese proyecto no existe." };
    if (await prisma.proyectoAnticipo.findFirst({ where: { id, tenantId }, select: { id: true } })) return { ok: true, repetida: true };
    try {
      await tenantTransaction(async (tx) => {
        await tx.proyectoAnticipo.create({ data: { id, tenantId, personaId: p.id, proyectoId, montoCentavos } });
        await asentarTx(tx, tenantId, { type: "EGRESO", medio, centavos: montoCentavos, reason: `Anticipo · ${p.nombre}`, marca: `anticipo-${id}`, proyectoAnticipoId: id });
        await registrarCambio(tx, { tenantId, proyectoId, entidad: "ProyectoAnticipo", entidadId: id, campo: "Anticipo", despues: `${p.nombre} · ${formatearPesos(montoCentavos)} · entregado`, autor: a.nombre });
        if (p.userId) await avisar(tx, { tenantId, destinatarios: [p.userId], tipo: "rendicion", texto: `Te entregamos un anticipo de ${formatearPesos(montoCentavos)}. Rendí los gastos con «Con un anticipo».`, enlace: `${RAIZ}/mi-liquidacion/rendiciones` });
      });
    } catch (e) {
      if (esClaveRepetida(e)) return { ok: true, repetida: true };
      throw e;
    }
    await auditAdmin({ action: "proyecto.anticipo.entregar", entity: "ProyectoAnticipo", entityId: id, changes: { montoCentavos, medio } });
    revalidatePath(`${RAIZ}/equipo`);
    if (proyectoId) refrescar(proyectoId);
    return { ok: true };
  });
}

/**
 * Cerrar un anticipo con la cuadratura: sobrante → INGRESO «devolución de anticipo»; faltante → EGRESO de reintegro.
 * No se cierra con rendiciones sin revisar. El claim `estado = ENTREGADO` hace que dos clics cierren una vez.
 */
export async function cerrarAnticipo(formData: FormData): Promise<ResultadoRendicion> {
  const a = await actorActual();
  const { tenantId, user } = a;
  const id = txt(formData.get("id"));
  const medio = medioDelForm(formData.get("medio"));
  if (!medio) return { ok: false, error: "Elegí el medio." };
  return conMigracion(async () => {
    const an = await prisma.proyectoAnticipo.findFirst({ where: { id, tenantId }, select: { id: true, personaId: true, proyectoId: true, montoCentavos: true, devueltoCentavos: true, reintegradoCentavos: true, estado: true, persona: { select: { nombre: true, userId: true } } } });
    if (!an) return { ok: false, error: "Ese anticipo no existe." };
    const noMueve = motivoNoMuevePlata(a.rol, { personaId: a.personaId, userId: user.id }, { personaId: an.personaId, userId: an.persona.userId });
    if (noMueve) return { ok: false, error: noMueve };
    if (an.estado === "CERRADO") return { ok: false, error: "Este anticipo ya está cerrado." };
    const resultado = await tenantTransaction(async (tx) => {
      // Toma el anticipo: mientras tanto nadie rinde contra él ni lo cierra otra vez.
      const r = await tx.proyectoAnticipo.updateMany({ where: { id, tenantId, estado: { not: "CERRADO" } }, data: { estado: "CERRADO" } });
      if (r.count === 0) return { ok: false as const, error: "Este anticipo ya está cerrado." };
      const filas = await tx.proyectoRendicion.findMany({ where: { tenantId, anticipoId: id }, select: { id: true, gastoId: true, personaId: true, medio: true, anticipoId: true, montoCentavos: true, estado: true, eventos: true } });
      const c = cierreDeAnticipo(an, filas);
      if (!c.ok) throw new NoCierra(c.error);
      if (c.aDevolver > 0) await asentarTx(tx, tenantId, { type: "INGRESO", medio, centavos: c.aDevolver, reason: `Devolución de anticipo · ${an.persona.nombre}`, marca: `anticipo-${id}`, proyectoAnticipoId: id });
      // El faltante no lleva `proyectoAnticipoId` (el EGRESO de esa clave es la entrega): lo protege el claim de arriba.
      if (c.aReintegrar > 0) await asentarTx(tx, tenantId, { type: "EGRESO", medio, centavos: c.aReintegrar, reason: `Reintegro de anticipo · ${an.persona.nombre}`, marca: `anticipo-${id}-reintegro` });
      await tx.proyectoAnticipo.updateMany({ where: { id, tenantId }, data: { devueltoCentavos: { increment: c.aDevolver }, reintegradoCentavos: { increment: c.aReintegrar } } });
      await registrarCambio(tx, { tenantId, proyectoId: an.proyectoId, entidad: "ProyectoAnticipo", entidadId: id, campo: "Anticipo", antes: "entregado", despues: `cerrado · ${c.mensaje}`, autor: a.nombre });
      if (an.persona.userId) await avisar(tx, { tenantId, destinatarios: [an.persona.userId], tipo: "rendicion", texto: `Cerramos tu anticipo: ${c.mensaje}`, enlace: `${RAIZ}/mi-liquidacion/rendiciones` });
      return { ok: true as const, aDevolver: c.aDevolver, aReintegrar: c.aReintegrar };
    }).catch((e) => {
      if (e instanceof NoCierra) return { ok: false as const, error: e.message };
      throw e;
    });
    if (!resultado.ok) return resultado;
    await auditAdmin({ action: "proyecto.anticipo.cerrar", entity: "ProyectoAnticipo", entityId: id, changes: { aDevolver: resultado.aDevolver, aReintegrar: resultado.aReintegrar, medio } });
    revalidatePath(`${RAIZ}/equipo`);
    if (an.proyectoId) refrescar(an.proyectoId);
    return { ok: true };
  });
}

class NoCierra extends Error {}
class AnticipoCerrado extends Error {}
