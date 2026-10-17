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
//   · Demo: no se bloquea (opera el usuario de ejemplo), pero «Cambiar de usuario» deja probar con otro usuario.
//   · Nunca se muestra un PIN.
// En la consola de arranque (jornada real sin configurar: `config.configurado === false`) no bloquea, como el vanilla.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ROLES } from "@/lib/club/motor.mjs";
import type { EstadoClub } from "@/lib/club/motor.mjs";
import { Button } from "@/components/ui/Button";
import { Hoja } from "@/components/ui/Hoja";
import { cn } from "@/components/ui/cn";
import type { Almacen, AlmacenamientoLocal, JornadaDelClub } from "./almacen";
import {
  REVISAR_INACTIVIDAD_MS,
  SIN_INTENTOS_DEL_BLOQUEO,
  bloquearElClub,
  claveDeIntentosDelBloqueo,
  guardaDelBloqueo,
  intentosVigentes,
  olvidarBloqueo,
  primerNombre,
  probarPin,
  quienesPuedenEntrar,
  relojDeEspera,
  segundosDeEspera,
  textoDeEspera,
  textoDelMotivo,
  ultimoBloqueo,
  vencioLaInactividad,
  vuelveDeLaPantallaApagada,
  type GuardaDelBloqueo,
  type MotivoDelBloqueo,
  type QuienEntra,
} from "./bloqueo-core";
import type { PropsDePieza } from "./solapas-club";
import { porFirma, useEstadoDelGuardado, useOperador, useSeleccion } from "./usar-almacen";

interface DatosDelBloqueo {
  firma: string;
  quienes: QuienEntra[];
  bloqueoMin: number;
  configurado: boolean;
  nombreDelClub: string;
}

const leerDatos = (e: EstadoClub): DatosDelBloqueo => {
  const quienes = quienesPuedenEntrar(e);
  const bloqueoMin = Number(e.config.bloqueoMin) || 0;
  const configurado = e.config.configurado !== false;
  const nombreDelClub = e.config.nombre ?? "";
  return { firma: JSON.stringify([quienes, bloqueoMin, configurado, nombreDelClub]), quienes, bloqueoMin, configurado, nombreDelClub };
};

function almacenamientoDelNavegador(): AlmacenamientoLocal | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

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

/** El campo del PIN: 2 números, sin autocompletar; al llegar al segundo, prueba solo. */
function CampoDePin({
  id,
  etiqueta,
  valor,
  deshabilitado,
  describe,
  onCambiar,
  campo,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  deshabilitado: boolean;
  describe: string;
  onCambiar: (limpio: string) => void;
  campo: React.RefObject<HTMLInputElement | null>;
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
        maxLength={2}
        placeholder="••"
        value={valor}
        disabled={deshabilitado}
        aria-describedby={describe}
        // El PIN son 2 números: lo que no es número no entra (y no gasta un intento).
        onChange={(e) => onCambiar(e.target.value.replace(/\D/g, "").slice(0, 2))}
        data-ui="input"
        className="h-12 w-28 rounded-md border border-line-strong bg-surface-raised px-3 text-center text-xl tracking-[0.5em] text-strong focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:bg-surface-sunken disabled:opacity-60"
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

  const probar = useCallback(
    (usuarioId: string | null, pin: string): boolean => {
      const ya = Date.now();
      const r = probarPin(almacen.estado(), usuarioId, pin, guarda.leer(), ya);
      setAhora(ya);
      if (r.tipo === "bueno") {
        guarda.guardar(SIN_INTENTOS_DEL_BLOQUEO);
        const previo = ultimoBloqueo(almacen).usuarioId ?? almacen.operador()?.usuario.id ?? null;
        olvidarBloqueo(almacen);
        almacen.cambiarOperador(r.usuario, { usuarioId: r.usuario.id, pin: r.pin });
        almacen.informar({ ok: true, mensaje: previo === r.usuario.id ? "Desbloqueado." : `Hola, ${primerNombre(r.usuario.nombre)}.` });
        setAnuncio("");
        setError(false);
        return true;
      }
      if (r.tipo === "malo") guarda.guardar(r.intentos);
      setAnuncio(r.mensaje);
      setError(true);
      return false;
    },
    [almacen, guarda],
  );
  return { probar, segundos, anuncio, error };
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
    if (!probar(elegido, valor)) setPin("");
  };

  const titulo = `${ids}-t`;
  const aviso = `${ids}-a`;
  const sinNadie = datos.quienes.length === 0;
  return (
    <dialog
      ref={dialogo}
      data-ui="bloqueo-del-club"
      aria-labelledby={titulo}
      aria-describedby={`${ids}-m`}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-surface p-4 text-body backdrop:bg-surface"
    >
      <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center gap-4 py-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">{datos.nombreDelClub ? `${datos.nombreDelClub} · ` : ""}Gestión del club</p>
        <div className="flex flex-col gap-1">
          <h2 id={titulo} className="text-2xl font-semibold text-strong">
            Pantalla bloqueada
          </h2>
          <p id={`${ids}-m`} className="text-sm text-muted">
            {otro ? textoDelMotivo("cambio", datos.bloqueoMin) : textoDelMotivo(motivo, datos.bloqueoMin)}
          </p>
        </div>

        {sinNadie ? (
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
              deshabilitado={segundos > 0}
              describe={aviso}
              campo={campo}
              onCambiar={(limpio) => {
                setPin(limpio);
                if (limpio.length === 2) intentar(limpio);
              }}
            />
            <AvisoDelPin id={aviso} anuncio={anuncio} segundos={segundos} error={error} />
            <Button type="submit" variant="solid" size="md" disabled={segundos > 0}>
              Desbloquear
            </Button>
          </form>
        )}

        {!sinNadie && !conLista && datos.quienes.length > 1 && (
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
        {conLista && delAnterior && (
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
        {conLista && !sinNadie && <AvisoDelPin id={aviso} anuncio={anuncio} segundos={segundos} error={error} />}
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

  const intentar = (valor: string) => {
    if (probar(elegido, valor)) onCerrar();
    else setPin("");
  };
  return (
    <Hoja
      abierta
      onCerrar={onCerrar}
      titulo="¿Quién usa el sistema?"
      descripcion="Elegí tu usuario y poné tu PIN de 2 dígitos."
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

/** Quién opera, con «Cambiar de usuario». Sin operador no se pinta (la pantalla bloqueada tapa todo). */
function BarraDelOperador({ nombre, rol, onCambiar }: { nombre: string; rol: string; onCambiar: () => void }) {
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
  // En la jornada real, los intentos quedan en el equipo por negocio; en la demo, en memoria.
  const [guarda] = useState(() => guardaDelBloqueo(real ? almacenamientoDelNavegador() : null, real ? claveDeIntentosDelBloqueo(negocio) : null));
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
