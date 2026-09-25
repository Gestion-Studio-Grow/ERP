// ============================================================================
// PEDIDOS — lo que el tablero nuevo necesita, armado en el servidor.
// ============================================================================
//
// `armarTablero` traduce los pedidos que la página YA leyó (getPosData, los links de pago, los
// cupones, los datos del local) a lo que viaja al tablero: fechas ya escritas en la zona del
// negocio, el verbo del paso que sigue con `verboDelPaso` (la regla de siempre), el aviso de
// WhatsApp armado con `avisoPedidoListo`. No lee la base ni decide nada nuevo.
//
// `leerAvisados` es la ÚNICA lectura que suma el diseño nuevo: cuándo se abrió el aviso de
// «tu pedido está listo» de cada pedido Listo (la constancia que ya escribe
// `registrarAvisoWhatsApp` en la auditoría). Sirve para que la tecla pase de «Avisar» a
// «Entregar» y la fila diga «Listo · avisado 10:12». Sólo de los pedidos Listos, filtrada por
// negocio, y sólo con el diseño nuevo prendido.

import "server-only";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { BUSINESS_TIMEZONE } from "@/lib/business-config";
import { dateStrInBusinessTz, fmtTime } from "@/lib/datetime";
import { avisoPedidoListo, etiquetaDeHorario, verboDelPaso, ESTADOS_EN_CURSO } from "@/lib/order-anulacion";
import { esLineaDeEnvio, type CuponDelPedido } from "@/lib/venta-reglas";
import { waLinkClienta } from "@/lib/whatsapp-cta";
import { etiquetaDeMedio } from "@/lib/caja/medio-cobro";
import type { AlcanceDeAnulacion } from "@/lib/capabilities";
import { textoDelLinkDePago, type LinkEnviado } from "./link-de-pago";
import { cuandoDelPedido, type PedidoCerrado, type PedidoDelTablero } from "./pedidos-core";

/** Lo que el cajón del pedido necesita además de la fila (las acciones de «Más»). */
export type ExtraDelPedido = {
  /** «Pesar y ajustar»: sólo comercio, sin cobrar y en curso (la regla de la bandeja de siempre). */
  ajustar: {
    subtotal: number;
    descuento: number;
    cupon: CuponDelPedido | null;
    items: { productId: string | null; name: string; saleUnit: "UNIT" | "WEIGHT"; quantity: number; unitPrice: number; lineTotal: number }[];
  } | null;
  /** Link de pago de Mercado Pago: null = no se ofrece (sin módulo, o ya cobrado). */
  link: { enviado: LinkEnviado | null; whatsappEnviado: string | null } | null;
  /** El chat del cliente, sin mensaje armado («Escribirle»). */
  whatsapp: string | null;
};

type Linea = {
  productId: string | null;
  name: string;
  saleUnit: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

type OrdenAbierta = {
  id: string;
  code: number;
  createdAt: Date;
  channel: string;
  customerName: string;
  customerPhone: string | null;
  fulfillment: string;
  scheduledFor: Date | null;
  address: string | null;
  notes: string | null;
  status: string;
  paid: boolean;
  paymentMethod: string | null;
  total: number;
  subtotal: number;
  discount: number;
  items: Linea[];
};

type OrdenCerrada = {
  id: string;
  code: number;
  status: string;
  customerName: string;
  total: number;
  createdAt: Date;
  paid: boolean;
  paymentMethod: string | null;
};

const EN_CURSO: ReadonlySet<string> = new Set(ESTADOS_EN_CURSO);

const DIA_CORTO = new Intl.DateTimeFormat("es-AR", { timeZone: BUSINESS_TIMEZONE, weekday: "short", day: "2-digit", month: "2-digit" });

/** "lun 21/09", armado por partes (el separador de cada ICU varía). */
function diaCorto(d: Date): string {
  const p = Object.fromEntries(DIA_CORTO.formatToParts(d).map((x) => [x.type, x.value]));
  return `${String(p.weekday ?? "").replace(".", "")} ${p.day}/${p.month}`;
}

function diaAnterior(dia: string): string {
  const [y, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

function cuando(d: Date, hoy: string): string {
  return cuandoDelPedido(dateStrInBusinessTz(d), fmtTime(d), hoy, diaAnterior(hoy), diaCorto(d));
}

/**
 * El verbo de la tecla: el de `verboDelPaso`, salvo que en un comercio el pedido del mostrador
 * (que nace Confirmado) dice «Preparar» como el de la tienda: los dos van al MISMO paso
 * (En preparación, `siguienteEstado`) y «Pasar a preparación» no entra en la fila del celular. Es
 * sólo la palabra: el paso lo sigue decidiendo el servidor.
 */
export function verboEnPantalla(status: string, comercio: boolean): string | null {
  const v = verboDelPaso(status, { comercio });
  return comercio && v === "Pasar a preparación" ? "Preparar" : v;
}

/** Cuándo se abrió el aviso de «listo» de cada pedido (el último). Ver el encabezado. */
export async function leerAvisados(ids: readonly string[]): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  if (ids.length === 0) return out;
  const tenantId = await getCurrentTenantId();
  const filas = await prisma.auditLog.findMany({
    where: { tenantId, entity: "Order", action: "whatsapp", entityId: { in: [...ids] } },
    orderBy: { createdAt: "asc" },
    select: { entityId: true, createdAt: true, changes: true },
  });
  for (const f of filas) {
    const tipo = (f.changes as { tipo?: unknown } | null)?.tipo;
    if (f.entityId && tipo === "pedido-listo") out.set(f.entityId, f.createdAt);
  }
  return out;
}

export function armarTablero(e: {
  abiertos: readonly OrdenAbierta[];
  cerrados: readonly OrdenCerrada[];
  comercio: boolean;
  hoy: string;
  local: { negocio: string; direccion: string | null; horario: string | null } | null;
  links: ReadonlyMap<string, LinkEnviado>;
  cupones: ReadonlyMap<string, CuponDelPedido>;
  avisados: ReadonlyMap<string, Date>;
  ofrecerLink: boolean;
  simulacion: boolean;
  alcance: AlcanceDeAnulacion | null;
}): { abiertos: PedidoDelTablero[]; cerrados: PedidoCerrado[]; extras: Record<string, ExtraDelPedido> } {
  const extras: Record<string, ExtraDelPedido> = {};
  const abiertos = e.abiertos.map((o): PedidoDelTablero => {
    const horario = e.comercio && o.scheduledFor ? etiquetaDeHorario(o.scheduledFor, o.fulfillment, e.hoy) : null;
    const avisoWa =
      e.local && o.status === "READY"
        ? waLinkClienta(
            o.customerPhone,
            avisoPedidoListo({
              cliente: o.customerName,
              code: o.code,
              total: o.total,
              pagado: o.paid,
              fulfillment: o.fulfillment,
              direccionEnvio: o.address,
              negocio: e.local.negocio,
              direccionLocal: e.local.direccion,
              horarioLocal: e.local.horario,
            }),
          )
        : null;
    const avisado = e.avisados.get(o.id);
    const enviado = e.links.get(o.id) ?? null;
    extras[o.id] = {
      ajustar:
        e.comercio && !o.paid && EN_CURSO.has(o.status)
          ? {
              subtotal: o.subtotal,
              descuento: o.discount,
              cupon: e.cupones.get(o.id) ?? null,
              items: o.items.map((it) => ({
                productId: it.productId,
                name: it.name,
                saleUnit: it.saleUnit === "WEIGHT" ? "WEIGHT" : "UNIT",
                quantity: it.quantity,
                unitPrice: it.unitPrice,
                lineTotal: it.lineTotal,
              })),
            }
          : null,
      // La misma condición que la bandeja de siempre: sin cobrar o, en prueba, ya cobrado por su link.
      link:
        e.ofrecerLink && (!o.paid || (e.simulacion && enviado))
          ? {
              enviado,
              whatsappEnviado:
                enviado && e.local
                  ? waLinkClienta(o.customerPhone, textoDelLinkDePago({ negocio: e.local.negocio, code: o.code, monto: enviado.monto, url: enviado.url }))
                  : null,
            }
          : null,
      whatsapp: waLinkClienta(o.customerPhone),
    };
    return {
      id: o.id,
      code: o.code,
      cuando: cuando(o.createdAt, e.hoy),
      creado: o.createdAt.toISOString(),
      canal: o.channel === "ONLINE" ? "ONLINE" : "COUNTER",
      cliente: o.customerName,
      telefono: o.customerPhone,
      entrega: o.fulfillment === "DELIVERY" ? "DELIVERY" : "PICKUP",
      horario,
      horarioIso: o.scheduledFor ? o.scheduledFor.toISOString() : null,
      direccion: o.address,
      nota: o.notes,
      status: o.status,
      verbo: verboEnPantalla(o.status, e.comercio),
      cobrado: o.paid,
      medio: o.paid && o.paymentMethod ? etiquetaDeMedio(o.paymentMethod) : o.paid ? "a cuenta" : null,
      total: o.total,
      subtotal: o.subtotal,
      descuento: o.discount,
      lineas: o.items.map((it) => ({
        productId: it.productId,
        nombre: it.name,
        unidad: it.saleUnit === "WEIGHT" ? "WEIGHT" : "UNIT",
        cantidad: it.quantity,
        precio: it.unitPrice,
        total: it.lineTotal,
        marca: e.comercio && it.productId == null ? (esLineaDeEnvio(it) ? "envío" : "precio a mano") : null,
      })),
      avisoWa,
      avisado: avisado ? cuando(avisado, e.hoy) : null,
    };
  });
  const cerrados = e.cerrados.map(
    (o): PedidoCerrado => ({
      id: o.id,
      code: o.code,
      cuando: cuando(o.createdAt, e.hoy),
      cliente: o.customerName,
      status: o.status,
      cobrado: o.paid,
      aCuenta: o.paid && !o.paymentMethod,
      total: o.total,
      // La venta de mostrador cobrada nace entregada y cae acá; recepción anula sólo lo de hoy
      // (el servidor lo vuelve a exigir en `anularVenta`).
      anulable: Boolean(
        e.alcance && o.status === "DELIVERED" && (!e.alcance.soloHoy || dateStrInBusinessTz(new Date(o.createdAt)) === e.hoy),
      ),
    }),
  );
  return { abiertos, cerrados, extras };
}
