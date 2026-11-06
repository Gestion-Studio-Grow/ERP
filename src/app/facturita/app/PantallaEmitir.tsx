"use client";

/**
 * La pantalla de emitir de Factoque: arriba «Mis productos» (el camino de dos toques, lo propio de
 * Factoque), abajo el facturador guiado COMÚN (a quién · qué · confirmar), el mismo del panel de
 * cualquier negocio y de la consola del contador. Un producto que pide más datos —o que la persona
 * quiere cambiar— baja al facturador precargado (se vuelve a montar con su `key`).
 */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { buttonClasses } from "@/components/ui";
import type { Atajo } from "@/lib/facturita-atajos";
import { emitirFacturitaAction, guardarAtajoFacturitaAction, quitarAtajoFacturitaAction } from "@/lib/facturita-actions";
import EmitirComprobante, { ResultadoDeEmision } from "@/components/facturacion/EmitirComprobante";
import type { ResultadoEmisionFacturita } from "@/lib/facturita-actions";
import type { DatosEmisorForm } from "@/lib/facturita-emisor";
import DatosParaFacturas from "./cuenta/DatosParaFacturas";
import MisProductos, { type AccionesMisProductos } from "./MisProductos";

const ACCIONES: AccionesMisProductos = {
  emitir: emitirFacturitaAction,
  guardar: guardarAtajoFacturitaAction,
  quitar: quitarAtajoFacturitaAction,
};

export default function PantallaEmitir({
  productos,
  ultima,
  condicionEmisor,
  bloqueado,
  hoy,
  ambito,
  motivoBloqueo,
  datosEmisor,
  regimenFacturaA,
}: {
  /** Los datos del PDF (razón social, domicilio…): si faltan, se piden en el resultado (F3). */
  datosEmisor: { inicial: DatosEmisorForm; completos: boolean };
  regimenFacturaA: "A" | "A_CON_LEYENDA" | "M" | null;
  /** Para recordar en el dispositivo los últimos compradores de ESTE negocio. */
  ambito: string;
  /** Por qué no se puede emitir (el tope del mes), si `bloqueado`. */
  motivoBloqueo?: string | null;
  productos: Atajo[];
  ultima: Atajo | null;
  condicionEmisor: string | null;
  bloqueado: boolean;
  hoy: string;
}) {
  const [inicial, setInicial] = useState<{ atajo: Atajo; vez: number } | null>(null);
  const formulario = useRef<HTMLElement>(null);
  const router = useRouter();
  // F2: la factura de «Mis productos» sale ARRIBA, con letra, número, CAE, PDF y WhatsApp.
  const [hecha, setHecha] = useState<{ r: Extract<ResultadoEmisionFacturita, { ok: true }>; total: number } | null>(null);
  const arriba = useRef<HTMLDivElement>(null);
  const pdf = {
    href: (id: string) => `/facturita/app/facturas/${encodeURIComponent(id)}/pdf`,
    // F3: sin razón social ni domicilio el PDF no sale: se piden acá, no un aviso sin salida.
    faltanDatos: datosEmisor.completos ? null : (
      <DatosParaFacturas inicial={datosEmisor.inicial} completos={false} enElResultado alGuardar={() => router.refresh()} />
    ),
  };
  // F4: el tope del mes, dicho claro y con la salida.
  const tope = bloqueado
    ? {
        titulo: "Llegaste al tope de facturas gratis de este mes",
        motivo:
          (motivoBloqueo ?? "Usaste las facturas gratis de este mes.").replace(
            /^Llegaste al tope de (\d+) facturas gratis de este mes\.\s*/,
            "Ya usaste las $1 facturas gratis. ",
          ) +
          " Las que ya emitiste siguen valiendo. Si no cambiás de plan, el mes que viene volvés a tener las gratis.",
        accion: { href: "/facturita/planes", etiqueta: "Ver los planes" },
      }
    : null;

  return (
    <div className="flex flex-col gap-8">
      {tope && (
        <div role="alert" className="flex flex-col gap-2 rounded-xl border border-warning bg-warning-soft px-4 py-4 text-sm text-strong">
          <p className="m-0 text-base font-semibold">{tope.titulo}</p>
          <p className="m-0">{tope.motivo}</p>
          <Link href={tope.accion.href} className={`${buttonClasses("solid")} self-start`}>
            {tope.accion.etiqueta}
          </Link>
        </div>
      )}
      <div ref={arriba} tabIndex={-1} aria-live="polite" className="scroll-mt-20 focus:outline-none">
        {hecha && <ResultadoDeEmision r={hecha.r} total={hecha.total} pdf={pdf} />}
      </div>
      <MisProductos
        onEmitida={(r, total) => {
          setHecha({ r, total });
          requestAnimationFrame(() => {
            arriba.current?.focus({ preventScroll: true });
            arriba.current?.scrollIntoView({ block: "start" });
          });
        }}
        productos={productos}
        ultima={ultima}
        condicionEmisor={condicionEmisor}
        bloqueado={bloqueado}
        acciones={ACCIONES}
        onEditar={(atajo) => {
          setInicial((v) => ({ atajo, vez: (v?.vez ?? 0) + 1 }));
          requestAnimationFrame(() => {
            formulario.current?.scrollIntoView({ block: "start" });
            formulario.current?.querySelector<HTMLElement>("input")?.focus({ preventScroll: true });
          });
        }}
      />
      <section ref={formulario} aria-labelledby="otra-factura" className="flex flex-col gap-4 border-t border-line pt-6">
        <h2 id="otra-factura" className="text-base font-semibold text-strong">
          {inicial ? "Revisá y completá" : "Otra factura"}
        </h2>
        <EmitirComprobante
          key={inicial?.vez ?? 0}
          emitir={emitirFacturitaAction}
          condicionEmisor={condicionEmisor}
          hoy={hoy}
          ambito={ambito}
          bloqueado={tope ? { motivo: "Con el tope del mes no se puede emitir: mirá arriba qué hacer." } : null}
          regimenFacturaA={regimenFacturaA}
          pdf={pdf}
          inicial={
            inicial
              ? { descripcion: inicial.atajo.detalle, total: String(inicial.atajo.precio).replace(".", ","), concepto: inicial.atajo.concepto }
              : null
          }
          rutas={{ datosFiscales: "/facturita/app/cuenta", comprobantes: "/facturita/app/facturas", plan: "/facturita/planes" }}
          alEmitir={() => router.refresh()}
        />
      </section>
    </div>
  );
}
