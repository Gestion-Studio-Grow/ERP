"use client";

// ============================================================================
// ANULAR un pedido o una venta — dentro de un diálogo o un cajón (diseño nuevo).
// ============================================================================
//
// Lo irreversible con plata va en dos pasos y con motivo: acá se abre desde «Más» (primer paso)
// y la tecla roja dice exactamente qué se hace («Anular el pedido #474») y qué pasa con la plata.
// El motivo es obligatorio para recepción; la regla la decide el SERVIDOR (`anularVenta`,
// order-actions.ts), por eso `noValidate`: el rechazo que se ve es el suyo, con su texto.
//
// Misma acción y mismos campos que AnularPedidoForm (formularios-del-pedido.ts).

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { anularVenta } from "@/lib/order-actions";
import { MOTIVO_MAX } from "@/lib/turnos/anulacion";
import { Button, Field, Input } from "@/components/ui";
import { fmtMoneyARS } from "@/components/ui/format";
import { useToast } from "../ToastProvider";
import { aFormData, camposDeLaAnulacion, esRedirectDeNext } from "./formularios-del-pedido";

export default function AnularDelPedido({
  id,
  code,
  cobrado,
  aCuenta = false,
  total,
  motivoObligatorio,
  sustantivo = "pedido",
  onHecho,
}: {
  id: string;
  code: number;
  cobrado: boolean;
  aCuenta?: boolean;
  total: number;
  motivoObligatorio: boolean;
  /** «pedido» o «venta». */
  sustantivo?: "pedido" | "venta";
  onHecho?: () => void;
}) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [motivo, setMotivo] = useState("");
  const [stockNoVolvio, setStockNoVolvio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const uid = useId();

  function enviar() {
    const fd = aFormData(camposDeLaAnulacion({ id, motivo, stockNoVolvio }));
    startTransition(async () => {
      let r;
      try {
        r = await anularVenta(null, fd);
      } catch (e) {
        if (esRedirectDeNext(e)) throw e;
        const msg = "No se pudo anular. Revisá la conexión y volvé a intentar: si ya se había anulado, no se anula dos veces.";
        setError(msg);
        showError(msg);
        return;
      }
      if (r && !r.ok) {
        setError(r.error);
        return;
      }
      setError(null);
      showSuccess(r?.mensaje ?? `${sustantivo === "venta" ? "Venta" : "Pedido"} #${code} anulado.`);
      onHecho?.();
      router.refresh();
    });
  }

  const plata = aCuenta
    ? `Estaba a cuenta: se sacan ${fmtMoneyARS(total)} de la cuenta corriente del cliente. La caja no se toca.`
    : cobrado
      ? `Se devuelven ${fmtMoneyARS(total)} en la caja del día en que se cobró.`
      : "No estaba cobrado: la caja no se toca.";

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!pending) enviar();
      }}
      className="flex flex-col gap-3"
    >
      <p className="text-sm text-body">{plata}</p>
      <Field
        label={`Motivo ${motivoObligatorio ? "(obligatorio)" : "(queda en la auditoría)"}`}
        htmlFor={`${uid}-motivo`}
        error={error ?? undefined}
      >
        <Input
          id={`${uid}-motivo`}
          value={motivo}
          maxLength={MOTIVO_MAX}
          aria-required={motivoObligatorio || undefined}
          aria-invalid={error ? true : undefined}
          placeholder="Ej.: se pesó mal, eran 1,310 kg"
          onChange={(e) => {
            setMotivo(e.target.value);
            setError(null);
          }}
        />
      </Field>
      <label htmlFor={`${uid}-stock`} className="flex min-h-11 items-center gap-2 text-sm text-body">
        <input id={`${uid}-stock`} type="checkbox" checked={stockNoVolvio} onChange={(e) => setStockNoVolvio(e.target.checked)} className="size-5" />
        La mercadería no volvió
      </label>
      <Button type="submit" variant="danger" disabled={pending} estado={pending ? "cargando" : undefined}>
        {pending ? "Anulando…" : `Anular ${sustantivo === "venta" ? "la venta" : "el pedido"} #${code}`}
      </Button>
    </form>
  );
}
