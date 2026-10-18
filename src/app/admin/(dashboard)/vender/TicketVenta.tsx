"use client";

// El ticket de una venta: se ve en pantalla, se comparte por WhatsApp o se imprime en 58 mm.
//
// Con el módulo `terminal` (lo decide el servidor y llega en `terminal`), el ticket sigue el
// perfil de ESTE equipo (src/lib/terminal/perfil-core.ts): el ancho del rollo (58 u 80 mm), y en
// el ticket recién cobrado (`imprimirAlCobrar`) se imprime solo si el equipo tiene «Imprimir solo
// al cobrar» (en una PC preparada como kiosco sale sin la ventanita). En una tablet o un celular
// el botón dice lo que de verdad pasa: el navegador ofrece «Guardar como PDF» (o la impresora que
// tenga configurada); impresión térmica directa desde el celular no se promete. Sin el módulo,
// todo igual que siempre: 58 mm, «Imprimir (58 mm)» y nada sale solo.
//
// Lo usan Vender (la venta recién cobrada), la Caja con lector y Ventas del día. Los
// renglones salen de `renglonesDelTicket` (reglas-venta.ts): lo que se ve, lo que se imprime y
// lo que se manda por WhatsApp dicen exactamente lo mismo.
//
// WhatsApp va 1 a 1 y con el texto armado: al número del cliente si el teléfono es de acá
// (`waLinkClienta`), y si no, WhatsApp abre el selector de contacto. Al tocarlo queda
// constancia en la auditoría del pedido (`registrarAvisoWhatsApp`), sin esperar la respuesta:
// si la constancia falla, el mensaje sale igual.

import { useEffect, useRef } from "react";
import { registrarAvisoWhatsApp } from "@/lib/order-actions";
import { waLinkClienta } from "@/lib/whatsapp-cta";
import { buttonClasses, cn } from "@/components/ui";
import { usePerfilSiHayTerminal, type TerminalDelEquipo } from "@/lib/terminal/usar-perfil";
import { htmlDelTicket, renglonesDelTicket, textoDelTicket, type VentaTicket } from "./reglas-venta";

// UN SOLO iframe de impresión por página, compartido por todos los tickets. Antes había uno por
// ticket montado y nadie lo sacaba al desmontar: en la Caja con lector el ticket cobrado se desmonta
// con el próximo producto, así que con «Imprimir solo al cobrar» quedaba un iframe huérfano por
// venta (50 ventas = 50 iframes con su documento en memoria; docs/producto/PERFORMANCE-TERMINALES.md).
let marcoDeImpresion: HTMLIFrameElement | null = null;

/**
 * Imprime un documento en el iframe invisible de la página (imprimir dos veces, o cien ventas
 * seguidas, no deja basura). El porqué de un documento aparte, en src/lib/impresion/ticket-css-core.ts.
 *
 * El foco VUELVE a donde estaba: `contentWindow.focus()` (lo piden algunos navegadores para imprimir
 * el iframe y no la página) deja el teclado adentro del iframe, y el lector, que "tipea", escribía
 * ahí: la primera lectura después de cada ticket impreso se perdía y el cajero tenía que tocar la
 * pantalla. `print()` vuelve cuando se cerró la ventanita (o enseguida, en el modo kiosco).
 */
function imprimirEnMarco(html: string) {
  let f = marcoDeImpresion;
  if (!f || !f.isConnected) {
    f = document.createElement("iframe");
    f.setAttribute("aria-hidden", "true");
    f.tabIndex = -1;
    Object.assign(f.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
    document.body.appendChild(f);
    marcoDeImpresion = f;
  }
  const iframe = f;
  iframe.onload = () => {
    // Dónde está el foco JUSTO antes de imprimir (la Caja ya lo devolvió a su campo del lector).
    const previo = document.activeElement;
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    if (previo instanceof HTMLElement && previo !== document.body && previo !== iframe && previo.isConnected) {
      previo.focus({ preventScroll: true });
    } else {
      // Nada enfocado (Vender, con el lector fuera de un campo): el foco vuelve a la página.
      iframe.blur();
      window.focus();
    }
  };
  iframe.srcdoc = html;
}

export default function TicketVenta({
  venta,
  negocio,
  pagoCon = null,
  className,
  terminal = null,
  imprimirAlCobrar = false,
}: {
  venta: VentaTicket;
  negocio: string;
  /** Lo que dio el cliente en efectivo: sólo existe al cobrar (no se guarda). */
  pagoCon?: number | null;
  className?: string;
  /** El equipo y la persona, si el negocio tiene el módulo `terminal` (lo decide el servidor). */
  terminal?: TerminalDelEquipo | null;
  /** Es el ticket de la venta recién cobrada: si el perfil lo pide, se imprime solo, una vez. */
  imprimirAlCobrar?: boolean;
}) {
  const perfil = usePerfilSiHayTerminal(terminal);
  const ancho = perfil?.anchoTicket ?? 58;
  const renglones = renglonesDelTicket(venta, { negocio, pagoCon });
  const texto = textoDelTicket(venta, { negocio, pagoCon });
  const wa = waLinkClienta(venta.telefono, texto) ?? `https://wa.me/?text=${encodeURIComponent(texto)}`;
  // La venta que ya salió sola por la impresora: el ticket se imprime solo UNA vez por venta.
  const impresa = useRef<string | null>(null);

  function imprimir() {
    imprimirEnMarco(htmlDelTicket(renglones, { ancho }));
  }

  // «Imprimir solo al cobrar»: sólo el ticket recién cobrado, sólo con el perfil que lo pide y
  // nunca una venta anulada. Con Chrome en modo kiosco sale sin la ventanita; sin el modo kiosco,
  // aparece la ventanita de imprimir (lo dice «Este equipo»).
  const imprimeSolo = imprimirAlCobrar && perfil?.impresionDirecta === true && !venta.anulada;
  useEffect(() => {
    if (!imprimeSolo || impresa.current === venta.id) return;
    impresa.current = venta.id;
    imprimirEnMarco(htmlDelTicket(renglonesDelTicket(venta, { negocio, pagoCon }), { ancho }));
  }, [imprimeSolo, venta, negocio, pagoCon, ancho]);

  // Lo que dice el botón: sin el módulo, lo de siempre. En la PC de caja, imprimir en su rollo;
  // en la tablet o el celular, lo que de verdad ofrece el navegador (PDF o su impresora).
  const etiquetaImprimir = !perfil
    ? "Imprimir (58 mm)"
    : perfil.tipo === "kiosco-pc"
      ? `Imprimir (${ancho} mm)`
      : "Guardar PDF o imprimir";

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
          {etiquetaImprimir}
        </button>
      </div>
    </div>
  );
}
