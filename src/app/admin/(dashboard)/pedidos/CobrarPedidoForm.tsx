"use client";

// Cobrar un pedido de la bandeja (MAG-1).
//
// Reemplaza al `<form action={setOrderPaid}>` que tenía dos problemas:
//   1. El select arrancaba en EFECTIVO. El pedido que el cliente pagó con Mercado Pago y que
//      nadie cambió se asentaba en la columna del cajón, y el arqueo esperaba esa plata.
//      Ahora el select arranca VACÍO y el servidor rechaza el cobro sin medio.
//   2. Era mudo: `setOrderPaid` LANZABA sus rechazos y en producción Next redacta el mensaje
//      de una excepción. "El día está cerrado" y "se cayó la base" se veían igual. Ahora la
//      acción (`cobrarPedido`) DEVUELVE el motivo y se muestra acá.
//
// POR QUÉ SE INVOCA DIRECTO Y NO CON `useActionState`. El libro de caja midió que por ese
// camino ~4 de cada 10 guardados quedaban colgados en "Guardando…" con la fila ya escrita
// (ver el encabezado de caja/libro/LibroForms.tsx). Y acá hay un motivo propio: cuando el
// cobro sale bien, la bandeja se revalida y esta fila deja de ofrecer «Cobrar» —el formulario
// se DESMONTA—, así que un mensaje guardado en su estado se perdería con él. El resultado va
// al toast, que vive en el layout y sobrevive al refresco; el error, además, queda en la fila.
//
// Sin imports de valor de Prisma: los medios son string literals de caja/medio-cobro.ts.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cobrarPedido } from "@/lib/order-actions";
import { MEDIOS_DE_COBRO } from "@/lib/caja/medio-cobro";
import { Select } from "@/components/ui";
import { useToast } from "../ToastProvider";

// Ver el mismo helper en PosForm: el redirect de sesión vencida llega como excepción con
// digest NEXT_REDIRECT y tragarlo dejaría a la persona sin login.
function isNextRedirect(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

export default function CobrarPedidoForm({ id, code }: { id: string; code: number }) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [medio, setMedio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const selectId = `cobrar-medio-${id}`;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      let r;
      try {
        r = await cobrarPedido(null, fd);
      } catch (err) {
        if (isNextRedirect(err)) throw err;
        const msg = "No se pudo cobrar el pedido. Revisá la conexión y volvé a intentar: si ya se había cobrado, no se cobra dos veces.";
        setError(msg);
        showError(msg);
        return;
      }
      if (r && !r.ok) {
        setError(r.error);
        showError(r.error);
        // "Ya estaba cobrado con otro medio" también es un rechazo, y la fila tiene que
        // pasar a mostrarse cobrada: se refresca igual.
        router.refresh();
        return;
      }
      setError(null);
      showSuccess(r?.mensaje ?? `Pedido #${code} cobrado.`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1">
      <input type="hidden" name="id" value={id} />
      <div className="flex items-center gap-1">
        <label htmlFor={selectId} className="sr-only">
          Cómo pagó el pedido #{code}
        </label>
        {/* SIN valor por defecto, a propósito: el medio se elige, no se asume. */}
        <Select
          id={selectId}
          name="paymentMethod"
          value={medio}
          onChange={(e) => {
            setMedio(e.target.value);
            setError(null);
          }}
          aria-invalid={error ? true : undefined}
          className="w-auto min-w-40 text-xs"
        >
          <option value="">¿Cómo pagó?</option>
          {MEDIOS_DE_COBRO.map((m) => (
            <option key={m.valor} value={m.valor}>
              {m.etiqueta}
            </option>
          ))}
        </Select>
        <button type="submit" disabled={pending} className="chip-btn h-11 text-xs disabled:opacity-50">
          {pending ? "Cobrando…" : "Cobrar"}
        </button>
      </div>
      {error && (
        <p role="alert" className="max-w-64 whitespace-normal text-xs text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
