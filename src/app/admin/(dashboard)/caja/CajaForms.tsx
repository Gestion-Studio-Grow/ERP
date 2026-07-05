"use client";

// Formularios de la caja del POS, sobre el design system. Cada uno maneja su
// estado de error inline con `useActionState` (las acciones DEVUELVEN el error en
// vez de lanzar, así el mostrador ve el mensaje al lado del campo, no la pantalla
// de error de Next) y el estado de envío con `SubmitButton` (useFormStatus).
//
// Son client components finos: la carga de datos y el arqueo en vivo viven en el
// server component (page.tsx). Acá solo va la interacción del formulario.

import { useActionState, useEffect, useRef, useState } from "react";
import {
  openCashSession,
  addCashMovement,
  closeCashSession,
  type CajaActionState,
} from "@/lib/caja-actions";
import { round2 } from "@/lib/caja/cash-register";
import { Field, Input, Select, buttonClasses } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";

// Formateador de pesos para el preview del arqueo en el cliente (mismo estilo que
// la pantalla server). Vive acá para no acoplar el client component al server.
const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

// Mensaje de error del formulario. `role="alert"` → el lector de pantalla lo
// anuncia apenas aparece, sin robar el foco.
function FormError({ state }: { state: CajaActionState }) {
  if (!state || state.ok) return null;
  return (
    <p
      role="alert"
      className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger"
    >
      {state.error}
    </p>
  );
}

// --- Apertura de turno (estado sin caja abierta) ---
export function OpenCajaForm() {
  const [state, formAction] = useActionState<CajaActionState, FormData>(openCashSession, null);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="Fondo inicial" htmlFor="openingFloat" required hint="Efectivo con el que arranca el cajón.">
        <Input
          id="openingFloat"
          type="number"
          name="openingFloat"
          min="0"
          step="0.01"
          defaultValue="0"
          required
          inputMode="decimal"
          className="w-44 text-right tabular-nums"
        />
      </Field>
      <FormError state={state} />
      <div>
        <SubmitButton className={buttonClasses("solid", "md")} pendingText="Abriendo…">
          Abrir caja
        </SubmitButton>
      </div>
    </form>
  );
}

// --- Registrar movimiento manual (ingreso / egreso / retiro) ---
export function AddMovementForm() {
  const [state, formAction] = useActionState<CajaActionState, FormData>(addCashMovement, null);
  const formRef = useRef<HTMLFormElement>(null);
  // Tras un alta exitosa, limpiar el formulario para el próximo movimiento (el
  // turno sigue abierto y el form queda en pantalla). Cada éxito devuelve un objeto
  // nuevo → el efecto se dispara en cada registro.
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[10rem_10rem_1fr]">
        <Field label="Tipo" htmlFor="mov-type">
          <Select id="mov-type" name="type" defaultValue="INGRESO">
            <option value="INGRESO">Ingreso</option>
            <option value="EGRESO">Egreso</option>
            <option value="RETIRO">Retiro</option>
          </Select>
        </Field>
        <Field label="Monto" htmlFor="mov-amount" required>
          <Input
            id="mov-amount"
            type="number"
            name="amount"
            min="0.01"
            step="0.01"
            required
            inputMode="decimal"
            className="text-right tabular-nums"
          />
        </Field>
        <Field label="Motivo" htmlFor="mov-reason" required>
          <Input
            id="mov-reason"
            type="text"
            name="reason"
            required
            placeholder="Pago a proveedor, cambio, retiro a caja fuerte…"
          />
        </Field>
      </div>
      <FormError state={state} />
      <div>
        <SubmitButton className={buttonClasses("outline", "md")} pendingText="Registrando…">
          Registrar movimiento
        </SubmitButton>
      </div>
    </form>
  );
}

// Preview del arqueo EN VIVO: dado el efectivo contado que se está tipeando y el
// esperado, devuelve la diferencia y cómo mostrarla. `null` = todavía no hay un
// contado válido para comparar (no mostramos nada). Reusa `round2` de la aritmética
// pura para que el preview cuadre exactamente con lo que congelará el cierre
// (mismo redondeo que `reconcileCash`).
type ArqueoPreview = { diff: number; label: string; tone: "success" | "danger" | "neutral" };
function previewArqueo(countedRaw: string, expected: number): ArqueoPreview | null {
  const trimmed = countedRaw.trim();
  if (trimmed === "") return null;
  const counted = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(counted) || counted < 0) return null;
  const diff = round2(counted - expected);
  if (diff === 0) return { diff, label: "Cuadra", tone: "neutral" };
  if (diff < 0) return { diff, label: `Faltante ${money.format(Math.abs(diff))}`, tone: "danger" };
  return { diff, label: `Sobrante ${money.format(diff)}`, tone: "success" };
}

// --- Cierre / arqueo del turno ---
export function CloseCajaForm({ expected }: { expected: number }) {
  const [state, formAction] = useActionState<CajaActionState, FormData>(closeCashSession, null);
  // Efectivo contado controlado para poder previsualizar la diferencia ANTES de
  // confirmar el cierre (que es irreversible): el cajero ve si va a quedar faltante
  // o sobrante mientras tipea, no después de cerrar.
  const [counted, setCounted] = useState("");
  const preview = previewArqueo(counted, expected);
  const previewTone =
    preview?.tone === "danger"
      ? "text-danger"
      : preview?.tone === "success"
        ? "text-success"
        : "text-muted";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
        <Field
          label="Efectivo contado"
          htmlFor="counted"
          required
          hint={`Se compara con el esperado (${money.format(expected)}).`}
        >
          <Input
            id="counted"
            type="number"
            name="counted"
            min="0"
            step="0.01"
            required
            inputMode="decimal"
            className="text-right tabular-nums"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
          />
        </Field>
        <Field label="Nota (opcional)" htmlFor="close-note">
          <Input id="close-note" type="text" name="note" placeholder="Observaciones del cierre…" />
        </Field>
      </div>

      {/* Preview del arqueo en vivo: aria-live para que el lector de pantalla anuncie
          la diferencia a medida que se tipea el contado. */}
      {preview && (
        <p className="text-sm" aria-live="polite" aria-atomic="true">
          <span className="text-muted">Diferencia: </span>
          <span className={`font-medium tabular-nums ${previewTone}`}>{preview.label}</span>
        </p>
      )}

      <FormError state={state} />
      <div>
        <SubmitButton className={buttonClasses("danger", "md")} pendingText="Cerrando…">
          Cerrar caja
        </SubmitButton>
      </div>
    </form>
  );
}
