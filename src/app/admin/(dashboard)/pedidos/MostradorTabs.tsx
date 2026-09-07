"use client";

// MOSTRADOR: dos cosas se cobran acá, y hasta ahora sólo estaba una.
//
// El mostrador vendía únicamente PRODUCTOS. Un servicio sólo se podía cobrar desde un
// turno, así que atender a alguien que entra sin turno eran dos pantallas: crear el turno
// en Agenda y volver a cobrarlo. Ahora el mismo mostrador tiene las dos solapas.
//
// Y el servicio NO se vende como una línea suelta de pedido, a propósito: se elige
// profesional y horario, o sea que se crea un TURNO de verdad. Ésa es la diferencia que
// importa para la trazabilidad — un servicio cobrado como línea de pedido no tendría
// profesional, y sin profesional no hay comisión, no aparece en los reportes por
// profesional ni en la ficha de la clienta, y la agenda no se entera de que ese box
// estuvo ocupado. Con turno, todo eso sigue funcionando sin tocar una línea.

import { useState } from "react";
import PosForm from "./PosForm";
import NewAppointmentForm from "../turnos/NewAppointmentForm";
import { cn } from "@/components/ui";

type Service = { id: string; name: string; durationMin: number; price: number; residentPrice: number | null; depositAmount: number | null };
type Professional = { id: string; name: string; services: Service[]; box: { name: string } | null };

export default function MostradorTabs({
  products,
  stockById,
  professionals,
  productosBloqueados,
}: {
  // Se pasan tal cual al formulario de productos: este componente no sabe de stock.
  products: React.ComponentProps<typeof PosForm>["products"];
  stockById: React.ComponentProps<typeof PosForm>["stockById"];
  professionals: Professional[];
  /** Motivo por el que no se puede vender producto (catálogo vacío / sin precios). */
  productosBloqueados?: React.ReactNode;
}) {
  const hayServicios = professionals.some((p) => p.services.length > 0);
  // Si no se puede vender producto pero sí servicios, se abre directo en Servicios: no
  // tiene sentido recibir a la persona con una pantalla vacía cuando hay algo que hacer.
  const [tab, setTab] = useState<"productos" | "servicios">(
    productosBloqueados && hayServicios ? "servicios" : "productos",
  );

  return (
    <div>
      <div role="tablist" aria-label="Qué se cobra" className="mb-4 flex gap-1 rounded-lg border border-line bg-surface-sunken p-1 w-fit">
        {([
          ["productos", "Productos"],
          ["servicios", "Servicios"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm transition-colors",
              tab === id ? "bg-surface-raised font-medium text-strong shadow-xs" : "text-muted hover:text-strong",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "productos" ? (
        productosBloqueados ?? <PosForm products={products} stockById={stockById} />
      ) : hayServicios ? (
        <NewAppointmentForm professionals={professionals} origen="mostrador" />
      ) : (
        <p className="rounded-lg border border-line bg-surface-raised p-6 text-sm text-muted">
          No hay servicios para cobrar: falta cargar profesionales con sus servicios en el
          catálogo.
        </p>
      )}
    </div>
  );
}
