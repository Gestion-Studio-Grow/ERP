// El formulario de ingreso de la vista de siempre (la que usa CH hoy), fuera de page.tsx para
// poder probarlo en un navegador de verdad (ingreso-pantalla.test.ts) sin Next ni base.
// El email va en `CampoEmail`: después de una clave equivocada vuelve escrito y la contraseña
// vuelve vacía, con el cursor en ella.

import { login } from "@/lib/auth-actions";
import { Field, Input, buttonClasses } from "@/components/ui";
import { CampoEmail } from "./CampoEmail";

export default function FormularioDeSiempre({ next, conError }: { next: string; conError: boolean }) {
  return (
    <form action={login} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Email" htmlFor="login-email">
        <CampoEmail conError={conError} placeholder="tu@email.com" />
      </Field>
      <Field label="Contraseña" htmlFor="login-password">
        <Input
          id="login-password"
          type="password"
          name="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
        />
      </Field>
      <button type="submit" className={buttonClasses("solid", "lg", "w-full mt-1")}>
        Ingresar
      </button>
    </form>
  );
}
