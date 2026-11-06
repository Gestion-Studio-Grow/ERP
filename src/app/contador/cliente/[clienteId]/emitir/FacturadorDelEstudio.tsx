"use client";

// ============================================================================
// La capa del CONTADOR sobre el facturador común (no una copia): lo que necesita quien emite para
// muchos clientes, todo el día.
//  · Atajos de teclado: Ctrl+Enter emite o pasa a la próxima; Alt+1 abre el comprador y Alt+2 va al monto (los da el motor con
//    `atajosDeTeclado`, que sólo prende esta pantalla).
//  · Emisión en serie: cuenta lo emitido en la sesión y deja la próxima lista con un toque (o Ctrl+Enter).
//  · Emisión por lote: varias a consumidor final de una vez (LoteDelEstudio).
//  · Cambio de receptor: «La misma, a otro comprador» en el resultado.
//  · El salto al lote del mes (las facturas recurrentes de toda la cartera) y a los comprobantes.
// ============================================================================

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import EmitirComprobante from "@/components/facturacion/EmitirComprobante";
import { emitirParaClienteAction } from "@/lib/facturacion/emitir-manual-actions";
import type { EmisionFacturita } from "@/lib/facturita-core";
import { Segmented } from "@/components/ui";
import LoteDelEstudio from "./LoteDelEstudio";

export default function FacturadorDelEstudio({
  clienteId,
  alias,
  condicionEmisor,
  hoy,
  regimenFacturaA,
}: {
  clienteId: string;
  alias: string;
  condicionEmisor: string | null;
  hoy: string;
  regimenFacturaA: "A" | "A_CON_LEYENDA" | "M" | null;
}) {
  const router = useRouter();
  const [emitidas, setEmitidas] = useState(0);
  const [modo, setModo] = useState<"una" | "lote">("una");
  const base = `/contador/cliente/${encodeURIComponent(clienteId)}`;
  const emitir = (datos: EmisionFacturita) => emitirParaClienteAction(clienteId, datos);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,42rem)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-5">
      <Segmented
        name="modo-emision"
        leyenda="Cómo emitís"
        opciones={[
          { valor: "una", etiqueta: "Una factura" },
          { valor: "lote", etiqueta: "Varias de una vez" },
        ]}
        value={modo}
        onChange={(e) => setModo((e.target as unknown as HTMLInputElement).value as "una" | "lote")}
        lleno
      />
      {modo === "lote" ? (
        <LoteDelEstudio
          clienteId={clienteId}
          condicionEmisor={condicionEmisor}
          hoy={hoy}
          alEmitir={(n) => {
            setEmitidas((v) => v + n);
            router.refresh();
          }}
        />
      ) : (
      <EmitirComprobante
        emitir={emitir}
        condicionEmisor={condicionEmisor}
        hoy={hoy}
        ambito={`cliente:${clienteId}`}
        rutas={{ datosFiscales: `/contador/cliente/${encodeURIComponent(clienteId)}/comprobantes`, comprobantes: `${base}/comprobantes` }}
        enlaceDelComprobante={() => `${base}/comprobantes`}
        atajosDeTeclado
        cambiarReceptor
        regimenFacturaA={regimenFacturaA}
        alEmitir={(r) => {
          if (!r.repetida) setEmitidas((n) => n + 1);
          router.refresh();
        }}
        despues={
          <p className="text-sm text-muted">
            ¿Son las mensuales de siempre? Cargalas una vez como abono y salen solas en el{" "}
            <Link href="/contador/lote" className="inline-flex min-h-11 items-center font-medium text-accent-ink underline underline-offset-4">
              lote del mes
            </Link>
            .
          </p>
        }
      />
      )}
      </div>
      <aside aria-label="En esta sesión" className="flex flex-col gap-3 text-sm">
        <p className="rounded-lg border border-line bg-surface-raised px-4 py-3" aria-live="polite">
          <span className="block text-muted">Emitidas para {alias} en esta sesión</span>
          <span className="text-xl font-bold tabular-nums text-strong">{emitidas}</span>
        </p>
        <div className="hidden rounded-lg border border-line px-4 py-3 text-muted lg:block">
          <p className="m-0 mb-1 font-medium text-strong">Atajos</p>
          <ul className="m-0 list-none space-y-1 p-0">
            <li><kbd className="font-mono">Ctrl</kbd> + <kbd className="font-mono">Enter</kbd> · emitir y la próxima</li>
            <li><kbd className="font-mono">Alt</kbd> + <kbd className="font-mono">1</kbd> · comprador · <kbd className="font-mono">Alt</kbd> + <kbd className="font-mono">2</kbd> · monto</li>
          </ul>
        </div>
        <p className="text-muted">
          Para facturar el mes de toda la cartera de una vez, usá el{" "}
          <Link href="/contador/lote" className="inline-flex min-h-11 items-center font-medium text-accent-ink underline underline-offset-4">lote del mes</Link>.
        </p>
      </aside>
    </div>
  );
}
