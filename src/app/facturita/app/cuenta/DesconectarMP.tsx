"use client";

// Desconectar en dos toques: el primero pregunta, el segundo borra (y explica cómo sacar el
// permiso también del lado de Mercado Pago, que no se puede hacer desde acá).

import { useId, useRef, useState } from "react";
import { Button, atributosBoton, buttonClasses } from "@/components/ui";
import { desconectarMercadoPagoAction } from "@/lib/facturita-mp-actions";

export default function DesconectarMP() {
  const [preguntando, setPreguntando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const confirmar = useRef<HTMLButtonElement>(null);
  const id = useId();

  if (!preguntando) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setPreguntando(true);
          requestAnimationFrame(() => confirmar.current?.focus());
        }}
      >
        Desconectar
      </Button>
    );
  }

  return (
    <form
      action={async () => {
        setEnviando(true);
        await desconectarMercadoPagoAction();
      }}
      className="flex w-full flex-col gap-3"
      aria-describedby={`${id}-texto`}
    >
      <p id={`${id}-texto`} className="text-sm text-strong">
        ¿Seguro? Borramos el permiso que guardamos y tus cobros dejan de llegar acá. Para sacarlo también en Mercado
        Pago, entrá a tu cuenta de Mercado Pago y quitá Factoque de las aplicaciones conectadas.
      </p>
      <div className="flex flex-wrap gap-3">
        <button ref={confirmar} type="submit" className={buttonClasses("danger")} {...atributosBoton("danger")} disabled={enviando}>
          {enviando ? "Desconectando…" : "Sí, desconectar"}
        </button>
        <Button type="button" variant="ghost" onClick={() => setPreguntando(false)} disabled={enviando}>
          No, dejarlo
        </Button>
      </div>
    </form>
  );
}
