"use client";

// Formularios del TURNO DE CAJERO (sólo donde hay cajón físico): abrir con el fondo inicial y
// cerrar con el arqueo del efectivo.
//
// La acción se INVOCA DIRECTO y se espera su promesa, como en el libro (LibroForms.tsx) y el
// cierre del día: por `useActionState` el QA midió guardados que quedaban colgados en
// "Guardando…" con la fila ya escrita. Y así lo que no salió —un rechazo o un corte de señal—
// se dice acá, con lo cargado todavía escrito: los campos son controlados y el formulario no
// se reinicia (el `<form action>` de React los vaciaba también cuando volvía un error).
//
// Cerrar el turno es irreversible (congela el arqueo): lleva confirmación, con lo que se va a
// asentar —cuadra, faltante o sobrante— antes de «Sí, cerrar caja». Abrir lleva confirmación sólo
// cuando el fondo contado no coincide con el libro, porque esa diferencia queda asentada (ADR-101).
//
// UN SOLO ESPERADO (ADR-101): los dos formularios reciben el esperado que muestra la pantalla
// (`esperadoDelCajon`, el saldo en efectivo del libro) y lo mandan al grabar
// (`esperadoConfirmado`). El servidor compara contra el libro con ESE número y, si el libro se
// movió mientras se contaba, no graba: lo que se confirma acá es lo que queda asentado.
//
// Son client components finos: la carga de datos y el arqueo en vivo viven en el server
// component (page.tsx). Acá solo va la interacción del formulario.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { openCashSession, closeCashSession, type CajaActionState } from "@/lib/caja-actions";
import { round2 } from "@/lib/round";
import { leerImporte } from "@/lib/pos-peso";
import { CAMPO_ESPERADO_CONFIRMADO, esperadoParaElFormulario } from "@/lib/caja/esperado-del-cajon";
import { Field, Input, buttonClasses, fmtMoneyARS } from "@/components/ui";

// Mensaje de error del formulario. `role="alert"` → el lector de pantalla lo
// anuncia apenas aparece, sin robar el foco.
function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
      {error}
    </p>
  );
}

// El redirect de sesión vencida llega como excepción con digest NEXT_REDIRECT: se deja pasar.
function isNextRedirect(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/**
 * Llama la acción y devuelve el texto del error (o null si salió). Un corte de señal no se lleva
 * la pantalla: se dice qué pasó y cómo saber si llegó a grabarse.
 */
async function correr(
  accion: (prev: CajaActionState, fd: FormData) => Promise<CajaActionState>,
  fd: FormData,
  sinRespuesta: string,
): Promise<string | null> {
  try {
    const r = await accion(null, fd);
    return r && !r.ok ? r.error : null;
  } catch (e) {
    if (isNextRedirect(e)) throw e;
    return sinRespuesta;
  }
}

// --- Apertura de turno (estado sin caja abierta) ---
// `esperado`: lo que el libro dice que hay en el cajón (`getCajaData().esperadoEnElCajon`).
// `null` sólo en la demo.
export function OpenCajaForm({ esperado }: { esperado: number | null }) {
  const router = useRouter();
  const [fondo, setFondo] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [pending, startTransition] = useTransition();
  const diferencia = esperado === null ? null : previewArqueo(fondo, esperado);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    // Un fondo que no coincide con el libro deja asentada la diferencia: primero se muestra.
    if (!confirmando && diferencia && diferencia.diff !== 0) {
      setConfirmando(true);
      return;
    }
    abrir();
  }

  function abrir() {
    const fd = new FormData();
    fd.set("openingFloat", fondo);
    fd.set(CAMPO_ESPERADO_CONFIRMADO, esperadoParaElFormulario(esperado ?? 0));
    startTransition(async () => {
      const err = await correr(
        openCashSession,
        fd,
        "No se pudo abrir la caja: revisá la conexión y volvé a intentar. Si al recargar la caja aparece abierta, ya se abrió.",
      );
      setError(err);
      setConfirmando(false);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Field
        label="Fondo inicial"
        htmlFor="openingFloat"
        required
        hint={
          esperado === null
            ? "Efectivo con el que arranca el cajón."
            : `Contá el efectivo del cajón. Según el libro tendría que haber ${fmtMoneyARS(esperado)}.`
        }
      >
        <Input
          id="openingFloat"
          // Texto, no `number`: Chromium tira la coma al tipear ("12,5" → 125) y lee
          // "12.500" como 12,5. El servidor lo lee con `leerImporte`.
          type="text"
          name="openingFloat"
          autoComplete="off"
          value={fondo}
          onChange={(e) => {
            setFondo(e.target.value);
            setError(null);
            setConfirmando(false);
          }}
          required
          inputMode="decimal"
          aria-invalid={error ? true : undefined}
          className="w-44 text-right tabular-nums"
        />
      </Field>
      <FormError error={error} />
      {confirmando && diferencia && esperado !== null ? (
        <div
          role="group"
          aria-labelledby="abrir-caja-titulo"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setConfirmando(false);
            }
          }}
          className="space-y-3 rounded-md border border-line bg-surface-sunken p-3"
        >
          <p id="abrir-caja-titulo" className="text-sm font-medium text-strong">
            ¿Abrir con {fmtMoneyARS(round2(diferencia.diff + esperado))}? Según el libro tendría que haber {fmtMoneyARS(esperado)}: queda
            asentado un {diferencia.diff < 0 ? "faltante" : "sobrante"} de {fmtMoneyARS(Math.abs(diferencia.diff))} al abrir el turno.
          </p>
          <p className="text-xs text-muted">
            Si el libro está mal (plata que nunca estuvo en el cajón), abrí igual y después corregilo en el Libro de caja con un movimiento con
            la fecha de hoy.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" autoFocus onClick={abrir} disabled={pending} className={buttonClasses("solid", "md")}>
              {pending ? "Abriendo…" : "Sí, abrir caja"}
            </button>
            <button type="button" onClick={() => setConfirmando(false)} disabled={pending} className={buttonClasses("ghost", "md")}>
              Volver
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button type="submit" disabled={pending} className={buttonClasses("solid", "md")}>
            {pending ? "Abriendo…" : "Abrir caja"}
          </button>
        </div>
      )}
    </form>
  );
}

// El alta manual de movimientos NO vive más acá. Vive en `AddLibroEntryForm` (libro/
// LibroForms.tsx) y escribe por `addLibroEntry`, que es el único camino de escritura manual
// del negocio: tiene medio de pago, fecha contable, guarda de día congelado y guarda de
// duplicado contra las ventas que el sistema ya asentó. El formulario que estaba acá no
// tenía selector de medio, así que todo lo que cargaba caía en EFECTIVO por default — en un
// negocio de servicios eso es ciego a siete de cada diez pesos.

// Preview del arqueo EN VIVO: dado el efectivo contado que se está tipeando y el
// esperado, devuelve la diferencia y cómo mostrarla. `null` = todavía no hay un
// contado válido para comparar (no mostramos nada). Reusa `round2` de la aritmética
// pura para que el preview cuadre exactamente con lo que congelará el cierre
// (mismo redondeo que `reconcileCash`).
type ArqueoPreview = { diff: number; label: string; tone: "success" | "danger" | "neutral" };
function previewArqueo(countedRaw: string, expected: number): ArqueoPreview | null {
  const lectura = leerImporte(countedRaw);
  if (lectura.estado !== "ok") return null;
  const counted = lectura.valor;
  const diff = round2(counted - expected);
  if (diff === 0) return { diff, label: "Cuadra", tone: "neutral" };
  if (diff < 0) return { diff, label: `Faltante ${fmtMoneyARS(Math.abs(diff))}`, tone: "danger" };
  return { diff, label: `Sobrante ${fmtMoneyARS(diff)}`, tone: "success" };
}

// --- Cierre / arqueo del turno ---
export function CloseCajaForm({ expected }: { expected: number }) {
  const router = useRouter();
  // Efectivo contado controlado para poder previsualizar la diferencia ANTES de
  // confirmar el cierre (que es irreversible): el cajero ve si va a quedar faltante
  // o sobrante mientras tipea, no después de cerrar.
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [pending, startTransition] = useTransition();
  const cerrarRef = useRef<HTMLButtonElement>(null);
  // Al volver de la confirmación (o de un intento que falló), el foco vuelve al botón que la
  // abrió: no se pierde en la página. Se espera a que el envío termine, porque mientras tanto
  // el botón está deshabilitado y un botón deshabilitado no toma el foco.
  const focoAlBoton = useRef(false);
  const [volverFoco, setVolverFoco] = useState(0);
  useEffect(() => {
    if (!focoAlBoton.current || pending || !cerrarRef.current) return;
    focoAlBoton.current = false;
    cerrarRef.current.focus();
  }, [volverFoco, pending]);
  function pedirFocoAlBoton() {
    focoAlBoton.current = true;
    setVolverFoco((n) => n + 1);
  }

  const preview = previewArqueo(counted, expected);
  const previewTone =
    preview?.tone === "danger"
      ? "text-danger"
      : preview?.tone === "success"
        ? "text-success"
        : "text-muted";

  // Primer paso: revisar. Sin un contado legible no hay nada que confirmar: se dice y el foco
  // va al campo.
  function revisar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (confirmando || pending) return;
    if (!preview) {
      setError("Escribí el efectivo que contaste en el cajón (aunque sea 0), con coma si tiene centavos.");
      document.getElementById("counted")?.focus();
      return;
    }
    setError(null);
    setConfirmando(true);
  }

  function volver() {
    setConfirmando(false);
    pedirFocoAlBoton();
  }

  function cerrar() {
    const fd = new FormData();
    fd.set("counted", counted);
    fd.set("note", note);
    // El esperado que se mostró y se confirmó: el servidor no cierra si el libro ya dice otro.
    fd.set(CAMPO_ESPERADO_CONFIRMADO, esperadoParaElFormulario(expected));
    startTransition(async () => {
      const err = await correr(
        closeCashSession,
        fd,
        "No se pudo cerrar la caja: revisá la conexión y volvé a intentar. Lo que contaste sigue cargado; si al recargar la caja aparece cerrada, ya se cerró.",
      );
      setError(err);
      setConfirmando(false);
      if (err) pedirFocoAlBoton();
      router.refresh();
    });
  }

  return (
    <form onSubmit={revisar} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
        <Field
          label="Efectivo contado"
          htmlFor="counted"
          required
          hint={`Se compara con el esperado (${fmtMoneyARS(expected)}).`}
        >
          <Input
            id="counted"
            type="text"
            name="counted"
            autoComplete="off"
            required
            inputMode="decimal"
            aria-invalid={error ? true : undefined}
            className="text-right tabular-nums"
            value={counted}
            onChange={(e) => {
              setCounted(e.target.value);
              setConfirmando(false);
              setError(null);
            }}
          />
        </Field>
        <Field label="Nota (opcional)" htmlFor="close-note">
          <Input
            id="close-note"
            type="text"
            name="note"
            placeholder="Observaciones del cierre…"
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setConfirmando(false);
            }}
          />
        </Field>
      </div>

      {/* Preview del arqueo en vivo: aria-live para que el lector de pantalla anuncie
          la diferencia a medida que se tipea el contado. */}
      {preview && (
        <p className="text-sm" aria-live="polite" aria-atomic="true">
          <span className="text-muted">Diferencia: </span>
          <span className={`font-medium tabular-nums ${previewTone}`}>{preview.label}</span>
        </p>
      )}

      <FormError error={error} />
      {confirmando && preview ? (
        <div
          role="group"
          aria-labelledby="cerrar-caja-titulo"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              volver();
            }
          }}
          className="space-y-3 rounded-md border border-line bg-surface-sunken p-3"
        >
          <p id="cerrar-caja-titulo" className="text-sm font-medium text-strong">
            ¿Cerrar el turno? Contaste {fmtMoneyARS(round2(preview.diff + expected))} y se esperaba {fmtMoneyARS(expected)}:{" "}
            {preview.diff === 0 ? "cuadra." : `${preview.label.toLowerCase()}.`}
          </p>
          <p className="text-xs text-muted">Después de cerrar, el arqueo queda asentado y el turno no se reabre.</p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" autoFocus onClick={cerrar} disabled={pending} className={buttonClasses("danger", "md")}>
              {pending ? "Cerrando…" : "Sí, cerrar caja"}
            </button>
            <button type="button" onClick={volver} disabled={pending} className={buttonClasses("ghost", "md")}>
              Volver
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button ref={cerrarRef} type="submit" disabled={pending} className={buttonClasses("danger", "md")}>
            Cerrar caja
          </button>
        </div>
      )}
    </form>
  );
}
