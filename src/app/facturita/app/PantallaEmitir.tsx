"use client";

/**
 * La pantalla de emitir: arriba «Mis productos» (el camino de dos toques), abajo el formulario
 * completo para todo lo demás. Un producto que pide más datos —o que la persona quiere cambiar—
 * baja al formulario precargado (se vuelve a montar con su `key` para tomar los valores nuevos).
 */

import { useRef, useState } from "react";
import type { Atajo } from "@/lib/facturita-atajos";
import { emitirFacturitaAction, guardarAtajoFacturitaAction, quitarAtajoFacturitaAction } from "@/lib/facturita-actions";
import EmitirForm from "./EmitirForm";
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
}: {
  productos: Atajo[];
  ultima: Atajo | null;
  condicionEmisor: string | null;
  bloqueado: boolean;
  hoy: string;
}) {
  const [inicial, setInicial] = useState<{ atajo: Atajo; vez: number } | null>(null);
  const formulario = useRef<HTMLElement>(null);

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
            formulario.current?.querySelector<HTMLElement>("#ft-descripcion")?.focus({ preventScroll: true });
          });
        }}
      />
      <section ref={formulario} aria-labelledby="otra-factura" className="flex flex-col gap-4 border-t border-line pt-6">
        <h2 id="otra-factura" className="text-base font-semibold text-strong">
          {inicial ? "Revisá y completá" : "Otra factura"}
        </h2>
        <EmitirForm
          key={inicial?.vez ?? 0}
          inicial={inicial?.atajo ?? null}
          bloqueado={bloqueado}
          inscripto={condicionEmisor === "RESPONSABLE_INSCRIPTO"}
          hoy={hoy}
        />
      </section>
    </div>
  );
}
