// LA LÍNEA DEL DÍA (matias-DISENO.md §2.3 · M-056/M-059/M-065): las clases, los huecos libres y
// los bloqueos de un día, en orden de hora. Una clase se abre con un toque y muestra las MISMAS
// acciones que en Hoy (AccionesClase). Un hueco «18:00 libre ＋» abre Agendar con día y hora
// puestos. Un bloqueo se ve tachado y se puede quitar. Servidor (las acciones son de cliente).
// No se anima: se ve cien veces al día.

import Link from "next/link";
import { Icono } from "@/components/ui";
import { quitarBloqueo } from "@/lib/padel/acciones";
import { horaHumana, PAGO_LABEL, type EstadoPago } from "@/lib/padel/core";
import { plataTexto } from "./_plata";
import type { ClasePanel } from "@/lib/padel/datos.server";
import { AccionesClase } from "./_acciones";
import { hrefAgendar, lineaDelDia } from "./_agenda-core";
import type { ClaseAcciones } from "./_hojas/tipos";
import type { ClaseDelDia } from "./_hojas/proponer";
import { ChipEstado, tonoEstado } from "./_vista";

/** Lo que viaja a la pantalla de una clase: sin el token del alumno. */
export function aAcciones(c: ClasePanel): ClaseAcciones {
  return {
    id: c.id,
    estado: c.estado,
    pagoEstado: c.pagoEstado,
    nombre: c.nombre,
    comprobante: c.comprobante,
    precio: c.precio,
    empiezaEn: c.empiezaEn,
    terminaEn: c.terminaEn,
    telefono: c.telefono,
    tipo: c.tipo,
    personas: c.personas,
    motivoCancel: c.motivoCancel,
  };
}

/** Las clases del día para «Editar» y «Se suspende». */
export const delDia = (clases: readonly ClasePanel[]): ClaseDelDia[] =>
  clases.map((c) => ({ id: c.id, nombre: c.nombre, empiezaEn: c.empiezaEn, terminaEn: c.terminaEn, estado: c.estado }));

/** «Individual · $25.000 · Pagada» (lo que se lee en la fila, sin abrirla). */
export function detalleClase(c: Pick<ClasePanel, "tipo" | "personas" | "precio" | "pagoEstado" | "estado" | "dadas">): string {
  return [
    c.tipo === "GRUPAL" ? `Con amigos · ${c.personas}` : "Individual",
    c.precio > 0 ? plataTexto(c.precio) : null,
    ["CONFIRMADA", "DADA"].includes(c.estado) ? PAGO_LABEL[c.pagoEstado as EstadoPago] : null,
    c.dadas === 0 ? "alumno nuevo" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export const filaClase = "rounded-2xl border border-line border-l-4 bg-surface-raised";

/** Una clase plegada: hora · nombre · estado; al tocarla, sus acciones. */
export function FilaClase({ c, otras, recordada = false, qa }: { c: ClasePanel; otras: readonly ClaseDelDia[]; recordada?: boolean; qa: string }) {
  return (
    <li className={filaClase} style={{ borderLeftColor: tonoEstado(c.estado) }} data-qa={qa}>
      <details className="group">
        <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="text-lg font-bold tabular-nums text-strong">{horaHumana(new Date(c.empiezaEn))}</span>
            <span className="truncate font-semibold text-strong">{c.nombre}</span>
            {recordada && <span className="text-xs font-semibold text-muted" data-qa="recordado">✓ recordado</span>}
          </span>
          <ChipEstado estado={c.estado} pago={c.pagoEstado} />
        </summary>
        <div className="grid gap-3 px-4 pb-4">
          <p className="text-sm text-muted">{detalleClase(c)}</p>
          <AccionesClase c={aAcciones(c)} otras={otras} />
        </div>
      </details>
    </li>
  );
}

export function LineaDelDia({
  fecha,
  clases,
  huecos,
  bloqueos = [],
  recordadas = [],
  otras: otrasDadas,
  qa = "clase-dia",
}: {
  fecha: string;
  clases: readonly ClasePanel[];
  huecos: readonly string[];
  bloqueos?: readonly { id: string; desde: string; hasta: string }[];
  recordadas?: readonly string[];
  /** Todas las clases del día (si `clases` es sólo una parte, como «El resto de hoy»). */
  otras?: readonly ClaseDelDia[];
  qa?: string;
}) {
  const items = lineaDelDia({ fecha, clases, huecos, bloqueos });
  const otras = otrasDadas ?? delDia(clases);
  return (
    <ul className="grid gap-2">
      {items.map((it) => {
        if (it.tipo === "clase") return <FilaClase key={it.clave} c={it.clase} otras={otras} recordada={recordadas.includes(it.clase.id)} qa={qa} />;
        if (it.tipo === "hueco")
          return (
            <li key={it.clave}>
              <Link
                href={hrefAgendar({ fecha, hora: it.hora })}
                className="flex min-h-12 items-center justify-between gap-2 rounded-2xl border border-dashed border-line-strong px-4 text-muted hover:bg-surface-sunken hover:text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                aria-label={`${it.hora} libre: agendar una clase`}
                data-qa="hueco"
              >
                <span className="flex items-baseline gap-2">
                  <span className="text-lg font-bold tabular-nums">{it.hora}</span>
                  <span>libre</span>
                </span>
                <Icono nombre="mas" className="size-5" />
              </Link>
            </li>
          );
        return (
          <li key={it.clave} className="flex min-h-12 items-center justify-between gap-2 rounded-2xl bg-surface-sunken px-4 text-sm text-muted" data-qa="bloqueo">
            <span>
              <span aria-hidden>░ </span>
              {it.todoElDia ? "Día bloqueado" : `Bloqueado ${it.desde}–${it.hasta}`}
            </span>
            <form action={quitarBloqueo}>
              <input type="hidden" name="id" value={it.clave.slice(2)} />
              <button type="submit" className="min-h-12 px-2 font-semibold text-strong underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" data-qa="quitar-bloqueo">
                Quitar
              </button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
