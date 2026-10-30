"use client";

// Cancelar UNA clase desde «Mis clases» (A·E11/E12/E13, M-102…M-104). Cada clase viva tiene la suya:
// cancelar la del viernes no toca la del miércoles. Nada se cancela con un toque suelto: pregunta
// «¿Cancelás…?» con la fecha. Pasado el plazo no se cancela gratis: se explica por qué y queda
// «Avisar que no voy» (entra a la bandeja del profe aunque no tenga WhatsApp cargado).
//
// QA 29/10 (ALTA): el «¿seguro?» quedaba prendido después de cancelar y, al refrescar, React reusaba
// este mismo componente para la clase SIGUIENTE («Tu próxima» pasa a ser otra) con «Sí, cancelar» en
// el mismo lugar: un doble toque cancelaba dos clases. Ahora la confirmación está atada al id de ESA
// clase (si el componente pasa a mostrar otra, arranca cerrado), se cierra al cancelar y el botón no
// acepta un segundo toque mientras se envía (ni siquiera dos toques en el mismo cuadro).

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { avisarNoVoy, cancelarDesdeLink } from "@/lib/padel/acciones-alumno";
import { alerta, botonBorde, botonPeligro, botonTexto, listo } from "@/app/clases/_estilos";

export function Cancelar({ token, claseId, cuando, plazo }: { token: string | null; claseId: string; cuando: string; plazo: string }) {
  const router = useRouter();
  // De QUÉ clase está abierto el «¿Cancelás…?» (no un sí/no suelto que sobreviva a otra clase).
  const [seguroDe, setSeguroDe] = useState<string | null>(null);
  const [canceladaId, setCanceladaId] = useState<string | null>(null);
  const [pendiente, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const enviando = useRef<string | null>(null);

  if (canceladaId === claseId) {
    return (
      <p role="status" className={listo} data-qa="cancelada-ok">
        Listo, la cancelaste.
      </p>
    );
  }

  if (seguroDe !== claseId) {
    return (
      <button
        type="button"
        className={botonTexto}
        onClick={() => {
          setError(null);
          setSeguroDe(claseId);
        }}
        data-qa="cancelar"
      >
        Cancelar · {plazo}
      </button>
    );
  }

  const confirmar = () => {
    // Un segundo toque (aunque llegue antes de que se pinte «Cancelando…») no manda otra cancelación.
    if (enviando.current) return;
    const id = claseId;
    enviando.current = id;
    start(async () => {
      setError(null);
      try {
        const r = await cancelarDesdeLink(token, id);
        if (r.ok) {
          setSeguroDe(null);
          setCanceladaId(id);
          // El refresco saca la clase de la lista y este componente se va con ella: el «Listo, la
          // cancelaste» lo muestra <AvisoCancelada>, que vive arriba y sobrevive al refresco.
          window.dispatchEvent(new CustomEvent(EVENTO_CANCELADA, { detail: cuando }));
          router.refresh();
        } else setError(r.error);
      } catch {
        setError("No se pudo cancelar: revisá la conexión y probá de nuevo.");
      } finally {
        enviando.current = null;
      }
    });
  };

  return (
    <div className="grid w-full gap-2" data-qa="confirmar-cancelar">
      <p className="text-base">
        ¿Cancelás la clase del {cuando}? El horario queda libre para otro.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={botonBorde} disabled={pendiente} onClick={() => setSeguroDe(null)}>
          No, la mantengo
        </button>
        <button type="button" className={botonPeligro} disabled={pendiente} aria-disabled={pendiente} data-qa="cancelar-si" onClick={confirmar}>
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

const EVENTO_CANCELADA = "gsg-padel-cancelada";

/** «Listo, la cancelaste» (QA r2, MEDIA): queda arriba de «Mis clases» después del refresco, que es el
 *  que saca la clase cancelada de la lista (antes el aviso se iba con ella y no se llegaba a ver). La
 *  región `aria-live` existe desde el principio para que el lector la anuncie; la vista sube hasta acá. */
export function AvisoCancelada() {
  const [cuando, setCuando] = useState<string | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const oir = (e: Event) => setCuando(String((e as CustomEvent<string>).detail ?? ""));
    window.addEventListener(EVENTO_CANCELADA, oir);
    return () => window.removeEventListener(EVENTO_CANCELADA, oir);
  }, []);
  useEffect(() => {
    if (cuando !== null) caja.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [cuando]);
  return (
    <div ref={caja} role="status" aria-live="polite" className="empty:hidden">
      {cuando !== null && (
        <div className={`${listo} flex items-center justify-between gap-3`} data-qa="cancelada-aviso">
          <span>Listo, la cancelaste.{cuando ? ` La clase del ${cuando} quedó libre.` : ""}</span>
          <button type="button" className={botonTexto} onClick={() => setCuando(null)} aria-label="Cerrar aviso">
            Ok
          </button>
        </div>
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
