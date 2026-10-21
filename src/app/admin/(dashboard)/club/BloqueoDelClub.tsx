"use client";

// ============================================================================
// EL BLOQUEO DEL CLUB — pieza global: la pantalla con el PIN, quién opera y «Cambiar de usuario».
// ============================================================================
//
// Port de la pantalla bloqueada del club vanilla (public/previews/breakpoint/club/app.mjs: `bloquear`,
// `pintarBloqueo`, `desbloquear`, `cambiarUsuario`). La lógica está en bloqueo-core.ts (pura y testeada).
//
//   · Jornada real sin nadie operando: una pantalla que tapa TODO. Es un <dialog> nativo con `showModal()`: lo de
//     atrás queda inerte (no se toca ni se lee con lector de pantalla) y el foco queda adentro. Escape no la cierra y,
//     si el navegador la cierra igual, se vuelve a abrir. Las teclas no llegan a los atajos del panel (la paleta).
//     Se entra con el PIN de quien estaba o, eligiendo de la lista, con el de otra persona (`verificarPin`).
//   · Se vuelve a bloquear: tras `config.bloqueoMin` minutos sin uso, con la pantalla apagada (o en otra app) 30 s o
//     más, a mano (tecla L o «Bloquear» de la cinta: bloquear-ahora.tsx) y al recargar.
//   · 5 PIN mal → 30 s, después 2 min, después 10 min; guardado en el equipo (sobrevive a recargar). La espera se
//     anuncia una vez; la cuenta regresiva se ve pero no se lee cada segundo.
//   · El PIN es del largo del rol (dueño 4, recepción 2: `largoPin`); se prueba solo al llegar a ese largo. Un dueño
//     con el PIN viejo de 2 lo confirma con «Desbloquear» y, antes de liberar la recepción, elige uno de 4
//     (`PasoPinNuevo` → `entrarConPinNuevo`), como `pedirPinNuevo` del vanilla. Desde «Cambiar de usuario» pasa por
//     la pantalla bloqueada, directo a ese paso.
//   · Demo: no se bloquea (opera el usuario de ejemplo), pero «Cambiar de usuario» deja probar con otro usuario.
//   · Nunca se muestra un PIN.
// En la consola de arranque (jornada real sin configurar: `config.configurado === false`) no bloquea, como el vanilla.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { LARGO_PIN, LARGO_PIN_VIEJO, ROLES, largoPin, pinDesactualizado } from "@/lib/club/motor.mjs";
import type { EstadoClub } from "@/lib/club/motor.mjs";
import { Button } from "@/components/ui/Button";
import { Hoja } from "@/components/ui/Hoja";
import { cn } from "@/components/ui/cn";
import EnLaCabecera from "./EnLaCabecera";
import { puestoDeDuenio } from "./config-jornada";
import type { Almacen, JornadaDelClub } from "./almacen";
import {
  REVISAR_INACTIVIDAD_MS,
  anotarCambioDePin,
  bloquearElClub,
  cambioDePinPendiente,
  entrarConPinNuevo,
  guardaDelBloqueo,
  intentosVigentes,
  olvidarBloqueo,
  olvidarCambioDePin,
  primerNombre,
  probarPin,
  quienesPuedenEntrar,
  relojDeEspera,
  segundosDeEspera,
  textoDeEspera,
  textoDelMotivo,
  textoPinNuevoObligatorio,
  ultimoBloqueo,
  vencioLaInactividad,
  vuelveDeLaPantallaApagada,
  type CambioDePinPendiente,
  type GuardaDelBloqueo,
  type MotivoDelBloqueo,
  type QuienEntra,
} from "./bloqueo-core";
import { guardaDelPin } from "./tope-de-pin";
import type { PropsDePieza } from "./solapas-club";
import { porFirma, useEstadoDelGuardado, useOperador, useSeleccion } from "./usar-almacen";

interface DatosDelBloqueo {
  firma: string;
  quienes: QuienEntra[];
  bloqueoMin: number;
  configurado: boolean;
  nombreDelClub: string;
  /** ¿Algún dueño tiene todavía el PIN viejo de 2? (se le avisa a quien entra como dueño, sin decir quién). */
  hayPinViejo: boolean;
}

const leerDatos = (e: EstadoClub): DatosDelBloqueo => {
  const quienes = quienesPuedenEntrar(e);
  const bloqueoMin = Number(e.config.bloqueoMin) || 0;
  const configurado = e.config.configurado !== false;
  const nombreDelClub = e.config.nombre ?? "";
  const hayPinViejo = quienes.some((u) => pinDesactualizado(e, u.id));
  return { firma: JSON.stringify([quienes, bloqueoMin, configurado, nombreDelClub, hayPinViejo]), quienes, bloqueoMin, configurado, nombreDelClub, hayPinViejo };
};

/** El campo deja entrar el PIN más largo cuando no se sabe de quién es. */
const LARGO_PIN_MAX = Math.max(LARGO_PIN.duenio, LARGO_PIN.recepcion);

/** ¿El foco está en un campo donde se escribe? (ahí la L es una letra, no «Bloquear»). */
function escribiendo(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return true;
  return t instanceof HTMLInputElement && !["button", "submit", "reset", "checkbox", "radio", "range", "color", "file"].includes(t.type);
}

/**
 * Con alguien operando en la jornada real: mira el uso (toques, teclas, rueda), el tiempo sin uso, la pantalla
 * apagada y la tecla L. El tiempo sin uso se lee del estado en cada revisión (si un dueño lo cambia, vale ya).
 */
function useVigilancia(almacen: Almacen, activa: boolean) {
  useEffect(() => {
    if (!activa) return;
    let ultimoUso = Date.now();
    let ocultaDesde: number | null = null;
    const bloquear = (m: MotivoDelBloqueo) => bloquearElClub(almacen, m);
    const marcar = () => {
      ultimoUso = Date.now();
    };
    const revisar = () => {
      if (vencioLaInactividad(ultimoUso, Date.now(), almacen.estado().config.bloqueoMin)) bloquear("inactividad");
    };
    const alCambiarVista = () => {
      if (document.hidden) {
        ocultaDesde = Date.now();
        return;
      }
      const volvio = vuelveDeLaPantallaApagada(ocultaDesde, Date.now());
      ocultaDesde = null;
      if (volvio) bloquear("pantalla");
      else revisar();
    };
    // iOS congela la página al apagar la pantalla sin avisar siempre: al volver del caché, se pide el PIN.
    const alVolver = (e: PageTransitionEvent) => {
      if (e.persisted) bloquear("pantalla");
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "l" && e.key !== "L") return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || escribiendo(e.target)) return;
      if (document.querySelector('dialog[data-ui="paleta"][open]')) return;
      e.preventDefault();
      bloquear("manual");
    };
    const tipos = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const t of tipos) document.addEventListener(t, marcar, { capture: true, passive: true });
    const intervalo = setInterval(revisar, REVISAR_INACTIVIDAD_MS);
    document.addEventListener("visibilitychange", alCambiarVista);
    window.addEventListener("pageshow", alVolver);
    window.addEventListener("keydown", alTeclear);
    return () => {
      for (const t of tipos) document.removeEventListener(t, marcar, { capture: true });
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alCambiarVista);
      window.removeEventListener("pageshow", alVolver);
      window.removeEventListener("keydown", alTeclear);
    };
  }, [almacen, activa]);
}

/** Botones para elegir quién entra (sin PINs: nombre y rol). */
function ListaDeUsuarios({ quienes, elegido, onElegir, etiqueta }: { quienes: QuienEntra[]; elegido: string | null; onElegir: (id: string) => void; etiqueta: string }) {
  return (
    <div role="group" aria-label={etiqueta} className="flex flex-col gap-2">
      {quienes.map((u) => (
        <button
          key={u.id}
          type="button"
          aria-pressed={elegido === u.id}
          onClick={() => onElegir(u.id)}
          className={cn(
            "flex min-h-11 items-center justify-between gap-3 rounded-md border px-4 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
            elegido === u.id ? "border-accent bg-accent-soft text-strong" : "border-line-strong bg-surface-raised text-strong hover:bg-surface-sunken",
          )}
        >
          <span className="font-semibold">{u.nombre}</span>
          <span className="text-muted">{ROLES[u.rol]}</span>
        </button>
      ))}
    </div>
  );
}

/** El campo del PIN: `largo` números (el del rol), sin autocompletar. Quien lo usa decide si prueba solo al completarlo. */
function CampoDePin({
  id,
  etiqueta,
  valor,
  largo,
  deshabilitado = false,
  describe,
  onCambiar,
  campo,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  largo: number;
  deshabilitado?: boolean;
  describe: string;
  onCambiar: (limpio: string) => void;
  campo?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-strong">
        {etiqueta}
      </label>
      <input
        ref={campo}
        id={id}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        pattern="[0-9]*"
        maxLength={largo}
        placeholder={"•".repeat(largo)}
        value={valor}
        disabled={deshabilitado}
        aria-describedby={describe}
        // El PIN son números: lo que no es número no entra (y no gasta un intento).
        onChange={(e) => onCambiar(e.target.value.replace(/\D/g, "").slice(0, largo))}
        data-ui="input"
        className={cn(largo > 2 ? "w-40" : "w-28", "h-12 rounded-md border border-line-strong bg-surface-raised px-3 text-center text-xl tracking-[0.5em] text-strong focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:bg-surface-sunken disabled:opacity-60")}
      />
    </div>
  );
}

/** Lo que se anuncia (una vez) y, aparte y sin anunciar, la cuenta regresiva. */
function AvisoDelPin({ id, anuncio, segundos, error }: { id: string; anuncio: string; segundos: number; error: boolean }) {
  return (
    <div className="min-h-6 text-sm">
      <p id={id} role="status" className={error ? "font-semibold text-danger" : "text-muted"}>
        {anuncio}
      </p>
      {segundos > 0 && (
        <p aria-hidden className="tabular-nums text-muted">
          Falta {relojDeEspera(segundos)}
        </p>
      )}
    </div>
  );
}

/**
 * Prueba un PIN con el tope; dice qué anunciar y si entró. Compartido por la pantalla bloqueada y el cambio. La cuenta
 * regresiva late cada segundo SÓLO mientras hay espera; al terminar se anuncia una vez «Ya podés probar de nuevo».
 */
function usePruebaDePin(almacen: Almacen, guarda: GuardaDelBloqueo) {
  const [ahora, setAhora] = useState(() => Date.now());
  const segundos = segundosDeEspera(intentosVigentes(guarda.leer(), ahora), ahora);
  const [anuncio, setAnuncio] = useState(() => textoDeEspera(segundos));
  const [error, setError] = useState(() => segundos > 0);
  const hayEspera = segundos > 0;
  useEffect(() => {
    if (!hayEspera) return;
    const t = setInterval(() => {
      const ya = Date.now();
      setAhora(ya);
      if (segundosDeEspera(intentosVigentes(guarda.leer(), ya), ya) === 0) {
        setAnuncio("Ya podés probar de nuevo.");
        setError(false);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [hayEspera, guarda]);

  /**
   * Prueba el PIN. Bueno → entra («entro»). Bueno pero del largo viejo y `alPinViejo` se hace cargo (devuelve true) →
   * NO entra: queda el paso del PIN nuevo («pinViejo»). Malo, incompleto o en espera → «no».
   */
  const probar = useCallback(
    (usuarioId: string | null, pin: string, alPinViejo?: (c: CambioDePinPendiente) => boolean): "entro" | "pinViejo" | "no" => {
      const ya = Date.now();
      const r = probarPin(almacen.estado(), usuarioId, pin, guarda.leer(), ya);
      setAhora(ya);
      if (r.tipo === "bueno") {
        // A cero sólo con un dueño (y su PIN de 4); recepción entra, pero los fallos y la tanda quedan (SEC-5).
        guarda.guardar(r.intentos);
        if (r.pinViejo && alPinViejo?.({ usuarioId: r.usuario.id, viejo: r.pin })) {
          setAnuncio("");
          setError(false);
          return "pinViejo";
        }
        const previo = ultimoBloqueo(almacen).usuarioId ?? almacen.operador()?.usuario.id ?? null;
        olvidarBloqueo(almacen);
        almacen.cambiarOperador(r.usuario, { usuarioId: r.usuario.id, pin: r.pin });
        almacen.informar({ ok: true, mensaje: previo === r.usuario.id ? "Desbloqueado." : `Hola, ${primerNombre(r.usuario.nombre)}.` });
        setAnuncio("");
        setError(false);
        return "entro";
      }
      if (r.tipo === "malo") guarda.guardar(r.intentos);
      setAnuncio(r.mensaje);
      setError(true);
      return "no";
    },
    [almacen, guarda],
  );
  return { probar, segundos, anuncio, error };
}

// ───────────── el PIN viejo de un dueño: elegir uno nuevo antes de operar ─────────────

/**
 * El paso obligatorio del dueño que entró con el PIN viejo de 2 (como `pintarPinNuevo` del vanilla): elige uno de 4,
 * repetido, y entra. «Ahora no» vuelve a la pantalla bloqueada: sin PIN nuevo no se opera. El PIN viejo vive sólo en
 * el estado de la pantalla bloqueada (memoria) hasta guardar el nuevo.
 */
function PasoPinNuevo({
  almacen,
  cambio,
  anterior,
  onAhoraNo,
}: {
  almacen: Almacen;
  cambio: CambioDePinPendiente;
  anterior: string | null;
  onAhoraNo: () => void;
}) {
  const ids = useId();
  const primero = useRef<HTMLInputElement>(null);
  const [nuevo, setNuevo] = useState("");
  const [repetido, setRepetido] = useState("");
  const [aviso, setAviso] = useState("");
  const u = almacen.estado().usuarios.find((x) => x.id === cambio.usuarioId) ?? null;
  const largo = largoPin(u?.rol);
  // G8: el PIN de un dueño se cambia desde el puesto del dueño. En otra compu el servidor no lo dejaría pasar (volvería
  // el viejo sin aviso): acá no se ofrece; se dice dónde hacerlo y la pantalla queda bloqueada.
  const enSuPuesto = puestoDeDuenio(almacen) || u?.rol !== "duenio";
  useEffect(() => {
    (enSuPuesto ? primero.current : document.getElementById(`${ids}-entendido`))?.focus();
  }, [enSuPuesto, ids]);
  if (!u) return null;
  if (!enSuPuesto) {
    return (
      <div className="flex flex-col gap-3">
        <p id={`${ids}-donde`} role="status" className="text-sm text-strong">
          <strong>{primerNombre(u.nombre)}, tu PIN todavía es el viejo de 2 números.</strong> Cambialo desde el puesto del dueño (la compu donde entrás
          al ERP con tu usuario de dueño): ahí elegís uno de {largo} y después entrás acá con ése.
        </p>
        <Button id={`${ids}-entendido`} aria-describedby={`${ids}-donde`} variant="solid" size="md" className="self-start" onClick={onAhoraNo}>
          Entendido (queda bloqueada)
        </Button>
      </div>
    );
  }
  const guardar = () => {
    const d = entrarConPinNuevo(almacen, cambio, nuevo, repetido);
    if (d.ok) {
      olvidarBloqueo(almacen);
      almacen.informar({ ok: true, mensaje: `${d.mensaje} ${anterior === u.id ? "Desbloqueado." : `Hola, ${primerNombre(u.nombre)}.`}` });
      return;
    }
    setAviso(d.mensaje);
    setNuevo("");
    setRepetido("");
    primero.current?.focus();
  };
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        guardar();
      }}
    >
      <div className="flex items-center gap-3">
        <span aria-hidden className="flex size-11 items-center justify-center rounded-full bg-accent-soft text-lg font-semibold text-strong">
          {u.nombre.slice(0, 1).toUpperCase()}
        </span>
        <span className="flex flex-col">
          <span className="font-semibold text-strong">{u.nombre}</span>
          <span className="text-sm text-muted">{ROLES[u.rol]}</span>
        </span>
      </div>
      <p id={`${ids}-q`} className="text-sm text-strong">
        {textoPinNuevoObligatorio(u.rol)}
      </p>
      <CampoDePin id={`${ids}-n`} etiqueta={`PIN nuevo (${largo} números)`} valor={nuevo} largo={largo} describe={`${ids}-q ${ids}-a`} campo={primero} onCambiar={setNuevo} />
      <CampoDePin id={`${ids}-r`} etiqueta="Repetilo" valor={repetido} largo={largo} describe={`${ids}-a`} onCambiar={setRepetido} />
      <p id={`${ids}-a`} role={aviso ? "alert" : "status"} className={cn("min-h-6 text-sm", aviso ? "font-semibold text-danger" : "text-muted")}>
        {aviso}
      </p>
      <Button type="submit" variant="solid" size="md">
        Guardar y entrar
      </Button>
      <Button variant="ghost" size="md" className="self-start" onClick={onAhoraNo}>
        Ahora no (queda bloqueada)
      </Button>
    </form>
  );
}

// ───────────── la pantalla bloqueada ─────────────

function PantallaBloqueada({ almacen, datos, guarda, jornada }: { almacen: Almacen; datos: DatosDelBloqueo; guarda: GuardaDelBloqueo; jornada: JornadaDelClub }) {
  const ids = useId();
  const dialogo = useRef<HTMLDialogElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const [{ motivo, usuarioId: anterior }] = useState(() => ultimoBloqueo(almacen));
  const delAnterior = anterior && datos.quienes.some((u) => u.id === anterior) ? anterior : null;
  // Quien estaba sigue con su PIN; si no había nadie (recarga) y hay una sola persona con PIN, es ella.
  const [elegido, setElegido] = useState<string | null>(() => delAnterior ?? (datos.quienes.length === 1 ? datos.quienes[0].id : null));
  const [otro, setOtro] = useState(false);
  const [pin, setPin] = useState("");
  // Dueño con el PIN viejo: el paso del PIN nuevo (desde acá o desde «Cambiar de usuario», que lo deja anotado).
  const [cambio, setCambio] = useState<CambioDePinPendiente | null>(() => cambioDePinPendiente(almacen));
  // Un dueño fuera de su puesto no cambia el PIN acá (G8): el título lo dice (PasoPinNuevo muestra dónde hacerlo).
  const cambioFueraDeSuPuesto = !!cambio && !puestoDeDuenio(almacen) && datos.quienes.find((u) => u.id === cambio.usuarioId)?.rol === "duenio";
  useEffect(() => olvidarCambioDePin(almacen), [almacen]);
  const { probar, segundos, anuncio, error } = usePruebaDePin(almacen, guarda);
  const quien = datos.quienes.find((u) => u.id === elegido) ?? null;
  const conLista = !quien;

  // Modal de verdad: showModal (lo de atrás inerte, foco adentro). Escape no cierra; si se cierra igual, vuelve.
  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (!d.open) d.showModal();
    const noCerrar = (e: Event) => e.preventDefault();
    const reabrir = () => requestAnimationFrame(() => {
      if (d.isConnected && !d.open) d.showModal();
    });
    // Las teclas de adentro no llegan a los atajos del panel (la paleta, «nuevo turno»…): sólo al PIN y los botones.
    const aislar = (e: KeyboardEvent) => e.stopPropagation();
    // Y si algo de afuera tiene el foco (no debería: es modal), la tecla no hace nada y el foco vuelve al bloqueo.
    const deAfuera = (e: KeyboardEvent) => {
      if (e.target instanceof Node && d.contains(e.target)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      (d.querySelector<HTMLElement>("input:not([disabled]), button:not([disabled])") ?? d).focus();
    };
    d.addEventListener("cancel", noCerrar);
    d.addEventListener("close", reabrir);
    d.addEventListener("keydown", aislar);
    window.addEventListener("keydown", deAfuera, { capture: true });
    return () => {
      d.removeEventListener("cancel", noCerrar);
      d.removeEventListener("close", reabrir);
      d.removeEventListener("keydown", aislar);
      window.removeEventListener("keydown", deAfuera, { capture: true });
      if (d.open) d.close();
    };
  }, []);

  // El foco: al PIN si ya se sabe quién; si no, a la lista.
  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (quien && segundos === 0) campo.current?.focus();
    else if (!quien) d.querySelector<HTMLElement>('[role="group"] button')?.focus();
  }, [quien, segundos]);

  const intentar = (valor: string) => {
    const r = probar(elegido, valor, (c) => {
      setCambio(c);
      return true;
    });
    if (r !== "entro") setPin("");
  };

  const titulo = `${ids}-t`;
  const aviso = `${ids}-a`;
  const viejo = `${ids}-v`;
  const sinNadie = datos.quienes.length === 0;
  const conPinViejo = datos.hayPinViejo && quien?.rol === "duenio";
  return (
    <dialog
      ref={dialogo}
      data-ui="bloqueo-del-club"
      aria-labelledby={titulo}
      aria-describedby={cambio ? undefined : `${ids}-m`}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-surface p-4 text-body backdrop:bg-surface"
    >
      <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center gap-4 py-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">{datos.nombreDelClub ? `${datos.nombreDelClub} · ` : ""}Gestión del club</p>
        <div className="flex flex-col gap-1">
          <h2 id={titulo} className="text-2xl font-semibold text-strong">
            {cambio ? (cambioFueraDeSuPuesto ? "Tu PIN es el viejo" : "Elegí tu PIN nuevo") : "Pantalla bloqueada"}
          </h2>
          {!cambio && (
            <p id={`${ids}-m`} className="text-sm text-muted">
              {otro ? textoDelMotivo("cambio", datos.bloqueoMin) : textoDelMotivo(motivo, datos.bloqueoMin)}
            </p>
          )}
        </div>

        {cambio ? (
          <PasoPinNuevo
            almacen={almacen}
            cambio={cambio}
            anterior={anterior}
            onAhoraNo={() => {
              // Queda bloqueada con la misma persona elegida (vuelve a poner su PIN, o elige otro usuario).
              setElegido(datos.quienes.some((u) => u.id === cambio.usuarioId) ? cambio.usuarioId : delAnterior);
              setCambio(null);
              setPin("");
            }}
          />
        ) : sinNadie ? (
          <p role="status" className="text-sm text-strong">
            {jornada === "abriendo" ? "Abriendo la jornada…" : "Nadie tiene un PIN armado en este equipo. Avisá a soporte."}
          </p>
        ) : conLista ? (
          <ListaDeUsuarios
            quienes={datos.quienes}
            elegido={elegido}
            etiqueta="¿Quién entra?"
            onElegir={(id) => {
              setElegido(id);
              setPin("");
            }}
          />
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              intentar(pin);
            }}
          >
            <div className="flex items-center gap-3">
              <span aria-hidden className="flex size-11 items-center justify-center rounded-full bg-accent-soft text-lg font-semibold text-strong">
                {quien.nombre.slice(0, 1).toUpperCase()}
              </span>
              <span className="flex flex-col">
                <span className="font-semibold text-strong">{quien.nombre}</span>
                <span className="text-sm text-muted">{ROLES[quien.rol]}</span>
              </span>
            </div>
            <CampoDePin
              id={`${ids}-pin`}
              etiqueta={otro || quien.id !== anterior ? `PIN de ${primerNombre(quien.nombre)}` : "Tu PIN para seguir"}
              valor={pin}
              largo={largoPin(quien.rol)}
              deshabilitado={segundos > 0}
              describe={conPinViejo ? `${aviso} ${viejo}` : aviso}
              campo={campo}
              onCambiar={(limpio) => {
                setPin(limpio);
                // Se prueba solo al llegar al largo del rol de quien entra; el PIN viejo de 2 se confirma con «Desbloquear».
                if (limpio.length === largoPin(quien.rol)) intentar(limpio);
              }}
            />
            {conPinViejo && (
              <p id={viejo} className="text-sm text-muted">
                ¿Todavía tenés el PIN viejo de {LARGO_PIN_VIEJO}? Ponelo y tocá «Desbloquear».
              </p>
            )}
            <AvisoDelPin id={aviso} anuncio={anuncio} segundos={segundos} error={error} />
            <Button type="submit" variant="solid" size="md" disabled={segundos > 0}>
              Desbloquear
            </Button>
          </form>
        )}

        {!cambio && !sinNadie && !conLista && datos.quienes.length > 1 && (
          <Button
            variant="ghost"
            size="md"
            className="self-start"
            onClick={() => {
              setOtro(true);
              setElegido(null);
              setPin("");
            }}
          >
            {otro ? "Elegir otro usuario" : "Entrar con otro usuario"}
          </Button>
        )}
        {/* En la lista, volver a quien estaba (si había alguien: tras recargar no hay a quién volver). */}
        {!cambio && conLista && delAnterior && (
          <Button
            variant="ghost"
            size="md"
            className="self-start"
            onClick={() => {
              setOtro(false);
              setElegido(delAnterior);
              setPin("");
            }}
          >
            Volver
          </Button>
        )}
        {!cambio && conLista && !sinNadie && <AvisoDelPin id={aviso} anuncio={anuncio} segundos={segundos} error={error} />}
      </div>
    </dialog>
  );
}

// ───────────── cambiar de usuario (con alguien operando) ─────────────

function CambioDeUsuario({ almacen, datos, guarda, onCerrar }: { almacen: Almacen; datos: DatosDelBloqueo; guarda: GuardaDelBloqueo; onCerrar: () => void }) {
  const ids = useId();
  const campo = useRef<HTMLInputElement>(null);
  const [elegido, setElegido] = useState<string | null>(() => almacen.operador()?.usuario.id ?? null);
  const [pin, setPin] = useState("");
  const { probar, segundos, anuncio, error } = usePruebaDePin(almacen, guarda);
  const quien = datos.quienes.find((u) => u.id === elegido) ?? null;
  useEffect(() => {
    if (segundos === 0) requestAnimationFrame(() => campo.current?.focus());
  }, [elegido, segundos]);

  // Un dueño con el PIN viejo no entra directo: la pantalla se bloquea y ahí elige el nuevo (en la demo no se bloquea:
  // entra como antes, igual que el vanilla).
  const alPinViejo = (c: CambioDePinPendiente) => {
    anotarCambioDePin(almacen, c);
    if (bloquearElClub(almacen, "cambio")) return true;
    olvidarCambioDePin(almacen);
    return false;
  };
  const intentar = (valor: string) => {
    if (probar(elegido, valor, alPinViejo) !== "no") onCerrar();
    else setPin("");
  };
  return (
    <Hoja
      abierta
      onCerrar={onCerrar}
      titulo="¿Quién usa el sistema?"
      descripcion={`Elegí tu usuario y poné tu PIN (dueños ${LARGO_PIN.duenio} números, recepción ${LARGO_PIN.recepcion}).`}
      pie={
        <>
          <Button variant="outline" size="md" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button variant="solid" size="md" type="submit" form={`${ids}-f`} disabled={segundos > 0}>
            Entrar
          </Button>
        </>
      }
    >
      <form
        id={`${ids}-f`}
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          intentar(pin);
        }}
      >
        <ListaDeUsuarios quienes={datos.quienes} elegido={elegido} etiqueta="Usuarios" onElegir={(id) => (setElegido(id), setPin(""))} />
        <CampoDePin
          id={`${ids}-pin`}
          etiqueta={quien ? `PIN de ${primerNombre(quien.nombre)}` : "PIN"}
          valor={pin}
          largo={quien ? largoPin(quien.rol) : LARGO_PIN_MAX}
          deshabilitado={segundos > 0}
          describe={`${ids}-a`}
          campo={campo}
          onCambiar={setPin}
        />
        <AvisoDelPin id={`${ids}-a`} anuncio={anuncio} segundos={segundos} error={error} />
      </form>
    </Hoja>
  );
}

// ───────────── la pieza ─────────────

/**
 * Quién opera, con «Cambiar de usuario». Sin operador no se pinta (la pantalla bloqueada tapa todo). Con la barra del
 * panel de casa, va arriba como en el club de hoy: la ficha de quien opera (inicial, nombre y rol); tocarla cambia.
 */
function BarraDelOperador({ nombre, rol, onCambiar }: { nombre: string; rol: string; onCambiar: () => void }) {
  return (
    <EnLaCabecera fuera={<BarraDelOperadorEnLinea nombre={nombre} rol={rol} onCambiar={onCambiar} />}>
      <button type="button" data-casa="ficha" onClick={onCambiar} aria-label={`Opera: ${nombre}, ${rol}. Cambiar de usuario`} className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 py-1 text-left">
        <span aria-hidden="true" data-casa="inicial" className="grid size-8 shrink-0 place-items-center rounded-sm text-sm font-bold">
          {nombre.trim().charAt(0).toUpperCase()}
        </span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-bold">{nombre}</span>
          <span data-casa="tenue" className="text-xs">{rol}</span>
        </span>
      </button>
    </EnLaCabecera>
  );
}

function BarraDelOperadorEnLinea({ nombre, rol, onCambiar }: { nombre: string; rol: string; onCambiar: () => void }) {
  return (
    <div data-ui="operador-del-club" className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <p className="text-body">
        Opera: <span className="font-semibold text-strong">{nombre}</span> <span className="text-muted">· {rol}</span>
      </p>
      <Button variant="ghost" size="md" onClick={onCambiar}>
        Cambiar de usuario
      </Button>
    </div>
  );
}

export default function BloqueoDelClub({ almacen, negocio }: PropsDePieza) {
  const real = almacen.modo() === "real";
  const operador = useOperador(almacen);
  const datos = useSeleccion(almacen, leerDatos, porFirma);
  const { jornada } = useEstadoDelGuardado(almacen);
  // En la jornada real, los intentos quedan en el equipo por negocio y son LOS MISMOS de la caja, el descuento y
  // Configuración (`guardaDelPin`: una guarda por almacén); en la demo, en memoria.
  const [guarda] = useState(() => (real ? guardaDelPin(almacen, negocio) : guardaDelBloqueo(null, null)));
  const [cambiando, setCambiando] = useState(false);
  const bloqueado = real && !operador && datos.configurado;
  useVigilancia(almacen, real && !!operador);

  return (
    <>
      {operador && (
        <BarraDelOperador nombre={operador.usuario.nombre} rol={ROLES[operador.usuario.rol]} onCambiar={() => setCambiando(true)} />
      )}
      {/* Se monta en cada bloqueo: arranca con quien estaba y sin PIN escrito. */}
      {bloqueado && <PantallaBloqueada almacen={almacen} datos={datos} guarda={guarda} jornada={jornada} />}
      {cambiando && operador && <CambioDeUsuario almacen={almacen} datos={datos} guarda={guarda} onCerrar={() => setCambiando(false)} />}
    </>
  );
}
