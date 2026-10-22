// ============================================================================
// TIENDA ONLINE — lo que se decide sin base: disponibilidad, bolsa y el mensaje de WhatsApp.
// ============================================================================
//
// Lo usan las cuatro vidrieras (client components) y la Server Action que toma el pedido
// (`placeOnlineOrder`, order-actions.ts). DATO PURO: sin Prisma, sin React, sin nada de
// servidor; si un día importara el `prisma` de valor, Turbopack rompería el build de /tienda
// sin que tsc lo vea.
//
// La vidriera NO recibe el stock: recibe la etiqueta ya decidida ("Sin stock", "Últimas
// unidades"). Publicar cuántos kilos quedan le cuenta a cualquiera cuánto vende el local.

import { formatearCantidad } from "@/lib/pos-peso";
import { fmtMoneyARS } from "@/components/ui/format";
import { esLineaDeEnvio } from "@/lib/venta-reglas";
import { horarioDeNegocioDelFormulario } from "@/lib/datetime";
import type { ConfigEnvios, ZonaDeEnvio } from "@/lib/envios/modelo";

// ── DISPONIBILIDAD ───────────────────────────────────────────────────────────

export type Disponibilidad = "sin-stock" | "ultimas" | null;

/** Medio gramo: la misma tolerancia de coma flotante que el ledger (stock/ledger.ts). */
const TOLERANCIA = 0.0005;

/**
 * Qué dice la vidriera de un producto. PURA.
 *   · sin control de stock → nada (se vende sin bloqueo, como en el mostrador);
 *   · sin stock → "sin-stock": no se puede sumar a la bolsa;
 *   · en el aviso de stock bajo del producto (`lowStockAt`, el mismo del inventario) →
 *     "ultimas".
 */
export function disponibilidadDe(p: { trackStock: boolean; stock: number; lowStockAt: number }): Disponibilidad {
  if (!p.trackStock) return null;
  if (!(p.stock > TOLERANCIA)) return "sin-stock";
  if (p.stock <= Math.max(0, p.lowStockAt) + TOLERANCIA) return "ultimas";
  return null;
}

export function etiquetaDeDisponibilidad(d: Disponibilidad): string | null {
  if (d === "sin-stock") return "Sin stock";
  if (d === "ultimas") return "Últimas unidades";
  return null;
}

// ── LA BOLSA ANTES DE TOMAR EL PEDIDO ────────────────────────────────────────

export type ProductoParaBolsa = {
  id: string;
  trackStock: boolean;
  stock: number;
  active: boolean;
  deletedAt: Date | string | null;
  saleUnit: string;
  price: number | null;
  pricePerKg: number | null;
};

/**
 * Una línea de la bolsa tal como llega del formulario. `precioVisto`: el precio unitario (el kilo
 * o la unidad) que la vidriera le MOSTRÓ a la clienta; sólo lo manda MAGRA. Sin él no se compara
 * nada (las otras vidrieras siguen como siempre).
 */
export type LineaDeLaBolsa = { productId: string; qty: number; precioVisto?: number | null };

/** Medio centavo: lo que se lee de un `<input hidden>` vuelve como texto y puede traer decimales. */
const TOLERANCIA_PRECIO = 0.005;

const AVISO_PRECIO = "El precio cambió";

/**
 * Qué línea de la bolsa no se puede pedir, y por qué, en palabras del cliente. PURA.
 *
 * Es el MISMO criterio que la guarda del alta (el stock tiene que alcanzar; nada de ventas
 * parciales), dicho por línea y antes de abrir la transacción, para que el mensaje quede al
 * lado del producto y la bolsa no se toque. Nunca dice cuánto hay: "no nos alcanza".
 *
 * PRECIO VIEJO: el alta cobra el precio de la base (bien), pero si la dueña lo subió con la
 * pestaña abierta la clienta se enteraba al pagar. Si la línea trae el precio que vio y no es el
 * de hoy, se frena ESA línea con el precio nuevo («ahora $X el kilo»): la bolsa sigue, la vidriera
 * se refresca (`placeOnlineOrder` llama a `refresh`) y al volver a mandar ya viaja el precio nuevo. Va después de
 * los otros avisos: si además se agotó, decir el precio nuevo no sirve.
 */
export function problemasDeLaBolsa(
  productos: readonly ProductoParaBolsa[],
  pedidas: readonly LineaDeLaBolsa[],
): Record<string, string> {
  const porId = new Map(productos.map((p) => [p.id, p]));
  const cantidades = new Map<string, number>();
  const vistos = new Map<string, number>();
  for (const l of pedidas) {
    if (!l.productId || !(l.qty > 0)) continue;
    cantidades.set(l.productId, (cantidades.get(l.productId) ?? 0) + l.qty);
    if (l.precioVisto != null && Number.isFinite(l.precioVisto)) vistos.set(l.productId, l.precioVisto);
  }
  const out: Record<string, string> = {};
  for (const [id, qty] of cantidades) {
    const p = porId.get(id);
    const precio = p ? (p.saleUnit === "WEIGHT" ? p.pricePerKg : p.price) : null;
    if (!p || !p.active || p.deletedAt || precio == null || !(precio > 0)) {
      out[id] = "Ya no está a la venta: sacalo de tu pedido.";
      continue;
    }
    if (p.trackStock) {
      if (!(p.stock > TOLERANCIA)) {
        out[id] = "Se agotó: sacalo de tu pedido o escribinos.";
        continue;
      }
      if (p.stock + TOLERANCIA < qty) {
        out[id] = "No nos alcanza para esa cantidad: probá con menos.";
        continue;
      }
    }
    const visto = vistos.get(id);
    if (visto != null && Math.abs(visto - precio) > TOLERANCIA_PRECIO) {
      out[id] = `${AVISO_PRECIO}: ahora ${fmtMoneyARS(precio)} ${p.saleUnit === "WEIGHT" ? "el kilo" : "la unidad"}. Revisá y mandalo de nuevo.`;
    }
  }
  return out;
}

export const MENSAJE_BOLSA_CON_PROBLEMAS =
  "Hay productos de tu pedido que no podemos preparar: mirá el aviso en cada uno. Tu pedido sigue acá.";

export const MENSAJE_BOLSA_PRECIO_CAMBIO =
  "Cambió el precio de algún producto de tu pedido: mirá el aviso en cada uno. Tu pedido sigue acá.";

/**
 * El aviso general de una bolsa frenada. Si lo único que pasó es que cambió un precio, decir
 * «no podemos preparar» asusta de más: se dice que cambió el precio. PURA.
 */
export function mensajeDeLaBolsa(porLinea: Readonly<Record<string, string>>): string {
  const avisos = Object.values(porLinea);
  return avisos.length > 0 && avisos.every((a) => a.startsWith(AVISO_PRECIO))
    ? MENSAJE_BOLSA_PRECIO_CAMBIO
    : MENSAJE_BOLSA_CON_PROBLEMAS;
}

/**
 * Los precios que la vidriera mostró, uno por línea, en el MISMO orden que `productId`. Si no
 * vienen todos (una vidriera que no los manda, o un formulario armado a mano) no se usa
 * ninguno: emparejar a medias compararía el precio de un producto con el de otro. PURA.
 */
export function preciosVistos(crudos: readonly unknown[], lineas: number): (number | null)[] {
  if (crudos.length !== lineas) return Array.from({ length: lineas }, () => null);
  return crudos.map((c) => {
    const t = typeof c === "string" ? c.trim() : "";
    const n = t === "" ? NaN : Number(t);
    return Number.isFinite(n) && n > 0 ? n : null;
  });
}

export const MENSAJE_NO_SE_PUDO =
  "No pudimos tomar el pedido. Tu pedido sigue acá: probá de nuevo en un rato o escribinos por WhatsApp.";

// ── LO QUE CONTESTA EL SERVIDOR ──────────────────────────────────────────────

/**
 * Lo que `placeOnlineOrder` le devuelve a la vidriera. Un rechazo viaja DEVUELTO, no lanzado:
 * lanzado, Next lo reemplaza por la pantalla genérica de error y el cliente pierde la bolsa.
 *
 *   · `porLinea`: el aviso de cada producto que no se puede pedir (por id);
 *   · `campo`: si el problema es el cupón o los datos de contacto, para marcar ese campo;
 *   · ok: sólo vuelve cuando se pidió por WhatsApp (el pedido de la tienda redirige a Gracias).
 */
export type EstadoPedidoOnline =
  | null
  | { ok: false; error: string; porLinea?: Record<string, string>; campo?: "cupon" | "datos" }
  | { ok: true; code: number; total: number; whatsapp: string | null };

// ── EL MENSAJE DE WHATSAPP ───────────────────────────────────────────────────

export type LineaDelPedido = {
  productId: string | null;
  name: string;
  saleUnit: string;
  quantity: number;
  lineTotal: number;
};

/**
 * El mensaje que se abre en WhatsApp DESPUÉS de registrar el pedido: con su número, para que
 * el local lo encuentre en la bandeja sin volver a tipearlo. Sale de lo que quedó GRABADO
 * (líneas, envío, descuento y total de la base), no de lo que mostraba la vidriera. PURA.
 */
export function mensajeWhatsAppDelPedido(p: {
  negocio: string;
  code: number;
  cliente: string;
  lineas: readonly LineaDelPedido[];
  descuento: number;
  total: number;
  fulfillment: "PICKUP" | "DELIVERY" | string;
  address: string | null;
}): string {
  const renglones: string[] = [`¡Hola ${p.negocio}! Te escribo por mi pedido #${p.code} de la tienda:`];
  for (const l of p.lineas) {
    if (esLineaDeEnvio(l)) continue;
    const cant = `${formatearCantidad(l.quantity)} ${l.saleUnit === "WEIGHT" ? "kg" : "u"}`;
    renglones.push(`• ${cant} · ${l.name}`);
  }
  const envio = p.lineas.find((l) => esLineaDeEnvio(l));
  if (envio) renglones.push(`Envío: ${fmtMoneyARS(envio.lineTotal)}`);
  if (p.descuento > 0) renglones.push(`Descuento: −${fmtMoneyARS(p.descuento)}`);
  renglones.push(`Total: ${fmtMoneyARS(p.total)}`);
  renglones.push(
    p.fulfillment === "DELIVERY"
      ? `Entrega: envío a domicilio${p.address ? ` (${p.address})` : ""}`
      : "Entrega: retiro en el local",
  );
  renglones.push(`A nombre de: ${p.cliente}`);
  return renglones.join("\n");
}

// ── Medios de pago que la vidriera promete ───────────────────────────────────
//
// El copy editorial de MAGRA (magra-content.ts) decía "Todos los medios de pago: efectivo,
// crédito, débito…" y el local no cobra con tarjeta (no hay medio "Tarjeta" en la caja); ya se
// corrigió en la fuente. Igual la franja de propuestas toma los medios de la MARCA
// (storefront.ts), que son los que el mostrador puede cobrar: una sola fuente. PURA.

/** "Efectivo, transferencia y Mercado Pago." a partir de la lista de la marca. PURA. */
export function textoDeMediosDePago(medios: readonly string[]): string {
  const limpios = medios.map((m) => m.trim()).filter(Boolean);
  const partes = limpios.map((m, i) => (i === 0 || /^Mercado Pago/.test(m) ? m : m.charAt(0).toLowerCase() + m.slice(1)));
  if (partes.length === 0) return "";
  const texto = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
  return `${texto}.`;
}

/**
 * Las propuestas de valor con la de "medios de pago" reescrita con los medios de la marca. Sin
 * medios de la marca, quedan como están. PURA.
 */
export function propuestasConMediosDeLaMarca<T extends { title: string; text: string }>(
  propuestas: readonly T[],
  medios: readonly string[] | null | undefined,
): T[] {
  const texto = textoDeMediosDePago(medios ?? []);
  if (!texto) return [...propuestas];
  return propuestas.map((v) => (/medios de pago/i.test(v.title) ? { ...v, title: "Medios de pago", text: texto } : v));
}

// ── La clave anti-duplicado del pedido (la lee `placeOnlineOrder`) ───────────────────────────
//
// UNA sola forma de generarla para todas las vidrieras (Storefront, MagraFront, ShineFront,
// SiteReplica). Antes cada una tenía la suya, y la de SiteReplica armaba el respaldo como
// `${Date.now()}-${Math.random()}` —con un punto— que el servidor no acepta (`claveDeLaVidriera`,
// order-core.ts): sin clave, el doble toque del celular grababa DOS pedidos (medido).
//
// `crypto.randomUUID` sólo existe en https o localhost; `crypto.getRandomValues` existe también
// en http, así que el respaldo sigue siendo un UUID v4 con azar criptográfico. Sólo sin `crypto`
// (un navegador muy viejo) se usa "<ms>-<azar>", en minúsculas y de 12 caracteres de azar.

/** Una clave nueva de pedido: siempre una forma que acepta `claveDeLaVidriera`. */
export function nuevaClaveDePedido(
  c: (Pick<Crypto, "getRandomValues"> & Partial<Pick<Crypto, "randomUUID">>) | null = typeof crypto !== "undefined" ? crypto : null,
): string {
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  if (c && typeof c.getRandomValues === "function") {
    const b = c.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; // versión 4
    b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 4122
    const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  const azar = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.padEnd(12, "0").slice(0, 12);
  return `${Date.now()}-${azar}`;
}

// ── LA ENTREGA: zona, franja y día (reingeniería Magra 1H) ───────────────────────────────────
//
// La configuración de Envíos del negocio (src/lib/envios) dice qué zonas hay, cuánto cuesta cada
// una, el mínimo, si hay retiro y en qué franjas se entrega. La tienda la recibe del servidor y
// cotiza con las MISMAS funciones puras (`cotizarEnvio`); `placeOnlineOrder` vuelve a decidir todo
// con la configuración que lee él, nunca con lo que mandó el navegador. Acá sólo vive lo que la
// tienda y el servidor tienen que leer igual: los días que se ofrecen y la franja elegida.

/** Cuántos días se ofrecen para recibir o retirar (hoy incluido). */
export const DIAS_DE_ENTREGA = 7;

const DIAS_SEMANA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** «2026-10-22» + n días, sin zona horaria (la fecha de calendario del negocio). PURA. */
export function sumarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Los días que se ofrecen: «Hoy», «Mañana», «sáb 24/10»… desde `hoy` (YYYY-MM-DD del negocio). PURA. */
export function diasDeEntrega(hoy: string, cuantos = DIAS_DE_ENTREGA): { valor: string; texto: string }[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hoy) || Number.isNaN(new Date(`${hoy}T12:00:00.000Z`).getTime())) return [];
  return Array.from({ length: cuantos }, (_, i) => {
    const valor = sumarDias(hoy, i);
    const semana = DIAS_SEMANA[new Date(`${valor}T12:00:00.000Z`).getUTCDay()];
    const texto = i === 0 ? "Hoy" : i === 1 ? "Mañana" : `${semana} ${valor.slice(8, 10)}/${valor.slice(5, 7)}`;
    return { valor, texto };
  });
}

/**
 * Desde qué hora y hasta qué hora es una franja escrita a mano: «L-S 11-13» → 11:00 a 13:00,
 * «Hoy tarde 17–20» → 17:00 a 20:00, «Ma, Vi 17:30 a 19» → 17:30 a 19:00. null si no trae
 * horas. Las letras de los días («L-S») no cuentan: sólo números. PURA.
 */
export function horasDeLaFranja(franja: string): { desde: string; hasta: string } | null {
  const m = /(\d{1,2})(?:[:.](\d{2}))?\s*(?:hs?\.?)?\s*(?:-|–|—|a)\s*(\d{1,2})(?:[:.](\d{2}))?/.exec(franja);
  if (!m) return null;
  const [h1, m1, h2, m2] = [Number(m[1]), Number(m[2] ?? 0), Number(m[3]), Number(m[4] ?? 0)];
  if (h1 > 23 || h2 > 24 || m1 > 59 || m2 > 59) return null;
  if (h2 * 60 + m2 <= h1 * 60 + m1) return null;
  const hh = (h: number, mm: number) => (h === 24 ? "23:59" : `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  return { desde: hh(h1, m1), hasta: hh(h2, m2) };
}

/** Las franjas que se ofrecen para esa entrega: las de la zona (envío) o las de retiro. PURA. */
export function franjasDeLaEntrega(
  config: Pick<ConfigEnvios, "franjasRetiro">,
  modo: "retiro" | "envio",
  zona: Pick<ZonaDeEnvio, "franjas"> | null,
): readonly string[] {
  return modo === "retiro" ? config.franjasRetiro : (zona?.franjas ?? []);
}

export type HorarioDeLaEntrega = { ok: true; scheduledFor: Date | null; nota: string | null } | { ok: false; error: string };

/**
 * El horario del pedido a partir del día y la franja elegidos. PURA (recibe `hoy` y `ahora`). La
 * usa el servidor (`placeOnlineOrder`) con lo que llega del formulario, contra las franjas de la
 * configuración que leyó él:
 *   · sin franjas configuradas para esa entrega → sin horario (lo de siempre);
 *   · con franjas, hay que elegir una de ESAS (una inventada no entra);
 *   · el día, entre hoy y los próximos `DIAS_DE_ENTREGA`; una franja de hoy que ya terminó, no.
 * El pedido guarda el comienzo de la franja (`scheduledFor`) y la franja tal cual en la nota.
 * Que la franja sea de un día que el local atiende («Ma, Vi») lo controla el local al confirmar:
 * el texto de los días es libre (provisional a confirmar con Mariano).
 */
export function horarioDeLaEntrega(p: {
  franjas: readonly string[];
  franja: string | null;
  dia: string | null;
  hoy: string;
  ahora: Date;
}): HorarioDeLaEntrega {
  if (p.franjas.length === 0) return { ok: true, scheduledFor: null, nota: null };
  const franja = (p.franja ?? "").replace(/\s+/g, " ").trim();
  if (!franja) return { ok: false, error: "Elegí en qué franja te queda mejor." };
  if (!p.franjas.includes(franja)) return { ok: false, error: "Esa franja ya no está: elegí una de las que se ven ahora." };
  const dia = diasDeEntrega(p.hoy).find((d) => d.valor === p.dia);
  if (!dia) return { ok: false, error: "Elegí el día de la entrega." };
  const horas = horasDeLaFranja(franja);
  if (horas) {
    const fin = horarioDeNegocioDelFormulario(`${dia.valor}T${horas.hasta}`);
    if (fin && fin.getTime() <= p.ahora.getTime()) {
      return { ok: false, error: "Esa franja de hoy ya pasó: elegí otra o un día más adelante." };
    }
  }
  const fecha = `${dia.valor.slice(8, 10)}/${dia.valor.slice(5, 7)}`;
  const cuando = dia.texto === "Hoy" || dia.texto === "Mañana" ? `${dia.texto.toLowerCase()} ${fecha}` : dia.texto;
  return {
    ok: true,
    scheduledFor: horas ? horarioDeNegocioDelFormulario(`${dia.valor}T${horas.desde}`) : null,
    nota: `Franja: ${franja} (${cuando})`,
  };
}

/**
 * La nota del pedido con la zona y la franja delante de lo que escribió la clienta, para que el
 * local y el cadete lo vean sin abrir nada más. Hasta 500 caracteres, como siempre. PURA.
 */
export function notaDelPedido(p: { zona: string | null; franja: string | null; deLaClienta: string | null }): string | null {
  const partes = [p.zona ? `Zona: ${p.zona}` : null, p.franja, p.deLaClienta?.trim() || null].filter((x): x is string => Boolean(x));
  return partes.length ? partes.join(" · ").slice(0, 500) : null;
}
