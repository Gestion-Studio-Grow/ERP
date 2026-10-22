"use client";

// ============================================================================
// LA PALETA DE Ctrl/⌘K — «¿Qué querés hacer?». El centro de la navegación.
// ============================================================================
//
// Un <dialog> modal de 640 px (a pantalla completa en el celular), con la única sombra del sistema.
// Arriba el campo; abajo los resultados por capa (Acciones, Apps), cada uno con su segunda línea y
// lo tipeado marcado. Teclado: ↑/↓ mueven, Enter abre, Esc cierra. Combobox accesible: el foco se
// queda en el campo y la opción activa se anuncia con `aria-activedescendant`; la cantidad de
// resultados, con `aria-live`.
//
// Busca sólo en `comandos`, que llegan calculados del servidor (comandos-core.ts). Con
// `buscarRegistros` (el armazón de «Diseño nuevo»), además pide al servidor clientes, productos y
// pedidos (R6-F2, src/lib/buscador/): espera a que se deje de tipear (DEMORA_MS) y descarta la
// respuesta de una búsqueda vieja. Sin esa prop, la paleta es la de siempre.
//
// Con `buscarFichas` (el buscador global «/», reingeniería CH Tanda 2, §3.5): además pide clientas
// y turnos por nombre o teléfono (src/lib/clientes/buscar-actions.ts), que van PRIMERO. Una ficha
// no navega al tocarla: se SELECCIONA y abajo aparece su panel con lo que hay que saber (próximo
// turno, si debe, faltazos, última vez) y sus teclas [Dar turno] [WhatsApp] [Cobrar lo que debe]
// [Ver ficha]. Teclado: ↑/↓ eligen, Enter hace la primera tecla, Tab llega a las teclas del panel.
// Las teclas de plata que todavía no existen en esta rama («Llegó la seña», «Cobrar lo que debe»
// con su acción) son HUECOS que dibuja quien monta la paleta (`dibujarHueco`).

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconoApp } from "@/components/iconos-apps";
import { Icono } from "./Icono";
import { Kbd } from "./Kbd";
import { atributosBoton, buttonClasses } from "./Button";
import { buscarComandos, resaltar, type Comando, type GrupoDeFichas, type HuecoDeFicha } from "./comandos-core";
import { LARGO_MINIMO, type GrupoDeRegistros } from "@/lib/buscador/registros-core";
import type { ResultadoDeBusqueda } from "@/lib/buscador/buscar-en-el-negocio";

export type BuscarRegistros = (q: string) => Promise<ResultadoDeBusqueda>;
export type BuscarFichas = (q: string) => Promise<{ ok: true; grupos: GrupoDeFichas[] } | { ok: false; mensaje: string }>;
/** Dibuja una tecla de plata de una ficha (o `null` si no la sabe dibujar). `cerrar` cierra la paleta. */
export type DibujarHueco = (hueco: HuecoDeFicha, cerrar: () => void) => React.ReactNode;

/** Cuánto se espera después de la última tecla para ir al servidor. */
const DEMORA_MS = 250;

type EstadoRegistros =
  | { fase: "quieto"; grupos: GrupoDeRegistros[] }
  | { fase: "buscando"; grupos: GrupoDeRegistros[] }
  | { fase: "error"; grupos: GrupoDeRegistros[]; mensaje: string };

type EstadoFichas =
  | { fase: "quieto"; grupos: GrupoDeFichas[] }
  | { fase: "buscando"; grupos: GrupoDeFichas[] }
  | { fase: "error"; grupos: GrupoDeFichas[]; mensaje: string };

const esFicha = (c: Comando | undefined): c is Comando & { teclas: NonNullable<Comando["teclas"]> } => !!c?.teclas && c.teclas.length > 0;

/** El panel de la ficha seleccionada: lo que hay que saber y sus teclas. */
function PanelDeFicha({
  id,
  ficha,
  dibujarHueco,
  onIr,
  onCerrar,
}: {
  id: string;
  ficha: Comando & { teclas: NonNullable<Comando["teclas"]> };
  dibujarHueco?: DibujarHueco;
  onIr: (href: string) => void;
  onCerrar: () => void;
}) {
  const huecos = (ficha.huecos ?? [])
    .map((h) => ({ h, nodo: dibujarHueco ? dibujarHueco(h, onCerrar) : null }))
    .filter((x) => x.nodo !== null && x.nodo !== undefined && x.nodo !== false);
  // Si quien monta la paleta dibuja «Cobrar lo que debe» con la acción de verdad, el enlace de
  // respaldo (a «Saldos a cobrar») sobra.
  const sinRespaldo = huecos.some((x) => x.h.tipo === "cobrar-deuda");
  const teclas = ficha.teclas.filter((t) => !(sinRespaldo && t.id === "cobrar-deuda"));
  return (
    <section id={id} data-parte="detalle" aria-label={`${ficha.nombre}: lo que hay que saber`} className="border-t border-line px-4 py-3">
      <ul aria-live="polite" className="m-0 mb-3 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-sm text-body">
        {(ficha.resumen ?? []).map((linea) => (
          <li key={linea} className="tabular-nums">
            {linea}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {huecos.map((x) => (
          <span key={`${x.h.tipo}-${"turnoId" in x.h ? x.h.turnoId : x.h.clienteId}`} className="contents">
            {x.nodo}
          </span>
        ))}
        {teclas.map((t, i) =>
          t.externo ? (
            <a
              key={t.id}
              href={t.href}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses(i === 0 && huecos.length === 0 ? "solid" : "outline", "sm", "inline-flex items-center")}
              {...atributosBoton(i === 0 && huecos.length === 0 ? "solid" : "outline", "sm")}
              onClick={onCerrar}
            >
              {t.etiqueta}
              <span className="sr-only"> (se abre en otra pestaña)</span>
            </a>
          ) : (
            <a
              key={t.id}
              href={t.href}
              className={buttonClasses(i === 0 && huecos.length === 0 ? "solid" : "outline", "sm", "inline-flex items-center")}
              {...atributosBoton(i === 0 && huecos.length === 0 ? "solid" : "outline", "sm")}
              onClick={(e) => {
                // Navegación del lado del cliente (y la paleta se cierra); con Ctrl/⌘ o la rueda, el navegador.
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                onIr(t.href);
              }}
            >
              {t.etiqueta}
            </a>
          ),
        )}
      </div>
    </section>
  );
}

function Nombre({ nombre, texto }: { nombre: string; texto: string }) {
  const r = resaltar(nombre, texto);
  if (!r) return <>{nombre}</>;
  return (
    <>
      {r.antes}
      <mark>{r.coincide}</mark>
      {r.despues}
    </>
  );
}

function Contenido({
  comandos,
  onCerrar,
  buscarRegistros,
  buscarFichas,
  dibujarHueco,
}: {
  comandos: readonly Comando[];
  onCerrar: () => void;
  buscarRegistros?: BuscarRegistros;
  buscarFichas?: BuscarFichas;
  dibujarHueco?: DibujarHueco;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [cursor, setCursor] = useState(0);
  const [registros, setRegistros] = useState<EstadoRegistros>({ fase: "quieto", grupos: [] });
  const [fichas, setFichas] = useState<EstadoFichas>({ fase: "quieto", grupos: [] });
  const demora = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vuelta = useRef(0);
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const lista = useRef<HTMLUListElement>(null);
  const { grupos, plano } = useMemo(
    () => buscarComandos(comandos, texto, registros.grupos, fichas.grupos),
    [comandos, texto, registros.grupos, fichas.grupos],
  );

  // Al cerrar la paleta, la búsqueda pendiente no sale y la que está en vuelo se ignora.
  useEffect(
    () => () => {
      if (demora.current) clearTimeout(demora.current);
      vuelta.current++;
    },
    [],
  );

  const pedirRegistros = (valor: string) => {
    if (!buscarRegistros && !buscarFichas) return;
    if (demora.current) clearTimeout(demora.current);
    const esta = ++vuelta.current;
    const q = valor.trim();
    if (q.length < LARGO_MINIMO) {
      setRegistros({ fase: "quieto", grupos: [] });
      setFichas({ fase: "quieto", grupos: [] });
      return;
    }
    if (buscarRegistros) setRegistros((r) => ({ fase: "buscando", grupos: r.grupos }));
    if (buscarFichas) setFichas((r) => ({ fase: "buscando", grupos: r.grupos }));
    demora.current = setTimeout(() => {
      buscarRegistros?.(q)
        .then((res) => {
          if (esta !== vuelta.current) return;
          setRegistros(res.ok ? { fase: "quieto", grupos: res.grupos } : { fase: "error", grupos: [], mensaje: res.mensaje });
        })
        .catch(() => {
          if (esta !== vuelta.current) return;
          setRegistros({ fase: "error", grupos: [], mensaje: "No pudimos buscar clientes, productos ni pedidos. Revisá la conexión y probá de nuevo." });
        });
      buscarFichas?.(q)
        .then((res) => {
          if (esta !== vuelta.current) return;
          setFichas(res.ok ? { fase: "quieto", grupos: res.grupos } : { fase: "error", grupos: [], mensaje: res.mensaje });
        })
        .catch(() => {
          if (esta !== vuelta.current) return;
          setFichas({ fase: "error", grupos: [], mensaje: "No pudimos buscar clientas ni turnos. Revisá la conexión y probá de nuevo." });
        });
    }, DEMORA_MS);
  };
  const buscando = registros.fase === "buscando" || fichas.fase === "buscando";
  const errores = [registros, fichas].flatMap((r) => (r.fase === "error" ? [r.mensaje] : []));
  const activo = plano.length > 0 ? Math.min(cursor, plano.length - 1) : -1;
  const idOpcion = (c: Comando) => `${id}-${c.grupo}-${c.id}`;

  useEffect(() => {
    if (activo < 0) return;
    lista.current?.querySelector(`#${CSS.escape(idOpcion(plano[activo]))}`)?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sólo cuando cambia la opción activa
  }, [activo]);

  const irA = (href: string) => {
    onCerrar();
    router.push(href);
  };
  const ir = (c: Comando) => {
    const primera = c.teclas?.[0];
    if (primera?.externo) {
      // WhatsApp como primera tecla (quien no da turnos): se abre afuera, como el enlace.
      window.open(primera.href, "_blank", "noopener,noreferrer");
      onCerrar();
      return;
    }
    irA(c.href);
  };
  const activa = activo >= 0 ? plano[activo] : undefined;
  const fichaActiva = esFicha(activa) ? activa : null;
  const idDetalle = `${id}-detalle`;

  const alTeclear = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const n = plano.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((i) => (n === 0 ? 0 : (Math.min(i, n - 1) + 1) % n));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((i) => (n === 0 ? 0 : (Math.min(i, n - 1) - 1 + n) % n));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activo >= 0) ir(plano[activo]);
    }
  };

  // Dónde empieza cada grupo en `plano` (el índice de la opción para ↑/↓), calculado sin mutar nada.
  const inicioDe = grupos.map((_, gi) => grupos.slice(0, gi).reduce((n, g) => n + g.items.length, 0));
  return (
    <div data-parte="marco">
      <div data-parte="campo">
        <Icono nombre="buscar" />
        <input
          autoFocus
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={`${id}-lista`}
          aria-activedescendant={activo >= 0 ? idOpcion(plano[activo]) : undefined}
          aria-autocomplete="list"
          aria-label={buscarFichas ? "Buscar una clienta, un turno o qué querés hacer" : "¿Qué querés hacer?"}
          aria-describedby={fichaActiva ? idDetalle : undefined}
          placeholder={
            buscarFichas
              ? "Nombre o teléfono de la clienta, o qué querés hacer…"
              : buscarRegistros
                ? "Buscá una acción, una app, un cliente o un pedido…"
                : "¿Qué querés hacer? Vender, cerrar el día, una app…"
          }
          autoComplete="off"
          spellCheck={false}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setCursor(0);
            pedirRegistros(e.target.value);
          }}
          onKeyDown={alTeclear}
        />
        <span data-parte="cuenta" aria-live="polite">
          {texto.trim() ? `${plano.length} ${plano.length === 1 ? "resultado" : "resultados"}` : ""}
        </span>
        {/* En la PC la tecla dice cómo se cierra; en el celular (sin teclado) dice la palabra. */}
        <button type="button" onClick={onCerrar} data-parte="cerrar" className="inline-grid min-h-11 min-w-11 place-items-center" aria-label="Cerrar">
          <span className="hidden lg:inline">
            <Kbd>Esc</Kbd>
          </span>
          <span className="lg:hidden">Cerrar</span>
        </button>
      </div>
      <ul ref={lista} id={`${id}-lista`} role="listbox" aria-label="Resultados" data-parte="lista">
        {grupos.length === 0 && !buscando && errores.length === 0 && (
          <li role="presentation" data-parte="nada">
            {buscarFichas
              ? `No encontramos a nadie con «${texto.trim()}». Probá con el apellido o con los últimos números del teléfono.`
              : buscarRegistros
                ? `No encontramos nada con «${texto.trim()}». Probá con otra palabra, un teléfono o el número del pedido.`
                : `No hay acciones ni apps con «${texto.trim()}». Probá con otra palabra: «cobrar», «arqueo», «stock».`}
          </li>
        )}
        {grupos.map((g, gi) => (
          <li key={g.grupo} role="presentation">
            <p data-ui="rotulo" data-parte="grupo" id={`${id}-g-${g.grupo}`}>
              {g.nombre}
            </p>
            <ul role="group" aria-labelledby={`${id}-g-${g.grupo}`} className="m-0 list-none p-0">
              {g.items.map((c, ii) => {
                const indice = inicioDe[gi] + ii;
                return (
                  <li
                    key={c.id}
                    id={idOpcion(c)}
                    role="option"
                    aria-selected={indice === activo}
                    // Una ficha no se activa al pasar el mouse: el panel de abajo no tiene que cambiar
                    // mientras el mouse cruza la lista para llegar a sus teclas. Se elige tocándola.
                    onMouseMove={() => !esFicha(c) && indice !== activo && setCursor(indice)}
                    onClick={() => (esFicha(c) ? setCursor(indice) : ir(c))}
                  >
                    {c.icono ? <IconoApp nombre={c.icono} /> : <Icono nombre="flecha" />}
                    <span className="min-w-0">
                      <span data-parte="nombre">
                        <Nombre nombre={c.nombre} texto={texto} />
                      </span>
                      {c.segunda && <span data-parte="segunda">{c.segunda}</span>}
                    </span>
                    {indice === activo ? <Kbd>Enter</Kbd> : <span />}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
        {buscando && (
          <li role="presentation" data-parte="nada" aria-live="polite">
            {buscarFichas ? "Buscando clientas y turnos…" : "Buscando clientes, productos y pedidos…"}
          </li>
        )}
        {errores.map((m) => (
          <li key={m} role="alert" data-parte="nada">
            {m}
          </li>
        ))}
      </ul>
      {fichaActiva && <PanelDeFicha id={idDetalle} ficha={fichaActiva} dibujarHueco={dibujarHueco} onIr={irA} onCerrar={onCerrar} />}
      <p data-parte="ayuda" aria-hidden>
        <span>
          <Kbd>↑</Kbd> <Kbd>↓</Kbd> moverte · <Kbd>Enter</Kbd> {fichaActiva ? fichaActiva.teclas[0].etiqueta.toLowerCase() : "abrir"}
          {fichaActiva && (
            <>
              {" "}
              · <Kbd>Tab</Kbd> sus teclas
            </>
          )}{" "}
          · <Kbd>Esc</Kbd> cerrar
        </span>
        <span>Sólo lo que vos podés abrir</span>
      </p>
    </div>
  );
}

export function PaletaDeComandos({
  abierta,
  onCerrar,
  comandos,
  buscarRegistros,
  buscarFichas,
  dibujarHueco,
  etiqueta = "Buscar: ¿qué querés hacer?",
}: {
  abierta: boolean;
  onCerrar: () => void;
  comandos: readonly Comando[];
  /** Clientes, productos y pedidos del servidor (sólo el armazón de «Diseño nuevo»). */
  buscarRegistros?: BuscarRegistros;
  /** Clientas y turnos con sus teclas (el buscador global «/», quien ve la agenda). */
  buscarFichas?: BuscarFichas;
  /** Las teclas de plata de una ficha («Llegó la seña», «Cobrar lo que debe»). */
  dibujarHueco?: DibujarHueco;
  /** El nombre accesible del diálogo. */
  etiqueta?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierta && !d.open) d.showModal();
    if (!abierta && d.open) d.close();
  }, [abierta]);
  return (
    <dialog
      ref={ref}
      data-ui="paleta"
      aria-label={etiqueta}
      onClose={onCerrar}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      {/* Se monta sólo abierta: cada vez arranca vacía y con el foco en el campo. */}
      {abierta && (
        <Contenido comandos={comandos} onCerrar={onCerrar} buscarRegistros={buscarRegistros} buscarFichas={buscarFichas} dibujarHueco={dibujarHueco} />
      )}
    </dialog>
  );
}
