// ============================================================================
// EL STOCK DEL CLUB — los productos con su stock, lo que hay que reponer, el conteo y los precios. PURO.
// ============================================================================
//
// Lo mismo que la solapa Stock del sistema de hoy (public/previews/breakpoint/club/app.mjs: `vistaStock`,
// `tablaPrecios`, `productoDialogo` y las acciones `guardarProducto`, `bajaProducto` y `px`):
//   · el INVENTARIO con buscador (nombre, rubro o código): precio, costo, stock, mínimo y cómo está (OK, reponer, sin
//     stock, sin controlar, plato, alquiler con los que están en uso);
//   · lo que FALTA (stock en el mínimo o abajo) con «Pedir lo que falta por WhatsApp» (hasta el doble del mínimo);
//   · EDITAR un producto: nombre, precio, costo, mínimo, códigos y el CONTEO («Stock actual»: vacío = sin controlar,
//     `ajustarStock`), y darlo de baja o volver a activarlo; el ALTA de un producto o un plato (sin stock);
//   · PRECIOS Y RENTABILIDAD: tocar el costo, el % sobre costo o el precio y ver qué deja cada producto en los
//     últimos 7 días (`rentabilidad`, `precioDesdeMarkup`).
// Es del dueño (permiso `stock` del motor): recepción lo ve, pero no lo cambia. Las reglas son del motor; acá se
// arma lo que se ve y se traduce cada toque (stock-core.test.ts).
//
// Diferencia con el vanilla, a propósito: un producto con stock sin controlar (`null`) dice «Sin controlar» (el
// vanilla lo marcaba «Reponer» porque `null <= mínimo` da true) y no entra en la lista de lo que falta.

import {
  ajustarStock,
  altaProducto,
  bajaProducto,
  buscarProductos,
  editarProducto,
  linkWhatsApp,
  mensajeWhatsApp,
  pesos,
  precioDesdeMarkup,
  producto as productoDe,
  puede,
  rentabilidad,
  sumarDias,
} from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub, Fecha, Producto } from "@/lib/club/motor.mjs";
import type { Desenlace } from "./almacen";
import { leerMonto } from "./caja-core";

const ddmm = (f: Fecha) => `${Number(f.slice(8))}/${Number(f.slice(5, 7))}`;

/** ¿Este usuario del club puede tocar el stock y los precios? (un dueño: permiso `stock`). */
export function puedeTocarStock(estado: EstadoClub, usuarioId: string | undefined): boolean {
  return !!usuarioId && puede(estado, usuarioId, "stock");
}

/** Una cantidad tipeada: «12» → 12; vacío → null; lo que no es un entero de 0 o más → NaN. */
export function leerCantidad(texto: string): number | null {
  const t = texto.trim();
  if (t === "") return null;
  return /^\d+$/.test(t) ? Number(t) : Number.NaN;
}

export type EstadoDelProducto = "plato" | "alquiler" | "sin-controlar" | "sin-stock" | "reponer" | "ok";

export const TEXTO_ESTADO: Readonly<Record<EstadoDelProducto, string>> = {
  plato: "Plato",
  alquiler: "Alquiler",
  "sin-controlar": "Sin controlar",
  "sin-stock": "Sin stock",
  reponer: "Reponer",
  ok: "OK",
};

export function estadoDelProducto(p: Producto): EstadoDelProducto {
  if (p.plato) return "plato";
  if (p.alquiler) return "alquiler";
  if (p.stock == null) return "sin-controlar";
  if (p.stock === 0) return "sin-stock";
  if (p.stock <= p.minimo) return "reponer";
  return "ok";
}

/** Cuántas se piden para reponer: hasta el doble del mínimo, al menos 1 (como el vanilla). */
export const cuantasPedir = (p: Producto): number => Math.max(p.minimo * 2 - (p.stock ?? 0), 1);

const codigosDe = (p: { codigo?: string; codigoExterno?: string }) => [p.codigo, p.codigoExterno].filter((c) => c && c.trim()).join(" · ");

export interface FilaStock {
  id: string;
  nombre: string;
  categoria: string;
  /** «BP-001 · 7790000000011», o "" si no tiene. */
  codigos: string;
  precio: number;
  costo: number;
  stock: number | null;
  minimo: number;
  /** Alquiler: los que están prestados ahora. */
  enUso: number | null;
  estado: EstadoDelProducto;
}

export interface Faltante {
  id: string;
  nombre: string;
  stock: number;
  minimo: number;
  pedir: number;
}

export interface VistaStock {
  filas: FilaStock[];
  /** Productos activos en total (sin filtrar). */
  total: number;
  /** Lo que está en el mínimo o abajo (de todos, no sólo lo filtrado). */
  faltantes: Faltante[];
  /** «Pedir lo que falta por WhatsApp» (sin número: WhatsApp abre para elegir al proveedor). null si no falta nada. */
  pedirPorWhatsApp: string | null;
  /** Cuántos productos que llevan stock todavía no se contaron. */
  sinControlar: number;
  /** Los dados de baja, para volver a activarlos. */
  dadosDeBaja: { id: string; nombre: string }[];
  firma: string;
}

export function armarStock(estado: EstadoClub, texto: string): VistaStock {
  const activos = estado.productos.filter((p) => p.activo !== false);
  const filas = buscarProductos(estado, texto).map(
    (p): FilaStock => ({
      id: p.id,
      nombre: p.nombre,
      categoria: p.categoria,
      codigos: codigosDe(p),
      precio: p.precio,
      costo: p.costo ?? 0,
      stock: p.stock,
      minimo: p.minimo,
      enUso: p.alquiler ? (p.prestados ?? 0) : null,
      estado: estadoDelProducto(p),
    }),
  );
  const bajos = activos.filter((p) => !p.alquiler && !p.plato && p.stock != null && p.stock <= p.minimo);
  const faltantes = bajos.map((p) => ({ id: p.id, nombre: p.nombre, stock: p.stock ?? 0, minimo: p.minimo, pedir: cuantasPedir(p) }));
  const vista: Omit<VistaStock, "firma"> = {
    filas,
    total: activos.length,
    faltantes,
    pedirPorWhatsApp: faltantes.length ? linkWhatsApp("", mensajeWhatsApp("reposicion", { lista: faltantes.map((f) => `${f.nombre} (${f.pedir})`).join(", ") })) : null,
    sinControlar: activos.filter((p) => !p.plato && p.stock == null).length,
    dadosDeBaja: estado.productos.filter((p) => p.activo === false).map((p) => ({ id: p.id, nombre: p.nombre })),
  };
  return { ...vista, firma: JSON.stringify(vista) };
}

/** «18», «Sin controlar», «8 (2 en uso)», «—» (plato). */
export function textoStock(f: Pick<FilaStock, "stock" | "enUso" | "estado">): string {
  if (f.estado === "plato") return "—";
  if (f.stock == null) return "Sin controlar";
  return f.enUso != null ? `${f.stock} (${f.enUso} en uso)` : String(f.stock);
}

export interface VistaProducto {
  id: string;
  nombre: string;
  categoria: string;
  precio: number;
  costo: number;
  stock: number | null;
  minimo: number;
  codigo: string;
  codigoExterno: string;
  plato: boolean;
  alquiler: boolean;
  enUso: number | null;
  /** Si se ve en la tienda de la web (hoy no se cambia desde acá: el motor no lo recibe). */
  tienda: boolean;
  activo: boolean;
  estado: EstadoDelProducto;
  firma: string;
}

export function armarProducto(estado: EstadoClub, productoId: string): VistaProducto | null {
  const p = productoDe(estado, productoId);
  if (!p) return null;
  const vista: Omit<VistaProducto, "firma"> = {
    id: p.id,
    nombre: p.nombre,
    categoria: p.categoria,
    precio: p.precio,
    costo: p.costo ?? 0,
    stock: p.stock,
    minimo: p.minimo,
    codigo: p.codigo ?? "",
    codigoExterno: p.codigoExterno ?? "",
    plato: !!p.plato,
    alquiler: !!p.alquiler,
    enUso: p.alquiler ? (p.prestados ?? 0) : null,
    tienda: !!p.tienda,
    activo: p.activo !== false,
    estado: estadoDelProducto(p),
  };
  return { ...vista, firma: JSON.stringify(vista) };
}

// ───────────── precios y rentabilidad ─────────────

export type TonoMargen = "bien" | "justo" | "bajo";

export interface FilaPrecio {
  id: string;
  nombre: string;
  codigos: string;
  costo: number;
  /** % sobre el costo, redondeado (null sin costo). */
  markup: number | null;
  precio: number;
  margen: number;
  /** % del precio que queda, redondeado. */
  margenPct: number;
  /** ≥ 50 % bien · ≥ 30 % justo · menos, bajo (los cortes del vanilla). */
  tono: TonoMargen;
  unidades: number;
  facturado: number;
  ganancia: number;
}

export interface VistaPrecios {
  /** «11/10 al 17/10»: los últimos 7 días de caja. */
  periodo: string;
  filas: FilaPrecio[];
  /** Totales de los 7 días (de todos los productos, no sólo lo filtrado). */
  facturado: number;
  ganancia: number;
  margenPct: number;
  firma: string;
}

const tono = (m: number): TonoMargen => (m >= 0.5 ? "bien" : m >= 0.3 ? "justo" : "bajo");

export function armarPrecios(estado: EstadoClub, texto: string, ahora: Ahora): VistaPrecios {
  const hasta = ahora.fecha;
  const desde = sumarDias(hasta, -6);
  const r = rentabilidad(estado, { desde, hasta });
  const por = new Map(r.filas.map((f) => [f.productoId, f]));
  const filas = buscarProductos(estado, texto)
    .map((p) => por.get(p.id))
    .filter((f) => f !== undefined)
    .map(
      (f): FilaPrecio => ({
        id: f.productoId,
        nombre: f.nombre,
        codigos: codigosDe(f),
        costo: f.costo,
        markup: f.markupPct == null ? null : Math.round(f.markupPct * 100),
        precio: f.precio,
        margen: f.margen,
        margenPct: Math.round(f.margenPct * 100),
        tono: tono(f.margenPct),
        unidades: f.unidades,
        facturado: f.facturado,
        ganancia: f.ganancia,
      }),
    );
  const vista: Omit<VistaPrecios, "firma"> = {
    periodo: `${ddmm(desde)} al ${ddmm(hasta)}`,
    filas,
    facturado: r.facturado,
    ganancia: r.ganancia,
    margenPct: Math.round(r.margenPct * 100),
  };
  return { ...vista, firma: JSON.stringify(vista) };
}

// ───────────── lo que se toca ─────────────

export type CampoDePrecio = "costo" | "markup" | "precio";

export type AccionStock =
  | { tipo: "alta"; nombre: string; categoria: string; precio: string; costo: string; minimo: string; stock: string; codigo: string; codigoExterno: string; plato: boolean }
  /**
   * `conteo`: «Stock actual»; vacío = sin controlar; `null` = no se tocó (no se ajusta: si mientras tanto se vendió
   * algo, no se pisa con lo que había al abrir la ficha). En un plato no se mira (no lleva stock).
   */
  | { tipo: "editar"; productoId: string; nombre: string; precio: string; costo: string; minimo: string; conteo: string | null; codigo: string; codigoExterno: string }
  | { tipo: "baja"; productoId: string; activo: boolean }
  /** Una celda de «Precios y rentabilidad»: el costo, el % sobre costo (recalcula el precio) o el precio. */
  | { tipo: "precio"; productoId: string; campo: CampoDePrecio; valor: string };

export interface DesenlaceStock extends Desenlace {
  /** El producto nuevo (la pantalla abre su ficha). */
  productoId?: string;
}

const falla = (r: { motivo: string }): DesenlaceStock => ({ ok: false, mensaje: r.motivo });
const no = (mensaje: string): DesenlaceStock => ({ ok: false, mensaje });

/** El costo: vacío = $ 0 (como el vanilla); lo que no es un monto, NaN. */
const leerCosto = (texto: string) => (texto.trim() === "" ? 0 : leerMonto(texto));

export function ejecutarStock(estado: EstadoClub, accion: AccionStock, ahora: Ahora, auth: Auth): DesenlaceStock {
  switch (accion.tipo) {
    case "alta": {
      const costo = leerCosto(accion.costo);
      if (Number.isNaN(costo) || costo < 0) return no("El costo es un monto (0 o más).");
      const minimo = accion.plato ? 0 : leerCantidad(accion.minimo);
      const stock = accion.plato ? 0 : leerCantidad(accion.stock);
      if (Number.isNaN(minimo)) return no("El mínimo es una cantidad (0 o más).");
      if (Number.isNaN(stock)) return no("El stock inicial es una cantidad (0 o más).");
      const r = altaProducto(
        estado,
        {
          nombre: accion.nombre,
          categoria: accion.categoria.trim(),
          precio: leerMonto(accion.precio),
          costo,
          minimo: minimo ?? 0,
          stock: stock ?? 0,
          codigo: accion.codigo,
          codigoExterno: accion.codigoExterno,
          plato: accion.plato,
        },
        auth,
        ahora,
      );
      if (!r.ok) return falla(r);
      return { ok: true, mensaje: `Listo: ${r.producto.nombre} ya está en ${accion.plato ? "la carta, a " : "los productos, a "}${pesos(r.producto.precio)}.`, productoId: r.producto.id };
    }
    case "editar": {
      const p = productoDe(estado, accion.productoId);
      if (!p) return no("No encuentro el producto.");
      // Todo se valida ANTES de tocar nada: el conteo va después de editar y no puede quedar a medias.
      const conteo = p.plato || accion.conteo === null ? p.stock : leerCantidad(accion.conteo);
      if (Number.isNaN(conteo)) return no("En «Stock actual» poné cuántas hay (0 o más), o dejalo vacío si no se controla.");
      const minimo = p.plato ? null : leerCantidad(accion.minimo);
      if (Number.isNaN(minimo)) return no("El mínimo es una cantidad (0 o más).");
      const costo = leerCosto(accion.costo);
      if (Number.isNaN(costo) || costo < 0) return no("El costo es un monto (0 o más).");
      const r = editarProducto(
        estado,
        p.id,
        { nombre: accion.nombre, precio: leerMonto(accion.precio), costo, minimo: p.plato ? null : (minimo ?? 0), codigo: accion.codigo, codigoExterno: accion.codigoExterno },
        auth,
        ahora,
      );
      if (!r.ok) return falla(r);
      const antes = p.stock;
      if (!p.plato && conteo !== antes) {
        const aj = ajustarStock(estado, p.id, conteo, auth, ahora);
        if (!aj.ok) return falla(aj);
        const t = (n: number | null) => (n == null ? "sin controlar" : String(n));
        return { ok: true, mensaje: `${p.nombre} guardado. Stock: ${t(antes)} → ${t(conteo)}.` };
      }
      return { ok: true, mensaje: `${p.nombre} guardado.` };
    }
    case "baja": {
      const p = productoDe(estado, accion.productoId);
      const r = bajaProducto(estado, accion.productoId, auth, ahora, accion.activo);
      if (!r.ok) return falla(r);
      return { ok: true, mensaje: accion.activo ? `${p?.nombre ?? "El producto"} está activo otra vez.` : `${p?.nombre ?? "El producto"} dado de baja: ya no se vende.` };
    }
    case "precio": {
      const p = productoDe(estado, accion.productoId);
      if (!p) return no("No encuentro el producto.");
      if (accion.valor.trim() === "") return no("Ese campo no puede quedar vacío: no se cambió nada.");
      let cambios: { costo?: number; precio?: number };
      if (accion.campo === "markup") {
        const pct = Number(accion.valor.replace("%", "").replace(",", ".").trim());
        const precio = precioDesdeMarkup(p.costo ?? 0, pct);
        if (precio === null) return no(Number.isFinite(pct) ? "Para calcular el precio por % sobre costo, el producto necesita costo." : "Poné el % sobre el costo (por ejemplo 80).");
        cambios = { precio };
      } else {
        const v = leerMonto(accion.valor);
        if (Number.isNaN(v)) return no("Poné un monto.");
        cambios = accion.campo === "costo" ? { costo: v } : { precio: v };
      }
      const r = editarProducto(estado, p.id, cambios, auth, ahora);
      if (!r.ok) return falla(r);
      return { ok: true, mensaje: `${p.nombre}: precio ${pesos(p.precio)} · margen ${Math.round(((p.precio - (p.costo ?? 0)) / p.precio) * 100)} %.` };
    }
  }
}
