"use client";

import { useState } from "react";
import { cancelMyAppointment } from "@/lib/client-actions";
import SubmitButton from "@/components/SubmitButton";
import { buttonClasses } from "@/components/ui";

export default function CancelButton({ appointmentId }: { appointmentId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="mb-6 rounded-md border border-danger/40 text-danger px-4 py-2 text-sm font-medium hover:bg-danger-soft"
      >
        Cancelar turno
      </button>
    );
  }

  return (
    <div className="mb-6 rounded-md border border-danger/30 bg-danger-soft p-4">
      <p className="text-sm text-danger mb-3">¿Confirmás que querés cancelar este turno?</p>
      {error && <p className="text-sm text-danger mb-2">{error}</p>}
      <div className="flex gap-3">
        <form
          action={async (fd) => {
            try {
              await cancelMyAppointment(fd);
            } catch (err) {
              setError(err instanceof Error ? err.message : "No se pudo cancelar.");
            }
          }}
        >
          <input type="hidden" name="id" value={appointmentId} />
          <SubmitButton
            pendingText="Cancelando…"
            className={buttonClasses("danger", "md")}
          >
            Sí, cancelar
          </SubmitButton>
        </form>
        <button
          onClick={() => setConfirming(false)}
          className={buttonClasses("ghost", "md")}
        >
          No, mantener
        </button>
      </div>
    </div>
  );
}
