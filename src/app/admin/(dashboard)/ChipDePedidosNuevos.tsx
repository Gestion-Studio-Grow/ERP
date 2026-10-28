"use client";

// ============================================================================
// CHIP DE PEDIDOS NUEVOS — la cabecera de TODO el panel se entera del pedido de la tienda.
// (reingeniería Magra, tanda 1 · 1I · E30 · MG-054)
// ============================================================================
//
// «● 2 pedidos nuevos · el más viejo hace 12 min»: el vendedor está en Vender, entra un pedido por
// la web, y en menos de un minuto lo ve arriba, con el «bip» de siempre. Un toque abre el más viejo
// (`/admin/pedidos?pedido=<id>`: el cajón del pedido en el tablero). El sonido se apaga con la tecla
// de al lado, por persona y aparato (sonido-del-aviso.ts, la MISMA preferencia que la bandeja).
//
// Dos piezas:
//   · `PedidosNuevos` (una por panel, en AdminShell): pregunta al servidor (`contarPedidosNuevos`,
//     un conteo y el más viejo) al montar y cada 45 s, SÓLO con la pestaña a la vista (Neon, plan
//     gratuito: una pestaña escondida no le pega a la base); al volver a la pestaña pregunta enseguida
//     si pasaron más de 15 s. Hace sonar el bip y anuncia el pedido nuevo (aria-live polite) una sola
//     vez, aunque el chip se dibuje en dos lugares.
//   · `ChipDePedidosNuevos` (lo que se ve): en la cabecera de la PC y en una franja bajo la barra del
//     celular. Sin `PedidosNuevos` arriba (CH y todo negocio sin el mostrador boutique) no dibuja
//     nada: ni un nodo de más en el HTML.
//
// Si la consulta falla (sin señal), queda lo último que se supo: no se inventa ni se borra nada.
//
// Tanda «Consola y aviso» (frente B): pasados 15 min (provisional a confirmar con Magra) el chip pasa
// al tono de alerta y dice «esperando hace 25 min»; el título de la pestaña lleva «(N) » mientras haya
// pedidos esperando; y quien quiera se suscribe a la notificación del navegador (opt-in, sin servidor
// de push). Sin `PedidosNuevos` arriba (CH) nada de esto corre.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { contarPedidosNuevos } from "./pedidos-nuevos";
import {
  PAUSA_MINIMA_DEL_CHIP_MS,
  REFRESCO_DEL_CHIP_MS,
  alertaDelChip,
  anuncioDelChip,
  entroUnPedidoNuevo,
  etiquetaVisibleDelChip,
  hrefDelChip,
  notificacionDelChip,
  textoCortoDelChip,
  textoVisibleDelChip,
  tituloConPedidos,
  type ConteoDePedidosNuevos,
} from "./pedidos/pedidos-core";
import {
  ChipQueSuena,
  bip,
  guardarPreferenciaDeSonido,
  notificar,
  pedirPermisoDeNotificacion,
  useAudioDelAviso,
  usePermisoDeNotificacion,
  useSonidoDelAviso,
  type PermisoDeNotificacion,
} from "./pedidos/sonido-del-aviso";

type Lectura = { conteo: ConteoDePedidosNuevos; ahora: number };

const Contexto = createContext<{
  lectura: Lectura | null;
  sonido: boolean;
  cambiarSonido: () => void;
  permiso: PermisoDeNotificacion;
} | null>(null);

/** Quién pregunta, suena y anuncia: uno solo por panel. `consultar` se inyecta en los tests. */
export function PedidosNuevos({
  children,
  consultar = contarPedidosNuevos,
}: {
  children: React.ReactNode;
  consultar?: () => Promise<ConteoDePedidosNuevos>;
}) {
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const sonido = useSonidoDelAviso();
  const audio = useAudioDelAviso();
  // Lo que hace falta adentro de los temporizadores sin volver a armarlos en cada render.
  const anterior = useRef<ConteoDePedidosNuevos | null>(null);
  const sonidoActual = useRef(sonido);
  useEffect(() => {
    sonidoActual.current = sonido;
  }, [sonido]);

  useEffect(() => {
    let vivo = true;
    let enCurso = false;
    let ultima = 0;
    async function preguntar(forzar: boolean) {
      if (enCurso || document.visibilityState !== "visible") return;
      const ahora = Date.now();
      if (!forzar && ahora - ultima < PAUSA_MINIMA_DEL_CHIP_MS) return;
      enCurso = true;
      ultima = ahora;
      try {
        const conteo = await consultar();
        if (!vivo) return;
        if (entroUnPedidoNuevo(anterior.current, conteo)) {
          setAnuncio(anuncioDelChip(conteo));
          if (sonidoActual.current) bip(audio.current);
          // Opt-in: sólo con el permiso concedido; una por pedido que entra (el `tag` no la repite).
          notificar(notificacionDelChip(conteo));
        }
        anterior.current = conteo;
        setLectura({ conteo, ahora: Date.now() });
      } catch {
        // sin señal o sesión vencida: queda lo último que se supo
      } finally {
        enCurso = false;
      }
    }
    void preguntar(true);
    const id = window.setInterval(() => void preguntar(true), REFRESCO_DEL_CHIP_MS);
    const alVolver = () => void preguntar(false);
    document.addEventListener("visibilitychange", alVolver);
    // Quien toma o avanza un pedido (un formulario o una acción del servidor) no espera al próximo ciclo:
    // se vuelve a preguntar al rato (una sola vez por tanda de envíos), así el chip y el «(N)» se van enseguida.
    let tras: number | undefined;
    const alEnviar = () => {
      window.clearTimeout(tras);
      tras = window.setTimeout(() => void preguntar(true), 1500);
    };
    document.addEventListener("submit", alEnviar, true);
    return () => {
      vivo = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
      document.removeEventListener("submit", alEnviar, true);
      window.clearTimeout(tras);
    };
  }, [consultar, audio]);

  const cambiarSonido = useCallback(() => guardarPreferenciaDeSonido(!sonidoActual.current), []);
  const permiso = usePermisoDeNotificacion();

  // El título de la pestaña: «(2) Vender · …» mientras haya pedidos esperando; con 0, el de siempre.
  // Al navegar, Next pone el título de la página nueva: el observador le vuelve a poner el número.
  const cantidad = lectura?.conteo.cantidad ?? 0;
  useEffect(() => {
    const poner = () => {
      const nuevo = tituloConPedidos(document.title, cantidad);
      if (document.title !== nuevo) document.title = nuevo;
    };
    poner();
    const observador = new MutationObserver(poner);
    observador.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => {
      observador.disconnect();
      const limpio = tituloConPedidos(document.title, 0);
      if (document.title !== limpio) document.title = limpio;
    };
  }, [cantidad]);

  return (
    <Contexto.Provider value={{ lectura, sonido, cambiarSonido, permiso }}>
      <ChipQueSuena.Provider value={true}>
        {children}
        {/* Un solo anuncio para el lector de pantalla, aunque el chip se vea en dos lugares. */}
        <p role="status" aria-live="polite" className="sr-only" data-ui="anuncio-pedidos-nuevos">
          {anuncio}
        </p>
      </ChipQueSuena.Provider>
    </Contexto.Provider>
  );
}

/**
 * El chip. `lugar="pc"`: en la cabecera de la computadora (se esconde en el celular). `lugar="movil"`:
 * una franja pegada debajo de la barra del celular (se esconde en la computadora). Sin pedidos
 * esperando no se ve. `arriba` es la altura de la barra del celular bajo la que se pega la franja.
 */
export function ChipDePedidosNuevos({ lugar, arriba = "top-14" }: { lugar: "pc" | "movil"; arriba?: string }) {
  const c = useContext(Contexto);
  if (!c?.lectura) return null;
  const { conteo, ahora } = c.lectura;
  const texto = textoVisibleDelChip(conteo, ahora);
  if (!texto) return null;
  // Pasados los 15 min (provisional a confirmar con Magra) el chip pasa al tono de alerta.
  const alerta = alertaDelChip(conteo, ahora) !== null;
  const tono = alerta ? "bg-danger-soft text-danger ring-1 ring-inset ring-danger" : "bg-accent text-on-accent";
  const chip = (
    <span data-ui="chip-pedidos-nuevos" data-tono={alerta ? "alerta" : undefined} className="inline-flex min-w-0 items-center gap-1">
      <Link
        href={hrefDelChip(conteo)}
        aria-label={etiquetaVisibleDelChip(conteo, ahora) ?? texto}
        className={`inline-flex min-h-11 min-w-0 items-center gap-2 rounded-full ${tono} px-3.5 text-sm font-semibold tabular-nums hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`}
      >
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-current" />
        <span className="truncate sm:hidden">{textoCortoDelChip(conteo, ahora)}</span>
        <span className="hidden truncate sm:inline">{texto}</span>
      </Link>
      <button
        type="button"
        onClick={c.cambiarSonido}
        aria-pressed={c.sonido}
        aria-label={c.sonido ? "Sonido del aviso: prendido" : "Sonido del aviso: apagado"}
        title={c.sonido ? "Apagar el sonido del aviso" : "Prender el sonido del aviso"}
        className="grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-sunken hover:text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <IconoSonido prendido={c.sonido} />
      </button>
      {/* Opt-in de la notificación del navegador: sólo si se puede pedir (ni denegada ni sin soporte). */}
      {c.permiso === "default" && (
        <button
          type="button"
          onClick={() => void pedirPermisoDeNotificacion()}
          aria-label="Avisarme aunque esté en otra ventana"
          title="Avisarme aunque esté en otra ventana"
          data-ui="pedir-notificacion"
          className="grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-sunken hover:text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <IconoVentana />
        </button>
      )}
    </span>
  );
  if (lugar === "pc") return <span className="hidden min-w-0 lg:inline-flex">{chip}</span>;
  return (
    <div className={`sticky ${arriba} z-20 flex items-center border-b border-line bg-surface-raised px-3 py-1 lg:hidden`}>{chip}</div>
  );
}

function IconoSonido({ prendido }: { prendido: boolean }) {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      {!prendido && <path d="M3 3l18 18" />}
    </svg>
  );
}

/** Una ventana con un punto: «avisame afuera de esta pantalla». */
function IconoVentana() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="15" height="14" rx="2" />
      <path d="M3 9h15" />
      <circle cx="19" cy="5" r="3" fill="currentColor" />
    </svg>
  );
}
