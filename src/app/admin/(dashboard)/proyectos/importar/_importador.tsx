"use client";

// Subir → vista previa con chips → contadores → «Cargar N proyectos». El File se conserva para confirmar: el servidor
// vuelve a leerlo y a comparar la huella; nada se escribe con la vista previa.

import { useState, useTransition } from "react";
import { Badge, buttonClasses, type BadgeTone } from "@/components/ui";
import { confirmarImportacion, previsualizarImportacion, type VistaImportacion } from "@/lib/proyectos/acciones-importador";
import type { EstadoFila } from "@/lib/proyectos/importador-core";
import { tarjeta } from "../_vista";

const CHIP: Record<EstadoFila, { texto: string; tono: BadgeTone }> = {
  carga: { texto: "Se carga", tono: "success" },
  revisar: { texto: "Revisar", tono: "warning" },
  repetida: { texto: "Repetida", tono: "neutral" },
  yaEnBase: { texto: "Ya está en el ERP", tono: "info" },
  error: { texto: "No se carga", tono: "danger" },
};

export function Importador() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<VistaImportacion | null>(null);
  const [error, setError] = useState("");
  const [hecho, setHecho] = useState("");
  const [pendiente, empezar] = useTransition();

  const form = () => {
    const fd = new FormData();
    if (archivo) fd.set("archivo", archivo);
    return fd;
  };
  const previsualizar = () =>
    empezar(async () => {
      setError("");
      setHecho("");
      setVista(null);
      const r = await previsualizarImportacion(form());
      if (r.ok) setVista(r.vista);
      else setError(r.error);
    });
  const confirmar = () =>
    empezar(async () => {
      if (!vista) return;
      setError("");
      const r = await confirmarImportacion(form(), vista.huella);
      if (r.ok) {
        setVista(null);
        setHecho(r.cargados === 0 ? "No había proyectos nuevos para cargar: ya estaban en el ERP." : `Listo: se cargaron ${r.cargados} proyectos${r.clientesNuevos ? ` y ${r.clientesNuevos} clientes nuevos` : ""}.`);
      } else {
        setError(r.error);
        if (r.vista) setVista(r.vista);
      }
    });

  const c = vista?.conteo;
  return (
    <>
      <section className={tarjeta} aria-label="Subir planilla">
        <p className="mb-3 text-sm text-muted">Descargá la planilla de Google Sheets como Microsoft Excel (.xlsx) y subila. Primero vas a ver qué se carga; nada se guarda hasta que confirmes.</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium text-strong">
            Planilla
            <input
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="mt-1 block min-h-11 text-sm"
              onChange={(e) => {
                setArchivo(e.target.files?.[0] ?? null);
                setVista(null);
                setHecho("");
                setError("");
              }}
            />
          </label>
          <button type="button" disabled={!archivo || pendiente} onClick={previsualizar} className={buttonClasses("outline", "md")}>
            {pendiente && !vista ? "Leyendo…" : "Ver qué se carga"}
          </button>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
        {hecho && <p role="status" className="mt-3 text-sm font-medium text-strong">{hecho}</p>}
      </section>

      {vista && c && (
        <section className={tarjeta} aria-label="Vista previa">
          <h2 className="mb-2 font-semibold text-strong">Vista previa</h2>
          <ul className="mb-3 flex flex-wrap gap-2 text-sm" aria-label="Contadores">
            <li><Badge tone="success">{c.seCargan} se cargan</Badge></li>
            <li><Badge tone="warning">{c.revisar} para revisar</Badge></li>
            <li><Badge tone="neutral">{c.repetidas} repetidas</Badge></li>
            <li><Badge tone="info">{c.yaEnBase} ya están</Badge></li>
            <li><Badge tone="danger">{c.noSeCargan} no se cargan</Badge></li>
            <li><Badge tone="accent">{c.clientesNuevos} clientes nuevos</Badge></li>
          </ul>
          {vista.avisosLibro.map((t) => <p key={t} className="text-sm text-muted">{t}</p>)}
          {vista.avisos.filter((x) => x.fila === 0).map((x) => <p key={x.hoja} className="text-sm text-muted">Pestaña «{x.hoja}»: {x.motivo}</p>)}
          <div className="mt-2 max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-1 pr-2 text-left font-medium">Pestaña · fila</th>
                  <th className="px-2 text-left font-medium">Cliente</th>
                  <th className="px-2 text-left font-medium">Proyecto</th>
                  <th className="px-2 text-left font-medium">Etapa</th>
                  <th className="px-2 text-left font-medium">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {vista.filas.map((f) => (
                  <tr key={`${f.hoja}:${f.fila}`} className="border-t border-line align-top">
                    <td className="py-1 pr-2 text-muted">{f.hoja} · {f.fila}</td>
                    <td className="px-2 text-strong">{f.cliente}</td>
                    <td className="px-2 text-strong">{f.proyecto}</td>
                    <td className="px-2">{f.etapa}</td>
                    <td className="px-2">
                      <Badge tone={CHIP[f.estado].tono}>{CHIP[f.estado].texto}</Badge>
                      {f.motivo && <p className="mt-1 text-xs text-muted">{f.motivo}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <button type="button" disabled={pendiente || c.seCargan === 0} onClick={confirmar} className={buttonClasses("solid", "md")}>
              {pendiente ? "Cargando…" : `Cargar ${c.seCargan} proyectos`}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
