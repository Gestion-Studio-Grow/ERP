"use client";

// El tablero de proyectos: 4 etapas (las del parámetro del negocio) que agrupan los 10 estados, y la lista. Cada tarjeta dice
// su estado. Se arrastra a otra etapa (va al primer estado de esa etapa) o se elige el estado con su selector (celular y
// teclado). Si al pasar de etapa falta algo, se avisa con la lista; si la compuerta frena, sólo Dirección fuerza con motivo.

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { buttonClasses, cn, Dialogo } from "@/components/ui";
import { moverProyecto, type ResultadoMover } from "@/lib/proyectos/acciones-ficha";
import { etapaLabel, pesos } from "@/lib/proyectos/core";
import { agruparPorEtapa, destinoAlSoltar, etapaDelEstado, type EtapaParam } from "@/lib/proyectos/etapas-core";
import { PERDIDO, resumenPipeline } from "@/lib/proyectos/ficha-core";
import type { TarjetaProyecto } from "@/lib/proyectos/ficha.server";
import { campo, tarjeta } from "./_vista";

const nombreEstado = (c: string) => (c === PERDIDO ? "Perdido" : etapaLabel(c));

interface Frenado { id: string; destino: string; faltan: string[]; puedeForzar: boolean }

export function Pipeline({ tarjetas, etapas, vista, edita, conVenta }: { tarjetas: TarjetaProyecto[]; etapas: EtapaParam[]; vista: "tablero" | "lista"; edita: boolean; conVenta: boolean }) {
  const [filtro, setFiltro] = useState("");
  const [movidas, setMovidas] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [perdiendo, setPerdiendo] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [frenado, setFrenado] = useState<Frenado | null>(null);
  const [motivoForzar, setMotivoForzar] = useState("");
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

  const { columnas, perdidos } = useMemo(
    () => agruparPorEtapa(etapas, visibles.map((t) => ({ t, etapa: columnaDe(t) === PERDIDO ? t.etapa : columnaDe(t), perdido: columnaDe(t) === PERDIDO }))),
    // columnaDe depende de `movidas`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [etapas, visibles, movidas],
  );

  const enviar = (id: string, destino: string, extra?: { motivo?: string; forzar?: boolean; motivoForzar?: string }) => {
    setError(null);
    setAviso(null);
    setMovidas((m) => ({ ...m, [id]: destino }));
    iniciar(async () => {
      let r: ResultadoMover | null = null;
      try {
        r = await moverProyecto({ id, destino, ...extra });
      } catch {
        setError("No se pudo mover. Revisá la conexión y probá de nuevo.");
      }
      if (r && !r.ok) {
        if ("faltan" in r) setFrenado({ id, destino, faltan: r.faltan, puedeForzar: r.puedeForzar });
        else setError(r.error);
      }
      if (r?.ok && r.aviso) setAviso(r.aviso);
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
      <select value={columnaDe(t)} aria-label={`Estado de ${t.nombre}`} onChange={(e) => mover(t, e.target.value)} className={cn(campo, className)}>
        {etapas.map((e) => (
          <optgroup key={e.id} label={e.nombre}>
            {e.estados.map((s) => <option key={s} value={s}>{nombreEstado(s)}</option>)}
          </optgroup>
        ))}
        <option value={PERDIDO}>Perdido</option>
      </select>
    );

  const Tarjeta = ({ t }: { t: TarjetaProyecto }) => (
    <li
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
      <p className="mt-1.5 inline-block rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-medium text-strong">Estado: {nombreEstado(columnaDe(t))}</p>
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
  );

  const proyectoPerdiendo = tarjetas.find((t) => t.id === perdiendo);
  const proyectoFrenado = tarjetas.find((t) => t.id === frenado?.id);
  const etapaFrenada = frenado ? etapaDelEstado(etapas, frenado.destino)?.nombre ?? nombreEstado(frenado.destino) : "";

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <input value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar por nombre o cliente" placeholder="Filtrar por nombre o cliente" className={cn(campo, "sm:max-w-xs")} />
        <dl className="flex gap-5 text-sm">
          <div><dt className="text-xs text-muted">Por aprobar</dt><dd className="font-semibold text-strong tabular-nums">{abiertos}</dd></div>
          {conVenta && <div><dt className="text-xs text-muted">Venta por aprobar</dt><dd className="font-semibold text-strong tabular-nums">{pesos(valor)}</dd></div>}
        </dl>
      </div>
      {error && <p role="alert" className="mb-3 text-sm font-medium text-danger">{error}</p>}
      {aviso && (
        <div role="status" className="mb-3 flex flex-wrap items-start justify-between gap-2 rounded-xl border border-warning bg-warning-soft p-3 text-sm text-strong">
          <p className="min-w-0 flex-1">Pasó, con un aviso. {aviso}</p>
          <button type="button" className={buttonClasses("ghost", "sm")} onClick={() => setAviso(null)}>Entendido</button>
        </div>
      )}

      {vista === "tablero" ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {columnas.map(({ etapa, items }) => (
              <section
                key={etapa.id}
                aria-label={etapa.nombre}
                className={cn("min-w-0 rounded-2xl border bg-surface p-2", sobre === etapa.id ? "border-accent" : "border-line")}
                onDragOver={(e) => {
                  if (!edita) return;
                  e.preventDefault();
                  setSobre(etapa.id);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSobre(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setSobre(null);
                  const t = tarjetas.find((x) => x.id === e.dataTransfer.getData("text/plain"));
                  const destino = t && destinoAlSoltar(etapas, etapa.id, columnaDe(t) === PERDIDO ? "" : columnaDe(t));
                  if (t && destino) mover(t, destino);
                }}
              >
                <h2 className="mb-2 flex items-center justify-between px-1 text-sm font-semibold text-strong">
                  {etapa.nombre}
                  <span className="font-normal text-muted tabular-nums">{items.length}</span>
                </h2>
                <p className="mb-2 px-1 text-xs text-muted">{etapa.estados.map((s) => nombreEstado(s)).join(" · ")}</p>
                <ul className="grid min-h-16 gap-2">{items.map(({ t }) => <Tarjeta key={t.id} t={t} />)}</ul>
              </section>
            ))}
          </div>
          {perdidos.length > 0 && (
            <details className="mt-3 rounded-2xl border border-line bg-surface p-2">
              <summary className="min-h-11 cursor-pointer px-1 py-2 text-sm font-semibold text-strong">Perdidos ({perdidos.length})</summary>
              <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">{perdidos.map(({ t }) => <Tarjeta key={t.id} t={t} />)}</ul>
            </details>
          )}
        </>
      ) : (
        <>
          {/* En el celular, una tarjeta por proyecto: el estado y su selector siempre a la vista. */}
          <ul className="grid gap-2 md:hidden">
            {visibles.map((t) => (
              <li key={t.id} className={cn(tarjeta, "p-3")}>
                <Link href={`/admin/proyectos/${t.id}`} className="block font-medium text-strong underline">{t.nombre}</Link>
                <p className="text-sm">{[t.codigo, t.cliente, t.fecha].filter(Boolean).join(" · ")}</p>
                <p className="mt-1 flex justify-between gap-2 text-sm">
                  <span>{columnaDe(t) === PERDIDO ? "Perdido" : `${etapaDelEstado(etapas, columnaDe(t))?.nombre ?? ""} · ${nombreEstado(columnaDe(t))}`}</span>
                  <span className="font-medium text-strong tabular-nums">{t.ventaTexto}</span>
                </p>
                {selector(t, "mt-2")}
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
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
                  <th className="pr-2 font-medium">Etapa</th>
                  <th className="font-medium">Estado</th>
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
                    <td className="pr-2">{columnaDe(t) === PERDIDO ? "—" : etapaDelEstado(etapas, columnaDe(t))?.nombre}</td>
                    <td className="py-1 min-w-44">{edita ? selector(t) : nombreEstado(columnaDe(t))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visibles.length === 0 && <p className="py-3 text-sm text-muted">Nada coincide con ese filtro.</p>}
        </>
      )}

      <Dialogo
        abierto={!!frenado}
        onCerrar={() => setFrenado(null)}
        titulo={proyectoFrenado ? `No pasó a ${etapaFrenada}: ${proyectoFrenado.nombre}` : "No pasó de etapa"}
        descripcion="La compuerta de esta etapa frena el paso. Falta:"
        pie={
          <>
            <button type="button" className={buttonClasses("ghost", "md")} onClick={() => setFrenado(null)}>{frenado?.puedeForzar ? "Cancelar" : "Entendido"}</button>
            {frenado?.puedeForzar && (
              <button
                type="button"
                disabled={ocupado || !motivoForzar.trim()}
                className={buttonClasses("danger", "md")}
                onClick={() => {
                  if (frenado) enviar(frenado.id, frenado.destino, { forzar: true, motivoForzar });
                  setFrenado(null);
                  setMotivoForzar("");
                }}
              >
                Forzar el paso
              </button>
            )}
          </>
        }
      >
        <ul className="mb-3 grid list-disc gap-1 pl-5 text-sm text-strong">{frenado?.faltan.map((f) => <li key={f}>{f}</li>)}</ul>
        {frenado?.puedeForzar ? (
          <label className="grid gap-1 text-sm font-medium text-strong">
            Por qué se fuerza (queda en el historial)
            <textarea value={motivoForzar} onChange={(e) => setMotivoForzar(e.target.value)} rows={3} maxLength={300} className="w-full rounded-lg border border-line bg-surface p-3 text-sm text-strong" />
          </label>
        ) : (
          <p className="text-sm text-muted">Sólo Dirección puede forzar el paso.</p>
        )}
      </Dialogo>

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
                if (perdiendo) enviar(perdiendo, PERDIDO, { motivo });
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
