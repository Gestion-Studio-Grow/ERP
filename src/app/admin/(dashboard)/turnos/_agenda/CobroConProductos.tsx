"use client";

// ============================================================================
// TERMINAR Y COBRAR TURNO + PRODUCTOS EN UN TOQUE (Venta y agenda simples, T1).
// ============================================================================
//
// Lo que muestra «Terminar» cuando se sumó al menos un producto: el saldo del turno, los productos
// (los renglones de `SumarProductos`, que llegan como `children`), el total y las teclas de medio.
// Un toque en el medio cobra TODO y termina el turno (`cobrarTurnoConProductos`: una transacción).
// Sin «Dividir» ni «Queda debiendo» acá: esos caminos no llevan productos; se sacan los productos y
// vuelven. La clave del cobro nace al abrir la hoja: un doble toque o un reintento no cobran dos veces.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Plata } from "@/components/ui";
import { cobrarTurnoConProductos } from "@/lib/turnos/cobro-con-producto-actions";
import { totalDelCobro, type MedioConProducto } from "@/lib/turnos/cobro-con-producto";
import { useToast } from "../../ToastProvider";
import { pesos, type EstadoDelTurno } from "../agenda-core";
import TeclasDeMedio from "../cerrar/TeclasDeMedio";
import type { RenglonDelCajon } from "./SumarProductos";

const ETIQUETA: Record<MedioConProducto, string> = {
  EFECTIVO: "efectivo",
  TRANSFERENCIA: "transferencia",
  MERCADOPAGO: "Mercado Pago",
  DEBITO: "débito",
  CREDITO: "crédito",
};

export default function CobroConProductos({
  turnoId,
  clienta,
  estado,
  saldo,
  renglones,
  conTarjeta,
  proximo,
  onListo,
  children,
}: {
  turnoId: string;
  clienta: string;
  estado: EstadoDelTurno;
  saldo: number;
  renglones: readonly RenglonDelCajon[];
  conTarjeta: boolean;
  proximo?: string | null;
  onListo?: () => void;
  children: React.ReactNode;
}) {
  const { showError, showSuccess } = useToast();
  const router = useRouter();
  const [clave] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");
  const [enCurso, setEnCurso] = useState<MedioConProducto | null>(null);
  const [pendiente, empezar] = useTransition();
  const vino = estado === "PENDING";
  const cuenta = totalDelCobro({ saldo, renglones: renglones.map((r) => ({ qty: r.qty, precio: r.producto.precio })) });

  const cobrar = (medio: MedioConProducto) => {
    if (pendiente) return; // un doble toque no manda dos veces (y si pasa, la clave lo frena)
    setError("");
    setEnCurso(medio);
    empezar(async () => {
      try {
        const f = new FormData();
        f.set("appointmentId", turnoId);
        f.set("method", medio);
        f.set("productos", JSON.stringify(renglones.map((r) => ({ productId: r.producto.id, qty: r.qty }))));
        f.set("clave", clave);
        if (vino) f.set("vino", "on");
        const r = await cobrarTurnoConProductos(f);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        // El monto del aviso es el que GRABÓ el servidor, nunca la cuenta del navegador.
        const monto = r.total != null ? `${pesos(r.total)} en ` : "en ";
        const destino = proximo && !vino ? proximo : null;
        showSuccess(
          `${vino ? "Vino" : "Terminado"} y cobrado: ${clienta}, ${monto}${ETIQUETA[medio]} (turno y productos).`,
          destino ? { texto: "Reservar el próximo", alTocar: () => router.push(destino) } : undefined,
        );
        if (r.aviso) showError(r.aviso);
        onListo?.();
      } catch {
        showError("No se pudo cobrar. Probá de nuevo; si sigue, avisá.");
      } finally {
        setEnCurso(null);
      }
    });
  };

  return (
    <div data-ui="cobro-con-productos" className="space-y-4">
      <div className="space-y-1 text-sm">
        <p className="flex items-baseline justify-between gap-3 text-muted">
          <span>{cuenta.turno > 0 ? "Falta del turno" : "El turno ya está cobrado"}</span>
          <Plata valor={cuenta.turno} sinCentavos={Number.isInteger(cuenta.turno)} />
        </p>
        <p className="flex items-baseline justify-between gap-3 text-muted">
          <span>Productos</span>
          <Plata valor={cuenta.productos} sinCentavos={Number.isInteger(cuenta.productos)} />
        </p>
      </div>
      {children}
      <div className="text-center">
        <p className="text-sm text-muted">Total a cobrar</p>
        <Plata valor={cuenta.total} tamano="grande" sinCentavos={Number.isInteger(cuenta.total)} />
      </div>
      <TeclasDeMedio
        tamano="grande"
        etiqueta={`Cobrar ${pesos(cuenta.total)}, turno y productos, y ${vino ? "cerrar como que vino" : "terminar"}, con`}
        onElegir={(m) => cobrar(m)}
        disabled={pendiente}
        enCurso={enCurso === "DEBITO" || enCurso === "CREDITO" ? null : enCurso}
      >
        {conTarjeta &&
          (["DEBITO", "CREDITO"] as const).map((m) => (
            <Button
              key={m}
              type="button"
              variant="outline"
              size="lg"
              className="min-h-13 w-full text-base"
              disabled={pendiente || (enCurso !== null && enCurso !== m)}
              estado={enCurso === m ? "cargando" : undefined}
              onClick={() => cobrar(m)}
            >
              {m === "DEBITO" ? "Débito" : "Crédito"}
            </Button>
          ))}
      </TeclasDeMedio>
      <p className="text-center text-xs text-muted">Un toque en el medio cobra todo junto y {vino ? "la marca como que vino" : "termina el turno"}.</p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
