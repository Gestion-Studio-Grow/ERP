"use client";

// Cancelar UNA clase desde «Mis clases» (A·E11/E12/E13, M-102…M-104). Cada clase viva tiene la suya:
// cancelar la del viernes no toca la del miércoles. Nada se cancela con un toque suelto: pregunta
// «¿Cancelás…?» con la fecha. Pasado el plazo no se cancela gratis: se explica por qué y queda
// «Avisar que no voy» (entra a la bandeja del profe aunque no tenga WhatsApp cargado).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { avisarNoVoy, cancelarDesdeLink } from "@/lib/padel/acciones-alumno";
import { alerta, botonBorde, botonPeligro, botonTexto, listo } from "@/app/clases/_estilos";

export function Cancelar({ token, claseId, cuando, plazo }: { token: string | null; claseId: string; cuando: string; plazo: string }) {
  const router = useRouter();
  const [seguro, setSeguro] = useState(false);
  const [pendiente, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!seguro) {
    return (
      <button type="button" className={botonTexto} onClick={() => setSeguro(true)} data-qa="cancelar">
        Cancelar · {plazo}
      </button>
    );
  }
  return (
    <div className="grid w-full gap-2" data-qa="confirmar-cancelar">
      <p className="text-base">
        ¿Cancelás la clase del {cuando}? El horario queda libre para otro.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={botonBorde} onClick={() => setSeguro(false)}>
          No, la mantengo
        </button>
        <button
          type="button"
          className={botonPeligro}
          disabled={pendiente}
          data-qa="cancelar-si"
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await cancelarDesdeLink(token, claseId);
              if (r.ok) router.refresh();
              else setError(r.error);
            })
          }
        >
          {pendiente ? "Cancelando…" : "Sí, cancelar"}
        </button>
      </div>
      {error && (
        <p role="alert" className={alerta}>
          {error}
        </p>
      )}
    </div>
  );
}

/** Fuera de término: por qué no se cancela gratis y «Avisar que no voy» (M-104/M-107). */
export function FueraDeTermino({ token, claseId, explicacion, profe }: { token: string | null; claseId: string; explicacion: string; profe: string }) {
  const [pendiente, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  return (
    <div className="grid w-full gap-2" data-qa="fuera-de-termino">
      <p className="text-base text-[var(--padel-suave)]">
        {explicacion} Si no podés ir, avisale a {profe}.
      </p>
      {msg?.ok ? (
        <p role="status" className={listo} data-qa="no-voy-ok">
          {msg.texto}
        </p>
      ) : (
        <button
          type="button"
          className={botonBorde}
          disabled={pendiente}
          data-qa="avisar-no-voy"
          onClick={() =>
            start(async () => {
              const r = await avisarNoVoy(token, claseId);
              setMsg(r.ok ? { ok: true, texto: r.yaAvisado ? `Ya le habías avisado a ${profe}.` : `Listo, ${profe} ya sabe que no vas.` } : { ok: false, texto: r.error });
            })
          }
        >
          {pendiente ? "Avisando…" : "Avisar que no voy"}
        </button>
      )}
      {msg && !msg.ok && (
        <p role="alert" className={alerta}>
          {msg.texto}
        </p>
      )}
    </div>
  );
}
