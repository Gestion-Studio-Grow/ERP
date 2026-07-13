"use client";

// Formulario de cambio de contraseña (portón forzado). Feedback de fuerza EN VIVO con la MISMA
// función que valida el server (`validatePasswordStrength`) — el cliente solo ayuda; la fuente de
// verdad es el Server Action, que re-valida todo.

import { useState } from "react";
import { Field, Input, buttonClasses } from "@/components/ui";
import { validatePasswordStrength, MIN_PASSWORD_LENGTH } from "@/lib/password-policy";
import { changeOwnPassword } from "@/lib/change-password-actions";

const STATUS_MESSAGES: Record<string, string> = {
  error_current: "La contraseña actual no es correcta.",
  error_same: "La contraseña nueva no puede ser igual a la temporal.",
  error_mismatch: "La nueva y su confirmación no coinciden.",
  error_weak: `La contraseña nueva es demasiado débil (mínimo ${MIN_PASSWORD_LENGTH} caracteres, con letras y números).`,
  error: "No pudimos cambiar la contraseña. Probá de nuevo.",
};

export function ChangePasswordForm({ status }: { status?: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const check = validatePasswordStrength(next);
  const matches = next.length > 0 && next === confirm;
  const notSame = next.length > 0 && next !== current;
  const canSubmit = current.length > 0 && check.ok && matches && notSame;

  const serverError = status ? STATUS_MESSAGES[status] : undefined;

  return (
    <form action={changeOwnPassword} className="space-y-4">
      {serverError && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger">
          {serverError}
        </p>
      )}

      <Field label="Contraseña actual (la temporal)" htmlFor="cp-current">
        <Input
          id="cp-current"
          type="password"
          name="currentPassword"
          required
          autoFocus
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="••••••••"
        />
      </Field>

      <Field label="Contraseña nueva" htmlFor="cp-new">
        <Input
          id="cp-new"
          type="password"
          name="newPassword"
          required
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="Elegí una nueva"
          aria-describedby="cp-new-help"
        />
        <div id="cp-new-help" className="mt-1 space-y-0.5" aria-live="polite">
          {next.length === 0 ? (
            <p className="text-xs text-muted">
              Mínimo {MIN_PASSWORD_LENGTH} caracteres, combiná letras y números.
            </p>
          ) : check.ok ? (
            <p className="text-xs text-success">✓ La contraseña es fuerte.</p>
          ) : (
            check.problems.map((p) => (
              <p key={p} className="text-xs text-warning">• {p}</p>
            ))
          )}
          {next.length > 0 && !notSame && (
            <p className="text-xs text-warning">• Tiene que ser distinta de la temporal.</p>
          )}
        </div>
      </Field>

      <Field label="Repetí la contraseña nueva" htmlFor="cp-confirm">
        <Input
          id="cp-confirm"
          type="password"
          name="confirmPassword"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Otra vez, para confirmar"
          aria-describedby="cp-confirm-help"
        />
        <div id="cp-confirm-help" className="mt-1" aria-live="polite">
          {confirm.length > 0 && !matches && (
            <p className="text-xs text-warning">• Las dos contraseñas no coinciden.</p>
          )}
          {matches && <p className="text-xs text-success">✓ Coinciden.</p>}
        </div>
      </Field>

      <button type="submit" disabled={!canSubmit} className={buttonClasses("solid", "lg", "w-full mt-1")}>
        Guardar y entrar
      </button>
    </form>
  );
}
