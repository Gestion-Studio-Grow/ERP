"use client";

// ============================================================================
// CONGELAR EL MES deslizando (diseño nuevo «Renglón»).
// ============================================================================
//
// Congelar es de lo poco irreversible del día a día (reabrir exige a la dueña y un motivo): se
// confirma llevando la perilla hasta el final, no con un toque suelto. Si quedan pasos pendientes,
// antes hay que tildar que se congela igual (el servidor lo vuelve a exigir, no se confía en la
// casilla). Si un paso bloquea (días de caja sin cerrar), la deslizadora queda apagada y dice por qué.
//
// La MISMA acción y los MISMOS campos que CongelarMes (CierreMesForms.tsx): `mes` y, con pasos
// pendientes aceptados, `confirmo=1`. Se invoca directo, como siempre en este panel.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { congelarMesAction, type EstadoAccionCierre } from "@/lib/cierre-mes/acciones";
import { DeslizarParaConfirmar } from "@/components/ui/Deslizar";

export default function CongelarDeslizando({
  mes,
  etiqueta,
  bloqueo,
  pendientes,
}: {
  mes: string;
  /** «Agosto 2026». */
  etiqueta: string;
  bloqueo: string | null;
  pendientes: string[];
}) {
  const router = useRouter();
  const [acepta, setAcepta] = useState(false);
  const [estado, setEstado] = useState<EstadoAccionCierre>(null);
  const [intento, setIntento] = useState(0);
  const [pending, startTransition] = useTransition();
  const listo = !bloqueo && (pendientes.length === 0 || acepta);

  const congelar = () => {
    const fd = new FormData();
    fd.set("mes", mes);
    if (acepta) fd.set("confirmo", "1");
    startTransition(async () => {
      try {
        const r = await congelarMesAction(null, fd);
        setEstado(r);
        if (r?.ok) router.refresh();
        else setIntento((n) => n + 1);
      } catch {
        setEstado({ ok: false, error: "No llegó la respuesta (problema de conexión). Actualizá la página para ver si el mes quedó congelado antes de volver a intentar." });
        setIntento((n) => n + 1);
      }
    });
  };

  return (
    <section aria-labelledby="congelar-titulo" className="flex max-w-2xl flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 border-b border-line-strong pb-2">
        <h2 id="congelar-titulo" className="text-[15px] font-semibold text-strong">
          Congelar {etiqueta}
        </h2>
      </div>
      <p className="text-sm text-body">
        {bloqueo
          ? `Todavía no se puede. ${bloqueo} Cerrá esos días desde el paso 1 y volvé.`
          : "Congelado el mes, el paquete que baja tu contador es la versión final. Si después hay que corregir algo, la dueña o el dueño lo reabre con un motivo."}
      </p>
      {!bloqueo && pendientes.length > 0 && (
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-body">
          <input type="checkbox" className="mt-1 size-5 shrink-0" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} />
          <span>
            Congelar igual, con {pendientes.length === 1 ? "un paso pendiente" : `${pendientes.length} pasos pendientes`}: {pendientes.join(", ")}. Queda
            anotado cuáles eran.
          </span>
        </label>
      )}
      <DeslizarParaConfirmar
        key={intento}
        texto={listo ? `Deslizá para congelar ${etiqueta.toLowerCase()}` : bloqueo ? "No se puede congelar todavía" : "Tildá la casilla para congelar"}
        etiqueta={`Congelar ${etiqueta}`}
        textoHecho="Congelando…"
        disabled={!listo || pending}
        onConfirmar={congelar}
      />
      {estado && (
        <p role={estado.ok ? "status" : "alert"} className={`text-sm ${estado.ok ? "text-success" : "text-danger"}`}>
          {estado.ok ? estado.mensaje : estado.error}
        </p>
      )}
    </section>
  );
}
