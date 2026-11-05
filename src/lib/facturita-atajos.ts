/**
 * FACTUROQUE · «Mis productos» y el camino corto de dos toques (pura, sin DB).
 *
 * El lema «tu facturación en dos toques» es literal: toque 1 = el producto guardado (detalle +
 * precio), toque 2 = «Emitir factura por $X» a consumidor final. Lo que NO entra en dos toques
 * (comprador con documento, otro monto, un servicio con sus fechas, la alícuota del inscripto) se
 * edita aparte: el camino corto no lo pide ni lo inventa.
 *
 * Dónde vive cada cosa (sin migración, para no depender de Gate 2):
 *  · Un producto guardado es una fila de `Product` del negocio: `name` = detalle, `price` = precio,
 *    `unit` = «servicio» si se factura como servicio (cualquier otro valor = producto).
 *  · Cada emisión de Facturita deja un registro en `AuditLog` (entity `FacturitaEmision`,
 *    entityId = la clave de la emisión): es la guarda contra el doble toque y la fuente de
 *    «Repetir la última».
 */

import type { ConceptoFacturita, EmisionFacturita } from "@/lib/facturita-core";

export const DETALLE_MIN = 2;
export const DETALLE_MAX = 200;
/** Tope de cordura de un precio guardado (9 dígitos enteros, como el campo de total). */
export const PRECIO_MAX = 999_999_999;
/** Cuántos productos se muestran como botón: más no entran a mano en un celular. */
export const MAX_ATAJOS = 12;
/** `Product.unit` de un producto que se factura como servicio. */
export const UNIDAD_SERVICIO = "servicio";
/** `AuditLog.entity` del registro de cada emisión. */
export const ENTIDAD_EMISION = "FacturitaEmision";
export const ACCION_EMISION = "facturita.emision";

export interface Atajo {
  /** Id del producto, o `"ultima"` para «Repetir la última». */
  id: string;
  detalle: string;
  /** Pesos, redondeado a centavos. */
  precio: number;
  concepto: "productos" | "servicios";
}

export type AtajoValidado = { ok: true; detalle: string; precio: number; concepto: Atajo["concepto"] } | { ok: false; error: string };

/** "25.000,50" / "25000.5" / 25000.5 → 25000.5; NaN si no es un monto. */
export function montoDesdeTexto(v: string | number): number {
  if (typeof v === "number") return v;
  const s = v.trim();
  if (!s) return NaN;
  // Formato argentino: el punto separa miles y la coma, decimales. Sin coma, un único punto con
  // 1 o 2 decimales se lee como decimal ("25000.5").
  const normal = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : /^\d+\.\d{1,2}$/.test(s) ? s : s.replace(/\./g, "");
  return /^\d+(\.\d+)?$/.test(normal) ? Number(normal) : NaN;
}

const centavos = (n: number) => Math.round(n * 100) / 100;

/** Valida lo que la persona guarda como producto. */
export function validarAtajo(d: { detalle: unknown; precio: unknown; concepto?: unknown }): AtajoValidado {
  const detalle = typeof d.detalle === "string" ? d.detalle.trim().replace(/\s+/g, " ") : "";
  if (detalle.length < DETALLE_MIN) return { ok: false, error: "Poné qué es: va como detalle en la factura." };
  if (detalle.length > DETALLE_MAX) return { ok: false, error: `El detalle va hasta ${DETALLE_MAX} letras.` };
  const precio = typeof d.precio === "number" || typeof d.precio === "string" ? montoDesdeTexto(d.precio) : NaN;
  if (!Number.isFinite(precio) || precio <= 0) return { ok: false, error: "El precio tiene que ser mayor a cero." };
  if (precio > PRECIO_MAX) return { ok: false, error: "Ese precio es demasiado grande." };
  const concepto = d.concepto === "servicios" ? "servicios" : "productos";
  return { ok: true, detalle, precio: centavos(precio), concepto };
}

/** Fila de `Product` → atajo; `null` si no sirve como botón (sin precio, borrado). */
export function atajoDesdeProducto(p: { id: string; name: string; price: number | null; unit: string }): Atajo | null {
  const v = validarAtajo({ detalle: p.name, precio: p.price ?? 0, concepto: p.unit === UNIDAD_SERVICIO ? "servicios" : "productos" });
  return v.ok ? { id: p.id, detalle: v.detalle, precio: v.precio, concepto: v.concepto } : null;
}

/** Lo que se graba de cada emisión (AuditLog.changes) para «Repetir la última». */
export interface RegistroEmision {
  invoiceId: string;
  descripcion: string;
  total: number;
  concepto: ConceptoFacturita;
  consumidorFinal: boolean;
}

/**
 * «Repetir la última» sólo cuando se puede repetir tal cual en dos toques: fue a consumidor final.
 * Si llevaba comprador con documento, repetirla «a consumidor final» sería otra factura.
 */
export function atajoDesdeUltima(changes: unknown): Atajo | null {
  if (!changes || typeof changes !== "object") return null;
  const c = changes as Partial<RegistroEmision>;
  if (c.consumidorFinal !== true) return null;
  if (c.concepto !== "productos" && c.concepto !== "servicios") return null;
  const v = validarAtajo({ detalle: c.descripcion, precio: c.total, concepto: c.concepto });
  return v.ok ? { id: "ultima", detalle: v.detalle, precio: v.precio, concepto: v.concepto } : null;
}

/**
 * ¿El atajo se emite en dos toques? Sí con un producto de un emisor que no discrimina IVA.
 * Un servicio necesita las fechas que exige ARCA y el inscripto elige la alícuota: en esos casos
 * el atajo precarga el formulario completo en vez de inventar el dato.
 */
export function esCaminoCorto(atajo: Atajo, condicionEmisor: string | null): boolean {
  return atajo.concepto === "productos" && condicionEmisor !== null && condicionEmisor !== "RESPONSABLE_INSCRIPTO";
}

/** La emisión del camino corto: el producto, su precio, consumidor final. Nada más. */
export function emisionDesdeAtajo(atajo: Atajo, claveEmision: string): EmisionFacturita {
  return { descripcion: atajo.detalle, total: atajo.precio, concepto: "productos", claveEmision };
}

// ---------------------------------------------------------------------------
// Clave de la emisión (idempotencia contra el doble toque)
// ---------------------------------------------------------------------------

const FORMA_CLAVE = /^[A-Za-z0-9-]{16,64}$/;

/** La clave que manda el cliente: 16–64 letras, números o guiones (un UUID entra). */
export function claveEmisionValida(v: unknown): v is string {
  return typeof v === "string" && FORMA_CLAVE.test(v);
}

/** Clave nueva por intento de emisión. `crypto.randomUUID` donde existe (HTTPS y localhost). */
export function nuevaClaveEmision(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Texto del botón de confirmación: el monto y a quién, para saber qué se emite antes de tocar. */
export function textoEmitirAtajo(precioFormateado: string): string {
  return `Emitir factura por ${precioFormateado}`;
}

// ---------------------------------------------------------------------------
// Toques del camino corto (el modelo que mide el test del lema)
// ---------------------------------------------------------------------------

export type EstadoCaminoCorto =
  | { paso: "eligiendo" }
  | { paso: "confirmando"; atajo: Atajo; clave: string }
  | { paso: "emitiendo"; atajo: Atajo; clave: string }
  | { paso: "formulario"; atajo: Atajo };

export type ToqueCaminoCorto =
  | { tipo: "atajo"; atajo: Atajo; condicionEmisor: string | null; clave: string }
  | { tipo: "emitir" }
  | { tipo: "cambiar" }
  | { tipo: "listo" };

/**
 * La máquina de la pantalla: elegir → confirmar → emitir. Un segundo «emitir» mientras se emite
 * no cambia nada (el botón ya no responde) y, si llegara al servidor, viaja con la MISMA clave.
 */
export function tocar(e: EstadoCaminoCorto, t: ToqueCaminoCorto): EstadoCaminoCorto {
  switch (t.tipo) {
    case "atajo":
      if (e.paso === "emitiendo") return e;
      return esCaminoCorto(t.atajo, t.condicionEmisor)
        ? { paso: "confirmando", atajo: t.atajo, clave: t.clave }
        : { paso: "formulario", atajo: t.atajo };
    case "emitir":
      return e.paso === "confirmando" ? { paso: "emitiendo", atajo: e.atajo, clave: e.clave } : e;
    case "cambiar":
      return e.paso === "confirmando" ? { paso: "formulario", atajo: e.atajo } : e;
    case "listo":
      return e.paso === "emitiendo" ? { paso: "eligiendo" } : e;
  }
}
