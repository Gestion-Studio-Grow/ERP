"use client";

// ============================================================================
// PARA REVISAR — la cola de la facturación automática (diseño nuevo «Renglón»).
// ============================================================================
//
// Un renglón por movimiento que pide una mano (fecha, qué dice el banco, por qué está acá, monto).
// Tocarlo abre un cajón con EL MISMO formulario de siempre (PanelDetalle de ColaRevision: datos del
// comprador con el dígito verificador en vivo, o «no facturable» con opción de aprender el patrón).
// Resuelto uno, sale de la lista y el cajón se cierra. Sin tarjeta y sin la franja de color a la
// izquierda de la fila elegida: la fila elegida es la que está abierta en el cajón.
//
// Teclado: la tabla mueve el foco (↑↓ j/k); Enter o «r» abre el movimiento.

import { useRef, useState } from "react";
import type { PropuestaVista } from "@/lib/bancos-actions";
import { Tabla, type ColumnaTabla } from "@/components/ui/Tabla";
import { Cajon } from "@/components/ui/Cajon";
import { Button, Marca, Plata } from "@/components/ui";
import { PanelDetalle } from "./ColaRevision";
import { fechaAr, motivoCorto } from "./helpers";

export default function RevisarEnCajon({ propuestas }: { propuestas: PropuestaVista[] }) {
  const [lista, setLista] = useState(propuestas);
  const [abiertaId, setAbiertaId] = useState<string | null>(null);
  const titulo = useRef<HTMLHeadingElement | null>(null);
  const abierta = lista.find((p) => p.id === abiertaId) ?? null;

  const resuelta = (id: string) => {
    setLista((antes) => antes.filter((p) => p.id !== id));
    setAbiertaId(null);
  };

  const columnas: ColumnaTabla<PropuestaVista>[] = [
    { clave: "fecha", titulo: "Fecha", movil: "folio", celda: (p) => <span className="tabular-nums">{fechaAr(p.fecha).slice(0, 5)}</span> },
    {
      clave: "movimiento",
      titulo: "Qué dice el banco",
      movil: "asunto",
      celda: (p) => (
        <span className="flex min-w-0 flex-col">
          <button type="button" onClick={() => setAbiertaId(p.id)} className="max-w-full truncate text-left font-semibold text-strong hover:underline">
            {p.descripcion}
          </button>
          {p.contraparte && <span className="truncate text-sm text-muted">{p.contraparte}</span>}
        </span>
      ),
    },
    { clave: "motivo", titulo: "Por qué está acá", movil: "detalle", celda: (p) => <Marca tipo="atencion">{motivoCorto(p.motivoRevision).label}</Marca> },
    { clave: "monto", titulo: "Monto", alinear: "derecha", movil: "plata", celda: (p) => <Plata valor={Math.abs(p.monto)} /> },
    {
      clave: "tecla",
      titulo: "",
      movil: "tecla",
      alinear: "derecha",
      celda: (p) => (
        <Button variant="outline" onClick={() => setAbiertaId(p.id)} aria-label={`Revisar ${p.descripcion}`}>
          Revisar
        </Button>
      ),
    },
  ];

  if (lista.length === 0) {
    return <p className="py-3 text-sm text-muted">Nada más para revisar: lo que quedaba ya pasó a la lista para facturar o quedó como no facturable.</p>;
  }

  return (
    <section aria-label="Movimientos para revisar" data-cola="revisar">
      <Tabla<PropuestaVista>
        titulo="Movimientos del banco que piden una mano antes de facturar"
        filas={lista}
        clave={(p) => p.id}
        columnas={columnas}
        // Tocar el renglón (fuera de sus teclas) o Enter con el foco abre el movimiento.
        onAbrir={(p) => setAbiertaId(p.id)}
        teclas={[{ letra: "r", que: "Revisar", hacer: (p) => setAbiertaId(p.id) }]}
        cuenta={lista.length === 1 ? "1 movimiento" : `${lista.length} movimientos`}
      />
      {abierta && (
        <Cajon
          abierto
          onCerrar={() => setAbiertaId(null)}
          titulo={abierta.descripcion}
          descripcion={
            <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="tabular-nums">{fechaAr(abierta.fecha)}</span>
              <Plata valor={Math.abs(abierta.monto)} />
              <Marca tipo="atencion">{motivoCorto(abierta.motivoRevision).label}</Marca>
            </span>
          }
        >
          <PanelDetalle key={abierta.id} propuesta={abierta} headingRef={titulo} onResuelta={resuelta} enCajon />
        </Cajon>
      )}
    </section>
  );
}
