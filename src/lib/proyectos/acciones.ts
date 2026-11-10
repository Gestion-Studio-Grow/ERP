"use server";

// ============================================================================
// PROYECTOS — escrituras. Cada acción vuelve a pedir el permiso de su módulo y que el proyecto sea visible
// para esta persona: esconder un botón no protege nada.
// ============================================================================

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapabilityFueraDeLaAgenda } from "@/lib/authz";
import { auditAdmin, auditPublic } from "@/lib/audit-core";
import { transferenciaEnElLibroTx } from "@/lib/caja/transferencia-en-el-libro";
import type { Prisma } from "@/generated/prisma/client";
import { clientePuedeResponder, fechaCorta, leerNumero, MEDIO_LABEL, pesos, esEtapa, esServicio, etapaAlAprobar, etapaLabel, etapasDe, MEDIOS, metodoDeCaja, precioConMargen, redondear, sePuedeEditar, sumarDias, type MedioPago } from "./core";
import { bloqueoDeEliminar, computar, costosVigentes, COSTO_LABEL, disenoInicial, normalizarDiseno, TIPOS_STAND, type ClaveCosto, type DisenoStand } from "./stand";
import { configProyectos } from "./datos.server";
import { cobranzasDelNegocio, tiposDeCambio, trabarCobranza } from "./cobranza.server";
import { pasaElTope } from "./cobranza-core";
import { actorActual, avisar, proyectoVisible, puede, regenerarCuotas, registrarCambio, usuariosDelEquipo, usuariosDeLaPlata, type Actor } from "./gestion.server";
import type { ModuloGestion } from "./gestion-core";
import { marcaDeGastoProyecto } from "./marcas";
import { mensajeDeProveedor, validateSupplierInput } from "@/lib/suppliers/supplier";

export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const RAIZ = "/admin/proyectos";
const MAX_ARCHIVOS = 30;
const MAX_IMAGEN = 1_400_000; // caracteres del data URL (~1 MB de imagen)
const MAX_ENTREGABLES = 60;
const MAX_VERSIONES = 12; // cada imagen ocupa la base: un tope, como los archivos

const txt = (v: FormDataEntryValue | null): string => String(v ?? "").trim();
const numero = (v: FormDataEntryValue | null | undefined): number => leerNumero(String(v ?? ""));
const fecha = (v: FormDataEntryValue | null): Date | null => {
  const s = txt(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T12:00:00-03:00`);
};
const token = () => randomBytes(18).toString("base64url");
const imagenValida = (d: unknown): d is string => typeof d === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(d) && d.length <= MAX_IMAGEN;
const urlValida = (u: string): boolean => {
  try {
    return new URL(u).protocol === "https:";
  } catch {
    return false;
  }
};

function refrescar(id?: string) {
  revalidatePath(RAIZ);
  if (id) revalidatePath(`${RAIZ}/${id}`);
}

/** El permiso de cualquiera de estos módulos. Esconder un botón no protege nada. */
async function actorCon(modulos: readonly ModuloGestion[]): Promise<Actor> {
  const a = await actorActual();
  if (!modulos.some((m) => puede(a, m, "editar"))) throw new Error("No tenés permiso para hacer esto.");
  return a;
}

/** Todo lo que cuelga de un proyecto arranca comprobando que esta persona lo puede ver: un proyecto ajeno no existe. */
const proyectoDelActor = (a: Actor, id: string) => proyectoVisible(a, id);

// ── Proyecto ────────────────────────────────────────────────────────────────

// ── Tareas ──────────────────────────────────────────────────────────────────

export async function agregarTarea(formData: FormData) {
  const a = await actorCon(["ficha", "diseno"]);
  const { tenantId } = a;
  const proyectoId = txt(formData.get("proyectoId"));
  const titulo = txt(formData.get("titulo"));
  if (!titulo || !(await proyectoDelActor(a, proyectoId))) return;
  const personaId = txt(formData.get("personaId"));
  const miembro = personaId ? await prisma.proyectoEquipo.findFirst({ where: { tenantId, proyectoId, personaId }, select: { persona: { select: { nombre: true, userId: true } } } }) : null;
  const venceEl = fecha(formData.get("venceEl"));
  await prisma.proyectoTarea.create({
    data: { tenantId, proyectoId, titulo, personaId: miembro ? personaId : null, responsable: miembro?.persona.nombre ?? null, venceEl },
  });
  await registrarCambio(prisma, { tenantId, proyectoId, entidad: "Tarea", entidadId: proyectoId, campo: "alta", despues: titulo, autor: a.nombre });
  if (miembro?.persona.userId && miembro.persona.userId !== a.user.id) {
    await avisar(prisma, { tenantId, destinatarios: [miembro.persona.userId], tipo: "tarea", texto: `Te asignaron la tarea ${titulo}${venceEl ? `, vence el ${fechaCorta(venceEl)}` : ""}`, enlace: `${RAIZ}/${proyectoId}?tab=seguimiento` });
  }
  refrescar(proyectoId);
}

export async function alternarTarea(formData: FormData) {
  const a = await actorCon(["ficha", "diseno"]);
  const { tenantId } = a;
  const id = txt(formData.get("id"));
  const t = await prisma.proyectoTarea.findFirst({ where: { id, tenantId }, select: { proyectoId: true, hechaEl: true } });
  if (!t || !(await proyectoDelActor(a, t.proyectoId))) return;
  // El estado va con la marca: si no, una tarea hecha sigue en «Por hacer» del tablero.
  await prisma.proyectoTarea.updateMany({ where: { id, tenantId }, data: t.hechaEl ? { hechaEl: null, estado: "POR_HACER" } : { hechaEl: new Date(), estado: "APROBADA" } });
  refrescar(t.proyectoId);
}

export async function borrarTarea(formData: FormData) {
  const a = await actorCon(["ficha", "diseno"]);
  const { tenantId } = a;
  const id = txt(formData.get("id"));
  const t = await prisma.proyectoTarea.findFirst({ where: { id, tenantId }, select: { proyectoId: true, titulo: true } });
  if (!t || !(await proyectoDelActor(a, t.proyectoId))) return;
  await prisma.proyectoTarea.deleteMany({ where: { id, tenantId } });
  await registrarCambio(prisma, { tenantId, proyectoId: t.proyectoId, entidad: "Tarea", entidadId: id, campo: "baja", antes: t.titulo, autor: a.nombre });
  refrescar(t.proyectoId);
}

// ── Archivos ────────────────────────────────────────────────────────────────

/** Imagen ya achicada en el navegador, o link a lo pesado (PDF, CAD, video) en la nube del negocio. */
export async function agregarArchivo(d: {
  proyectoId: string;
  tipo: string;
  nombre: string;
  datos?: string | null;
  url?: string | null;
  visibleCliente?: boolean;
}): Promise<Resultado<{ id: string }>> {
  const actor = await actorCon(["ficha", "diseno"]);
  const { user, tenantId } = actor;
  if (!(await proyectoDelActor(actor, d.proyectoId))) return { ok: false, error: "Ese proyecto no existe." };
  const tipo = ["RENDER", "DISENO", "PLANO", "REFERENCIA", "OTRO"].includes(d.tipo) ? d.tipo : "OTRO";
  const nombre = (d.nombre ?? "").trim().slice(0, 120) || "Archivo";
  const url = (d.url ?? "").trim();
  if (d.datos ? !imagenValida(d.datos) : !urlValida(url)) {
    return { ok: false, error: d.datos ? "La imagen es demasiado pesada o no es válida." : "Pegá un link que empiece con https://." };
  }
  const cuantos = await prisma.proyectoArchivo.count({ where: { tenantId, proyectoId: d.proyectoId, clave: null, tipo: { not: "COMPROBANTE" } } });
  if (cuantos >= MAX_ARCHIVOS) return { ok: false, error: `Un proyecto guarda hasta ${MAX_ARCHIVOS} archivos. Sacá alguno que ya no uses.` };
  const a = await prisma.proyectoArchivo.create({
    data: { tenantId, proyectoId: d.proyectoId, tipo, nombre, datos: d.datos || null, url: d.datos ? null : url, visibleCliente: !!d.visibleCliente && !!d.datos, subidoPor: user.name },
    select: { id: true },
  });
  refrescar(d.proyectoId);
  return { ok: true, id: a.id };
}

// ── Presupuesto ─────────────────────────────────────────────────────────────

async function presupuestoDelNegocio(id: string, tenantId: string) {
  return prisma.proyectoPresupuesto.findFirst({ where: { id, tenantId }, select: { id: true, proyectoId: true, estado: true, version: true } });
}

/** El cliente responde desde su link, sin login: la llave es el token y sólo vale una vez. */
export async function responderPropuesta(d: { token: string; aprueba: boolean; nombre: string; motivo?: string }): Promise<Resultado> {
  const tenantId = await getCurrentTenantId();
  if (!/^[A-Za-z0-9_-]{20,}$/.test(d.token ?? "")) return { ok: false, error: "El link no es válido." };
  const nombre = (d.nombre ?? "").trim().slice(0, 120);
  if (!nombre) return { ok: false, error: "Escribí tu nombre para dejar constancia." };
  if (!d.aprueba && !(d.motivo ?? "").trim()) return { ok: false, error: "Contanos qué hay que cambiar." };
  const pr = await prisma.proyectoPresupuesto.findFirst({
    where: { tenantId, token: d.token },
    select: { id: true, estado: true, version: true, validoHasta: true, proyectoId: true, proyecto: { select: { nombre: true, servicio: true, etapa: true } } },
  });
  if (!pr) return { ok: false, error: "El link no es válido." };
  if (!clientePuedeResponder(pr)) return { ok: false, error: "Esta propuesta ya no se puede responder. Escribinos y la actualizamos." };
  const destinatarios = await usuariosDelEquipo(tenantId, pr.proyectoId, "");
  const ganada = await tenantTransaction(async (tx) => {
    // El estado va en el where: dos clics a la vez no responden dos veces.
    const r = await tx.proyectoPresupuesto.updateMany({
      where: { id: pr.id, tenantId, estado: "ENVIADO" },
      data: { estado: d.aprueba ? "APROBADO" : "RECHAZADO", respondidoEl: new Date(), respondidoPor: nombre, motivoRechazo: d.aprueba ? null : (d.motivo ?? "").trim().slice(0, 500) || null },
    });
    if (r.count === 0) return false;
    const autor = `${nombre} (cliente)`;
    await registrarCambio(tx, { tenantId, proyectoId: pr.proyectoId, entidad: "Presupuesto", entidadId: pr.id, campo: `Versión ${pr.version}`, antes: "Enviada", despues: d.aprueba ? "Aprobada" : "Rechazada", autor });
    if (d.aprueba) {
      const etapa = etapaAlAprobar(pr.proyecto.servicio, pr.proyecto.etapa);
      await tx.proyecto.updateMany({ where: { id: pr.proyectoId, tenantId }, data: { etapa } });
      await registrarCambio(tx, { tenantId, proyectoId: pr.proyectoId, entidad: "Proyecto", entidadId: pr.proyectoId, campo: "Etapa", antes: etapaLabel(pr.proyecto.etapa, pr.proyecto.servicio), despues: etapaLabel(etapa, pr.proyecto.servicio), autor });
    }
    await avisar(tx, { tenantId, destinatarios, tipo: "aprobacion", texto: `${nombre} ${d.aprueba ? "aprobó" : "rechazó"} la versión ${pr.version} de ${pr.proyecto.nombre}`, enlace: `/admin/proyectos/${pr.proyectoId}?tab=cotizacion` });
    return true;
  });
  if (!ganada) return { ok: false, error: "Esta propuesta ya fue respondida." };
  // Confirmado: de acá salen los cobros y los pagos.
  if (d.aprueba) await regenerarCuotas(tenantId, pr.proyectoId);
  await auditPublic({ action: d.aprueba ? "proyecto.propuesta.aprobar" : "proyecto.propuesta.rechazar", entity: "ProyectoPresupuesto", entityId: pr.id, changes: { nombre } });
  revalidatePath(`/propuesta/${d.token}`);
  refrescar(pr.proyectoId);
  return { ok: true };
}

// ── Cobros ──────────────────────────────────────────────────────────────────

export async function registrarCobro(formData: FormData): Promise<Resultado> {
  const a = await actorCon(["pagos"]);
  const { user, tenantId } = a;
  const proyectoId = txt(formData.get("proyectoId"));
  const medio = txt(formData.get("medio")) as MedioPago;
  const monto = redondear(numero(formData.get("monto")));
  if (!MEDIOS.includes(medio)) return { ok: false, error: "Elegí el medio de cobro." };
  if (!(monto > 0)) return { ok: false, error: "Escribí el monto del cobro." };
  if (!(await proyectoDelActor(a, proyectoId))) return { ok: false, error: "Ese proyecto no existe." };
  const p = await prisma.proyecto.findFirst({ where: { id: proyectoId, tenantId }, select: { numero: true, nombre: true } });
  if (!p) return { ok: false, error: "Ese proyecto ya no existe. Recargá la página." };
  const nota = txt(formData.get("nota")) || null;
  const [config, tc] = await Promise.all([configProyectos(tenantId), tiposDeCambio(tenantId)]);
  // El cobro y su asiento en el libro de caja van juntos: o entran los dos o ninguno.
  const pago = await tenantTransaction(async (tx): Promise<{ id: string } | { porCobrar: number }> => {
    // Tope: con presupuesto aprobado no entra más de lo que falta cobrar. En fila con «Marcar cobrado» y las cuotas
    // cargadas a mano del mismo proyecto, y contado adentro de la transacción (dos cobros a la vez no pasan los dos).
    await trabarCobranza(tx, tenantId, proyectoId);
    const cob = (await cobranzasDelNegocio(tenantId, tc, config.margenPct, [proyectoId], tx)).get(proyectoId);
    if (cob && pasaElTope(cob, monto)) return { porCobrar: cob.porCobrar };
    const creado = await tx.proyectoPago.create({ data: { tenantId, proyectoId, medio, monto, nota, cobradoPor: user.name }, select: { id: true } });
    await registrarCambio(tx, { tenantId, proyectoId, entidad: "ProyectoPago", entidadId: creado.id, campo: "Cobro", despues: `${MEDIO_LABEL[medio]} · ${pesos(monto)}`, autor: user.name });
    const session = await tx.cashSession.findFirst({ where: { tenantId, status: "OPEN" }, select: { id: true } });
    await tx.cashMovement.create({
      data: {
        tenantId,
        sessionId: session?.id ?? null,
        type: "VENTA",
        method: metodoDeCaja(medio, await transferenciaEnElLibroTx(tx)),
        amount: monto,
        reason: `Proyecto #${p.numero} · ${p.nombre}${medio === "CHEQUE" ? " · Cheque" : ""}${nota ? ` · ${nota}` : ""}`,
        proyectoPagoId: creado.id,
        createdBy: user.name,
      },
    });
    return creado;
  });
  // Pasaba lo que falta cobrar: no se graba nada.
  if (!("id" in pago)) return { ok: false, error: `Pasa lo que falta cobrar: quedan ${pesos(pago.porCobrar)} y el cobro es de ${pesos(monto)}.` };
  await auditAdmin({ action: "proyecto.cobro", entity: "ProyectoPago", entityId: pago.id, changes: { monto, medio } });
  refrescar(proyectoId);
  return { ok: true };
}

// ── Gastos reales y proveedores ────────────────────────────────────────────

type PagoDeGasto = { id: string; neto: number; iva: number; descripcion: string };

/** El pago de un gasto y su asiento van juntos. La marca le dice al libro que lo asentó el sistema. */
async function asentarPagoDeGastoTx(tx: Prisma.TransactionClient, tenantId: string, gasto: PagoDeGasto, numero: number, medio: MedioPago, proveedor: string | null) {
  const session = await tx.cashSession.findFirst({ where: { tenantId, status: "OPEN" }, select: { id: true } });
  await tx.cashMovement.create({
    data: {
      tenantId,
      sessionId: session?.id ?? null,
      type: "EGRESO",
      method: metodoDeCaja(medio, await transferenciaEnElLibroTx(tx)),
      amount: redondear(gasto.neto + gasto.iva),
      reason: `Proyecto #${numero} · ${gasto.descripcion}${proveedor ? ` · ${proveedor}` : ""}${medio === "CHEQUE" ? " · Cheque" : ""}`,
      proyectoGastoId: gasto.id,
      createdBy: marcaDeGastoProyecto(gasto.id),
    },
  });
}

export async function registrarGasto(formData: FormData): Promise<Resultado> {
  const a = await actorCon(["pagos"]);
  const { user, tenantId } = a;
  const proyectoId = txt(formData.get("proyectoId"));
  if (!(await proyectoDelActor(a, proyectoId))) return { ok: false, error: "Ese proyecto no existe." };
  const p = await prisma.proyecto.findFirst({ where: { id: proyectoId, tenantId }, select: { numero: true, nombre: true } });
  if (!p) return { ok: false, error: "Ese proyecto no existe." };
  const descripcion = txt(formData.get("descripcion")).slice(0, 200);
  if (!descripcion) return { ok: false, error: "Escribí qué se pagó o qué se debe." };
  const neto = redondear(numero(formData.get("neto")));
  if (!(neto > 0)) return { ok: false, error: "Escribí el importe neto, sin IVA." };
  const ivaTexto = txt(formData.get("iva"));
  const iva = ivaTexto ? redondear(numero(formData.get("iva"))) : 0;
  if (!(iva >= 0)) return { ok: false, error: "El IVA no se entiende: escribilo como un número." };
  const pagado = formData.get("pagado") === "on";
  const medio = txt(formData.get("medio")) as MedioPago;
  if (pagado && !MEDIOS.includes(medio)) return { ok: false, error: "Elegí cómo se pagó." };
  const proveedor = txt(formData.get("proveedor")).slice(0, 120);
  const gasto = await tenantTransaction(async (tx) => {
    // El proveedor se escribe como se lo conoce: si ya está, es ése; si no, queda sumado.
    const existente = proveedor
      ? await tx.supplier.findFirst({ where: { tenantId, name: { equals: proveedor, mode: "insensitive" } }, select: { id: true, name: true } })
      : null;
    const elegido = existente ?? (proveedor ? await tx.supplier.create({ data: { tenantId, name: proveedor }, select: { id: true, name: true } }) : null);
    const creado = await tx.proyectoGasto.create({
      data: {
        tenantId,
        proyectoId,
        supplierId: elegido?.id ?? null,
        rubro: txt(formData.get("rubro")).slice(0, 60) || "General",
        descripcion,
        neto,
        iva,
        fecha: fecha(formData.get("fecha")) ?? new Date(),
        comprobante: txt(formData.get("comprobante")).slice(0, 60) || null,
        cargadoPor: user.name,
        ...(pagado && { pagadoEl: new Date(), medio, pagadoPor: user.name }),
      },
      select: { id: true, neto: true, iva: true, descripcion: true },
    });
    await registrarCambio(tx, { tenantId, proyectoId, entidad: "ProyectoGasto", entidadId: creado.id, campo: "Costo real", despues: `${descripcion} · ${pesos(neto)}${pagado ? " · pagado" : ""}`, autor: user.name });
    if (pagado) await asentarPagoDeGastoTx(tx, tenantId, creado, p.numero, medio, elegido?.name ?? null);
    return creado;
  });
  await auditAdmin({ action: "proyecto.gasto", entity: "ProyectoGasto", entityId: gasto.id, changes: { neto, iva, pagado } });
  refrescar(proyectoId);
  revalidatePath(`${RAIZ}/proveedores`);
  return { ok: true };
}

export async function pagarGasto(formData: FormData) {
  const a = await actorCon(["pagos", "proveedores"]);
  const { user, tenantId } = a;
  const id = txt(formData.get("id"));
  const medio = txt(formData.get("medio")) as MedioPago;
  if (!MEDIOS.includes(medio)) return;
  const g = await prisma.proyectoGasto.findFirst({
    where: { id, tenantId },
    select: { id: true, neto: true, iva: true, descripcion: true, proyectoId: true, proyecto: { select: { numero: true } }, supplier: { select: { name: true } } },
  });
  if (!g) return;
  await tenantTransaction(async (tx) => {
    // Dos clics, o dos pestañas, no pagan dos veces.
    const r = await tx.proyectoGasto.updateMany({ where: { id, tenantId, pagadoEl: null, anuladoEl: null }, data: { pagadoEl: new Date(), medio, pagadoPor: user.name } });
    if (r.count === 0) return;
    await registrarCambio(tx, { tenantId, proyectoId: g.proyectoId, entidad: "ProyectoGasto", entidadId: id, campo: "Costo real pagado", despues: `${g.descripcion} · ${MEDIO_LABEL[medio]}`, autor: user.name });
    await asentarPagoDeGastoTx(tx, tenantId, g, g.proyecto.numero, medio, g.supplier?.name ?? null);
  });
  await auditAdmin({ action: "proyecto.gasto.pagar", entity: "ProyectoGasto", entityId: id, changes: { medio } });
  refrescar(g.proyectoId);
  revalidatePath(`${RAIZ}/proveedores`);
}

// ── Entregables ─────────────────────────────────────────────────────────────

export async function crearEntregable(formData: FormData) {
  const a = await actorCon(["diseno"]);
  const { tenantId } = a;
  const proyectoId = txt(formData.get("proyectoId"));
  const nombre = txt(formData.get("nombre")).slice(0, 120);
  if (!nombre || !(await proyectoDelActor(a, proyectoId))) return;
  if ((await prisma.proyectoEntregable.count({ where: { tenantId, proyectoId, anuladoEl: null } })) >= MAX_ENTREGABLES) return;
  await prisma.proyectoEntregable.create({
    data: { tenantId, proyectoId, nombre, especificacion: txt(formData.get("especificacion")).slice(0, 300), venceEl: fecha(formData.get("venceEl")) },
  });
  refrescar(proyectoId);
}

export async function guardarEntregable(formData: FormData) {
  const a = await actorCon(["diseno"]);
  const { tenantId } = a;
  const id = txt(formData.get("id"));
  const nombre = txt(formData.get("nombre")).slice(0, 120);
  const e = await prisma.proyectoEntregable.findFirst({ where: { id, tenantId }, select: { proyectoId: true } });
  if (!e || !nombre || !(await proyectoDelActor(a, e.proyectoId))) return;
  await prisma.proyectoEntregable.updateMany({
    where: { id, tenantId },
    data: { nombre, especificacion: txt(formData.get("especificacion")).slice(0, 300), venceEl: fecha(formData.get("venceEl")) },
  });
  refrescar(e.proyectoId);
  revalidatePath(`${RAIZ}/${e.proyectoId}/entregable/${id}`);
}

/** Sale del link del cliente, pero lo que respondió queda como constancia. */
export async function anularEntregable(formData: FormData) {
  const a = await actorCon(["diseno"]);
  const { user, tenantId } = a;
  const id = txt(formData.get("id"));
  const e = await prisma.proyectoEntregable.findFirst({ where: { id, tenantId }, select: { proyectoId: true, nombre: true } });
  if (!e || !(await proyectoDelActor(a, e.proyectoId))) return;
  const r = await prisma.proyectoEntregable.updateMany({ where: { id, tenantId, anuladoEl: null }, data: { anuladoEl: new Date(), anuladoPor: user.name } });
  if (r.count > 0) await auditAdmin({ action: "proyecto.entregable.anular", entity: "ProyectoEntregable", entityId: id, changes: { nombre: e.nombre } });
  refrescar(e.proyectoId);
  // La ficha de una pieza sacada ya no existe: se vuelve al proyecto.
  redirect(`${RAIZ}/${e.proyectoId}`);
}

/** Imagen ya achicada en el navegador, o link a lo pesado. Si ya hay un borrador, se reemplaza: hay uno solo por pieza. */
export async function subirVersion(d: { entregableId: string; datos?: string | null; url?: string | null; nota?: string }): Promise<Resultado> {
  const a = await actorCon(["diseno"]);
  const { user, tenantId } = a;
  const e = await prisma.proyectoEntregable.findFirst({
    where: { id: String(d.entregableId ?? ""), tenantId, anuladoEl: null },
    select: { id: true, proyectoId: true, versiones: { select: { id: true, numero: true, estado: true } } },
  });
  if (!e || !(await proyectoDelActor(a, e.proyectoId))) return { ok: false, error: "Esa pieza no existe." };
  const url = (d.url ?? "").trim();
  if (d.datos ? !imagenValida(d.datos) : !urlValida(url)) {
    return { ok: false, error: d.datos ? "La imagen es demasiado pesada o no es válida." : "Elegí una imagen o pegá un link que empiece con https://." };
  }
  const contenido = { datos: d.datos || null, url: d.datos ? null : url, nota: (d.nota ?? "").trim().slice(0, 500), subidoPor: user.name };
  const borrador = e.versiones.find((v) => v.estado === "BORRADOR");
  if (borrador) {
    const r = await prisma.proyectoEntregableVersion.updateMany({ where: { id: borrador.id, tenantId, estado: "BORRADOR" }, data: contenido });
    if (r.count === 0) return { ok: false, error: "Esa versión ya se envió. Recargá la página." };
  } else {
    if (e.versiones.length >= MAX_VERSIONES) return { ok: false, error: `Una pieza guarda hasta ${MAX_VERSIONES} versiones. Abrí una pieza nueva para seguir.` };
    try {
      const numero = e.versiones.reduce((m, v) => Math.max(m, v.numero), 0) + 1;
      await prisma.proyectoEntregableVersion.create({ data: { tenantId, entregableId: e.id, numero, ...contenido } });
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") return { ok: false, error: "Otra persona acaba de subir una versión. Recargá la página." };
      throw err;
    }
  }
  refrescar(e.proyectoId);
  revalidatePath(`${RAIZ}/${e.proyectoId}/entregable/${e.id}`);
  return { ok: true };
}

export async function descartarBorrador(formData: FormData) {
  const a = await actorCon(["diseno"]);
  const { tenantId } = a;
  const id = txt(formData.get("id"));
  const v = await prisma.proyectoEntregableVersion.findFirst({ where: { id, tenantId, estado: "BORRADOR" }, select: { entregableId: true, entregable: { select: { proyectoId: true } } } });
  if (!v || !(await proyectoDelActor(a, v.entregable.proyectoId))) return;
  await prisma.proyectoEntregableVersion.deleteMany({ where: { id, tenantId, estado: "BORRADOR" } });
  refrescar(v.entregable.proyectoId);
  revalidatePath(`${RAIZ}/${v.entregable.proyectoId}/entregable/${v.entregableId}`);
}

/** Enviar congela la versión con la especificación vigente y la pone en el link. La que seguía sin respuesta queda reemplazada. */
export async function enviarVersion(formData: FormData) {
  const a = await actorCon(["diseno"]);
  const { tenantId } = a;
  const id = txt(formData.get("id"));
  const v = await prisma.proyectoEntregableVersion.findFirst({
    where: { id, tenantId, estado: "BORRADOR", entregable: { anuladoEl: null } },
    select: { numero: true, entregableId: true, entregable: { select: { especificacion: true, proyectoId: true } } },
  });
  if (!v || !(await proyectoDelActor(a, v.entregable.proyectoId))) return;
  const { proyectoId, especificacion } = v.entregable;
  await tenantTransaction(async (tx) => {
    const r = await tx.proyectoEntregableVersion.updateMany({ where: { id, tenantId, estado: "BORRADOR" }, data: { estado: "ENVIADA", enviadaEl: new Date(), especificacion } });
    if (r.count === 0) return;
    await tx.proyectoEntregableVersion.updateMany({ where: { tenantId, entregableId: v.entregableId, estado: "ENVIADA", id: { not: id } }, data: { estado: "REEMPLAZADA" } });
    await tx.proyecto.updateMany({ where: { id: proyectoId, tenantId, tokenEntregables: null }, data: { tokenEntregables: token() } });
  });
  await auditAdmin({ action: "proyecto.entregable.enviar", entity: "ProyectoEntregableVersion", entityId: id, changes: { numero: v.numero } });
  refrescar(proyectoId);
  revalidatePath(`${RAIZ}/${proyectoId}/entregable/${v.entregableId}`);
}

/** El cliente responde desde su link, sin login: la llave es el token y cada versión se responde una sola vez. */
export async function responderEntregable(d: { token: string; versionId: string; aprueba: boolean; nombre: string; comentario?: string }): Promise<Resultado> {
  const tenantId = await getCurrentTenantId();
  const clave = String(d.token ?? "");
  if (!/^[A-Za-z0-9_-]{20,}$/.test(clave)) return { ok: false, error: "El link no es válido." };
  const nombre = String(d.nombre ?? "").trim().slice(0, 120);
  if (!nombre) return { ok: false, error: "Escribí tu nombre para dejar constancia." };
  const comentario = String(d.comentario ?? "").trim().slice(0, 1000);
  if (!d.aprueba && !comentario) return { ok: false, error: "Contanos qué hay que cambiar." };
  const id = String(d.versionId ?? "");
  const v = await prisma.proyectoEntregableVersion.findFirst({
    where: { id, tenantId, estado: { not: "BORRADOR" }, entregable: { anuladoEl: null, proyecto: { tenantId, tokenEntregables: clave } } },
    select: { numero: true, entregableId: true, entregable: { select: { proyectoId: true } } },
  });
  if (!v) return { ok: false, error: "El link no es válido." };
  // El estado va en el where: dos clics a la vez, o una versión nueva que llegó recién, no responden de más.
  const r = await prisma.proyectoEntregableVersion.updateMany({
    where: { id, tenantId, estado: "ENVIADA" },
    data: { estado: d.aprueba ? "APROBADA" : "CAMBIOS", respondidaEl: new Date(), respondidoPor: nombre, comentario: comentario || null },
  });
  if (r.count === 0) return { ok: false, error: "Esta versión ya fue respondida o reemplazada. Recargá la página." };
  await avisar(prisma, {
    tenantId,
    destinatarios: [...(await usuariosDelEquipo(tenantId, v.entregable.proyectoId, "")), ...(await usuariosDeLaPlata(prisma, tenantId))],
    tipo: "aprobacion",
    texto: `${nombre} ${d.aprueba ? "aprobó" : "pidió cambios en"} la versión ${v.numero} de una pieza`,
    enlace: `${RAIZ}/${v.entregable.proyectoId}/entregable/${v.entregableId}`,
  });
  await auditPublic({ action: d.aprueba ? "proyecto.entregable.aprobar" : "proyecto.entregable.cambios", entity: "ProyectoEntregableVersion", entityId: id, changes: { nombre, numero: v.numero } });
  revalidatePath(`/entregables/${clave}`);
  refrescar(v.entregable.proyectoId);
  revalidatePath(`${RAIZ}/${v.entregable.proyectoId}/entregable/${v.entregableId}`);
  return { ok: true };
}

// ── Armador de stands ───────────────────────────────────────────────────────

export async function crearStand(formData: FormData): Promise<Resultado<{ id: string; proyectoId: string }>> {
  const a = await actorCon(["ficha", "diseno"]);
  const { tenantId } = a;
  const proyectoId = txt(formData.get("proyectoId"));
  if (!(await proyectoDelActor(a, proyectoId))) return { ok: false, error: "Ese proyecto no existe." };
  const cuantos = await prisma.proyectoStand.count({ where: { tenantId, proyectoId } });
  const diseno = disenoInicial(TIPOS_STAND[1]);
  const s = await prisma.proyectoStand.create({
    data: { tenantId, proyectoId, nombre: cuantos ? `Opción ${cuantos + 1}` : "Opción 1", diseno: diseno as unknown as Prisma.InputJsonValue },
    select: { id: true },
  });
  refrescar(proyectoId);
  return { ok: true, id: s.id, proyectoId };
}

export async function guardarStand(d: { id: string; nombre: string; diseno: DisenoStand }): Promise<Resultado> {
  const a = await actorCon(["ficha", "diseno"]);
  const { tenantId } = a;
  const diseno = normalizarDiseno(d.diseno);
  if (!diseno) return { ok: false, error: "El diseño no es válido." };
  const s = await prisma.proyectoStand.findFirst({ where: { id: d.id, tenantId }, select: { proyectoId: true } });
  if (!s || !(await proyectoDelActor(a, s.proyectoId))) return { ok: false, error: "Ese stand no existe." };
  const r = await prisma.proyectoStand.updateMany({
    where: { id: d.id, tenantId },
    data: { nombre: (d.nombre ?? "").trim().slice(0, 80) || "Stand", diseno: diseno as unknown as Prisma.InputJsonValue },
  });
  if (r.count === 0) return { ok: false, error: "Ese stand no existe." };
  return { ok: true };
}

/**
 * Elimina una maqueta y, con ella, los renglones del presupuesto en borrador que salieron de ella: sin maqueta, esos costos de
 * materiales no tienen de dónde venir. Si están en una cotización enviada o ya se contrataron, no se elimina nada y se explica por qué.
 */
export async function eliminarStand(d: { id: string }): Promise<Resultado<{ proyectoId: string; renglones: number }>> {
  const a = await actorCon(["ficha", "diseno"]);
  const { tenantId } = a;
  const s = await prisma.proyectoStand.findFirst({ where: { id: d.id, tenantId }, select: { proyectoId: true } });
  if (!s || !(await proyectoDelActor(a, s.proyectoId))) return { ok: false, error: "Ese stand no existe." };
  const origen = `stand:${d.id}`;
  const suyos = await prisma.proyectoItem.findMany({ where: { tenantId, origen }, select: { estadoItem: true, costoReal: true, presupuesto: { select: { estado: true, version: true } } } });
  const bloqueo = bloqueoDeEliminar(suyos.map((i) => ({ presupuestoEstado: i.presupuesto.estado, version: i.presupuesto.version, estadoItem: i.estadoItem, costoReal: i.costoReal })));
  if (bloqueo) return { ok: false, error: bloqueo };
  let renglones = 0;
  const borrada = await tenantTransaction(async (tx) => {
    const r = await tx.proyectoStand.deleteMany({ where: { id: d.id, tenantId } });
    if (r.count === 0) return false;
    renglones = (await tx.proyectoItem.deleteMany({ where: { tenantId, origen, presupuesto: { estado: "BORRADOR" } } })).count;
    return true;
  });
  if (!borrada) return { ok: false, error: "Ese stand no existe." };
  refrescar(s.proyectoId);
  return { ok: true, proyectoId: s.proyectoId, renglones };
}

/** Pasa el cómputo del stand al presupuesto en borrador. Reemplaza lo que vino de ESTE stand, no lo cargado a mano. */
export async function computoAlPresupuesto(d: { standId: string }): Promise<Resultado<{ lineas: number; proyectoId: string }>> {
  const a = await actorCon(["ficha"]);
  const { tenantId } = a;
  const stand = await prisma.proyectoStand.findFirst({ where: { id: d.standId, tenantId }, select: { id: true, nombre: true, proyectoId: true, diseno: true } });
  const diseno = stand && normalizarDiseno(stand.diseno);
  if (!stand || !diseno || !(await proyectoDelActor(a, stand.proyectoId))) return { ok: false, error: "Ese stand no existe." };
  const config = await configProyectos(tenantId);
  const origen = `stand:${stand.id}`;
  const lineas = computar(diseno);
  // Una versión vacía encima de una enviada dejaría sin ítems a la ficha viva, y eso anula las cuotas pendientes.
  const [conBorrador, versiones] = await Promise.all([
    prisma.proyectoPresupuesto.count({ where: { tenantId, proyectoId: stand.proyectoId, estado: "BORRADOR" } }),
    prisma.proyectoPresupuesto.count({ where: { tenantId, proyectoId: stand.proyectoId } }),
  ]);
  if (conBorrador === 0 && versiones > 0) return { ok: false, error: "La cotización ya se envió. Abrí una versión nueva en Cotización y volvé a pasar el cómputo." };
  await tenantTransaction(async (tx) => {
    let borrador = await tx.proyectoPresupuesto.findFirst({ where: { tenantId, proyectoId: stand.proyectoId, estado: "BORRADOR" }, select: { id: true } });
    if (!borrador) {
      const ultima = await tx.proyectoPresupuesto.findFirst({ where: { tenantId, proyectoId: stand.proyectoId }, orderBy: { version: "desc" }, select: { version: true } });
      borrador = await tx.proyectoPresupuesto.create({
        data: { tenantId, proyectoId: stand.proyectoId, version: (ultima?.version ?? 0) + 1, token: token(), ivaPct: config.ivaPct, condiciones: config.condiciones },
        select: { id: true },
      });
    }
    await tx.proyectoItem.deleteMany({ where: { tenantId, presupuestoId: borrador.id, origen } });
    const base = await tx.proyectoItem.count({ where: { tenantId, presupuestoId: borrador.id } });
    await tx.proyectoItem.createMany({
      data: lineas.map((l, i) => ({
        tenantId,
        presupuestoId: borrador.id,
        rubro: l.rubro,
        descripcion: l.descripcion,
        unidad: l.unidad,
        cantidad: l.cantidad,
        costo: config.costos[l.clave],
        precio: precioConMargen(config.costos[l.clave], config.margenPct),
        
        origen,
        posicion: base + i,
      })),
    });
  });
  // Como cualquier cambio de la ficha: los precios nuevos piden aprobación, y las cuotas siguen a los ítems.
  await prisma.proyectoPresupuesto.updateMany({ where: { tenantId, proyectoId: stand.proyectoId, estado: "BORRADOR" }, data: { aprobadoInternoEl: null, aprobadoInternoPor: null } });
  await regenerarCuotas(tenantId, stand.proyectoId);
  refrescar(stand.proyectoId);
  return { ok: true, lineas: lineas.length, proyectoId: stand.proyectoId };
}

// ── Configuración ───────────────────────────────────────────────────────────

export async function guardarConfig(formData: FormData) {
  await requireCapabilityFueraDeLaAgenda("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const costos: Partial<Record<ClaveCosto, number>> = {};
  for (const k of Object.keys(COSTO_LABEL) as ClaveCosto[]) {
    const v = formData.get(`costo_${k}`);
    if (v !== null) costos[k] = Math.max(0, numero(v));
  }
  const data = {
    margenPct: Math.max(0, numero(formData.get("margenPct"))),
    validezDias: Math.max(1, Math.round(numero(formData.get("validezDias"))) || 15),
    ivaPct: Math.max(0, numero(formData.get("ivaPct"))),
    condiciones: txt(formData.get("condiciones")),
    costosStand: costosVigentes(costos) as unknown as Prisma.InputJsonValue,
  };
  await prisma.proyectoConfig.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data });
  await auditAdmin({ action: "proyecto.config", entity: "ProyectoConfig", entityId: tenantId, changes: { margenPct: data.margenPct, validezDias: data.validezDias, ivaPct: data.ivaPct } });
  revalidatePath(`${RAIZ}/config`);
}
