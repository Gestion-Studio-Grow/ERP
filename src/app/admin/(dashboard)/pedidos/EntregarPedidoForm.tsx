"use client";

// Entregar un pedido listo.
//
// Antes «Entregar» era el mismo botón que avanzaba los otros estados: no preguntaba por el
// cobro, el pedido pasaba a entregado sin cobrar, caía a "Cerrados recientes" —que no tiene
// botones— y esa plata no llegaba nunca a la caja. Ahora:
//   · ya cobrado → un toque, igual que siempre (el camino feliz no suma pasos);
//   · sin cobrar → se abre acá mismo: o se elige con qué pagó (se cobra y se entrega en el
//     mismo toque, un paso MENOS que cobrar y después entregar), o se tilda «Queda a cobrar»
//     y el pedido sigue en la bandeja como "Entregado · a cobrar" hasta que se cobre.
// Sin ninguna de las dos, el servidor lo rechaza y el motivo se ve en la fila.
//
// Se invoca directo y no con `useActionState`, por lo mismo que CobrarPedidoForm: al salir
// bien la fila cambia y este formulario se desmonta; el resultado va al toast.
//
// Sin imports de valor de Prisma: los medios son string literals de caja/medio-cobro.ts.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { entregarPedido } from "@/lib/order-actions";
import { MEDIOS_DE_COBRO } from "@/lib/caja/medio-cobro";
import { Select } from "@/components/ui";
import { useToast } from "../ToastProvider";

// El redirect de sesión vencida llega como excepción con digest NEXT_REDIRECT: tragarlo
// dejaría a la persona sin login (el mismo helper que CobrarPedidoForm y PosForm).
function isNextRedirect(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

export default function EntregarPedidoForm({ id, code, paid }: { id: string; code: number; paid: boolean }) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [medio, setMedio] = useState("");
  const [quedaACobrar, setQuedaACobrar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const selectId = `entregar-medio-${id}`;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      let r;
      try {
        r = await entregarPedido(null, fd);
      } catch (err) {
        if (isNextRedirect(err)) throw err;
        const msg =
          "No se pudo entregar el pedido. Revisá la conexión y volvé a intentar: si ya se había cobrado, no se cobra dos veces.";
        setError(msg);
        showError(msg);
        return;
      }
      if (r && !r.ok) {
        setError(r.error);
        showError(r.error);
        // Si otra pestaña lo cobró o lo movió, la fila tiene que mostrarlo: se refresca igual.
        router.refresh();
        return;
      }
      setError(null);
      setAbierto(false);
      showSuccess(r?.mensaje ?? `Pedido #${code} entregado.`);
      router.refresh();
    });
  }

  const errorEnFila = error && (
    <p role="alert" className="max-w-64 whitespace-normal text-xs text-danger">
      {error}
    </p>
  );

  // Ya cobrado: el mismo botón de siempre, de un toque.
  if (paid) {
    return (
      <form onSubmit={submit} className="flex flex-col gap-1">
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          disabled={pending}
          className="chip-btn text-xs h-11 sm:h-auto w-full sm:w-auto disabled:opacity-50"
        >
          {pending ? "Entregando…" : "Entregar"}
        </button>
        {errorEnFila}
      </form>
    );
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-expanded={false}
        className="chip-btn text-xs h-11 sm:h-auto w-full sm:w-auto"
      >
        Entregar
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      role="group"
      aria-label={`Entregar el pedido #${code}`}
      className="flex w-72 max-w-full flex-col gap-2 whitespace-normal rounded-md border border-line bg-surface-sunken p-3"
    >
      <input type="hidden" name="id" value={id} />
      <label htmlFor={selectId} className="text-xs font-medium text-strong">
        ¿Cómo pagó el pedido #{code}?
      </label>
      {/* SIN valor por defecto: el medio se elige, no se asume. Con «Queda a cobrar» tildado
          se deshabilita, y un select deshabilitado no viaja en el formulario. */}
      <Select
        id={selectId}
        name="paymentMethod"
        value={medio}
        autoFocus
        disabled={quedaACobrar}
        onChange={(e) => {
          setMedio(e.target.value);
          setError(null);
        }}
        aria-invalid={error ? true : undefined}
        className="text-xs"
      >
        <option value="">Elegí el medio</option>
        {MEDIOS_DE_COBRO.map((m) => (
          <option key={m.valor} value={m.valor}>
            {m.etiqueta}
          </option>
        ))}
      </Select>
      <label className="flex min-h-11 items-center gap-2 text-xs text-body sm:min-h-8">
        <input
          type="checkbox"
          name="quedaACobrar"
          checked={quedaACobrar}
          onChange={(e) => {
            setQuedaACobrar(e.target.checked);
            if (e.target.checked) setMedio("");
            setError(null);
          }}
          className="h-4 w-4"
        />
        Queda a cobrar: se lo lleva sin pagar
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className="chip-btn text-xs h-11 sm:h-auto disabled:opacity-50">
          {pending ? "Entregando…" : medio ? "Cobrar y entregar" : quedaACobrar ? "Entregar sin cobrar" : "Entregar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setAbierto(false);
            setError(null);
          }}
          className="h-11 px-2 text-xs text-muted hover:underline sm:h-8"
        >
          Volver
        </button>
      </div>
      {errorEnFila}
    </form>
  );
}
