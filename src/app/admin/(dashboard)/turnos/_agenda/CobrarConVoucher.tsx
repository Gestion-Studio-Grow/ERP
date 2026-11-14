"use client";

// ============================================================================
// COBRAR CON VOUCHER — CH · vouchers de La Alameda (docs/tenants/ch/VOUCHERS-OPENKEY.md).
// ============================================================================
//
// Sólo existe con el interruptor «vouchers» prendido (`permisos.vouchers`); apagado, el cajón no
// lo monta y queda como antes. Plegado por defecto: el voucher es la excepción, no el cobro de
// siempre. Se escribe el número (y, si el voucher no cubre todo, el monto: vacío = el saldo) y
// `aplicarVoucherAlTurno` valida en una transacción (del negocio, disponible, de ESTE vecino, que
// OpenKey no lo dé por usado). Un rechazo se muestra tal cual («Este voucher es de otro vecino…»).
// Lo que el voucher no cubre se cobra después con los medios de siempre. El doble toque no cobra
// dos veces: el botón se apaga mientras corre y el servidor usa la clave `voucher:<id>`.

import { useId, useState, useTransition } from "react";
import { aplicarVoucherAlTurno } from "@/lib/vouchers/voucher-actions";
import { completeAppointment } from "@/lib/actions";
import { aFormData, camposDeTerminar } from "./campos";
import { Button, Input } from "@/components/ui";
import { useToast } from "../../ToastProvider";
import { pesos } from "../agenda-core";
import { montoParaEditar } from "./CobrarTurno";

export default function CobrarConVoucher({
  turnoId,
  clienta,
  saldo,
  terminarAlSaldar,
  onListo,
}: {
  turnoId: string;
  clienta: string;
  saldo: number;
  /**
   * Presente = el turno ya se puede cerrar (la tecla «Terminar»/«Vino» del cajón): si el voucher
   * cubre todo, se termina por el MISMO camino que con efectivo (`completeAppointment` sin medio,
   * como «Terminar el turno» con saldo 0 en TerminarTurno). Ausente: sólo se aplica el voucher.
   */
  terminarAlSaldar?: { estado: string };
  onListo?: () => void;
}) {
  const id = useId();
  const { showSuccess, showError } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [numero, setNumero] = useState("");
  const [monto, setMonto] = useState("");
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  // El Input del kit no reenvía `ref`: el foco se pone por id.
  const enfocarNumero = () => document.getElementById(`${id}-numero`)?.focus();

  const abrir = () => {
    setAbierto(true);
    // El foco al número, apenas se ve el campo (teclado: Enter en «Paga con voucher» y escribir).
    requestAnimationFrame(enfocarNumero);
  };

  const aplicar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pendiente) return;
    const n = numero.trim();
    if (!n) {
      setError("Escribí el número del voucher.");
      enfocarNumero();
      return;
    }
    const fd = new FormData();
    fd.set("appointmentId", turnoId);
    fd.set("numero", n);
    if (monto.trim()) fd.set("monto", monto.trim());
    setError("");
    empezar(async () => {
      try {
        const r = await aplicarVoucherAlTurno(fd);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        const v = r.valor;
        let cierre = "El turno quedó saldado.";
        if (v.saldoDespues <= 0 && terminarAlSaldar) {
          const t = await completeAppointment(aFormData(camposDeTerminar({ turnoId, saldo: 0, cobro: null, estado: terminarAlSaldar.estado })));
          cierre = t.ok
            ? terminarAlSaldar.estado === "PENDING"
              ? "Vino y quedó terminado."
              : "Quedó terminado."
            : `El turno quedó saldado pero no se pudo terminar: ${t.error}`;
        }
        showSuccess(
          `Voucher ${v.numero} aplicado a ${clienta}: ${pesos(v.valorCubierto)}. ` +
            (v.saldoDespues > 0 ? `Falta cobrar ${pesos(v.saldoDespues)} con otro medio.` : cierre) +
            (v.sinVerificar ? " La administración del country todavía no lo informó: se verifica con la próxima planilla." : ""),
        );
        setNumero("");
        setMonto("");
        setAbierto(false);
        onListo?.();
      } catch {
        showError("No se pudo aplicar el voucher. Probá de nuevo; si sigue, avisá.");
      }
    });
  };

  if (!abierto) {
    return (
      <Button type="button" variant="outline" size="md" className="w-full" aria-expanded={false} aria-controls={`${id}-form`} onClick={abrir}>
        Paga con voucher de La Alameda
      </Button>
    );
  }

  return (
    <form id={`${id}-form`} data-ui="cobrar-con-voucher" onSubmit={aplicar} className="space-y-3" aria-busy={pendiente || undefined}>
      <div>
        <label htmlFor={`${id}-numero`} data-ui="rotulo" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
          Número de voucher
        </label>
        <Input
          id={`${id}-numero`}
          autoComplete="off"
          inputMode="text"
          value={numero}
          maxLength={40}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => setNumero(e.target.value)}
          className="font-mono"
        />
      </div>
      <div>
        <label htmlFor={`${id}-monto`} data-ui="rotulo" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
          Cuánto cubre (opcional)
        </label>
        <Input
          id={`${id}-monto`}
          importe
          inputMode="decimal"
          autoComplete="off"
          placeholder={montoParaEditar(saldo)}
          value={monto}
          aria-describedby={`${id}-ayuda`}
          onChange={(e) => setMonto(e.target.value)}
          className="text-right tabular-nums"
        />
        <p id={`${id}-ayuda`} className="mt-1 text-xs text-muted">
          Vacío, cubre lo que falta ({pesos(saldo)}), hasta el valor del voucher si el negocio lo tiene configurado. Lo que no cubra se cobra con otro medio.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" size="lg" className="w-full sm:flex-1" disabled={pendiente} estado={pendiente ? "cargando" : undefined}>
          Cobrar con voucher
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          disabled={pendiente}
          aria-expanded
          aria-controls={`${id}-form`}
          onClick={() => {
            setAbierto(false);
            setError("");
          }}
        >
          Cancelar
        </Button>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
