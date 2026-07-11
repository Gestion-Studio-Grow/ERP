"use client";

// Formulario de configuración del módulo BANCOS. Client component: llama a
// guardarConfigBancosAction y avisa por toast (mismo patrón que el resto del
// backoffice). Los campos vacíos vuelven al estándar del producto.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { guardarConfigBancosAction } from "@/lib/bancos-actions";
import { Button, Field, Input, fmtMoneyARS, fmtNumberAR } from "@/components/ui";
import { useToast } from "../../../ToastProvider";

export default function ConfigForm({
  umbralActual,
  capActual,
  domicilioActual,
  umbralDefault,
  capDefault,
}: {
  umbralActual: number | null;
  capActual: number | null;
  domicilioActual: string | null;
  umbralDefault: number;
  capDefault: number;
}) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();

  const [umbral, setUmbral] = useState(umbralActual != null ? String(umbralActual) : "");
  const [cap, setCap] = useState(capActual != null ? String(capActual) : "");
  const [domicilio, setDomicilio] = useState(domicilioActual ?? "");
  const [guardando, setGuardando] = useState(false);

  const faltaDomicilio = domicilio.trim() === "";

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      const res = await guardarConfigBancosAction({
        umbralIdentificacion: umbral.trim() === "" ? null : Number(umbral),
        capFacturasMes: cap.trim() === "" ? null : Number(cap),
        domicilioEmisor: domicilio.trim() === "" ? null : domicilio.trim(),
      });
      if (res.ok) {
        showSuccess("Configuración guardada.");
        router.refresh();
      } else {
        showError(res.error);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : "No se pudo guardar la configuración.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="space-y-4">
      {faltaDomicilio && (
        <p role="alert" className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          Falta el domicilio del emisor: es obligatorio en el comprobante. Cargalo antes de emitir
          facturas.
        </p>
      )}

      <Field
        label="Umbral de identificación (en pesos)"
        htmlFor="cfg-umbral"
        hint={`Desde este monto se piden los datos del comprador antes de facturar. Es una regla comercial del negocio — el mínimo legal de ARCA es $10.000.000. Vacío = estándar (${fmtMoneyARS(umbralDefault)}).`}
      >
        <Input
          id="cfg-umbral"
          type="number"
          inputMode="numeric"
          min={1}
          step="0.01"
          value={umbral}
          onChange={(e) => setUmbral(e.target.value)}
          placeholder={String(umbralDefault)}
        />
      </Field>

      <Field
        label="Tope de facturas automáticas por mes"
        htmlFor="cfg-cap"
        hint={`Al llegar al tope, el resto queda en espera hasta el mes siguiente. Vacío = estándar (${fmtNumberAR(capDefault)}).`}
      >
        <Input
          id="cfg-cap"
          type="number"
          inputMode="numeric"
          min={1}
          max={100000}
          step={1}
          value={cap}
          onChange={(e) => setCap(e.target.value)}
          placeholder={String(capDefault)}
        />
      </Field>

      <Field
        label="Domicilio del emisor"
        htmlFor="cfg-domicilio"
        required
        hint="El domicilio comercial que va impreso en cada factura. Ej.: Av. Corrientes 1234, CABA."
      >
        <Input
          id="cfg-domicilio"
          value={domicilio}
          onChange={(e) => setDomicilio(e.target.value)}
          maxLength={200}
          placeholder="Calle y número, localidad"
        />
      </Field>

      <Button type="submit" disabled={guardando}>
        {guardando ? "Guardando…" : "Guardar configuración"}
      </Button>
    </form>
  );
}
