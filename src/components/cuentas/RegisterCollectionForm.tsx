"use client";

import { useState } from "react";
import { Input, Select, buttonClasses, fmtMoneyARS } from "@/components/ui";
import { validateNewCollection, type CollectionValidationError } from "@/lib/settlement/collection";

// Registrar un cobro/pago PARCIAL contra el saldo (D9). La validación de saldo es la
// misma regla PURA que corre el server (`validateNewCollection`, S1) → feedback inmediato
// sin sobre-cobrar. El submit va a una server action (prop): para "cobrar" se asienta un
// Collection (D9); para "pagar" el egreso se asienta cuando exista su modelo (el action lo
// resuelve). Canal neutro; el color acá lo pone solo el error de validación.

const ERROR_MSG: Record<CollectionValidationError, string> = {
  AMOUNT_NOT_POSITIVE: "El monto debe ser mayor a cero.",
  AMOUNT_NOT_FINITE: "Ingresá un monto válido.",
  EXCEEDS_BALANCE: "El monto supera el saldo pendiente.",
};

export function RegisterCollectionForm({
  saldo,
  kind,
  action,
}: {
  saldo: number;
  kind: "cobrar" | "pagar";
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [monto, setMonto] = useState("");
  const amt = Number(monto.trim().replace(",", "."));
  const touched = monto.trim() !== "";
  const validation = validateNewCollection(amt, saldo);
  const verbo = kind === "cobrar" ? "cobro" : "pago";

  return (
    <form action={action} className="rounded-lg border border-line p-4 space-y-3">
      <p className="text-sm font-medium text-strong">Registrar {verbo} parcial</p>
      <p className="text-xs text-muted">Saldo pendiente: {fmtMoneyARS(saldo)}</p>

      <input type="hidden" name="monto" value={validation.ok ? validation.amount : ""} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="block text-muted mb-1">Monto del {verbo}</span>
          <Input
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
            className="text-right tabular-nums"
            aria-invalid={touched && !validation.ok}
          />
        </label>
        <label className="text-sm">
          <span className="block text-muted mb-1">Método</span>
          <Select name="metodo" defaultValue="EFECTIVO">
            <option value="EFECTIVO">Efectivo</option>
            <option value="TRANSFERENCIA">Transferencia</option>
            <option value="MERCADOPAGO">Mercado Pago</option>
          </Select>
        </label>
      </div>
      <label className="text-sm block">
        <span className="block text-muted mb-1">Nota (opcional)</span>
        <Input name="nota" placeholder="ej: seña, entrega parcial" />
      </label>

      {touched && !validation.ok && (
        <p className="text-sm text-danger">{ERROR_MSG[validation.error]}</p>
      )}

      <div className="flex justify-end">
        <button type="submit" disabled={!validation.ok} className={buttonClasses("solid", "sm")}>
          Registrar {verbo}
        </button>
      </div>
    </form>
  );
}
