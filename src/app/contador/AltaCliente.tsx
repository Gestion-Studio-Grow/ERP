"use client";

// Alta de un cliente en la cartera del contador. Form con validación en vivo
// del CUIT (dígito verificador, mismo criterio que bancos) y muestra de la
// contraseña de bootstrap UNA sola vez (patrón provision-tenant, ADR-019): no
// se persiste en claro y no se vuelve a mostrar.

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, SectionGroup } from "@/components/ui";
import { cuitValido, normalizarCuit } from "@/plugins/bancos/domain/cuit";
import { altaClienteCarteraAction, type ResultadoAlta } from "@/lib/cartera-actions";

export default function AltaCliente() {
  const router = useRouter();
  const ids = { nombre: useId(), cuit: useId(), email: useId(), alias: useId() };

  const [nombre, setNombre] = useState("");
  const [cuit, setCuit] = useState("");
  const [email, setEmail] = useState("");
  const [alias, setAlias] = useState("");
  const [resultado, setResultado] = useState<ResultadoAlta | null>(null);
  const [pendiente, startTransition] = useTransition();

  // Validación en vivo (solo cuando ya hay algo escrito, para no retar de entrada).
  const cuitNormalizado = normalizarCuit(cuit);
  const cuitError =
    cuit.trim() !== "" && !cuitValido(cuitNormalizado)
      ? "El CUIT no es válido: revisá los 11 números."
      : undefined;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setResultado(null);
    startTransition(async () => {
      const r = await altaClienteCarteraAction({ nombre, cuit, email, alias: alias || undefined });
      setResultado(r);
      if (r.ok) {
        setNombre("");
        setCuit("");
        setEmail("");
        setAlias("");
        router.refresh();
      }
    });
  };

  return (
    <SectionGroup
      title="Agregar un cliente"
      description="Con el nombre, el CUIT y un email, el cliente queda dado de alta con su facturación lista (ARCA en homologación con el certificado del estudio). Nada se cobra ni se emite sin tu acción."
    >
      <form
        onSubmit={submit}
        className="rounded-xl border border-line bg-surface-raised p-5 shadow-card"
        aria-describedby={resultado && !resultado.ok ? `${ids.nombre}-error` : undefined}
      >
        <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
          <Field label="Nombre del negocio" htmlFor={ids.nombre} required>
            <Input
              id={ids.nombre}
              name="nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Kiosco La Esquina"
              autoComplete="organization"
              required
              minLength={2}
            />
          </Field>
          <Field
            label="CUIT"
            htmlFor={ids.cuit}
            required
            error={cuitError}
            hint={cuitError ? undefined : "Con o sin guiones, como te quede cómodo."}
          >
            <Input
              id={ids.cuit}
              name="cuit"
              value={cuit}
              onChange={(e) => setCuit(e.target.value)}
              placeholder="20-12345678-3"
              inputMode="numeric"
              autoComplete="off"
              required
              aria-invalid={cuitError ? true : undefined}
            />
          </Field>
          <Field label="Email del cliente" htmlFor={ids.email} required hint="Va a ser su usuario si algún día entra a su propio panel.">
            <Input
              id={ids.email}
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="dueno@negocio.com"
              autoComplete="email"
              required
            />
          </Field>
          <Field label="Alias en tu cartera" htmlFor={ids.alias} hint="Opcional: cómo lo querés ver en la tabla.">
            <Input
              id={ids.alias}
              name="alias"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="Kiosco de Marta"
              autoComplete="off"
            />
          </Field>
        </div>

        <div className="mt-md flex items-center gap-sm">
          <Button type="submit" disabled={pendiente || !!cuitError}>
            {pendiente ? "Dando de alta…" : "Agregar a la cartera"}
          </Button>
        </div>

        <div aria-live="polite" className="mt-sm">
          {resultado && !resultado.ok && (
            <p id={`${ids.nombre}-error`} role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              {resultado.error}
            </p>
          )}
          {resultado?.ok && (
            <div className="rounded-xl border border-success/40 bg-success-soft px-4 py-3 text-sm text-success">
              {resultado.yaEstaba ? (
                <p>
                  <strong>{resultado.alias}</strong> ya estaba en tu cartera: quedó activo de nuevo.
                </p>
              ) : (
                <p>
                  <strong>{resultado.alias}</strong> quedó dado de alta y en tu cartera.
                </p>
              )}
              {resultado.passwordBootstrap && (
                <div className="mt-2 rounded-md border border-line bg-surface-raised p-3 text-strong">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">
                    Contraseña inicial del cliente — se muestra UNA sola vez
                  </p>
                  <code className="mt-1 block select-all break-all text-base tabular-nums">
                    {resultado.passwordBootstrap}
                  </code>
                  <p className="mt-1 text-xs text-muted">
                    Pasásela por un canal seguro si va a usar su propio panel. No queda guardada en
                    claro y no se puede volver a ver.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </form>
    </SectionGroup>
  );
}
