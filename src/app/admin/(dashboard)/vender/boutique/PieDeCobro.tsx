"use client";

// EL PIE DE COBRO QUE SE PLIEGA (Magra · tanda practicidad, V-2 y V-3).
//
// El pie del mostrador boutique era sticky y medía 360 px aunque el ticket estuviera vacío: tapaba
// el buscador y las teclas al entrar. Ahora:
//   · con el ticket vacío no ocupa lugar (o, recién cobrada una venta en efectivo, sólo el vuelto);
//   · con algo cargado es UNA barra: el total (el único de la pantalla) y «Cobrar $X»;
//   · al tocar «Cobrar $X» se abren los medios (el `PieDeCobro` de siempre, el que cobra en Vender,
//     en la entrega, en la rendición y en la devolución) y lo que el negocio suma al lado (dejar a
//     cuenta, registrar sin cobrar). «Seguir cargando» lo pliega.
// La venta por kilo queda en 4 gestos: tecla → peso → «Cobrar $X» → el medio.
//
// Sólo presenta: el cobro sale por el `onCobrar` de la vista (el mismo `submit` de siempre).

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ResultadoDelPie } from "@/components/cobro/PieDeCobro";
import { motivoParaNoCobrar, textoPlata, vueltoDelResultado } from "@/lib/cobro/pie-de-cobro-core";

// Los medios (el pie de siempre) bajan con el primer renglón, no al entrar (V-6): plegado no hacen falta.
const traerMedios = () => import("@/components/cobro/PieDeCobro").then((m) => m.PieDeCobro);
const PieDeCobro = dynamic(traerMedios, {
  loading: () => (
    <p role="status" aria-busy="true" className="min-h-16 px-3 text-sm text-muted">
      Abriendo los medios de cobro…
    </p>
  ),
});

const PRIMARIO =
  "inline-flex min-h-12 shrink-0 items-center justify-center rounded-lg bg-accent px-5 text-base font-semibold tabular-nums text-on-accent " +
  "hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus " +
  "disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-faint";

const VOLVER =
  "inline-flex min-h-11 shrink-0 items-center px-3 text-sm font-medium text-muted underline " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** ¿Qué muestra el pie? PURA (la prueba de V-2 la mira sin navegador). */
export function estadoDelPie(total: number, abierto: boolean, vuelto: number | null, cargado = total > 0): "nada" | "vuelto" | "barra" | "medios" {
  // Cargado y sin total (una línea a mano a medio llenar): la barra, para decir qué falta.
  if (!(total > 0)) return cargado ? "barra" : vuelto !== null && vuelto > 0 ? "vuelto" : "nada";
  return abierto ? "medios" : "barra";
}

/** «Cobrar $15.500» (o «Registrar y cobrar $15.500» en un pedido). */
export function textoDeCobrar(textoBoton: string, total: number): string {
  return `${textoBoton} ${textoPlata(total)}`;
}

export function PieDeCobroPlegable({
  total,
  rotuloTotal,
  deshabilitado,
  textoBoton = "Cobrar",
  version = 0,
  cargado = total > 0,
  onCobrar,
  alLado,
}: {
  total: number;
  /** ¿Hay algo en el ticket? (con total 0 también: una línea a mano sin terminar dice qué le falta). */
  cargado?: boolean;
  /** «Total» o «Total del pedido». */
  rotuloTotal: string;
  /** El motivo que frena el cobro (falta el peso, el día está cerrado…): se dice en la barra. */
  deshabilitado?: { motivo: string };
  textoBoton?: string;
  /** Cambia cuando el total viejo ya no vale (subió un precio): los medios se rearman. */
  version?: number;
  onCobrar(r: ResultadoDelPie): void | Promise<void>;
  /** Lo que va con los medios abiertos (dejar a cuenta, registrar sin cobrar). */
  alLado?: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const [vuelto, setVuelto] = useState<number | null>(null);
  // El vuelto del cobro EN VUELO: se muestra sólo si el ticket queda vacío mientras tanto (se grabó).
  const [enVuelo, setEnVuelo] = useState<number | null>(null);
  const [totalVisto, setTotalVisto] = useState(total);
  const medios = useRef<HTMLDivElement>(null);
  // Se ajusta al pintar (no en un efecto): vacío, el pie se pliega solo (y, si fue un cobro en
  // efectivo con billete, queda el vuelto); con la venta nueva, el vuelto de la anterior se va.
  if (totalVisto !== total) {
    setTotalVisto(total);
    if (!(total > 0)) {
      setAbierto(false);
      setVuelto(enVuelo);
      setEnVuelo(null);
    } else if (!(totalVisto > 0)) setVuelto(null);
  }
  const estado = estadoDelPie(total, abierto, vuelto, cargado);
  const motivo = motivoParaNoCobrar(total, deshabilitado);

  // Con el primer renglón ya se baja el código de los medios: el toque en «Cobrar $X» no espera.
  useEffect(() => {
    if (cargado) void traerMedios();
  }, [cargado]);

  // Abierto con el teclado: el foco va al primer medio (Efectivo), listo para Enter.
  useEffect(() => {
    if (estado !== "medios") return;
    medios.current?.querySelector<HTMLButtonElement>('[data-ui="pie-de-cobro"] button:not([disabled])')?.focus();
  }, [estado]);

  async function cobrar(r: ResultadoDelPie) {
    const v = vueltoDelResultado(total, r);
    setEnVuelo(v > 0 ? v : null);
    try {
      await onCobrar(r);
    } finally {
      // Frenado (un precio que cambió, sin señal): el ticket sigue y ese vuelto ya no vale. Se
      // suelta después de que React pinte lo que dejó el cobro.
      setTimeout(() => setEnVuelo(null), 0);
    }
  }

  if (estado === "nada") return null;
  if (estado === "vuelto") {
    return (
      <p data-vender="pie-vuelto" aria-live="polite" className="flex items-baseline justify-between gap-3 rounded-lg border border-line bg-surface-sunken px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Vuelto</span>
        <span className="font-display text-4xl leading-none tabular-nums text-strong">{textoPlata(vuelto!)}</span>
      </p>
    );
  }
  const cifra = (
    <p data-vender="total-fijo" className="min-w-0">
      <span className="block text-xs font-medium uppercase tracking-wide text-muted">{rotuloTotal}</span>
      <span aria-live="polite" className="font-display text-3xl leading-none tabular-nums text-accent-ink">
        {textoPlata(total)}
      </span>
    </p>
  );
  if (estado === "barra") {
    return (
      <div data-vender="pie-plegado" className="space-y-1 rounded-lg border border-line bg-surface-sunken p-3">
        <div className="flex items-center justify-between gap-3">
          {cifra}
          <button type="button" data-vender="abrir-cobro" className={PRIMARIO} disabled={motivo !== null} onClick={() => setAbierto(true)}>
            {textoDeCobrar(textoBoton, total)}
          </button>
        </div>
        {motivo && (
          <p role="status" className="text-xs font-medium text-muted">
            {motivo}
          </p>
        )}
      </div>
    );
  }
  return (
    <div data-vender="pie-abierto" ref={medios} className="rounded-lg border border-line bg-surface-sunken">
      <div className="flex items-center justify-between gap-3 px-3 pt-3">
        {cifra}
        <button type="button" className={VOLVER} onClick={() => setAbierto(false)}>
          Seguir cargando
        </button>
      </div>
      <PieDeCobro key={version} total={total} deshabilitado={deshabilitado} textoBoton={textoBoton} onCobrar={cobrar} />
      {alLado}
    </div>
  );
}
