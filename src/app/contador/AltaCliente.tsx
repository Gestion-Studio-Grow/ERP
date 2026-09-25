"use client";

// Alta de un cliente en la cartera del contador. Form con validación en vivo
// del CUIT (dígito verificador, mismo criterio que bancos) y muestra de la
// contraseña de bootstrap UNA sola vez (patrón provision-tenant, ADR-019): no
// se persiste en claro y no se vuelve a mostrar.

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bloque, Button, Field, Franja, Input, SectionGroup } from "@/components/ui";
import { useDiseno } from "@/lib/diseno/DisenoProvider";
import { cuitValido, normalizarCuit } from "@/plugins/bancos/domain/cuit";
import { altaClienteCarteraAction, type ResultadoAlta } from "@/lib/cartera-actions";

export default function AltaCliente() {
  const router = useRouter();
  const nuevo = useDiseno();
  const ids = { nombre: useId(), cuit: useId(), email: useId(), alias: useId(), pv: useId() };

  const [nombre, setNombre] = useState("");
  const [cuit, setCuit] = useState("");
  const [email, setEmail] = useState("");
  const [alias, setAlias] = useState("");
  // Sin punto de venta el cliente no emite nada, y después sólo lo puede cargar GSG: se pide
  // acá, en el único momento en que el contador lo tiene a mano.
  const [puntoVenta, setPuntoVenta] = useState("");
  const [resultado, setResultado] = useState<ResultadoAlta | null>(null);
  const [pendiente, startTransition] = useTransition();

  // Validación en vivo (solo cuando ya hay algo escrito, para no retar de entrada).
  const cuitNormalizado = normalizarCuit(cuit);
  const cuitError =
    cuit.trim() !== "" && !cuitValido(cuitNormalizado)
      ? "El CUIT no es válido: revisá los 11 números."
      : undefined;
  const pvError =
    puntoVenta.trim() !== "" && !/^\d{1,5}$/.test(puntoVenta.trim())
      ? "Es un número de 1 a 5 cifras."
      : undefined;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setResultado(null);
    startTransition(async () => {
      const r = await altaClienteCarteraAction({ nombre, cuit, email, alias: alias || undefined, puntoVenta });
      setResultado(r);
      if (r.ok) {
        setNombre("");
        setCuit("");
        setEmail("");
        setAlias("");
        setPuntoVenta("");
        router.refresh();
      }
    });
  };

  // Diseño nuevo («Renglón»): bloque con rótulo y raya, sin tarjeta ni párrafo; la ayuda queda en la
  // nota del bloque. Mismo formulario, mismos campos y la misma action.
  const formulario = (
      <form
        onSubmit={submit}
        className={nuevo ? "pt-4" : "rounded-xl border border-line bg-surface-raised p-5 shadow-card"}
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
          <Field
            label="Punto de venta"
            htmlFor={ids.pv}
            required
            error={pvError}
            hint={pvError ? undefined : "El que diste de alta en ARCA para factura electrónica (hasta 5 cifras)."}
          >
            <Input
              id={ids.pv}
              name="puntoVenta"
              value={puntoVenta}
              onChange={(e) => setPuntoVenta(e.target.value)}
              placeholder="3"
              inputMode="numeric"
              autoComplete="off"
              required
              aria-invalid={pvError ? true : undefined}
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
          <Button type="submit" disabled={pendiente || !!cuitError || !!pvError}>
            {pendiente ? "Dando de alta…" : "Agregar a la cartera"}
          </Button>
        </div>

        <div aria-live="polite" className="mt-sm">
          {resultado && !resultado.ok && (
            nuevo ? (
              <Franja tono="peligro">
                <span id={`${ids.nombre}-error`} role="alert">{resultado.error}</span>
              </Franja>
            ) : (
            <p id={`${ids.nombre}-error`} role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              {resultado.error}
            </p>
            )
          )}
          {resultado?.ok && (
            <div className={nuevo ? "border-y border-line py-3 text-sm text-strong" : "rounded-xl border border-success/40 bg-success-soft px-4 py-3 text-sm text-success"}>
              {resultado.yaEstaba ? (
                <p>
                  <strong>{resultado.alias}</strong> ya estaba en tu cartera: quedó activo de nuevo.
                </p>
              ) : (
                <p>
                  <strong>{resultado.alias}</strong> quedó dado de alta y en tu cartera.
                </p>
              )}
              {resultado.aviso && <p className="mt-1 text-strong">{resultado.aviso}</p>}
              {resultado.passwordBootstrap && (
                <div className={nuevo ? "mt-2 border border-line-strong p-3 text-strong" : "mt-2 rounded-md border border-line bg-surface-raised p-3 text-strong"}>
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
  );

  if (nuevo) {
    return (
      <Bloque
        id="alta-cliente"
        titulo="Agregar un cliente"
        nota="Con nombre, CUIT y email queda listo para facturar · nada se cobra ni se emite sin tu acción"
        className="scroll-mt-24"
      >
        {formulario}
      </Bloque>
    );
  }
  return (
    <SectionGroup
      title="Agregar un cliente"
      description="Con el nombre, el CUIT y un email, el cliente queda dado de alta con su facturación lista (ARCA en homologación con el certificado del estudio). Nada se cobra ni se emite sin tu acción."
    >
      {formulario}
    </SectionGroup>
  );
}
