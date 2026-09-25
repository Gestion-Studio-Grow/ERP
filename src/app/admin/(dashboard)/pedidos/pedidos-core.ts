// ============================================================================
// PEDIDOS — el tablero vivo del diseño nuevo («Renglón»), decidido sin base ni React.
// ============================================================================
//
// Lo que la pantalla muestra de cada pedido y lo que ofrece hacer, a partir de los MISMOS datos y
// las MISMAS reglas de siempre (`verboDelPaso` / `siguienteEstado`, order-anulacion.ts). Acá no se
// decide ningún estado nuevo ni se mueve plata: sólo se traduce el estado a
//
//   · un RIEL de pasos físicos (Recibido › En preparación › Listo › Entregado), con la palabra del
//     paso actual. El cobro NO va en el riel: un pedido de la tienda se paga antes de prepararse y
//     uno del mostrador al retirarlo, así que «cobrado» es otra columna y no un paso más;
//   · UNA tecla del paso que sigue (Preparar, Marcar listo, Avisar, Entregar, Cobrar);
//   · los filtros de la URL (`?estado=`, `?canal=pedido|mostrador`, `?q=`) y el orden (`?orden=`);
//   · las acciones EN LOTE que existen: avanzar un paso (agrupado por verbo, porque «Preparar» y
//     «Marcar listo» son pasos distintos) y avisar por WhatsApp uno por uno.
//
// PURO: lo usan el tablero (cliente), la página (servidor) y pedidos-core.test.ts.

import type { TipoMarca } from "@/components/ui/Marca";

/** Lo que el tablero sabe de un pedido abierto. Serializable (viaja del servidor al cliente). */
export type PedidoDelTablero = {
  id: string;
  code: number;
  /** "11:40" si es de hoy; "ayer"; "lun 21/09". En la zona del negocio (lo arma el servidor). */
  cuando: string;
  /** ISO, para ordenar. */
  creado: string;
  canal: "ONLINE" | "COUNTER";
  cliente: string;
  telefono: string | null;
  entrega: "PICKUP" | "DELIVERY";
  /** "Retira hoy 18:00" / "Envío mañana 10:00" (etiquetaDeHorario), o null sin horario pedido. */
  horario: { texto: string; esHoy: boolean } | null;
  /** ISO del horario pedido, para ordenar por «para cuándo». */
  horarioIso: string | null;
  direccion: string | null;
  nota: string | null;
  status: string;
  /**
   * El verbo que avanza el pedido («Preparar», «Marcar listo»…), de `verboDelPaso` (la regla de
   * siempre, order-anulacion.ts), calculado en el servidor. null = no avanza con un toque.
   */
  verbo: string | null;
  cobrado: boolean;
  /** "Efectivo", "Mercado Pago"… si está cobrado con medio; null si no. */
  medio: string | null;
  total: number;
  subtotal: number;
  descuento: number;
  lineas: {
    productId: string | null;
    nombre: string;
    unidad: "UNIT" | "WEIGHT";
    cantidad: number;
    precio: number;
    total: number;
    /** "envío" o "precio a mano" (sólo comercio). */
    marca: string | null;
  }[];
  /** El chat del cliente con el aviso de «tu pedido está listo» armado (sólo Listo, comercio). */
  avisoWa: string | null;
  /** Cuándo se abrió por última vez el aviso de listo (auditoría), "10:12"; null si nunca. */
  avisado: string | null;
};

/** Un pedido cerrado (anulado o entregado y cobrado): historial, con la anulación si aplica. */
export type PedidoCerrado = {
  id: string;
  code: number;
  cuando: string;
  cliente: string;
  status: string;
  cobrado: boolean;
  /** Cobrado sin medio = venta a cuenta. */
  aCuenta: boolean;
  total: number;
  /** ¿Quien mira puede anularlo? (DELIVERED y, si su alcance es sólo hoy, de hoy). */
  anulable: boolean;
};

// ── El riel ───────────────────────────────────────────────────────────────────

export type Riel = { pasos: string[]; hechos: number; palabra: string; tipo: TipoMarca };

const PASOS_COMERCIO = ["Recibido", "En preparación", "Listo", "Entregado"];
// En un negocio de servicios (CH) el pedido pasa por Confirmado, como siempre.
const PASOS_SERVICIOS = ["Recibido", "Confirmado", "En preparación", "Listo", "Entregado"];

/** El riel de un pedido: cuántos pasos físicos hizo y la palabra del actual. */
export function rielDelPedido(p: { status: string; cobrado: boolean; avisado?: string | null }, comercio: boolean): Riel {
  const pasos = comercio ? PASOS_COMERCIO : PASOS_SERVICIOS;
  const orden: Record<string, number> = comercio
    ? { PENDING: 1, CONFIRMED: 1, PREPARING: 2, READY: 3, DELIVERED: 4 }
    : { PENDING: 1, CONFIRMED: 2, PREPARING: 3, READY: 4, DELIVERED: 5 };
  const hechos = orden[p.status] ?? 0;
  switch (p.status) {
    case "PENDING":
      return { pasos, hechos, palabra: "Pendiente", tipo: "pendiente" };
    case "CONFIRMED":
      return { pasos, hechos, palabra: "Confirmado", tipo: "pendiente" };
    case "PREPARING":
      return { pasos, hechos, palabra: "En preparación", tipo: "medias" };
    case "READY":
      return { pasos, hechos, palabra: p.avisado ? `Listo · avisado ${p.avisado}` : "Listo", tipo: "hecho" };
    case "DELIVERED":
      return p.cobrado
        ? { pasos, hechos, palabra: "Entregado y cobrado", tipo: "hecho" }
        : { pasos, hechos, palabra: "Entregado, sin cobrar", tipo: "atencion" };
    case "CANCELLED":
      return { pasos, hechos: 0, palabra: "Anulado", tipo: "anulado" };
    default:
      return { pasos, hechos, palabra: p.status, tipo: "pendiente" };
  }
}

// ── La tecla del paso que sigue ───────────────────────────────────────────────

export type TeclaDelPedido =
  | { tipo: "avanzar"; verbo: string }
  | { tipo: "avisar" }
  | { tipo: "entregar" }
  | { tipo: "cobrar" };

/**
 * UNA tecla por pedido: la del paso que sigue. Avanzar es el verbo de `verboDelPaso` (la regla de
 * siempre, que llega calculada). Listo sin avisar (y con teléfono para avisar) → Avisar; avisado
 * o sin teléfono → Entregar. Entregado sin cobrar → Cobrar. Lo demás (pesar, link de pago,
 * anular) va en «Más».
 */
export function teclaDelPedido(p: {
  status: string;
  verbo: string | null;
  cobrado: boolean;
  avisoWa: string | null;
  avisado: string | null;
}): TeclaDelPedido | null {
  if (p.verbo) return { tipo: "avanzar", verbo: p.verbo };
  if (p.status === "READY") return p.avisoWa && !p.avisado ? { tipo: "avisar" } : { tipo: "entregar" };
  if (p.status === "DELIVERED" && !p.cobrado) return { tipo: "cobrar" };
  return null;
}

export function textoDeLaTecla(t: TeclaDelPedido): string {
  switch (t.tipo) {
    case "avanzar":
      return t.verbo;
    case "avisar":
      return "Avisar";
    case "entregar":
      return "Entregar";
    case "cobrar":
      return "Cobrar";
  }
}

// ── Filtros y orden (en la URL) ───────────────────────────────────────────────

export const ESTADOS_DEL_FILTRO = ["abiertos", "preparar", "preparando", "listos", "a-cobrar", "cerrados"] as const;
export type EstadoDelFiltro = (typeof ESTADOS_DEL_FILTRO)[number];

export const ETIQUETA_DEL_ESTADO: Record<EstadoDelFiltro, string> = {
  abiertos: "Abiertos",
  preparar: "Para preparar",
  preparando: "En preparación",
  listos: "Listos",
  "a-cobrar": "Entregados sin cobrar",
  cerrados: "Cerrados",
};

/** `pedido` = los que llegan para retirar o enviar (tienda o teléfono: canal ONLINE); `mostrador` = COUNTER. */
export type CanalDelFiltro = "pedido" | "mostrador";

export type FiltrosDelTablero = {
  estado: EstadoDelFiltro;
  canal: CanalDelFiltro | null;
  q: string;
};

type ParametrosCrudos = { get(nombre: string): string | null };

/** Lee los filtros de la URL sin confiar en ellos: lo desconocido es «sin filtro». */
export function leerFiltrosDelTablero(p: ParametrosCrudos): FiltrosDelTablero {
  const e = (p.get("estado") ?? "").trim();
  const c = (p.get("canal") ?? "").trim();
  return {
    estado: (ESTADOS_DEL_FILTRO as readonly string[]).includes(e) ? (e as EstadoDelFiltro) : "abiertos",
    canal: c === "pedido" || c === "mostrador" ? c : null,
    q: (p.get("q") ?? "").trim().slice(0, 60),
  };
}

/** ¿En qué grupo del filtro cae un pedido ABIERTO? */
export function grupoDelPedido(p: { status: string; cobrado: boolean }): Exclude<EstadoDelFiltro, "abiertos" | "cerrados"> | null {
  if (p.status === "PENDING" || p.status === "CONFIRMED") return "preparar";
  if (p.status === "PREPARING") return "preparando";
  if (p.status === "READY") return "listos";
  if (p.status === "DELIVERED" && !p.cobrado) return "a-cobrar";
  return null;
}

/** Cuántos hay en cada chip, con el canal ya aplicado (los chips cuentan lo que muestran). */
export function conteosDelTablero(
  pedidos: readonly Pick<PedidoDelTablero, "status" | "cobrado" | "canal">[],
  canal: CanalDelFiltro | null,
): Record<Exclude<EstadoDelFiltro, "cerrados">, number> {
  const out = { abiertos: 0, preparar: 0, preparando: 0, listos: 0, "a-cobrar": 0 };
  for (const p of pedidos) {
    if (!delCanal(p, canal)) continue;
    out.abiertos += 1;
    const g = grupoDelPedido(p);
    if (g) out[g] += 1;
  }
  return out;
}

function delCanal(p: { canal: "ONLINE" | "COUNTER" }, canal: CanalDelFiltro | null): boolean {
  if (canal === "pedido") return p.canal === "ONLINE";
  if (canal === "mostrador") return p.canal === "COUNTER";
  return true;
}

/** Lo que se busca: número (con o sin #), cliente o teléfono (sólo los dígitos). */
export function coincide(p: { code: number; cliente: string; telefono?: string | null }, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  const numero = t.replace(/^#/, "");
  if (/^\d+$/.test(numero) && String(p.code).startsWith(numero)) return true;
  const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (sinTildes(p.cliente).includes(sinTildes(t))) return true;
  const digitos = t.replace(/\D/g, "");
  return digitos.length >= 3 && (p.telefono ?? "").replace(/\D/g, "").includes(digitos);
}

export function filtrarPedidos<T extends Pick<PedidoDelTablero, "status" | "cobrado" | "canal" | "code" | "cliente" | "telefono">>(
  pedidos: readonly T[],
  f: FiltrosDelTablero,
): T[] {
  return pedidos.filter(
    (p) => delCanal(p, f.canal) && (f.estado === "abiertos" || grupoDelPedido(p) === f.estado) && coincide(p, f.q),
  );
}

export const ORDENABLES = ["numero", "cliente", "entrega", "total"] as const;

/**
 * El orden de la URL (`?orden=total`, `?orden=-numero`). Sin orden: el más nuevo primero, como
 * siempre. «entrega» ordena por el horario pedido; los que no tienen horario van al final.
 */
export function ordenarPedidos<T extends Pick<PedidoDelTablero, "code" | "cliente" | "total" | "creado" | "horarioIso">>(
  pedidos: readonly T[],
  orden: { key: string; direction: "asc" | "desc" } | null,
): T[] {
  const lista = [...pedidos];
  if (!orden) return lista.sort((a, b) => b.creado.localeCompare(a.creado) || b.code - a.code);
  const dir = orden.direction === "asc" ? 1 : -1;
  return lista.sort((a, b) => {
    switch (orden.key) {
      case "numero":
        return (a.code - b.code) * dir;
      case "cliente":
        return a.cliente.localeCompare(b.cliente, "es-AR") * dir;
      case "total":
        return (a.total - b.total) * dir;
      case "entrega": {
        if (a.horarioIso === b.horarioIso) return b.code - a.code;
        if (!a.horarioIso) return 1;
        if (!b.horarioIso) return -1;
        return a.horarioIso.localeCompare(b.horarioIso) * dir;
      }
      default:
        return 0;
    }
  });
}

// ── En lote ───────────────────────────────────────────────────────────────────

export type LoteDelTablero = {
  /** Avanzar un paso, agrupado por verbo: «Preparar» a los pendientes, «Marcar listo» a los que se preparan. */
  avanzar: { verbo: string; ids: string[] }[];
  /** Listos con teléfono: se avisa uno por uno (el WhatsApp lo abre una persona, no el sistema). */
  avisar: string[];
};

export function loteDelTablero(
  seleccionados: readonly Pick<PedidoDelTablero, "id" | "status" | "verbo" | "avisoWa">[],
): LoteDelTablero {
  const porVerbo = new Map<string, string[]>();
  const avisar: string[] = [];
  for (const p of seleccionados) {
    if (p.verbo) porVerbo.set(p.verbo, [...(porVerbo.get(p.verbo) ?? []), p.id]);
    if (p.status === "READY" && p.avisoWa) avisar.push(p.id);
  }
  return { avanzar: [...porVerbo].map(([verbo, ids]) => ({ verbo, ids })), avisar };
}

/** Lo que se dice después de avanzar en lote: cuántos salieron y, si alguno no, por qué. */
export function resumenDelLote(verbo: string, resultados: readonly { code: number; error: string | null }[]): {
  texto: string;
  conError: boolean;
} {
  const bien = resultados.filter((r) => !r.error).length;
  const mal = resultados.filter((r) => r.error);
  const [uno, varios] = PARTICIPIO[verbo] ?? [`con «${verbo}» hecho`, `con «${verbo}» hecho`];
  const salieron = (n: number) => (n === 1 ? `1 pedido quedó ${uno}` : `${n} pedidos quedaron ${varios}`);
  if (mal.length === 0) return { texto: `${salieron(bien)}.`, conError: false };
  const primero = mal[0];
  const inicio = bien > 0 ? `${salieron(bien)}; ` : "";
  return {
    texto: `${inicio}${mal.length === 1 ? `el #${primero.code} no` : `${mal.length} no`}: ${primero.error}`,
    conError: true,
  };
}

/** «El pedido #478 quedó en preparación.» (lo que dice el aviso al avanzar uno solo). */
export function quedoElPedido(verbo: string, code: number): string {
  const [uno] = PARTICIPIO[verbo] ?? [`con «${verbo}» hecho`];
  return `El pedido #${code} quedó ${uno}.`;
}

const PARTICIPIO: Record<string, readonly [string, string]> = {
  Preparar: ["en preparación", "en preparación"],
  "Pasar a preparación": ["en preparación", "en preparación"],
  "Marcar listo": ["listo", "listos"],
  Confirmar: ["confirmado", "confirmados"],
};

// ── La línea de estado ────────────────────────────────────────────────────────

/**
 * La frase del estado del tablero, dato por dato: «11 abiertos · 3 para entregar hoy · 2 listos sin
 * avisar · $644.437 por cobrar». La plata sólo para quien ve los números del negocio.
 */
export function lineaDelTablero(
  pedidos: readonly Pick<PedidoDelTablero, "status" | "cobrado" | "horario" | "total" | "avisoWa" | "avisado">[],
  verPlata: boolean,
): { abiertos: number; paraHoy: number; sinAvisar: number; porCobrar: number | null } {
  let paraHoy = 0;
  let sinAvisar = 0;
  let porCobrar = 0;
  for (const p of pedidos) {
    if (p.horario?.esHoy && p.status !== "DELIVERED") paraHoy += 1;
    if (p.status === "READY" && p.avisoWa && !p.avisado) sinAvisar += 1;
    if (!p.cobrado) porCobrar += p.total;
  }
  return { abiertos: pedidos.length, paraHoy, sinAvisar, porCobrar: verPlata ? Math.round(porCobrar * 100) / 100 : null };
}

/** "11:40" si es de hoy; "ayer"; si no, "lun 21/09". `hoy` y `ayer` son claves AAAA-MM-DD. */
export function cuandoDelPedido(dia: string, hora: string, hoy: string, ayer: string, diaCorto: string): string {
  if (dia === hoy) return hora;
  if (dia === ayer) return "ayer";
  return diaCorto;
}
