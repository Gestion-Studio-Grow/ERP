"use client";

import { useState } from "react";
import { settleCommission } from "@/lib/commission-actions";
import type { CommissionLiquidation } from "@/lib/commission-actions";
import SubmitButton from "@/components/SubmitButton";

function money(n: number): string {
  return `$${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
}

function csvCell(v: string | number): string {
  const s = String(v);
  // Escapar comillas y envolver si hay coma / comilla / salto de línea.
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Descarga un CSV con el detalle de todos los turnos del período (una fila por
// turno). Se arma en el cliente desde los datos ya cargados — sin round-trip.
function exportCsv(data: CommissionLiquidation) {
  const header = [
    "Profesional",
    "Fecha",
    "Cliente",
    "Servicio",
    "Ingreso",
    "% comisión",
    "Comisión",
  ];
  const rows: (string | number)[][] = [];
  for (const p of data.byProfessional) {
    for (const a of p.appointments) {
      rows.push([
        p.professionalName,
        a.date,
        a.clientName,
        a.serviceName,
        a.amount,
        a.pct,
        Math.round(a.commission * 100) / 100,
      ]);
    }
  }
  const csv = [header, ...rows]
    .map((r) => r.map(csvCell).join(","))
    .join("\n");
  // BOM para que Excel abra los acentos bien.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `comisiones_${data.from}_a_${data.to}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function ProfessionalCard({
  prof,
  from,
  to,
}: {
  prof: CommissionLiquidation["byProfessional"][number];
  from: string;
  to: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">
            {prof.professionalName}
            {prof.settled && (
              <span className="ml-2 inline-block rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-0.5 text-xs font-medium">
                Liquidado
              </span>
            )}
          </p>
          <p className="text-sm text-neutral-500">
            {prof.appointmentCount} turno{prof.appointmentCount === 1 ? "" : "s"} ·
            base {money(prof.baseAmount)}
          </p>
          {prof.settled && prof.settledAt && (
            <p className="text-xs text-neutral-400 mt-0.5">
              Pagado el{" "}
              {new Date(prof.settledAt).toLocaleDateString("es-AR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })}
            </p>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-2 text-sm text-neutral-500 hover:text-black underline underline-offset-2"
          >
            {open ? "Ocultar detalle" : "Ver detalle de turnos"}
          </button>
        </div>

        <div className="flex flex-col items-end gap-2 min-w-[200px]">
          <span className="text-lg font-semibold">{money(prof.commission)}</span>
          <form action={settleCommission} className="flex flex-col items-end gap-1.5">
            <input type="hidden" name="professionalId" value={prof.professionalId} />
            <input type="hidden" name="from" value={from} />
            <input type="hidden" name="to" value={to} />
            <input
              type="text"
              name="notes"
              placeholder="Nota (opcional)"
              className="rounded-md border px-2 py-1 text-sm w-full"
            />
            <SubmitButton
              pendingText="Guardando…"
              className={`rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap ${
                prof.settled
                  ? "border text-neutral-600 hover:bg-neutral-50"
                  : "bg-black text-white"
              }`}
            >
              {prof.settled ? "Volver a marcar pagada" : "Marcar como pagada"}
            </SubmitButton>
          </form>
        </div>
      </div>

      {open && (
        <div className="mt-3 border-t pt-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-500">
                  <th className="py-1 pr-3 font-normal">Fecha</th>
                  <th className="py-1 pr-3 font-normal">Cliente</th>
                  <th className="py-1 pr-3 font-normal">Servicio</th>
                  <th className="py-1 pr-3 font-normal text-right">Ingreso</th>
                  <th className="py-1 pr-3 font-normal text-right">%</th>
                  <th className="py-1 font-normal text-right">Comisión</th>
                </tr>
              </thead>
              <tbody>
                {prof.appointments.map((a) => (
                  <tr key={a.appointmentId} className="border-t">
                    <td className="py-1 pr-3 whitespace-nowrap">{a.date}</td>
                    <td className="py-1 pr-3">{a.clientName}</td>
                    <td className="py-1 pr-3">{a.serviceName}</td>
                    <td className="py-1 pr-3 text-right">{money(a.amount)}</td>
                    <td className="py-1 pr-3 text-right">{a.pct}%</td>
                    <td className="py-1 text-right font-medium">{money(a.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CommissionTable({ data }: { data: CommissionLiquidation }) {
  const hasData = data.byProfessional.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">
          {data.byProfessional.length} profesional
          {data.byProfessional.length === 1 ? "" : "es"} con comisión en el período
        </p>
        <button
          type="button"
          onClick={() => exportCsv(data)}
          disabled={!hasData}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-40"
        >
          Exportar CSV
        </button>
      </div>

      {!hasData && (
        <p className="text-sm text-neutral-500 rounded-lg border p-4">
          No hay turnos completados con comisión configurada en el período elegido.
        </p>
      )}

      {data.byProfessional.map((prof) => (
        <ProfessionalCard
          key={prof.professionalId}
          prof={prof}
          from={data.from}
          to={data.to}
        />
      ))}
    </div>
  );
}
