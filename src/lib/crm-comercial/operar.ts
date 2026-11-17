// ============================================================================
// CRM COMERCIAL — interfaz de comandos para operar como un puesto (B6 · GSG-CRM-011 parte 3). SÓLO LOCAL.
// ============================================================================
//
// Una sesión de GSG opera como un puesto del equipo (o como una persona) sin pantalla: dice su negocio (slug)
// y su usuario (email), y pide un comando. Mismo orden de guardias que `acciones.ts`:
//   (1) el usuario existe, está activo y es de ESE negocio; (2) el interruptor «crm-comercial» del negocio está
//   prendido (si no, nada se lee ni se escribe); (3) llama a la MISMA función de `repo.ts` que la acción del
//   servidor, con la misma conversión de fechas. El permiso por puesto, los topes, la validación de pases y el
//   registro del rechazo viven en el repo: acá no se decide nada.
// No importa el cliente de la base para operar: la identidad y el interruptor se leen en `tenantTransaction`.
// Sólo contra una base de esta máquina (`baseLocalParaSeed`); en la app publicada se opera por el login.

import { tenantTransaction } from "@/lib/rls";
import { baseLocalParaSeed } from "@/lib/seed/guarda-base";
import { estadoDesdeFilas, filtroDeFilasValidas } from "@/cambios/interruptores-core";
import { crmComercialPrendido } from "@/cambios/interruptores";
import { guardaDeBase, negocioPorSlug } from "./carga-prueba";
import * as repo from "./repo";
import type { EvidenciaPase } from "./motor";

export interface PedidoOperar {
  /** Slug del negocio. */
  negocio: string;
  /** Email del usuario con el que se opera (el del puesto o el de la persona). */
  como: string;
  comando: string;
  datos?: Record<string, unknown>;
}

type Salida = { ok: boolean; [k: string]: unknown };
const no = (motivo: string): Salida => ({ ok: false, motivo });

/** Igual que `fecha` de acciones.ts: ISO o AAAA-MM-DD (mediodía UTC). Inválida = null. */
function fecha(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v !== "string" || !v.trim()) return null;
  const s = /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? `${v.trim()}T12:00:00Z` : v.trim();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
const fechaOpcional = (v: unknown): Date | null | undefined => (v === undefined ? undefined : fecha(v));
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOpc = (v: unknown): string | null => (typeof v === "string" ? v : null);
const numOpc = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Lo mismo que `pase()` de acciones.ts: nadie entra por acá como «cierre del proyecto». */
const pase = (d: Record<string, unknown>): repo.PedidoDePase => {
  const { id: _id, destino: _d, ...ev } = d;
  return { ...(ev as EvidenciaPase), desdeProyecto: false, proximoPasoEl: fechaOpcional(d.proximoPasoEl) ?? undefined } as repo.PedidoDePase;
};

type Comando = (ctx: repo.Ctx, d: Record<string, unknown>, esDuenio: boolean) => Promise<Salida>;

export const COMANDOS: Record<string, { ayuda: string; correr: Comando }> = {
  listar: { ayuda: "{etapa?}", correr: (ctx, d) => repo.listarOportunidades(ctx, { etapa: strOpc(d.etapa) }) },
  hoy: { ayuda: "{}", correr: (ctx) => repo.hoy(ctx) },
  ficha: { ayuda: "{id}", correr: (ctx, d) => repo.ficha(ctx, str(d.id)) },
  registro: { ayuda: "{} (sólo Dirección)", correr: (ctx) => repo.registroPorPuesto(ctx) },
  "proponer-oportunidad": {
    ayuda: "{tipo, marca:{nombre,dominio?,cuit?,rubro?}|{marcaId}, eventoId?, consultaTexto?, datos?, proximoPaso, proximoPasoEl, fechaLimite?, fuenteUrl?, costoUsd?, idempotencia?}",
    correr: async (ctx, d) => {
      const proximoPasoEl = fecha(d.proximoPasoEl);
      if (!proximoPasoEl) return no("Una oportunidad abierta no se guarda sin la fecha del próximo paso.");
      return repo.proponerOportunidad(ctx, { ...(d as unknown as repo.NuevaOportunidad), proximoPasoEl, fechaLimite: fecha(d.fechaLimite) });
    },
  },
  "actualizar-datos": {
    ayuda: "{id, datos?, objetivo?, proximoPaso?, proximoPasoEl?, fechaLimite?, monto?, moneda?, cierreEsperadoEl?, destinoPropuesto?, version?, fuenteUrl?, costoUsd?}",
    correr: async (ctx, d) => {
      const vacio = d.cierreEsperadoEl === null || (typeof d.cierreEsperadoEl === "string" && !d.cierreEsperadoEl.trim());
      const cierre = d.cierreEsperadoEl === undefined ? undefined : vacio ? null : fecha(d.cierreEsperadoEl);
      if (cierre === null && !vacio) return no("La fecha de cierre esperado no es válida.");
      const { id, ...resto } = d;
      return repo.actualizarDatos(ctx, str(id), { ...(resto as repo.PedidoDeDatos), proximoPasoEl: fechaOpcional(d.proximoPasoEl), fechaLimite: fechaOpcional(d.fechaLimite), cierreEsperadoEl: cierre });
    },
  },
  "aplicar-pase": { ayuda: "{id, destino, ...evidencia}", correr: (ctx, d) => repo.aplicarPase(ctx, str(d.id), str(d.destino), pase(d)) },
  "proponer-pase": { ayuda: "{id, destino, ...evidencia}", correr: (ctx, d) => repo.proponerPase(ctx, str(d.id), str(d.destino), pase(d)) },
  "aprobar-pase": { ayuda: "{id, ...evidencia}", correr: (ctx, d) => repo.aprobarPasePropuesto(ctx, str(d.id), pase(d)) },
  "rechazar-pase": { ayuda: "{id, motivo}", correr: (ctx, d) => repo.rechazarPasePropuesto(ctx, str(d.id), str(d.motivo)) },
  "confirmar-destino": { ayuda: "{id, destino}", correr: (ctx, d) => repo.confirmarDestino(ctx, str(d.id), str(d.destino)) },
  "pedido-de-datos": { ayuda: "{id}", correr: (ctx, d) => repo.registrarPedidoDeDatos(ctx, str(d.id)) },
  respuesta: { ayuda: "{id, texto}", correr: (ctx, d) => repo.registrarRespuesta(ctx, str(d.id), str(d.texto)) },
  identidad: {
    ayuda: "{id, emailDeQuienEscribe?, confirmadaPorPersona?}",
    correr: (ctx, d) => repo.comprobarIdentidad(ctx, str(d.id), { emailDeQuienEscribe: strOpc(d.emailDeQuienEscribe), confirmadaPorPersona: d.confirmadaPorPersona === true }),
  },
  "verificar-fuente": {
    ayuda: "{id, que: marca|evento, verificacion: confirmado|en duda|falla, urlFuente, rol?}",
    correr: (ctx, d) => repo.verificarFuente(ctx, str(d.id), { que: str(d.que), verificacion: str(d.verificacion), urlFuente: str(d.urlFuente), rol: strOpc(d.rol) }),
  },
  "crear-contacto": { ayuda: "{oportunidadId?, marcaId?, nombre, email?, telefono?, cargo?, deConsultaEntrante?, papel?}", correr: (ctx, d) => repo.crearContacto(ctx, d as unknown as repo.NuevoContacto) },
  "vincular-contacto": { ayuda: "{oportunidadId, contactoId, papel}", correr: (ctx, d) => repo.vincularContacto(ctx, d as unknown as repo.VinculoContacto) },
  "desvincular-contacto": { ayuda: "{oportunidadId, contactoId, papel}", correr: (ctx, d) => repo.desvincularContacto(ctx, d as unknown as repo.VinculoContacto) },
  "suprimir-contacto": { ayuda: "{contactoId}", correr: (ctx, d) => repo.suprimirContacto(ctx, str(d.contactoId)) },
  "escribir-borrador": { ayuda: "{oportunidadId, contactoId?, canal: MAIL|WHATSAPP, asunto?, cuerpo, idempotencia?, costoUsd?}", correr: (ctx, d) => repo.escribirBorrador(ctx, d as unknown as repo.NuevoBorrador) },
  "aprobar-borrador": { ayuda: "{id, version?}", correr: (ctx, d) => repo.aprobarBorrador(ctx, str(d.id), numOpc(d.version)) },
  "rechazar-borrador": { ayuda: "{id, motivo, version?}", correr: (ctx, d) => repo.rechazarBorrador(ctx, str(d.id), str(d.motivo), numOpc(d.version)) },
  "marcar-enviado": { ayuda: "{id}", correr: (ctx, d) => repo.marcarEnviado(ctx, str(d.id)) },
  "crear-tarea": {
    ayuda: "{oportunidadId, para, tipo, venceEl?, idempotencia?}",
    correr: (ctx, d) => repo.crearTarea(ctx, { oportunidadId: str(d.oportunidadId), para: str(d.para), tipo: str(d.tipo), venceEl: fecha(d.venceEl), idempotencia: strOpc(d.idempotencia) }),
  },
  "tomar-tarea": { ayuda: "{tareaId?}", correr: (ctx, d) => repo.tomarTarea(ctx, { tareaId: strOpc(d.tareaId) }) },
  "cerrar-tarea": { ayuda: "{tareaId, estado: HECHA|DESCARTADA, nota?}", correr: (ctx, d) => repo.cerrarTarea(ctx, str(d.tareaId), { estado: str(d.estado), nota: strOpc(d.nota) }) },
  "tomar-pedido": { ayuda: "{pedidoId?}", correr: (ctx, d) => repo.tomarPedido(ctx, { pedidoId: strOpc(d.pedidoId) }) },
  "cerrar-pedido": { ayuda: "{pedidoId, estado: HECHO|DESCARTADO, nota?}", correr: (ctx, d) => repo.cerrarPedido(ctx, str(d.pedidoId), { estado: str(d.estado), nota: strOpc(d.nota) }) },
  "poner-al-dia": { ayuda: "{}", correr: (ctx) => repo.ponerAlDia(ctx) },
  "guardar-miembro": {
    ayuda: "{userId, rol, puesto?, topeAccionesDia?, topeCostoDiaUsd?, activo?} (Dirección)",
    correr: (ctx, d, esDuenio) => repo.guardarMiembro(ctx, d as unknown as repo.DatosMiembro, { esDuenioDelNegocio: esDuenio }),
  },
};

/** Opera un comando como el usuario `como` del negocio `negocio`. Siempre devuelve un objeto JSON. */
export async function operar(p: PedidoOperar, env: Record<string, string | undefined> = process.env): Promise<Salida> {
  const g1 = guardaDeBase(env.DATABASE_URL);
  if (!g1.ok) return no(g1.motivo);
  const g2 = baseLocalParaSeed(env.DATABASE_URL);
  if (!g2.ok) return no(`La interfaz de comandos es sólo local. ${g2.motivo}`);
  const cmd = COMANDOS[p.comando];
  if (!cmd) return no(`No conozco el comando «${p.comando}». Comandos: ${Object.keys(COMANDOS).join(", ")}.`);

  const negocio = await negocioPorSlug(p.negocio);
  if (!negocio) return no(`No hay un negocio con el slug «${p.negocio}».`);
  const tenantId = negocio.id;
  const email = p.como.trim().toLowerCase();
  const { usuario, prendido } = await tenantTransaction(
    async (tx) => {
      const usuario = await tx.user.findFirst({ where: { tenantId, email, active: true }, select: { id: true, role: true } });
      const filas = await tx.auditLog.findMany({
        where: filtroDeFilasValidas(tenantId),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        distinct: ["entity", "entityId"],
        select: { id: true, entity: true, entityId: true, action: true, actor: true, channel: true, createdAt: true },
      });
      return { usuario, prendido: crmComercialPrendido(estadoDesdeFilas(filas)) };
    },
    { tenantId },
  );
  if (!usuario) return no("No hay un usuario activo con ese mail en ese negocio.");
  if (!prendido) return no("El CRM comercial no está activado en este negocio.");

  const ctx: repo.Ctx = { tenantId, userId: usuario.id };
  try {
    return await cmd.correr(ctx, p.datos ?? {}, usuario.role === "OWNER");
  } catch (err) {
    if (repo.esFaltaDeTabla(err)) return { ok: false, motivo: repo.MIGRACION_PENDIENTE, faltaMigracion: true };
    return no(`No se pudo hacer: ${err instanceof Error ? err.message : String(err)}`);
  }
}
