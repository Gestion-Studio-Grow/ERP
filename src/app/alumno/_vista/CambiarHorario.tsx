"use client";

// «Cambiar horario» desde «Mis clases» (F2 alumno, M-105/M-106): la cinta de días con las horas
// libres → «Cambiar a vie 24 · 19:00». Un alumno conocido (o un pedido) mueve la misma clase; uno
// nuevo con la clase confirmada pide la nueva y la vieja sigue hasta que el profe confirme. Si la
// hora se ocupó en el medio, la clase original queda intacta y se ofrecen las más cercanas.
// También «¿La semana que viene igual?» (repetir), que reserva desde el link.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DiaConLugar } from "@/lib/padel/datos.server";
import { cambiarHorarioDesdeLink, reservarDesdeLink } from "@/lib/padel/acciones-alumno";
import { HojaPublica } from "@/app/clases/_hoja";
import { ElegirHora } from "@/app/clases/_elegir-hora";
import { alerta, botonBorde, botonLleno, botonPrincipal, chip, listo } from "@/app/clases/_estilos";
import { SE_OCUPO_RECIEN, alternativasEnCinta, diaYHora, horaCorta, sinLaHora } from "@/app/clases/cinta";

export function CambiarHorario({
  token,
  claseId,
  estado,
  dias: diasIniciales,
  profe,
}: {
  token: string | null;
  claseId: string;
  /** El estado de la clase ANTES de cambiarla: decide qué se le dice al alumno. */
  estado: string;
  dias: DiaConLugar[];
  profe: string;
}) {
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [dias, setDias] = useState(diasIniciales);
  const [fecha, setFecha] = useState(diasIniciales[0]?.fecha ?? "");
  const [hora, setHora] = useState<string | null>(null);
  const [alternativas, setAlternativas] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const [pendiente, start] = useTransition();

  const etiqueta = dias.find((d) => d.fecha === fecha)?.etiqueta ?? "";

  const cambiar = (iso: string) =>
    start(async () => {
      setError(null);
      let r: Awaited<ReturnType<typeof cambiarHorarioDesdeLink>>;
      try {
        r = await cambiarHorarioDesdeLink(token, claseId, iso);
      } catch {
        // La acción tiró (choque que escapó o corte): la clase sigue como estaba, nunca al error boundary.
        setHora(null);
        setError(`${SE_OCUPO_RECIEN} Tu clase sigue como estaba.`);
        return;
      }
      if (r.ok) {
        setHecho(
          estado === "PEDIDA"
            ? `Cambiaste tu pedido al ${r.cuando}. Falta que ${profe} lo confirme.`
            : r.esperaAlProfe
              ? `Listo: le pediste a ${profe} pasarla al ${r.cuando}. Hasta que te confirme, sigue la de antes.`
              : `Listo, tu clase pasó al ${r.cuando}. ${profe} ya lo sabe.`,
        );
        setAbierta(false);
        router.refresh();
        return;
      }
      setError(r.alternativas ? `${r.error} Tu clase sigue como estaba.` : r.error);
      if (r.alternativas) {
        const sin = sinLaHora(dias, iso);
        setDias(sin);
        setHora(null);
        setAlternativas(alternativasEnCinta(sin, r.alternativas, 3));
      }
    });

  return (
    <>
      <button type="button" className={botonBorde} onClick={() => setAbierta(true)} data-qa="cambiar-horario">
        Cambiar horario
      </button>
      {hecho && (
        <p role="status" className={`${listo} w-full`} data-qa="cambio-ok">
          {hecho}
        </p>
      )}
      <HojaPublica
        abierta={abierta}
        onCerrar={() => setAbierta(false)}
        titulo="Cambiar horario"
        descripcion="Sólo te mostramos lo que está libre."
        qa="hoja-cambiar"
        pie={
          <button type="button" className={botonPrincipal} disabled={!hora || pendiente} onClick={() => hora && cambiar(hora)} data-qa="confirmar-cambio">
            {pendiente ? "Cambiando…" : hora ? `Cambiar a ${etiqueta.toLowerCase() === "hoy" || etiqueta.toLowerCase() === "mañana" ? etiqueta.toLowerCase() : etiqueta} · ${horaCorta(hora)}` : "Elegí día y hora"}
          </button>
        }
      >
        {dias.length === 0 ? (
          <p className="text-base">No quedan horarios libres por ahora. Escribile a {profe} y lo arreglan.</p>
        ) : (
          <ElegirHora
            prefijo={`cambio-${claseId}`}
            dias={dias}
            fecha={fecha}
            hora={hora}
            onFecha={(f) => {
              setFecha(f);
              setHora(null);
            }}
            onHora={setHora}
          />
        )}
        {error && (
          <p role="alert" className={`${alerta} mt-4`}>
            {error}
          </p>
        )}
        {alternativas.length > 0 && (
          <div className="mt-3">
            <p className="mb-2 text-base font-semibold">Te quedan libres:</p>
            <div className="flex flex-wrap gap-2">
              {alternativas.map((a) => (
                <button key={a} type="button" className={chip(false)} disabled={pendiente} onClick={() => cambiar(a)} data-qa="alternativa">
                  {diaYHora(a)}
                </button>
              ))}
            </div>
          </div>
        )}
      </HojaPublica>
    </>
  );
}

/** «¿La semana que viene igual?»: reserva la misma hora, siete días después, desde el link. */
export function Repetir({ token, horaIso, repiteDe, etiqueta, profe }: { token: string | null; horaIso: string; repiteDe: string; etiqueta: string; profe: string }) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [alternativas, setAlternativas] = useState<string[]>([]);

  const reservar = (iso: string, repite?: string) =>
    start(async () => {
      let r: Awaited<ReturnType<typeof reservarDesdeLink>>;
      try {
        r = await reservarDesdeLink(token, iso, repite);
      } catch {
        setMsg({ ok: false, texto: SE_OCUPO_RECIEN });
        return;
      }
      if (r.ok) {
        setAlternativas([]);
        setMsg({ ok: true, texto: r.estado === "CONFIRMADA" ? `¡Listo! Quedó confirmada: ${r.cuando}.` : `Pedida: ${r.cuando}. ${profe} te la confirma.` });
        router.refresh();
      } else {
        setMsg({ ok: false, texto: r.error });
        setAlternativas((r.alternativas ?? []).slice(0, 3));
      }
    });

  return (
    <div className="grid gap-2">
      <button type="button" disabled={pendiente} onClick={() => reservar(horaIso, repiteDe)} className={`${botonLleno} w-full`} data-qa="repetir">
        {pendiente ? "Reservando…" : `Sí, ${etiqueta}`}
      </button>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? listo : alerta}>
          {msg.texto}
        </p>
      )}
      {alternativas.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {alternativas.map((a) => (
            <button key={a} type="button" disabled={pendiente} onClick={() => reservar(a)} className={chip(false)} data-qa="alternativa">
              {diaYHora(a)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
