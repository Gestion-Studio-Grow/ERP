"use client";

// El ticket de una venta: se ve en pantalla, se comparte por WhatsApp o se imprime en 58 mm.
//
// Lo usan Vender (la venta recién cobrada) y Ventas del día (una venta de la lista). Los
// renglones salen de `renglonesDelTicket` (reglas-venta.ts): lo que se ve, lo que se imprime y
// lo que se manda por WhatsApp dicen exactamente lo mismo.
//
// WhatsApp va 1 a 1 y con el texto armado: al número del cliente si el teléfono es de acá
// (`waLinkClienta`), y si no, WhatsApp abre el selector de contacto. Al tocarlo queda
// constancia en la auditoría del pedido (`registrarAvisoWhatsApp`), sin esperar la respuesta:
// si la constancia falla, el mensaje sale igual.

import { useRef } from "react";
import { registrarAvisoWhatsApp } from "@/lib/order-actions";
import { waLinkClienta } from "@/lib/whatsapp-cta";
import { buttonClasses, cn } from "@/components/ui";
import { htmlDelTicket, renglonesDelTicket, textoDelTicket, type VentaTicket } from "./reglas-venta";

export default function TicketVenta({
  venta,
  negocio,
  pagoCon = null,
  className,
}: {
  venta: VentaTicket;
  negocio: string;
  /** Lo que dio el cliente en efectivo: sólo existe al cobrar (no se guarda). */
  pagoCon?: number | null;
  className?: string;
}) {
  const renglones = renglonesDelTicket(venta, { negocio, pagoCon });
  const texto = textoDelTicket(venta, { negocio, pagoCon });
  const wa = waLinkClienta(venta.telefono, texto) ?? `https://wa.me/?text=${encodeURIComponent(texto)}`;
  const marco = useRef<HTMLIFrameElement | null>(null);

  // Imprime el ticket solo, en un documento de 58 mm dentro de un iframe invisible (el porqué,
  // en `htmlDelTicket`). El iframe se reusa: imprimir dos veces no deja basura en la página.
  function imprimir() {
    let f = marco.current;
    if (!f) {
      f = document.createElement("iframe");
      f.setAttribute("aria-hidden", "true");
      f.tabIndex = -1;
      Object.assign(f.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
      document.body.appendChild(f);
      marco.current = f;
    }
    const iframe = f;
    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    };
    iframe.srcdoc = htmlDelTicket(renglones);
  }

  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-start", className)}>
      {/* Vista previa con la forma del papel: angosta y en monoespaciada. */}
      <div
        className="w-full max-w-[18rem] rounded-md border border-line bg-surface-raised px-3 py-2 font-mono text-[12px] leading-snug text-strong"
        aria-label={`Ticket de la venta #${venta.code}`}
      >
        {renglones.map((r, i) => (
          <div
            key={i}
            className={cn(
              r.importe && "flex justify-between gap-2",
              r.fuerte && "font-bold",
              r.chico && "text-[11px] text-muted",
            )}
          >
            <span className="min-w-0 break-words">{r.texto}</span>
            {r.importe && <span className="shrink-0 tabular-nums">{r.importe}</span>}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            void registrarAvisoWhatsApp(venta.id, "ticket").catch(() => undefined);
          }}
          className={buttonClasses("outline", "md")}
        >
          Mandar por WhatsApp
        </a>
        <button type="button" onClick={imprimir} className={buttonClasses("outline", "md")}>
          Imprimir (58 mm)
        </button>
      </div>
    </div>
  );
}
