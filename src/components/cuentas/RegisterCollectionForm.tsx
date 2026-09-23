"use client";

import { useRef, useState } from "react";
import { AvisoError, Input, Select, buttonClasses, fmtMoneyARS } from "@/components/ui";
import { validateNewCollection, type CollectionValidationError } from "@/lib/settlement/collection";
import { leerImporte } from "@/lib/pos-peso";
import { useAccionDirecta, type AccionDeCuenta } from "./useAccionDirecta";

// Registrar un cobro/pago PARCIAL contra el saldo (D9). La validación de saldo es la
// misma regla PURA que corre el server (`validateNewCollection`, S1) → feedback inmediato
// sin sobre-cobrar. El submit va a una server action (prop) que DEVUELVE su resultado: el
// rechazo del servidor —día cerrado, medio sin elegir, saldo que cambió en otra pestaña— se
// muestra acá, al lado del botón, y lo cargado queda. Antes la acción tiraba y el formulario
// fallaba mudo. La acción se invoca directo y se espera (`useAccionDirecta`), como el libro
// de caja: con `<form action>` los guardados podían quedar colgados en "Registrando…".
//
// El monto se lee como se escribe la plata acá (`leerImporte`): "100.000" son cien mil pesos.
// Antes se leía con `Number(x.replace(",", "."))` y "100.000" se registraba como $100.

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
  asientaEnLibro,
  anulada = false,
  tope,
}: {
  /** id de la cuenta (viaja oculto al server action para imputar el cobro/pago). */
  accountId: string;
  saldo: number;
  /**
   * Sólo cuentas a pagar: hasta cuánto se puede pagar a mano, que es el saldo menos lo que ya
   * cubren los cheques sin debitar. El banco va a debitar esos cheques igual: pagar esa parte
   * a mano la pagaría dos veces. El servidor aplica la misma regla (`validarPagoAMano`).
   */
  tope?: number;
  kind: "cobrar" | "pagar";
  action: AccionDeCuenta;
  /** ¿El cobro/pago entra solo al libro de caja? (CUENTAS_CORRIENTES_ENABLED). */
  asientaEnLibro: boolean;
  /** La cuenta está anulada: se ve su historia, no se le registra nada. */
  anulada?: boolean;
}) {
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  // Registrado: el formulario queda limpio para el próximo; el mensaje de éxito queda arriba.
  const { estado, enviar, pendiente } = useAccionDirecta(action, () => {
    setMonto("");
    setMetodo("");
    formRef.current?.reset();
  });
  const medioElegido = MEDIOS_DEL_FORMULARIO.some((m) => m.value === metodo);
  const lectura = leerImporte(monto);
  const amt = lectura.estado === "ok" ? lectura.valor : Number.NaN;
  const touched = monto.trim() !== "";
  const limite = tope === undefined ? saldo : Math.min(saldo, Math.max(0, tope));
  const cubiertoPorCheques = limite < saldo;
  const validation = validateNewCollection(amt, limite);
  const verbo = kind === "cobrar" ? "cobro" : "pago";

  const aviso =
    estado.estado === "ok" ? (
      <p role="status" className="rounded-md bg-success-soft px-3 py-2 text-sm text-success">
        {estado.mensaje}
      </p>
    ) : estado.estado === "error" ? (
      <AvisoError
        titulo={`No se registró el ${verbo}`}
        comoSeguir={estado.mensaje}
      />
    ) : null;

  // Saldada, anulada o cubierta entera por cheques: no hay nada que registrar a mano, pero el
  // último resultado se sigue viendo.
  if (anulada || !(saldo > 0) || !(limite > 0)) {
    const texto = anulada
      ? `Esta cuenta está anulada: ya no se le registran ${kind === "cobrar" ? "cobros" : "pagos"}.`
      : !(saldo > 0)
        ? kind === "cobrar"
          ? "La cuenta está saldada: no queda nada por cobrar."
          : "La deuda está saldada: no queda nada por pagar."
        : `Lo que falta pagar (${fmtMoneyARS(saldo)}) ya lo cubren cheques que todavía no se debitaron: cuando el banco los debite, marcalos abajo y ahí se registra el pago. Si uno rebotó o se anuló, marcalo y el pago a mano vuelve a habilitarse.`;
    return (
      <div className="space-y-3 rounded-lg border border-line p-4">
        {aviso}
        <p className="text-sm text-body">{texto}</p>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        if (!validation.ok || !medioElegido || pendiente) return;
        enviar(new FormData(e.currentTarget));
      }}
      className="rounded-lg border border-line p-4 space-y-3"
    >
      <p className="text-sm font-medium text-strong">Registrar {verbo} parcial</p>
      <p className="text-xs text-muted">
        Saldo pendiente: {fmtMoneyARS(saldo)}
        {cubiertoPorCheques
          ? ` · ${fmtMoneyARS(saldo - limite)} ya lo cubren cheques sin debitar: a mano podés pagar hasta ${fmtMoneyARS(limite)}.`
          : ""}
      </p>
      {aviso}

      <input type="hidden" name="id" value={accountId} />
      <input type="hidden" name="monto" value={validation.ok ? String(validation.amount) : ""} />
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
        <p className="text-sm text-danger">
          {lectura.estado === "invalida"
            ? "Escribí el monto con números: 100.000 o 1.500,50."
            : validation.error === "EXCEEDS_BALANCE" && cubiertoPorCheques
              ? `A mano podés pagar hasta ${fmtMoneyARS(limite)}: el resto ya lo cubren los cheques sin debitar.`
              : ERROR_MSG[validation.error]}
        </p>
      )}

      <p className="text-xs text-muted">
        {asientaEnLibro
          ? `El ${verbo} entra solo al libro de caja de hoy, con el medio que elijas.`
          : `El ${verbo} queda en la cuenta, pero todavía no pasa solo al libro de caja: si ${kind === "cobrar" ? "entró" : "salió"} plata del cajón, anotala también en el libro.`}
      </p>

      <div className="flex justify-end">
        <button type="submit" disabled={!validation.ok || !medioElegido || pendiente} className={buttonClasses("solid", "md")}>
          {pendiente ? "Registrando…" : `Registrar ${verbo}`}
        </button>
      </div>
    </form>
  );
}
