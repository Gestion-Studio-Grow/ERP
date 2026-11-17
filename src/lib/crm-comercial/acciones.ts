"use server";

// ============================================================================
// CRM COMERCIAL — Server Actions (GSG-CRM-010).
// ============================================================================
//
// Las usan las pantallas (T2) y los usuarios de puesto del equipo de agentes. Orden de las guardias:
// (1) la sesión del panel (`requireUser`), (2) el interruptor «crm-comercial» del negocio (apagado = rechazo,
// nada se lee ni se escribe), (3) la demo pública no escribe, (4) el tenantId del request, (5) el repo, que
// carga la membresía del CRM y pregunta a `permisos.ts` ANTES de escribir. El permiso NO sale de
// `clients:manage` ni del rol del panel (E16): sale de `MiembroCrmComercial`. La única excepción es el
// arranque: la dueña del negocio puede darse de alta en Dirección si todavía no hay nadie.
//
// Ninguna acción le manda nada a terceros (ni mail ni mensajería): marcar «enviado» lo hace la persona que
// mandó el mensaje por su cuenta; para WhatsApp se devuelve un link sin número.

import { unstable_rethrow } from "next/navigation";
import { requireUser } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { isDemoSandbox } from "@/lib/demo-flag";
import { logger } from "@/lib/logger";
import { interruptoresDelNegocio } from "@/cambios/interruptores.server";
import { crmComercialPrendido } from "@/cambios/interruptores";
import * as repo from "./repo";
import type { Ctx, Res } from "./repo";
import type { EvidenciaPase } from "./motor";

type Rechazo = { ok: false; motivo: string; faltaMigracion?: true };
const no = (motivo: string): Rechazo => ({ ok: false, motivo });

async function entrar(escribe: boolean): Promise<{ ctx: Ctx; esDuenio: boolean } | Rechazo> {
  const user = await requireUser();
  if (!crmComercialPrendido(await interruptoresDelNegocio())) return no("El CRM comercial no está activado en este negocio.");
  if (escribe && isDemoSandbox()) return no("En la demo pública no se cargan datos.");
  const tenantId = await getCurrentTenantId();
  if (user.tenantId !== tenantId) return no("Tu usuario no es de este negocio.");
  return { ctx: { tenantId, userId: user.id }, esDuenio: user.role === "OWNER" };
}

async function con<T extends object>(escribe: boolean, fn: (ctx: Ctx, esDuenio: boolean) => Promise<Res<T>>): Promise<Res<T>> {
  try {
    const e = await entrar(escribe);
    if ("ok" in e) return e;
    return await fn(e.ctx, e.esDuenio);
  } catch (err) {
    unstable_rethrow(err);
    if (repo.esFaltaDeTabla(err)) return { ok: false, motivo: repo.MIGRACION_PENDIENTE, faltaMigracion: true };
    logger.warn("crm-comercial", "falló una acción", { error: err instanceof Error ? err.message : String(err) });
    return no("No se pudo hacer. Probá de nuevo en un rato.");
  }
}

/** Fecha de un formulario o de un agente: ISO o AAAA-MM-DD. Inválida = null (el motor dice qué falta). */
function fecha(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v !== "string" || !v.trim()) return null;
  const s = /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? `${v.trim()}T12:00:00Z` : v.trim();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
const fechaOpcional = (v: unknown): Date | null | undefined => (v === undefined ? undefined : fecha(v));

// ── Membresía ───────────────────────────────────────────────────────────────

export async function guardarMiembroCrm(d: repo.DatosMiembro) {
  return con(true, (ctx, esDuenio) => repo.guardarMiembro(ctx, d, { esDuenioDelNegocio: esDuenio }));
}

// ── Oportunidades ───────────────────────────────────────────────────────────

export type NuevaOportunidadEntrada = Omit<repo.NuevaOportunidad, "proximoPasoEl" | "fechaLimite"> & { proximoPasoEl: string | Date; fechaLimite?: string | Date | null };

export async function proponerOportunidad(n: NuevaOportunidadEntrada) {
  return con(true, async (ctx) => {
    const proximoPasoEl = fecha(n.proximoPasoEl);
    if (!proximoPasoEl) return no("Una oportunidad abierta no se guarda sin la fecha del próximo paso.");
    return repo.proponerOportunidad(ctx, { ...n, proximoPasoEl, fechaLimite: fecha(n.fechaLimite) });
  });
}

export async function actualizarDatosOportunidad(
  id: string,
  d: Omit<repo.PedidoDeDatos, "proximoPasoEl" | "fechaLimite" | "cierreEsperadoEl"> & { proximoPasoEl?: string | Date | null; fechaLimite?: string | Date | null; cierreEsperadoEl?: string | Date | null },
) {
  return con(true, (ctx) => {
    // Cierre esperado: vacío o null lo borra; una fecha que no se entiende se rechaza (no se borra en silencio).
    const vacio = d.cierreEsperadoEl === null || (typeof d.cierreEsperadoEl === "string" && !d.cierreEsperadoEl.trim());
    const cierre = d.cierreEsperadoEl === undefined ? undefined : vacio ? null : fecha(d.cierreEsperadoEl);
    if (cierre === null && !vacio) return Promise.resolve(no("La fecha de cierre esperado no es válida."));
    return repo.actualizarDatos(ctx, id, { ...d, proximoPasoEl: fechaOpcional(d.proximoPasoEl), fechaLimite: fechaOpcional(d.fechaLimite), cierreEsperadoEl: cierre });
  });
}

type PaseEntrada = EvidenciaPase & { proximoPaso?: string | null; proximoPasoEl?: string | Date | null; version?: number; fuenteUrl?: string | null; costoUsd?: number | null };
const pase = (ev: PaseEntrada = {}): repo.PedidoDePase => ({ ...ev, desdeProyecto: false, proximoPasoEl: fechaOpcional(ev.proximoPasoEl) ?? undefined });

export async function aplicarPase(id: string, destino: string, ev?: PaseEntrada) {
  return con(true, (ctx) => repo.aplicarPase(ctx, id, destino, pase(ev)));
}
export async function proponerPase(id: string, destino: string, ev?: PaseEntrada) {
  return con(true, (ctx) => repo.proponerPase(ctx, id, destino, pase(ev)));
}
export async function aprobarPasePropuesto(id: string, ev?: PaseEntrada) {
  return con(true, (ctx) => repo.aprobarPasePropuesto(ctx, id, pase(ev)));
}
export async function rechazarPasePropuesto(id: string, motivo: string) {
  return con(true, (ctx) => repo.rechazarPasePropuesto(ctx, id, motivo));
}
export async function confirmarDestino(id: string, destino: string) {
  return con(true, (ctx) => repo.confirmarDestino(ctx, id, destino));
}
export async function registrarPedidoDeDatos(id: string, idempotencia?: string | null) {
  return con(true, (ctx) => repo.registrarPedidoDeDatos(ctx, id, new Date(), idempotencia));
}
export async function registrarRespuesta(id: string, texto: string) {
  return con(true, (ctx) => repo.registrarRespuesta(ctx, id, texto));
}
export async function comprobarIdentidad(id: string, d: { emailDeQuienEscribe?: string | null; confirmadaPorPersona?: boolean }) {
  return con(true, (ctx) => repo.comprobarIdentidad(ctx, id, d));
}
/** GSG-CRM-011: la marca en el evento o el evento, «confirmado» (o en duda, falla) con la URL de la fuente. */
export async function verificarFuente(id: string, d: repo.PedidoDeVerificacion) {
  return con(true, (ctx) => repo.verificarFuente(ctx, id, d));
}

// ── Contactos ───────────────────────────────────────────────────────────────

export async function crearContacto(c: repo.NuevoContacto) {
  return con(true, (ctx) => repo.crearContacto(ctx, c));
}
export async function vincularContacto(v: repo.VinculoContacto) {
  return con(true, (ctx) => repo.vincularContacto(ctx, v));
}
export async function desvincularContacto(v: repo.VinculoContacto) {
  return con(true, (ctx) => repo.desvincularContacto(ctx, v));
}
export async function suprimirContacto(contactoId: string) {
  return con(true, (ctx) => repo.suprimirContacto(ctx, contactoId));
}

// ── Borradores ──────────────────────────────────────────────────────────────

export async function escribirBorrador(b: repo.NuevoBorrador) {
  return con(true, (ctx) => repo.escribirBorrador(ctx, b));
}
export async function aprobarBorrador(id: string, version?: number) {
  return con(true, (ctx) => repo.aprobarBorrador(ctx, id, version));
}
export async function rechazarBorrador(id: string, motivo: string, version?: number) {
  return con(true, (ctx) => repo.rechazarBorrador(ctx, id, motivo, version));
}
export async function marcarEnviado(id: string) {
  return con(true, (ctx) => repo.marcarEnviado(ctx, id));
}
/** GSG-CRM-011: corregir el texto antes de aprobar (lo hace quien revisa; con versión). */
export async function editarBorrador(id: string, d: { asunto?: string | null; cuerpo: string; version?: number }) {
  return con(true, (ctx) => repo.editarBorrador(ctx, id, d));
}

// ── Colas ───────────────────────────────────────────────────────────────────

export async function crearTarea(t: { oportunidadId: string; para: string; tipo: string; venceEl?: string | Date | null; idempotencia?: string | null }) {
  return con(true, (ctx) => repo.crearTarea(ctx, { ...t, venceEl: fecha(t.venceEl) }));
}
export async function tomarTarea(d: { tareaId?: string | null } = {}) {
  return con(true, (ctx) => repo.tomarTarea(ctx, d));
}
export async function cerrarTarea(tareaId: string, d: { estado: string; nota?: string | null }) {
  return con(true, (ctx) => repo.cerrarTarea(ctx, tareaId, d));
}
export async function tomarPedido(d: { pedidoId?: string | null } = {}) {
  return con(true, (ctx) => repo.tomarPedido(ctx, d));
}
export async function cerrarPedido(pedidoId: string, d: { estado: string; nota?: string | null }) {
  return con(true, (ctx) => repo.cerrarPedido(ctx, pedidoId, d));
}
export async function traerCierreDelProyecto(oportunidadId: string) {
  return con(true, (ctx) => repo.traerCierreDelProyecto(ctx, String(oportunidadId)));
}
export async function ponerAlDia() {
  return con(true, (ctx) => repo.ponerAlDia(ctx));
}

// ── Lecturas ────────────────────────────────────────────────────────────────

export async function listarOportunidades(f: { etapa?: string | null } = {}) {
  return con(false, (ctx) => repo.listarOportunidades(ctx, f));
}
export async function hoy() {
  return con(false, (ctx) => repo.hoy(ctx));
}
export async function ficha(id: string) {
  return con(false, (ctx) => repo.ficha(ctx, id));
}
export async function registroPorPuesto() {
  return con(false, (ctx) => repo.registroPorPuesto(ctx));
}

// GSG-CRM-011 · lecturas de las pantallas (misma puerta: interruptor, negocio y membresía en el repo).
export async function miMembresia() {
  return con(false, (ctx) => repo.miMembresia(ctx));
}
/** Pantalla «Miembros del CRM»: sólo Dirección (`configurar`, lo decide el repo). */
export async function usuariosYMiembros() {
  return con(false, (ctx) => repo.usuariosYMiembros(ctx));
}
export async function personasDelCrm() {
  return con(false, (ctx) => repo.personasDelCrm(ctx));
}
export async function listarBorradores(f: { estados?: string[] } = {}) {
  return con(false, (ctx) => repo.listarBorradores(ctx, f));
}
export async function colaDeTrabajo() {
  return con(false, (ctx) => repo.colaDeTrabajo(ctx));
}
export async function detalleDeFicha(id: string) {
  return con(false, (ctx) => repo.detalleDeFicha(ctx, id));
}
export async function eventosParaElegir() {
  return con(false, (ctx) => repo.eventosParaElegir(ctx));
}
