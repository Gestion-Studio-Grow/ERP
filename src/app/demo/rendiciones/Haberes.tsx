"use client";

// Tesorería · archivo para Haberes (LCT arts. 105-106; CCT 40/89).
//
// Lo arma el motor (`resumenParaHaberes`): por persona, lo anticipado, lo rendido con y sin
// comprobante, el saldo no rendido con su antigüedad y los viajes del mes. Los reintegros sin
// comprobante y el anticipo que no se rinde son remuneración: por eso van a la liquidación.

import { useMemo } from "react";
import { Badge, DataTable, fmtNumberAR, type DataTableColumn } from "@/components/ui";
import { formatearFecha, formatearPesos, nombrePeriodo, resumenParaHaberes, type LineaHaberes } from "@/lib/rendiciones";
import { escenarioDemo as E } from "./escenario";
import { useDemo } from "./contexto";
import { plural } from "./derivados";
import { aCsv, importeCsv } from "@/plugins/sap";
import { nombreDemo } from "./descargas";
import { BotonDescargar } from "./piezas";

const importe = (c: number) => <span className="tabular-nums">{formatearPesos(c)}</span>;

const COLUMNAS: DataTableColumn<LineaHaberes>[] = [
  {
    key: "persona",
    header: "Persona",
    cell: (l) => (
      <span>
        <span className="block font-medium text-strong">{l.nombre}</span>
        <span className="block text-xs text-muted">Legajo {l.legajo}</span>
      </span>
    ),
  },
  { key: "anticipado", header: "Anticipado", align: "right", cell: (l) => importe(l.anticipado) },
  { key: "con", header: "Rendido con comprobante", align: "right", cell: (l) => importe(l.rendidoConComprobante) },
  {
    key: "sin",
    header: "Reintegro sin comprobante",
    align: "right",
    cell: (l) => (l.reintegrosSinComprobante ? <span className="font-semibold tabular-nums text-strong">{formatearPesos(l.reintegrosSinComprobante)}</span> : importe(0)),
  },
  {
    key: "saldo",
    header: "Saldo no rendido",
    align: "right",
    cell: (l) =>
      l.saldoNoRendido ? (
        <span className="flex flex-col items-end gap-1">
          <span className="font-semibold tabular-nums text-danger">{formatearPesos(l.saldoNoRendido)}</span>
          <span className="text-xs text-muted">{plural(l.antiguedadDias, "día", "días")} de antigüedad</span>
        </span>
      ) : (
        importe(0)
      ),
  },
  {
    key: "viajes",
    header: "Viajes",
    cell: (l) =>
      l.viajes.length ? (
        <span className="flex flex-col gap-1">
          {l.viajes.map((v) => (
            <span key={v.id} className="text-xs text-body">
              {formatearFecha(v.desde).slice(0, 5)} al {formatearFecha(v.hasta).slice(0, 5)} · {fmtNumberAR(v.km)} km ·{" "}
              {plural(v.pernoctes, "pernocte", "pernoctes")}{" "}
              {v.cubiertoPorConvenio ? <Badge tone="info">Convenio lo paga en el recibo</Badge> : null}
            </span>
          ))}
        </span>
      ) : (
        <span className="text-xs text-muted">Sin viajes</span>
      ),
  },
];

export default function Haberes() {
  const { datos, evaluaciones } = useDemo();
  const lineas = useMemo(
    () =>
      resumenParaHaberes({
        personas: E.personas,
        anticipos: E.anticipos,
        rendiciones: datos.rendiciones,
        comprobantes: datos.comprobantes,
        viajes: E.viajes,
        periodo: E.periodo,
        hoy: E.hoy,
        // Con las evaluaciones, el motor deja afuera lo bloqueado y lo derivado a Cuentas a Pagar.
        evaluaciones: [...evaluaciones.values()],
      }),
    [datos.rendiciones, datos.comprobantes, evaluaciones],
  );
  const contenido = useMemo(
    () =>
      // Misma convención que las planillas de SAP (BOM, ";", punto decimal): la arma el plugin.
      aCsv([
        ["LEGAJO", "NOMBRE", "PERIODO", "ANTICIPADO", "RENDIDO_CON_COMPROBANTE", "REINTEGRO_SIN_COMPROBANTE", "SALDO_NO_RENDIDO", "ANTIGUEDAD_DIAS", "VIAJES", "KM", "PERNOCTES", "PERNOCTES_CUBIERTOS_POR_CONVENIO"],
        ...lineas.map((l) => [
          l.legajo,
          l.nombre,
          l.periodo,
          importeCsv(l.anticipado),
          importeCsv(l.rendidoConComprobante),
          importeCsv(l.reintegrosSinComprobante),
          importeCsv(l.saldoNoRendido),
          String(l.antiguedadDias),
          String(l.viajes.length),
          String(l.viajes.reduce((s, v) => s + v.km, 0)),
          String(l.viajes.reduce((s, v) => s + v.pernoctes, 0)),
          String(l.viajes.filter((v) => v.cubiertoPorConvenio).reduce((s, v) => s + v.pernoctes, 0)),
        ]),
      ]),
    [lineas],
  );

  return (
    <div className="space-y-6 pt-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-3xl text-sm leading-relaxed text-body">
          Resumen de {nombrePeriodo(E.periodo)} para la liquidación de sueldos. Los reintegros sin comprobante y el anticipo que no se
          rinde <span className="font-medium text-strong">son remuneración</span> (LCT arts. 105-106). Los viajes van para cruzar con los
          rubros del convenio de camioneros (CCT 40/89). El formato final lo define el sistema de liquidación de cada cliente.
        </p>
        <BotonDescargar variant="solid" nombre={nombreDemo("haberes", E.periodo)} contenido={contenido}>
          Descargar el archivo para Haberes
        </BotonDescargar>
      </div>
      <DataTable caption={`Archivo para Haberes de ${nombrePeriodo(E.periodo)}`} columns={COLUMNAS} rows={lineas} rowKey={(l) => l.legajo} />
      <p className="text-xs text-muted">Cuentan las rendiciones enviadas y no rechazadas: lo que sigue en borrador (o fue rechazado) figura como saldo no rendido.</p>
    </div>
  );
}
