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
import { enElNegocio, operatorPrisma } from "@/lib/operator-db";
import { logger } from "@/lib/logger";
import { isUniqueViolation } from "@/lib/prisma-errors";
import { elSobreAbre, masterKeyDesdeEnv, openSecret, sealSecret } from "@/lib/fiscal/cert-crypto";
import {
  cargarCredencialTenant,
  credencialParaTenant,
  registrarPruebaArcaOk,
  versionDeLaCredencial,
  type CredencialProbada,
} from "@/lib/fiscal/tenant-cert";
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
  hayPedidoEnCurso,
  leerPedidoConEstado,
  confirmaElDescarte,
  MOTIVO_PEDIDO_EN_CURSO,
  MOTIVO_SIN_CONFIGURACION,
  motivoParaNoDescartar,
  motivoParaNoReemplazarPedido,
  PALABRA_DEL_DESCARTE,
  pedidoCambioDesdeQueSeLeyo,
  problemaDelPedido,
  PALABRA_DEL_PASE,
  sinChoqueDePedido,
  type EntradaAsistente,
  type LecturaDelPedido,
  type EstadoDelAsistente,
  type PedidoDePase,
} from "./asistente-arca";
import {
  ACCION_PRUEBA_OK,
  ACCIONES_CONTADOR,
  LISTA_ACCIONES_CONTADOR,
  contadoresDeLaRed,
  elegirContador,
  avisoAlEstudio,
  linkWhatsapp,
  mensajeASoporte,
  pedidoAlContador,
  type ContadorDeLaRed,
  type FilaContador,
  type PedidoAlContador,
} from "./contador-arca";

export const SERVICIO_PEDIDO = "pedido-csr";
const huellaDelPedido = (tenantId: string) => `pedido-csr:${tenantId}`;

type Tx = Parameters<Parameters<typeof enElNegocio>[1]>[0];

/** El candado del pedido del negocio (hasta el fin de la transacción): guardar y descartar se turnan. */
async function bloquearPedido(tx: Tx, tenantId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${huellaDelPedido(tenantId)}))`;
}

/** Acciones de AuditLog del asistente (metadata, nunca material). */
export const ACCION_PEDIDO_CSR = "fiscal.csr.generado";
export const ACCION_PEDIDO_DESCARTADO = "fiscal.csr.descartado";
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

async function leerFilaDelPedido(tenantId: string) {
  return enElNegocio(tenantId, (tx) =>
    tx.arcaAuthTicket.findFirst({
      where: { tenantId, certHuella: huellaDelPedido(tenantId), service: SERVICIO_PEDIDO },
      select: { id: true, kekId: true, wrappedDek: true, sealed: true, expiration: true },
    }),
  );
}

type FilaDelPedido = NonNullable<Awaited<ReturnType<typeof leerFilaDelPedido>>>;

function abrirFila(fila: FilaDelPedido, master: ReturnType<typeof masterKeyDesdeEnv>): PedidoAbierto {
  const { keyPem, csrPem } = JSON.parse(openSecret(fila, master)) as { keyPem: string; csrPem: string };
  return { keyPem, csrPem, creadoEn: fila.expiration };
}

async function abrirPedido(tenantId: string): Promise<(PedidoAbierto & { id: string }) | null> {
  const fila = await leerFilaDelPedido(tenantId);
  if (!fila) return null;
  return { ...abrirFila(fila, masterKeyDesdeEnv()), id: fila.id };
}

/**
 * El pedido pendiente para mostrar (sólo el .csr y la fecha; la clave no sale), con la causa separada
 * si falla: base («ilegible», reintentar), clave maestra («sin-configuracion»), fila cerrada con otra
 * clave maestra que no abre («otra-clave», no se pisa) o fila que no abre con su clave («dañado», se
 * puede generar otro). Nunca «no hay pedido» por un error: la pantalla ofrecería generar
 * otro y eso invalida el .csr que el dueño quizá ya subió a ARCA.
 */
export async function leerPedidoPendiente(tenantId: string, alLeerFila?: (id: string | null) => void): Promise<LecturaDelPedido> {
  return leerPedidoConEstado({
    leerFila: async () => {
      const fila = await leerFilaDelPedido(tenantId);
      alLeerFila?.(fila?.id ?? null);
      return fila;
    },
    clave: () => masterKeyDesdeEnv(),
    abrir: (fila, master) => {
      const p = abrirFila(fila, master);
      return { csrPem: p.csrPem, creadoEn: p.creadoEn };
    },
    sobreAbre: elSobreAbre,
    // Sólo la causa y el nombre del error: el mensaje podría traer datos del entorno o del sobre.
    alFallar: (causa, e) =>
      logger.warn("arca.asistente", "No se pudo abrir el pedido de certificado pendiente", {
        tenantId,
        causa,
        err: e instanceof Error ? e.name : "error",
      }),
  });
}

/** Un pedido nuevo listo para guardar: el sobre cerrado y la fila de pedido que había al decidir. */
export interface PedidoPreparado {
  tenantId: string;
  sobre: ReturnType<typeof sealSecret>;
  subject: string;
  /** El id de la fila de pedido que se leyó al preparar (null = no había). */
  filaVista: string | null;
}

/**
 * Paso 2, primera mitad: lee el pedido que hay, decide si se puede reemplazar y genera clave + CSR,
 * cerrados con la master key. No escribe nada. Si el pedido anterior no se pudo leer por la base,
 * falta la clave maestra o se guardó con otra clave que no lo abre, no sigue; si está dañado, sí
 * (ver `leerPedidoPendiente`).
 */
export async function prepararPedidoDelNegocio(
  tenantId: string,
): Promise<{ ok: true; pedido: PedidoPreparado } | { ok: false; motivo: string }> {
  const t = await enElNegocio(tenantId, (tx) =>
    tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true, arcaCuit: true, arcaRazonSocial: true } }),
  );
  if (!t) return { ok: false, motivo: "No existe el negocio." };
  // Un pedido que no se pudo leer no se pisa (llamada directa o doble clic con la pantalla vieja).
  let filaVista: string | null = null;
  const lectura = await leerPedidoPendiente(tenantId, (id) => {
    filaVista = id;
  });
  const noReemplazar = motivoParaNoReemplazarPedido(lectura);
  if (noReemplazar) return { ok: false, motivo: noReemplazar };
  const pedido = generarPedidoDeCertificado({ razonSocial: t.arcaRazonSocial || t.name, cuit: t.arcaCuit ?? "" });
  if (!pedido.ok) return pedido;

  let master: ReturnType<typeof masterKeyDesdeEnv>;
  try {
    master = masterKeyDesdeEnv();
  } catch {
    return { ok: false, motivo: MOTIVO_SIN_CONFIGURACION };
  }
  const sobre = sealSecret(JSON.stringify({ keyPem: pedido.keyPem, csrPem: pedido.csrPem }), master);
  return { ok: true, pedido: { tenantId, sobre, subject: pedido.subject, filaVista } };
}

/** Paso 2, segunda mitad: guarda el pedido preparado (reemplaza el anterior: el .csr viejo deja de servir). */
export async function guardarPedidoDelNegocio(p: PedidoPreparado, actor: string): Promise<Resultado> {
  const { tenantId, sobre, subject } = p;
  const creadoEn = new Date().toISOString();
  // Doble clic: queda UNO y es el primero que se guarda. Con el candado del pedido del negocio se
  // relee la fila: si ya no es la que se vio al preparar, otro pedido se guardó en el medio y este
  // no la pisa (antes el segundo, si llegaba después, borraba el del primero). El índice único
  // (@@unique([certHuella, service]), P2002) queda como segunda red.
  const choque = await sinChoqueDePedido(() => enElNegocio(tenantId, async (tx) => {
    const huella = huellaDelPedido(tenantId);
    await bloquearPedido(tx, tenantId);
    const actual = await tx.arcaAuthTicket.findFirst({
      where: { tenantId, certHuella: huella, service: SERVICIO_PEDIDO },
      select: { id: true },
    });
    if (pedidoCambioDesdeQueSeLeyo(p.filaVista, actual?.id ?? null)) return MOTIVO_PEDIDO_EN_CURSO;
    await tx.arcaAuthTicket.deleteMany({ where: { tenantId, certHuella: huella, service: SERVICIO_PEDIDO } });
    await tx.arcaAuthTicket.create({
      data: { id: randomUUID(), tenantId, certHuella: huella, service: SERVICIO_PEDIDO, ...sobre, expiration: creadoEn },
    });
    await tx.auditLog.create({
      data: { tenantId, actor, action: ACCION_PEDIDO_CSR, entity: "Tenant", entityId: tenantId, changes: { subject, creadoEn } },
    });
    return null;
  }), (e) => isUniqueViolation(e));
  if (choque) return { ok: false, motivo: choque };
  return { ok: true, mensaje: "Pedido de certificado generado: bajá el archivo .csr y seguí las instrucciones." };
}

/** Paso 2: prepara y guarda (ver las dos mitades). No toca el certificado cargado. */
export async function generarPedidoDelNegocio(tenantId: string, actor: string): Promise<Resultado> {
  const r = await prepararPedidoDelNegocio(tenantId);
  if (!r.ok) return r;
  return guardarPedidoDelNegocio(r.pedido, actor);
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
  let pedido: Awaited<ReturnType<typeof abrirPedido>>;
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
    // Sólo la fila que se usó: si en el medio se generó otro pedido, ese queda.
    tx.arcaAuthTicket.deleteMany({ where: { id: pedido.id, tenantId, certHuella: huellaDelPedido(tenantId), service: SERVICIO_PEDIDO } }),
  ).catch((e) => {
    // El certificado ya quedó: un pedido que no se borró sólo hace que el asistente lo siga mostrando.
    logger.warn("arca.asistente", "No se pudo borrar el pedido de certificado ya usado", { tenantId, err: e instanceof Error ? e.name : "error" });
  });
  const vence = r.certNotAfter ? ` Vence el ${fechaCorta(r.certNotAfter.toISOString())}.` : "";
  return { ok: true, mensaje: `Certificado ${r.rotada ? "renovado" : "cargado"}.${vence} Ahora probalo con ARCA.` };
}

// ── Descarte del pedido cerrado con otra clave (sólo el operador) ────────────

/**
 * El operador descarta el pedido que quedó cerrado con OTRA clave maestra (el asistente lo bloquea y
 * el negocio no puede generar otro). Con la confirmación tipeada y el candado del pedido, relee la
 * fila y la clasifica igual que la pantalla (`leerPedidoConEstado`): sólo si es «otra-clave» la borra
 * y deja la fila de AuditLog. El material no sale de acá: para clasificar se usa `elSobreAbre` (no
 * devuelve nada) y la auditoría lleva sólo la etiqueta de la clave y la fecha del pedido.
 * La guardia (sesión de operador y candado de CH) la pone la action (src/lib/operator-actions.ts).
 */
export async function descartarPedidoDeOtraClave(tenantId: string, actor: string, confirmacion: unknown): Promise<Resultado> {
  if (!confirmaElDescarte(confirmacion)) return { ok: false, motivo: `Para confirmar escribí ${PALABRA_DEL_DESCARTE}.` };
  const r = await enElNegocio(tenantId, async (tx): Promise<Resultado> => {
    await bloquearPedido(tx, tenantId);
    let fila: { id: string; kekId: string; wrappedDek: string; sealed: string; expiration: string } | null = null;
    const lectura = await leerPedidoConEstado({
      leerFila: async () => {
        fila = await tx.arcaAuthTicket.findFirst({
          where: { tenantId, certHuella: huellaDelPedido(tenantId), service: SERVICIO_PEDIDO },
          select: { id: true, kekId: true, wrappedDek: true, sealed: true, expiration: true },
        });
        return fila;
      },
      clave: () => masterKeyDesdeEnv(),
      abrir: (f, master) => {
        if (!elSobreAbre(f, master)) throw new Error("El pedido no abre con la clave actual.");
        return { csrPem: "", creadoEn: f.expiration };
      },
      sobreAbre: elSobreAbre,
    });
    const motivo = motivoParaNoDescartar(lectura);
    if (motivo || !fila) return { ok: false, motivo: motivo ?? "No hay un pedido de certificado para descartar." };
    const { id, kekId, expiration } = fila as { id: string; kekId: string; expiration: string };
    await tx.arcaAuthTicket.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        tenantId,
        actor,
        action: ACCION_PEDIDO_DESCARTADO,
        entity: "Tenant",
        entityId: tenantId,
        changes: { motivo: "otra-clave", kekIdDelPedido: kekId, creadoEn: expiration },
      },
    });
    return { ok: true, mensaje: "Pedido de certificado descartado. Ya se puede generar uno nuevo." };
  });
  logger.info("arca.asistente", "Descarte del pedido de certificado de otra clave", { tenantId, ok: r.ok });
  return r;
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
  /** «Obtené asistencia»: el pedido vigente (o null), la red para elegir y el aviso por WhatsApp. */
  contador: PedidoAlContador | null;
  contadores: ContadorDeLaRed[];
  /** wa.me al estudio elegido con el resumen sin datos sensibles; null si el estudio no tiene WhatsApp cargado. */
  avisoAlContador: string | null;
  /** wa.me a soporte de GSG (WHATSAPP_GSG); null = sin número cargado («provisional a confirmar»). */
  soporte: string | null;
}

/**
 * Lo que muestra el asistente. null si el negocio no existe. La ficha del operador ya leyó la ficha
 * del pase (abre el certificado): la pasa para no abrirlo dos veces.
 */
export async function leerAsistente(tenantId: string, fichaYaLeida?: FichaFiscalDelPase | null): Promise<VistaDelAsistente | null> {
  const [ficha, pedido, pedidoDePase, filaContador, contadores, pruebaOkEn, negocio] = await Promise.all([
    fichaYaLeida !== undefined ? fichaYaLeida : leerFichaDelPase(tenantId, modoDesdeEnv()),
    leerPedidoPendiente(tenantId),
    ultimoPedidoDePase(tenantId).catch(() => null),
    ultimaFilaContador(tenantId).catch(() => null),
    leerContadoresDeLaRed(tenantId).catch(() => []),
    ultimaPruebaOk(tenantId).catch(() => null),
    operatorPrisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }).catch(() => null),
  ]);
  if (!ficha) return null;
  const entrada: EntradaAsistente = {
    ficha,
    pedidoPendiente: pedido.estado === "pendiente" ? { creadoEn: pedido.creadoEn } : null,
    problemaDelPedido: problemaDelPedido(pedido),
    pedidoDePase,
  };
  const estado = estadoDelAsistente(entrada);
  const contador = pedidoAlContador(filaContador, {
    // Una fila que existe cuenta como en curso aunque no se haya podido leer o abrir.
    pedidoPendiente: hayPedidoEnCurso(pedido),
    certificado: estado.certificado,
    certificadoDesde: ficha.credencial?.actualizada ?? null,
    pruebaOkEn,
  });
  const nombreNegocio = negocio?.name ?? "";
  const numero = contador ? await whatsappDelEstudio(contador.estudioTenantId).catch(() => null) : null;
  const avisoAlContador = linkWhatsapp(numero, avisoAlEstudio({ negocio: nombreNegocio, cuit: ficha.arcaCuit }));
  const pasoActual = estado.pasos.find((p) => p.estado === "actual")?.titulo ?? "conectar con ARCA";
  const soporte = linkWhatsapp(process.env.WHATSAPP_GSG, mensajeASoporte({ negocio: nombreNegocio, cuit: ficha.arcaCuit, paso: pasoActual }));
  return { entrada, estado, csrPem: pedido.estado === "pendiente" ? pedido.csrPem : null, contador, contadores, avisoAlContador, soporte };
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

// ── «Obtené asistencia» (sin migración: AuditLog del negocio, la última fila manda) ───────

/** Tope del listado provisional de la red (a confirmar por el dueño). */
const TOPE_RED = 100;

/**
 * Los estudios que usan los sistemas de GSG (consola del contador = módulo `cartera`). PROVISIONAL A CONFIRMAR. `Tenant` no
 * tiene RLS: se lee directo, sólo id, nombre, módulos y estado (nada del estudio sale de acá).
 */
export async function leerContadoresDeLaRed(tenantId: string): Promise<ContadorDeLaRed[]> {
  const filas = await operatorPrisma.tenant.findMany({
    where: { modules: { has: "cartera" }, id: { not: tenantId } },
    select: { id: true, name: true, modules: true, status: true },
    orderBy: { name: "asc" },
    take: TOPE_RED,
  });
  return contadoresDeLaRed(filas, tenantId);
}

/** El WhatsApp público del estudio (su ficha de contacto), para el aviso. Sólo ese campo. */
async function whatsappDelEstudio(estudioTenantId: string): Promise<string | null> {
  const fila = await enElNegocio(estudioTenantId, (tx) =>
    tx.businessSettings.findUnique({ where: { tenantId: estudioTenantId }, select: { whatsapp: true } }),
  );
  return fila?.whatsapp ?? null;
}

async function ultimaPruebaOk(tenantId: string): Promise<string | null> {
  const fila = await enElNegocio(tenantId, (tx) =>
    tx.auditLog.findFirst({
      where: { tenantId, action: ACCION_PRUEBA_OK },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  );
  return fila?.createdAt.toISOString() ?? null;
}

/** «Probar con ARCA» salió bien: deja la marca (sin material) que hace «listo» al pedido de asistencia. */
export async function registrarPruebaOk(tenantId: string, actor: string, entorno: string, probada: CredencialProbada | null): Promise<void> {
  // Atada a la versión probada y, en altas web, con el candado del CUIT (tenant-cert.ts): verifica una sola por CUIT.
  await registrarPruebaArcaOk(tenantId, actor, entorno, probada);
}

/** La versión del certificado ANTES de probarlo con ARCA (ver `registrarPruebaArcaOk`). */
export function versionAntesDeProbar(tenantId: string): Promise<CredencialProbada | null> {
  return versionDeLaCredencial(tenantId);
}

async function ultimaFilaContador(tenantId: string): Promise<FilaContador | null> {
  const fila = await enElNegocio(tenantId, (tx) =>
    tx.auditLog.findFirst({
      where: { tenantId, action: { in: LISTA_ACCIONES_CONTADOR } },
      orderBy: { createdAt: "desc" },
      select: { action: true, createdAt: true, changes: true },
    }),
  );
  return fila && { action: fila.action, createdAt: fila.createdAt.toISOString(), changes: fila.changes };
}

/**
 * El negocio elige un estudio de la red (sale de la red leída acá, nunca del nombre del formulario).
 * Candado por negocio: dos clics, un pedido. El aviso al estudio es el WhatsApp de la pantalla.
 */
export async function pedirContadorDelNegocio(tenantId: string, actor: string, elegido: unknown): Promise<Resultado> {
  const estudio = elegirContador(await leerContadoresDeLaRed(tenantId), elegido);
  if (!estudio) return { ok: false, motivo: "Elegí un contador de la lista." };
  const nuevo = await enElNegocio(tenantId, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`contador-arca:${tenantId}`}))`;
    const ultima = await tx.auditLog.findFirst({
      where: { tenantId, action: { in: LISTA_ACCIONES_CONTADOR } },
      orderBy: { createdAt: "desc" },
      select: { action: true, changes: true },
    });
    const mismo =
      ultima &&
      ultima.action !== ACCIONES_CONTADOR.cancelado &&
      (ultima.changes as { estudioTenantId?: unknown } | null)?.estudioTenantId === estudio.tenantId;
    if (mismo) return false;
    await tx.auditLog.create({
      data: {
        tenantId,
        actor,
        action: ACCIONES_CONTADOR.pedido,
        entity: "Tenant",
        entityId: tenantId,
        changes: { estudioTenantId: estudio.tenantId, estudioNombre: estudio.nombre },
      },
    });
    return true;
  });
  logger.info("arca.asistente", "Pedido del certificado al contador", { tenantId, estudioTenantId: estudio.tenantId, nuevo });
  return {
    ok: true,
    mensaje: nuevo
      ? `Listo: quedó pedido a ${estudio.nombre}. Avisale por WhatsApp y pasale el pedido de certificado del paso 2.`
      : `Ya se lo habías pedido a ${estudio.nombre}.`,
  };
}

/** El negocio vuelve a hacerlo él mismo o elige otro estudio (cancela el pedido). Idempotente. */
export async function cancelarContadorDelNegocio(tenantId: string, actor: string): Promise<Resultado> {
  await enElNegocio(tenantId, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`contador-arca:${tenantId}`}))`;
    const ultima = await tx.auditLog.findFirst({
      where: { tenantId, action: { in: LISTA_ACCIONES_CONTADOR } },
      orderBy: { createdAt: "desc" },
      select: { action: true, changes: true },
    });
    if (!ultima || ultima.action === ACCIONES_CONTADOR.cancelado) return;
    await tx.auditLog.create({
      data: {
        tenantId,
        actor,
        action: ACCIONES_CONTADOR.cancelado,
        entity: "Tenant",
        entityId: tenantId,
        changes: { estudioTenantId: (ultima.changes as { estudioTenantId?: string } | null)?.estudioTenantId ?? null },
      },
    });
  });
  return { ok: true, mensaje: "Listo: lo hacés vos. Seguí los pasos del asistente." };
}
