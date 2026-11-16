"use client";

// CRM COMERCIAL · «Hoy»: la acción en un toque de cada renglón. Sólo llegan las que le tocan a esta persona
// (crm-core.armarBandeja); el servidor igual vuelve a comprobar el permiso y, si rechaza, se muestra su motivo.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input, buttonClasses, atributosBoton } from "@/components/ui";
import { aprobarBorrador, aprobarPasePropuesto, cerrarPedido, cerrarTarea, rechazarPasePropuesto, registrarPedidoDeDatos, tomarPedido, tomarTarea } from "@/lib/crm-comercial/acciones";
import type { AccionHoy } from "./crm-core";
import { Resultado } from "./Avisos";
import { useAccion } from "./useAccion";

export function AccionesHoy({ acciones, href }: { acciones: readonly AccionHoy[]; href: string | null }) {
  const { correr, pendiente, motivo, hecho } = useAccion();
  const router = useRouter();
  const [rechazando, setRechazando] = useState<string | null>(null);
  const [porque, setPorque] = useState("");

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        {acciones.map((a, i) => {
          switch (a.tipo) {
            case "aprobar_pase":
              return a.necesitaFicha ? (
                <Link key={i} href={`/admin/crm/${a.oportunidadId}#pase`} className={buttonClasses("solid", "sm")} {...atributosBoton("solid", "sm")}>
                  Elegir comercial y aprobar
                </Link>
              ) : (
                <Button key={i} size="sm" disabled={pendiente} onClick={() => correr(() => aprobarPasePropuesto(a.oportunidadId, { version: a.version }), { listo: `Listo: pasó a «${a.destino}».` })}>
                  Aprobar pase a «{a.destino}»
                </Button>
              );
            case "rechazar_pase":
              return (
                <Button key={i} size="sm" variant="outline" disabled={pendiente} onClick={() => setRechazando(rechazando ? null : a.oportunidadId)} aria-expanded={rechazando === a.oportunidadId}>
                  No aprobar
                </Button>
              );
            case "aprobar_borrador":
              return (
                <Button key={i} size="sm" disabled={pendiente} onClick={() => correr(() => aprobarBorrador(a.borradorId), { listo: "Borrador aprobado. Ahora mandalo y marcalo como enviado." })}>
                  Aprobar borrador
                </Button>
              );
            case "ir_a_borradores":
              return (
                <Link key={i} href="/admin/crm/borradores" className={buttonClasses("outline", "sm")} {...atributosBoton("outline", "sm")}>
                  Leer, corregir o mandar
                </Link>
              );
            case "pedido_de_datos":
              return (
                <Button key={i} size="sm" variant="outline" disabled={pendiente} onClick={() => correr(() => registrarPedidoDeDatos(a.oportunidadId), { listo: "Quedó registrado que pediste los datos." })}>
                  Ya pedí los datos
                </Button>
              );
            case "tomar_tarea":
              return (
                <Button key={i} size="sm" disabled={pendiente} onClick={() => correr(() => tomarTarea({ tareaId: a.tareaId }), { alTerminar: (r) => r.tarea && router.push(`/admin/crm/${r.tarea.oportunidadId}`) })}>
                  Tomar
                </Button>
              );
            case "cerrar_tarea":
              return (
                <Button key={i} size="sm" variant="outline" disabled={pendiente} onClick={() => correr(() => cerrarTarea(a.tareaId, { estado: "HECHA" }), { listo: "Tarea cerrada." })}>
                  Marcar hecha
                </Button>
              );
            case "tomar_pedido":
              return (
                <Button key={i} size="sm" disabled={pendiente} onClick={() => correr(() => tomarPedido({ pedidoId: a.pedidoId }), { listo: "Pedido tomado: quedó a tu nombre." })}>
                  Tomar pedido
                </Button>
              );
            case "cerrar_pedido":
              return (
                <Button key={i} size="sm" variant="outline" disabled={pendiente} onClick={() => correr(() => cerrarPedido(a.pedidoId, { estado: "HECHO" }), { listo: "Pedido cerrado." })}>
                  Marcar hecho
                </Button>
              );
          }
        })}
        {href && (
          <Link href={href} className={buttonClasses("ghost", "sm")} {...atributosBoton("ghost", "sm")}>
            Abrir
          </Link>
        )}
      </div>
      {rechazando && (
        <form
          className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            correr(() => rechazarPasePropuesto(rechazando, porque), { listo: "El pase no se aplicó; quedó el porqué.", alTerminar: () => (setRechazando(null), setPorque("")) });
          }}
        >
          <label className="min-w-0 flex-1 text-sm">
            <span className="mb-1 block font-medium text-strong">Por qué no se aplica</span>
            <Input value={porque} onChange={(e) => setPorque(e.target.value)} required maxLength={500} />
          </label>
          <Button size="sm" type="submit" disabled={pendiente}>
            Confirmar
          </Button>
        </form>
      )}
      <Resultado motivo={motivo} hecho={hecho} />
    </div>
  );
}
