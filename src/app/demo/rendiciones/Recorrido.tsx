"use client";

// Recorrido guiado: "el momento de la demo" en cuatro pasos (plan §11).
// 1. La rendición del chofer que no cuadra: se toca "Enviar" y el sistema se niega.
// 2. La factura "sujeta a retención" que va a Cuentas a Pagar.
// 3. La comida del chofer que ya paga el convenio.
// 4. Tesorería generando los archivos para SAP.
//
// Los pasos se arman desde los DATOS: cada comprobante se ubica por el código que devolvió el
// motor (R3, R11), no por un id fijo. El recorrido sólo navega y señala; las acciones las hace
// quien presenta, con los botones de verdad. Si la demo ya se tocó y falta algo, lo dice y
// ofrece volver a empezar. No es modal: se puede usar la pantalla con el recorrido abierto.

import { useEffect, useRef, useState } from "react";
import { Button, cn } from "@/components/ui";
import type { CodigoValidacion, Evaluacion } from "@/lib/rendiciones";
import type { DatosDemo, Vista } from "./estado";
import { esEditable, nombreDePila, quienesRinden, rendicionDe, type ResumenRendicion } from "./derivados";
import { IconoCerrar } from "./piezas";

export interface PasoRecorrido {
  titulo: string;
  texto: string;
  vista?: Partial<Vista>;
  /** Qué elemento se señala (`data-recorrido`). */
  marca?: string;
  /** El paso necesita datos que ya no están (la demo se modificó). */
  faltaDato?: boolean;
}

export function armarPasos(
  datos: DatosDemo,
  evaluaciones: Map<string, Evaluacion>,
  resumenes: Map<string, ResumenRendicion>,
): PasoRecorrido[] {
  const enRendicion = new Set(datos.rendiciones.flatMap((r) => r.comprobanteIds));
  const conCodigo = (codigo: CodigoValidacion) =>
    datos.comprobantes.find((c) => enRendicion.has(c.id) && evaluaciones.get(c.id)?.validaciones.some((v) => v.codigo === codigo));
  const comida = conCodigo("R11_CUBIERTO_POR_CONVENIO");
  const leyenda = conCodigo("R3_FACTURA_CON_LEYENDA");
  const chofer = comida?.legajo ?? leyenda?.legajo ?? quienesRinden[0]?.legajo ?? "";
  const rendicion = rendicionDe(datos.rendiciones, chofer);
  const resumen = rendicion ? resumenes.get(rendicion.id) : undefined;
  const abierta = Boolean(rendicion && esEditable(rendicion));
  const nombre = nombreDePila(chofer);
  const hayEnControl = datos.rendiciones.some((r) => r.estado === "en_control" || r.estado === "contabilizada");

  return [
    {
      titulo: "La rendición que no cuadra",
      texto:
        abierta && resumen
          ? `${nombre} es chofer. ${resumen.cuadratura.mensaje} Además tiene comprobantes bloqueados. Tocá “Enviar a aprobación”: el sistema se niega y explica por qué.`
          : `La rendición de ${nombre} ya no está abierta, así que no se puede mostrar la negativa al enviar.`,
      vista: { rol: "rinde", legajoRinde: chofer, pantallaRinde: abierta ? "enviar" : "inicio", comprobanteAbierto: null },
      marca: abierta ? "enviar" : undefined,
      faltaDato: !abierta,
    },
    {
      titulo: "La factura que no se paga por rendición",
      texto:
        "El taller le hizo una factura A “operación sujeta a retención”. Eso no se paga con la plata del anticipo: hay que retener. El sistema la bloquea y la manda a Cuentas a Pagar.",
      vista: leyenda ? { rol: "rinde", legajoRinde: leyenda.legajo, pantallaRinde: "detalle", comprobanteAbierto: leyenda.id } : undefined,
      marca: leyenda ? "validaciones" : undefined,
      faltaDato: !leyenda,
    },
    {
      titulo: "La comida que ya paga el convenio",
      texto: `${nombre} es camionero de convenio (CCT 40/89) y esa comida fue durante un viaje que el recibo de sueldo ya le paga. No se reintegra dos veces: el sistema lo frena.`,
      vista: comida ? { rol: "rinde", legajoRinde: comida.legajo, pantallaRinde: "detalle", comprobanteAbierto: comida.id } : undefined,
      marca: comida ? "validaciones" : undefined,
      faltaDato: !comida,
    },
    {
      titulo: "Tesorería arma los archivos para SAP",
      texto:
        "Con lo que está en control, Tesorería genera las planillas de carga para SAP: facturas de proveedor, el asiento de gastos, las cancelaciones y las altas de proveedores. Tocá “Generar archivos para SAP”.",
      vista: { rol: "tesoreria", pestanaTesoreria: "contabilizar" },
      marca: hayEnControl ? "generar-archivos" : undefined,
      faltaDato: !hayEnControl,
    },
  ];
}

export default function Recorrido({
  pasos,
  paso,
  onIr,
  onCerrar,
  onReiniciarYEmpezar,
}: {
  pasos: PasoRecorrido[];
  /** -1 = la pregunta previa ("¿arrancamos de cero?"). */
  paso: number;
  onIr: (paso: number) => void;
  onCerrar: () => void;
  onReiniciarYEmpezar: () => void;
}) {
  const [minimizado, setMinimizado] = useState(false);
  const titulo = useRef<HTMLHeadingElement>(null);
  const actual = paso >= 0 ? pasos[paso] : undefined;
  const marca = actual?.marca;
  const ultimo = paso === pasos.length - 1;

  // Trae a la vista lo que se señala (la pantalla ya cambió: el paso y la vista van juntos).
  useEffect(() => {
    if (!marca) return;
    const menosMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document
      .querySelector<HTMLElement>(`[data-recorrido="${marca}"]`)
      ?.scrollIntoView({ block: "center", behavior: menosMovimiento ? "auto" : "smooth" });
  }, [marca, paso]);

  // Cada paso nuevo lleva el foco al título del recorrido: teclado y lector de pantalla siguen el hilo.
  useEffect(() => {
    titulo.current?.focus({ preventScroll: true });
  }, [paso, minimizado]);

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="rendi-recorrido-titulo"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCerrar();
      }}
      className="fixed inset-x-3 bottom-3 z-40 rounded-2xl border border-line bg-surface-raised p-4 text-body shadow-overlay lg:inset-x-auto lg:bottom-6 lg:left-6 lg:w-[390px]"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-ink">
          Recorrido guiado{paso >= 0 ? ` · ${paso + 1} de ${pasos.length}` : ""}
        </p>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setMinimizado((m) => !m)} aria-expanded={!minimizado}>
            {minimizado ? "Mostrar" : "Achicar"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onCerrar} aria-label="Salir del recorrido" className="px-2">
            <IconoCerrar />
          </Button>
        </div>
      </div>

      {paso < 0 ? (
        <div className={cn("mt-2 space-y-3", minimizado && "hidden")}>
          <h2 id="rendi-recorrido-titulo" ref={titulo} tabIndex={-1} className="text-base font-semibold text-strong outline-none">
            Antes de empezar
          </h2>
          <p className="text-sm leading-relaxed">
            Ya tocaste la demo. Para que el recorrido muestre la historia completa, conviene volver a los datos del principio.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onReiniciarYEmpezar}>Reiniciar y empezar</Button>
            <Button variant="ghost" onClick={() => onIr(0)}>
              Empezar igual
            </Button>
          </div>
        </div>
      ) : actual ? (
        <div className={cn("mt-2 space-y-3", minimizado && "hidden")}>
          <h2 id="rendi-recorrido-titulo" ref={titulo} tabIndex={-1} className="text-base font-semibold text-strong outline-none">
            {actual.titulo}
          </h2>
          <p className="text-sm leading-relaxed" aria-live="polite">
            {actual.texto}
          </p>
          {actual.faltaDato ? (
            <div className="space-y-2 rounded-lg bg-warning-soft px-3 py-2.5 text-sm text-strong">
              <p>Este paso necesita los datos del principio de la demo.</p>
              <Button size="sm" variant="outline" onClick={onReiniciarYEmpezar}>
                Reiniciar y ver desde el principio
              </Button>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex gap-1.5" aria-hidden="true">
              {pasos.map((_, i) => (
                <span key={i} className={cn("h-1.5 rounded-full transition-all", i === paso ? "w-5 bg-accent" : "w-1.5 bg-line-strong")} />
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => onIr(paso - 1)} disabled={paso === 0}>
                Anterior
              </Button>
              <Button size="sm" onClick={() => (ultimo ? onCerrar() : onIr(paso + 1))}>
                {ultimo ? "Terminar" : "Siguiente"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
