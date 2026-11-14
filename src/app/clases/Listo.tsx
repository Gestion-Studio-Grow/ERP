"use client";

// «¡Listo!» después de pedir (F7, M-091/M-092): qué pidió, qué falta («falta que Matías la
// confirme») y las salidas: avisarle por WhatsApp (sólo si el profe cargó su celular: nunca un
// botón roto), agregar al calendario, ver mis clases y guardar la app en el inicio. Si el celular
// era de un alumno conocido y este teléfono no es el suyo: «Te confirmamos por WhatsApp al número
// que pusiste», SIN link ni token (M-001).
// Piel de la placa (fronts/agendaprofe/DISENO.md §5.4): filete amarillo pelota de 8 px, título en la
// condensada, la fecha grande y tabular, y el estado como FICHA (reloj: falta confirmar; tilde
// amarilla sobre la noche: confirmada). Íconos SVG, sin emojis. El orden de las salidas no cambia.

import { useEffect, useRef } from "react";
import { Instalar } from "@/app/alumno/_vista/Instalar";
import { cn } from "@/components/ui/cn";
import { botonBorde, botonLleno, botonTexto, caja } from "./_estilos";
import { IconoCalendario, IconoReloj, IconoTilde, IconoWhatsApp } from "./_iconos";

export interface ResultadoPedido {
  estado: string;
  cuando: string;
  token: string | null;
  claseId: string | null;
  /** Alumno conocido pidiendo desde un teléfono que no es el suyo. */
  conocido: boolean;
  waProfe: string | null;
  /** Se pidió con la cookie del alumno (no se tipeó nada). */
  porCookie: boolean;
}

export function Listo({ r, profe, avisaGsg = false, nombreApp, onOtra }: { r: ResultadoPedido; profe: string; avisaGsg?: boolean; nombreApp: string; onOtra: () => void }) {
  const confirmada = r.estado === "CONFIRMADA";
  // Al aparecer, el foco (y la vista) van al título: el turnero de arriba se achica y, sin esto, el
  // «¡Listo!» podía quedar cortado arriba de la pantalla en el celular.
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titulo.current?.focus();
  }, []);
  const calendario = r.claseId ? (r.token ? `/alumno/${r.token}/calendario/${r.claseId}` : r.porCookie ? `/mis-clases/calendario/${r.claseId}` : null) : null;
  const misClases = r.porCookie ? "/mis-clases" : r.token ? `/alumno/${r.token}` : null;
  return (
    <section className={`${caja} grid gap-4 border-t-8 border-t-[var(--padel-vivo)]`} aria-labelledby="listo" data-qa="listo">
      <h2 ref={titulo} id="listo" className="pz-display text-[clamp(2rem,4vw,3rem)] font-extrabold leading-[0.98] outline-none [scroll-margin-top:1rem]" tabIndex={-1}>
        {confirmada ? "¡Listo! Quedó confirmada" : "¡Listo! Pediste tu clase"}
      </h2>
      <div className="grid justify-items-start gap-3" aria-live="polite">
        <strong className="pz-display pz-num text-[clamp(1.625rem,3vw,2.25rem)] font-bold leading-tight">{r.cuando[0]?.toUpperCase() + r.cuando.slice(1)}</strong>
        <p
          data-qa="estado-pedido"
          className={cn(
            "inline-flex min-h-11 items-center gap-2 rounded-full border-[1.5px] px-3.5 text-base font-semibold",
            confirmada
              ? "border-[var(--padel-tinta)] bg-[var(--padel-tinta)] text-[var(--padel-sobre-tinta)]"
              : "border-[var(--padel-linea)] bg-[var(--padel-papel)] text-[var(--padel-texto)]",
          )}
        >
          {confirmada ? <IconoTilde className="size-5 shrink-0 text-[var(--padel-vivo)]" /> : <IconoReloj className="size-5 shrink-0 text-[var(--padel-cancha)]" />}
          {confirmada ? "Confirmada" : `Falta que ${profe} la confirme`}
        </p>
      </div>
      {r.conocido ? (
        <p className="text-base" data-qa="confirmamos-por-wa">
          Te confirmamos por WhatsApp al número que pusiste.
        </p>
      ) : r.waProfe ? (
        <a href={r.waProfe} target="_blank" rel="noopener noreferrer" className={`${botonLleno} w-full`} data-qa="avisar-profe">
          <IconoWhatsApp className="size-6 shrink-0" /> Avisarle por WhatsApp
        </a>
      ) : (
        !confirmada && (
          <p className="text-base" data-qa="sin-wa-profe">
            {avisaGsg ? `${profe} ya lo ve en su agenda; cuando confirme, te avisamos por WhatsApp.` : `${profe} ya lo ve en su agenda; te confirma por WhatsApp.`}
          </p>
        )
      )}
      {calendario && (
        <a href={calendario} className={`${botonBorde} w-full`} data-qa="al-calendario">
          <IconoCalendario className="size-6 shrink-0" /> Agregar al calendario
        </a>
      )}
      {misClases && (
        <a href={misClases} className={`${botonBorde} w-full`} data-qa="mi-link">
          Ver mis clases
        </a>
      )}
      {!r.conocido && <Instalar nombreApp={nombreApp} />}
      <button type="button" className={botonTexto} onClick={onOtra} data-qa="pedir-otra">
        Pedir otra clase
      </button>
    </section>
  );
}
