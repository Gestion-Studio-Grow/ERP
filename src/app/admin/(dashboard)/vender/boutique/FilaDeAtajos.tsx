"use client";

// LA FILA DE ATAJOS DEL MOSTRADOR BOUTIQUE (Magra · tanda practicidad, V-1).
//
// Antes, arriba del buscador iban la tarjeta «Abrí la caja», el enlace del cuaderno y «Nuevo pedido
// de WhatsApp» con su texto: con la caja cerrada el buscador bajaba a y=674 y ninguna tecla se veía
// al entrar. Ahora el mostrador va primero (buscador y teclas) y esto es UNA fila de chips debajo:
//   · «Abrí la caja» (sólo con la caja cerrada): despliega la misma tarjeta para abrirla acá;
//   · «Cuaderno»: la pantalla para cargar las ventas anotadas sin señal;
//   · «Pedido de WhatsApp»: abre el pedido (su código baja al tocarlo, o antes con el primer toque).
// Llegando con #whatsapp desde la bandeja, el pedido se abre solo, como antes.

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/components/ui/cn";
import type { PedidoDesdeWhatsAppProps } from "../PedidoDesdeWhatsApp";
import { usePrecargaAlPrimerToque } from "./perezosos";
import { PedidoDeWhatsAppDiferido, traerPedidoDeWhatsApp, useLlegoPorWhatsApp } from "./WhatsAppDiferido";

// La tarjeta de la caja (formulario de apertura): su código baja al tocar el chip, no al entrar.
const AbrirCajaEnLinea = dynamic(() => import("../AbrirCajaEnLinea"), {
  loading: () => (
    <p role="status" aria-busy="true" className="min-h-11 text-sm text-muted">
      Abriendo la caja…
    </p>
  ),
});

/** Lo que muestra la tarjeta «Abrí la caja» (getAperturaEnVender). */
export type DatosDeLaCaja = { esperado: number; ultimoCierre: string | null; hoy: string };

const CHIP =
  "inline-flex min-h-11 items-center justify-center gap-1 rounded-full border border-line-strong bg-surface-raised px-4 " +
  "text-sm font-medium text-strong hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus " +
  "aria-expanded:border-accent aria-expanded:bg-accent-soft";

type Abierto = "caja" | "whatsapp" | null;

export default function FilaDeAtajos({
  caja,
  cuaderno,
  whatsapp,
}: {
  /** La caja cerrada (sólo para quien toma pedidos): el chip despliega la tarjeta para abrirla. */
  caja: DatosDeLaCaja | null;
  /** La ruta del cuaderno, si quien vende puede entrar. */
  cuaderno: string | null;
  /** El pedido de WhatsApp, si el negocio lo toma (comercio y orders:manage). */
  whatsapp: Omit<PedidoDesdeWhatsAppProps, "abrirAlMontar" | "onCerrar"> | null;
}) {
  const porHash = useLlegoPorWhatsApp();
  const [abierto, setAbierto] = useState<Abierto>(null);
  // Cada apertura del pedido lo arma de cero (si se cerró, vuelve a abrir con un toque).
  const [vez, setVez] = useState(0);
  usePrecargaAlPrimerToque(traerPedidoDeWhatsApp, whatsapp !== null);
  if (!caja && !cuaderno && !whatsapp) return null;
  const alternar = (a: Exclude<Abierto, null>) => {
    if (a === "whatsapp" && abierto !== "whatsapp") setVez((v) => v + 1);
    setAbierto((x) => (x === a ? null : a));
  };
  const conWhatsApp = whatsapp !== null && (abierto === "whatsapp" || (porHash && vez === 0));

  return (
    <div data-vender="atajos" className="space-y-3">
      <div role="group" aria-label="Atajos del mostrador" className="flex flex-wrap gap-2">
        {caja && (
          <button
            type="button"
            className={cn(CHIP, "border-warning")}
            aria-expanded={abierto === "caja"}
            aria-controls="atajo-caja"
            onClick={() => alternar("caja")}
          >
            Abrí la caja
          </button>
        )}
        {cuaderno && (
          <Link href={cuaderno} className={CHIP}>
            Cuaderno
          </Link>
        )}
        {whatsapp && (
          <button type="button" className={CHIP} aria-expanded={conWhatsApp} aria-controls="whatsapp" onClick={() => alternar("whatsapp")}>
            Pedido de WhatsApp
          </button>
        )}
      </div>
      {caja && abierto === "caja" && (
        <div id="atajo-caja">
          <AbrirCajaEnLinea esperado={caja.esperado} ultimoCierre={caja.ultimoCierre} hoy={caja.hoy} />
        </div>
      )}
      {whatsapp && conWhatsApp && (
        <PedidoDeWhatsAppDiferido key={vez} {...whatsapp} abrirAlMontar={vez > 0} onCerrar={() => setAbierto(null)} />
      )}
    </div>
  );
}
