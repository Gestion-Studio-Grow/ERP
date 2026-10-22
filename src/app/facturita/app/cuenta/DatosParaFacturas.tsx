"use client";

// FACTURITA · «Datos para tus facturas»: razón social, domicilio comercial, inicio de actividades e
// Ingresos Brutos. ARCA no los pide para autorizar, pero el PDF que le mandás a tu cliente sí. Se
// graban en los mismos campos que lee el PDF (`guardarDatosParaFacturasAction`).

import { useState, useTransition } from "react";
import { Button, Field, Input, Segmented } from "@/components/ui";
import { guardarDatosParaFacturasAction, type ResultadoDatosEmisor } from "@/lib/facturita-actions";
import type { DatosEmisorForm, TipoIibb } from "@/lib/facturita-emisor";

export default function DatosParaFacturas({ inicial, completos }: { inicial: DatosEmisorForm; completos: boolean }) {
  const [form, setForm] = useState<DatosEmisorForm>(inicial);
  const [resultado, setResultado] = useState<ResultadoDatosEmisor | null>(null);
  const [guardando, startTransition] = useTransition();
  const errores = resultado && !resultado.ok ? (resultado.errores ?? {}) : {};

  const cambiar = <K extends keyof DatosEmisorForm>(k: K, v: DatosEmisorForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setResultado(null);
  };

  return (
    <section
      id="datos-para-facturas"
      aria-labelledby="titulo-datos-facturas"
      className="mb-6 scroll-mt-20 rounded-xl border border-line bg-surface-raised px-[22px] py-5 shadow-card"
    >
      <h2 id="titulo-datos-facturas" className="text-base font-semibold text-strong">
        Datos para tus facturas
      </h2>
      <p className="mt-1 text-sm text-muted">
        {completos
          ? "Con esto sale el PDF de tus facturas. Si algo cambia, corregilo acá."
          : "ARCA no los pide para autorizar, pero sin ellos el PDF de la factura no sale. Están en tu constancia de inscripción de ARCA."}
      </p>
      <form
        className="mt-4 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => setResultado(await guardarDatosParaFacturasAction(form)));
        }}
        noValidate
      >
        <Field label="Razón social o nombre y apellido" htmlFor="df-razon" error={errores.razonSocial} required>
          <Input
            id="df-razon"
            value={form.razonSocial}
            onChange={(e) => cambiar("razonSocial", e.target.value)}
            autoComplete="organization"
            aria-invalid={Boolean(errores.razonSocial) || undefined}
          />
        </Field>
        <Field label="Domicilio comercial" htmlFor="df-domicilio" hint="Calle, número y localidad." error={errores.domicilio} required>
          <Input
            id="df-domicilio"
            value={form.domicilio}
            onChange={(e) => cambiar("domicilio", e.target.value)}
            autoComplete="street-address"
            aria-invalid={Boolean(errores.domicilio) || undefined}
          />
        </Field>
        <Field label="Inicio de actividades" htmlFor="df-inicio" error={errores.inicioActividades} required>
          <Input
            id="df-inicio"
            type="date"
            value={form.inicioActividades}
            onChange={(e) => cambiar("inicioActividades", e.target.value)}
            aria-invalid={Boolean(errores.inicioActividades) || undefined}
          />
        </Field>
        <Segmented
          name="iibb"
          leyenda="Ingresos Brutos"
          leyendaVisible
          opciones={[
            { valor: "numero", etiqueta: "Tengo número" },
            { valor: "exento", etiqueta: "Exento" },
            { valor: "cm", etiqueta: "Convenio Multilateral" },
          ]}
          value={form.iibbTipo}
          onChange={(e) => cambiar("iibbTipo", (e.target as unknown as HTMLInputElement).value as TipoIibb)}
          lleno
        />
        {form.iibbTipo === "numero" && (
          <Field label="Número de Ingresos Brutos" htmlFor="df-iibb" error={errores.iibb} required>
            <Input
              id="df-iibb"
              inputMode="numeric"
              value={form.iibbNumero}
              onChange={(e) => cambiar("iibbNumero", e.target.value)}
              aria-invalid={Boolean(errores.iibb) || undefined}
            />
          </Field>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
          <p aria-live="polite" className="text-sm">
            {resultado?.ok && <span className="font-medium text-success">Listo, guardado. Ya podés descargar en PDF las facturas autorizadas que tengan el comprador guardado (las de consumidor final, siempre).</span>}
            {resultado && !resultado.ok && (
              <span role="alert" className="font-medium text-danger">
                {resultado.error}
              </span>
            )}
          </p>
        </div>
      </form>
    </section>
  );
}
