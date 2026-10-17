// ============================================================================
// LOS PEDIDOS DE LA TIENDA — lo que se ve y lo que se hace. PURO (sin DOM ni React).
// ============================================================================
//
// El jugador encarga desde la tienda del turnero (public/previews/breakpoint/turnero/tienda.mjs) y manda el pedido
// por WhatsApp, con su código T-XXXX. El club lo carga pegando ese mensaje y, cuando lo retiran, lo entrega
// cobrando en el mostrador o lo pasa a la cuenta de cargos de un cliente. Es lo de «Pedidos de la tienda para
// retirar» del club vanilla (app.mjs: `tarjetaPedido` y las acciones `pegarPedido`, `entregarPedido`,
// `pedidoACuenta`, `cancelarPedido`), en una solapa propia.
//
// Las reglas son del motor (`pedidoDesdeWhatsApp`, `entregarPedido`, `cargarPedidoACuenta`, `cancelarPedido`):
//   · encargar no toca stock ni caja: el pedido queda pendiente;
//   · entregar descuenta el stock y entra a la caja, al precio de HOY;
//   · a la cuenta de alguien: descuenta el stock y queda en su cuenta de cargos (lo que debe), NO en la caja;
//   · cancelar: el pedido queda cancelado, sin stock ni plata que mover.
//
// Corre sólo en el navegador (y en los tests): el motor tiene un contador de ids de módulo.

import {
  MEDIOS,
  buscarClientes,
  cancelarPedido,
  cargarPedidoACuenta,
  catalogoTienda,
  cliente as clienteDe,
  crearPedidoTienda,
  entregarPedido,
  hhmm,
  linkWhatsApp,
  mensajeWhatsApp,
  pedidoDesdeWhatsApp,
  pesos,
} from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub, EstadoPedidoTienda, PedidoTienda } from "@/lib/club/motor.mjs";
import type { TipoMarca } from "@/components/ui/Marca";
import type { Desenlace } from "./almacen";
import type { MedioCaja } from "./cuenta-core";

/** Cuántos pedidos ya resueltos se muestran abajo (los últimos). */
export const RESUELTOS_A_LA_VISTA = 10;
/** Cuántas fichas se ofrecen al pasar un pedido a la cuenta de alguien (como el vanilla). */
export const FICHAS_A_LA_VISTA = 8;

export interface VistaPedido {
  id: string;
  codigo: string;
  nombre: string;
  tel: string;
  total: number;
  /** «a las 18:40» o «» si no hay hora. */
  cuando: string;
  lineas: { texto: string; importe: number }[];
  estado: EstadoPedidoTienda;
  marca: { tipo: TipoMarca; texto: string };
  /** Cómo terminó (para los resueltos): «Cobrado en efectivo», «En la cuenta de Sofi Romero», «Cancelado». */
  detalle: string;
  /** El link de WhatsApp «ya está listo para retirar» (al celular del pedido; sin celular, se elige el chat). */
  avisoListo: string;
}

export interface VistaTienda {
  pendientes: VistaPedido[];
  /** Los últimos resueltos, del más nuevo al más viejo. */
  resueltos: VistaPedido[];
  firma: string;
}

const MARCA: Record<EstadoPedidoTienda, { tipo: TipoMarca; texto: string }> = {
  pendiente: { tipo: "pendiente", texto: "Para retirar" },
  entregado: { tipo: "hecho", texto: "Entregado" },
  a_cuenta: { tipo: "medias", texto: "A cuenta" },
  cancelado: { tipo: "anulado", texto: "Cancelado" },
};

const pedidosDe = (estado: EstadoClub) => (estado.pedidos ?? []) as PedidoTienda[];

function vistaDe(estado: EstadoClub, pd: PedidoTienda): VistaPedido {
  const lista = pd.items.map((i) => `${i.cant} × ${i.nombre}`).join(", ");
  const msj = mensajeWhatsApp("pedidoListo", { nombre: pd.nombre.split(" ")[0], codigo: pd.codigo, lista, total: pesos(pd.total) });
  let detalle = "";
  if (pd.estado === "entregado") detalle = pd.cobrado ? `Cobrado ${pesos(pd.cobrado.monto)} en ${MEDIOS[pd.cobrado.medio].toLowerCase()}` : "Entregado";
  else if (pd.estado === "a_cuenta") {
    const cta = pd.cuentaId ? estado.cuentas.find((c) => c.id === pd.cuentaId) : undefined;
    const c = cta?.clienteId ? clienteDe(estado, cta.clienteId) : undefined;
    detalle = `En la cuenta de cargos de ${c?.nombre ?? cta?.titular ?? "un cliente"}`;
  } else if (pd.estado === "cancelado") detalle = "Cancelado: no se movió stock ni plata";
  return {
    id: pd.id,
    codigo: pd.codigo,
    nombre: pd.nombre,
    tel: pd.tel,
    total: pd.total,
    cuando: pd.min != null ? `a las ${hhmm(pd.min)}` : "",
    lineas: pd.items.map((i) => ({ texto: `${i.cant} × ${i.nombre}`, importe: i.cant * i.precioUnit })),
    estado: pd.estado,
    marca: MARCA[pd.estado] ?? MARCA.pendiente,
    detalle,
    avisoListo: linkWhatsApp(pd.tel, msj),
  };
}

/** Los pedidos para retirar (en el orden en que llegaron, como el vanilla) y los últimos resueltos. */
export function armarTienda(estado: EstadoClub): VistaTienda {
  const todos = pedidosDe(estado);
  const pendientes = todos.filter((p) => p.estado === "pendiente").map((p) => vistaDe(estado, p));
  const resueltos = todos
    .filter((p) => p.estado !== "pendiente")
    .slice(-RESUELTOS_A_LA_VISTA)
    .reverse()
    .map((p) => vistaDe(estado, p));
  return { pendientes, resueltos, firma: JSON.stringify([pendientes, resueltos]) };
}

/** Fichas para pasar un pedido a la cuenta de alguien: las que coinciden con lo tipeado (o las primeras), hasta 8. */
export function fichasParaElPedido(estado: EstadoClub, texto: string): { id: string; nombre: string; detalle: string }[] {
  return buscarClientes(estado, texto)
    .slice(0, FICHAS_A_LA_VISTA)
    .map((c) => ({ id: c.id, nombre: c.nombre, detalle: [c.tel, c.deuda > 0 ? `debe ${pesos(c.deuda)}` : null].filter(Boolean).join(" · ") }));
}

export type AccionTienda =
  | { tipo: "pegar"; texto: string }
  | { tipo: "entregar"; pedidoId: string; medio: MedioCaja }
  | { tipo: "aCuenta"; pedidoId: string; clienteId: string }
  | { tipo: "cancelar"; pedidoId: string };

/**
 * Qué se deshace (los `DESHACIBLES` del vanilla, app.mjs:24): entregar y cancelar sí; cargar el pedido pegado y
 * pasarlo a la cuenta, no (no están en la lista; su inversa es cancelarlo o cobrarlo desde el buffet).
 * Ojo: en el vanilla la lista nombra `entregarPedido`, que sólo abre la ventana; el botón que cobra
 * (`confirmarEntrega`) no está, así que en la práctica no se deshacía. Acá se respeta la lista: como cualquier
 * cobro del mostrador, se puede deshacer en los 6 s del aviso.
 */
export const SE_DESHACE_TIENDA = {
  pegar: false,
  entregar: true,
  aCuenta: false,
  cancelar: true,
} as const satisfies Record<AccionTienda["tipo"], boolean>;

export function ejecutarTienda(estado: EstadoClub, a: AccionTienda, ahora: Ahora, auth?: Auth): Desenlace & { pedidoId?: string } {
  const codigoDe = (id: string) => pedidosDe(estado).find((p) => p.id === id)?.codigo ?? "";
  switch (a.tipo) {
    case "pegar": {
      if (!a.texto.trim()) return { ok: false, mensaje: "Pegá el mensaje que mandó el cliente." };
      const res = pedidoDesdeWhatsApp(estado, a.texto, ahora);
      if (!res.ok) return { ok: false, mensaje: res.motivo };
      return { ok: true, pedidoId: res.pedido.id, mensaje: `Pedido ${res.pedido.codigo} de ${res.pedido.nombre} cargado: ${pesos(res.pedido.total)}.` };
    }
    case "entregar": {
      const res = entregarPedido(estado, a.pedidoId, { medio: a.medio, auth: auth ?? null }, ahora);
      return res.ok ? { ok: true, pedidoId: a.pedidoId, mensaje: `Pedido ${codigoDe(a.pedidoId)} entregado y cobrado: ${pesos(res.total)}.` } : { ok: false, mensaje: res.motivo };
    }
    case "aCuenta": {
      const res = cargarPedidoACuenta(estado, a.pedidoId, a.clienteId, ahora);
      if (!res.ok) return { ok: false, mensaje: res.motivo };
      return { ok: true, pedidoId: a.pedidoId, mensaje: `El pedido ${codigoDe(a.pedidoId)} quedó en la cuenta de cargos de ${clienteDe(estado, a.clienteId)?.nombre ?? "su ficha"}.` };
    }
    case "cancelar": {
      const res = cancelarPedido(estado, a.pedidoId, ahora);
      return res.ok ? { ok: true, pedidoId: a.pedidoId, mensaje: `Pedido ${codigoDe(a.pedidoId)} cancelado.` } : { ok: false, mensaje: res.motivo };
    }
  }
}

/**
 * Sólo en la demo: un mensaje como el que manda la tienda (lo arma el motor sobre una COPIA, así no queda nada
 * cargado), para probar «Cargar el pedido» sin tener un celular a mano. null si no hay productos en la tienda.
 */
export function mensajeDeEjemplo(copia: EstadoClub, ahora: Ahora): string | null {
  const productos = catalogoTienda(copia).slice(0, 2);
  if (!productos.length) return null;
  const res = crearPedidoTienda(copia, { items: productos.map((p, i) => ({ productoId: p.id, cant: i === 0 ? 2 : 1 })), nombre: "Sofi Romero", tel: "11 5555 1234" }, ahora);
  return res.ok ? res.mensaje : null;
}
