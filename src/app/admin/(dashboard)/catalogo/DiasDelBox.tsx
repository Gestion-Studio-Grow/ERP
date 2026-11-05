"use client";

// «Abre sólo los días que elijo» + calendario del mes (box «Nail Artist», NAIL-ARTIST.md §2).
// Sólo la dueña lo ve (la página lo arma sólo para OWNER con el interruptor `nail-artist`).
// Tocar un día lo abre o lo cierra; fuera de los días abiertos el box no ofrece turnos.

import Link from "next/link";
import { useState, useTransition } from "react";
import { alternarDiaAbierto, fijarSoloDiasAbiertos } from "@/lib/turnos/box-dias-actions";
import { correrMes, grillaDelMes } from "@/lib/turnos/box-dias";
import { useToast } from "../ToastProvider";

export type DiasDelBoxDatos = { mes: string; soloDiasAbiertos: boolean; abiertos: string[] };

const SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function nombreDelMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} ${y}`;
}

export default function DiasDelBox({ boxId, boxName, datos }: { boxId: string; boxName: string; datos: DiasDelBoxDatos }) {
  const [solo, setSolo] = useState(datos.soloDiasAbiertos);
  const [abiertos, setAbiertos] = useState(() => new Set(datos.abiertos));
  const [pendiente, startTransition] = useTransition();
  const { showError, showSuccess } = useToast();

  function fd(campos: Record<string, string>) {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  }

  function cambiarSolo(valor: boolean) {
    setSolo(valor);
    startTransition(async () => {
      const r = await fijarSoloDiasAbiertos(fd({ boxId, soloDiasAbiertos: String(valor) }));
      if (r.ok) showSuccess(r.mensaje);
      else {
        setSolo(!valor);
        showError(r.error);
      }
    });
  }

  function tocarDia(fecha: string) {
    const antes = new Set(abiertos);
    const despues = new Set(abiertos);
    if (despues.has(fecha)) despues.delete(fecha);
    else despues.add(fecha);
    setAbiertos(despues);
    startTransition(async () => {
      const r = await alternarDiaAbierto(fd({ boxId, fecha }));
      if (r.ok) showSuccess(r.mensaje);
      else {
        setAbiertos(antes);
        showError(r.error);
      }
    });
  }

  const semanas = grillaDelMes(datos.mes);

  return (
    <div className="mt-3 rounded-md bg-surface-sunken p-3">
      <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-strong">
        <input
          type="checkbox"
          checked={solo}
          disabled={pendiente}
          onChange={(e) => cambiarSolo(e.target.checked)}
          className="size-5"
        />
        Abre sólo los días que elijo
      </label>
      {solo && (
        <>
          <p className="mb-2 text-xs text-muted">
            Tocá un día para abrirlo o cerrarlo. Los días cerrados, «{boxName}» no ofrece turnos (ni en la web ni en la agenda).
          </p>
          <div className="mb-2 flex items-center justify-between">
            <Link href={`?diasMes=${correrMes(datos.mes, -1)}`} className="chip-btn min-h-11 min-w-11" aria-label="Mes anterior" scroll={false}>
              ‹
            </Link>
            <span className="text-sm font-medium capitalize text-strong">{nombreDelMes(datos.mes)}</span>
            <Link href={`?diasMes=${correrMes(datos.mes, 1)}`} className="chip-btn min-h-11 min-w-11" aria-label="Mes siguiente" scroll={false}>
              ›
            </Link>
          </div>
          <table className="w-full table-fixed border-separate border-spacing-1 text-center text-sm">
            <caption className="sr-only">Días que abre «{boxName}» en {nombreDelMes(datos.mes)}</caption>
            <thead>
              <tr>
                {SEMANA.map((d) => (
                  <th key={d} scope="col" className="text-xs font-normal text-muted">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {semanas.map((semana, i) => (
                <tr key={i}>
                  {semana.map((fecha, j) =>
                    fecha ? (
                      <td key={fecha}>
                        <button
                          type="button"
                          onClick={() => tocarDia(fecha)}
                          disabled={pendiente}
                          aria-pressed={abiertos.has(fecha)}
                          aria-label={`${Number(fecha.slice(8))} de ${nombreDelMes(datos.mes)}: ${abiertos.has(fecha) ? "abierto" : "cerrado"}`}
                          className={
                            "min-h-11 w-full min-w-11 rounded-md border text-sm focus-visible:outline-2 focus-visible:outline-accent " +
                            (abiertos.has(fecha)
                              ? "border-accent bg-accent font-semibold text-on-accent"
                              : "border-line bg-surface-raised text-muted")
                          }
                        >
                          {Number(fecha.slice(8))}
                        </button>
                      </td>
                    ) : (
                      <td key={`v${j}`} />
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">{abiertos.size === 0 ? "Este mes no tiene días abiertos." : `${abiertos.size} día(s) abiertos este mes.`}</p>
        </>
      )}
    </div>
  );
}
