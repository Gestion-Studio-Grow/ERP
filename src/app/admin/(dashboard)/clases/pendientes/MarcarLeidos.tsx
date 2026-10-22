"use client";

import { useTransition } from "react";
import { marcarAvisosLeidos } from "@/lib/padel/acciones";

export function MarcarLeidos() {
  const [pendiente, start] = useTransition();
  return (
    <button type="button" disabled={pendiente} onClick={() => start(() => marcarAvisosLeidos())} className="h-12 text-sm text-muted underline" data-qa="marcar-leidos">
      {pendiente ? "Marcando…" : "Marcar como leídos"}
    </button>
  );
}
