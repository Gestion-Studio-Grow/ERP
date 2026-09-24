"use client";

// ============================================================================
// LA BARRA DE ABAJO EN EL CELULAR — los 4 espacios de la persona y el buscador.
// ============================================================================
//
// Sólo en los negocios que trabajan por apps y sólo en pantallas chicas (en la PC está la
// barra lateral). Con el pulgar: tocar "Caja" abre una hoja desde abajo con las apps de Caja
// (Caja del día, Cierre del día, Libro de caja) y tocar una lleva a la app. Son dos toques
// desde cualquier pantalla, sin pasar por el Inicio, que es la pantalla más cara de cargar.
// "Buscar" abre el mismo buscador de Ctrl/⌘K.
//
// Las apps de cada espacio llegan YA decididas por el servidor (`appsVisibles`): la barra no
// puede mostrar una app que la persona no ve. Y aunque la mostrara, cada página tiene su
// guardia (`requireApp`): esconder no es proteger, y mostrar tampoco abre.
//
// ACCESIBILIDAD: cada botón mide ≥ 56 px de alto y 1/5 del ancho; la hoja es un diálogo con
// título, se cierra con Escape, tocando afuera o con su botón, y devuelve el foco al botón que
// la abrió. El espacio de la pantalla actual se marca con color Y con `aria-current`.

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AppDescriptor } from "@/apps/contract";
import type { EspacioId } from "@/apps/espacios";
import { IconoApp } from "@/components/iconos-apps";
import { espacioDeRuta, espaciosDeLaBarra } from "./secciones";

export default function BarraInferior({
  apps,
  esMostrador,
  onBuscar,
}: {
  apps: readonly AppDescriptor[];
  esMostrador: boolean;
  onBuscar: () => void;
}) {
  const pathname = usePathname();
  const espacios = espaciosDeLaBarra(apps, { esMostrador });
  const actual = espacioDeRuta(pathname, apps);
  const [abierto, setAbierto] = useState<EspacioId | null>(null);
  const botones = useRef(new Map<EspacioId, HTMLButtonElement>());

  // Al navegar se cierra la hoja. Se ajusta durante el render (patrón de React para "cambió
  // una prop"), igual que el cajón del shell: sin un efecto que pinte dos veces.
  const [pathAnterior, setPathAnterior] = useState(pathname);
  if (pathAnterior !== pathname) {
    setPathAnterior(pathname);
    if (abierto) setAbierto(null);
  }

  const hoja = espacios.find((e) => e.id === abierto) ?? null;

  function cerrar(devolverFoco: boolean) {
    const id = abierto;
    setAbierto(null);
    if (devolverFoco && id) botones.current.get(id)?.focus();
  }

  return (
    <>
      <nav
        aria-label="Espacios"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface-raised pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="flex">
          {espacios.map((e) => {
            const activo = actual === e.id;
            return (
              <li key={e.id} className="min-w-0 flex-1">
                <button
                  ref={(el) => {
                    if (el) botones.current.set(e.id, el);
                    else botones.current.delete(e.id);
                  }}
                  type="button"
                  aria-haspopup="dialog"
                  aria-expanded={abierto === e.id}
                  aria-current={activo ? "true" : undefined}
                  aria-label={e.nombre}
                  onClick={() => setAbierto((a) => (a === e.id ? null : e.id))}
                  className={`flex h-14 w-full flex-col items-center justify-center gap-0.5 px-1 text-[11px] leading-tight focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus ${
                    activo ? "font-semibold text-accent" : "font-medium text-muted"
                  }`}
                >
                  <IconoApp nombre={e.icono} />
                  <span className="max-w-full truncate">{e.rotulo}</span>
                </button>
              </li>
            );
          })}
          <li className="min-w-0 flex-1">
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => {
                setAbierto(null);
                onBuscar();
              }}
              className="flex h-14 w-full flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium leading-tight text-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
            >
              <svg className="h-[17px] w-[17px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
              <span>Buscar</span>
            </button>
          </li>
        </ul>
      </nav>

      {hoja && <HojaDeEspacio key={hoja.id} nombre={hoja.nombre} apps={hoja.apps} onCerrar={cerrar} />}
    </>
  );
}

function HojaDeEspacio({
  nombre,
  apps,
  onCerrar,
}: {
  nombre: string;
  apps: readonly AppDescriptor[];
  onCerrar: (devolverFoco: boolean) => void;
}) {
  const tituloId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const primera = useRef<HTMLAnchorElement>(null);

  // Al abrir, el foco entra a la hoja (la primera app): quien usa teclado o lector de pantalla
  // tiene que saber que se abrió algo. Enfocar es sincronizar con el DOM, no estado de React.
  useEffect(() => {
    primera.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCerrar(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-strong/40" onClick={() => onCerrar(true)} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        onBlur={(e) => {
          // El foco se fue a otra parte de la página (Tab afuera): la hoja no queda tapando.
          const destino = e.relatedTarget as Node | null;
          if (destino && !panel.current?.contains(destino)) onCerrar(false);
        }}
        className="absolute inset-x-0 bottom-0 flex max-h-[75dvh] flex-col rounded-t-2xl border-t border-line bg-surface-raised pb-[env(safe-area-inset-bottom)] shadow-overlay"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line py-1 pl-4 pr-1">
          <h2 id={tituloId} className="text-base font-semibold text-strong">
            {nombre}
          </h2>
          <button
            type="button"
            onClick={() => onCerrar(true)}
            aria-label={`Cerrar ${nombre}`}
            className="grid size-11 place-items-center rounded-lg text-2xl leading-none text-muted hover:bg-surface-sunken hover:text-strong focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
          >
            ×
          </button>
        </div>
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain p-2">
          {apps.map((app, i) => (
            <li key={app.id}>
              <Link
                ref={i === 0 ? primera : undefined}
                href={app.ruta}
                // Si ya estaba en esa app no cambia la ruta: la hoja se cierra igual.
                onClick={() => onCerrar(false)}
                className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                  <IconoApp nombre={app.icono} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold leading-snug text-strong">{app.nombre}</span>
                  <span className="block text-[13px] leading-snug text-muted">{app.descripcion}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
