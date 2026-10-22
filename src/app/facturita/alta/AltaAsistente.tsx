"use client";

// Asistente de alta de Facturita: cinco pasos, uno por pantalla. Toda la validación es la de
// src/lib/facturita-onboarding.ts (pura, testeada). Lo que se tipea queda en memoria de esta
// pestaña: no se manda a ningún servidor ni se guarda en el navegador. El último paso arma el
// mensaje para que GSG active la cuenta (alta operada, ver page.tsx).

import { useEffect, useId, useRef, useState } from "react";
import {
  ALTA_VACIA,
  CONDICIONES_IVA,
  PASOS_PUNTO_VENTA,
  altaCompleta,
  mensajeActivacion,
  opcionCondicion,
  pasosDelegacion,
  validarCuitEmisor,
  validarNombre,
  validarPuntoVenta,
  type CondicionIva,
  type DatosAlta,
  type ErroresAlta,
} from "@/lib/facturita-onboarding";
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO, FOCO } from "../estilos";

const PASOS = ["Tus datos", "Cómo estás inscripto", "Punto de venta", "Permiso en ARCA", "Listo"] as const;

const INPUT =
  "mt-1 block h-12 w-full rounded-lg border border-line-strong bg-surface-raised px-3 text-base text-strong placeholder:text-faint aria-[invalid=true]:border-danger " +
  FOCO;

function MensajeError({ id, texto }: { id: string; texto?: string }) {
  if (!texto) return null;
  return (
    <p id={id} role="alert" className="mt-2 text-sm font-medium text-danger">
      {texto}
    </p>
  );
}

export default function AltaAsistente({ baseWhatsApp }: { baseWhatsApp: string | null }) {
  const [paso, setPaso] = useState(0);
  const [datos, setDatos] = useState<DatosAlta>(ALTA_VACIA);
  const [errores, setErrores] = useState<ErroresAlta>({});
  const [copiado, setCopiado] = useState(false);
  const titulo = useRef<HTMLHeadingElement>(null);
  const primerMontaje = useRef(true);
  const uid = useId();

  // Al cambiar de paso, el foco va al título del paso nuevo (lector de pantalla y teclado).
  useEffect(() => {
    if (primerMontaje.current) {
      primerMontaje.current = false;
      return;
    }
    titulo.current?.focus();
  }, [paso]);

  const cambiar = <K extends keyof DatosAlta>(campo: K, valor: DatosAlta[K]) => {
    setDatos((d) => ({ ...d, [campo]: valor }));
    setErrores((e) => ({ ...e, [campo]: undefined }));
  };

  /** Valida sólo lo del paso actual; si está bien, avanza. */
  const siguiente = () => {
    const e: ErroresAlta = {};
    if (paso === 0) {
      const n = validarNombre(datos.nombre);
      if (n) e.nombre = n;
      const c = validarCuitEmisor(datos.cuit);
      if (!c.ok) e.cuit = c.error;
    }
    if (paso === 1 && !datos.condicion) e.condicion = "Elegí una opción para seguir.";
    if (paso === 2 && !datos.sinPuntoVenta) {
      const pv = validarPuntoVenta(datos.puntoVenta);
      if (!pv.ok) e.puntoVenta = pv.error;
    }
    setErrores(e);
    if (Object.keys(e).length === 0) setPaso((p) => Math.min(p + 1, PASOS.length - 1));
  };

  const cuit = validarCuitEmisor(datos.cuit);
  const mensaje = mensajeActivacion(datos);
  const id = (campo: string) => `${uid}-${campo}`;

  return (
    <div className="mt-8">
      {/* Progreso */}
      <p className="text-sm font-medium text-muted" aria-live="polite">
        Paso {paso + 1} de {PASOS.length}: {PASOS[paso]}
      </p>
      <div className="mt-2 grid grid-cols-5 gap-1" aria-hidden="true">
        {PASOS.map((p, i) => (
          <span key={p} className={`h-1.5 rounded-full ${i <= paso ? "bg-accent" : "bg-line-strong"}`} />
        ))}
      </div>

      <form
        noValidate
        onSubmit={(ev) => {
          ev.preventDefault();
          siguiente();
        }}
        className="mt-6 rounded-xl border border-line bg-surface-raised p-5 sm:p-7"
      >
        <h2 ref={titulo} tabIndex={-1} className="text-xl font-semibold tracking-tight text-strong outline-none">
          {PASOS[paso]}
        </h2>

        {paso === 0 && (
          <div className="mt-5 space-y-5">
            <div>
              <label htmlFor={id("nombre")} className="text-sm font-semibold text-strong">
                Nombre y apellido, o razón social
              </label>
              <input
                id={id("nombre")}
                className={INPUT}
                value={datos.nombre}
                onChange={(e) => cambiar("nombre", e.target.value)}
                autoComplete="name"
                aria-invalid={Boolean(errores.nombre)}
                aria-describedby={errores.nombre ? id("nombre-error") : undefined}
              />
              <MensajeError id={id("nombre-error")} texto={errores.nombre} />
            </div>
            <div>
              <label htmlFor={id("cuit")} className="text-sm font-semibold text-strong">
                Tu CUIT
              </label>
              <p id={id("cuit-ayuda")} className="text-sm text-muted">
                Los 11 números, con o sin guiones. Está en tu constancia de inscripción.
              </p>
              <input
                id={id("cuit")}
                className={`${INPUT} tabular-nums`}
                value={datos.cuit}
                onChange={(e) => cambiar("cuit", e.target.value)}
                onBlur={() => {
                  if (datos.cuit.trim() && !cuit.ok) setErrores((er) => ({ ...er, cuit: cuit.error }));
                }}
                inputMode="numeric"
                autoComplete="off"
                placeholder="20-12345678-9"
                aria-invalid={Boolean(errores.cuit)}
                aria-describedby={`${id("cuit-ayuda")}${errores.cuit ? ` ${id("cuit-error")}` : ""}`}
              />
              {cuit.ok && (
                <p className="mt-2 text-sm font-medium text-success">✓ CUIT válido: {cuit.formateado}</p>
              )}
              <MensajeError id={id("cuit-error")} texto={errores.cuit} />
            </div>
          </div>
        )}

        {paso === 1 && (
          <fieldset className="mt-5" aria-describedby={errores.condicion ? id("condicion-error") : undefined}>
            <legend className="text-sm text-muted">
              ¿Cómo figurás en ARCA? Si no estás seguro, fijate en tu constancia de inscripción.
            </legend>
            <div className="mt-3 space-y-3">
              {CONDICIONES_IVA.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer gap-3 rounded-lg border border-line p-4 has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
                >
                  <input
                    type="radio"
                    name="condicion"
                    value={c.id}
                    checked={datos.condicion === c.id}
                    onChange={() => cambiar("condicion", c.id as CondicionIva)}
                    className="mt-1 size-4 accent-[var(--accent)]"
                  />
                  <span>
                    <span className="block font-semibold text-strong">{c.nombre}</span>
                    <span className="block text-sm text-muted">{c.ayuda}</span>
                    <span className="mt-1 block text-sm text-body">Vas a emitir factura {c.letras}.</span>
                  </span>
                </label>
              ))}
            </div>
            <MensajeError id={id("condicion-error")} texto={errores.condicion} />
          </fieldset>
        )}

        {paso === 2 && (
          <div className="mt-5 space-y-4">
            <div>
              <label htmlFor={id("pv")} className="text-sm font-semibold text-strong">
                Número de punto de venta para facturación electrónica
              </label>
              <input
                id={id("pv")}
                className={`${INPUT} max-w-[12rem] tabular-nums`}
                value={datos.puntoVenta}
                onChange={(e) => cambiar("puntoVenta", e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                placeholder="2"
                disabled={datos.sinPuntoVenta}
                aria-invalid={Boolean(errores.puntoVenta)}
                aria-describedby={errores.puntoVenta ? id("pv-error") : undefined}
              />
              <MensajeError id={id("pv-error")} texto={errores.puntoVenta} />
            </div>
            <label className="flex items-start gap-3 text-sm text-body">
              <input
                type="checkbox"
                checked={datos.sinPuntoVenta}
                onChange={(e) => {
                  cambiar("sinPuntoVenta", e.target.checked);
                  setErrores((er) => ({ ...er, puntoVenta: undefined }));
                }}
                className={`mt-0.5 size-4 accent-[var(--accent)] ${FOCO}`}
              />
              Todavía no lo creé: lo armamos juntos cuando te activamos.
            </label>
            <details className="rounded-lg bg-surface-sunken p-4">
              <summary className={`cursor-pointer rounded text-sm font-semibold text-strong ${FOCO}`}>
                ¿Cómo creo un punto de venta? (dos minutos)
              </summary>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted">
                {PASOS_PUNTO_VENTA.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ol>
              <p className="mt-3 text-sm text-muted">
                Ojo: el punto de venta que usás para el «Comprobantes en línea» de ARCA no sirve acá; tiene que ser uno
                de «Web Services».
              </p>
            </details>
          </div>
        )}

        {paso === 3 && (
          <div className="mt-5">
            <p className="text-muted">
              Para que Facturita emita a tu nombre, nos das permiso desde ARCA. No nos das tu clave: das un permiso que
              sirve sólo para facturar, y lo podés sacar cuando quieras.
            </p>
            <ol className="mt-4 space-y-3">
              {pasosDelegacion().map((p, i) => (
                <li key={p} className="flex gap-3 text-sm text-body">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold tabular-nums text-accent-ink">
                    {i + 1}
                  </span>
                  <span className="pt-1">{p}</span>
                </li>
              ))}
            </ol>
            <label className="mt-5 flex items-start gap-3 rounded-lg border border-line p-4 text-sm text-body">
              <input
                type="checkbox"
                checked={datos.delegacionHecha}
                onChange={(e) => cambiar("delegacionHecha", e.target.checked)}
                className={`mt-0.5 size-4 accent-[var(--accent)] ${FOCO}`}
              />
              Ya lo hice. (Si no te sale, seguí igual: te ayudamos por WhatsApp.)
            </label>
          </div>
        )}

        {paso === 4 && (
          <div className="mt-5">
            <dl className="divide-y divide-line rounded-lg border border-line text-sm">
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-muted">Nombre</dt>
                <dd className="text-right font-medium text-strong">{datos.nombre.trim()}</dd>
              </div>
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-muted">CUIT</dt>
                <dd className="font-medium tabular-nums text-strong">{cuit.ok ? cuit.formateado : datos.cuit}</dd>
              </div>
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-muted">Inscripción</dt>
                <dd className="text-right font-medium text-strong">
                  {datos.condicion ? opcionCondicion(datos.condicion).nombre : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-muted">Punto de venta</dt>
                <dd className="font-medium tabular-nums text-strong">
                  {datos.sinPuntoVenta ? "Lo armamos juntos" : datos.puntoVenta}
                </dd>
              </div>
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-muted">Permiso en ARCA</dt>
                <dd className="text-right font-medium text-strong">
                  {datos.delegacionHecha ? "Hecho" : "Te ayudamos"}
                </dd>
              </div>
            </dl>

            <p className="mt-5 text-sm text-muted">
              Mandanos este resumen y te escribimos para activar la cuenta. Todavía no guardamos nada: estos datos quedan
              sólo en tu pantalla hasta que los mandes.
            </p>
            <p className="mt-2 text-xs text-muted">
              Al mandarlo aceptás los{" "}
              <a href="/facturita/terminos" className={`rounded underline underline-offset-2 hover:text-strong ${FOCO}`}>términos</a>{" "}
              y que usemos tus datos para darte de alta y emitir tus facturas, como dice la{" "}
              <a href="/facturita/privacidad" className={`rounded underline underline-offset-2 hover:text-strong ${FOCO}`}>política de privacidad</a>.
              Podés pedir acceso, corrección o borrado cuando quieras (Ley 25.326).
            </p>

            {altaCompleta(datos) ? (
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                {baseWhatsApp ? (
                  <a
                    href={`${baseWhatsApp}${encodeURIComponent(mensaje)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={BOTON_PRINCIPAL}
                  >
                    Mandar por WhatsApp
                  </a>
                ) : null}
                <button
                  type="button"
                  className={baseWhatsApp ? BOTON_SECUNDARIO : BOTON_PRINCIPAL}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(mensaje);
                      setCopiado(true);
                    } catch {
                      setCopiado(false);
                    }
                  }}
                >
                  Copiar el resumen
                </button>
              </div>
            ) : (
              <p role="alert" className="mt-5 text-sm font-medium text-danger">
                Falta algún dato: volvé a los pasos anteriores y revisalos.
              </p>
            )}
            <p aria-live="polite" className="mt-3 text-sm text-success">
              {copiado ? "Copiado. Pegalo en el chat con nosotros." : ""}
            </p>
          </div>
        )}

        <div className="mt-8 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:justify-between">
          {paso > 0 ? (
            <button type="button" onClick={() => setPaso((p) => p - 1)} className={BOTON_SECUNDARIO}>
              Volver
            </button>
          ) : (
            <span />
          )}
          {paso < PASOS.length - 1 && (
            <button type="submit" className={BOTON_PRINCIPAL}>
              {paso === 3 ? "Ver el resumen" : "Seguir"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
