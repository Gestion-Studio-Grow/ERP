"use client";

// El campo del email del ingreso, en las dos vistas. Después de una clave equivocada `login()`
// redirige a `?error=1` y la pantalla se arma de nuevo: antes el email volvía vacío y lo que la
// persona tipeaba mientras esperaba la respuesta se perdía. Ahora:
//   · el email se guarda en la pestaña mientras se escribe (sessionStorage, se va al cerrarla) y,
//     con el error, vuelve al campo si está vacío (lo ya tipeado no se pisa);
//   · el campo es CONTROLADO: cuando la dirección no cambia (segunda clave equivocada) la pantalla
//     no se rearma y React vacía el formulario al terminar la acción; un campo controlado queda;
//   · con el email de vuelta el cursor va a la contraseña, que vuelve vacía: la clave NUNCA se
//     guarda en ningún lado.
// La regla (qué poner, dónde va el cursor) es pura y está probada en login-core.ts.

import { useEffect, useState } from "react";
import { Input } from "@/components/ui";
import { CLAVE_EMAIL_DEL_INGRESO, campoParaElCursor, emailAlMontar } from "./login-core";

function leerGuardado(): string | null {
  try {
    return sessionStorage.getItem(CLAVE_EMAIL_DEL_INGRESO);
  } catch {
    return null; // sin almacenamiento (modo privado estricto): el campo queda como está
  }
}

function guardar(email: string | null) {
  try {
    if (email) sessionStorage.setItem(CLAVE_EMAIL_DEL_INGRESO, email);
    else sessionStorage.removeItem(CLAVE_EMAIL_DEL_INGRESO);
  } catch {
    // sin almacenamiento: sólo se pierde la ayuda de volver a completar el email
  }
}

export function CampoEmail({
  conError,
  className,
  placeholder,
}: {
  conError: boolean;
  className?: string;
  placeholder?: string;
}) {
  const [email, setEmail] = useState("");

  // Al armarse la pantalla (una sola vez): con error, vuelve el email; sin error, se olvida.
  useEffect(() => {
    const campo = document.getElementById("login-email") as HTMLInputElement | null;
    // Lo que el navegador ya puso o la persona ya tipeó antes de que la pantalla respondiera.
    const enCampo = campo?.value ?? "";
    const aPoner = emailAlMontar({ conError, enCampo, guardado: leerGuardado() });
    const final = aPoner ?? enCampo;
    if (!conError) guardar(enCampo || null);
    // Un solo ajuste al montar, desde algo que sólo existe en el navegador (la pestaña y el campo
    // ya escrito): inicializarlo en `useState` daría otro HTML que el del servidor y rompería la
    // hidratación. No hay cascada: corre una vez y el valor ya no cambia por este camino.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (final !== "") setEmail(final);
    // El cursor sólo se mueve si nadie está escribiendo en otro lado.
    const activo = document.activeElement;
    if (!activo || activo === document.body || activo === campo) {
      document.getElementById(campoParaElCursor({ conError, email: final }))?.focus();
    }
    // Sólo al montar: después, lo que manda es lo que la persona escribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Input
      id="login-email"
      type="email"
      name="email"
      required
      autoFocus={!conError}
      autoComplete="username"
      inputMode="email"
      autoCapitalize="none"
      spellCheck={false}
      placeholder={placeholder}
      className={className}
      value={email}
      onChange={(e) => {
        setEmail(e.target.value);
        guardar(e.target.value.trim() || null);
      }}
    />
  );
}
