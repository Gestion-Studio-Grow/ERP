"use client";

// «¡Listo!» después de pedir (F7, M-091/M-092): qué pidió, qué falta («falta que Matías la
// confirme») y las salidas: avisarle por WhatsApp (sólo si el profe cargó su celular: nunca un
// botón roto), agregar al calendario, ver mis clases y guardar la app en el inicio. Si el celular
// era de un alumno conocido y este teléfono no es el suyo: «Te confirmamos por WhatsApp al número
// que pusiste», SIN link ni token (M-001).

import { Instalar } from "@/app/alumno/_vista/Instalar";
import { botonBorde, botonLleno, botonTexto, caja } from "./_estilos";

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

export function Listo({ r, profe, nombreApp, onOtra }: { r: ResultadoPedido; profe: string; nombreApp: string; onOtra: () => void }) {
  const confirmada = r.estado === "CONFIRMADA";
  const calendario = r.claseId ? (r.token ? `/alumno/${r.token}/calendario/${r.claseId}` : r.porCookie ? `/mis-clases/calendario/${r.claseId}` : null) : null;
  const misClases = r.porCookie ? "/mis-clases" : r.token ? `/alumno/${r.token}` : null;
  return (
    <section className={`${caja} grid gap-3 border-t-[5px] border-t-[var(--padel-vivo)]`} aria-labelledby="listo" data-qa="listo">
      <h2 id="listo" className="text-2xl font-bold" tabIndex={-1}>
        {confirmada ? "¡Listo! Quedó confirmada" : "¡Listo! Pediste tu clase"}
      </h2>
      <p className="text-base" aria-live="polite">
        <strong className="tabular-nums">{r.cuando[0]?.toUpperCase() + r.cuando.slice(1)}</strong>
        {confirmada ? "." : ` · falta que ${profe} la confirme.`}
      </p>
      {r.conocido ? (
        <p className="text-base" data-qa="confirmamos-por-wa">
          Te confirmamos por WhatsApp al número que pusiste.
        </p>
      ) : r.waProfe ? (
        <a href={r.waProfe} target="_blank" rel="noopener noreferrer" className={`${botonLleno} w-full`} data-qa="avisar-profe">
          <span aria-hidden>💬</span> Avisarle por WhatsApp
        </a>
      ) : (
        !confirmada && (
          <p className="text-base" data-qa="sin-wa-profe">
            {profe} ya lo ve en su agenda; te confirma por WhatsApp.
          </p>
        )
      )}
      {calendario && (
        <a href={calendario} className={`${botonBorde} w-full`} data-qa="al-calendario">
          Agregar al calendario
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
