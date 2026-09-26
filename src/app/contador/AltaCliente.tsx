"use client";

// Alta de un cliente en la cartera del contador. Form con validación en vivo
// del CUIT (dígito verificador, mismo criterio que bancos) y muestra de la
// contraseña de bootstrap UNA sola vez (patrón provision-tenant, ADR-019): no
// se persiste en claro y no se vuelve a mostrar.

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bloque, Button, Field, Input, SectionGroup, Select, Textarea } from "@/components/ui";
import { useDiseno } from "@/lib/diseno/DisenoProvider";
import { cuitValido, normalizarCuit } from "@/plugins/bancos/domain/cuit";
import { altaClienteCarteraAction, type ResultadoSolicitudAlta } from "@/lib/cartera-actions";
import { CONDICIONES_IVA, NOMBRE_CONDICION_IVA, NOMBRE_TAMANIO, NOTA_MAX, TAMANIOS, faltantesDelAlta } from "@/lib/cartera-alta-reglas";

// UNA sola región viva en todo el formulario (la de abajo, sólo para lectores de pantalla): el CUIT
// mal escrito, lo que falta y la respuesta del pedido se anuncian UNA vez (QA 26/09 los oía 2 o 3
// veces). Los mensajes visibles no llevan role ni aria-live.
function ErrorDelCampo({ id, texto }: { id: string; texto: string | undefined }) {
  if (!texto) return null;
  return <p id={id} className="text-xs text-danger">{texto}</p>;
}

export default function AltaCliente() {
  const router = useRouter();
  const nuevo = useDiseno();
  const ids = { nombre: useId(), cuit: useId(), email: useId(), alias: useId(), pv: useId(), wa: useId(), iva: useId(), tam: useId(), nota: useId() };

  const [nombre, setNombre] = useState("");
  const [cuit, setCuit] = useState("");
  const [email, setEmail] = useState("");
  const [alias, setAlias] = useState("");
  // Sin punto de venta el cliente no emite nada, y después sólo lo puede cargar GSG: se pide
  // acá, en el único momento en que el contador lo tiene a mano.
  const [puntoVenta, setPuntoVenta] = useState("");
  // Lo que Soporte GSG necesita para configurarlo sin volver a preguntarte.
  const [whatsapp, setWhatsapp] = useState("");
  const [condicionIva, setCondicionIva] = useState("");
  const [tamanio, setTamanio] = useState("");
  const [nota, setNota] = useState("");
  const [resultado, setResultado] = useState<ResultadoSolicitudAlta | null>(null);
  const [pendiente, startTransition] = useTransition();
  // Lo que falta se marca recién al intentar mandar; el CUIT, al salir del campo o con los 11 números.
  const [intentado, setIntentado] = useState(false);
  const [cuitTocado, setCuitTocado] = useState(false);

  const faltan = intentado ? faltantesDelAlta({ nombre, cuit, email, puntoVenta }) : {};
  const cuitNormalizado = normalizarCuit(cuit);
  const cuitError =
    faltan.cuit ??
    ((cuitTocado || cuitNormalizado.length >= 11) && cuit.trim() !== "" && !cuitValido(cuitNormalizado)
      ? "El CUIT no es válido: revisá los 11 números."
      : undefined);
  const pvError =
    faltan.puntoVenta ??
    (puntoVenta.trim() !== "" && !/^\d{1,5}$/.test(puntoVenta.trim()) ? "Es un número de 1 a 5 cifras." : undefined);
  const anuncio = resultado ? (resultado.ok ? resultado.mensaje : resultado.error) : (cuitError ?? pvError ?? "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setResultado(null);
    const vacios = faltantesDelAlta({ nombre, cuit, email, puntoVenta });
    if (Object.keys(vacios).length > 0) {
      setIntentado(true);
      setResultado({ ok: false, error: `Revisá lo marcado: ${Object.values(vacios).join(" ")}` });
      return;
    }
    startTransition(async () => {
      const r = await altaClienteCarteraAction({
        nombre, cuit, email, alias: alias || undefined, puntoVenta, whatsapp, condicionIva, tamanio, nota: nota || undefined,
      });
      setResultado(r);
      if (r.ok) {
        setNombre("");
        setCuit("");
        setEmail("");
        setAlias("");
        setPuntoVenta("");
        setWhatsapp("");
        setCondicionIva("");
        setTamanio("");
        setNota("");
        setIntentado(false);
        setCuitTocado(false);
        router.refresh();
      }
    });
  };

  // Diseño nuevo («Renglón»): bloque con rótulo y raya, sin tarjeta ni párrafo; la ayuda queda en la
  // nota del bloque. Mismo formulario, mismos campos y la misma action.
  const formulario = (
      <form
        onSubmit={submit}
        noValidate
        className={nuevo ? "pt-4" : "rounded-xl border border-line bg-surface-raised p-5 shadow-card"}
        aria-describedby={resultado && !resultado.ok ? `${ids.nombre}-error` : undefined}
      >
        <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
          <Field label="Nombre del negocio" htmlFor={ids.nombre} required hint={faltan.nombre ? undefined : "Como lo conocés; Soporte carga la razón social de la constancia."}>
            <Input
              id={ids.nombre}
              name="nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Como figura en ARCA"
              autoComplete="organization"
              required
              minLength={2}
              aria-invalid={faltan.nombre ? true : undefined}
              aria-describedby={faltan.nombre ? `${ids.nombre}-falta` : undefined}
            />
            <ErrorDelCampo id={`${ids.nombre}-falta`} texto={faltan.nombre} />
          </Field>
          <Field
            label="CUIT"
            htmlFor={ids.cuit}
            required
            hint={cuitError ? undefined : "Con o sin guiones, como te quede cómodo."}
          >
            <Input
              id={ids.cuit}
              name="cuit"
              value={cuit}
              onChange={(e) => setCuit(e.target.value)}
              onBlur={() => setCuitTocado(true)}
              placeholder="11 números, con o sin guiones"
              inputMode="numeric"
              autoComplete="off"
              required
              aria-invalid={cuitError ? true : undefined}
              aria-describedby={cuitError ? `${ids.cuit}-error` : undefined}
            />
            <ErrorDelCampo id={`${ids.cuit}-error`} texto={cuitError} />
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
              aria-invalid={faltan.email ? true : undefined}
              aria-describedby={faltan.email ? `${ids.email}-falta` : undefined}
            />
            <ErrorDelCampo id={`${ids.email}-falta`} texto={faltan.email} />
          </Field>
          <Field
            label="Punto de venta"
            htmlFor={ids.pv}
            required
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
              aria-describedby={pvError ? `${ids.pv}-error` : undefined}
            />
            <ErrorDelCampo id={`${ids.pv}-error`} texto={pvError} />
          </Field>
          <Field label="Condición frente al IVA" htmlFor={ids.iva} hint="La que figura en su constancia de inscripción de ARCA.">
            <Select id={ids.iva} name="condicionIva" value={condicionIva} onChange={(e) => setCondicionIva(e.target.value)} className="min-h-11">
              <option value="">No la sé todavía</option>
              {CONDICIONES_IVA.map((c) => (
                <option key={c} value={c}>{NOMBRE_CONDICION_IVA[c]}</option>
              ))}
            </Select>
          </Field>
          <Field label="¿Qué tipo de cliente es?" htmlFor={ids.tam} hint="Con esto Soporte elige el plan.">
            <Select id={ids.tam} name="tamanio" value={tamanio} onChange={(e) => setTamanio(e.target.value)} className="min-h-11">
              <option value="">No sé</option>
              {TAMANIOS.map((t) => (
                <option key={t} value={t}>{NOMBRE_TAMANIO[t]}</option>
              ))}
            </Select>
          </Field>
          <Field label="WhatsApp del cliente" htmlFor={ids.wa} hint="Opcional. Con característica, sin 0 ni 15.">
            <Input
              id={ids.wa}
              name="whatsapp"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="11 5555 4444"
              inputMode="tel"
              autoComplete="off"
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
          <Field label="Algo que Soporte tenga que saber" htmlFor={ids.nota} hint="Opcional: cuántos locales, si fía, cuántas personas lo usan." className="sm:col-span-2">
            <Textarea id={ids.nota} name="nota" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={NOTA_MAX} rows={2} />
          </Field>
        </div>

        <div className="mt-md flex items-center gap-sm">
          <Button type="submit" disabled={pendiente || !!cuitError || !!pvError}>
            {pendiente ? "Enviando el pedido…" : "Pedir el alta a Soporte GSG"}
          </Button>
        </div>

        <div className="mt-sm">
          {resultado && !resultado.ok && (
            nuevo ? (
              <div data-ui="franja" data-tono="peligro" className="px-4 py-2 text-[13px]">
                <span id={`${ids.nombre}-error`}>{resultado.error}</span>
              </div>
            ) : (
            <p id={`${ids.nombre}-error`} className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              {resultado.error}
            </p>
            )
          )}
          {resultado?.ok && (
            <div className={nuevo ? "border-y border-line py-3 text-sm text-strong" : "rounded-xl border border-success/40 bg-success-soft px-4 py-3 text-sm text-success"}>
              <p>{resultado.mensaje}</p>
            </div>
          )}
        </div>
        {/* La ÚNICA región viva del formulario. */}
        <p aria-live="polite" aria-atomic="true" className="sr-only">{anuncio}</p>
      </form>
  );

  if (nuevo) {
    return (
      <Bloque
        id="alta-cliente"
        titulo="Agregar un cliente"
        nota="Mandás el pedido · Soporte GSG lo configura y te avisa por WhatsApp"
        className="scroll-mt-24"
      >
        {formulario}
      </Bloque>
    );
  }
  return (
    <SectionGroup
      title="Agregar un cliente"
      description="Mandás el pedido con los datos del cliente. Soporte GSG lo configura y te avisa por WhatsApp. Nada se cobra ni se emite sin tu acción."
    >
      {formulario}
    </SectionGroup>
  );
}
