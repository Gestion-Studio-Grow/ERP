"use client";

// El botón que avanza un pedido de la bandeja («Confirmar», «Preparar», «Marcar listo»).
//
// Era un `<form action={advanceOrderStatus}>` en la página: si la acción tiraba, la bandeja se
// iba a la pantalla genérica de error, y si rechazaba, nada lo decía (ver avanzar-pedido.ts).
// Ahora se invoca directo, como CobrarPedidoForm, y lo que no salió queda escrito en la fila y
// en el aviso de abajo. Se ve igual que antes: mismo botón, mismas clases.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { advanceOrderStatus } from "@/lib/order-actions";
import { useToast } from "../ToastProvider";
import { rechazoDeAccion, sinRespuestaAlAvanzar } from "./avanzar-pedido";

// El redirect de sesión vencida llega como excepción con digest NEXT_REDIRECT: se deja pasar.
function isNextRedirect(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

export default function AvanzarPedidoForm({
  id,
  code,
  verbo,
  className,
}: {
  id: string;
  code: number;
  verbo: string;
  className: string;
}) {
  const router = useRouter();
  const { showError } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      let r: unknown;
      try {
        r = await advanceOrderStatus(fd);
      } catch (err) {
        if (isNextRedirect(err)) throw err;
        const msg = sinRespuestaAlAvanzar(verbo, code, navigator.onLine);
        setError(msg);
        showError(msg);
        return;
      }
      const rechazo = rechazoDeAccion(r);
      setError(rechazo);
      if (rechazo) showError(rechazo);
      // Salió o no, la fila tiene que mostrar el estado que quedó (otra pestaña pudo moverlo).
      router.refresh();
    });
  }

  return (
    // Un <form> de bloque, como el de antes: con flex, el botón se estiraba en la computadora.
    <form onSubmit={submit}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} aria-busy={pending || undefined} className={className}>
        {verbo}
      </button>
      {error && (
        <p role="alert" className="mt-1 max-w-64 whitespace-normal text-xs text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
