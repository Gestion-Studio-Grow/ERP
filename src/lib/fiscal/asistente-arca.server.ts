// ============================================================================
// ASISTENTE ARCA — lo que toca la base y el cifrado (servidor)
// ============================================================================
//
// DÓNDE QUEDA LA CLAVE DEL PEDIDO (sin migración): en `ArcaAuthTicket`, la tabla de material de ARCA
// cifrado por negocio, con `service = "pedido-csr"` y `certHuella = "pedido-csr:<tenantId>"` (una por
// negocio; no choca con los tickets de WSAA, que van por huella real y `service = "wsfe"`). Se sella
// con `sealSecret` y la MISMA master key del certificado (FISCAL_MASTER_KEY): la clave del pedido y
// la del certificado viven bajo el mismo dominio de cifrado, con RLS por negocio (`enElNegocio`).
// `expiration` guarda la fecha en que se generó el pedido (en claro, no es secreto). Se descartó
// `IntegracionCredencial` (src/integraciones/conexiones.server.ts): pide un conector registrado, otra
// master key (INTEGRACIONES_MASTER_KEY) y deja una «conexión» visible en Integraciones.
//
// Cuando el certificado del pedido se carga bien, la fila del pedido se borra. La clave NUNCA sale de
// acá: ni a la pantalla, ni a la dirección, ni a los logs, ni a AuditLog.
//
// NO lleva "use server": recibe un tenantId. Lo llaman, DESPUÉS de su guardia, las actions del
// cliente (./asistente-arca-actions.ts) y las del operador (src/lib/operator-actions.ts).

import "server-only";
import { randomUUID } from "node:crypto";
import { enElNegocio } from "@/lib/operator-db";
import { logger } from "@/lib/logger";
import { masterKeyDesdeEnv, openSecret, sealSecret } from "@/lib/fiscal/cert-crypto";
import { cargarCredencialTenant, credencialParaTenant } from "@/lib/fiscal/tenant-cert";
import { huellaDeCertificado } from "@/lib/fiscal/arca-ta-store";
import { leerFichaDelPase } from "@/lib/operador/pase-a-real.server";
import type { FichaFiscalDelPase } from "@/lib/operador/pase-a-real";
import { modoDesdeEnv } from "@/plugins/arca";
import {
  certificadoEnPem,
  confirmaElPase,
  errorDeCargaEnCriollo,
  estadoDelAsistente,
  generarPedidoDeCertificado,
  PALABRA_DEL_PASE,
  type EntradaAsistente,
  type EstadoDelAsistente,
  type PedidoDePase,
} from "./asistente-arca";

export const SERVICIO_PEDIDO = "pedido-csr";
const huellaDelPedido = (tenantId: string) => `pedido-csr:${tenantId}`;

/** Acciones de AuditLog del asistente (metadata, nunca material). */
export const ACCION_PEDIDO_CSR = "fiscal.csr.generado";
export const ACCION_PEDIDO_DE_PASE = "fiscal.pase-a-real.pedido";
const ACCIONES_DEL_PASE = [ACCION_PEDIDO_DE_PASE, "fiscal.pase-a-real", "fiscal.vuelta-a-pruebas"];

export type Resultado = { ok: true; mensaje: string } | { ok: false; motivo: string };

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });

// ── Pedido pendiente ─────────────────────────────────────────────────────────

interface PedidoAbierto {
  keyPem: string;
  csrPem: string;
  creadoEn: string;
}

async function abrirPedido(tenantId: string): Promise<PedidoAbierto | null> {
  const fila = await enElNegocio(tenantId, (tx) =>
    tx.arcaAuthTicket.findFirst({
      where: { tenantId, certHuella: huellaDelPedido(tenantId), service: SERVICIO_PEDIDO },
      select: { kekId: true, wrappedDek: true, sealed: true, expiration: true },
    }),
  );
  if (!fila) return null;
  const { keyPem, csrPem } = JSON.parse(openSecret(fila, masterKeyDesdeEnv())) as { keyPem: string; csrPem: string };
  return { keyPem, csrPem, creadoEn: fila.expiration };
}

/** El pedido pendiente para mostrar (sólo el .csr y la fecha; la clave no sale). */
export async function leerPedidoPendiente(tenantId: string): Promise<{ csrPem: string; creadoEn: string } | null> {
  try {
    const p = await abrirPedido(tenantId);
    return p && { csrPem: p.csrPem, creadoEn: p.creadoEn };
  } catch (e) {
    logger.warn("arca.asistente", "No se pudo abrir el pedido de certificado pendiente", {
      tenantId,
      err: e instanceof Error ? e.name : "error",
    });
    return null;
  }
}

/**
 * Paso 2: genera clave + CSR en el servidor y deja la clave cifrada y pendiente (reemplaza un pedido
 * anterior: el .csr viejo deja de servir). No toca el certificado cargado.
 */
export async function generarPedidoDelNegocio(tenantId: string, actor: string): Promise<Resultado> {
  const t = await enElNegocio(tenantId, (tx) =>
    tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true, arcaCuit: true, arcaRazonSocial: true } }),
  );
  if (!t) return { ok: false, motivo: "No existe el negocio." };
  const pedido = generarPedidoDeCertificado({ razonSocial: t.arcaRazonSocial || t.name, cuit: t.arcaCuit ?? "" });
  if (!pedido.ok) return pedido;

  let master: ReturnType<typeof masterKeyDesdeEnv>;
  try {
    master = masterKeyDesdeEnv();
  } catch {
    return { ok: false, motivo: "Falta la configuración para guardar certificados cifrados. Avisale a GSG." };
  }
  const sobre = sealSecret(JSON.stringify({ keyPem: pedido.keyPem, csrPem: pedido.csrPem }), master);
  const creadoEn = new Date().toISOString();
  await enElNegocio(tenantId, async (tx) => {
    const huella = huellaDelPedido(tenantId);
    await tx.arcaAuthTicket.deleteMany({ where: { tenantId, certHuella: huella, service: SERVICIO_PEDIDO } });
    await tx.arcaAuthTicket.create({
      data: { id: randomUUID(), tenantId, certHuella: huella, service: SERVICIO_PEDIDO, ...sobre, expiration: creadoEn },
    });
    await tx.auditLog.create({
      data: { tenantId, actor, action: ACCION_PEDIDO_CSR, entity: "Tenant", entityId: tenantId, changes: { subject: pedido.subject, creadoEn } },
    });
  });
  return { ok: true, mensaje: "Pedido de certificado generado: bajá el archivo .csr y seguí las instrucciones." };
}

/**
 * Paso 3: el certificado que devolvió ARCA + la clave pendiente → `cargarCredencialTenant` (valida
 * que la clave sea la del cert y que el CUIT sea el del negocio, sella y audita). Con éxito, borra el
 * pedido. Volver a subir el mismo certificado ya cargado no es un error.
 */
export async function cargarCertificadoDelPedido(
  tenantId: string,
  entrada: string | Uint8Array,
  actor: string,
): Promise<Resultado> {
  const certPem = certificadoEnPem(entrada);
  if (!certPem) {
    return { ok: false, motivo: "Eso no parece un certificado. Pegá el texto que empieza con «-----BEGIN CERTIFICATE-----» o subí el .crt." };
  }
  let pedido: PedidoAbierto | null;
  try {
    pedido = await abrirPedido(tenantId);
  } catch (e) {
    return { ok: false, motivo: errorDeCargaEnCriollo(e) };
  }
  if (!pedido) {
    const yaCargado = await credencialParaTenant(tenantId)
      .then((c) => huellaDeCertificado(c.certPem) === huellaDeCertificado(certPem))
      .catch(() => false);
    if (yaCargado) return { ok: true, mensaje: "Ese certificado ya está cargado." };
    return { ok: false, motivo: "No hay un pedido de certificado pendiente: generalo en el paso 2 y usá ese .csr en ARCA." };
  }
  let r: Awaited<ReturnType<typeof cargarCredencialTenant>>;
  try {
    r = await cargarCredencialTenant({ tenantId, certPem, keyPem: pedido.keyPem, actor });
  } catch (e) {
    return { ok: false, motivo: errorDeCargaEnCriollo(e) };
  }
  await enElNegocio(tenantId, (tx) =>
    tx.arcaAuthTicket.deleteMany({ where: { tenantId, certHuella: huellaDelPedido(tenantId), service: SERVICIO_PEDIDO } }),
  ).catch((e) => {
    // El certificado ya quedó: un pedido que no se borró sólo hace que el asistente lo siga mostrando.
    logger.warn("arca.asistente", "No se pudo borrar el pedido de certificado ya usado", { tenantId, err: e instanceof Error ? e.name : "error" });
  });
  const vence = r.certNotAfter ? ` Vence el ${fechaCorta(r.certNotAfter.toISOString())}.` : "";
  return { ok: true, mensaje: `Certificado ${r.rotada ? "renovado" : "cargado"}.${vence} Ahora probalo con ARCA.` };
}

// ── Estado del asistente ─────────────────────────────────────────────────────

async function ultimoPedidoDePase(tenantId: string): Promise<PedidoDePase | null> {
  const fila = await enElNegocio(tenantId, (tx) =>
    tx.auditLog.findFirst({
      where: { tenantId, action: { in: ACCIONES_DEL_PASE } },
      orderBy: { createdAt: "desc" },
      select: { action: true, actor: true, createdAt: true },
    }),
  );
  if (!fila || fila.action !== ACCION_PEDIDO_DE_PASE) return null;
  return { pedidoEn: fila.createdAt.toISOString(), por: fila.actor };
}

export interface VistaDelAsistente {
  entrada: EntradaAsistente;
  estado: EstadoDelAsistente;
  csrPem: string | null;
}

/**
 * Lo que muestra el asistente. null si el negocio no existe. La ficha del operador ya leyó la ficha
 * del pase (abre el certificado): la pasa para no abrirlo dos veces.
 */
export async function leerAsistente(tenantId: string, fichaYaLeida?: FichaFiscalDelPase | null): Promise<VistaDelAsistente | null> {
  const [ficha, pedido, pedidoDePase] = await Promise.all([
    fichaYaLeida !== undefined ? fichaYaLeida : leerFichaDelPase(tenantId, modoDesdeEnv()),
    leerPedidoPendiente(tenantId),
    ultimoPedidoDePase(tenantId).catch(() => null),
  ]);
  if (!ficha) return null;
  const entrada: EntradaAsistente = {
    ficha,
    pedidoPendiente: pedido && { creadoEn: pedido.creadoEn },
    pedidoDePase,
  };
  return { entrada, estado: estadoDelAsistente(entrada), csrPem: pedido?.csrPem ?? null };
}

/**
 * Paso 4 (cliente): deja el PEDIDO de pase en AuditLog para que lo aplique un operador. Con candado
 * por negocio y relectura adentro: dos clics no dejan dos pedidos.
 */
export async function pedirPaseDelNegocio(tenantId: string, actor: string, confirmacion: unknown): Promise<Resultado> {
  if (!confirmaElPase(confirmacion)) {
    return { ok: false, motivo: `Para confirmar escribí ${PALABRA_DEL_PASE}.` };
  }
  const vista = await leerAsistente(tenantId);
  if (!vista) return { ok: false, motivo: "No existe el negocio." };
  if (vista.entrada.pedidoDePase) {
    return { ok: true, mensaje: `Ya lo pediste el ${fechaCorta(vista.entrada.pedidoDePase.pedidoEn)}: GSG lo está revisando.` };
  }
  if (!vista.estado.puedePedirPase) {
    const falta = vista.estado.precondiciones.filter((p) => !p.ok && p.id !== "modoArca" && p.id !== "comprobantesDePrueba");
    return {
      ok: false,
      motivo: falta.length ? `Todavía falta: ${falta.map((p) => p.detalle).join(" ")}` : "Este negocio no está listo para pedir el pase.",
    };
  }
  const creado = await enElNegocio(tenantId, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pedido-pase:${tenantId}`}))`;
    const ultimo = await tx.auditLog.findFirst({
      where: { tenantId, action: { in: ACCIONES_DEL_PASE } },
      orderBy: { createdAt: "desc" },
      select: { action: true },
    });
    if (ultimo?.action === ACCION_PEDIDO_DE_PASE) return false;
    await tx.auditLog.create({
      data: { tenantId, actor, action: ACCION_PEDIDO_DE_PASE, entity: "Tenant", entityId: tenantId, changes: { slug: vista.entrada.ficha.slug } },
    });
    return true;
  });
  logger.info("arca.asistente", "Pedido de pase a producción", { tenantId, nuevo: creado });
  return { ok: true, mensaje: "Listo: le avisamos a GSG. Revisan las condiciones y te confirman el pase a producción." };
}
