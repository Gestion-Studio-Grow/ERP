// ============================================================================
// ENVÍOS · LA TARIFA — cuánto cuesta el envío, cuánto falta para que sea gratis, el mínimo.
// LÓGICA PURA (sin base ni red), la MISMA en la tienda, en el mostrador y en el servidor.
// ============================================================================
//
// Los importes entran y salen en PESOS (como `Order.total` y el resto del sistema), pero la
// cuenta se hace en CENTAVOS ENTEROS (`centavosDe`): comparar 59.999,99 contra 60.000 o restar
// umbrales nunca arrastra el error del punto flotante. El servidor vuelve a calcular con estas
// mismas funciones: nunca confía en el costo que mandó la pantalla.
//
// `configComoShipping` es el puente a la tarifa de siempre (`storefront-shipping.ts`), que sigue
// intacta para los negocios con la tarifa en su copy (Shine: $3.500, gratis desde $25.000).

import { centavosDe } from "@/lib/dinero/redondeo";
import type { ShippingConfig } from "@/lib/storefront-shipping";
import { MENSAJE_PAUSA_POR_DEFECTO, type ConfigEnvios, type ZonaDeEnvio } from "./modelo";

const pesos = (centavos: number) => centavos / 100;
const fmt = (n: number) => `$${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;

/**
 * Costo del envío a una zona para un subtotal (sin el envío, después de descuentos de producto).
 * - Sin zona (retiro en el local, o el negocio no tiene zonas) → 0.
 * - Bolsa vacía (subtotal ≤ 0) → 0: no se cobra envío de la nada.
 * - Subtotal ≥ «gratis desde» de la zona → 0.
 * - Si no, el costo de la zona.
 */
export function costoDeEnvio(subtotal: number, zona: ZonaDeEnvio | null): number {
  if (!zona) return 0;
  const sub = centavosDe(subtotal);
  if (!(sub > 0)) return 0;
  if (zona.gratisDesde !== null && sub >= centavosDe(zona.gratisDesde)) return 0;
  return pesos(Math.max(0, centavosDe(zona.costo)));
}

/**
 * Cuánto falta para el envío gratis a esa zona («te faltan $15.000 para el envío gratis»).
 * 0 si ya califica, si la zona no tiene «gratis desde», si no hay zona o si la bolsa está vacía.
 */
export function faltaParaGratis(subtotal: number, zona: ZonaDeEnvio | null): number {
  if (!zona || zona.gratisDesde === null) return 0;
  const sub = centavosDe(subtotal);
  if (!(sub > 0)) return 0;
  return pesos(Math.max(0, centavosDe(zona.gratisDesde) - sub));
}

/** Cuánto falta para el pedido mínimo con envío. 0 si no hay mínimo o ya se alcanzó. */
export function faltaParaElMinimo(subtotal: number, config: Pick<ConfigEnvios, "pedidoMinimoEnvio">): number {
  if (config.pedidoMinimoEnvio === null) return 0;
  return pesos(Math.max(0, centavosDe(config.pedidoMinimoEnvio) - Math.max(0, centavosDe(subtotal))));
}

/** El nombre del renglón del envío en el pedido: «Envío · Canning – barrios cerrados». */
export function renglonDeEnvio(zona: Pick<ZonaDeEnvio, "nombre">): string {
  return `Envío · ${zona.nombre}`;
}

/** La zona por id, o null. */
export function zonaPorId(config: Pick<ConfigEnvios, "zonas">, zonaId: string | null | undefined): ZonaDeEnvio | null {
  if (!zonaId) return null;
  return config.zonas.find((z) => z.id === zonaId) ?? null;
}

/**
 * Puente a la tarifa de siempre (`shippingCost`, `amountToFreeShipping`): la zona elegida como
 * `ShippingConfig`. null si no hay zona (o el id no existe): el llamador cae a lo de hoy.
 * Una zona sin «gratis desde» se traduce a `freeThreshold: Infinity` (nunca es gratis): para el
 * aviso de «te faltan $X» usá `faltaParaGratis`, que en ese caso da 0.
 */
export function configComoShipping(c: ConfigEnvios, zonaId: string | null): ShippingConfig | null {
  const zona = zonaPorId(c, zonaId);
  if (!zona) return null;
  return { flatRate: zona.costo, freeThreshold: zona.gratisDesde ?? Number.POSITIVE_INFINITY };
}

/** El mensaje para la clienta si la tienda está pausada; null si toma pedidos. */
export function motivoTiendaPausada(c: Pick<ConfigEnvios, "tiendaPausada">): string | null {
  if (!c.tiendaPausada) return null;
  return c.tiendaPausada.mensaje.trim() || MENSAJE_PAUSA_POR_DEFECTO;
}

/** ¿El negocio tiene zonas propias? Si no, la tienda sigue con la tarifa de su copy (lo de hoy). */
export function tieneZonas(c: Pick<ConfigEnvios, "zonas">): boolean {
  return c.zonas.length > 0;
}

export type ModoDeEntrega = "retiro" | "envio";

export type Cotizacion =
  | {
      ok: true;
      modo: ModoDeEntrega;
      /** Costo del envío (0 en retiro o si es gratis). */
      costo: number;
      zona: ZonaDeEnvio | null;
      /** Para el aviso «te faltan $X para el envío gratis»; 0 si no aplica. */
      faltaParaGratis: number;
      /** Nombre del renglón del envío, o null si no hay renglón (retiro, o sin zonas propias). */
      renglon: string | null;
    }
  | {
      ok: false;
      motivo: string;
      /** Para el aviso del mínimo; 0 si el rechazo es por otra cosa. */
      faltaParaMinimo: number;
      /** Si se le puede ofrecer «Retiro en el local» en su lugar. */
      ofrecerRetiro: boolean;
    };

/**
 * La cotización completa de la entrega, con las reglas del negocio: tienda pausada, retiro
 * habilitado, zona existente, pedido mínimo, gratis desde. La usan la tienda (vista previa y
 * `placeOnlineOrder`) y el mostrador, con el mismo resultado.
 *
 * Sin zonas propias y con «envío», responde costo 0 y `renglon: null`: el llamador sigue con
 * lo de hoy (la tarifa del copy, `shippingCost`).
 */
export function cotizarEnvio(
  config: ConfigEnvios,
  pedido: { subtotal: number; modo: ModoDeEntrega; zonaId?: string | null },
): Cotizacion {
  const pausa = motivoTiendaPausada(config);
  if (pausa) return { ok: false, motivo: pausa, faltaParaMinimo: 0, ofrecerRetiro: false };

  if (pedido.modo === "retiro") {
    if (!config.retiroEnLocal) {
      return { ok: false, motivo: "No tenemos retiro en el local: elegí envío a domicilio.", faltaParaMinimo: 0, ofrecerRetiro: false };
    }
    return { ok: true, modo: "retiro", costo: 0, zona: null, faltaParaGratis: 0, renglon: null };
  }

  if (!tieneZonas(config)) {
    return { ok: true, modo: "envio", costo: 0, zona: null, faltaParaGratis: 0, renglon: null };
  }
  const zona = zonaPorId(config, pedido.zonaId);
  if (!zona) {
    return { ok: false, motivo: "Elegí a qué zona va el envío.", faltaParaMinimo: 0, ofrecerRetiro: config.retiroEnLocal };
  }
  const falta = faltaParaElMinimo(pedido.subtotal, config);
  if (falta > 0) {
    const retiro = config.retiroEnLocal ? " Si querés, lo retirás en el local sin mínimo." : "";
    return {
      ok: false,
      motivo: `El envío es para pedidos desde ${fmt(config.pedidoMinimoEnvio!)}: te faltan ${fmt(falta)}.${retiro}`,
      faltaParaMinimo: falta,
      ofrecerRetiro: config.retiroEnLocal,
    };
  }
  return {
    ok: true,
    modo: "envio",
    costo: costoDeEnvio(pedido.subtotal, zona),
    zona,
    faltaParaGratis: faltaParaGratis(pedido.subtotal, zona),
    renglon: renglonDeEnvio(zona),
  };
}

/**
 * La cotización del envío en el MOSTRADOR (Vender, pedido con envío; `createOrder` en el servidor
 * y la vista previa de la pantalla, con el mismo resultado). Las MISMAS zonas, el mismo costo y el
 * mismo «gratis desde» que la tienda, sin las reglas que son sólo de la tienda:
 *   · la tienda PAUSADA no frena el mostrador: pausar es dejar de tomar pedidos por la web, no
 *     cerrar el local (el que atiende sigue anotando el pedido del cliente que llama);
 *   · el PEDIDO MÍNIMO con envío tampoco: es el freno de la tienda, donde nadie mira; en el
 *     mostrador decide quien atiende (si no conviene, lo anota como retiro);
 *   · la FRANJA tampoco: el mostrador acuerda el horario con el cliente («Horario deseado»).
 * La zona SÍ se exige: con zonas cargadas, un envío sin zona (o con una que ya no existe) no se
 * sabe cuánto cobra. Sin zonas propias: costo 0 y sin renglón (lo de siempre).
 */
export function cotizarEnvioDelMostrador(
  config: ConfigEnvios,
  pedido: { subtotal: number; zonaId: string | null | undefined },
): Cotizacion {
  return cotizarEnvio(
    { ...config, tiendaPausada: null, pedidoMinimoEnvio: null },
    { subtotal: pedido.subtotal, modo: "envio", zonaId: pedido.zonaId },
  );
}
