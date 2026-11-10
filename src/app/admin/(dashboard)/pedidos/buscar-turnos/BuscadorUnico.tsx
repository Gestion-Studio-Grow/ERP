"use client";

// VENDER · el campo único de servicio o producto (interruptor `agenda-interaccion`).
//
// Es el MISMO buscador de Vender (BuscadorCombo: teclado de combobox, Enter que no cobra) con los
// servicios al final de la lista. Un producto se suma a la venta como siempre (`onProducto`). Un
// servicio —elegido de la lista o tipeado hasta que la primera opción es un servicio, con espera
// entre teclas— abre «Turnos libres» debajo: UNA consulta (`turnosLibresDelServicio`) con los
// huecos de cada profesional que lo hace. La respuesta vieja de una búsqueda anterior se descarta.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BuscadorCombo, cn, type OpcionBuscador } from "@/components/ui";
import { fmtTime, todayInBusinessTz } from "@/lib/datetime";
import { turnosLibresDelServicio } from "@/lib/turnos/turnos-libres-actions";
import {
  ESPERA_MS,
  agruparHuecosPorProfesional,
  clasificarBusqueda,
  etiquetaDelDia,
  hrefDelHueco,
  opcionesDelBuscadorUnico,
  servicioDeLaOpcion,
  textoDelAnuncio,
  type ServicioDelBuscador,
  type TurnosLibres,
} from "./buscar-turnos-core";

type Estado =
  | { tipo: "nada" }
  | { tipo: "buscando"; servicioId: string; nombre: string }
  // `ahora`: cuándo llegó la respuesta (los huecos ya pasados se descartan contra esa hora, no en cada render).
  | { tipo: "listo"; servicioId: string; r: Extract<TurnosLibres, { ok: true }>; ahora: number }
  | { tipo: "error"; servicioId: string; mensaje: string };

export default function BuscadorUnico({
  id,
  productos,
  servicios,
  onProducto,
  placeholder,
  abrirAlEnfocar,
}: {
  id: string;
  /** Las opciones de producto de Vender, tal cual (su búsqueda no cambia). */
  productos: OpcionBuscador[];
  servicios: ServicioDelBuscador[];
  /** Elegir un producto: lo mismo que hacía el buscador de siempre. */
  onProducto: (productId: string) => void;
  placeholder?: string;
  abrirAlEnfocar?: boolean;
}) {
  const opciones = useMemo(() => opcionesDelBuscadorUnico(productos, servicios), [productos, servicios]);
  const [estado, setEstado] = useState<Estado>({ tipo: "nada" });
  const turno = useRef(0);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actual = useRef<string | null>(null);
  useEffect(() => () => {
    if (espera.current) clearTimeout(espera.current);
  }, []);

  function consultar(servicioId: string) {
    if (actual.current === servicioId) return;
    actual.current = servicioId;
    const nombre = servicios.find((s) => s.id === servicioId)?.nombre ?? "el servicio";
    const n = ++turno.current;
    setEstado({ tipo: "buscando", servicioId, nombre });
    turnosLibresDelServicio(servicioId).then(
      (r) => {
        if (n !== turno.current) return;
        setEstado(r.ok ? { tipo: "listo", servicioId, r, ahora: Date.now() } : { tipo: "error", servicioId, mensaje: r.error });
      },
      () => {
        if (n !== turno.current) return;
        actual.current = null;
        setEstado({ tipo: "error", servicioId, mensaje: "No se pudieron leer los turnos libres. Probá de nuevo." });
      },
    );
  }

  function cerrar() {
    turno.current++;
    actual.current = null;
    setEstado({ tipo: "nada" });
  }

  const ariaLabel = placeholder ?? "Buscá un servicio o un producto";
  return (
    <div data-vender="buscador-unico" className="space-y-3">
      <BuscadorCombo
        id={id}
        ariaLabel={ariaLabel}
        placeholder={ariaLabel}
        opciones={opciones}
        valor=""
        abrirAlEnfocar={abrirAlEnfocar}
        onElegir={(opcionId) => {
          if (espera.current) clearTimeout(espera.current);
          const servicioId = servicioDeLaOpcion(opcionId);
          if (servicioId) consultar(servicioId);
          else onProducto(opcionId);
        }}
        onTexto={(texto) => {
          if (espera.current) clearTimeout(espera.current);
          espera.current = setTimeout(() => {
            const c = clasificarBusqueda(texto, opciones);
            if (c.tipo === "servicio") consultar(c.servicioId);
          }, ESPERA_MS);
        }}
      />
      {estado.tipo !== "nada" && <PanelDeTurnosLibres estado={estado} onCerrar={cerrar} />}
    </div>
  );
}

function PanelDeTurnosLibres({ estado, onCerrar }: { estado: Exclude<Estado, { tipo: "nada" }>; onCerrar: () => void }) {
  const hoy = todayInBusinessTz();
  const nombre = estado.tipo === "listo" ? estado.r.servicio.nombre : estado.tipo === "buscando" ? estado.nombre : "";
  const grupos = estado.tipo === "listo" ? agruparHuecosPorProfesional(estado.r.profesionales, estado.r.dias, { ahora: estado.ahora }) : [];
  const anuncio =
    estado.tipo === "buscando"
      ? `Buscando turnos libres de ${nombre}…`
      : estado.tipo === "error"
        ? estado.mensaje
        : textoDelAnuncio(nombre, grupos);
  const puedeDar = estado.tipo === "listo" && estado.r.puedeDarTurno;

  return (
    <section data-vender="turnos-libres" aria-labelledby="vender-turnos-libres" className="rounded-lg border border-line bg-surface-raised p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <h2 id="vender-turnos-libres" className="text-[15px] font-semibold text-strong">
          Turnos libres{nombre ? ` · ${nombre}` : ""}
        </h2>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar los turnos libres"
          className="-mr-1 -mt-1 inline-flex h-11 w-11 items-center justify-center rounded-md text-lg leading-none text-muted hover:text-strong"
        >
          ×
        </button>
      </div>
      <p role="status" aria-live="polite" className={cn("text-[13px]", estado.tipo === "error" ? "text-danger" : "text-muted")}>
        {anuncio}
      </p>
      {estado.tipo === "listo" && !puedeDar && grupos.some((g) => g.total > 0) && (
        <p className="mt-1 text-[13px] text-muted">Para dar el turno, pedíselo a recepción.</p>
      )}
      {grupos.length > 0 && (
        <div className="mt-3 space-y-4">
          {grupos.map((g) => (
            <div key={g.id} role="group" aria-label={`Turnos libres con ${g.nombre}`} data-profesional={g.id}>
              <h3 className="text-sm font-medium text-strong">
                {g.nombre} <span className="font-normal text-muted">· {g.total === 0 ? "sin lugar" : g.total === 1 ? "1 libre" : `${g.total} libres`}</span>
              </h3>
              {g.dias.map((d) => (
                <div key={d.dia} className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className="w-16 shrink-0 text-[13px] text-muted">{etiquetaDelDia(d.dia, hoy)}</span>
                  {d.horarios.map((inicio) => {
                    const hora = fmtTime(inicio);
                    const chip = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border px-3 text-sm tabular-nums";
                    return puedeDar && estado.tipo === "listo" ? (
                      <Link
                        key={inicio}
                        href={hrefDelHueco(estado.r.servicio.id, g.id, inicio)}
                        data-vender="hueco"
                        aria-label={`Dar turno de ${nombre} con ${g.nombre}, ${etiquetaDelDia(d.dia, hoy).toLowerCase()} a las ${hora}`}
                        className={cn(chip, "border-line-strong bg-surface text-strong hover:border-accent hover:text-accent-ink")}
                      >
                        {hora}
                      </Link>
                    ) : (
                      <span key={inicio} data-vender="hueco-sin-tecla" className={cn(chip, "border-line bg-surface-sunken text-muted")}>
                        {hora}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
