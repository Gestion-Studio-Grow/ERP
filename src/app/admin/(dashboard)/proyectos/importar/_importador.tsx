"use client";

// El importador en dos pasos: previsualizar (sólo lee) y confirmar (escribe lo previsualizado, con la misma huella).

import { useState } from "react";
import { buttonClasses, cn } from "@/components/ui";
import { confirmarImportacion, previsualizarImportacion, type ResultadoPrevia } from "@/lib/proyectos/acciones-importar";
import { etapaLabel } from "@/lib/proyectos/core";

type Previa = Extract<ResultadoPrevia, { ok: true }>;

const ESTADO: Record<string, { texto: string; clase: string }> = {
  nueva: { texto: "Entra", clase: "text-strong" },
  repetida: { texto: "Repetida", clase: "text-muted" },
  existe: { texto: "Ya existe", clase: "text-muted" },
  error: { texto: "Con error", clase: "text-danger" },
};

export function Importador() {
  const [csv, setCsv] = useState("");
  const [archivo, setArchivo] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function correr<T>(fn: () => Promise<T>): Promise<T | null> {
    setOcupado(true);
    setError(null);
    try {
      return await fn();
    } catch {
      setError("No se pudo completar. Revisá la conexión y probá de nuevo.");
      return null;
    } finally {
      setOcupado(false);
    }
  }

  async function previsualizar() {
    setHecho(null);
    setPrevia(null);
    const fd = new FormData();
    fd.set("csv", csv);
    const r = await correr(() => previsualizarImportacion(fd));
    if (!r) return;
    if (!r.ok) return setError(r.error);
    setPrevia(r);
  }

  async function confirmar() {
    if (!previa) return;
    const fd = new FormData();
    fd.set("csv", csv);
    fd.set("huella", previa.huella);
    fd.set("confirmo", "si");
    const r = await correr(() => confirmarImportacion(fd));
    if (!r) return;
    if (!r.ok) return setError(r.error);
    setPrevia(null);
    setHecho(`Listo: ${r.creados} proyecto${r.creados === 1 ? "" : "s"} nuevo${r.creados === 1 ? "" : "s"}; ${r.salteados} fila${r.salteados === 1 ? "" : "s"} sin importar.`);
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm font-medium text-strong">
          Archivo CSV
          <input
            type="file"
            accept=".csv,text/csv"
            className="min-h-11 text-sm"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              setPrevia(null);
              setHecho(null);
              setArchivo(f?.name ?? "");
              setCsv(f ? await f.text() : "");
            }}
          />
        </label>
        <button type="button" disabled={!csv || ocupado} onClick={previsualizar} className={buttonClasses("outline", "md")}>
          Previsualizar
        </button>
      </div>

      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
      {hecho && <p role="status" className="text-sm font-medium text-strong">{hecho}</p>}

      {previa && (
        <section aria-labelledby="titulo-previa" className="grid gap-3">
          <h2 id="titulo-previa" className="font-semibold text-strong">Previsualización de {archivo || "el archivo"}</h2>
          <p className="text-sm">
            Entran <strong>{previa.resumen.nueva}</strong> · repetidas en el archivo {previa.resumen.repetida} · ya existen {previa.resumen.existe} · con error {previa.resumen.error}
          </p>
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Filas del archivo y qué pasa con cada una</caption>
              <thead className="bg-surface text-xs text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2">Línea</th>
                  <th scope="col" className="px-3 py-2">Qué pasa</th>
                  <th scope="col" className="px-3 py-2">Cliente</th>
                  <th scope="col" className="px-3 py-2">Proyecto</th>
                  <th scope="col" className="px-3 py-2">Productor · comercial</th>
                  <th scope="col" className="px-3 py-2">Etapa</th>
                  <th scope="col" className="px-3 py-2">Fecha del evento</th>
                </tr>
              </thead>
              <tbody>
                {previa.filas.map((f) => (
                  <tr key={f.linea} className="border-t border-line align-top">
                    <td className="px-3 py-2 tabular-nums">{f.linea}</td>
                    <td className={cn("px-3 py-2 font-medium", ESTADO[f.estado].clase)}>
                      {ESTADO[f.estado].texto}
                      {f.motivo && <span className="block text-xs font-normal">{f.motivo}</span>}
                      {f.avisos.map((x) => <span key={x} className="block text-xs font-normal text-muted">{x}</span>)}
                    </td>
                    <td className="px-3 py-2">{f.cliente}</td>
                    <td className="px-3 py-2">{f.proyecto}</td>
                    <td className="px-3 py-2">{[f.productor, f.comercial].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="px-3 py-2">{f.motivoPerdida ? "Perdido" : etapaLabel(f.etapa, "ARQUITECTURA")}</td>
                    <td className="px-3 py-2">{f.fecha.fecha ? f.fecha.fecha.split("-").reverse().join("/") : f.fecha.texto ? `A confirmar: ${f.fecha.texto}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={ocupado || previa.resumen.nueva === 0} onClick={confirmar} className={buttonClasses("solid", "md")}>
              Confirmar e importar {previa.resumen.nueva} proyecto{previa.resumen.nueva === 1 ? "" : "s"}
            </button>
            <button type="button" disabled={ocupado} onClick={() => setPrevia(null)} className={buttonClasses("outline", "md")}>
              Cancelar
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
