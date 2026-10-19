// ============================================================================
// LOS PROVEEDORES DEL CLUB — lo que les debemos, su cuenta, los pagos y los remitos. PURO.
// ============================================================================
//
// Lo mismo que la solapa Proveedores del sistema de hoy (public/previews/breakpoint/club/app.mjs: `vistaProveedores`,
// `fichaProveedor`, `altaProveedorDialogo`, `remitoDialogo` y las acciones `guardarAltaProveedor`,
// `guardarProveedor`, `pagarProveedor`, `guardarRemito`):
//   · la LISTA con lo que le debemos a cada uno (y el total, el mismo número que «Le debemos a proveedores» del
//     Tablero: `kpis().deudaProveedores`);
//   · el ALTA y la EDICIÓN (nombre, rubro, CUIT, teléfono);
//   · la CUENTA con cada proveedor (remitos que suman, pagos que restan, saldo corrido) y sus remitos con el detalle;
//   · PAGAR: en efectivo (sale del cajón y queda en la caja del día) o por transferencia, con el PIN de quien paga
//     (lo pide el motor para los dos medios, como el vanilla); nunca más de lo que se debe;
//   · el REMITO: proveedor, número, los productos (con el lector, que suma 1 por lectura, o buscándolos), la cantidad
//     y el costo de cada uno. Suma stock, deja ese costo en el producto y la deuda con el proveedor.
// Permisos del motor: el remito lo carga también recepción (`remito`); ver las cuentas, el alta y la edición son del
// dueño (`verProveedores`) y pagar, del dueño con PIN (`pagarProveedor`). Tests: proveedores-core.test.ts.

import {
  altaProveedor,
  buscarProductos,
  ccProveedor,
  deudaConProveedor,
  editarProveedor,
  hhmm,
  pagarProveedor,
  pesos,
  producto as productoDe,
  productoPorCodigo,
  proveedor as proveedorDe,
  puede,
  registrarRemito,
} from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub, Fecha, Producto, Proveedor, Remito } from "@/lib/club/motor.mjs";
import type { Desenlace } from "./almacen";
import { leerMonto } from "./caja-core";
import { leerCantidad } from "./stock-core";

const ddmm = (f: Fecha) => `${Number(f.slice(8))}/${Number(f.slice(5, 7))}`;
const cuando = (s: { fecha: Fecha | null; min: number | null }) => `${s.fecha ? ddmm(s.fecha) : ""}${s.min != null ? ` ${hhmm(s.min)}` : ""}`.trim();

// El estado tipa estas listas como `unknown[]` (motor.d.mts): se leen con su forma real.
const proveedoresDe = (e: EstadoClub) => e.proveedores as Proveedor[];
const remitosDe = (e: EstadoClub) => e.remitos as Remito[];

/** A proveedores se les paga en efectivo o por transferencia (lo controla el motor). */
export const MEDIOS_PROVEEDOR = ["transferencia", "efectivo"] as const;
export type MedioProveedor = (typeof MEDIOS_PROVEEDOR)[number];
export const ETIQUETA_MEDIO_PROVEEDOR: Readonly<Record<MedioProveedor, string>> = { transferencia: "Transferencia", efectivo: "Efectivo (sale del cajón)" };

export interface PermisosProveedores {
  /** Ver lo que se les debe, sus cuentas, el alta y la edición (un dueño). */
  ver: boolean;
  /** Pagar (un dueño, con PIN). */
  pagar: boolean;
  /** Cargar remitos (dueños y recepción). */
  remito: boolean;
}

export function permisosProveedores(estado: EstadoClub, usuarioId: string | undefined): PermisosProveedores {
  const p = (a: string) => !!usuarioId && puede(estado, usuarioId, a);
  return { ver: p("verProveedores"), pagar: p("pagarProveedor"), remito: p("remito") };
}

// ───────────── la lista ─────────────

export interface FilaProveedor {
  id: string;
  nombre: string;
  rubro: string;
  cuit: string;
  tel: string;
  deuda: number;
}

export interface VistaProveedores {
  filas: FilaProveedor[];
  /** Lo que le debemos a todos: el mismo cálculo que «Le debemos a proveedores» del Tablero (`kpis`). */
  deudaTotal: number;
  firma: string;
}

/** Los activos; a los que les debemos, primero (de más a menos), después por nombre. */
export function armarProveedores(estado: EstadoClub): VistaProveedores {
  const filas = proveedoresDe(estado)
    .filter((p) => p.activo !== false)
    .map((p) => ({ id: p.id, nombre: p.nombre, rubro: p.rubro, cuit: p.cuit, tel: p.tel, deuda: deudaConProveedor(estado, p.id) }))
    .sort((a, b) => b.deuda - a.deuda || a.nombre.localeCompare(b.nombre, "es"));
  const vista = { filas, deudaTotal: proveedoresDe(estado).reduce((s, p) => s + Math.max(0, deudaConProveedor(estado, p.id)), 0) };
  return { ...vista, firma: JSON.stringify(vista) };
}

// ───────────── la ficha ─────────────

export interface RenglonCuentaProveedor {
  cuando: string;
  concepto: string;
  debe: number;
  haber: number;
  saldo: number;
}

export interface RemitoVisto {
  id: string;
  numero: string;
  cuando: string;
  cargo: string;
  total: number;
  lineas: { nombre: string; cant: number; costo: number; subtotal: number }[];
}

export interface VistaFichaProveedor {
  id: string;
  nombre: string;
  rubro: string;
  cuit: string;
  tel: string;
  /** Lo que le debemos hoy. */
  saldo: number;
  /** Del más viejo al más nuevo, con el saldo corrido. */
  movimientos: RenglonCuentaProveedor[];
  /** Sus remitos, del más nuevo al más viejo, con lo que trajo cada uno. */
  remitos: RemitoVisto[];
  firma: string;
}

/** La ficha con su cuenta (sólo quien puede ver proveedores: si no, el motor dice por qué). null si no existe. */
export function armarFichaProveedor(estado: EstadoClub, proveedorId: string, auth: Auth): VistaFichaProveedor | { motivo: string } | null {
  if (!proveedorDe(estado, proveedorId)) return null;
  const cc = ccProveedor(estado, proveedorId, auth);
  if (!cc.ok) return { motivo: cc.motivo };
  const p = cc.proveedor;
  const remitos = remitosDe(estado)
    .filter((r) => r.proveedorId === proveedorId)
    .slice()
    .reverse()
    .map((r) => ({ id: r.id, numero: r.numero, cuando: cuando(r), cargo: r.cargo, total: r.total, lineas: r.items.map((i) => ({ nombre: i.nombre, cant: i.cant, costo: i.costo, subtotal: i.cant * i.costo })) }));
  const vista: Omit<VistaFichaProveedor, "firma"> = {
    id: p.id,
    nombre: p.nombre,
    rubro: p.rubro,
    cuit: p.cuit,
    tel: p.tel,
    saldo: cc.saldo,
    movimientos: cc.movimientos.map((m) => ({ cuando: cuando(m), concepto: m.concepto, debe: m.debe, haber: m.haber, saldo: m.saldo })),
    remitos,
  };
  return { ...vista, firma: JSON.stringify(vista) };
}

// ───────────── el remito (borrador en la pantalla hasta que se registra) ─────────────

export interface LineaBorrador {
  productoId: string;
  /** Lo tipeado (se lee al registrar). */
  cant: string;
  costo: string;
}

export interface BorradorRemito {
  proveedorId: string;
  numero: string;
  lineas: LineaBorrador[];
}

export function remitoVacio(estado: EstadoClub): BorradorRemito {
  return { proveedorId: proveedoresDe(estado).find((p) => p.activo !== false)?.id ?? "", numero: "", lineas: [] };
}

/** Si un producto no puede entrar por remito, por qué (en criollo); null si puede. */
function noEntraPorRemito(p: Producto): string | null {
  if (p.plato) return `${p.nombre} es un plato: no lleva stock, no entra por remito.`;
  if (p.stock == null) return `${p.nombre} todavía no tiene el stock contado: primero se cuenta (Stock → Editar → «Stock actual», lo hace un dueño) y después entra por remito.`;
  return null;
}

export type SumaAlRemito = { ok: true; borrador: BorradorRemito; mensaje: string } | { ok: false; mensaje: string };

/** Suma 1 del producto (si ya está, le suma a esa línea; si no, entra con su costo de hoy). */
export function sumarAlRemito(estado: EstadoClub, b: BorradorRemito, productoId: string): SumaAlRemito {
  const p = productoDe(estado, productoId);
  if (!p || p.activo === false) return { ok: false, mensaje: "No encuentro el producto." };
  const motivo = noEntraPorRemito(p);
  if (motivo) return { ok: false, mensaje: motivo };
  const ya = b.lineas.find((l) => l.productoId === productoId);
  const lineas = ya
    ? b.lineas.map((l) => (l === ya ? { ...l, cant: String((Number(leerCantidad(l.cant)) || 0) + 1) } : l))
    : [...b.lineas, { productoId, cant: "1", costo: String(p.costo ?? 0) }];
  return { ok: true, borrador: { ...b, lineas }, mensaje: `+1 ${p.nombre}` };
}

/** Lo que manda el lector (código de barras o etiqueta, como un teclado con Enter): suma 1. */
export function leerParaElRemito(estado: EstadoClub, b: BorradorRemito, codigo: string): SumaAlRemito {
  const r = productoPorCodigo(estado, codigo);
  return r.ok ? sumarAlRemito(estado, b, r.producto.id) : { ok: false, mensaje: r.motivo };
}

export function quitarDelRemito(b: BorradorRemito, productoId: string): BorradorRemito {
  return { ...b, lineas: b.lineas.filter((l) => l.productoId !== productoId) };
}

export function cambiarLinea(b: BorradorRemito, productoId: string, campo: "cant" | "costo", valor: string): BorradorRemito {
  return { ...b, lineas: b.lineas.map((l) => (l.productoId === productoId ? { ...l, [campo]: valor } : l)) };
}

export interface VistaRemito {
  proveedores: { id: string; nombre: string }[];
  lineas: { productoId: string; nombre: string; cant: string; costo: string; subtotal: number | null }[];
  /** La suma de lo que se puede leer (lo mal tipeado no suma). */
  total: number;
  firma: string;
}

export function armarRemito(estado: EstadoClub, b: BorradorRemito): VistaRemito {
  const lineas = b.lineas.map((l) => {
    const cant = leerCantidad(l.cant);
    const costo = l.costo.trim() === "" ? Number.NaN : leerMonto(l.costo);
    const subtotal = cant != null && cant > 0 && costo >= 0 ? cant * costo : null;
    return { productoId: l.productoId, nombre: productoDe(estado, l.productoId)?.nombre ?? "(producto que ya no está)", cant: l.cant, costo: l.costo, subtotal };
  });
  const vista = {
    proveedores: proveedoresDe(estado)
      .filter((p) => p.activo !== false)
      .map((p) => ({ id: p.id, nombre: p.nombre })),
    lineas,
    total: lineas.reduce((s, l) => s + (l.subtotal ?? 0), 0),
  };
  return { ...vista, firma: JSON.stringify(vista) };
}

/** Lo que aparece al buscar para el remito (hasta 8; los platos no, porque no llevan stock). */
export function candidatosParaRemito(estado: EstadoClub, texto: string): { id: string; nombre: string; detalle: string }[] {
  if (!texto.trim()) return [];
  return buscarProductos(estado, texto)
    .filter((p) => !p.plato)
    .slice(0, 8)
    .map((p) => ({ id: p.id, nombre: p.nombre, detalle: p.stock == null ? "sin contar" : `hay ${p.stock} · costo ${pesos(p.costo ?? 0)}` }));
}

// ───────────── lo que se toca ─────────────

export type AccionProveedores =
  | { tipo: "alta"; nombre: string; rubro: string; cuit: string; tel: string }
  | { tipo: "editar"; proveedorId: string; nombre: string; rubro: string; cuit: string; tel: string }
  | { tipo: "remito"; borrador: BorradorRemito }
  /** Con el PIN TIPEADO de quien opera (`auth.usuarioId`), no el que el puesto tenga guardado. */
  | { tipo: "pagar"; proveedorId: string; medio: MedioProveedor; monto: string; pin: string };

export interface DesenlaceProveedores extends Desenlace {
  /** El proveedor nuevo (la pantalla abre su ficha). */
  proveedorId?: string;
}

const falla = (r: { motivo: string }): DesenlaceProveedores => ({ ok: false, mensaje: r.motivo });
const no = (mensaje: string): DesenlaceProveedores => ({ ok: false, mensaje });

export function ejecutarProveedores(estado: EstadoClub, accion: AccionProveedores, ahora: Ahora, auth: Auth): DesenlaceProveedores {
  switch (accion.tipo) {
    case "alta": {
      const r = altaProveedor(estado, { nombre: accion.nombre, rubro: accion.rubro, cuit: accion.cuit, tel: accion.tel }, auth, ahora);
      return r.ok ? { ok: true, mensaje: `Listo: ${r.proveedor.nombre} ya es proveedor del club.`, proveedorId: r.proveedor.id } : falla(r);
    }
    case "editar": {
      const nombre = accion.nombre.trim();
      // El motor deja el nombre vacío ANTES de decir que no (editarProveedor): se frena acá.
      if (!nombre) return no("El nombre no puede quedar vacío.");
      // El alta no deja repetir nombre; la edición tampoco (el motor sólo lo mira en el alta).
      if (nombre && proveedoresDe(estado).some((p) => p.id !== accion.proveedorId && p.activo !== false && p.nombre.toLowerCase() === nombre.toLowerCase()))
        return no("Ya hay otro proveedor con ese nombre.");
      const r = editarProveedor(estado, accion.proveedorId, { nombre, rubro: accion.rubro, cuit: accion.cuit, tel: accion.tel }, auth, ahora);
      return r.ok ? { ok: true, mensaje: `Datos de ${nombre} guardados.` } : falla(r);
    }
    case "remito": {
      const b = accion.borrador;
      const items: { productoId: string; cant: number; costo: number }[] = [];
      // Todo se revisa antes de llamar al motor, con el nombre del producto en el mensaje.
      for (const l of b.lineas) {
        const p = productoDe(estado, l.productoId);
        if (!p) return no("Hay un producto que ya no existe: sacalo del remito.");
        const motivo = noEntraPorRemito(p);
        if (motivo) return no(motivo);
        const cant = leerCantidad(l.cant);
        if (cant == null || Number.isNaN(cant) || cant < 1) return no(`Revisá la cantidad de ${p.nombre}: tiene que ser 1 o más.`);
        const costo = l.costo.trim() === "" ? Number.NaN : leerMonto(l.costo);
        if (Number.isNaN(costo) || costo < 0) return no(`Poné el costo de ${p.nombre} (lo que sale cada uno, 0 o más).`);
        items.push({ productoId: p.id, cant, costo });
      }
      const r = registrarRemito(estado, { proveedorId: b.proveedorId, numero: b.numero, items }, auth, ahora);
      if (!r.ok) return falla(r);
      const pv = proveedorDe(estado, b.proveedorId)?.nombre ?? "el proveedor";
      return { ok: true, mensaje: `Remito ${r.remito.numero} de ${pv} cargado: ${pesos(r.remito.total)}. Ya suma al stock.` };
    }
    case "pagar": {
      const pin = accion.pin.trim();
      if (!pin) return no("Poné tu PIN: el pago queda a tu nombre.");
      if (accion.monto.trim() === "") return no("Poné cuánto le pagás.");
      const monto = leerMonto(accion.monto);
      const r = pagarProveedor(estado, { proveedorId: accion.proveedorId, medio: accion.medio, monto }, { usuarioId: auth.usuarioId, pin }, ahora);
      if (!r.ok) return falla(r);
      const pv = proveedorDe(estado, accion.proveedorId)?.nombre ?? "el proveedor";
      const como = accion.medio === "efectivo" ? "en efectivo: sale del cajón y queda en la caja del día" : "por transferencia";
      return { ok: true, mensaje: `Pago de ${pesos(monto)} a ${pv} ${como}. Le debemos ${pesos(r.saldo)}.` };
    }
  }
}
