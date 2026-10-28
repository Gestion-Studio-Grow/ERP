"use client";

// ============================================================================
// «ABRÍ LA CAJA» SIN SALIR DE VENDER (Magra, tanda 2 · 2D; magra-DISENO.md E21 · MG-057).
// ============================================================================
//
// Con la caja cerrada, arriba de Vender: «Abrí la caja: ayer quedaron $48.000 en el cajón» y dos
// teclas. «Abrir con $48.000» abre en UN toque con el fondo sugerido (el efectivo que dice el
// libro: no deja diferencia). «Conté otro» pide el monto; si no coincide con el libro, antes de
// abrir dice el faltante o sobrante que queda asentado (una vez, al abrir el turno: ADR-101).
//
// La apertura es la de siempre (`openCashSession`, caja-actions.ts), con el esperado que se mostró
// (`esperadoConfirmado`): si el libro se movió mientras se contaba, no abre y lo dice. Una caja ya
// abierta (otra pestaña, el doble toque) cuenta como lista: se recarga y la tarjeta desaparece.
// Sólo con el mostrador boutique: la monta vender/page.tsx con lo que da `getAperturaEnVender`.
//
// A CIEGAS (interruptor «arqueo-ciego», N2 · M1-C3): sin número ni «Abrir con $X». Se escribe lo
// contado y se toca «Abrir la caja»; si cuadra con el libro, abre. Si no, el servidor no graba nada
// y RECIÉN AHÍ dice cuánto esperaba el libro y pide el motivo; con el motivo, abre y la diferencia
// queda asentada una vez. Con el interruptor apagado, la tarjeta de siempre.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { openCashSession } from "@/lib/caja-actions";
import { CAMPO_ESPERADO_CONFIRMADO, esperadoParaElFormulario } from "@/lib/caja/esperado-del-cajon";
import { fondoParaElFormulario, tarjetaDeApertura, textoDelMotivoDeApertura } from "@/lib/caja/apertura-sugerida";
import { leerImporte } from "@/lib/pos-peso";
import { round2 } from "@/lib/round";
import { buttonClasses } from "@/components/ui";
import { textoPlata } from "@/lib/cobro/pie-de-cobro-core";

function isNextRedirect(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

export default function AbrirCajaEnLinea({
  esperado,
  ultimoCierre,
  hoy,
  aCiegas = false,
}: {
  esperado: number;
  ultimoCierre: string | null;
  hoy: string;
  /** Interruptor «arqueo-ciego»: contar antes de ver el esperado (llega de `getAperturaEnVender`). */
  aCiegas?: boolean;
}) {
  const router = useRouter();
  const tarjeta = tarjetaDeApertura({ esperado, ultimoCierre, hoy, aCiegas });
  const [otro, setOtro] = useState(!tarjeta.conSugerido);
  const [monto, setMonto] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // El servidor pidió el motivo: trae el esperado (recién ahora se ve) y la diferencia.
  const [pideMotivo, setPideMotivo] = useState<{ esperado: number; diferencia: number } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [pending, startTransition] = useTransition();
  const campo = useRef<HTMLInputElement>(null);
  const campoMotivo = useRef<HTMLTextAreaElement>(null);

  const lectura = leerImporte(monto);
  const contado = lectura.estado === "ok" ? lectura.valor : null;
  // A ciegas no hay diferencia que mostrar antes de contar: la dice el servidor.
  const diferencia = contado === null || aCiegas ? null : round2(contado - esperado);

  function abrir(fondo: number) {
    if (pending) return;
    const fd = new FormData();
    fd.set("openingFloat", fondoParaElFormulario(fondo));
    // El esperado que la persona VIO: a ciegas, ninguno hasta que el servidor lo dijo.
    const visto = pideMotivo ? pideMotivo.esperado : aCiegas ? null : esperado;
    if (visto !== null) fd.set(CAMPO_ESPERADO_CONFIRMADO, esperadoParaElFormulario(visto));
    if (motivo.trim()) fd.set("motivo", motivo.trim());
    startTransition(async () => {
      try {
        const r = await openCashSession(null, fd);
        if (r && !r.ok && r.pideMotivo) {
          setPideMotivo(r.pideMotivo);
          setError(motivo.trim() ? r.error : null);
          setConfirmando(false);
          requestAnimationFrame(() => campoMotivo.current?.focus());
          return;
        }
        if (r && !r.ok && !r.yaAbierta) {
          setError(r.error);
          setConfirmando(false);
          return;
        }
        setError(null);
        router.refresh();
      } catch (e) {
        if (isNextRedirect(e)) throw e;
        setError("No se pudo abrir la caja: revisá la conexión y volvé a tocar. Si al recargar la caja aparece abierta, ya se abrió.");
      }
    });
  }

  function conteOtro(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (contado === null || contado < 0) {
      setError("Escribí cuánto hay en el cajón (0 o más).");
      campo.current?.focus();
      return;
    }
    if (pideMotivo && !motivo.trim()) {
      setError("Anotá el motivo de la diferencia para abrir (vale «sin explicación por ahora»).");
      campoMotivo.current?.focus();
      return;
    }
    if (diferencia !== null && diferencia !== 0 && !confirmando && !pideMotivo) {
      setConfirmando(true);
      return;
    }
    abrir(contado);
  }

  return (
    <section
      aria-labelledby="abrir-caja-vender"
      className="mb-4 rounded-lg border border-accent/40 bg-accent-soft/40 p-4"
    >
      <h2 id="abrir-caja-vender" className="text-base font-semibold text-strong">
        {tarjeta.titulo}
      </h2>
      <p className="mt-1 text-sm text-muted">Con la caja abierta, el efectivo que cobres entra en tu turno y en el arqueo.</p>

      {!otro ? (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
          <button
            type="button"
            onClick={() => abrir(tarjeta.sugerido)}
            disabled={pending}
            className={`${buttonClasses("solid", "md")} min-h-11`}
          >
            {pending ? "Abriendo…" : `Abrir con ${textoPlata(tarjeta.sugerido)}`}
          </button>
          <button
            type="button"
            onClick={() => {
              setOtro(true);
              setError(null);
              // El campo aparece en este mismo render: el foco va al terminar.
              requestAnimationFrame(() => campo.current?.focus());
            }}
            disabled={pending}
            className={`${buttonClasses("outline", "md")} min-h-11`}
          >
            Conté otro
          </button>
        </div>
      ) : (
        <form onSubmit={conteOtro} noValidate className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="fondo-contado" className="text-sm font-medium text-strong">
              ¿Cuánto hay en el cajón?
            </label>
            <input
              ref={campo}
              id="fondo-contado"
              name="fondo-contado"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={monto}
              onChange={(e) => {
                setMonto(e.target.value);
                setConfirmando(false);
                setPideMotivo(null);
                setError(null);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "abrir-caja-error" : undefined}
              className="min-h-11 w-48 rounded-md border border-line bg-surface px-3 text-right tabular-nums text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </div>
          {pideMotivo && contado !== null ? (
            <div role="group" aria-labelledby="abrir-caja-motivo" className="space-y-3 rounded-md border border-line bg-surface-sunken p-3">
              <p id="abrir-caja-motivo" className="text-sm font-medium text-strong">
                {textoDelMotivoDeApertura(contado, pideMotivo.esperado)}
              </p>
              <div className="flex flex-col gap-1">
                <label htmlFor="motivo-apertura" className="text-sm font-medium text-strong">
                  Motivo (obligatorio)
                </label>
                <textarea
                  ref={campoMotivo}
                  id="motivo-apertura"
                  name="motivo"
                  rows={2}
                  value={motivo}
                  placeholder="ayer se pagó el flete con el cajón"
                  onChange={(e) => {
                    setMotivo(e.target.value);
                    setError(null);
                  }}
                  className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                <button type="submit" disabled={pending} className={`${buttonClasses("solid", "md")} min-h-11`}>
                  {pending
                    ? "Abriendo…"
                    : `Abrir con ${textoPlata(contado)} y asentar el ${pideMotivo.diferencia < 0 ? "faltante" : "sobrante"}`}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPideMotivo(null);
                    setMonto("");
                    setError(null);
                    requestAnimationFrame(() => campo.current?.focus());
                  }}
                  disabled={pending}
                  className={`${buttonClasses("ghost", "md")} min-h-11`}
                >
                  Volver a contar
                </button>
              </div>
            </div>
          ) : confirmando && diferencia !== null && diferencia !== 0 && contado !== null ? (
            <div role="group" aria-labelledby="abrir-caja-confirmar" className="space-y-3 rounded-md border border-line bg-surface-sunken p-3">
              <p id="abrir-caja-confirmar" className="text-sm font-medium text-strong">
                ¿Abrir con {textoPlata(contado)}? Según el libro tendría que haber {textoPlata(esperado)}: queda asentado un{" "}
                {diferencia < 0 ? "faltante" : "sobrante"} de {textoPlata(Math.abs(diferencia))} al abrir el turno.
              </p>
              <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                <button type="submit" autoFocus disabled={pending} className={`${buttonClasses("solid", "md")} min-h-11`}>
                  {pending ? "Abriendo…" : `Sí, abrir con ${textoPlata(contado)}`}
                </button>
                <button type="button" onClick={() => setConfirmando(false)} disabled={pending} className={`${buttonClasses("ghost", "md")} min-h-11`}>
                  Volver
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
              <button type="submit" disabled={pending} className={`${buttonClasses("solid", "md")} min-h-11`}>
                {pending ? "Abriendo…" : contado !== null && contado >= 0 ? `Abrir con ${textoPlata(contado)}` : "Abrir la caja"}
              </button>
              {tarjeta.conSugerido && (
                <button
                  type="button"
                  onClick={() => {
                    setOtro(false);
                    setMonto("");
                    setError(null);
                  }}
                  disabled={pending}
                  className={`${buttonClasses("ghost", "md")} min-h-11`}
                >
                  Volver
                </button>
              )}
            </div>
          )}
        </form>
      )}

      {error && (
        <p id="abrir-caja-error" role="alert" className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
