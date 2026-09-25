"use client";

// ============================================================================
// EL ARMAZÓN DE LA CONSOLA GSG — la misma anatomía que el panel de un negocio («Renglón»).
// ============================================================================
//
// La consola es un producto de GSG y la usa sólo el dueño (y los operadores que él suma): lleva el
// acento carbónico de GSG y la MISMA cabecera que el panel (armazon/ArmazonNuevo.tsx), así quien
// pasa de la consola al panel de un negocio no aprende dos mapas.
//
// PC — dos renglones:
//   1. la marca (vuelve a Negocios), las secciones de la consola, el buscador de negocios (un GET a
//      /operador?q=, Ctrl/⌘K o «/» lo enfocan) y la persona (su nombre, el tema, salir);
//   2. las vistas de la sección como pestañas (en Negocios: Todos · En producción · En prueba · Con
//      pendientes · Estudios contables, todas en la URL) y, a la derecha, «Dar de alta un negocio».
// CELULAR — arriba la marca (abre la persona), el título y la lupa; abajo la cápsula con las
// secciones y «Alta» como tecla principal.
//
// No decide nada: la guardia es `requireOperator` del layout y la de cada página.

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { IconoApp } from "@/components/iconos-apps";
import { Icono } from "@/components/ui/Icono";
import { Kbd } from "@/components/ui/Kbd";
import type { NombreIcono } from "@/apps/contract";
import ThemeToggle from "@/app/admin/(dashboard)/ThemeToggle";

type Seccion = {
  id: "negocios" | "alta" | "tablero" | "direccion" | "diseno";
  href: string;
  etiqueta: string;
  icono: NombreIcono;
};

/** Las vistas de Negocios (filtros en la URL: `?estado=`). Las entiende la página. */
export const VISTAS_DE_NEGOCIOS = [
  { estado: null, etiqueta: "Todos" },
  { estado: "produccion", etiqueta: "En producción" },
  { estado: "prueba", etiqueta: "En prueba" },
  { estado: "pendientes", etiqueta: "Con pendientes" },
  { estado: "estudios", etiqueta: "Estudios contables" },
] as const;

function seccionActual(ruta: string): Seccion["id"] | null {
  if (ruta === "/operador" || ruta.startsWith("/operador/tenants")) return "negocios";
  if (ruta.startsWith("/operador/alta")) return "alta";
  if (ruta.startsWith("/operador/cockpit")) return "tablero";
  if (ruta.startsWith("/operador/direccion")) return "direccion";
  if (ruta.startsWith("/operador/diseno")) return "diseno";
  return null;
}

const sinSuscripcion = () => () => {};
const esMacCliente = () => /Mac|iPhone|iPad|iPod/.test(navigator.platform);

export default function CabeceraConsola({
  operador,
  esDuenio,
  conTablero,
  salir,
}: {
  operador: string;
  esDuenio: boolean;
  /** El tablero (cockpit) se ofrece sólo con su interruptor de deploy prendido. */
  conTablero: boolean;
  /** El formulario de salir (server action), armado en el layout. */
  salir: React.ReactNode;
}) {
  const ruta = usePathname();
  const params = useSearchParams();
  const base = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const idPersona = `${base}-persona`;
  const buscador = useRef<HTMLInputElement>(null);
  const esMac = useSyncExternalStore(sinSuscripcion, esMacCliente, () => false);

  const secciones: Seccion[] = [
    { id: "negocios", href: "/operador", etiqueta: "Negocios", icono: "modulos" },
    { id: "alta", href: "/operador/alta", etiqueta: "Dar de alta", icono: "usuarios" },
    ...(conTablero ? [{ id: "tablero", href: "/operador/cockpit", etiqueta: "Tablero", icono: "reportes" } as Seccion] : []),
    { id: "direccion", href: "/operador/direccion", etiqueta: "Dirección", icono: "dashboard" },
    { id: "diseno", href: "/operador/diseno", etiqueta: "Diseño", icono: "apariencia" },
  ];
  const actual = seccionActual(ruta);
  const enLista = ruta === "/operador";
  const estado = enLista ? params.get("estado") : null;
  const q = enLista ? (params.get("q") ?? "") : "";
  const titulo =
    ruta.startsWith("/operador/tenants") ? "Ficha del negocio" : (secciones.find((s) => s.id === actual)?.etiqueta ?? "Consola GSG");
  const quien = esDuenio ? "Dueño de GSG" : "Operador";
  // El dueño entra con el nombre de sistema «duenio»: en pantalla va su papel, no ese nombre.
  const nombre = esDuenio && operador === "duenio" ? "Dueño de GSG" : operador;

  // Ctrl/⌘K o «/» (fuera de un campo): al buscador de negocios.
  useEffect(() => {
    const alPresionar = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const enCampo = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      const atajo = ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") || (e.key === "/" && !enCampo && !e.ctrlKey && !e.metaKey);
      if (!atajo) return;
      const campo = buscador.current;
      if (!campo || campo.offsetParent === null) return; // en el celular está en la página
      e.preventDefault();
      campo.focus();
      campo.select();
    };
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, []);

  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:inline-flex focus:min-h-11 focus:items-center focus:rounded focus:bg-surface-raised focus:px-4 focus:text-sm focus:font-semibold focus:text-strong"
      >
        Saltar al contenido
      </a>

      {/* PC: la cabecera de dos renglones. */}
      <header data-ui="cabecera">
        <div data-parte="fila-1">
          <Link href="/operador" data-parte="negocio" aria-label="Consola GSG: Negocios">
            <span data-parte="monograma" aria-hidden>
              G
            </span>
            <span data-parte="nombre">Consola GSG</span>
          </Link>
          <nav data-parte="espacios" aria-label="Secciones de la consola">
            {secciones.map((s) => (
              <Link key={s.id} href={s.href} data-parte="espacio" aria-current={actual === s.id ? "true" : undefined}>
                {s.etiqueta}
              </Link>
            ))}
          </nav>
          <form role="search" action="/operador" method="get" data-parte="buscar" onClick={() => buscador.current?.focus()}>
            <Icono nombre="buscar" />
            <label htmlFor={`${base}-q`} className="sr-only">
              Buscar un negocio por nombre, slug o link
            </label>
            <input
              ref={buscador}
              id={`${base}-q`}
              name="q"
              type="search"
              defaultValue={q}
              key={q}
              placeholder="Buscar un negocio"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-strong outline-none placeholder:text-muted"
            />
            <Kbd>{esMac ? "⌘K" : "Ctrl K"}</Kbd>
          </form>
          <button type="button" data-parte="persona" popoverTarget={idPersona} aria-label={`${nombre}: tu cuenta`}>
            <span data-parte="iniciales" aria-hidden>
              {iniciales(nombre)}
            </span>
            <span data-parte="quien" aria-hidden>
              <b>{nombre}</b>
              {nombre !== quien && <small>{quien}</small>}
            </span>
          </button>
        </div>
        <div data-parte="fila-2">
          <nav data-ui="pestanas" aria-label={actual === "negocios" ? "Vistas de Negocios" : "Sección"}>
            {actual === "negocios" ? (
              VISTAS_DE_NEGOCIOS.map((v) => (
                <Link
                  key={v.etiqueta}
                  href={v.estado ? `/operador?estado=${v.estado}` : "/operador"}
                  aria-current={enLista && (estado ?? null) === v.estado ? "page" : undefined}
                >
                  {v.etiqueta}
                </Link>
              ))
            ) : (
              <Link href={secciones.find((s) => s.id === actual)?.href ?? "/operador"} aria-current="page">
                {secciones.find((s) => s.id === actual)?.etiqueta ?? "Consola GSG"}
              </Link>
            )}
          </nav>
          <div data-parte="accion">
            {actual !== "alta" && (
              <Link href="/operador/alta" data-ui="button" data-variant="solid" data-size="md" className="inline-flex items-center">
                <Icono nombre="mas" />
                Dar de alta un negocio
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Celular: la marca (abre la persona), el título y la lupa. */}
      <header data-ui="barra-movil">
        <button type="button" popoverTarget={idPersona} aria-label={`${nombre}: tu cuenta`}>
          <span data-parte="monograma" aria-hidden>
            G
          </span>
        </button>
        <p data-parte="titulo">{titulo}</p>
        <Link href="/operador#buscar-negocio" aria-label="Buscar un negocio">
          <Icono nombre="buscar" />
        </Link>
      </header>

      {/* La persona: quién es, el tema, salir. Sin navegación. */}
      <div id={idPersona} popover="auto" data-ui="desplegable" data-tipo="persona" role="dialog" aria-label={`${nombre}: tu cuenta`}>
        <div data-parte="dato">
          <b>{nombre}</b>
          {esDuenio ? "Dueño de GSG: puede tocar todo, también CH" : "Operador: CH queda en sólo lectura"}
        </div>
        <div data-parte="opcion">
          <span>Tema claro u oscuro</span>
          <ThemeToggle />
        </div>
        {salir}
      </div>
    </>
  );
}

/** La cápsula del celular: las secciones y «Alta» como tecla principal. */
export function CapsulaConsola({ conTablero }: { conTablero: boolean }) {
  const ruta = usePathname();
  const actual = seccionActual(ruta);
  const lugares: { id: Seccion["id"]; href: string; etiqueta: string; icono: NombreIcono }[] = [
    { id: "negocios", href: "/operador", etiqueta: "Negocios", icono: "modulos" },
    ...(conTablero ? [{ id: "tablero" as const, href: "/operador/cockpit", etiqueta: "Tablero", icono: "reportes" as NombreIcono }] : []),
    { id: "direccion", href: "/operador/direccion", etiqueta: "Dirección", icono: "dashboard" },
    { id: "diseno", href: "/operador/diseno", etiqueta: "Diseño", icono: "apariencia" },
  ];
  return (
    <nav data-ui="capsula" aria-label="Secciones de la consola" style={{ ["--espacios" as string]: String(lugares.length) }}>
      {lugares.map((l) => (
        <Link key={l.id} href={l.href} data-parte="espacio" aria-current={actual === l.id ? "page" : undefined}>
          <IconoApp nombre={l.icono} />
          <span>{l.etiqueta}</span>
        </Link>
      ))}
      <Link href="/operador/alta" data-parte="rubro" aria-current={actual === "alta" ? "page" : undefined}>
        <Icono nombre="mas" />
        Alta
      </Link>
    </nav>
  );
}

function iniciales(nombre: string): string {
  const p = nombre.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "G";
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0]).toUpperCase();
}
