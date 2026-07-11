"use client";

// Vista previa del mapeo de columnas — LA experiencia diferencial del módulo.
// Cuando el detector de columnas del plugin no llega a confianza 0.8, acá se
// muestran las primeras filas del extracto con un select por columna
// (precargado con lo detectado + su confianza) para que el dueño confirme o
// corrija en criollo, sin planillas ni soporte.
//
// Las filas de muestra se parsean EN EL NAVEGADOR con los mismos parsers del
// plugin (parser/csv, parser/xlsx — funciones puras): lo que se ve acá es
// exactamente lo que el server interpretó. Si el parseo local fallara, la
// confirmación sigue andando solo con los selects (sin muestra).

import { useMemo, useState } from "react";
import { Badge, Button, Select } from "@/components/ui";
import type { MapeoColumnas } from "@/plugins/bancos";
import { celdaATexto } from "./helpers";

type CampoUi =
  | "fecha"
  | "descripcion"
  | "debito"
  | "credito"
  | "importe"
  | "saldo"
  | "referencia"
  | "contraparte"
  | "ignorar";

const OPCIONES: { value: CampoUi; label: string }[] = [
  { value: "fecha", label: "Fecha" },
  { value: "descripcion", label: "Descripción" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
  { value: "importe", label: "Importe (con signo)" },
  { value: "saldo", label: "Saldo (se ignora)" },
  { value: "referencia", label: "Referencia" },
  { value: "contraparte", label: "Contraparte" },
  { value: "ignorar", label: "Ignorar esta columna" },
];

const CAMPOS_UNICOS: CampoUi[] = [
  "fecha",
  "descripcion",
  "debito",
  "credito",
  "importe",
  "saldo",
  "referencia",
  "contraparte",
];

/** Asignación inicial columna→campo a partir del mapeo detectado por el plugin. */
function asignacionInicial(mapeo: MapeoColumnas, cantidadColumnas: number): Record<number, CampoUi> {
  const asig: Record<number, CampoUi> = {};
  for (let i = 0; i < cantidadColumnas; i++) asig[i] = "ignorar";
  const c = mapeo.columnas;
  const set = (idx: number | undefined, campo: CampoUi) => {
    if (idx != null && idx >= 0 && idx < cantidadColumnas) asig[idx] = campo;
  };
  set(c.fecha, "fecha");
  set(c.descripcion, "descripcion");
  set(c.debito, "debito");
  set(c.credito, "credito");
  set(c.importe, "importe");
  set(c.saldo, "saldo");
  set(c.referencia, "referencia");
  set(c.contraparte, "contraparte");
  return asig;
}

export default function MapeoPreview({
  mapeo,
  matriz,
  confirmando,
  onConfirmar,
}: {
  mapeo: MapeoColumnas;
  /** Matriz cruda parseada en el navegador, o null si no se pudo (la confirmación sigue). */
  matriz: unknown[][] | null;
  confirmando: boolean;
  onConfirmar: (mapeoCorregido: MapeoColumnas) => void;
}) {
  const filaHeaders = mapeo.filaHeaders;
  const headers: unknown[] = matriz?.[filaHeaders] ?? [];
  const cantidadColumnas = Math.max(
    headers.length,
    ...Object.values(mapeo.columnas).map((v) => (typeof v === "number" ? v + 1 : 0)),
  );
  const filasMuestra = useMemo(
    () => (matriz ? matriz.slice(filaHeaders + 1, filaHeaders + 6) : []),
    [matriz, filaHeaders],
  );

  const [asignaciones, setAsignaciones] = useState<Record<number, CampoUi>>(() =>
    asignacionInicial(mapeo, cantidadColumnas),
  );

  function asignar(columna: number, campo: CampoUi) {
    setAsignaciones((prev) => {
      const next = { ...prev };
      // Un campo (salvo "ignorar") vive en UNA sola columna: si ya estaba en
      // otra, la otra pasa a "ignorar" — evita mapeos ambiguos sin regaños.
      if (campo !== "ignorar" && CAMPOS_UNICOS.includes(campo)) {
        for (const [k, v] of Object.entries(next)) {
          if (v === campo && Number(k) !== columna) next[Number(k)] = "ignorar";
        }
      }
      next[columna] = campo;
      return next;
    });
  }

  const tieneFecha = Object.values(asignaciones).includes("fecha");
  const tieneDescripcion = Object.values(asignaciones).includes("descripcion");
  const tieneImporte =
    Object.values(asignaciones).includes("importe") ||
    Object.values(asignaciones).includes("debito") ||
    Object.values(asignaciones).includes("credito");
  const valido = tieneFecha && tieneDescripcion && tieneImporte;

  const faltantes = [
    !tieneFecha && "la fecha",
    !tieneDescripcion && "la descripción",
    !tieneImporte && "el importe (o débito/crédito)",
  ].filter(Boolean) as string[];

  function confirmar() {
    const columnas: MapeoColumnas["columnas"] = { fecha: -1, descripcion: -1 };
    for (const [k, campo] of Object.entries(asignaciones)) {
      const idx = Number(k);
      if (campo === "fecha") columnas.fecha = idx;
      else if (campo === "descripcion") columnas.descripcion = idx;
      else if (campo === "debito") columnas.debito = idx;
      else if (campo === "credito") columnas.credito = idx;
      else if (campo === "importe") columnas.importe = idx;
      else if (campo === "saldo") columnas.saldo = idx;
      else if (campo === "referencia") columnas.referencia = idx;
      else if (campo === "contraparte") columnas.contraparte = idx;
    }
    onConfirmar({
      ...mapeo,
      columnas,
      esquemaImporte: columnas.importe != null ? "importe-unico" : "debito-credito",
    });
  }

  const pctConfianza = Math.round(mapeo.confianza * 100);

  return (
    <div className="rounded-lg border border-line bg-surface-raised p-4 sm:p-5">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-strong">Revisá cómo leímos el extracto</h3>
        <Badge tone={pctConfianza >= 80 ? "success" : "warning"} dot>
          Confianza {pctConfianza}%
        </Badge>
      </div>
      <p className="mb-4 text-sm text-muted">
        Detectamos las columnas automáticamente — revisá que cada una diga lo que corresponde y
        confirmá. Si alguna quedó mal, elegí la opción correcta en el desplegable.
      </p>

      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <caption className="sr-only">
            Vista previa del extracto con la asignación de columnas detectada
          </caption>
          <thead>
            <tr className="border-b border-line bg-surface-sunken">
              {Array.from({ length: cantidadColumnas }, (_, i) => {
                const campoAsignado = asignaciones[i] ?? "ignorar";
                const confianzaCampo =
                  campoAsignado !== "ignorar"
                    ? mapeo.confianzaPorColumna[campoAsignado]
                    : undefined;
                const dudosa = confianzaCampo != null && confianzaCampo < 0.8;
                return (
                  <th key={i} scope="col" className="min-w-36 px-2 py-2 text-left font-normal align-top">
                    <label htmlFor={`mapeo-col-${i}`} className="mb-1 block truncate text-xs font-semibold uppercase tracking-wide text-muted">
                      {celdaATexto(headers[i]) || `Columna ${i + 1}`}
                    </label>
                    <Select
                      id={`mapeo-col-${i}`}
                      value={campoAsignado}
                      onChange={(e) => asignar(i, e.target.value as CampoUi)}
                      className={`h-9 text-xs ${dudosa ? "border-warning" : ""}`}
                    >
                      {OPCIONES.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                    {confianzaCampo != null && (
                      <span className={`mt-1 block text-[11px] font-normal normal-case tracking-normal tabular-nums ${dudosa ? "text-warning" : "text-faint"}`}>
                        {dudosa ? "Dudosa · " : "Detectada · "}
                        {Math.round(confianzaCampo * 100)}%
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filasMuestra.map((fila, f) => (
              <tr key={f} className="border-b border-line last:border-b-0">
                {Array.from({ length: cantidadColumnas }, (_, i) => (
                  <td key={i} className="max-w-56 truncate px-2 py-1.5 tabular-nums text-body">
                    {celdaATexto(fila[i])}
                  </td>
                ))}
              </tr>
            ))}
            {filasMuestra.length === 0 && (
              <tr>
                <td colSpan={cantidadColumnas} className="px-3 py-3 text-sm text-muted">
                  No pudimos mostrar las filas de muestra en el navegador, pero la asignación de
                  columnas de arriba sí se aplica al confirmar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!valido && (
        <p className="mt-3 text-sm text-danger" role="alert">
          Para procesar el extracto falta asignar {faltantes.join(", ")}.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={confirmar} disabled={!valido || confirmando}>
          {confirmando ? "Procesando de nuevo…" : "Confirmar mapeo"}
        </Button>
        <span className="text-xs text-muted">
          Al confirmar, el extracto se vuelve a procesar con estas columnas. No hace falta subirlo
          de nuevo.
        </span>
      </div>
    </div>
  );
}
