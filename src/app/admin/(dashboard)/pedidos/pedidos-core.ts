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
import { dateStrInBusinessTz } from "@/lib/datetime";
import { normalizarTelefono } from "@/lib/clientes/telefono";

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
  // ── Sólo con el mostrador boutique (Magra tanda 2 · 2C). Apagado, no viajan (la bandeja de CH y
  //    de Shine recibe exactamente lo de siempre). ──
  /** La zona del envío («Canning – barrios cerrados»), de la nota o del renglón del envío. */
  zona?: string | null;
  /** Salió con el cadete y todavía no se rindió: desde cuándo («17:05»). null/ausente = no. */
  reparto?: { desde: string } | null;
  /** «Recordarle» por WhatsApp, armado: el retiro (Listo) o el pago (Entregado sin cobrar). */
  recordarle?: string | null;
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
 * Pasados estos minutos, el pedido de la tienda que nadie tocó se pinta en tono de alerta.
 * PROVISIONAL A CONFIRMAR con Magra (EVENTUALIDADES.md, caso 1): es cuánto aguanta una clienta
 * sin respuesta un sábado a la mañana, y eso lo sabe el local.
 */
export const ESPERA_DE_LA_TIENDA_MIN = 15;

/** El reloj de la línea de estado, inyectado (el test fija la hora). `hoy`: AAAA-MM-DD del negocio. */
export type RelojDelTablero = { ahora: Date; hoy: string };

/**
 * Los pedidos de la tienda que nadie miró todavía: ONLINE y en PENDING (todavía no se empezaron a
 * preparar), cuántos son y hace cuántos minutos espera el más viejo. PURA. Antes la línea contaba
 * abiertos, y un pedido web podía estar media hora sin que nadie lo viera (caso 1).
 */
export function pedidosDeLaTiendaEsperando(
  pedidos: readonly Pick<PedidoDelTablero, "canal" | "status" | "creado">[],
  ahora: Date,
): { esperando: number; minutos: number; alerta: boolean } | null {
  let esperando = 0;
  let masViejo = Infinity;
  for (const p of pedidos) {
    if (p.canal !== "ONLINE" || p.status !== "PENDING") continue;
    esperando += 1;
    const t = Date.parse(p.creado);
    if (Number.isFinite(t)) masViejo = Math.min(masViejo, t);
  }
  if (esperando === 0) return null;
  const minutos = Number.isFinite(masViejo) ? Math.max(0, Math.floor((ahora.getTime() - masViejo) / 60_000)) : 0;
  return { esperando, minutos, alerta: minutos >= ESPERA_DE_LA_TIENDA_MIN };
}

/** «3 de la tienda esperando · el más viejo hace 25 min»; uno solo: «1 de la tienda esperando · hace 25 min». */
export function textoDeLaTiendaEsperando(t: { esperando: number; minutos: number }): string {
  const hace = t.minutos < 1 ? "hace menos de 1 min" : `hace ${duracionCorta(t.minutos)}`;
  return `${t.esperando} de la tienda esperando · ${t.esperando === 1 ? hace : `el más viejo ${hace}`}`;
}

/** 25 → "25 min"; 95 → "1 h 35 min"; 120 → "2 h". */
function duracionCorta(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * ¿Está listo desde un día anterior? PURA. Un pedido Listo que se tomó antes de hoy es una clienta
 * que no vino a retirar (caso 4): la carne sigue reservada y nadie la reclama. Se mide por el día
 * en que se TOMÓ (no hay registro de a qué hora quedó listo), en la zona del negocio.
 */
export function listoDesdeAyer(p: Pick<PedidoDelTablero, "status" | "creado">, hoy: string): boolean {
  if (p.status !== "READY") return false;
  const t = Date.parse(p.creado);
  return Number.isFinite(t) && dateStrInBusinessTz(new Date(t)) < hoy;
}

/**
 * La frase del estado del tablero, dato por dato: «11 abiertos · 3 para entregar hoy · 2 listos sin
 * avisar · $644.437 por cobrar». La plata sólo para quien ve los números del negocio.
 *
 * Con el reloj (sólo comercio: CH no tiene tienda ni retiros), suma lo que se pierde de vista:
 * cuántos de la tienda esperan sin que nadie los toque (`tienda`) y cuántos listos siguen sin
 * retirar desde un día anterior (`listosDeAyer`). Sin reloj, los dos quedan vacíos.
 */
export function lineaDelTablero(
  pedidos: readonly Pick<PedidoDelTablero, "status" | "cobrado" | "horario" | "total" | "avisoWa" | "avisado" | "canal" | "creado">[],
  verPlata: boolean,
  reloj?: RelojDelTablero,
): {
  abiertos: number;
  paraHoy: number;
  sinAvisar: number;
  porCobrar: number | null;
  tienda: { esperando: number; minutos: number; alerta: boolean } | null;
  listosDeAyer: number;
} {
  let paraHoy = 0;
  let sinAvisar = 0;
  let porCobrar = 0;
  let listosDeAyer = 0;
  for (const p of pedidos) {
    if (p.horario?.esHoy && p.status !== "DELIVERED") paraHoy += 1;
    if (p.status === "READY" && p.avisoWa && !p.avisado) sinAvisar += 1;
    if (!p.cobrado) porCobrar += p.total;
    if (reloj && listoDesdeAyer(p, reloj.hoy)) listosDeAyer += 1;
  }
  return {
    abiertos: pedidos.length,
    paraHoy,
    sinAvisar,
    porCobrar: verPlata ? Math.round(porCobrar * 100) / 100 : null,
    tienda: reloj ? pedidosDeLaTiendaEsperando(pedidos, reloj.ahora) : null,
    listosDeAyer,
  };
}

// ── Doble pedido de la misma clienta (caso 8) ────────────────────────────────

/** Los estados en los que un segundo pedido es un problema: todavía se prepara o espera que lo retiren. */
const EN_CURSO_DEL_TABLERO = new Set(["PENDING", "CONFIRMED", "PREPARING", "READY"]);

/**
 * Los OTROS pedidos abiertos de la misma clienta, por pedido. PURA. La clienta que pide por la web
 * y además escribe por WhatsApp (y el local lo carga a mano), o que vuelve a pedir «para sumar
 * algo»: son dos claves distintas y dos pedidos, y la bandeja no lo marcaba. Se agrupa por el
 * teléfono NORMALIZADO (`normalizarTelefono`, la misma clave que la ficha de la clienta), así
 * «11 5555-0101» y «+54 9 11 5555 0101» son la misma. Un teléfono con menos de 8 dígitos no se
 * agrupa (es un dato a medias, no una persona). Entregados y anulados no cuentan.
 */
export function otrosPedidosDeLaClienta(
  pedidos: readonly Pick<PedidoDelTablero, "id" | "code" | "telefono" | "status">[],
): Map<string, number[]> {
  const porTelefono = new Map<string, { id: string; code: number }[]>();
  for (const p of pedidos) {
    if (!EN_CURSO_DEL_TABLERO.has(p.status)) continue;
    const clave = normalizarTelefono(p.telefono);
    if (clave.length < 8) continue;
    porTelefono.set(clave, [...(porTelefono.get(clave) ?? []), { id: p.id, code: p.code }]);
  }
  const out = new Map<string, number[]>();
  for (const grupo of porTelefono.values()) {
    if (grupo.length < 2) continue;
    for (const p of grupo) {
      out.set(
        p.id,
        grupo.filter((o) => o.id !== p.id).map((o) => o.code).sort((a, b) => a - b),
      );
    }
  }
  return out;
}

/** «Tiene otro pedido abierto (#127)»; con más: «Tiene otros 2 pedidos abiertos (#127 y #130)». */
export function textoDeOtrosPedidos(codigos: readonly number[]): string | null {
  if (codigos.length === 0) return null;
  const n = codigos.map((c) => `#${c}`);
  if (n.length === 1) return `Tiene otro pedido abierto (${n[0]})`;
  return `Tiene otros ${n.length} pedidos abiertos (${n.slice(0, -1).join(", ")} y ${n[n.length - 1]})`;
}

/** "11:40" si es de hoy; "ayer"; si no, "lun 21/09". `hoy` y `ayer` son claves AAAA-MM-DD. */
export function cuandoDelPedido(dia: string, hora: string, hoy: string, ayer: string, diaCorto: string): string {
  if (dia === hoy) return hora;
  if (dia === ayer) return "ayer";
  return diaCorto;
}

// ── AVISO DE PEDIDO NUEVO (UAT MAGRA 16/10) ─────────────────────────────────────────────────
// El pedido de la tienda entraba y la bandeja abierta no se enteraba: `placeOnlineOrder` sólo
// revalida, y eso le sirve a la PRÓXIMA carga, no a la pantalla que el local tiene abierta. La
// bandeja se refresca sola cada tanto (sólo a la vista y sin interrumpir a quien está cargando
// algo) y avisa los pedidos de la tienda que no estaban en la vuelta anterior.

/** Cada cuánto se refresca la bandeja abierta. Un pedido online se ve en menos de un minuto. */
export const REFRESCO_DE_LA_BANDEJA_MS = 45_000;

export type PedidoWeb = { id: string; code: number };

/**
 * Los pedidos de la tienda que no estaban en la vuelta anterior. PURA. `vistos` null es la
 * primera carga de la pantalla: lo que ya estaba no es «nuevo» (no suena al entrar).
 */
export function pedidosWebNuevos(vistos: ReadonlySet<string> | null, actuales: readonly PedidoWeb[]): PedidoWeb[] {
  if (vistos === null) return [];
  return actuales.filter((p) => !vistos.has(p.id)).sort((a, b) => a.code - b.code);
}

/** Lo que dice el aviso: «Entró un pedido nuevo de la tienda: #128». */
export function textoDePedidosWebNuevos(nuevos: readonly PedidoWeb[]): string | null {
  if (nuevos.length === 0) return null;
  const numeros = nuevos.map((p) => `#${p.code}`);
  if (numeros.length === 1) return `Entró un pedido nuevo de la tienda: ${numeros[0]}`;
  const lista = `${numeros.slice(0, -1).join(", ")} y ${numeros[numeros.length - 1]}`;
  return `Entraron ${numeros.length} pedidos nuevos de la tienda: ${lista}`;
}

/**
 * ¿Se refresca ahora? PURA. No con la pestaña escondida (nadie la mira: no se le pega a la base
 * por nada), ni con alguien escribiendo en un campo o con un diálogo abierto (pesar, anular): el
 * refresco no le cambia la pantalla bajo los dedos. Se reintenta en la vuelta siguiente.
 */
export function puedeRefrescarLaBandeja(estado: { visible: boolean; escribiendo: boolean; dialogoAbierto: boolean }): boolean {
  return estado.visible && !estado.escribiendo && !estado.dialogoAbierto;
}

// ── EL CHIP DE PEDIDOS NUEVOS EN LA CABECERA (reingeniería Magra 1I, E30 · MG-054) ──────────────
// El aviso de arriba vive en la bandeja: con la pestaña de Vender abierta, el pedido de la tienda
// entraba y nadie se enteraba. El chip de la cabecera (ChipDePedidosNuevos.tsx) está en TODO el panel
// y lee sólo esto: cuántos pedidos de la tienda esperan sin que nadie los toque, desde cuándo espera
// el más viejo (para abrirlo con un toque) y el número más alto (para saber si entró uno nuevo).
// «Nuevo» es lo MISMO que cuenta la línea de estado del tablero (`pedidosDeLaTiendaEsperando`):
// ONLINE y en PENDING. La lectura es del servidor (pedidos-nuevos.ts); acá, sólo la regla y el texto.

/** Qué es un pedido nuevo de la tienda: el mismo criterio que `pedidosDeLaTiendaEsperando`. */
export const CRITERIO_PEDIDO_NUEVO = { channel: "ONLINE", status: "PENDING" } as const;

/** Cada cuánto pregunta el chip (sólo con la pestaña a la vista). El mismo ritmo que la bandeja. */
export const REFRESCO_DEL_CHIP_MS = REFRESCO_DE_LA_BANDEJA_MS;

/** Volver a la pestaña pregunta enseguida, salvo que la última vez haya sido hace menos de esto. */
export const PAUSA_MINIMA_DEL_CHIP_MS = 15_000;

/** Lo que contesta el servidor. Serializable. */
export type ConteoDePedidosNuevos = {
  cantidad: number;
  /** El que espera hace más (para el «hace X min» y para abrirlo). null si no hay ninguno. */
  masViejo: { id: string; code: number; creado: string } | null;
  /** El número más alto entre los que esperan: si sube, entró uno nuevo. null si no hay ninguno. */
  ultimoCode: number | null;
};

/** Minutos enteros desde `creado` (ISO) hasta `ahora` (ms). Nunca negativo. PURA. */
function minutosDesde(creado: string, ahora: number): number {
  const t = Date.parse(creado);
  return Number.isFinite(t) ? Math.max(0, Math.floor((ahora - t) / 60_000)) : 0;
}

/**
 * Lo que dice el chip: «2 pedidos nuevos · el más viejo hace 12 min»; uno solo: «1 pedido nuevo ·
 * hace 3 min». null si no hay ninguno (el chip no se muestra). PURA (recibe la hora).
 */
export function textoDelChipDePedidosNuevos(c: ConteoDePedidosNuevos, ahora: number): string | null {
  if (c.cantidad <= 0) return null;
  const m = c.masViejo ? minutosDesde(c.masViejo.creado, ahora) : 0;
  const hace = m < 1 ? "hace menos de 1 min" : `hace ${duracionCorta(m)}`;
  return c.cantidad === 1 ? `1 pedido nuevo · ${hace}` : `${c.cantidad} pedidos nuevos · el más viejo ${hace}`;
}

/**
 * El nombre del chip para el lector de pantalla: arranca con lo MISMO que se ve (quien maneja la
 * pantalla con la voz dice lo que lee) y suma de dónde son y a dónde lleva el toque. PURA.
 */
export function etiquetaDelChipDePedidosNuevos(c: ConteoDePedidosNuevos, ahora: number): string | null {
  const texto = textoDelChipDePedidosNuevos(c, ahora);
  if (!texto || !c.masViejo) return texto;
  return `${texto}. Pedidos de la tienda: abrir el #${c.masViejo.code}`;
}

/**
 * ¿Entró un pedido nuevo desde la vuelta anterior? PURA. `anterior` null es la primera lectura de
 * la pantalla: lo que ya estaba no suena (como el aviso de la bandeja). Se mira el número más alto
 * y no la cantidad: si en la misma vuelta se tomó uno y entró otro, la cantidad no cambia y el
 * pedido nuevo igual tiene que sonar.
 */
export function entroUnPedidoNuevo(anterior: ConteoDePedidosNuevos | null, actual: ConteoDePedidosNuevos): boolean {
  if (anterior === null || actual.ultimoCode === null) return false;
  return anterior.ultimoCode === null || actual.ultimoCode > anterior.ultimoCode;
}

/** Lo que se anuncia (aria-live) cuando entra uno: «Entró un pedido nuevo de la tienda (#130).». PURA. */
export function anuncioDelChip(actual: ConteoDePedidosNuevos): string {
  const numero = actual.ultimoCode !== null ? ` (#${actual.ultimoCode})` : "";
  const resto = actual.cantidad > 1 ? ` Hay ${actual.cantidad} esperando.` : "";
  return `Entró un pedido nuevo de la tienda${numero}.${resto}`;
}

// ── LA BANDEJA EN COLUMNAS (reingeniería Magra, tanda 2 · 2C; magra-DISENO.md §2.2) ─────────────
// Con el mostrador boutique prendido, la bandeja deja de ser una tabla con filtros y pasa a ser el
// tablero físico del local: cinco columnas, de izquierda a derecha el camino del pedido, y en cada
// tarjeta UNA tecla grande para el paso que sigue. En el celular, pestañas con su contador.
//
//   Nuevos      (Pendiente / Confirmado)  → «Armar»            (lo pasa a Preparando y abre Armar)
//   Preparando  (En preparación)          → «Seguir armando»
//   Listos      (Listo, no salió)         → «Entregar y cobrar» (el pie de cobro, en el cajón)
//   En reparto  (Listo y salió con el cadete, sin rendir) → «Rendición del cadete»
//   A cobrar    (Entregado sin cobrar)    → «Cobrar»            (el pie de cobro)
//
// No hay estado nuevo (sin migración): «En reparto» es un Listo con la marca de salida del reparto
// (AuditLog, `reparto/reparto-core.ts`). Las reglas de cada paso siguen en el servidor.

export const COLUMNAS_DE_LA_BANDEJA = ["nuevos", "preparando", "listos", "en-reparto", "a-cobrar"] as const;
export type ColumnaDeLaBandeja = (typeof COLUMNAS_DE_LA_BANDEJA)[number];

export const TITULO_DE_LA_COLUMNA: Record<ColumnaDeLaBandeja, string> = {
  nuevos: "Nuevos",
  preparando: "Preparando",
  listos: "Listos",
  "en-reparto": "En reparto",
  "a-cobrar": "A cobrar",
};

/** Lo que dice la columna vacía: qué va a aparecer ahí (nunca un hueco mudo). */
export const VACIO_DE_LA_COLUMNA: Record<ColumnaDeLaBandeja, string> = {
  nuevos: "Ningún pedido nuevo.",
  preparando: "Nada armándose.",
  listos: "Nada listo esperando.",
  "en-reparto": "Ningún envío en la calle.",
  "a-cobrar": "Nada entregado sin cobrar.",
};

/** ¿En qué columna va un pedido abierto? PURA. null = no va en la bandeja (cerrado). */
export function columnaDelPedido(p: { status: string; cobrado: boolean; reparto?: { desde: string } | null }): ColumnaDeLaBandeja | null {
  switch (p.status) {
    case "PENDING":
    case "CONFIRMED":
      return "nuevos";
    case "PREPARING":
      return "preparando";
    case "READY":
      return p.reparto ? "en-reparto" : "listos";
    case "DELIVERED":
      return p.cobrado ? null : "a-cobrar";
    default:
      return null;
  }
}

/**
 * Los pedidos repartidos en las cinco columnas. PURA. Dentro de cada columna, primero el que más
 * espera (el trabajo se hace por orden de llegada); en Listos, primero el que tiene horario más
 * temprano (lo que hay que entregar antes) y después los sin horario, por orden de llegada.
 */
export function bandejaEnColumnas<T extends Pick<PedidoDelTablero, "status" | "cobrado" | "creado" | "code" | "horarioIso" | "reparto">>(
  pedidos: readonly T[],
): Record<ColumnaDeLaBandeja, T[]> {
  const out = { nuevos: [], preparando: [], listos: [], "en-reparto": [], "a-cobrar": [] } as Record<ColumnaDeLaBandeja, T[]>;
  for (const p of pedidos) {
    const c = columnaDelPedido(p);
    if (c) out[c].push(p);
  }
  const porLlegada = (a: T, b: T) => a.creado.localeCompare(b.creado) || a.code - b.code;
  for (const c of COLUMNAS_DE_LA_BANDEJA) out[c].sort(porLlegada);
  out.listos.sort((a, b) => {
    if (a.horarioIso && b.horarioIso && a.horarioIso !== b.horarioIso) return a.horarioIso.localeCompare(b.horarioIso);
    if (a.horarioIso && !b.horarioIso) return -1;
    if (!a.horarioIso && b.horarioIso) return 1;
    return porLlegada(a, b);
  });
  return out;
}

/** La pantalla Armar y pesar del pedido (tanda 1 · 1C). */
export function hrefDeArmar(code: number): string {
  return `/admin/pedidos/${code}/armar`;
}

export const HREF_ARMAR_REPARTO = "/admin/pedidos/reparto";
export const HREF_RENDICION = "/admin/pedidos/reparto/rendicion";

export type TeclaDeLaTarjeta =
  /** Nuevo: lo pasa a Preparando (la guarda de siempre) y abre Armar. */
  | { tipo: "armar"; texto: "Armar"; href: string }
  | { tipo: "seguir"; texto: "Seguir armando"; href: string }
  /** Listo: el pie de cobro en el cajón (o entregar directo si ya está pago). */
  | { tipo: "entregar"; texto: "Entregar y cobrar" | "Entregar" }
  | { tipo: "rendicion"; texto: "Rendición del cadete"; href: string }
  | { tipo: "cobrar"; texto: "Cobrar" };

/** LA tecla de la tarjeta: el paso que sigue según la columna. PURA. */
export function teclaDeLaTarjeta(p: Pick<PedidoDelTablero, "status" | "cobrado" | "code" | "reparto">): TeclaDeLaTarjeta | null {
  switch (columnaDelPedido(p)) {
    case "nuevos":
      return { tipo: "armar", texto: "Armar", href: hrefDeArmar(p.code) };
    case "preparando":
      return { tipo: "seguir", texto: "Seguir armando", href: hrefDeArmar(p.code) };
    case "listos":
      return { tipo: "entregar", texto: p.cobrado ? "Entregar" : "Entregar y cobrar" };
    case "en-reparto":
      return { tipo: "rendicion", texto: "Rendición del cadete", href: HREF_RENDICION };
    case "a-cobrar":
      return { tipo: "cobrar", texto: "Cobrar" };
    default:
      return null;
  }
}

/** Cuántos hay en cada columna (las pestañas del celular y los encabezados). PURA. */
export function conteosDeLasColumnas(columnas: Record<ColumnaDeLaBandeja, readonly unknown[]>): Record<ColumnaDeLaBandeja, number> {
  return {
    nuevos: columnas.nuevos.length,
    preparando: columnas.preparando.length,
    listos: columnas.listos.length,
    "en-reparto": columnas["en-reparto"].length,
    "a-cobrar": columnas["a-cobrar"].length,
  };
}

/** Lee la columna de la URL (`?columna=listos`, la pestaña del celular). Lo desconocido: Nuevos. */
export function leerColumnaDeLaUrl(valor: string | null | undefined): ColumnaDeLaBandeja {
  const v = (valor ?? "").trim();
  return (COLUMNAS_DE_LA_BANDEJA as readonly string[]).includes(v) ? (v as ColumnaDeLaBandeja) : "nuevos";
}

/**
 * Lo que lleva, en una línea corta para la tarjeta y la hoja del cadete: «0,5 kg Vacío · 6 × Chorizo».
 * Sin el renglón del envío (se lee aparte, como la zona). Hasta tres renglones y «y N más». PURA.
 */
export function resumenDeLineas(
  lineas: readonly { productId: string | null; nombre: string; unidad: "UNIT" | "WEIGHT"; cantidad: number; marca?: string | null }[],
): string {
  const productos = lineas.filter((l) => l.marca !== "envío" && !(l.productId == null && /^env[ií]o\b/i.test(l.nombre)));
  const texto = (l: (typeof productos)[number]) => {
    const n = Math.round(l.cantidad * 1000) / 1000;
    const cantidad = String(n).replace(".", ",");
    return l.unidad === "WEIGHT" ? `${cantidad} kg ${l.nombre}` : `${cantidad} × ${l.nombre}`;
  };
  const primeros = productos.slice(0, 3).map(texto);
  const resto = productos.length - primeros.length;
  return resto > 0 ? `${primeros.join(" · ")} y ${resto} más` : primeros.join(" · ");
}

/** El motivo sugerido para anular el Listo que nunca vinieron a buscar (E31; sin estado propio: Gate 2). */
export const MOTIVO_NO_RETIRO = "No retiró";

/** ¿Se ofrece «No retiró…»? Sólo un retiro Listo (un envío que vuelve se rinde como «Volvió»). PURA. */
export function puedeMarcarNoRetiro(p: Pick<PedidoDelTablero, "status" | "entrega">): boolean {
  return p.status === "READY" && p.entrega === "PICKUP";
}

/**
 * «Recordarle» el pago de un pedido que se entregó sin cobrar, 1 a 1 por WhatsApp desde el teléfono
 * de quien atiende. PURA. Texto PROVISIONAL A CONFIRMAR con el dueño (cómo le gusta pedir la plata).
 */
export function recordatorioDeCobro(p: { cliente: string; code: number; total: string; negocio: string }): string {
  const nombre = p.cliente.trim().split(/\s+/)[0] || "";
  const saludo = nombre && nombre.toLowerCase() !== "mostrador" ? `¡Hola ${nombre}!` : "¡Hola!";
  return (
    `${saludo} Te escribimos de ${p.negocio} por el pedido #${p.code}: quedó pendiente el pago de ${p.total}. ` +
    "Cuando puedas, lo pagás en el local, por transferencia o con Mercado Pago. ¡Gracias!"
  );
}
