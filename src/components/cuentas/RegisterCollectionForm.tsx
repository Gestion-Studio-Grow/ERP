"use client";

import { useState } from "react";
import { Input, Select, buttonClasses, fmtMoneyARS } from "@/components/ui";
import { validateNewCollection, type CollectionValidationError } from "@/lib/settlement/collection";

// Registrar un cobro/pago PARCIAL contra el saldo (D9). La validación de saldo es la
// misma regla PURA que corre el server (`validateNewCollection`, S1) → feedback inmediato
// sin sobre-cobrar. El submit va a una server action (prop): para "cobrar" se asienta un
// Collection (D9); para "pagar" el egreso se asienta cuando exista su modelo (el action lo
// resuelve). Canal neutro; el color acá lo pone solo el error de validación.

// El MEDIO no tiene valor por defecto: hay que elegirlo. Con "Efectivo" preseleccionado, un
// cobro por transferencia que se dejaba como venía se asentaba como efectivo y descuadraba el
// cajón; el servidor ya lo exige (`leerMedio`, settlement/asiento-libro.ts), y acá el botón no
// se habilita hasta elegirlo. Los valores son los de `MEDIOS_CUENTA_CORRIENTE` (lo verifica
// medio-sin-default.test.ts): no se importan para no sumar el libro de caja al cliente.
const MEDIOS_DEL_FORMULARIO = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "MERCADOPAGO", label: "Mercado Pago" },
] as const;

const ERROR_MSG: Record<CollectionValidationError, string> = {
  AMOUNT_NOT_POSITIVE: "El monto debe ser mayor a cero.",
  AMOUNT_NOT_FINITE: "Ingresá un monto válido.",
  EXCEEDS_BALANCE: "El monto supera el saldo pendiente.",
};

export function RegisterCollectionForm({
  accountId,
  saldo,
  kind,
  action,
}: {
  /** id de la cuenta (viaja oculto al server action para imputar el cobro/pago). */
  accountId: string;
  saldo: number;
  kind: "cobrar" | "pagar";
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState("");
  const medioElegido = MEDIOS_DEL_FORMULARIO.some((m) => m.value === metodo);
  const amt = Number(monto.trim().replace(",", "."));
  const touched = monto.trim() !== "";
  const validation = validateNewCollection(amt, saldo);
  const verbo = kind === "cobrar" ? "cobro" : "pago";

  return (
    <form action={action} className="rounded-lg border border-line p-4 space-y-3">
      <p className="text-sm font-medium text-strong">Registrar {verbo} parcial</p>
      <p className="text-xs text-muted">Saldo pendiente: {fmtMoneyARS(saldo)}</p>

      <input type="hidden" name="id" value={accountId} />
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
          <span className="block text-muted mb-1">Medio</span>
          <Select name="metodo" value={metodo} onChange={(e) => setMetodo(e.target.value)} required>
            <option value="" disabled>
              Elegí el medio
            </option>
            {MEDIOS_DEL_FORMULARIO.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
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
        <button type="submit" disabled={!validation.ok || !medioElegido} className={buttonClasses("solid", "sm")}>
          Registrar {verbo}
        </button>
      </div>
    </form>
  );
}
