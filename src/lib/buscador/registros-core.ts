// ============================================================================
// EL BUSCADOR DEL NEGOCIO — la capa REGISTROS de Ctrl/⌘K (R6-F2). Puro, client-safe.
// ============================================================================
//
// Lo que la paleta encuentra además de acciones y apps: clientes (por nombre o teléfono),
// productos (por nombre) y pedidos (por número). Acá vive la parte sin base: leer lo tipeado,
// ordenar lo que trajo el servidor y armar cada renglón con su enlace y su segunda línea.
// La lectura, con sesión, permisos y RLS, está en buscar-en-el-negocio.ts.
//
// SEGURIDAD: `armarRegistros` sólo dibuja un grupo si el permiso de ese grupo vino en `true`,
// aunque le lleguen filas: la action ya no las lee sin permiso, y esto es la segunda llave.
// Los montos (precio, total del pedido) sólo con `verPlata` (reports:read), como el resto del
// panel (DIRECCION §4.4: «sin montos para quien no tiene reports:read»). EXCEPCIÓN: quien cobra
// con Vender y no tiene el Catálogo ve el PRECIO DE VENTA del producto (el mismo que le muestra
// Vender para cobrar), nunca el costo: el costo ni se lee (ProductoLeido no lo tiene).

import { normalizarBusqueda, rangoCoincidencia } from "@/modules/nav-search";
import { fmtMoneyARS } from "@/components/ui/format";

export type GrupoRegistro = "clientes" | "productos" | "pedidos";

export const NOMBRE_REGISTRO: Record<GrupoRegistro, string> = {
  clientes: "Clientes",
  productos: "Productos",
  pedidos: "Pedidos",
};

/** Como mucho tantos por grupo (DIRECCION §4.4). */
export const MAX_POR_REGISTRO = 5;
/** Cuántas filas lee el servidor por grupo antes de ordenar: margen para que el orden elija. */
export const FILAS_A_LEER = 25;
export const LARGO_MINIMO = 2;
export const LARGO_MAXIMO = 60;
/** El correlativo de pedido es un entero de Postgres (`Order.code Int`). */
const TOPE_CODIGO = 2_147_483_647;

export type Busqueda =
  | {
      ok: true;
      /** Lo tipeado, recortado y con los espacios de más colapsados. */
      texto: string;
      /** Sólo si lo tipeado es un número (con #, espacios, puntos o guiones): sus dígitos. */
      digitos: string | null;
      /** Sólo si son dígitos seguidos que entran como número de pedido. */
      codigo: number | null;
    }
  | { ok: false; mensaje: string };

/** Valida la entrada en el borde. Los mensajes hablan de letras, nunca de tipos ni de campos. */
export function leerBusqueda(entrada: unknown): Busqueda {
  if (typeof entrada !== "string") return { ok: false, mensaje: "Escribí qué querés buscar." };
  const texto = entrada.replace(/\s+/g, " ").trim();
  if (texto.length < LARGO_MINIMO) return { ok: false, mensaje: "Escribí al menos 2 letras o números." };
  if (texto.length > LARGO_MAXIMO) return { ok: false, mensaje: "Probá con menos palabras: hasta 60 letras." };
  const esNumero = /^#?\s*\d[\d\s.-]*$/.test(texto);
  const digitos = esNumero ? texto.replace(/\D/g, "") : null;
  // Número de pedido: sólo dígitos seguidos (un «11 5555-2271» es un teléfono, no un pedido).
  const pedido = /^#?\s*\d{1,10}$/.test(texto) && digitos !== null && Number(digitos) <= TOPE_CODIGO;
  const codigo = pedido ? Number(digitos) : null;
  return { ok: true, texto, digitos, codigo };
}

/**
 * Los números de pedido que «empiezan con» `codigo`: el mismo y los rangos 470-479, 4700-4799…
 * Así el prefijo se busca con el índice único (tenantId, code) y sin convertir a texto.
 */
export function rangosDeCodigo(codigo: number, tope = TOPE_CODIGO): { gte: number; lte: number }[] {
  const rangos = [{ gte: codigo, lte: codigo }];
  if (codigo <= 0) return rangos;
  for (let ancho = 10; codigo * ancho <= tope; ancho *= 10) {
    rangos.push({ gte: codigo * ancho, lte: Math.min(codigo * ancho + ancho - 1, tope) });
  }
  return rangos;
}

// ── Lo que lee el servidor ───────────────────────────────────────────────────

export interface ClienteLeido {
  id: string;
  nombre: string;
  telefono: string;
}

export interface ProductoLeido {
  id: string;
  nombre: string;
  activo: boolean;
  porPeso: boolean;
  /** Precio de venta (por kilo si `porPeso`); null si no tiene. */
  precio: number | null;
}

export interface PedidoLeido {
  id: string;
  codigo: number;
  cliente: string;
  /** Lo decide `wherePedidosAbiertos` (order-anulacion.ts), la misma regla del tablero. */
  abierto: boolean;
  anulado: boolean;
  /** Día del pedido en la zona del negocio (AAAA-MM-DD): el filtro de Ventas del día. */
  dia: string;
  total: number;
}

export interface RegistrosLeidos {
  clientes: readonly ClienteLeido[];
  productos: readonly ProductoLeido[];
  pedidos: readonly PedidoLeido[];
}

/** Qué puede abrir quien busca: la MISMA guardia de cada listado (`puedeAbrirApp`). */
export interface PermisosDeBusqueda {
  clientes: boolean;
  /** El Catálogo: la ficha del producto, pausados incluidos. */
  productos: boolean;
  /** Vender (sin Catálogo): sólo lo que se puede cobrar, con nombre y precio de venta. */
  vender: boolean;
  /** Pedidos para preparar (el tablero). */
  pedidos: boolean;
  /** Ventas del día. */
  ventas: boolean;
  /** reports:read: montos, y Ventas del día de otro día. */
  verPlata: boolean;
}

// ── Lo que se dibuja ─────────────────────────────────────────────────────────

/** Un renglón: la misma forma que un `Comando` de la paleta (comandos-core.ts). */
export interface RegistroEncontrado {
  id: string;
  grupo: GrupoRegistro;
  nombre: string;
  segunda?: string;
  href: string;
}

export interface GrupoDeRegistros {
  grupo: GrupoRegistro;
  nombre: string;
  items: RegistroEncontrado[];
}

const porRango = <T>(filas: readonly T[], rango: (f: T) => number | null, desempate: (a: T, b: T) => number): T[] =>
  filas
    .map((f) => ({ f, r: rango(f) }))
    .filter((x): x is { f: T; r: number } => x.r !== null)
    .sort((a, b) => a.r - b.r || desempate(a.f, b.f))
    .map((x) => x.f)
    .slice(0, MAX_POR_REGISTRO);

const alfabetico = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, "es");

function clientes(filas: readonly ClienteLeido[], b: Extract<Busqueda, { ok: true }>): RegistroEncontrado[] {
  const q = normalizarBusqueda(b.texto);
  const rango = (c: ClienteLeido) => {
    const r = rangoCoincidencia({ href: "", label: c.nombre }, q);
    if (r !== null) return r;
    const tel = c.telefono.replace(/\D/g, "");
    // Por el teléfono, después de todos los que coinciden por el nombre.
    return c.telefono.includes(b.texto) || (b.digitos && tel.includes(b.digitos)) ? 4 : null;
  };
  return porRango(filas, rango, alfabetico).map((c) => ({
    id: `cliente-${c.id}`,
    grupo: "clientes",
    nombre: c.nombre,
    segunda: c.telefono.trim() || "Sin teléfono",
    href: `/admin/clientes/${encodeURIComponent(c.id)}`,
  }));
}

const precioDeVenta = (p: ProductoLeido): string =>
  p.precio === null ? "sin precio" : `${fmtMoneyARS(p.precio)}${p.porPeso ? " el kilo" : ""}`;

/**
 * El Catálogo manda si lo tiene (la ficha, con pausados). Si sólo tiene Vender, lo que Vender
 * puede cobrar (activo y con precio, como `cargarVender`) y el enlace va a Vender.
 */
function productos(filas: readonly ProductoLeido[], b: Extract<Busqueda, { ok: true }>, permisos: PermisosDeBusqueda): RegistroEncontrado[] {
  if (!permisos.productos) return productosParaCobrar(filas, b);
  const verPlata = permisos.verPlata;
  const q = normalizarBusqueda(b.texto);
  // Los pausados, después de todos los activos.
  const rango = (p: ProductoLeido) => {
    const r = rangoCoincidencia({ href: "", label: p.nombre }, q);
    return r === null ? null : r + (p.activo ? 0 : 10);
  };
  return porRango(filas, rango, alfabetico).map((p) => {
    const partes = [p.activo ? null : "Pausado", p.porPeso ? "Por kilo" : "Por unidad"];
    if (verPlata) partes.push(precioDeVenta(p));
    return {
      id: `producto-${p.id}`,
      grupo: "productos",
      nombre: p.nombre,
      segunda: partes.filter(Boolean).join(" · "),
      href: `/admin/catalogo?editar=${encodeURIComponent(p.id)}`,
    };
  });
}

function productosParaCobrar(filas: readonly ProductoLeido[], b: Extract<Busqueda, { ok: true }>): RegistroEncontrado[] {
  const q = normalizarBusqueda(b.texto);
  const rango = (p: ProductoLeido) => (p.activo && p.precio !== null ? rangoCoincidencia({ href: "", label: p.nombre }, q) : null);
  return porRango(filas, rango, alfabetico).map((p) => ({
    id: `producto-${p.id}`,
    grupo: "productos",
    nombre: p.nombre,
    segunda: `${p.porPeso ? "Por kilo" : "Por unidad"} · ${precioDeVenta(p)}`,
    href: "/admin/vender",
  }));
}

function pedidos(filas: readonly PedidoLeido[], b: Extract<Busqueda, { ok: true }>, permisos: PermisosDeBusqueda): RegistroEncontrado[] {
  if (b.codigo === null) return [];
  const codigo = b.codigo;
  const destino = (p: PedidoLeido): string | null => {
    if (p.abierto && permisos.pedidos) return `/admin/pedidos?pedido=${encodeURIComponent(p.id)}`;
    // Ventas del día muestra otro día sólo a quien ve plata (ventas/filtros.ts): sin eso, hoy.
    if (!p.abierto && permisos.ventas) return permisos.verPlata ? `/admin/ventas?dia=${p.dia}` : "/admin/ventas";
    if (permisos.pedidos) return "/admin/pedidos";
    return null;
  };
  const conDestino = filas.filter((p) => destino(p) !== null);
  const rango = (p: PedidoLeido) => (p.codigo === codigo ? 0 : 1);
  return porRango(conDestino, rango, (x, y) => y.codigo - x.codigo).map((p) => {
    const estado = p.anulado ? "Anulado" : p.abierto ? "Abierto" : "Entregado";
    const partes = [estado, p.cliente.trim() || null, permisos.verPlata ? fmtMoneyARS(p.total) : null];
    return {
      id: `pedido-${p.id}`,
      grupo: "pedidos",
      nombre: `Pedido #${p.codigo}`,
      segunda: partes.filter(Boolean).join(" · "),
      href: destino(p) as string,
    };
  });
}

/** Ordena y arma los grupos; un grupo sin permiso o sin resultados no se dibuja. */
export function armarRegistros(leidos: RegistrosLeidos, b: Extract<Busqueda, { ok: true }>, permisos: PermisosDeBusqueda): GrupoDeRegistros[] {
  const grupos: GrupoDeRegistros[] = [
    { grupo: "clientes", nombre: NOMBRE_REGISTRO.clientes, items: permisos.clientes ? clientes(leidos.clientes, b) : [] },
    { grupo: "productos", nombre: NOMBRE_REGISTRO.productos, items: permisos.productos || permisos.vender ? productos(leidos.productos, b, permisos) : [] },
    {
      grupo: "pedidos",
      nombre: NOMBRE_REGISTRO.pedidos,
      items: permisos.pedidos || permisos.ventas ? pedidos(leidos.pedidos, b, permisos) : [],
    },
  ];
  return grupos.filter((g) => g.items.length > 0);
}
