"use client";

// «Autorizar anulación» en una venta o un pedido con plata (`autorizarAnulacionVenta`).

import { autorizarAnulacionVenta } from "@/lib/order-actions";
import CodigoDeAutorizacion from "../_anulacion/CodigoDeAutorizacion";
import { aFormData } from "./formularios-del-pedido";

export default function AutorizarAnulacionVenta({ orderId }: { orderId: string }) {
  return <CodigoDeAutorizacion vale="esta venta" pedir={() => autorizarAnulacionVenta(aFormData([["orderId", orderId]]))} />;
}
