"use client";

// «Anular…» en la bandeja: confirmación en dos pasos, con motivo.
//
// Reemplaza al botón «Cancelar», que anulaba de un toque, sin preguntar y sin motivo, al lado
// del botón de cobrar. Anular es irreversible y mueve plata hacia atrás (asienta el egreso en
// la caja y devuelve la mercadería), así que es de lo poco que merece confirmación: el mismo
// patrón que la anulación de cobros de turno (CorreccionConMotivo, turnos/AppointmentRow.tsx).
//
// El motivo es obligatorio para recepción y opcional para el dueño; la regla la decide el
// SERVIDOR (`reglasDeAnulacion`) y acá sólo se avisa en la etiqueta. Por eso el formulario va
// con `noValidate`: el rechazo que se ve es el del servidor, con su texto ("Escribí por qué se
// anula…"), y no el globito del navegador en el idioma que tenga configurado.
//
// Se invoca directo, como CobrarPedidoForm: al salir bien la fila deja la bandeja y este
// formulario se desmonta; el resultado —qué plata y qué mercadería se movió— va al toast.

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { anularVenta } from "@/lib/order-actions";
import { MOTIVO_MAX } from "@/lib/turnos/anulacion";
import { fmtMoneyARS } from "@/components/ui/format";
import { useToast } from "../ToastProvider";

function isNextRedirect(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

export default function AnularPedidoForm({
  id,
  code,
  paid,
  total,
  motivoObligatorio,
}: {
  id: string;
  code: number;
  paid: boolean;
  total: number;
  motivoObligatorio: boolean;
}) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const uid = useId();
  const tituloId = `${uid}-titulo`;
  const motivoId = `${uid}-motivo`;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      let r;
      try {
        r = await anularVenta(null, fd);
      } catch (err) {
        if (isNextRedirect(err)) throw err;
        const msg =
          "No se pudo anular. Revisá la conexión y volvé a intentar: si ya se había anulado, no se anula dos veces.";
        setError(msg);
        showError(msg);
        return;
      }
      if (r && !r.ok) {
        setError(r.error);
        showError(r.error);
        return;
      }
      setError(null);
      setAbierto(false);
      showSuccess(r?.mensaje ?? `Pedido #${code} anulado.`);
      router.refresh();
    });
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-expanded={false}
        className="chip-btn chip-btn-danger text-xs h-11 sm:h-auto w-full sm:w-auto"
      >
        Anular…
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      role="group"
      aria-labelledby={tituloId}
      className="flex w-72 max-w-full flex-col gap-2 whitespace-normal rounded-md border border-line bg-surface-sunken p-3"
    >
      <input type="hidden" name="id" value={id} />
      <p id={tituloId} className="text-xs font-medium text-strong">
        ¿Anular el pedido #{code}?
      </p>
      <p className="text-xs text-muted">
        {paid
          ? `Se devuelven ${fmtMoneyARS(total)} en la caja del día en que se cobró.`
          : "No estaba cobrado: la caja no se toca."}
      </p>
      <label htmlFor={motivoId} className="text-xs text-body">
        Motivo {motivoObligatorio ? "(obligatorio)" : "(queda en la auditoría)"}
      </label>
      <input
        id={motivoId}
        name="motivo"
        type="text"
        autoFocus
        maxLength={MOTIVO_MAX}
        aria-required={motivoObligatorio || undefined}
        aria-invalid={error ? true : undefined}
        placeholder="Ej.: se pesó mal, eran 1,310 kg"
        className="h-11 rounded-md border border-line-strong bg-surface-raised px-3 text-sm text-strong placeholder:text-faint focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      />
      <label className="flex min-h-11 items-center gap-2 text-xs text-body sm:min-h-8">
        <input type="checkbox" name="stockNoVolvio" className="h-4 w-4" />
        La mercadería no volvió
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="chip-btn chip-btn-danger text-xs h-11 sm:h-auto disabled:opacity-50"
        >
          {pending ? "Anulando…" : "Sí, anular"}
        </button>
        <button
          type="button"
          onClick={() => {
            setAbierto(false);
            setError(null);
          }}
          className="h-11 px-2 text-xs text-muted hover:underline sm:h-8"
        >
          No
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
