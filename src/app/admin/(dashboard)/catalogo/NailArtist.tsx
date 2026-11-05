"use client";

// Box «Nail Artist» en el catálogo (docs/tenants/ch/NAIL-ARTIST.md §1-§2), sólo con el interruptor
// `nail-artist` prendido: la cuenta de la profesional (alias / titular / CUIT) y la marca del
// servicio «la seña y el cobro van a la profesional». Apagado, el catálogo no monta nada de esto.

import { useState, useTransition } from "react";
import { guardarCuentaDeLaProfesional, marcarSeniaALaProfesional } from "@/lib/catalog-actions";
import { useToast } from "../ToastProvider";
import { Input, buttonClasses } from "@/components/ui";

export type CuentaEnFicha = { aliasCbu?: string | null; titularCuenta?: string | null; cuitTitular?: string | null };

export function CuentaDeLaProfesional({ professionalId, cuenta, onListo }: { professionalId: string; cuenta: CuentaEnFicha; onListo?: () => void }) {
  const { showError, showSuccess } = useToast();
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  return (
    <form
      className="space-y-2 rounded-lg border border-line bg-surface-sunken p-3"
      action={(fd) =>
        empezar(async () => {
          setError("");
          const r = await guardarCuentaDeLaProfesional(fd);
          if (!r.ok) {
            setError(r.error);
            showError(r.error);
            return;
          }
          showSuccess("Cuenta guardada. Las señas que se pidan desde ahora van a este alias.");
          onListo?.();
        })
      }
    >
      <input type="hidden" name="professionalId" value={professionalId} />
      <p className="text-sm text-muted">
        La cuenta a la que la clienta le transfiere la seña de los servicios que cobra ella. Las señas ya pedidas siguen con el alias de antes.
      </p>
      <label className="block text-sm">
        <span className="text-strong">Alias o CBU/CVU</span>
        <Input name="aliasCbu" defaultValue={cuenta.aliasCbu ?? ""} autoComplete="off" />
      </label>
      <label className="block text-sm">
        <span className="text-strong">Titular de la cuenta</span>
        <Input name="titularCuenta" defaultValue={cuenta.titularCuenta ?? ""} autoComplete="off" />
      </label>
      <label className="block text-sm">
        <span className="text-strong">CUIT del titular (opcional)</span>
        <Input name="cuitTitular" defaultValue={cuenta.cuitTitular ?? ""} inputMode="numeric" autoComplete="off" />
      </label>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button type="submit" disabled={pendiente} aria-busy={pendiente || undefined} className={buttonClasses("solid", "md", "min-h-11")}>
        {pendiente ? "Guardando…" : "Guardar cuenta"}
      </button>
    </form>
  );
}

export function SeniaALaProfesional({ serviceId, marcado }: { serviceId: string; marcado: boolean }) {
  const { showError, showSuccess } = useToast();
  const [pendiente, empezar] = useTransition();
  return (
    <form
      action={(fd) =>
        empezar(async () => {
          const r = await marcarSeniaALaProfesional(fd);
          if (!r.ok) showError(r.error);
          else showSuccess(fd.get("depositToProfessional") != null ? "Listo: la seña y el cobro de este servicio van a la profesional." : "Listo: este servicio vuelve a cobrarlo el negocio.");
        })
      }
      className="inline-flex"
    >
      <input type="hidden" name="serviceId" value={serviceId} />
      {!marcado && <input type="hidden" name="depositToProfessional" value="1" />}
      <button type="submit" disabled={pendiente} aria-pressed={marcado} className={buttonClasses("outline", "sm", "min-h-11")}>
        {marcado ? "Cobra la profesional · volver al negocio" : "Que cobre la profesional"}
      </button>
    </form>
  );
}
