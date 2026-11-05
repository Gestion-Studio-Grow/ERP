// ============================================================================
// «OBTENÉ ASISTENCIA» — la parte PURA del asistente ARCA
// ============================================================================
//
// DECISIÓN DEL DUEÑO (05/11/2026): GSG no hace trámites en ARCA por el usuario ni usa delegación a
// su CUIT. Cada negocio tiene su certificado PROPIO: lo crea el usuario o SU contador, con la relación
// que ese contador ya tiene con él en ARCA; la clave fiscal nunca pasa por GSG. Base legal:
// RG 5048/2021 art. 4, A VALIDAR POR LEGALES.
//
// Dos opciones, nada más:
//  1) «Elegí tu contador»: UNO de los estudios que usan los sistemas de GSG (consola del contador
//     activa = módulo `cartera`, leído de la base; nada inventado). Se le avisa por WhatsApp si el estudio
//     tiene número cargado (y en su consola: pendiente) con un resumen SIN datos fiscales sensibles
//     (sin CUIT completo, sin clave). Sin estudios: «Todavía no hay contadores disponibles: contactate con GSG».
//  2) «Contactate con GSG»: WhatsApp de soporte (WHATSAPP_GSG) con un mensaje armado; soporte guía, el
//     trámite en ARCA lo hace el cliente. Sin número cargado: «provisional a confirmar», sin romper.
//
// Estado SIN migración: AuditLog del NEGOCIO (ACCIONES_CONTADOR, la última fila manda) más lo cargado:
// pedido → en curso (hay pedido de certificado pendiente o certificado cargado sin prueba verde) →
// listo (certificado cargado y «Probar» en verde DESPUÉS de cargarlo: ACCION_PRUEBA_OK).

import { leerWhatsApp } from "@/lib/whatsapp-cta";
import type { EstadoDelAsistente } from "./asistente-arca";

/** Espejo de MODULO_CARTERA (src/lib/cartera-core.ts): no se importa para no arrastrar su cadena al módulo puro. */
const MODULO_CARTERA = "cartera";

export const ACCIONES_CONTADOR = {
  pedido: "fiscal.contador-arca.pedido",
  cancelado: "fiscal.contador-arca.cancelado",
} as const;
export const LISTA_ACCIONES_CONTADOR: string[] = Object.values(ACCIONES_CONTADOR);

/** «Probar con ARCA» salió bien (metadata, sin material). Es lo que hace «listo». */
export const ACCION_PRUEBA_OK = "fiscal.arca.prueba-ok";

export type EstadoContador = "pedido" | "en-curso" | "listo";

export interface ContadorDeLaRed {
  tenantId: string;
  nombre: string;
}

export interface FilaContador {
  action: string;
  createdAt: string;
  changes: unknown;
}

export interface PedidoAlContador {
  estado: EstadoContador;
  estudioTenantId: string;
  estudioNombre: string;
  pedidoEn: string;
}

export const BASE_LEGAL_A_VALIDAR = "RG 5048/2021 art. 4 (a validar por legales)";

export const TEXTO_CERTIFICADO_PROPIO =
  "Lo hacés vos, sin trámites raros: el sistema arma el pedido, vos lo pegás en ARCA y pegás acá lo que ARCA te devuelve. " +
  "GSG no entra a tu ARCA ni te pide la clave fiscal: queda con vos.";

/** Lo que conviene tener a mano ANTES de arrancar (se muestra arriba del asistente). */
export const ANTES_DE_EMPEZAR =
  "Antes de empezar: necesitás tu clave fiscal nivel 3. Si no sabés qué nivel tenés, entrá a ARCA: si te deja abrir " +
  "«Administración de Certificados Digitales», ya está. Si no, se sube en un cajero (Banelco o Link) o en ARCA con la app Mi ARCA.";

export const ETIQUETA_ESTADO_CONTADOR: Record<EstadoContador, string> = {
  pedido: "Pedido",
  "en-curso": "En curso",
  listo: "Listo",
};

/** Los estudios con consola del contador (módulo `cartera`), no suspendidos, sin el propio negocio, por nombre. */
export function contadoresDeLaRed(
  negocios: Array<{ id: string; name: string; modules: string[]; status?: string }>,
  propioTenantId: string,
): ContadorDeLaRed[] {
  return negocios
    .filter((n) => n.id !== propioTenantId && n.modules.includes(MODULO_CARTERA) && n.status !== "SUSPENDED")
    .map((n) => ({ tenantId: n.id, nombre: n.name.trim() || "Estudio sin nombre" }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** El estudio elegido en el formulario, sólo si está en la red leída de la base (nunca un nombre que llega). */
export function elegirContador(red: ContadorDeLaRed[], elegido: unknown): ContadorDeLaRed | null {
  if (typeof elegido !== "string" || !elegido) return null;
  return red.find((c) => c.tenantId === elegido) ?? null;
}

function estudioDe(changes: unknown): { estudioTenantId: string; estudioNombre: string } | null {
  if (!changes || typeof changes !== "object") return null;
  const c = changes as Record<string, unknown>;
  if (typeof c.estudioTenantId !== "string" || !c.estudioTenantId) return null;
  return {
    estudioTenantId: c.estudioTenantId,
    estudioNombre: typeof c.estudioNombre === "string" && c.estudioNombre ? c.estudioNombre : "Tu contador",
  };
}

export interface ProgresoDelCertificado {
  pedidoPendiente: boolean;
  certificado: EstadoDelAsistente["certificado"];
  /** ISO de la última carga/rotación del certificado, o null. */
  certificadoDesde: string | null;
  /** ISO del último «Probar» en verde, o null. */
  pruebaOkEn: string | null;
}

/** «Listo» = certificado cargado (sin problema) y «Probar» en verde DESPUÉS de cargarlo. */
export function certificadoProbado(p: ProgresoDelCertificado): boolean {
  if (p.certificado !== "pruebas" && p.certificado !== "produccion") return false;
  if (!p.pruebaOkEn) return false;
  return !p.certificadoDesde || p.pruebaOkEn >= p.certificadoDesde;
}

/** El pedido al contador según la última fila y lo cargado. null = no hay (nunca se pidió, se canceló o la fila no trae el estudio). */
export function pedidoAlContador(ultima: FilaContador | null, progreso: ProgresoDelCertificado): PedidoAlContador | null {
  if (!ultima || ultima.action !== ACCIONES_CONTADOR.pedido) return null;
  const estudio = estudioDe(ultima.changes);
  if (!estudio) return null;
  const estado: EstadoContador = certificadoProbado(progreso)
    ? "listo"
    : progreso.pedidoPendiente || progreso.certificado !== "ninguno"
      ? "en-curso"
      : "pedido";
  return { estado, ...estudio, pedidoEn: ultima.createdAt };
}

/** «terminado en 786»: lo único del CUIT que viaja en un mensaje (nunca el CUIT completo). */
export function finDelCuit(cuit: string | null | undefined): string | null {
  const d = String(cuit ?? "").replace(/\D/g, "");
  return d.length === 11 ? d.slice(-3) : null;
}

/**
 * El aviso al estudio elegido: qué le pide el cliente, SIN datos fiscales sensibles (sin CUIT completo,
 * sin clave, sin el pedido de certificado: ese se lo pasa el cliente, copiado del paso 2).
 */
export function avisoAlEstudio(d: { negocio: string; cuit: string | null | undefined }): string {
  const fin = finDelCuit(d.cuit);
  return [
    `Hola, soy de ${d.negocio.trim() || "un negocio"}${fin ? ` (CUIT terminado en ${fin})` : ""}. Facturo con el sistema de Gestión Studio Grow y los elegí para que me hagan el certificado de ARCA para «Facturación Electrónica», con su relación conmigo en ARCA.`,
    "Les paso el pedido de certificado que me da el sistema; ustedes me devuelven el certificado y lo asocian a «Facturación Electrónica» en Administrador de Relaciones.",
    "GSG no entra a mi ARCA ni tiene mi clave fiscal.",
  ].join("\n");
}

/** El mensaje a soporte de GSG: pide guía, no que GSG haga el trámite. Sin CUIT completo. */
export function mensajeASoporte(d: { negocio: string; cuit: string | null | undefined; paso: string }): string {
  const fin = finDelCuit(d.cuit);
  return [
    `Hola, soy de ${d.negocio.trim() || "mi negocio"}${fin ? ` (CUIT terminado en ${fin})` : ""}. Estoy conectando la facturación con ARCA y me trabé en: ${d.paso}.`,
    "¿Me guían? El trámite en ARCA lo hago yo.",
  ].join("\n");
}

/** wa.me con el texto armado, o null si el número no sirve (la pantalla dice «provisional a confirmar»). */
export function linkWhatsapp(numero: string | null | undefined, texto: string): string | null {
  const l = leerWhatsApp(numero);
  if (l.tipo !== "argentino" && l.tipo !== "otroPais") return null;
  return `https://wa.me/${l.numero}?text=${encodeURIComponent(texto)}`;
}

/** Qué le decimos al negocio según el estado (criollo). */
export function textoDelPedidoAlContador(p: PedidoAlContador): string {
  switch (p.estado) {
    case "pedido":
      return `Se lo pediste a ${p.estudioNombre}. Copiale el pedido de certificado del paso 2 y mandáselo: lo hace con su relación con vos en ARCA. GSG no entra a tu ARCA.`;
    case "en-curso":
      return `${p.estudioNombre} está con el certificado. Cuando te pase lo que le dio ARCA, pegalo en el paso 3 y tocá «Probar con ARCA».`;
    case "listo":
      return "Listo: el certificado está cargado y la prueba con ARCA salió bien.";
  }
}
