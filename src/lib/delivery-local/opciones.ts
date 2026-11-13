// ============================================================================
// DELIVERY LOCAL · OPCIONES DE PRODUCTO — «Tamaño», «Leche y extras», con su recargo. PURA.
// ============================================================================
//
// DEL-3, opción A: los grupos de opciones viven en la config del local (config.ts), por producto
// (id o nombre), SIN migración. Un grupo es «unico» (radio: el tamaño) o «multiple» (casillas: la
// leche y los extras); cada opción suma un recargo en PESOS ENTEROS (0 = sin cargo).
//
// PLATA — EL SERVIDOR NO CONFÍA EN EL CLIENTE. Del navegador viaja sólo QUÉ se eligió (ids, en el
// campo `opciones` de cada línea, en el mismo orden que `productId`); nunca un precio. El alta
// (`opcionesDelAlta`, desde `placeOnlineOrder`) vuelve a leer los grupos de la config y:
//   · una opción o grupo que no existe, dos opciones en un grupo único, un grupo obligatorio sin
//     elegir, opciones en un producto que no tiene → RECHAZO con mensaje claro, sin grabar;
//   · el recargo es (suma de los recargos de la config) × cantidad, y entra al pedido como una
//     LÍNEA SIN PRODUCTO (la misma de «precio a mano» del Core: suma al total, no mueve stock);
//   · lo elegido va a la NOTA del pedido: lo ven la bandeja, el cajón y el WhatsApp al repartidor.
// DEUDA ANOTADA: en «Ventas del día» la línea del recargo se ve como «precio a mano»; cuando
// haya un segundo comercio con opciones, el recargo pasa a una columna propia de OrderItem.

import type { LineaAMano } from "@/lib/venta-reglas";

export type OpcionDeProducto = {
  /** Identificador estable: es lo que viaja en el formulario. [a-z0-9-]. */
  id: string;
  nombre: string;
  /** Recargo por unidad, en pesos enteros (0 = sin cargo). */
  recargo: number;
};

export type GrupoDeOpciones = {
  id: string;
  nombre: string;
  /** «unico»: se elige una (radio). «multiple»: ninguna, una o varias (casillas). */
  tipo: "unico" | "multiple";
  /** Sin elegir no se puede sumar al pedido. */
  obligatorio?: boolean;
  opciones: readonly OpcionDeProducto[];
};

/** Los grupos de UN producto de la carta, buscado por id o, si no, por nombre. */
export type OpcionesDeProducto = { producto: string; grupos: readonly GrupoDeOpciones[] };

/** Lo elegido en una línea, ya resuelto contra la config. */
export type Elegida = { grupo: GrupoDeOpciones; opcion: OpcionDeProducto };

/** El nombre sin tildes, en minúscula y sin espacios de más, para comparar. */
function plano(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Los grupos de opciones del producto (por id primero, después por nombre). Sin opciones, []. */
export function gruposDelProducto(
  opciones: readonly OpcionesDeProducto[] | undefined,
  p: { id: string; name: string },
): readonly GrupoDeOpciones[] {
  if (!opciones || opciones.length === 0) return [];
  const porId = opciones.find((o) => o.producto === p.id);
  if (porId) return porId.grupos;
  const nombre = plano(p.name);
  return opciones.find((o) => plano(o.producto) === nombre)?.grupos ?? [];
}

// ── La elección codificada: «tamano:grande|leche:almendra,canela» ─────────────

const LARGO_MAX = 300;
const ID = /^[a-z0-9-]{1,40}$/;

/**
 * La elección en texto canónico (grupos y opciones en el orden de la config): sirve de campo del
 * formulario y de clave de la línea en la bolsa (mismo producto + mismas opciones = misma línea).
 */
export function codificarEleccion(elegidas: readonly Elegida[]): string {
  const porGrupo = new Map<string, string[]>();
  for (const e of elegidas) porGrupo.set(e.grupo.id, [...(porGrupo.get(e.grupo.id) ?? []), e.opcion.id]);
  return [...porGrupo.entries()].map(([g, os]) => `${g}:${os.join(",")}`).join("|");
}

/**
 * La clave de una línea de la bolsa: el mismo producto con opciones distintas son DOS líneas.
 * Sin opciones, el id del producto (la bolsa de siempre).
 */
export function claveDeLinea(productId: string, opciones: string): string {
  return opciones ? `${productId}#${opciones}` : productId;
}

/** El id del producto y las opciones de una clave de la bolsa. */
export function partesDeLaClave(clave: string): { productId: string; opciones: string } {
  const i = clave.indexOf("#");
  return i < 0 ? { productId: clave, opciones: "" } : { productId: clave.slice(0, i), opciones: clave.slice(i + 1) };
}

export type LecturaDeEleccion = { ok: true; elegidas: Elegida[] } | { ok: false; error: string };

/**
 * Lee la elección que mandó el navegador contra los grupos de la config. Devuelve las opciones en
 * el orden de la config (así la codificación es canónica) o el motivo del rechazo.
 */
export function leerEleccion(grupos: readonly GrupoDeOpciones[], crudo: unknown, producto: string): LecturaDeEleccion {
  const texto = crudo === null || crudo === undefined ? "" : crudo;
  if (typeof texto !== "string" || texto.length > LARGO_MAX) return { ok: false, error: `No pudimos leer las opciones de ${producto}: volvé a elegirlas.` };
  const pedidas = new Map<string, Set<string>>();
  if (texto.trim() !== "") {
    for (const parte of texto.split("|")) {
      const [g, os, sobra] = parte.split(":");
      if (sobra !== undefined || !g || !ID.test(g) || !os || pedidas.has(g)) {
        return { ok: false, error: `No pudimos leer las opciones de ${producto}: volvé a elegirlas.` };
      }
      const ids = os.split(",");
      if (ids.some((o) => !ID.test(o)) || new Set(ids).size !== ids.length) {
        return { ok: false, error: `No pudimos leer las opciones de ${producto}: volvé a elegirlas.` };
      }
      pedidas.set(g, new Set(ids));
    }
  }
  if (pedidas.size > 0 && grupos.length === 0) return { ok: false, error: `${producto} no tiene opciones para elegir: sacalo y volvé a sumarlo.` };
  for (const g of pedidas.keys()) {
    if (!grupos.some((x) => x.id === g)) return { ok: false, error: `Esa opción ya no está para ${producto}: volvé a elegirla.` };
  }
  const elegidas: Elegida[] = [];
  for (const grupo of grupos) {
    const ids = pedidas.get(grupo.id) ?? new Set<string>();
    for (const id of ids) {
      if (!grupo.opciones.some((o) => o.id === id)) return { ok: false, error: `Esa opción de «${grupo.nombre}» ya no está para ${producto}: volvé a elegirla.` };
    }
    if (grupo.tipo === "unico" && ids.size > 1) return { ok: false, error: `En «${grupo.nombre}» de ${producto} se elige una sola opción.` };
    if (grupo.obligatorio && ids.size === 0) return { ok: false, error: `Elegí ${grupo.nombre.toLowerCase()} de ${producto}.` };
    for (const opcion of grupo.opciones) if (ids.has(opcion.id)) elegidas.push({ grupo, opcion });
  }
  return { ok: true, elegidas };
}

/** Cuánto suman las opciones a UNA unidad, en pesos enteros (los de la config, nunca del cliente). */
export function recargoUnitario(elegidas: readonly Elegida[]): number {
  return elegidas.reduce((s, e) => s + (Number.isInteger(e.opcion.recargo) && e.opcion.recargo > 0 ? e.opcion.recargo : 0), 0);
}

/** «Grande, leche de almendras, canela». */
export function detalleDeEleccion(elegidas: readonly Elegida[]): string {
  return elegidas.map((e) => e.opcion.nombre).join(", ");
}

// ── El alta del pedido ──────────────────────────────────────────────────────

export type LineaConOpciones = { productId: string; qty: number; opciones: unknown };

export type OpcionesDelAlta =
  | {
      ok: true;
      /** Una por línea con recargo: suma al total del pedido y no mueve stock. */
      lineasAMano: LineaAMano[];
      /** Para la nota del pedido (bandeja, cajón, repartidor). */
      renglones: string[];
      /** Para la auditoría del alta. */
      auditoria: { productId: string; cantidad: number; opciones: string; recargo: number }[];
    }
  | { ok: false; error: string };

const NOMBRE_MAX = 80; // el de las líneas a mano del Core (venta-reglas.ts, NOMBRE_A_MANO_MAX)
const MOTIVO = "Opciones elegidas en la vidriera (Pedí Local)";

const cantidadTexto = (n: number) => (Number.isInteger(n) ? String(n) : String(n).replace(".", ","));

/**
 * Las opciones de todas las líneas del pedido, RECALCULADAS desde la config. `lineas` va en el
 * orden del formulario (productId, quantity, opciones); `productos` son los de la base, del
 * negocio (id y nombre) para buscar los grupos. Las líneas sin cantidad o sin producto se saltean.
 */
export function opcionesDelAlta(
  config: readonly OpcionesDeProducto[] | undefined,
  lineas: readonly LineaConOpciones[],
  productos: readonly { id: string; name: string }[],
): OpcionesDelAlta {
  const porId = new Map(productos.map((p) => [p.id, p]));
  const lineasAMano: LineaAMano[] = [];
  const detalle: string[] = [];
  const auditoria: Extract<OpcionesDelAlta, { ok: true }>["auditoria"] = [];
  for (const l of lineas) {
    if (!l.productId || !(l.qty > 0)) continue;
    const p = porId.get(l.productId);
    const pidio = typeof l.opciones === "string" && l.opciones.trim() !== "";
    if (!p) {
      // El producto que no existe lo rechaza el alta; con opciones, se frena acá.
      if (pidio) return { ok: false, error: "Uno de los productos de tu pedido ya no está en la carta: sacalo y volvé a probar." };
      continue;
    }
    const grupos = gruposDelProducto(config, p);
    const r = leerEleccion(grupos, l.opciones, p.name);
    if (!r.ok) return r;
    if (r.elegidas.length === 0) continue;
    const unitario = recargoUnitario(r.elegidas);
    if (unitario > 0 && !Number.isInteger(l.qty)) return { ok: false, error: `${p.name} con opciones se pide por unidad, no por peso.` };
    const importe = unitario * l.qty;
    const texto = detalleDeEleccion(r.elegidas);
    detalle.push(`${cantidadTexto(l.qty)} × ${p.name} (${texto})`);
    auditoria.push({ productId: p.id, cantidad: l.qty, opciones: codificarEleccion(r.elegidas), recargo: importe });
    if (importe > 0) {
      const nombre = `Opciones ×${cantidadTexto(l.qty)} · ${p.name}: ${texto}`;
      lineasAMano.push({ nombre: nombre.length > NOMBRE_MAX ? `${nombre.slice(0, NOMBRE_MAX - 1)}…` : nombre, importe, motivo: MOTIVO });
    }
  }
  return { ok: true, lineasAMano, renglones: detalle.length > 0 ? [`Opciones: ${detalle.join(" · ")}`] : [], auditoria };
}
