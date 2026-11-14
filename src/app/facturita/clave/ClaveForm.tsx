"use client";

// Formulario para elegir la contraseña (alta web de Factoque). La regla es la de siempre
// (src/lib/password-policy.ts); el servidor la vuelve a validar.

import { useActionState, useId } from "react";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-policy";
import { BOTON_PRINCIPAL, FOCO } from "../estilos";
import { elegirClaveFactoque, type EstadoClave } from "./acciones";

export default function ClaveForm({ sello, email }: { sello: string; email: string }) {
  const [estado, accion, mandando] = useActionState<EstadoClave, FormData>(elegirClaveFactoque, null);
  const uid = useId();
  const problemas = estado && "problemas" in estado ? estado.problemas : [];
  const aviso = estado && "aviso" in estado ? estado.aviso : null;

  return (
    <form action={accion} className="mt-8 space-y-6" noValidate>
      <input type="hidden" name="t" value={sello} />
      {/* El usuario, para que el gestor de contraseñas guarde el par completo. */}
      <input type="email" name="usuario" value={email} autoComplete="username" readOnly hidden />
      <div>
        <label htmlFor={`${uid}-clave`} className="fx-alta-label">
          Contraseña nueva
        </label>
        <p id={`${uid}-ayuda`} className="fx-alta-ayuda">
          Al menos {MIN_PASSWORD_LENGTH} caracteres, con letras y números.
        </p>
        <input
          id={`${uid}-clave`}
          name="clave"
          type="password"
          className="fx-alta-input"
          autoComplete="new-password"
          required
          aria-invalid={problemas.length > 0}
          aria-describedby={`${uid}-ayuda${problemas.length ? ` ${uid}-problemas` : ""}`}
        />
      </div>
      <div>
        <label htmlFor={`${uid}-repetida`} className="fx-alta-label">
          Repetila
        </label>
        <input
          id={`${uid}-repetida`}
          name="repetida"
          type="password"
          className="fx-alta-input"
          autoComplete="new-password"
          required
          aria-invalid={problemas.length > 0}
        />
      </div>
      {problemas.length > 0 && (
        <ul id={`${uid}-problemas`} role="alert" className="list-disc space-y-1 pl-5 text-base font-medium text-danger" data-qa="problemas-clave">
          {problemas.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {aviso && (
        <p role="alert" className="text-base font-medium text-danger" data-qa="aviso-clave">
          {aviso}
        </p>
      )}
      <button type="submit" className={`${BOTON_PRINCIPAL} ${FOCO}`} style={{ width: "100%" }} disabled={mandando} aria-busy={mandando} data-qa="guardar-clave">
        {mandando ? "Guardando…" : "Guardar y entrar"}
      </button>
    </form>
  );
}
