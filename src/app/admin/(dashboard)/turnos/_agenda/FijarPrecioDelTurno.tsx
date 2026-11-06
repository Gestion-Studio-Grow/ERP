"use client";

// «Precio a definir»: el servicio se reservó sin precio y la recepción lo carga a mano antes de
// cobrar. Fija el precio del TURNO (src/lib/servicios/precio-a-definir-actions.ts); el cobro de
// abajo pasa a ver el saldo y se cobra como cualquier otro.

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { fijarPrecioDelTurno } from "@/lib/servicios/precio-a-definir-actions";
import { useToast } from "../../ToastProvider";

export default function FijarPrecioDelTurno({ turnoId, servicio }: { turnoId: string; servicio: string }) {
  const id = useId();
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [monto, setMonto] = useState("");
  const [pendiente, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData();
        fd.set("appointmentId", turnoId);
        fd.set("monto", monto);
        startTransition(async () => {
          const r = await fijarPrecioDelTurno(fd);
          if (!r.ok) return showError(r.error);
          showSuccess(`Precio de ${servicio} fijado.`);
          setMonto("");
          router.refresh();
        });
      }}
    >
      <Field label="¿Cuánto sale este turno? ($)" htmlFor={id} hint="El servicio tiene «Precio a definir»: cargalo para poder cobrar.">
        <Input id={id} name="monto" type="number" inputMode="decimal" min={1} step="any" required value={monto} onChange={(e) => setMonto(e.currentTarget.value)} />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={pendiente || !monto}>
        {pendiente ? "Guardando…" : "Fijar el precio"}
      </Button>
    </form>
  );
}
