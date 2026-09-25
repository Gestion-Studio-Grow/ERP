"use client";

// "Enviar rendición": el momento en que el sistema se niega.
//
// La cuadratura la calcula el motor (`calcularCuadratura`, con su mensaje en criollo) y el envío
// pasa por `aplicarAccion(…, "enviar")`: si no cuadra o hay comprobantes bloqueados, el motor
// devuelve `ok: false` con el motivo y la pantalla lo muestra tal cual, más la lista de qué
// resolver. El botón de enviar NO se deshabilita a propósito: la negativa explicada es parte del
// producto. Para hacer cuadrar, se puede declarar la devolución en efectivo.

import { useEffect, useId, useRef, useState } from "react";
import { AvisoError, Button, Input, cn } from "@/components/ui";
import { aplicarAccion, formatearPesos, type Centavos } from "@/lib/rendiciones";
import { useDemo, useDestacado } from "./contexto";
import {
  contextoTransicion,
  emisorDe,
  importeEditable,
  nombreDe,
  parsearPesos,
  plural,
  type ResumenRendicion,
} from "./derivados";
import { PantallaApp } from "./telefono";
import { Campo, IconoEnviar, IconoFlecha } from "./piezas";

export default function EnviarRendicion({
  resumen,
  onVolver,
  onAbrir,
  onEnviada,
}: {
  resumen: ResumenRendicion;
  onVolver: () => void;
  onAbrir: (comprobanteId: string) => void;
  onEnviada: (aviso: string) => void;
}) {
  const id = useId();
  const { despachar, evaluaciones } = useDemo();
  const destacado = useDestacado("enviar");
  const { rendicion: r, cuadratura: q } = resumen;
  const [texto, setTexto] = useState(importeEditable(r.devolucionDeclarada));
  const [errorImporte, setErrorImporte] = useState<string | null>(null);
  const [negativa, setNegativa] = useState<string | null>(null);
  // La negativa aparece dentro del teléfono, que tiene su propio scroll: se lleva el foco al aviso
  // para que se vea y el lector de pantalla lo lea, en vez de quedar arriba, fuera de la vista.
  const refNegativa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!negativa) return;
    refNegativa.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    refNegativa.current?.focus({ preventScroll: true });
  }, [negativa]);

  const bloqueados = resumen.comprobantes.filter((c) => evaluaciones.get(c.id)?.bloqueado);
  const aprueba = resumen.niveles[0]?.map(nombreDe).join(" o ") || "sin aprobador asignado";

  const declarar = (importe: Centavos) => {
    despachar({ tipo: "declarar_devolucion", rendicionId: r.id, importe });
    setTexto(importeEditable(importe));
    setErrorImporte(null);
    setNegativa(null);
  };

  const aplicarTexto = () => {
    const importe = parsearPesos(texto);
    if (importe === null) {
      setErrorImporte("Escribí un importe, por ejemplo 12.700");
      return;
    }
    if (importe !== r.devolucionDeclarada) declarar(importe);
  };

  const enviar = () => {
    const resultado = aplicarAccion(r, "enviar", contextoTransicion(resumen, r.legajo));
    if (!resultado.ok) {
      setNegativa(resultado.motivo);
      return;
    }
    despachar({ tipo: "transicion", rendicion: resultado.rendicion });
    onEnviada(`Listo: mandaste la rendición a aprobación. La tiene ${aprueba}.`);
  };

  const falta = q.diferencia > 0 && !q.cuadra;

  return (
    <PantallaApp
      titulo="Enviar la rendición"
      onVolver={onVolver}
      acciones={
        <Button
          className={cn("w-full", destacado && "rendi-destacado")}
          data-recorrido="enviar"
          onClick={enviar}
        >
          <IconoEnviar />
          Enviar a aprobación
        </Button>
      }
    >
      <section aria-labelledby={`${id}-cuadra`} className="space-y-3">
        <h3 id={`${id}-cuadra`} className="text-sm font-semibold text-strong">
          ¿Cuadra con el anticipo?
        </h3>
        <dl className="divide-y divide-line rounded-xl border border-line bg-surface-raised px-3 text-sm">
          <Renglon etiqueta="Recibiste" valor={q.anticipado} />
          <Renglon etiqueta="Rendiste con el anticipo" valor={q.rendido} />
          <Renglon etiqueta="Declarás devolver" valor={q.devuelto} />
          <div className="flex items-center justify-between gap-3 py-2.5">
            <dt className="font-semibold text-strong">{q.diferencia > 0 ? "Falta justificar" : q.diferencia < 0 ? "Gastaste de más" : "Diferencia"}</dt>
            <dd className={cn("font-bold tabular-nums", falta ? "text-danger" : "text-success")}>
              {formatearPesos(Math.abs(q.diferencia))}
            </dd>
          </div>
        </dl>
        <p
          role="status"
          className={cn(
            "rounded-lg px-3 py-2.5 text-sm text-strong",
            q.cuadra ? "border border-success/25 bg-success-soft" : "border border-danger/25 bg-danger-soft",
          )}
        >
          {q.mensaje}
        </p>
        {q.aReintegrar > 0 ? (
          <p className="text-xs text-muted">A reintegrarte: {formatearPesos(q.aReintegrar)} (gastos con plata propia o por encima del anticipo).</p>
        ) : null}
      </section>

      <section aria-labelledby={`${id}-devolucion`} className="space-y-2.5">
        <h3 id={`${id}-devolucion`} className="text-sm font-semibold text-strong">
          ¿Devolvés efectivo?
        </h3>
        <p className="text-xs leading-relaxed text-muted">Lo que no gastaste se devuelve en la caja de Tesorería y se declara acá.</p>
        <div className="flex items-end gap-2">
          <Campo id={`${id}-importe`} etiqueta="Importe a devolver" error={errorImporte ?? undefined} className="flex-1">
            {(control) => (
              <Input
                {...control}
                inputMode="decimal"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onBlur={aplicarTexto}
                onKeyDown={(e) => {
                  if (e.key === "Enter") aplicarTexto();
                }}
                autoComplete="off"
              />
            )}
          </Campo>
          <Button variant="outline" onClick={aplicarTexto}>
            Declarar
          </Button>
        </div>
        {falta ? (
          <Button variant="subtle" size="sm" onClick={() => declarar(q.devuelto + q.diferencia)}>
            Devolver lo que falta ({formatearPesos(q.diferencia)})
          </Button>
        ) : null}
      </section>

      {bloqueados.length ? (
        <section aria-labelledby={`${id}-bloqueos`} className="space-y-2.5">
          <h3 id={`${id}-bloqueos`} className="text-sm font-semibold text-strong">
            {plural(bloqueados.length, "comprobante bloqueado", "comprobantes bloqueados")}
          </h3>
          <p className="text-xs leading-relaxed text-muted">Mientras estén en la rendición, no se puede enviar. Tocá cada uno para resolverlo.</p>
          <ul className="space-y-2">
            {bloqueados.map((c) => {
              const motivo = evaluaciones.get(c.id)?.validaciones.find((v) => v.severidad === "bloquea")?.mensaje;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onAbrir(c.id)}
                    className="flex w-full items-center gap-3 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-strong">
                        {emisorDe(c)} · {formatearPesos(c.datos.total)}
                      </span>
                      {motivo ? <span className="block text-xs leading-snug text-body">{motivo}</span> : null}
                    </span>
                    <IconoFlecha className="text-muted" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* El motivo es el del motor, tal cual: dice qué falta y qué hacer, en criollo. */}
      {negativa ? (
        <div ref={refNegativa} tabIndex={-1} className="outline-none">
          <AvisoError titulo="El sistema no la deja enviar" comoSeguir={negativa} />
        </div>
      ) : null}

      <p className="text-xs text-muted">La va a aprobar: {aprueba}.</p>
    </PantallaApp>
  );
}

function Renglon({ etiqueta, valor }: { etiqueta: string; valor: Centavos }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="text-muted">{etiqueta}</dt>
      <dd className="font-medium tabular-nums text-strong">{formatearPesos(valor)}</dd>
    </div>
  );
}
