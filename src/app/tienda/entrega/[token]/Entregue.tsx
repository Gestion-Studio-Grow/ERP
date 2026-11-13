"use client";

// El botón «Entregué»: un toque, y la confirmación queda en pantalla (leída por el lector).
import { useState, useTransition } from "react";
import { marcarEntregado } from "./acciones";

export default function Entregue({ token, code }: { token: string; code: number }) {
  const [pending, startTransition] = useTransition();
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {resultado?.ok ? null : (
        <button
          type="button"
          disabled={pending}
          aria-busy={pending || undefined}
          className="inline-flex min-h-14 items-center justify-center rounded-md bg-accent px-4 text-lg font-semibold text-on-accent disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          onClick={() =>
            startTransition(async () => {
              try {
                const r = await marcarEntregado(token);
                setResultado(r.ok ? { ok: true, texto: r.mensaje } : { ok: false, texto: r.error });
              } catch {
                setResultado({ ok: false, texto: "No hubo respuesta. Revisá la conexión y probá de nuevo." });
              }
            })
          }
        >
          {pending ? "Avisando…" : `Entregué el pedido #${code}`}
        </button>
      )}
      <p role="status" aria-live="polite" className={`text-base ${resultado && !resultado.ok ? "text-danger" : "text-strong"}`}>
        {resultado?.texto ?? ""}
      </p>
    </div>
  );
}
