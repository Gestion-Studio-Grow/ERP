"use client";

// ============================================================================
// LA BOLSA DE LA VIDRIERA NUEVA — estado, cuentas y envío, una sola vez para las cuatro marcas.
// ============================================================================
//
// Hoy MagraFront, ShineFront y Storefront repiten cada uno su bolsa, su clave anti-duplicado, su
// cupón y su cuenta de envío. La vidriera nueva los junta acá, sobre las MISMAS piezas que ya valen:
//   · `usePedidoOnline` y `useCuponDePedido` (../pedido-online.tsx): el envío al servidor, el rechazo
//     con su motivo sin perder la bolsa, el WhatsApp que se registra antes de abrir el chat;
//   · `shippingCost` (storefront-shipping.ts): la misma cuenta del envío que hace el servidor;
//   · `nuevaClaveDePedido` (../reglas-tienda.ts): la clave que el servidor acepta.
// No hay lógica de plata nueva: el total que manda es el del servidor.
//
// Lo que se suma: la bolsa se guarda en el navegador (por negocio) para que volver de WhatsApp o
// recargar no la vacíe. Al leerla no se le cree nada (`bolsaGuardada`).

import { useEffect, useMemo, useRef, useState } from "react";
import { shippingCost, amountToFreeShipping, type ShippingConfig } from "@/lib/storefront-shipping";
import { usePedidoOnline, useCuponDePedido } from "../pedido-online";
import { nuevaClaveDePedido } from "../reglas-tienda";
import { bolsaGuardada, fijar, lineas, mover, precioDe, resumen, textoCantidad, type Bolsa, type ProductoVidriera } from "./catalogo-core";
import { aplicarPromociones, type Promocion } from "@/lib/supermercado/promociones";
import { sumarAlCentavo } from "@/lib/dinero/redondeo";

/** Dónde se guarda la bolsa de cada negocio en el navegador. */
export const CLAVE_BOLSA = (tenantKey: string) => `gsg:bolsa:${tenantKey}`;
/** La bolsa que esta pestaña acaba de mandar por «Enviar pedido» (la lee OlvidarBolsa). */
export const CLAVE_ENVIO = (tenantKey: string) => `gsg:bolsa-enviada:${tenantKey}`;

export function useVidriera(opts: {
  tenantKey: string;
  productos: readonly ProductoVidriera[];
  envio: ShippingConfig | null;
  entregaPorDefecto: "PICKUP" | "DELIVERY";
  hayWhatsApp: boolean;
  /**
   * Las ofertas del negocio (si tiene el módulo) y la sección de cada producto: con ellas la bolsa
   * muestra cuánto se ahorra. Es la vista previa: el alta vuelve a aplicarlas en el servidor, con
   * el mismo motor (supermercado/promociones.ts), y ese es el total que vale.
   */
  promos?: { vigentes: readonly Promocion[]; hoy: string; diaSemana: number; seccionDe: Readonly<Record<string, string>> } | null;
}) {
  const { tenantKey, productos, envio, hayWhatsApp } = opts;
  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  const [bolsa, setBolsa] = useState<Bolsa>({});
  const [fulfillment, setFulfillment] = useState<"PICKUP" | "DELIVERY">(opts.entregaPorDefecto);
  // La clave sólo viaja con la bolsa llena (el formulario se dibuja con productos), así que nunca
  // sale en el HTML del servidor: generarla distinta en los dos lados no rompe la hidratación.
  const [clave, setClave] = useState(nuevaClaveDePedido);
  // Lo que se anuncia al lector de pantalla después de tocar «+» o «−» (aria-live).
  const [aviso, setAviso] = useState("");
  const leida = useRef(false);

  // Recuperar la bolsa guardada, una vez, después de hidratar (el HTML del servidor va vacío).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CLAVE_BOLSA(tenantKey));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- la bolsa guardada sólo existe en el navegador: se lee después de hidratar
      if (raw) setBolsa(bolsaGuardada(JSON.parse(raw), productos));
    } catch {
      // Sin almacenamiento (modo privado, cuota llena) la bolsa arranca vacía: no es un error.
    }
    leida.current = true;
  }, [tenantKey, productos]);

  useEffect(() => {
    if (!leida.current) return;
    try {
      const k = CLAVE_BOLSA(tenantKey);
      if (Object.keys(bolsa).length === 0) window.localStorage.removeItem(k);
      else window.localStorage.setItem(k, JSON.stringify(bolsa));
    } catch {
      /* ídem: sin almacenamiento no se guarda, y nada más */
    }
  }, [bolsa, tenantKey]);

  const ls = lineas(bolsa, porId);
  const { subtotal: bruto, piezas } = resumen(ls);
  // Las ofertas descuentan en el renglón; el envío y el cupón se cuentan sobre lo que queda, como
  // en el alta (order-core.ts `decidirAlta`).
  const promos = opts.promos;
  const conPromos =
    promos && promos.vigentes.length > 0 && ls.length > 0
      ? aplicarPromociones(
          ls.map((l, i) => ({
            clave: String(i),
            productId: l.p.id,
            seccion: promos.seccionDe[l.p.id] ?? "",
            saleUnit: l.p.saleUnit,
            cantidad: l.q,
            precioUnitario: precioDe(l.p),
            importe: l.importe,
          })),
          promos.vigentes,
          { fecha: promos.hoy, diaSemana: promos.diaSemana, medio: null },
        )
      : null;
  const ahorro = conPromos?.totalDescuento ?? 0;
  const ofertasAplicadas = conPromos?.aplicadas.map((a) => ({ nombre: a.nombre, descuento: a.descuento })) ?? [];
  const subtotal = ahorro > 0 ? sumarAlCentavo([bruto, -ahorro]) : bruto;
  const costoEnvio = shippingCost(subtotal, fulfillment, envio);
  const faltaParaSinCargo = fulfillment === "DELIVERY" ? amountToFreeShipping(subtotal, envio) : 0;
  const cupon = useCuponDePedido(subtotal);
  const total = subtotal - cupon.descuento + costoEnvio;
  const hayPeso = ls.some((l) => l.p.saleUnit === "WEIGHT");

  const pedido = usePedidoOnline({
    hayWhatsApp,
    alRegistrar: () => {
      setBolsa({});
      setClave(nuevaClaveDePedido());
      cupon.limpiar();
    },
  });

  function cambiar(p: ProductoVidriera, siguiente: Bolsa) {
    if (siguiente === bolsa) return;
    pedido.olvidarAviso(p.id);
    // Otra bolsa es otro pedido: con la clave vieja el servidor devolvería el pedido anterior.
    setClave(nuevaClaveDePedido());
    setBolsa(siguiente);
    const q = siguiente[p.id] ?? 0;
    setAviso(q > 0 ? `${p.name}: ${textoCantidad(p, q)} en tu pedido.` : `Sacaste ${p.name} de tu pedido.`);
  }

  return {
    bolsa,
    lineas: ls,
    subtotal,
    /** Lo que descuentan las ofertas (vista previa) y cuáles. */
    ahorro,
    ofertasAplicadas,
    piezas,
    total,
    hayPeso,
    costoEnvio,
    faltaParaSinCargo,
    fulfillment,
    setFulfillment,
    clave,
    cupon,
    pedido,
    aviso,
    cantidadDe: (id: string) => bolsa[id] ?? 0,
    mover: (p: ProductoVidriera, dir: 1 | -1) => cambiar(p, mover(bolsa, p, dir)),
    fijar: (p: ProductoVidriera, q: number) => cambiar(p, fijar(bolsa, p.id, q)),
    /**
     * Antes de mandar por «Enviar pedido»: se anota qué bolsa sale, para que la página de seguimiento
     * la olvide (el alta redirige desde el servidor y acá no vuelve nada). Por WhatsApp no hace falta:
     * vuelve la respuesta y `alRegistrar` vacía la bolsa.
     */
    marcarEnvio: (via: string | null) => {
      if (via !== "tienda") return;
      try {
        window.sessionStorage.setItem(CLAVE_ENVIO(tenantKey), JSON.stringify(bolsa));
      } catch {
        /* sin almacenamiento, no hay bolsa guardada que olvidar */
      }
    },
  };
}

export type EstadoVidriera = ReturnType<typeof useVidriera>;
