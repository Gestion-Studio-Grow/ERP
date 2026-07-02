"use client";

import { useState } from "react";
import { cancelMyAppointment } from "@/lib/client-actions";
import SubmitButton from "@/components/SubmitButton";

export default function CancelButton({ appointmentId }: { appointmentId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="mb-6 rounded-md border border-red-200 text-red-600 px-4 py-2 text-sm font-medium hover:bg-red-50"
      >
        Cancelar turno
      </button>
    );
  }

  return (
    <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-4">
      <p className="text-sm text-red-800 mb-3">¿Confirmás que querés cancelar este turno?</p>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
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
            className="rounded-md bg-red-600 text-white px-4 py-2 text-sm font-medium"
          >
            Sí, cancelar
          </SubmitButton>
        </form>
        <button
          onClick={() => setConfirming(false)}
          className="rounded-md px-4 py-2 text-sm text-neutral-600"
        >
          No, mantener
        </button>
      </div>
    </div>
  );
}
