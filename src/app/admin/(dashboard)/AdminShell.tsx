"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import FormCerrarSesion from "../FormCerrarSesion";
import { type Role } from "@/lib/capabilities";
import { type Perfil } from "@/modules/perfil";
import { NAV_GROUPS, type NavGroupId } from "@/modules/nav-groups";
import { searchNavItems } from "@/modules/nav-search";
import type { AppDescriptor } from "@/apps/contract";
import type { ItemMenuDeHoy } from "@/apps/visibles";
import { IconoApp } from "@/components/iconos-apps";
import { ProfileBadge } from "@/components/ui";
import ThemeToggle from "./ThemeToggle";
import PaletaApps from "./inicio/PaletaApps";
import BarraInferior from "./inicio/BarraInferior";
import { useDiseno } from "@/lib/diseno/DisenoProvider";
import type { NavDelArmazon } from "./armazon/navegacion";

// DISEÑO NUEVO («Renglón», interruptor "Diseño nuevo" del negocio): el armazón nuevo vive en su
// propio archivo y se carga APARTE (`next/dynamic`): un negocio con el interruptor apagado (CH) nunca
// lo pide, ni en el HTML ni en el JS. Apagado, `AdminShell` rinde `ArmazonDeSiempre`, que es el
// armazón de antes tal cual: lo prueba armazon/armazon-ch.test.ts contra el HTML de HEAD.
const ArmazonNuevo = dynamic(() => import("./armazon/ArmazonNuevo"));

// Íconos de línea: el set vive en src/components/iconos-apps.tsx para que la barra, el
// Inicio y "App no disponible" dibujen el MISMO ícono por app. Los trazos son los que tenía
// este archivo, idénticos. `currentColor`: activo = acento del negocio, inactivo = apagado.
function Icon({ name }: { name: string }) {
  return <IconoApp nombre={name} />;
}

// Los ítems de la barra llegan YA decididos desde el layout (server): salen del registro de
// apps (`appsVisibles` + `proyectarMenuDeHoy`, src/apps/visibles.ts), la misma decisión que
// usa la guardia de cada página. Acá no queda lógica de visibilidad: sólo se pintan.

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Dueño/a",
  RECEPTION: "Recepción",
  PROFESSIONAL: "Profesional",
};

type NavItem = { href: string; label: string; icon: string; exact?: boolean };

function useActive() {
  const pathname = usePathname();
  return (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);
}

function currentLabel(pathname: string, items: NavItem[]) {
  const match = [...items]
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => (i.exact ? pathname === i.href : pathname.startsWith(i.href)));
  return match?.label ?? "Panel";
}

// Logo del tenant: monograma sobre el acento (contraste AA garantizado por el
// par accent/on-accent del preset) + nombre. Reemplazable por un asset SVG real.
function Brand({ monogram, name }: { monogram: string; name: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid place-items-center w-8 h-8 rounded-lg bg-accent text-on-accent text-[13px] font-bold shadow-xs">{monogram}</span>
      <span className="text-[15px] font-semibold tracking-tight text-strong">{name}</span>
    </div>
  );
}

export function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const isActive = useActive();
  return (
    <div className="space-y-0.5">
      {items.map((item) => {
        const active = isActive(item.href, item.exact);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-lg px-3 py-[7.5px] text-sm transition-colors ${
              active
                ? "bg-surface-sunken text-strong font-semibold"
                : "text-body font-medium hover:bg-surface-sunken"
            }`}
          >
            <span className={active ? "text-accent" : "text-faint"}><Icon name={item.icon} /></span>
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

// Nav AGRUPADA en 5 grupos de negocio (ADR-059 D3) — detrás del flag maestro
// `NAV_GROUPING_ENABLED` (default OFF; el layout server-side lo resuelve y lo
// pasa como prop `navGrouping`). Cada ítem ya trae su `grupo` desde el registro (el de
// `NAV_ITEM_GROUPS`, o el propio de los ítems Empresa: lo prueba la paridad de la barra),
// en el orden de `NAV_GROUPS`, y se pinta con el MISMO <NavLinks> por grupo (icono / estado
// activo / acento idénticos a la nav plana). `ungrouped` es la red de seguridad: un ítem
// sin grupo se sigue viendo, no desaparece en silencio. Con el flag OFF ni se monta.
function agruparMenu(items: readonly ItemMenuDeHoy[]) {
  const porGrupo = new Map<NavGroupId, ItemMenuDeHoy[]>();
  const ungrouped: ItemMenuDeHoy[] = [];
  for (const it of items) {
    if (!it.grupo) ungrouped.push(it);
    else porGrupo.set(it.grupo, [...(porGrupo.get(it.grupo) ?? []), it]);
  }
  const groups = NAV_GROUPS.filter((g) => porGrupo.has(g.id)).map((g) => ({
    id: g.id,
    label: g.label,
    items: porGrupo.get(g.id)!,
  }));
  return { groups, ungrouped };
}

export function NavGroups({ items, onNavigate }: { items: ItemMenuDeHoy[]; onNavigate?: () => void }) {
  const { groups, ungrouped } = agruparMenu(items);
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.id} className="space-y-0.5">
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[.09em] text-faint">
            {g.label}
          </p>
          <NavLinks items={g.items} onNavigate={onNavigate} />
        </div>
      ))}
      {ungrouped.length > 0 && <NavLinks items={ungrouped} onNavigate={onNavigate} />}
    </div>
  );
}

// ============================================================================
// BARRA DE BÚSQUEDA DE LA NAV (patrón SAP) + la nav debajo.
// ============================================================================
//
// El problema que resuelve: CH pasó de 3 a 14 módulos activos. Agrupar en 5
// grupos ordena la barra para el que explora; el que YA SABE a dónde va quiere
// escribir "fact" y apretar Enter. Los dos usos conviven acá: sin texto se ve la
// nav de siempre (agrupada o plana), con texto la nav se reemplaza por la lista
// de coincidencias — el mismo contrato del buscador de SAP.
//
// SEGURIDAD: busca sobre `items`, que YA vienen filtrados por rol × módulo ×
// perfil × rubro. El buscador no puede hacer aparecer una pantalla que el rol no
// ve, ni siquiera tipeando su nombre exacto (blindado en `nav-search.test.ts`).
//
// ACCESIBILIDAD (Gate, ángulo a11y): combobox + listbox con `aria-activedescendant`,
// recorrible con ↑ ↓ Enter Escape, label real (sr-only), y el conteo de
// resultados anunciado por `aria-live` para quien navega con lector de pantalla.
//
// EN EL PILOTO DEL INICIO POR APPS (`onBuscar` presente) el campo se reemplaza por un botón
// que abre la paleta de apps (Ctrl/⌘K, la misma búsqueda del Inicio, con la descripción de
// cada app y todas las que la persona ve, no sólo las de la barra). Así hay UN buscador, no
// dos que encuentran cosas distintas. Fuera del piloto (CH) esto queda exactamente igual.
export function NavBuscable({
  items,
  navGrouping,
  onNavigate,
  atajoGlobal = false,
  onBuscar,
}: {
  items: ItemMenuDeHoy[];
  navGrouping: boolean;
  onNavigate?: () => void;
  // ¿Esta instancia escucha Ctrl/⌘+K? Solo la del sidebar de escritorio: el cajón
  // móvil monta un segundo <NavBuscable> y dos listeners se pelearían el foco.
  atajoGlobal?: boolean;
  // Piloto: abre la paleta de apps en vez de buscar en la barra.
  onBuscar?: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const resultados = searchNavItems(items, query);
  const buscando = query.trim().length > 0;
  // El cursor puede quedar apuntando fuera de la lista al tipear una letra más
  // (menos resultados): se acota al render, sin efecto ni estado derivado.
  const seleccionado = resultados.length > 0 ? Math.min(cursor, resultados.length - 1) : -1;

  useEffect(() => {
    if (!atajoGlobal) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [atajoGlobal]);

  function limpiar() {
    setQuery("");
    setCursor(0);
  }

  function irA(href: string) {
    limpiar();
    onNavigate?.();
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) =>
        resultados.length === 0 ? 0 : (Math.min(c, resultados.length - 1) + 1) % resultados.length,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) =>
        resultados.length === 0
          ? 0
          : (Math.min(c, resultados.length - 1) - 1 + resultados.length) % resultados.length,
      );
    } else if (e.key === "Enter") {
      // Enter con la lista vacía no hace nada: mejor no moverse que caer en una
      // pantalla que el usuario no pidió.
      if (seleccionado >= 0) {
        e.preventDefault();
        irA(resultados[seleccionado].href);
      }
    } else if (e.key === "Escape") {
      // Escape limpia la búsqueda; si ya estaba vacía, deja que burbujee para que
      // el cajón móvil se cierre con la misma tecla.
      if (buscando) {
        e.preventDefault();
        e.stopPropagation();
        limpiar();
      }
    }
  }

  return (
    // `flex-1 min-h-0` es lo que hace que esto NO desborde a su contenedor: en una
    // columna flex, un hijo con mucho contenido no se encoge por debajo de su alto
    // natural (min-height:auto), y el menú se derramaba por abajo. En el cajón móvil
    // eso terminaba con el pie —usuario, "Ver sitio público", "Cerrar sesión"— pintado
    // ENCIMA de los últimos ítems del menú, y el último grupo cortado fuera de la
    // pantalla. Reportado con captura desde un teléfono real.
    <div className="flex flex-1 flex-col min-h-0">
      {onBuscar ? (
        <div className="shrink-0 px-1 pb-3">
          <BotonBuscarApps onClick={onBuscar} />
        </div>
      ) : (
      <div className="shrink-0 px-1 pb-3">
        <label htmlFor={`${listboxId}-input`} className="sr-only">
          Buscar en el menú
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint">
            <svg className="w-[15px] h-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </span>
          <input
            id={`${listboxId}-input`}
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={buscando}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={seleccionado >= 0 ? `${listboxId}-op-${seleccionado}` : undefined}
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Buscar…"
            className="w-full rounded-lg border border-line bg-surface-sunken pl-8 pr-7 py-[7px] text-sm text-strong placeholder:text-faint focus:border-accent focus:outline-none"
          />
          {buscando && (
            <button
              type="button"
              onClick={() => {
                limpiar();
                inputRef.current?.focus();
              }}
              aria-label="Limpiar búsqueda"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-1.5 text-lg leading-none text-faint hover:text-strong"
            >
              &times;
            </button>
          )}
        </div>
      </div>
      )}

      {/* Conteo para lectores de pantalla: sin esto, quien no ve la lista no sabe
          si lo que tipeó encontró algo. */}
      <p className="sr-only" role="status" aria-live="polite">
        {buscando
          ? `${resultados.length} ${resultados.length === 1 ? "resultado" : "resultados"}`
          : ""}
      </p>

      {/* La lista scrollea SOLA. El buscador de arriba y el pie de abajo quedan siempre
          a la vista; lo único que se mueve es el menú. */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
      {buscando ? (
        resultados.length > 0 ? (
          <ul id={listboxId} role="listbox" aria-label="Resultados de la búsqueda" className="space-y-0.5">
            {resultados.map((item, i) => (
              <li key={item.href} role="none">
                <Link
                  id={`${listboxId}-op-${i}`}
                  role="option"
                  aria-selected={i === seleccionado}
                  href={item.href}
                  onClick={() => {
                    limpiar();
                    onNavigate?.();
                  }}
                  onMouseEnter={() => setCursor(i)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-[7.5px] text-sm transition-colors ${
                    i === seleccionado
                      ? "bg-surface-sunken text-strong font-semibold"
                      : "text-body font-medium hover:bg-surface-sunken"
                  }`}
                >
                  <span className={i === seleccionado ? "text-accent" : "text-faint"}>
                    <Icon name={item.icon} />
                  </span>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-3 py-2 text-sm text-muted">
            Nada coincide con <span className="text-strong">&ldquo;{query.trim()}&rdquo;</span>.
          </p>
        )
      ) : navGrouping ? (
        <NavGroups items={items} onNavigate={onNavigate} />
      ) : (
        <NavLinks items={items} onNavigate={onNavigate} />
      )}
      </div>
    </div>
  );
}

export function NavFooter({
  userName,
  roleLabel,
  showPublicSite,
  onNavigate,
}: {
  userName: string;
  roleLabel: string;
  // ¿Mostrar el link "Ver sitio público →"? Solo el ERP vertical tiene vidriera en "/";
  // los productos de facturación (Comerciante…) NO tienen sitio público → el link
  // llevaría al login. El layout lo resuelve por producto y lo pasa acá.
  showPublicSite: boolean;
  onNavigate?: () => void;
}) {
  const initial = userName.trim().charAt(0).toUpperCase() || "U";
  return (
    <div className="shrink-0 mt-4 pt-4 border-t border-line space-y-1">
      <div className="flex items-center gap-2.5 px-2 py-1.5">
        <span className="grid place-items-center w-9 h-9 rounded-lg bg-accent-soft text-accent text-sm font-bold shrink-0">{initial}</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-strong truncate">{userName}</p>
          <p className="text-xs text-faint">{roleLabel}</p>
        </div>
      </div>
      {showPublicSite && (
        <Link
          href="/"
          onClick={onNavigate}
          className="block rounded-md px-2 py-1.5 text-xs text-muted hover:text-accent hover:bg-surface-sunken"
        >
          Ver sitio público →
        </Link>
      )}
      <FormCerrarSesion>
        <button type="submit" className="w-full text-left rounded-md px-2 py-1.5 text-xs text-muted hover:text-accent hover:bg-surface-sunken">
          Cerrar sesión
        </button>
      </FormCerrarSesion>
    </div>
  );
}

// Botón de la barra que abre la paleta de apps (piloto). Dice el atajo para que se aprenda:
// ⌘K en Mac, Ctrl K en el resto. La plataforma se lee sin romper la hidratación: el
// servidor (y el primer render del cliente) dicen "Ctrl K" y después se corrige.
const sinSuscripcion = () => () => {};
function esMacCliente(): boolean {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

function BotonBuscarApps({ onClick }: { onClick: () => void }) {
  const esMac = useSyncExternalStore(sinSuscripcion, esMacCliente, () => false);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label="Buscar una app"
      // `text-muted` y no `text-faint`: en el tema oscuro, faint sobre el fondo hundido daba
      // 4,44:1 (medido), debajo del 4,5:1 de AA para texto chico.
      className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-line bg-surface-sunken pl-2.5 pr-2 text-sm text-muted hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus lg:min-h-0 lg:py-[7px]"
    >
      <svg className="w-[15px] h-[15px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <span className="min-w-0 flex-1 truncate text-left">Buscar…</span>
      <kbd className="hidden shrink-0 whitespace-nowrap rounded border border-line px-1 font-sans text-[11px] text-muted lg:inline">
        {esMac ? "⌘K" : "Ctrl K"}
      </kbd>
    </button>
  );
}

export type PropsDelArmazon = Parameters<typeof ArmazonDeSiempre>[0] & {
  /**
   * La navegación del armazón nuevo, armada en el servidor (armazon/navegacion.ts). Llega SÓLO con
   * el diseño nuevo prendido: apagado no viaja (ni en el HTML ni en el payload de CH).
   */
  nav?: NavDelArmazon;
};

/** El armazón del panel: el nuevo con el diseño nuevo prendido; si no, el de siempre. */
export default function AdminShell({ nav, ...props }: PropsDelArmazon) {
  const nuevo = useDiseno();
  return nuevo && nav ? <ArmazonNuevo {...props} nav={nav} /> : <ArmazonDeSiempre {...props} />;
}

function ArmazonDeSiempre({
  children,
  role,
  userName,
  brandName,
  monogram,
  menu,
  apps = [],
  modoApps = false,
  esMostrador = false,
  navGrouping = false,
  activeProfile = null,
  showPublicSite = true,
}: {
  children: React.ReactNode;
  role: Role;
  userName: string;
  brandName: string;
  monogram: string;
  // La barra, YA decidida en el layout (server) desde el registro de apps: sólo lo que esta
  // persona puede abrir en este negocio, con el rótulo, ícono, grupo y orden de hoy.
  menu: ItemMenuDeHoy[];
  // Inicio por apps (interruptor "Trabaja por apps" del negocio): las apps que la persona ve,
  // para la paleta de Ctrl/⌘K. Con el interruptor apagado llega vacío y la barra busca en su menú, como siempre.
  apps?: readonly AppDescriptor[];
  modoApps?: boolean;
  // ¿Local de mostrador? Nombra el primer espacio de la barra de abajo: "Mostrador" o "Recepción".
  esMostrador?: boolean;
  // ¿El producto tiene vidriera pública en "/"? Vertical → sí (default). Productos de
  // facturación (Comerciante) → false: se oculta el link "Ver sitio público" del footer.
  showPublicSite?: boolean;
  // ¿Nav agrupada en 5 grupos (ADR-059 D3)? Default false = nav plana legada. El
  // layout lo resuelve con `navGroupingEnabled()` (flag `NAV_GROUPING_ENABLED`,
  // default OFF). Reversible de un golpe: OFF → shell idéntico al de hoy.
  navGrouping?: boolean;
  // Perfil activo del tenant (ADR-058/059), o `null` con el motor apagado (flag
  // `PROFILES_ENABLED` OFF, default). Acá sólo pinta la insignia de edición: qué ítems
  // entran por perfil ya lo decidió el layout. El cliente ve "Comercio"/"Empresa", nunca
  // lite/enterprise (ADR-059 D7).
  activeProfile?: Perfil | null;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const items = menu;
  const roleLabel = ROLE_LABEL[role];

  // PALETA DE APPS (Ctrl/⌘K en todo el panel) — sólo en el piloto. Se guarda dónde estaba
  // el foco al abrirla para devolverlo al cerrar con Escape o tocando afuera.
  const [paletaAbierta, setPaletaAbierta] = useState(false);
  const focoAntesDePaleta = useRef<HTMLElement | null>(null);
  const abrirPaleta = useCallback(() => {
    focoAntesDePaleta.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDrawerOpen(false);
    setPaletaAbierta(true);
  }, []);
  const cerrarPaleta = useCallback((devolverFoco: boolean) => {
    setPaletaAbierta(false);
    if (devolverFoco) focoAntesDePaleta.current?.focus();
  }, []);
  useEffect(() => {
    if (!modoApps) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        abrirPaleta();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modoApps, abrirPaleta]);

  // Cerrar el cajón al navegar (cambia el pathname) y con Escape.
  //
  // El cierre por navegación se ajusta DURANTE el render comparándolo con el pathname
  // anterior, no con un efecto: `setState` sincrónico dentro de un `useEffect` provoca
  // un segundo render en cascada (y lo marca `react-hooks/set-state-in-effect`). Este es
  // el patrón de React para "ajustar estado cuando cambia una prop".
  const [pathAnterior, setPathAnterior] = useState(pathname);
  if (pathAnterior !== pathname) {
    setPathAnterior(pathname);
    if (drawerOpen) setDrawerOpen(false);
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-screen flex bg-surface text-body">
      {/* SALTAR AL CONTENIDO: lo primero que alcanza Tab. Invisible hasta que tiene foco; con
          teclado evita recorrer toda la barra lateral en cada pantalla. */}
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-lg focus:bg-surface-raised focus:px-4 focus:text-sm focus:font-semibold focus:text-strong focus:shadow-overlay focus:outline-2 focus:outline-offset-2 focus:outline-focus"
      >
        Saltar al contenido
      </a>

      {/* Sidebar fijo — solo desktop (lg+). El fondo va en una columna que se estira con la
          página y la barra (sticky, alto de pantalla) va adentro: antes el fondo era el de la
          barra misma y en una página larga, abajo de su alto, se veía el gris de la página. */}
      <div className="hidden lg:block w-[236px] shrink-0 border-r border-line bg-surface-raised">
        <nav aria-label="Menú" className="flex flex-col px-3 py-5 h-screen sticky top-0">
          <div className="shrink-0 px-2 mb-6"><Brand monogram={monogram} name={brandName} /></div>
          {/* Fuera del piloto, el Ctrl/⌘K de siempre: enfoca el buscador de la barra. En el
              piloto lo atiende la paleta de apps (efecto de arriba). */}
          <NavBuscable
            items={items}
            navGrouping={navGrouping}
            atajoGlobal={!modoApps}
            onBuscar={modoApps ? abrirPaleta : undefined}
          />
          <NavFooter userName={userName} roleLabel={roleLabel} showPublicSite={showPublicSite} />
        </nav>
      </div>

      {/* Cajón móvil */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-strong/40"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <nav aria-label="Menú" className="relative w-64 max-w-[80%] bg-surface-raised h-full max-h-[100dvh] px-3 py-5 flex flex-col shadow-overlay">
            <div className="shrink-0 px-2 mb-6 flex items-center justify-between">
              <Brand monogram={monogram} name={brandName} />
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Cerrar menú"
                className="grid size-11 -mr-2 place-items-center rounded-lg text-2xl leading-none text-muted hover:bg-surface-sunken"
              >
                ×
              </button>
            </div>
            <NavBuscable
              items={items}
              navGrouping={navGrouping}
              onNavigate={() => setDrawerOpen(false)}
              onBuscar={modoApps ? abrirPaleta : undefined}
            />
            <NavFooter
              userName={userName}
              roleLabel={roleLabel}
              showPublicSite={showPublicSite}
              onNavigate={() => setDrawerOpen(false)}
            />
          </nav>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar móvil con hamburguesa */}
        <header className="lg:hidden sticky top-0 z-30 bg-surface-raised/90 backdrop-blur border-b border-line px-4 h-14 flex items-center gap-3">
          {/* 44 × 44 para el dedo (antes 36): el dibujo es el mismo, crece el área que se toca. */}
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menú"
            className="flex flex-col justify-center gap-1.5 w-11 h-11 -ml-2 items-center rounded-md hover:bg-surface-sunken"
          >
            <span className="block h-0.5 w-5 bg-strong" />
            <span className="block h-0.5 w-5 bg-strong" />
            <span className="block h-0.5 w-5 bg-strong" />
          </button>
          <span className="font-medium text-strong">{currentLabel(pathname, items)}</span>
          <span className="ml-auto flex items-center gap-2 min-w-0">
            <span className="font-semibold text-muted truncate">{brandName}</span>
            {/* Edición del tenant (Comercio/Empresa) en canal NEUTRO — solo si el motor
                de perfiles está encendido (activeProfile != null). ADR-059 D5/D7. */}
            {activeProfile && <ProfileBadge profile={activeProfile} />}
            {/* Toggle claro/oscuro del backoffice (skin Fable) — discreto, al borde. */}
            <ThemeToggle />
          </span>
        </header>

        {/* Header desktop — sticky con blur (fix 29), como ya hacía el móvil. */}
        <header className="hidden lg:flex sticky top-0 z-30 bg-surface-raised/90 backdrop-blur border-b border-line px-8 h-[58px] items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="font-semibold text-strong whitespace-nowrap">{brandName}</span>
            {/* Edición (Comercio/Empresa), canal neutro (ADR-059 D5). Default OFF: sin
                perfil activo no se renderiza → header idéntico al legado. */}
            {activeProfile && <ProfileBadge profile={activeProfile} />}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted whitespace-nowrap">Panel de administración</span>
            {/* Toggle claro/oscuro del backoffice (skin Fable) — discreto, en la topbar. */}
            <ThemeToggle />
          </div>
        </header>

        {/* Destino de "Saltar al contenido". `tabIndex={-1}`: recibe el foco del salto sin
            sumarse al orden de Tab. No es <main>: cada página ya trae el suyo (PageContainer).
            Abajo deja libre lo que ocupa la barra de espacios del celular (la variable la pone
            el layout), para que al final del scroll el último botón no quede tapado. Esto NO
            cubre lo que va pegado abajo mientras se scrollea (un `sticky`): eso se apoya con
            `bottom-[var(--alto-barra-inferior,0px)]` (ver layout.tsx). */}
        <div id="contenido" tabIndex={-1} className="flex-1 pb-[var(--alto-barra-inferior,0px)] focus:outline-none">
          {children}
        </div>
      </div>

      {modoApps && <BarraInferior apps={apps} esMostrador={esMostrador} onBuscar={abrirPaleta} />}
      {modoApps && <PaletaApps apps={apps} abierta={paletaAbierta} onCerrar={cerrarPaleta} />}
    </div>
  );
}
