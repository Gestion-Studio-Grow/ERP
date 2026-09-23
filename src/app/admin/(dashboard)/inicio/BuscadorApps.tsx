"use client";

// ============================================================================
// BUSCADOR DE APPS — escribir dos letras y Enter.
// ============================================================================
//
// El mismo buscador en dos lugares:
//   · arriba del Inicio ("desplegable"): la lista flota bajo el campo mientras se escribe;
//   · en la paleta de Ctrl/⌘K ("lista"), en todo el panel: sin texto muestra todas las apps.
// Muestra el nombre Y para qué sirve cada app: quien busca "stock" tiene que ver que
// "Stock" es cuánto hay y "Mermas" es lo que se rompió, sin abrir las dos.
//
// SEGURIDAD: busca sobre `apps`, que son las que la persona YA ve, calculadas en el servidor
// (`appsVisibles`). `buscarApps` (src/apps/visibles.ts) no puede hacer aparecer una app
// oculta ni tecleando su nombre exacto; lo prueban los tests del registro.
//
// ACCESIBILIDAD: combobox con listbox y `aria-activedescendant`, ↑ ↓ Enter Escape, label
// real, y el conteo de resultados anunciado por `aria-live`. Cada opción mide ≥ 44 px.

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AppDescriptor } from "@/apps/contract";
import { buscarApps } from "@/apps/visibles";
import { IconoApp } from "@/components/iconos-apps";

type Props = {
  /** Las apps que la persona ve, tal como las calculó el servidor. */
  apps: readonly AppDescriptor[];
  modo: "desplegable" | "lista";
  /** Después de elegir una app: la paleta o el cajón se cierran. */
  alElegir?: () => void;
  /** Escape con el campo vacío: la paleta se cierra. */
  alEscapar?: () => void;
  autoFocus?: boolean;
};

export default function BuscadorApps({ apps, modo, alElegir, alEscapar, autoFocus = false }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [enfocado, setEnfocado] = useState(autoFocus);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const listboxId = `${id}-apps`;

  const buscando = query.trim().length > 0;
  const resultados = buscando
    ? buscarApps(apps, query)
    : modo === "lista"
      ? apps.filter((a) => a.enLanzador !== false)
      : [];
  // El desplegable del Inicio sólo se abre escribiendo; la paleta siempre muestra su lista.
  const abierto = modo === "lista" || (buscando && enfocado);
  // Al tipear una letra más la lista se achica: el cursor se acota al render.
  const seleccionado = resultados.length > 0 ? Math.min(cursor, resultados.length - 1) : -1;

  function limpiar() {
    setQuery("");
    setCursor(0);
  }

  function irA(app: AppDescriptor) {
    limpiar();
    alElegir?.();
    router.push(app.ruta);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const n = resultados.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (n === 0 ? 0 : (Math.min(c, n - 1) + 1) % n));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (n === 0 ? 0 : (Math.min(c, n - 1) - 1 + n) % n));
    } else if (e.key === "Enter") {
      // Con la lista vacía, Enter no hace nada: mejor quedarse que caer donde no se pidió.
      if (seleccionado >= 0 && abierto) {
        e.preventDefault();
        irA(resultados[seleccionado]);
      }
    } else if (e.key === "Escape") {
      if (buscando) {
        e.preventDefault();
        e.stopPropagation();
        limpiar();
      } else if (alEscapar) {
        e.preventDefault();
        e.stopPropagation();
        alEscapar();
      }
    }
  }

  const lista = (
    <ul
      id={listboxId}
      role="listbox"
      aria-label="Apps"
      className={
        modo === "desplegable"
          ? "absolute left-0 right-0 top-full z-30 mt-1 max-h-[min(24rem,60vh)] space-y-0.5 overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface-raised p-1 shadow-overlay"
          : "mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain"
      }
    >
      {resultados.map((app, i) => (
        <li key={app.id} role="none">
          <Link
            id={`${id}-op-${i}`}
            role="option"
            aria-selected={i === seleccionado}
            href={app.ruta}
            // Sin esto, el mousedown le saca el foco al campo, el desplegable se cierra y el
            // click se pierde (Safari no enfoca links al hacer click).
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              limpiar();
              alElegir?.();
            }}
            onMouseEnter={() => setCursor(i)}
            className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
              i === seleccionado ? "bg-surface-sunken" : "hover:bg-surface-sunken"
            }`}
          >
            <span className={i === seleccionado ? "text-accent" : "text-faint"}>
              <IconoApp nombre={app.icono} />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-strong">{app.nombre}</span>
              <span className="block text-[13px] leading-snug text-muted">{app.descripcion}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div
      className={modo === "desplegable" ? "relative" : "flex min-h-0 flex-1 flex-col"}
      onFocus={() => setEnfocado(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEnfocado(false);
      }}
    >
      <label htmlFor={`${id}-campo`} className="sr-only">
        Buscar una app
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
        </span>
        <input
          id={`${id}-campo`}
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={abierto}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={abierto && seleccionado >= 0 ? `${id}-op-${seleccionado}` : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          enterKeyHint="go"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="¿Qué querés hacer?"
          className="h-11 w-full rounded-lg border border-line bg-surface-sunken pl-9 pr-11 text-[15px] text-strong placeholder:text-faint focus:border-accent focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {buscando && (
          <button
            type="button"
            onClick={() => {
              limpiar();
              inputRef.current?.focus();
            }}
            aria-label="Limpiar búsqueda"
            className="absolute right-0 top-0 grid h-11 w-11 place-items-center text-lg leading-none text-faint hover:text-strong"
          >
            &times;
          </button>
        )}
      </div>

      {/* Conteo para lectores de pantalla: sin esto, quien no ve la lista no sabe si lo que
          escribió encontró algo. */}
      <p className="sr-only" role="status" aria-live="polite">
        {buscando ? `${resultados.length} ${resultados.length === 1 ? "app" : "apps"}` : ""}
      </p>

      {abierto &&
        (resultados.length > 0 ? (
          lista
        ) : buscando ? (
          <p
            className={
              modo === "desplegable"
                ? "absolute left-0 right-0 top-full z-30 mt-1 rounded-xl border border-line bg-surface-raised px-4 py-3 text-sm text-muted shadow-overlay"
                : "mt-2 px-3 py-2 text-sm text-muted"
            }
          >
            Ninguna de tus apps coincide con <span className="text-strong">&ldquo;{query.trim()}&rdquo;</span>.
            Probá con otra palabra.
          </p>
        ) : null)}
    </div>
  );
}
