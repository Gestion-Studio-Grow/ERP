// ============================================================================
// Reglas del pedido de alta de un cliente desde el estudio contable (GSG-20, GSG-21). PURO.
// ============================================================================
//
// Vive fuera de `cartera-actions.ts` porque un módulo "use server" sólo puede exportar funciones
// async: las constantes que la action, el formulario de /contador, la consola y los tests comparten
// van acá. Client-safe: no importa nada de Prisma ni del servidor.
//
// GSG-20 DE RAÍZ (26/09, orden del dueño: «que lo administre Soporte GSG»): el estudio YA NO crea
// negocios. «Agregar un cliente» deja un PEDIDO y contesta SIEMPRE lo mismo, con cualquier CUIT
// —uno libre, uno de otro negocio, el propio—, porque la action no mira la plataforma: sólo valida
// lo que se escribió (dígito verificador, email) y guarda el pedido. Soporte GSG lo configura desde
// la consola (/operador/solicitudes) y decide ahí, con criterio, si el CUIT ya existe.

import { cuitValido, normalizarCuit } from "@/plugins/bancos/domain/cuit";
import type { PlanId } from "@/planes/catalogo";

/** Lo que ve el estudio después de pedir el alta. La MISMA frase para cualquier CUIT válido. */
export const RESPUESTA_SOLICITUD_ALTA =
  "Recibimos el pedido. Soporte GSG lo configura y te avisa por WhatsApp.";

/**
 * Cuando el pedido no se pudo guardar (la base no respondió). No depende del CUIT: falla igual para
 * cualquiera, así que no le cuenta nada al estudio sobre otros negocios.
 */
export const ERROR_AL_GUARDAR_SOLICITUD =
  "No pudimos registrar el pedido. Probá de nuevo en un rato; si sigue, escribile a Soporte GSG.";

/** Dónde se guarda el pedido: una fila de AuditLog del ESTUDIO (con RLS), con esta acción. */
export const ACCION_SOLICITUD_ALTA = "cartera.solicitud_alta";
/** Cierre del pedido: otra fila, colgada del id del pedido (entityId). Soporte lo configuró… */
export const ACCION_SOLICITUD_CONFIGURADA = "cartera.solicitud_configurada";
/** …o Soporte lo descartó (repetido, datos imposibles), con su motivo. */
export const ACCION_SOLICITUD_DESCARTADA = "cartera.solicitud_descartada";
/**
 * FUENTE ÚNICA de «qué cierra un pedido». La usan el estudio (¿hay uno abierto de este CUIT? →
 * no se duplica) y la bandeja de Soporte (¿sigue pendiente?). Si cada lado tuviera su lista, un
 * descartado contaría como abierto para el estudio y como cerrado para Soporte: el CUIT quedaba
 * bloqueado para siempre y el pedido nuevo se perdía sin avisar (hallazgo C1 del refutador).
 */
export const ACCIONES_QUE_CIERRAN_LA_SOLICITUD: readonly string[] = [
  ACCION_SOLICITUD_CONFIGURADA,
  ACCION_SOLICITUD_DESCARTADA,
];
export const ENTIDAD_SOLICITUD = "SolicitudAltaCliente";

/**
 * ¿Queda algún pedido abierto? Abierto = no tiene ninguna fila de cierre colgada. Pura: la consulta
 * trae los ids de los pedidos del CUIT y los entityId de sus cierres.
 */
export function hayPedidoAbierto(idsPedidos: readonly string[], idsCerrados: Iterable<string | null>): boolean {
  const cerrados = new Set(idsCerrados);
  return idsPedidos.some((id) => !cerrados.has(id));
}

/**
 * El plan con el que nace un cliente chico de un estudio: facturación pura (sus módulos, `arca` y
 * `bancos`, están dentro de ese plan). Antes nacía sin plan: sin topes ni precio (GSG-21).
 */
export const PLAN_DEL_ALTA_DEL_ESTUDIO: PlanId = "facturacion";

/** La acción de auditoría que marca en la consola «alta del estudio X» (se lee en la ficha). */
export const ACCION_ALTA_DEL_ESTUDIO = "cartera.alta";

// ── Condición frente al IVA (los valores de Tenant.arcaCondicionIva) ─────────

export const CONDICIONES_IVA = ["RESPONSABLE_INSCRIPTO", "MONOTRIBUTO", "EXENTO"] as const;
export type CondicionIva = (typeof CONDICIONES_IVA)[number];

export const NOMBRE_CONDICION_IVA: Readonly<Record<CondicionIva, string>> = {
  RESPONSABLE_INSCRIPTO: "Responsable inscripto",
  MONOTRIBUTO: "Monotributista",
  EXENTO: "IVA exento",
};

export function esCondicionIva(x: unknown): x is CondicionIva {
  return typeof x === "string" && (CONDICIONES_IVA as readonly string[]).includes(x);
}

// ── Tamaño del cliente → plan sugerido ────────────────────────────────────────

export const TAMANIOS = ["chico", "comercio", "varios-locales"] as const;
export type Tamanio = (typeof TAMANIOS)[number];

export const NOMBRE_TAMANIO: Readonly<Record<Tamanio, string>> = {
  chico: "Sólo factura (profesional, servicio chico)",
  comercio: "Comercio con mostrador",
  "varios-locales": "Varios locales",
};

export function esTamanio(x: unknown): x is Tamanio {
  return typeof x === "string" && (TAMANIOS as readonly string[]).includes(x);
}

/**
 * El plan que el configurador propone según el tamaño (la escalera de src/planes/catalogo.ts):
 * chico → Facturación; comercio → Micro (Comerciante si Soporte lo sube); varios locales → PyME.
 * Sin dato, el más chico: subir de plan después no migra datos, bajar sí quita pantallas.
 */
export function planSugerido(tamanio: Tamanio | null): PlanId {
  if (tamanio === "comercio") return "micro";
  if (tamanio === "varios-locales") return "pyme";
  return PLAN_DEL_ALTA_DEL_ESTUDIO;
}

/** Los planes que tiene sentido ofrecer para cada tamaño (el primero es el sugerido). */
export function planesPosibles(tamanio: Tamanio | null): PlanId[] {
  if (tamanio === "comercio") return ["micro", "comerciante"];
  if (tamanio === "varios-locales") return ["pyme"];
  return ["facturacion", "micro", "comerciante", "pyme"];
}

// ── Datos comunes: WhatsApp, punto de venta, email ───────────────────────────

/**
 * WhatsApp argentino: sólo dígitos, de 10 a 13 (con o sin 54 y el 9). Vacío = no informado. PURA.
 * No se «arregla» nada: un número mal tipeado se rechaza, no se adivina.
 */
export function validarWhatsapp(raw: unknown): { ok: true; whatsapp: string | null } | { ok: false; error: string } {
  const texto = typeof raw === "string" ? raw.trim() : "";
  if (texto === "") return { ok: true, whatsapp: null };
  if (!/^[+\d\s().-]+$/.test(texto)) {
    return { ok: false, error: "El WhatsApp lleva sólo números (con característica, sin 0 ni 15)." };
  }
  const digitos = texto.replace(/\D/g, "");
  if (digitos.length < 10 || digitos.length > 13) {
    return { ok: false, error: "El WhatsApp lleva sólo números (con característica, sin 0 ni 15)." };
  }
  return { ok: true, whatsapp: digitos };
}

/** Punto de venta: vacío = no informado; si viene, un entero de 1 a 99999. PURA. */
export function validarPuntoDeVenta(raw: unknown): { ok: true; puntoVenta: number | null } | { ok: false; error: string } {
  const texto = raw == null ? "" : String(raw).trim();
  if (texto === "") return { ok: true, puntoVenta: null };
  const n = /^\d{1,5}$/.test(texto) ? Number(texto) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > 99_999) {
    return {
      ok: false,
      error: "El punto de venta es un número de 1 a 5 cifras: el que el cliente dio de alta en ARCA para factura electrónica.",
    };
  }
  return { ok: true, puntoVenta: n };
}

export function emailValido(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

// ── El pedido que deja el estudio ────────────────────────────────────────────

export interface SolicitudAltaInput {
  nombre?: string;
  cuit?: string;
  email?: string;
  whatsapp?: string;
  puntoVenta?: string | number | null;
  condicionIva?: string;
  tamanio?: string;
  alias?: string;
  nota?: string;
}

export interface SolicitudAlta {
  nombre: string;
  cuit: string;
  email: string;
  whatsapp: string | null;
  puntoVenta: number | null;
  condicionIva: CondicionIva | null;
  tamanio: Tamanio | null;
  alias: string;
  nota: string | null;
}

export const NOTA_MAX = 300;

/**
 * Valida el pedido. PURA: los errores dependen SÓLO de lo que se escribió, nunca de la base (si no,
 * volvería a ser un oráculo de CUITs). CUIT con dígito verificador, el mismo criterio que bancos.
 */
export function validarSolicitudAlta(input: SolicitudAltaInput): { ok: true; solicitud: SolicitudAlta } | { ok: false; error: string } {
  const nombre = (input.nombre ?? "").trim().replace(/\s+/g, " ");
  if (nombre.length < 2 || nombre.length > 120) {
    return { ok: false, error: "Poné la razón social o el nombre del negocio (de 2 a 120 letras)." };
  }
  const cuit = normalizarCuit(input.cuit ?? "");
  if (!cuitValido(cuit)) return { ok: false, error: "El CUIT no es válido: revisá los 11 números." };
  const email = (input.email ?? "").trim().toLowerCase();
  if (!emailValido(email)) return { ok: false, error: "El email del cliente no es válido." };
  const wa = validarWhatsapp(input.whatsapp);
  if (!wa.ok) return wa;
  const pv = validarPuntoDeVenta(input.puntoVenta);
  if (!pv.ok) return pv;
  const condicion = (input.condicionIva ?? "").trim();
  if (condicion !== "" && !esCondicionIva(condicion)) {
    return { ok: false, error: "Elegí la condición frente al IVA de la lista." };
  }
  const tamanio = (input.tamanio ?? "").trim();
  if (tamanio !== "" && !esTamanio(tamanio)) return { ok: false, error: "Elegí el tamaño del cliente de la lista." };
  const nota = (input.nota ?? "").trim();
  if (nota.length > NOTA_MAX) return { ok: false, error: `La nota va hasta ${NOTA_MAX} letras.` };
  const alias = (input.alias ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  return {
    ok: true,
    solicitud: {
      nombre,
      cuit,
      email,
      whatsapp: wa.whatsapp,
      puntoVenta: pv.puntoVenta,
      condicionIva: condicion === "" ? null : (condicion as CondicionIva),
      tamanio: tamanio === "" ? null : (tamanio as Tamanio),
      alias: alias || nombre,
      nota: nota || null,
    },
  };
}

/**
 * Lee un pedido guardado (el `changes` de la fila de AuditLog). Lo re-valida: la fila es de la base,
 * pero el configurador no confía en nada que no haya pasado por las mismas reglas.
 */
export function leerSolicitudGuardada(changes: unknown): SolicitudAlta | null {
  if (!changes || typeof changes !== "object") return null;
  const c = changes as Record<string, unknown>;
  const r = validarSolicitudAlta({
    nombre: typeof c.nombre === "string" ? c.nombre : undefined,
    cuit: typeof c.cuit === "string" ? c.cuit : undefined,
    email: typeof c.email === "string" ? c.email : undefined,
    whatsapp: typeof c.whatsapp === "string" ? c.whatsapp : undefined,
    puntoVenta: typeof c.puntoVenta === "number" ? c.puntoVenta : null,
    condicionIva: typeof c.condicionIva === "string" ? c.condicionIva : undefined,
    tamanio: typeof c.tamanio === "string" ? c.tamanio : undefined,
    alias: typeof c.alias === "string" ? c.alias : undefined,
    nota: typeof c.nota === "string" ? c.nota : undefined,
  });
  return r.ok ? r.solicitud : null;
}

/** Un pedido de alta que el estudio mandó y Soporte GSG todavía no configuró ni descartó. */
export interface AltaEnCurso {
  id: string;
  nombre: string;
  cuit: string;
  pedidoEl: Date;
}

/**
 * Los pedidos de alta abiertos del estudio, del más viejo al más nuevo, para que la contadora vea
 * que siguen en curso. «Cerrado» es la misma lista que usan la acción y la bandeja de Soporte
 * (ACCIONES_QUE_CIERRAN_LA_SOLICITUD); una fila ilegible no se muestra.
 */
export function altasEnCurso(
  pedidos: readonly { id: string; createdAt: Date; changes: unknown }[],
  idsCerrados: Iterable<string | null>,
): AltaEnCurso[] {
  const cerrados = new Set<string | null>(idsCerrados);
  const abiertos: AltaEnCurso[] = [];
  for (const p of pedidos) {
    if (cerrados.has(p.id)) continue;
    const s = leerSolicitudGuardada(p.changes);
    if (!s) continue;
    abiertos.push({ id: p.id, nombre: s.nombre, cuit: s.cuit, pedidoEl: p.createdAt });
  }
  return abiertos.sort((a, b) => a.pedidoEl.getTime() - b.pedidoEl.getTime());
}

/** Un pedido de alta que Soporte GSG DESCARTÓ: la contadora ve el motivo en vez de que desaparezca. */
export interface AltaDescartada {
  id: string;
  nombre: string;
  cuit: string;
  motivo: string;
  descartadoEl: Date;
}

/** Cuántos días se muestra un descarte en la cartera. */
export const DIAS_QUE_SE_MUESTRA_UN_DESCARTE = 30;

/**
 * Los pedidos del estudio que Soporte descartó en los últimos 30 días, con su motivo, del más nuevo
 * al más viejo. No se muestra si después el estudio volvió a pedir ese CUIT (el pedido nuevo manda).
 * PURA: recibe las filas del ESTUDIO (su registro, con RLS): no ve nada de otros negocios.
 */
export function altasDescartadas(
  pedidos: readonly { id: string; createdAt: Date; changes: unknown }[],
  descartes: readonly { entityId: string | null; createdAt: Date; changes: unknown }[],
  ahora: Date,
): AltaDescartada[] {
  const desde = ahora.getTime() - DIAS_QUE_SE_MUESTRA_UN_DESCARTE * 24 * 60 * 60 * 1000;
  const leidos = pedidos
    .map((p) => ({ p, s: leerSolicitudGuardada(p.changes) }))
    .filter((x): x is { p: (typeof pedidos)[number]; s: SolicitudAlta } => x.s !== null);
  const salida: AltaDescartada[] = [];
  for (const d of descartes) {
    if (d.createdAt.getTime() < desde) continue;
    const pedido = leidos.find((x) => x.p.id === d.entityId);
    if (!pedido) continue;
    const pidioDespues = leidos.some((x) => x.s.cuit === pedido.s.cuit && x.p.createdAt.getTime() > pedido.p.createdAt.getTime());
    if (pidioDespues) continue;
    const m = (d.changes as { motivo?: unknown } | null)?.motivo;
    salida.push({
      id: pedido.p.id,
      nombre: pedido.s.nombre,
      cuit: pedido.s.cuit,
      motivo: typeof m === "string" && m.trim() !== "" ? m.trim() : "Soporte GSG no dejó el motivo.",
      descartadoEl: d.createdAt,
    });
  }
  return salida.sort((a, b) => b.descartadoEl.getTime() - a.descartadoEl.getTime());
}

/** Los campos obligatorios del pedido de alta que están vacíos, con su mensaje (propio, no el globo del navegador). PURA. */
export type CampoDelAlta = "nombre" | "cuit" | "email" | "puntoVenta";
export function faltantesDelAlta(x: Record<CampoDelAlta, string>): Partial<Record<CampoDelAlta, string>> {
  const faltan: Partial<Record<CampoDelAlta, string>> = {};
  if (x.nombre.trim().length < 2) faltan.nombre = "Falta el nombre del negocio.";
  if (x.cuit.trim() === "") faltan.cuit = "Falta el CUIT: está en la constancia de inscripción de ARCA.";
  if (x.email.trim() === "") faltan.email = "Falta el email del cliente.";
  else if (!emailValido(x.email.trim().toLowerCase())) faltan.email = "El email no es válido: revisalo.";
  if (x.puntoVenta.trim() === "") faltan.puntoVenta = "Falta el punto de venta: sin él el cliente no puede facturar.";
  return faltan;
}
