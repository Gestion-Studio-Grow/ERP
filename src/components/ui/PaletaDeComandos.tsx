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

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconoApp } from "@/components/iconos-apps";
import { Icono } from "./Icono";
import { Kbd } from "./Kbd";
import { buscarComandos, resaltar, type Comando } from "./comandos-core";
import { LARGO_MINIMO, type GrupoDeRegistros } from "@/lib/buscador/registros-core";
import type { ResultadoDeBusqueda } from "@/lib/buscador/buscar-en-el-negocio";

export type BuscarRegistros = (q: string) => Promise<ResultadoDeBusqueda>;

/** Cuánto se espera después de la última tecla para ir al servidor. */
const DEMORA_MS = 250;

type EstadoRegistros =
  | { fase: "quieto"; grupos: GrupoDeRegistros[] }
  | { fase: "buscando"; grupos: GrupoDeRegistros[] }
  | { fase: "error"; grupos: GrupoDeRegistros[]; mensaje: string };

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
}: {
  comandos: readonly Comando[];
  onCerrar: () => void;
  buscarRegistros?: BuscarRegistros;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [cursor, setCursor] = useState(0);
  const [registros, setRegistros] = useState<EstadoRegistros>({ fase: "quieto", grupos: [] });
  const demora = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vuelta = useRef(0);
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const lista = useRef<HTMLUListElement>(null);
  const { grupos, plano } = useMemo(() => buscarComandos(comandos, texto, registros.grupos), [comandos, texto, registros.grupos]);

  // Al cerrar la paleta, la búsqueda pendiente no sale y la que está en vuelo se ignora.
  useEffect(
    () => () => {
      if (demora.current) clearTimeout(demora.current);
      vuelta.current++;
    },
    [],
  );

  const pedirRegistros = (valor: string) => {
    if (!buscarRegistros) return;
    if (demora.current) clearTimeout(demora.current);
    const esta = ++vuelta.current;
    const q = valor.trim();
    if (q.length < LARGO_MINIMO) {
      setRegistros({ fase: "quieto", grupos: [] });
      return;
    }
    setRegistros((r) => ({ fase: "buscando", grupos: r.grupos }));
    demora.current = setTimeout(() => {
      buscarRegistros(q)
        .then((res) => {
          if (esta !== vuelta.current) return;
          setRegistros(res.ok ? { fase: "quieto", grupos: res.grupos } : { fase: "error", grupos: [], mensaje: res.mensaje });
        })
        .catch(() => {
          if (esta !== vuelta.current) return;
          setRegistros({ fase: "error", grupos: [], mensaje: "No pudimos buscar clientes, productos ni pedidos. Revisá la conexión y probá de nuevo." });
        });
    }, DEMORA_MS);
  };
  const activo = plano.length > 0 ? Math.min(cursor, plano.length - 1) : -1;
  const idOpcion = (c: Comando) => `${id}-${c.grupo}-${c.id}`;

  useEffect(() => {
    if (activo < 0) return;
    lista.current?.querySelector(`#${CSS.escape(idOpcion(plano[activo]))}`)?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sólo cuando cambia la opción activa
  }, [activo]);

  const ir = (c: Comando) => {
    onCerrar();
    router.push(c.href);
  };

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
          aria-label="¿Qué querés hacer?"
          placeholder={buscarRegistros ? "Buscá una acción, una app, un cliente o un pedido…" : "¿Qué querés hacer? Vender, cerrar el día, una app…"}
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
        {grupos.length === 0 && registros.fase === "quieto" && (
          <li role="presentation" data-parte="nada">
            {buscarRegistros
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
                    onMouseMove={() => indice !== activo && setCursor(indice)}
                    onClick={() => ir(c)}
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
        {registros.fase === "buscando" && (
          <li role="presentation" data-parte="nada" aria-live="polite">
            Buscando clientes, productos y pedidos…
          </li>
        )}
        {registros.fase === "error" && (
          <li role="presentation" data-parte="nada" aria-live="polite">
            {registros.mensaje}
          </li>
        )}
      </ul>
      <p data-parte="ayuda" aria-hidden>
        <span>
          <Kbd>↑</Kbd> <Kbd>↓</Kbd> moverte · <Kbd>Enter</Kbd> abrir · <Kbd>Esc</Kbd> cerrar
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
}: {
  abierta: boolean;
  onCerrar: () => void;
  comandos: readonly Comando[];
  /** Clientes, productos y pedidos del servidor (sólo el armazón de «Diseño nuevo»). */
  buscarRegistros?: BuscarRegistros;
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
      aria-label="Buscar: ¿qué querés hacer?"
      onClose={onCerrar}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      {/* Se monta sólo abierta: cada vez arranca vacía y con el foco en el campo. */}
      {abierta && <Contenido comandos={comandos} onCerrar={onCerrar} buscarRegistros={buscarRegistros} />}
    </dialog>
  );
}
