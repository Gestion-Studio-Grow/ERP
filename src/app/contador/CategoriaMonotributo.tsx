"use client";

// Cargar o corregir la categoría del monotributo de un cliente, desde el renglón del monitor.
// Un desplegable A–K y «Guardar»: 44 px en el celular (Select h-11, Button sm → h-11 < sm).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@/components/ui";
import { cargarCategoriaMonotributoAction } from "@/lib/monotributo-actions";
import { LETRAS, type LetraCategoria } from "@/lib/monotributo-core";

export default function CategoriaMonotributo({
  clienteTenantId,
  alias,
  actual,
}: {
  clienteTenantId: string;
  alias: string;
  actual: LetraCategoria | null;
}) {
  const router = useRouter();
  const [letra, setLetra] = useState<string>(actual ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const id = `categoria-${clienteTenantId}`;

  function guardar() {
    setError(null);
    empezar(async () => {
      const r = await cargarCategoriaMonotributoAction(clienteTenantId, letra);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="sr-only">
        Categoría de {alias}
      </label>
      <Select
        id={id}
        value={letra}
        onChange={(e) => setLetra(e.target.value)}
        className="w-auto min-w-[8.5rem]"
        disabled={pendiente}
      >
        <option value="" disabled>
          Elegí la categoría
        </option>
        {LETRAS.map((l) => (
          <option key={l} value={l}>
            Categoría {l}
          </option>
        ))}
      </Select>
      <Button
        type="button"
        size="sm"
        variant={actual ? "outline" : "solid"}
        onClick={guardar}
        disabled={pendiente || letra === "" || letra === actual}
      >
        {pendiente ? "Guardando…" : actual ? "Cambiar" : "Guardar"}
      </Button>
      {error && (
        <p role="alert" className="w-full text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
