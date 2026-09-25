"use client";

// La contraseña con «Mostrar» — sólo en el ingreso del diseño nuevo.
//
// Por qué: se entra con el celular en una mano o con guantes, y el límite anti fuerza bruta cuenta
// por conexión (5 fallos / 15 min, `LOGIN_RULE`): en un local todos los aparatos salen por el mismo
// router, así que tres claves mal tipeadas de una cajera frenan a la otra. Ver lo que se escribió
// antes de apretar «Ingresar» ahorra intentos. Sin JavaScript el campo funciona igual (queda oculto).

import { useState } from "react";
import { Input, buttonClasses } from "@/components/ui";
import { atributosBoton } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";

export function CampoClave({ id }: { id: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex items-stretch gap-2">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        name="password"
        required
        autoComplete="current-password"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="min-h-11 min-w-0 flex-1"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        aria-controls={id}
        className={cn(
          buttonClasses("outline", "md", "min-h-11 min-w-[5.5rem] shrink-0"),
        )}
        {...atributosBoton("outline", "md")}
      >
        {visible ? "Ocultar" : "Mostrar"}
      </button>
    </div>
  );
}
