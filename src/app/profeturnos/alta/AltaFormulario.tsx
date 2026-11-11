"use client";

// El formulario del alta sola de ProfeTurnos. Errores por campo (aria-invalid + aria-describedby),
// foco al primer campo con error, y al terminar la pantalla con el link al panel del profe.

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { CAMPO_TRAMPA, CAMPOS, type CampoDelAlta } from "@/lib/profeturnos/alta-campos";
import type { EstadoDelAlta } from "./acciones";

const INICIAL: EstadoDelAlta = { respuesta: null, valores: {} };

const ENTRADA =
  "mt-1 block w-full rounded-xl border border-line-strong bg-surface px-4 py-3 text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-[invalid=true]:border-danger";

export default function AltaFormulario({ accion }: { accion: (previo: EstadoDelAlta, f: FormData) => Promise<EstadoDelAlta> }) {
  const [estado, enviar, enviando] = useActionState(accion, INICIAL);
  const form = useRef<HTMLFormElement>(null);
  const listo = useRef<HTMLHeadingElement>(null);
  const aviso = useRef<HTMLParagraphElement>(null);
  const r = estado.respuesta;
  const errores: Partial<Record<CampoDelAlta, string>> = r && !r.ok && "errores" in r ? r.errores : {};
  const mensaje = r && !r.ok && "mensaje" in r ? r.mensaje : null;

  useEffect(() => {
    if (!r) return;
    if (r.ok) return listo.current?.focus();
    const primero = CAMPOS.find((c) => errores[c]);
    if (primero) form.current?.querySelector<HTMLElement>(`[name="${primero}"]`)?.focus();
    else aviso.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r]);

  if (r?.ok) {
    return (
      <section aria-labelledby="alta-lista" className="mt-6 rounded-2xl border border-line bg-surface p-6">
        <h2 id="alta-lista" ref={listo} tabIndex={-1} className="text-2xl font-bold text-strong focus:outline-none">
          ¡Listo! Tu turnero ya existe
        </h2>
        <p className="mt-3 text-body">
          Entrá a tu panel con tu mail y la contraseña que elegiste. Ahí cargás tus horarios y tu precio, y sacás el link para tus
          alumnos.
        </p>
        <p className="mt-3 break-all text-sm text-muted">{r.url}</p>
        <a
          href={r.url}
          className="mt-5 inline-flex rounded-xl bg-accent px-6 py-3 font-semibold text-on-accent hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Entrar a mi panel
        </a>
        <p className="mt-4 text-xs text-muted">Guardá esta dirección: es la de tu panel.</p>
      </section>
    );
  }

  const v = estado.valores;
  const campo = (
    nombre: CampoDelAlta,
    etiqueta: string,
    props: React.InputHTMLAttributes<HTMLInputElement>,
    ayuda?: string,
  ) => {
    const err = errores[nombre];
    const describe = [ayuda ? `${nombre}-ayuda` : null, err ? `${nombre}-error` : null].filter(Boolean).join(" ") || undefined;
    return (
      <div>
        <label htmlFor={`alta-${nombre}`} className="block font-medium text-strong">
          {etiqueta}
        </label>
        {ayuda && (
          <p id={`${nombre}-ayuda`} className="text-sm text-muted">
            {ayuda}
          </p>
        )}
        <input
          id={`alta-${nombre}`}
          name={nombre}
          required
          aria-invalid={err ? true : undefined}
          aria-describedby={describe}
          defaultValue={nombre === "clave" ? undefined : v[nombre]}
          className={ENTRADA}
          {...props}
        />
        {err && (
          <p id={`${nombre}-error`} className="mt-1 text-sm text-danger">
            {err}
          </p>
        )}
      </div>
    );
  };

  return (
    <form ref={form} action={enviar} noValidate className="mt-6 grid gap-5">
      {mensaje && (
        <p ref={aviso} tabIndex={-1} role="alert" className="rounded-xl border border-danger bg-danger-soft p-4 text-sm text-strong focus:outline-none">
          {mensaje}
        </p>
      )}
      {campo("nombre", "Tu nombre", { autoComplete: "name", maxLength: 80 })}
      {campo("negocio", "Cómo se llaman tus clases", { autoComplete: "organization", maxLength: 60 }, "Ej.: Clases de pádel Juan. Sale en tu turnero y arma tu dirección.")}
      {campo("email", "Tu mail", { type: "email", autoComplete: "email", inputMode: "email", maxLength: 254 }, "Con este mail entrás a tu panel.")}
      {campo("whatsapp", "Tu WhatsApp", { type: "tel", autoComplete: "tel-national", inputMode: "tel", maxLength: 30 }, "Con código de área, sin 0 ni 15. Ej.: 11 2345-6789.")}
      {campo("clave", "Elegí una contraseña", { type: "password", autoComplete: "new-password", minLength: 10, maxLength: 200 }, "Al menos 10 caracteres, con letras y números.")}

      {/* Trampa para robots: una persona no la ve ni llega con el teclado. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={`alta-${CAMPO_TRAMPA}`}>No completar</label>
        <input id={`alta-${CAMPO_TRAMPA}`} name={CAMPO_TRAMPA} type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <div>
        <div className="flex items-start gap-3">
          <input
            id="alta-terminos"
            name="terminos"
            type="checkbox"
            value="si"
            required
            defaultChecked={v.terminos === "si"}
            aria-invalid={errores.terminos ? true : undefined}
            aria-describedby={errores.terminos ? "terminos-error" : undefined}
            className="mt-1 size-5 accent-[var(--color-accent)]"
          />
          <label htmlFor="alta-terminos" className="text-body">
            Leí y acepto los{" "}
            <Link
              href="/profeturnos/terminos"
              target="_blank"
              rel="noopener"
              className="font-medium text-accent underline underline-offset-4"
            >
              términos y condiciones<span className="sr-only"> (se abre en otra pestaña)</span>
            </Link>
            .
          </label>
        </div>
        {errores.terminos && (
          <p id="terminos-error" className="mt-1 text-sm text-danger">
            {errores.terminos}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={enviando}
        className="rounded-xl bg-accent px-6 py-3 font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {enviando ? "Creando tu turnero…" : "Crear mi turnero"}
      </button>
    </form>
  );
}
