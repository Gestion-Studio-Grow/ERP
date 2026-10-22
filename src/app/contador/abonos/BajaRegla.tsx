"use client";

// «Dar de baja» un abono: pide confirmar en el mismo lugar (sin ventana emergente). Lo ya emitido
// no se toca: sólo deja de salir en los lotes. Foco: al confirmar va al «Sí, …»; al cancelar vuelve
// a «Dar de baja». Dos regiones vivas fijas (`Avisos`).

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { bajaReglaAction } from "@/lib/cartera-abonos-actions";
import Avisos from "../Avisos";

export default function BajaRegla({ reglaId, descripcion }: { reglaId: string; descripcion: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const disparador = useRef<HTMLSpanElement>(null);
  const confirmar = useRef<HTMLSpanElement>(null);
  const yaAbrio = useRef(false);

  useEffect(() => {
    if (confirmando) {
      yaAbrio.current = true;
      confirmar.current?.querySelector("button")?.focus();
    } else if (yaAbrio.current) {
      disparador.current?.querySelector("button")?.focus();
    }
  }, [confirmando]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!confirmando ? (
        <span ref={disparador}>
          <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setConfirmando(true)} aria-label={`Dar de baja el abono ${descripcion}`}>
            Dar de baja
          </Button>
        </span>
      ) : (
        <>
          <span ref={confirmar}>
            <Button
              variant="outline"
              size="sm"
              className="min-h-11"
              disabled={pendiente}
              onClick={() =>
                startTransition(async () => {
                  const r = await bajaReglaAction(reglaId);
                  if (r.ok) router.refresh();
                  else setError(r.error);
                })
              }
            >
              {pendiente ? "Dando de baja…" : "Sí, que no salga más"}
            </Button>
          </span>
          <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setConfirmando(false)}>
            No
          </Button>
        </>
      )}
      <Avisos error={error ?? undefined} />
    </div>
  );
}
