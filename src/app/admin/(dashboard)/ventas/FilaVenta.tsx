"use client";

// Una venta de la lista: qué se vendió, cómo se pagó y sus acciones, «Ticket» (verlo,
// mandarlo por WhatsApp o imprimirlo), «Anular…» (con motivo, la misma de la bandeja) y
// «Facturar», con el estado de la factura a la vista.

import { useState } from "react";
import { fmtMoneyARS } from "@/components/ui/format";
import { etiquetaDeMedio } from "@/lib/caja/medio-cobro";
import AnularPedidoForm from "../pedidos/AnularPedidoForm";
import TicketVenta from "../vender/TicketVenta";
import type { VentaTicket } from "../vender/reglas-venta";
import FacturarVenta from "./FacturarVenta";
import type { FacturaDeVenta } from "./factura";

export default function FilaVenta({
  venta,
  hora,
  canal,
  negocio,
  anular,
  notas,
  factura = null,
}: {
  venta: VentaTicket;
  /** "10:15", en la zona del negocio. */
  hora: string;
  canal: "COUNTER" | "ONLINE";
  negocio: string;
  /** Si quien mira puede anular ESTA venta; con el motivo obligatorio o no. */
  anular: { motivoObligatorio: boolean } | null;
  /** Lo que la dueña tiene que ver: quién anuló y por qué, descuento, precio a mano. */
  notas: string[];
  /** El estado de la factura, sólo para quien puede facturar (null = no se muestra nada). */
  factura?: FacturaDeVenta | null;
}) {
  const [conTicket, setConTicket] = useState(false);
  const aMano = venta.lineas.some((l) => l.aMano);
  return (
    <li className="rounded-lg border border-line p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-strong">#{venta.code}</span>
            <span className="text-muted tabular-nums">{hora}</span>
            <span className="text-xs text-faint">
              {canal === "ONLINE" ? "Pedido" : "Mostrador"} · {venta.aCuenta ? "A cuenta" : etiquetaDeMedio(venta.medio)}
            </span>
            {venta.anulada && (
              <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger">Anulada</span>
            )}
            {venta.descuento > 0 && (
              <span className="rounded-full bg-info-soft px-2 py-0.5 text-[11px] font-medium text-info">Descuento</span>
            )}
            {aMano && (
              <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
                Precio a mano
              </span>
            )}
          </p>
          <p className="mt-1 text-xs text-muted">
            {venta.cliente ? `${venta.cliente} · ` : ""}
            {venta.lineas.map((l) => l.nombre).join(", ")}
          </p>
          {notas.map((n, i) => (
            <p key={i} className="mt-0.5 text-xs text-faint">
              {n}
            </p>
          ))}
        </div>
        <p className={`text-base font-semibold tabular-nums ${venta.anulada ? "text-faint line-through" : "text-strong"}`}>
          {fmtMoneyARS(venta.total)}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-start gap-2">
        <button
          type="button"
          aria-expanded={conTicket}
          onClick={() => setConTicket((v) => !v)}
          className="chip-btn text-xs h-11 sm:h-auto"
        >
          {conTicket ? "Ocultar ticket" : "Ticket"}
        </button>
        {factura && <FacturarVenta orderId={venta.id} inicial={factura} />}
        {anular && (
          <AnularPedidoForm
            id={venta.id}
            code={venta.code}
            paid
            aCuenta={venta.aCuenta === true}
            total={venta.total}
            motivoObligatorio={anular.motivoObligatorio}
          />
        )}
      </div>
      {conTicket && <TicketVenta className="mt-3" venta={venta} negocio={negocio} />}
    </li>
  );
}
