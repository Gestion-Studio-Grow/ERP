// ============================================================================
// LINKS DE COBRO — qué se lee de la URL, qué se busca y cómo se dice el estado.
// ============================================================================
//
// No hay una tabla de links: cada link generado deja su constancia en la auditoría
// (cobros-actions.ts): el link LIBRE (`generarCobro`, monto a mano) como entity «PaymentLink», y
// el link de un PEDIDO (`generarLinkDePagoDePedido`) como entity «Order» con la acción
// «link-de-pago». El estado sale sólo de lo que la base sabe, sin inventar:
//   · link de un pedido: «Pagado» si el pedido está cobrado, «Pedido anulado» si se anuló, y si
//     no, «Sin pagar»;
//   · link libre: el aviso de Mercado Pago no dice con qué link se pagó y el sistema no lo ata,
//     así que se dice «Ver en Mercado Pago» (sin seguimiento). Guardar el estado de cada link
//     necesita una tabla nueva (migración, ventana M1).
// «Vencido» no existe: los links se crean sin fecha de vencimiento (plugins/mercadopago/cobros.ts).
//
// PURO y client-safe: lo prueba links-core.test.ts. La consulta vive en links.server.ts.

import { leerImporte } from "@/lib/dinero/leer";
import { redondearAlCentavo } from "@/lib/dinero/redondeo";

export const LINKS_POR_PAGINA = 50;
export const BASE_LINKS = "/admin/facturacion";

export const ESTADOS_LINK = ["pendiente", "pagado", "anulado", "sin-seguimiento"] as const;
export type EstadoLink = (typeof ESTADOS_LINK)[number];

export const ETIQUETA_ESTADO_LINK: Record<EstadoLink, string> = {
  pendiente: "Sin pagar",
  pagado: "Pagado",
  anulado: "Pedido anulado",
  "sin-seguimiento": "Ver en Mercado Pago",
};

export type FiltrosLinks = { q: string; estado: EstadoLink | null; pagina: number };

export type RenglonLink = {
  id: string;
  /** Cuándo se generó (ISO). */
  creado: string;
  tipo: "pedido" | "libre";
  pedidoId: string | null;
  concepto: string;
  referencia: string | null;
  cliente: string | null;
  monto: number | null;
  estado: EstadoLink;
  /** El link guardado (sólo los de pedido lo guardan). */
  url: string | null;
};

export type TotalesLinks = { cantidad: number; porEstado: Record<EstadoLink, { cantidad: number; importe: number }> };
export type PaginaDeLinks = { renglones: RenglonLink[]; totales: TotalesLinks; pagina: number; paginas: number };

type Sp = Readonly<Record<string, string | string[] | undefined>>;
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function esEstadoLink(v: unknown): v is EstadoLink {
  return typeof v === "string" && (ESTADOS_LINK as readonly string[]).includes(v);
}

/** Lo que la lista lee de la URL (pestaña «Cobrar con link»). Lo que no se entiende se ignora. */
export function leerFiltrosLinks(sp: Sp): FiltrosLinks {
  const q = (uno(sp.q) ?? "").trim().slice(0, 80);
  const e = uno(sp.estado);
  const n = Number.parseInt(uno(sp.pagina) ?? "", 10);
  return { q, estado: esEstadoLink(e) ? e : null, pagina: Number.isFinite(n) && n >= 1 ? Math.min(n, 100_000) : 1 };
}

/** La URL de la lista con cambios (cambiar búsqueda o estado vuelve a la página 1). */
export function urlDeLinks(f: FiltrosLinks, cambios: Partial<FiltrosLinks> = {}): string {
  const x = { ...f, ...cambios };
  if (("q" in cambios || "estado" in cambios) && !("pagina" in cambios)) x.pagina = 1;
  const p = new URLSearchParams({ vista: "cobrar-con-link" });
  if (x.q) p.set("q", x.q);
  if (x.estado) p.set("estado", x.estado);
  if (x.pagina > 1) p.set("pagina", String(x.pagina));
  return `${BASE_LINKS}?${p.toString()}`;
}

export type BusquedaDeLinks = { texto: string | null; pedido: number | null; importe: number | null };

/**
 * Qué se busca: el texto en el concepto, la referencia o el nombre del cliente del pedido; si es
 * un número («123» o «#123»), también el pedido con ese número; si se lee como plata
 * («12.500,50»), también los links de ese importe exacto.
 */
export function busquedaDeLinks(q: string): BusquedaDeLinks {
  const t = q.trim();
  if (!t) return { texto: null, pedido: null, importe: null };
  const nro = /^#?\s*(\d{1,9})$/.exec(t);
  const plata = /\d/.test(t) ? leerImporte(t.replace(/^\$\s*/, "")) : null;
  return {
    texto: t,
    pedido: nro ? Number(nro[1]) : null,
    importe: plata && plata.estado === "ok" && plata.valor > 0 ? redondearAlCentavo(plata.valor) : null,
  };
}

export function totalesLinksVacios(): TotalesLinks {
  const porEstado = Object.fromEntries(ESTADOS_LINK.map((e) => [e, { cantidad: 0, importe: 0 }])) as TotalesLinks["porEstado"];
  return { cantidad: 0, porEstado };
}

export function paginasDeLinks(cantidad: number): number {
  return Math.max(1, Math.ceil(cantidad / LINKS_POR_PAGINA));
}

/** Cuántos renglones tiene el filtro: los del estado elegido, o todos. */
export function cantidadDelFiltro(t: TotalesLinks, estado: EstadoLink | null): number {
  return estado ? t.porEstado[estado].cantidad : t.cantidad;
}
