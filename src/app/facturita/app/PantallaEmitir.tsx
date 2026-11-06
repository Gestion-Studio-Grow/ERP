"use client";

/**
 * La pantalla de emitir de Factoque: arriba «Mis productos» (el camino de dos toques, lo propio de
 * Factoque), abajo el facturador guiado COMÚN (a quién · qué · confirmar), el mismo del panel de
 * cualquier negocio y de la consola del contador. Un producto que pide más datos —o que la persona
 * quiere cambiar— baja al facturador precargado (se vuelve a montar con su `key`).
 */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Atajo } from "@/lib/facturita-atajos";
import { emitirFacturitaAction, guardarAtajoFacturitaAction, quitarAtajoFacturitaAction } from "@/lib/facturita-actions";
import FacturadorGuiado from "@/components/facturacion/FacturadorGuiado";
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
}: {
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

  return (
    <div className="flex flex-col gap-8">
      <MisProductos
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
        <FacturadorGuiado
          key={inicial?.vez ?? 0}
          emitir={emitirFacturitaAction}
          condicionEmisor={condicionEmisor}
          hoy={hoy}
          ambito={ambito}
          bloqueado={bloqueado ? { motivo: motivoBloqueo ?? "Llegaste al tope de facturas gratis de este mes." } : null}
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
