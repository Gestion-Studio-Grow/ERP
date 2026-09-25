"use client";

// ============================================================================
// LA FICHA DEL NEGOCIO EN PESTAÑAS — un legajo con separadores, no un scroll de 6.000 px.
// ============================================================================
//
// Puesta en marcha · Fiscal · Plan y apps · Marca y vidriera · Personas · Historial. El servidor
// dibuja TODOS los paneles (cada uno con sus formularios) y esta pieza muestra uno: cambiar de
// pestaña no pide nada a la base ni pierde lo que se estaba tipeando en otra.
//
// Cada pestaña es un enlace (`?pestana=fiscal`): sin JavaScript abre la misma pestaña desde el
// servidor, y se puede compartir. Con JavaScript cambia en el lugar y reescribe la URL.
//
// VOLVER A LA MISMA PESTAÑA DESPUÉS DE GUARDAR. Las actions de la consola (operator-actions.ts, que
// no son de esta pantalla) vuelven a `/operador/tenants/<id>?ok=…`, a veces con un ancla (#apps,
// #interruptores, #red). Sin la pestaña en la URL, la persona que guardó el CUIT caería en «Puesta
// en marcha» y no vería el aviso de lo que guardó. Por eso: el ancla elige la pestaña que la
// contiene y, si no hay ancla, la última pestaña tocada en esta ficha (sessionStorage, sólo con un
// `ok`/`error` en la URL: al entrar de cero se abre la que pide la URL o la primera).

import { useEffect, useRef, useState } from "react";
import type { PestanaFicha } from "../../negocios-core";

export type PestanaDeFicha = {
  id: PestanaFicha;
  etiqueta: string;
  /** Un número al lado («Puesta en marcha 3»): lo que queda por hacer ahí. */
  conteo?: number;
};

/** A qué pestaña pertenece cada ancla que dejan las actions al volver. */
const PESTANA_DEL_ANCLA: Record<string, PestanaFicha> = {
  apps: "plan",
  interruptores: "plan",
  red: "plan",
  fiscal: "fiscal",
  personas: "personas",
};

const clave = (id: string) => `consola-ficha-pestana:${id}`;

export default function FichaConPestanas({
  negocioId,
  inicial,
  pedidaEnLaUrl,
  pestanas,
  paneles,
}: {
  negocioId: string;
  inicial: PestanaFicha;
  /** ¿La URL trajo `?pestana=`? Entonces manda la URL y no se adivina nada. */
  pedidaEnLaUrl: boolean;
  pestanas: readonly PestanaDeFicha[];
  paneles: Readonly<Record<PestanaFicha, React.ReactNode>>;
}) {
  const [activa, setActiva] = useState<PestanaFicha>(inicial);
  const lista = useRef<HTMLDivElement>(null);
  const ids = pestanas.map((p) => p.id);

  // Al llegar después de guardar: el ancla, o la última pestaña tocada en esta ficha.
  useEffect(() => {
    if (pedidaEnLaUrl) return;
    const url = new URL(window.location.href);
    const porAncla = PESTANA_DEL_ANCLA[url.hash.slice(1)];
    let elegida: PestanaFicha | null = porAncla ?? null;
    if (!elegida && (url.searchParams.has("ok") || url.searchParams.has("error"))) {
      try {
        const guardada = window.sessionStorage.getItem(clave(negocioId));
        if (guardada && (ids as string[]).includes(guardada)) elegida = guardada as PestanaFicha;
      } catch {
        /* sin storage: queda la primera */
      }
    }
    if (url.searchParams.has("modulo")) elegida = "plan";
    // Se sincroniza con lo que dejó la action al volver (una sola vez, al montar).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (elegida && elegida !== inicial) setActiva(elegida);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sólo al llegar a la ficha
  }, []);

  const elegir = (id: PestanaFicha, foco = false) => {
    setActiva(id);
    try {
      window.sessionStorage.setItem(clave(negocioId), id);
    } catch {
      /* sin storage */
    }
    const url = new URL(window.location.href);
    url.searchParams.set("pestana", id);
    url.searchParams.delete("ok");
    url.searchParams.delete("error");
    url.hash = "";
    window.history.replaceState(window.history.state, "", url.toString());
    if (foco) lista.current?.querySelector<HTMLElement>(`#pestana-${id}`)?.focus();
  };

  // ←/→, Inicio y Fin entre pestañas (el patrón de pestañas de WAI-ARIA).
  const alTeclear = (e: React.KeyboardEvent) => {
    const i = ids.indexOf(activa);
    const destino =
      e.key === "ArrowRight" ? ids[(i + 1) % ids.length] : e.key === "ArrowLeft" ? ids[(i - 1 + ids.length) % ids.length] : e.key === "Home" ? ids[0] : e.key === "End" ? ids[ids.length - 1] : null;
    if (!destino) return;
    e.preventDefault();
    elegir(destino, true);
  };

  return (
    <div>
      <div ref={lista} role="tablist" aria-label="Partes de la ficha" data-ui="pestanas" data-con-raya onKeyDown={alTeclear} className="mb-6">
        {pestanas.map((p) => {
          const sel = p.id === activa;
          return (
            <a
              key={p.id}
              id={`pestana-${p.id}`}
              role="tab"
              href={`?pestana=${p.id}`}
              aria-selected={sel}
              aria-controls={`panel-${p.id}`}
              tabIndex={sel ? 0 : -1}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                e.preventDefault();
                elegir(p.id);
              }}
            >
              {p.etiqueta}
              {p.conteo !== undefined && p.conteo > 0 && (
                <span data-parte="conteo" className="tabular-nums text-warning">
                  {p.conteo}
                </span>
              )}
            </a>
          );
        })}
      </div>
      {pestanas.map((p) => (
        <section key={p.id} id={`panel-${p.id}`} role="tabpanel" aria-labelledby={`pestana-${p.id}`} hidden={p.id !== activa} className="space-y-8">
          {paneles[p.id]}
        </section>
      ))}
    </div>
  );
}
