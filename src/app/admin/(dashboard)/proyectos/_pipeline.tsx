"use client";

// El pipeline: tablero con tarjetas que se arrastran entre columnas, y lista. En el celular, y con el teclado, la tarjeta se mueve con
// su selector. Se ve el movimiento enseguida; si el servidor lo rechaza, la tarjeta vuelve y se dice por qué.

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { buttonClasses, cn, Dialogo } from "@/components/ui";
import { moverProyecto } from "@/lib/proyectos/acciones-ficha";
import { etapaLabel, pesos } from "@/lib/proyectos/core";
import { COLUMNAS_PIPELINE, PERDIDO, resumenPipeline } from "@/lib/proyectos/ficha-core";
import type { TarjetaProyecto } from "@/lib/proyectos/ficha.server";
import { campo, tarjeta } from "./_vista";

const nombreColumna = (c: string) => (c === PERDIDO ? "Perdido" : etapaLabel(c));

export function Pipeline({ tarjetas, vista, edita }: { tarjetas: TarjetaProyecto[]; vista: "kanban" | "lista"; edita: boolean }) {
  const [filtro, setFiltro] = useState("");
  const [movidas, setMovidas] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [perdiendo, setPerdiendo] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [ocupado, iniciar] = useTransition();

  const columnaDe = (t: TarjetaProyecto) => movidas[t.id] ?? t.columna;

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return q ? tarjetas.filter((t) => t.nombre.toLowerCase().includes(q) || t.cliente.toLowerCase().includes(q)) : tarjetas;
  }, [filtro, tarjetas]);

  const { abiertos, valor } = useMemo(
    () => resumenPipeline(visibles.map((t) => ({ etapa: movidas[t.id] && movidas[t.id] !== PERDIDO ? movidas[t.id] : t.etapa, venta: t.venta, perdido: (movidas[t.id] ?? t.columna) === PERDIDO }))),
    [visibles, movidas],
  );

  const enviar = (id: string, destino: string, motivoPerdida?: string) => {
    setError(null);
    setMovidas((m) => ({ ...m, [id]: destino }));
    iniciar(async () => {
      let problema: string | null = null;
      try {
        const r = await moverProyecto({ id, destino, motivo: motivoPerdida });
        if (!r.ok) problema = r.error;
      } catch {
        problema = "No se pudo mover. Revisá la conexión y probá de nuevo.";
      }
      if (problema) setError(problema);
      setMovidas((m) => {
        const resto = { ...m };
        delete resto[id];
        return resto;
      });
    });
  };

  const mover = (t: TarjetaProyecto, destino: string) => {
    if (destino === columnaDe(t)) return;
    if (destino === PERDIDO) {
      setMotivo("");
      setPerdiendo(t.id);
      return;
    }
    enviar(t.id, destino);
  };

  const selector = (t: TarjetaProyecto, className?: string) =>
    edita && (
      <select value={columnaDe(t)} aria-label={`Mover ${t.nombre}`} onChange={(e) => mover(t, e.target.value)} className={cn(campo, className)}>
        {COLUMNAS_PIPELINE.map((c) => <option key={c} value={c}>{nombreColumna(c)}</option>)}
      </select>
    );

  const proyectoPerdiendo = tarjetas.find((t) => t.id === perdiendo);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <input value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar por nombre o cliente" placeholder="Filtrar por nombre o cliente" className={cn(campo, "sm:max-w-xs")} />
        <dl className="flex gap-5 text-sm">
          <div><dt className="text-xs text-muted">Leads abiertos</dt><dd className="font-semibold text-strong tabular-nums">{abiertos}</dd></div>
          <div><dt className="text-xs text-muted">Pipeline</dt><dd className="font-semibold text-strong tabular-nums">{pesos(valor)}</dd></div>
        </dl>
      </div>
      {error && <p role="alert" className="mb-3 text-sm font-medium text-danger">{error}</p>}

      {vista === "kanban" ? (
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-3">
          {COLUMNAS_PIPELINE.map((c) => {
            const lista = visibles.filter((t) => columnaDe(t) === c);
            return (
              <section
                key={c}
                aria-label={nombreColumna(c)}
                className={cn("w-72 shrink-0 rounded-2xl border bg-surface p-2", sobre === c ? "border-accent" : "border-line")}
                onDragOver={(e) => {
                  if (!edita) return;
                  e.preventDefault();
                  setSobre(c);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSobre(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setSobre(null);
                  const t = tarjetas.find((x) => x.id === e.dataTransfer.getData("text/plain"));
                  if (t) mover(t, c);
                }}
              >
                <h2 className="mb-2 flex items-center justify-between px-1 text-sm font-semibold text-strong">
                  {nombreColumna(c)}
                  <span className="font-normal text-muted tabular-nums">{lista.length}</span>
                </h2>
                <ul className="grid min-h-16 gap-2">
                  {lista.map((t) => (
                    <li
                      key={t.id}
                      draggable={edita}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", t.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className={cn(tarjeta, "group p-3", edita && "cursor-grab active:cursor-grabbing")}
                    >
                      <Link href={`/admin/proyectos/${t.id}`} className="block hover:underline">
                        <p className="text-xs text-muted">{[t.codigo, t.ciudad].filter(Boolean).join(" · ")}</p>
                        <p className="mt-0.5 font-semibold text-strong">{t.nombre}</p>
                        <p className="text-sm">{[t.cliente, t.tipo].filter(Boolean).join(" · ")}</p>
                      </Link>
                      {t.columna === PERDIDO && t.motivoPerdida && <p className="mt-1 text-xs text-danger">{t.motivoPerdida}</p>}
                      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                        <span className="flex gap-1">
                          {t.iniciales.slice(0, 4).map((i, n) => <span key={n} className="grid size-7 place-items-center rounded-full border border-line bg-surface font-semibold text-strong">{i}</span>)}
                        </span>
                        <span className="text-right">
                          <span className="block font-semibold text-strong tabular-nums">{t.ventaTexto}</span>
                          <span className="text-muted">{t.fecha}</span>
                        </span>
                      </div>
                      {/* En la PC aparece al pasar o al llegar con el teclado; en el celular está siempre. */}
                      {selector(t, "mt-2 md:opacity-0 md:focus:opacity-100 md:group-hover:opacity-100")}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1 pr-2 font-medium">Código</th>
                <th className="pr-2 font-medium">Evento</th>
                <th className="pr-2 font-medium">Cliente</th>
                <th className="pr-2 font-medium">Tipo</th>
                <th className="pr-2 font-medium">Ciudad</th>
                <th className="pr-2 font-medium">Equipo</th>
                <th className="pr-2 font-medium">Fecha</th>
                <th className="pr-2 text-right font-medium">Venta</th>
                <th className="font-medium">Etapa</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((t) => (
                <tr key={t.id} className="border-t border-line">
                  <td className="py-1 pr-2 whitespace-nowrap text-muted">{t.codigo}</td>
                  <td className="pr-2"><Link href={`/admin/proyectos/${t.id}`} className="flex min-h-11 items-center font-medium text-strong underline">{t.nombre}</Link></td>
                  <td className="pr-2">{t.cliente}</td>
                  <td className="pr-2">{t.tipo ?? "—"}</td>
                  <td className="pr-2">{t.ciudad ?? "—"}</td>
                  <td className="pr-2">{t.iniciales.join(", ") || "—"}</td>
                  <td className="pr-2 whitespace-nowrap">{t.fecha}</td>
                  <td className="pr-2 text-right font-medium text-strong tabular-nums">{t.ventaTexto}</td>
                  <td className="py-1 min-w-44">{edita ? selector(t) : nombreColumna(columnaDe(t))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibles.length === 0 && <p className="py-3 text-sm text-muted">Nada coincide con ese filtro.</p>}
        </div>
      )}

      <Dialogo
        abierto={!!perdiendo}
        onCerrar={() => setPerdiendo(null)}
        titulo={proyectoPerdiendo ? `Marcar perdido: ${proyectoPerdiendo.nombre}` : "Marcar perdido"}
        descripcion="Los cobros y pagos pendientes salen del cashflow. Se puede reabrir."
        pie={
          <>
            <button type="button" className={buttonClasses("ghost", "md")} onClick={() => setPerdiendo(null)}>Cancelar</button>
            <button
              type="button"
              disabled={ocupado || !motivo.trim()}
              className={buttonClasses("danger", "md")}
              onClick={() => {
                if (perdiendo) enviar(perdiendo, PERDIDO, motivo);
                setPerdiendo(null);
              }}
            >
              Marcar perdido
            </button>
          </>
        }
      >
        <label className="grid gap-1 text-sm font-medium text-strong">
          Motivo
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={300} className="w-full rounded-lg border border-line bg-surface p-3 text-sm text-strong" />
        </label>
      </Dialogo>
    </>
  );
}
