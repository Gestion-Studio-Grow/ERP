"use client";

// CRM COMERCIAL · el tablero del embudo (GSG-CRM-011, diseño §4.2).
//
// Mover = UNA acción del servidor con la versión leída (control optimista E2). Se puede con el menú «Mover»
// (teclado y celular) o arrastrando la tarjeta (arrastre nativo del navegador, sin librerías). La tarjeta se
// mueve al toque; si el servidor rechaza, vuelve a la columna que dice el servidor y se muestra el motivo tal
// cual. Los pases que piden datos (motivo, fecha, comercial) abren el formulario en la tarjeta: no se mueve
// hasta que el servidor lo acepta. Idea tomada (no código) de la separación entre la lógica de mover y el
// arrastre que tiene NextCRM (pericia, punto 3).

import Link from "next/link";
import { useRef, useState } from "react";
import { Badge, Select } from "@/components/ui";
import { aplicarPase } from "@/lib/crm-comercial/acciones";
import type { OpcionPase } from "../crm-core";
import { Resultado } from "../Avisos";
import { FormularioPase, type Comercial } from "../FormularioPase";
import { useAccion } from "../useAccion";

export interface Tarjeta {
  id: string;
  etapa: string;
  version: number;
  titulo: string;
  tipo: string;
  proximoPaso: string | null;
  proximoPasoTexto: string | null;
  vencido: boolean;
  diasEnEtapa: number | null;
  diasSinMovimiento: number | null;
  sinSeguimiento: boolean;
  puntaje: number | null;
  monto: string | null;
  ponderado: string | null;
  pasePropuesto: string | null;
  opciones: OpcionPase[];
}
export interface Columna {
  etapa: string;
  etiqueta: string;
  ponderado: string;
  sinMonto: number;
}

export function Tablero({ columnas, tarjetas, comerciales }: { columnas: readonly Columna[]; tarjetas: readonly Tarjeta[]; comerciales: readonly Comercial[] }) {
  const { correr, pendiente, motivo, hecho } = useAccion();
  // Movida optimista: vale mientras el servidor no devolvió otra versión de la tarjeta.
  const [movidas, setMovidas] = useState<Record<string, { etapa: string; version: number }>>({});
  const [abierta, setAbierta] = useState<{ id: string; destino: string } | null>(null);
  const [arrastrada, setArrastrada] = useState<string | null>(null);

  const etapaDe = (t: Tarjeta) => (movidas[t.id] && movidas[t.id].version === t.version ? movidas[t.id].etapa : t.etapa);
  const cuantas = (etapa: string) => tarjetas.filter((t) => etapaDe(t) === etapa).length;
  // En el celular se ve UNA etapa por vez (las diez apiladas medían ~5900 px): arranca en la primera con tarjetas.
  const [enVista, setEnVista] = useState<string>(() => columnas.find((c) => tarjetas.some((t) => t.etapa === c.etapa))?.etapa ?? columnas[0]?.etapa ?? "");
  const tablero = useRef<HTMLDivElement>(null);
  function irA(etapa: string) {
    setEnVista(etapa);
    tablero.current?.querySelector(`#col-${CSS.escape(etapa)}`)?.closest("section")?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  }
  const deshacer = (id: string) => setMovidas((m) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== id)));

  function mover(t: Tarjeta, destino: string) {
    const op = t.opciones.find((o) => o.destino === destino);
    if (!op) return;
    if (op.modo === "proponer" || op.pide.length > 0) {
      setAbierta({ id: t.id, destino });
      return;
    }
    setMovidas((m) => ({ ...m, [t.id]: { etapa: destino, version: t.version } }));
    correr(() => aplicarPase(t.id, destino, { version: t.version }), { listo: `«${t.titulo}» pasó a «${op.etiqueta}».`, alFallar: () => deshacer(t.id) });
  }

  return (
    <div className="min-w-0">
      <div aria-live="polite">
        <Resultado motivo={motivo} hecho={hecho} />
      </div>
      <div className="mt-3 lg:hidden">
        <label htmlFor="etapa-en-vista" className="mb-1 block text-sm font-medium text-strong">Etapa</label>
        <Select id="etapa-en-vista" value={enVista} onChange={(e) => setEnVista(e.target.value)}>
          {columnas.map((c) => (
            <option key={c.etapa} value={c.etapa}>
              {c.etiqueta} ({cuantas(c.etapa)})
            </option>
          ))}
        </Select>
      </div>
      <nav aria-label="Ir a una etapa" className="mt-3 hidden flex-wrap gap-2 lg:flex">
        {columnas.map((c) => (
          <button key={c.etapa} type="button" onClick={() => irA(c.etapa)} className="rounded-full border border-line px-3 py-1 text-xs text-body hover:border-accent focus-visible:outline-2 focus-visible:outline-focus">
            {c.etiqueta} <span className="tabular-nums text-muted">{cuantas(c.etapa)}</span>
          </button>
        ))}
      </nav>
      {columnas.length > 4 && <p className="mt-2 hidden text-xs text-muted lg:block">Se ven 4 de {columnas.length} etapas: deslizá el tablero de costado o elegí una etapa arriba.</p>}
      {/* En la PC entran 4 columnas justas (ninguna queda cortada) y el scroll de costado frena en el borde de cada una. */}
      <div ref={tablero} className="mt-3 overflow-x-auto pb-2 lg:snap-x lg:snap-mandatory">
        <div className="grid grid-cols-1 gap-4 lg:auto-cols-[calc((100%-3rem)/4)] lg:grid-flow-col lg:grid-cols-none">
          {columnas.map((c) => {
            const lista = tarjetas.filter((t) => etapaDe(t) === c.etapa);
            const recibe = arrastrada ? tarjetas.find((t) => t.id === arrastrada)?.opciones.some((o) => o.destino === c.etapa) : false;
            return (
              <section
                key={c.etapa}
                aria-labelledby={`col-${c.etapa}`}
                className={`${c.etapa === enVista ? "flex" : "hidden"} min-w-0 snap-start flex-col rounded-lg border bg-surface-sunken p-2 lg:flex ${recibe ? "border-accent" : "border-line"}`}
                onDragOver={(e) => {
                  if (recibe) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain");
                  const t = tarjetas.find((x) => x.id === id);
                  setArrastrada(null);
                  if (t && etapaDe(t) !== c.etapa) mover(t, c.etapa);
                }}
              >
                <header className="px-1 pb-2">
                  <h2 id={`col-${c.etapa}`} className="flex items-baseline justify-between gap-2 text-sm font-semibold text-strong">
                    <span>{c.etiqueta}</span>
                    <span className="tabular-nums text-muted">{lista.length}</span>
                  </h2>
                  <p className="text-xs text-muted">
                    Ponderado: <span className="tabular-nums">{c.ponderado}</span>
                    {c.sinMonto > 0 && ` · ${c.sinMonto} sin monto`}
                  </p>
                </header>
                {lista.length === 0 ? (
                  <p className="px-1 pb-2 text-xs text-muted">Nada en esta etapa.</p>
                ) : (
                  <ul className="grid gap-2">
                    {lista.map((t) => (
                      <li key={t.id}>
                        <article
                          draggable={t.opciones.length > 0 && !pendiente}
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", t.id);
                            e.dataTransfer.effectAllowed = "move";
                            setArrastrada(t.id);
                          }}
                          onDragEnd={() => setArrastrada(null)}
                          className="rounded-md border border-line bg-surface-raised p-3 text-sm"
                          aria-labelledby={`t-${t.id}`}
                        >
                          <Link id={`t-${t.id}`} href={`/admin/crm/${t.id}`} className="block break-words font-medium text-strong underline-offset-2 hover:underline">
                            {t.titulo}
                          </Link>
                          <p className="mt-1 flex flex-wrap gap-1">
                            <Badge tone="neutral">{t.tipo === "CONSULTA" ? "Consulta" : "Prospecto"}</Badge>
                            {t.puntaje != null && <Badge tone={t.puntaje >= 80 ? "success" : "neutral"}>Puntaje {t.puntaje}</Badge>}
                            {t.pasePropuesto && <Badge tone="warning">Propuesta: {t.pasePropuesto}</Badge>}
                          </p>
                          <p className={`mt-2 break-words ${t.vencido ? "text-danger" : "text-body"}`}>
                            <span className="text-muted">Próximo paso: </span>
                            {t.proximoPaso ?? "sin cargar"}
                            {t.proximoPasoTexto && ` · ${t.vencido ? "venció el" : "para el"} ${t.proximoPasoTexto}`}
                          </p>
                          <p className={`mt-1 text-xs ${t.sinSeguimiento ? "text-warning" : "text-muted"}`}>
                            {t.diasSinMovimiento == null ? "Sin movimiento registrado" : t.diasSinMovimiento === 0 ? "Se movió hoy" : `${t.diasSinMovimiento} ${t.diasSinMovimiento === 1 ? "día" : "días"} sin movimiento`}
                            {t.diasEnEtapa != null && ` · ${t.diasEnEtapa} en la etapa`}
                          </p>
                          {(t.monto || t.ponderado) && (
                            <p className="mt-1 text-xs tabular-nums text-muted">
                              {t.monto ?? "Sin monto"}
                              {t.ponderado && ` · ponderado ${t.ponderado}`}
                            </p>
                          )}
                          {t.opciones.length > 0 && (
                            <details className="mt-2">
                              <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-accent sm:min-h-0">Mover</summary>
                              <ul className="mt-1 grid gap-1">
                                {t.opciones.map((o) => (
                                  <li key={o.destino}>
                                    <button
                                      type="button"
                                      disabled={pendiente}
                                      onClick={() => mover(t, o.destino)}
                                      className="w-full rounded-md px-2 py-2 text-left text-sm hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50"
                                    >
                                      {o.modo === "aplicar" ? "A" : "Proponer"} «{o.etiqueta}»
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                          {abierta?.id === t.id && t.opciones.some((o) => o.destino === abierta.destino) && (
                            <div className="mt-2">
                              <FormularioPase
                                opcion={t.opciones.find((o) => o.destino === abierta.destino) as OpcionPase}
                                oportunidadId={t.id}
                                version={t.version}
                                comerciales={comerciales}
                                alTerminar={() => setAbierta(null)}
                                alCancelar={() => setAbierta(null)}
                              />
                            </div>
                          )}
                        </article>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
