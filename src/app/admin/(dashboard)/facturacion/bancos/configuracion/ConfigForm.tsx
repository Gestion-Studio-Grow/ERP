"use client";

// Formulario de configuración del módulo BANCOS. Client component: llama a
// guardarConfigBancosAction y avisa por toast (mismo patrón que el resto del
// backoffice). Los campos vacíos vuelven al estándar del producto.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { guardarConfigBancosAction } from "@/lib/bancos-actions";
import { Button, Field, Input, Marca, Seccion, fmtMoneyARS, fmtNumberAR } from "@/components/ui";
import { useToast } from "../../../ToastProvider";

export default function ConfigForm({
  umbralActual,
  capActual,
  domicilioActual,
  umbralDefault,
  capDefault,
  renglon = false,
}: {
  umbralActual: number | null;
  capActual: number | null;
  domicilioActual: string | null;
  umbralDefault: number;
  capDefault: number;
  /** Diseño nuevo («Renglón»): primero lo que falta (el domicilio), después las dos reglas. */
  renglon?: boolean;
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

  if (renglon) {
    return (
      <form onSubmit={guardar} className="space-y-6">
        <Seccion id="cfg-factura" titulo="En la factura">
          <div className="space-y-2 pt-3">
            {faltaDomicilio && (
              <p className="text-sm text-body">
                <Marca tipo="atencion">Falta el domicilio</Marca>: va impreso en cada comprobante. Cargalo antes de emitir.
              </p>
            )}
            <Field label="Domicilio del emisor" htmlFor="cfg-domicilio" required hint="Calle, número y localidad, como en tu constancia. Ej.: Av. Corrientes 1234, CABA.">
              <Input
                id="cfg-domicilio"
                value={domicilio}
                onChange={(e) => setDomicilio(e.target.value)}
                maxLength={200}
                placeholder="Calle y número, localidad"
              />
            </Field>
          </div>
        </Seccion>
        <Seccion id="cfg-reglas" titulo="Cuándo factura solo">
          <div className="grid gap-4 pt-3 sm:grid-cols-2">
            <Field
              label="Pedir los datos del comprador desde"
              htmlFor="cfg-umbral"
              hint={`En pesos. Vacío: ${fmtMoneyARS(umbralDefault, 0)}. Es una regla tuya; el mínimo de ARCA es $10.000.000.`}
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
            <Field label="Facturas automáticas por mes, como mucho" htmlFor="cfg-cap" hint={`Vacío: ${fmtNumberAR(capDefault)}. Pasado el tope, el resto espera al mes siguiente.`}>
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
          </div>
        </Seccion>
        <div className="border-t border-line pt-4">
          <Button type="submit" disabled={guardando} className="w-full sm:w-auto">
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </form>
    );
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
