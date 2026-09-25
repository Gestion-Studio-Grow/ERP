"use client";

// ============================================================================
// COBRAR / ENTREGAR un pedido — la tecla del paso que sigue, en el pie del cajón (diseño nuevo).
// ============================================================================
//
// Los medios como segmentado (Efectivo · Mercado Pago · Transferencia) y la tecla que dice lo que
// va a pasar («Cobrar $52.340 y entregar»). SIN medio por defecto: el medio se elige, no se asume
// (caja/medio-cobro.ts). Entregar sin cobrar exige tildar «Queda a cobrar», como siempre.
//
// Llama las MISMAS acciones de la bandeja (`cobrarPedido`, `entregarPedido`) con los MISMOS campos
// (formularios-del-pedido.ts). Se invocan directo y no con `useActionState`, por lo mismo que
// CobrarPedidoForm: al salir bien el pedido cambia y esto se desmonta; el resultado va al aviso.

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cobrarPedido, entregarPedido } from "@/lib/order-actions";
import { MEDIOS_DE_COBRO } from "@/lib/caja/medio-cobro";
import { Button, Segmented } from "@/components/ui";
import { fmtMoneyARS } from "@/components/ui/format";
import { useToast } from "../ToastProvider";
import { aFormData, camposDeLaEntrega, camposDelCobro, esRedirectDeNext, textoDeLaEntrega } from "./formularios-del-pedido";

export default function CobroDelPedido({
  id,
  code,
  total,
  cobrado,
  modo,
}: {
  id: string;
  code: number;
  total: number;
  cobrado: boolean;
  /** `entregar`: un pedido Listo (cobra y entrega, o entrega sin cobrar). `cobrar`: sólo cobra. */
  modo: "entregar" | "cobrar";
}) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [medio, setMedio] = useState("");
  const [quedaACobrar, setQuedaACobrar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const uid = useId();

  function enviar() {
    const fd = aFormData(
      modo === "cobrar" ? camposDelCobro({ id, medio }) : camposDeLaEntrega({ id, medio, quedaACobrar, cobrado }),
    );
    startTransition(async () => {
      let r;
      try {
        r = modo === "cobrar" ? await cobrarPedido(null, fd) : await entregarPedido(null, fd);
      } catch (e) {
        if (esRedirectDeNext(e)) throw e;
        const msg = `No se pudo ${modo === "cobrar" ? "cobrar" : "entregar"} el pedido #${code}. Revisá la conexión y volvé a intentar: si ya se había cobrado, no se cobra dos veces.`;
        setError(msg);
        showError(msg);
        return;
      }
      if (r && !r.ok) {
        setError(r.error);
        showError(r.error);
        // Si otra pantalla ya lo cobró o lo movió, el tablero tiene que mostrarlo.
        router.refresh();
        return;
      }
      setError(null);
      showSuccess(r?.mensaje ?? (modo === "cobrar" ? `Pedido #${code} cobrado.` : `Pedido #${code} entregado.`));
      router.refresh();
    });
  }

  const conMedios = modo === "cobrar" || !cobrado;
  const texto =
    modo === "cobrar" ? `Cobrar ${fmtMoneyARS(total)}` : textoDeLaEntrega({ cobrado, medio, quedaACobrar, total: fmtMoneyARS(total) });

  return (
    <form
      noValidate
      aria-label={modo === "cobrar" ? `Cobrar el pedido #${code}` : `Entregar el pedido #${code}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!pending) enviar();
      }}
      className="flex flex-col gap-3"
    >
      {conMedios && (
        <Segmented
          name="paymentMethod"
          leyenda={`¿Cómo pagó el pedido #${code}?`}
          leyendaVisible
          tono="acento"
          lleno
          value={quedaACobrar ? "" : medio}
          opciones={MEDIOS_DE_COBRO.map((m) => ({ valor: m.valor, etiqueta: m.etiqueta, disabled: quedaACobrar }))}
          onChange={(e) => {
            const t = e.target as unknown as HTMLInputElement;
            if (t.name === "paymentMethod") {
              setMedio(t.value);
              setError(null);
            }
          }}
        />
      )}
      {modo === "entregar" && !cobrado && (
        <label htmlFor={`${uid}-queda`} className="flex min-h-11 items-center gap-2 text-sm text-body">
          <input
            id={`${uid}-queda`}
            type="checkbox"
            checked={quedaACobrar}
            onChange={(e) => {
              setQuedaACobrar(e.target.checked);
              if (e.target.checked) setMedio("");
              setError(null);
            }}
            className="size-5"
          />
          Queda a cobrar: se lo lleva sin pagar
        </label>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending} estado={pending ? "cargando" : undefined} className="w-full">
        {pending ? (modo === "cobrar" ? "Cobrando…" : "Entregando…") : texto}
      </Button>
    </form>
  );
}
