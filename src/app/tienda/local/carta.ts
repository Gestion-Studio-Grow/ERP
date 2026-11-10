// ============================================================================
// PEDÍ LOCAL · LA CARTA Y LA BOLSA — categorías, totales y el control del formulario. LÓGICA PURA.
// ============================================================================
//
// «Pedí Local» (nombre PROVISIONAL A CONFIRMAR): la vidriera de pedidos y delivery propio de un
// comercio del barrio (src/lib/delivery-local/config.ts). Acá vive lo que no necesita pantalla:
//   · `cartaPorCategoria`: el catálogo no trae categoría (getStorefront), así que se agrupa por el
//     nombre del producto con palabras de cafetería. Lo que no encaja va a «Más de la carta».
//   · `totalesDeLaBolsa`: subtotal + envío = total, el MISMO número que el alta suma en el servidor.
//   · `revisarPedidoLocal`: lo que se controla ANTES de mandar (nombre, WhatsApp, dirección, pago,
//     términos). El servidor vuelve a decidir todo: esto es para no hacer esperar a la persona.
//
// Sin React, sin Prisma, sin DOM: lo usan la vidriera y los tests (carta.test.ts).

import type { Disponibilidad } from "../reglas-tienda";
import { leerPago, type MedioPreferido } from "@/lib/delivery-local/pago";

export type ProductoDeLaCarta = {
  id: string;
  name: string;
  saleUnit: "UNIT" | "WEIGHT";
  price: number | null;
  pricePerKg: number | null;
  unit: string;
  disponibilidad?: Disponibilidad;
};

export type Categoria = { id: string; titulo: string };

// El orden es el de la carta de una cafetería. Se compara SIN tildes y en minúscula («Café» = «cafe»).
// La PRIMERA que matchea gana: «Tostado de jamón y queso» es salado aunque no diga «sándwich»;
// «Café con leche» es café aunque diga «leche». «Café en grano» es para llevar a casa: va primero.
const CATEGORIAS: readonly (Categoria & { palabras: RegExp })[] = [
  { id: "granos", titulo: "Café para llevar a casa", palabras: /\b(en grano|grano|molido|bolsa de cafe|blend de)/ },
  { id: "cafe", titulo: "Café", palabras: /\b(cafe|espresso|expreso|cortado|lagrima|capuch|cappuc|latte|flat ?white|americano|ristretto|macchiato|moka|mocha|filtrado|chemex|v60|aeropress|cold ?brew)/ },
  { id: "bebidas", titulo: "Otras bebidas", palabras: /\b(te\b|chai|mate\b|submarino|chocolatada|chocolate caliente|jugo|exprimido|limonada|licuado|smoothie|agua\b|gaseosa|soda|tonica|kombucha|batido)/ },
  { id: "brunch", titulo: "Brunch y salado", palabras: /\b(tostad|toston|sandwich|wrap|bagel|focaccia|chipa|huevo|revuelto|omelette|palta|avocado|bowl|ensalada|quiche|empanada|brunch|desayuno|yogur|granola|panini)/ },
  { id: "pasteleria", titulo: "Pastelería", palabras: /\b(medialuna|croissant|factura|torta|budin|muffin|brownie|alfajor|cookie|galleta|scon|cheesecake|lemon pie|tarteleta|cuadrado|roll|rogel|pastafrola|pasta frola|carrot|bizcocho|chocotorta|cinnamon|danesa|tarta de)/ },
];
const OTROS: Categoria = { id: "otros", titulo: "Más de la carta" };

/** El nombre sin tildes y en minúscula, para comparar palabras. */
function plano(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** La categoría de un producto por su nombre (palabras de cafetería). */
export function categoriaDe(nombre: string): Categoria {
  const n = plano(nombre);
  const c = CATEGORIAS.find((x) => x.palabras.test(n));
  return c ? { id: c.id, titulo: c.titulo } : OTROS;
}

/** La carta agrupada, en el orden de CATEGORIAS y con «Más de la carta» al final. Sin grupos vacíos. */
export function cartaPorCategoria<P extends { name: string }>(productos: readonly P[]): { categoria: Categoria; productos: P[] }[] {
  // Orden de la carta: lo de tomar, lo de comer, lo dulce, y lo de llevar a casa al final.
  const orden = ["cafe", "bebidas", "brunch", "pasteleria", "granos", OTROS.id];
  const grupos = new Map<string, { categoria: Categoria; productos: P[] }>();
  for (const p of productos) {
    const c = categoriaDe(p.name);
    const g = grupos.get(c.id) ?? { categoria: c, productos: [] };
    g.productos.push(p);
    grupos.set(c.id, g);
  }
  return orden.flatMap((id) => (grupos.has(id) ? [grupos.get(id)!] : []));
}

export function precioUnitario(p: Pick<ProductoDeLaCarta, "saleUnit" | "price" | "pricePerKg">): number {
  return (p.saleUnit === "WEIGHT" ? p.pricePerKg : p.price) ?? 0;
}

/** Cuánto suma o resta un toque de «+ / −»: un cuarto de kilo en lo que se vende por peso. */
export function pasoDe(p: Pick<ProductoDeLaCarta, "saleUnit">): number {
  return p.saleUnit === "WEIGHT" ? 0.25 : 1;
}

const centavos = (n: number) => Math.round(n * 100) / 100;

export type LineaDeLaBolsa<P> = { producto: P; cantidad: number; importe: number };

/** Las líneas de la bolsa con su importe, en el orden de la carta. Lo que ya no está, se cae. */
export function lineasDeLaBolsa<P extends ProductoDeLaCarta>(productos: readonly P[], bolsa: Readonly<Record<string, number>>): LineaDeLaBolsa<P>[] {
  return productos
    .filter((p) => (bolsa[p.id] ?? 0) > 0)
    .map((p) => ({ producto: p, cantidad: bolsa[p.id], importe: centavos(bolsa[p.id] * precioUnitario(p)) }));
}

export type TotalesDeLaBolsa = { subtotal: number; envio: number; total: number; unidades: number };

/** Subtotal + envío = total. El envío es 0 en retiro (lo decide `useEntregaDeLaTienda`). */
export function totalesDeLaBolsa(lineas: readonly { cantidad: number; importe: number; producto: { saleUnit: "UNIT" | "WEIGHT" } }[], envio: number): TotalesDeLaBolsa {
  const subtotal = centavos(lineas.reduce((s, l) => s + l.importe, 0));
  const e = Number.isFinite(envio) && envio > 0 ? centavos(envio) : 0;
  // Lo que se vende por peso cuenta como una cosa en el contador de la barra.
  const unidades = lineas.reduce((s, l) => s + (l.producto.saleUnit === "WEIGHT" ? 1 : l.cantidad), 0);
  return { subtotal, envio: e, total: centavos(subtotal + e), unidades };
}

/** La cantidad nueva tras un toque, sin bajar de 0 y sin sumar lo que no hay. */
export function cantidadTrasToque(p: Pick<ProductoDeLaCarta, "saleUnit" | "disponibilidad">, actual: number, dir: 1 | -1): number {
  if (dir === 1 && p.disponibilidad === "sin-stock") return actual;
  return Math.max(0, centavos(actual + dir * pasoDe(p)));
}

// ── El control del formulario ─────────────────────────────────────────────────

export type CampoDelPedido = "customerName" | "customerPhone" | "address" | "medioPreferido" | "pagaCon" | "aceptaTerminos";

export type DatosDelPedido = {
  nombre: string;
  telefono: string;
  fulfillment: "PICKUP" | "DELIVERY";
  direccion: string;
  medio: string;
  pagaCon: string;
  acepta: boolean;
  total: number;
  medios: readonly MedioPreferido[];
};

export type RevisionDelPedido = { ok: true } | { ok: false; campo: CampoDelPedido; error: string };

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;

/** Lo que se revisa antes de mandar, en el orden en que aparece en pantalla. */
export function revisarPedidoLocal(d: DatosDelPedido): RevisionDelPedido {
  if (d.nombre.trim().length < 2) return { ok: false, campo: "customerName", error: "Escribí tu nombre, así el local sabe de quién es el pedido." };
  const digitos = d.telefono.replace(/\D/g, "");
  if (digitos.length < 8 || digitos.length > 15) {
    return { ok: false, campo: "customerPhone", error: "Escribí tu WhatsApp con código de área (por ejemplo 11 2345 6789)." };
  }
  if (d.fulfillment === "DELIVERY" && d.direccion.trim().length < 5) {
    return { ok: false, campo: "address", error: "Escribí la dirección de entrega: calle, número y, si hay, piso o depto." };
  }
  if (d.medios.length > 0 && d.medio === "") return { ok: false, campo: "medioPreferido", error: "Elegí cómo vas a pagar." };
  const pago = leerPago(d.medio, d.pagaCon, d.medios);
  if (!pago.ok) return { ok: false, campo: pago.error.includes("efectivo") ? "pagaCon" : "medioPreferido", error: pago.error };
  if (pago.medio === "efectivo" && pago.pagaCon !== null && pago.pagaCon < d.total) {
    return { ok: false, campo: "pagaCon", error: `Con ${pesos(pago.pagaCon)} no alcanza: el total es ${pesos(d.total)}. Dejalo vacío si pagás justo.` };
  }
  if (!d.acepta) return { ok: false, campo: "aceptaTerminos", error: "Para mandar el pedido, aceptá los términos y la política de privacidad." };
  return { ok: true };
}

// ── El botón de arrepentimiento ───────────────────────────────────────────────

/** El número de pedido que llega por la URL (?pedido=), sólo si parece uno; si no, null. */
export function numeroDePedido(raw: unknown): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const s = String(v ?? "").trim().replace(/^#/, "");
  return /^[A-Za-z0-9-]{1,24}$/.test(s) ? s.toUpperCase() : null;
}

/** El mensaje prellenado de «Quiero cancelar mi pedido» para el WhatsApp del local. */
export function mensajeDeCancelacion(nombreDelLocal: string, pedidoRaw: unknown): string {
  const n = numeroDePedido(pedidoRaw);
  const cual = n ? `mi pedido #${n}` : "mi pedido (número: ___)";
  return `Hola ${nombreDelLocal}, quiero cancelar ${cual}. Mi nombre es ___. Gracias.`;
}
