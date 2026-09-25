"use client";

// ============================================================================
// EL ARMAZÓN NUEVO DEL PANEL («Renglón») — sólo con el interruptor "Diseño nuevo" prendido.
// ============================================================================
//
// Lo monta AdminShell con `useDiseno()` y llega en su propio pedazo de JS (next/dynamic): CH, con el
// interruptor apagado, no lo descarga. Recibe la navegación YA armada en el servidor
// (armazon/navegacion.ts, con las apps que la persona ve) y no decide nada de visibilidad.
//
// PC — sin barra lateral, el contenido a ancho completo. Una cabecera de dos renglones:
//   1. el negocio (lleva al Inicio), los ESPACIOS que la persona ve (el de la pantalla, marcado), el
//      buscador «¿Qué querés hacer?» (Ctrl/⌘K) y la persona (sus iniciales: su rol, el tema, el sitio,
//      cerrar sesión — sin navegación);
//   2. las APPS del espacio actual como pestañas (1 clic a cualquier app del espacio, 2 a cualquier
//      otra) y, a la derecha, la tecla del rubro (Vender F1 / Dar un turno F1), siempre en el mismo
//      lugar.
//   «Dónde estoy» queda escrito en los dos renglones: no hacen falta migas.
//
// CELULAR — la carnicera con guantes, la recepcionista con el teléfono en una mano:
//   · arriba (48 px): la persona (el monograma del negocio), el TÍTULO = el nombre de la app (nunca
//     «Panel»), la lupa;
//   · abajo, al alcance del pulgar: la cápsula opaca con el Inicio y los primeros espacios, y la
//     tecla del rubro. Un espacio abre su hoja con sus apps y «Ver el tablero»; un espacio de una
//     sola app es un acceso directo.
//
// La señal aparece SÓLO cuando falta (una franja arriba del contenido). Los desplegables (hoja de
// un espacio, la persona) son `popover` nativos: se cierran solos tocando afuera o con Escape. La
// paleta es un <dialog> modal. Todo lo visual está en /diseno/renglon.css (la hoja de la piel).

import { useCallback, useEffect, useId, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { IconoApp } from "@/components/iconos-apps";
import { Icono } from "@/components/ui/Icono";
import { Kbd } from "@/components/ui/Kbd";
import { ProfileBadge } from "@/components/ui";
import { PaletaDeComandos } from "@/components/ui/PaletaDeComandos";
import { buscarEnElNegocio } from "@/lib/buscador/buscar-en-el-negocio";
import ThemeToggle from "../ThemeToggle";
import FormCerrarSesion from "../../FormCerrarSesion";
import { ROLE_LABEL, type PropsDelArmazon } from "../AdminShell";
import { dondeEstoy, espacioPedido, hrefDelEspacio, iniciales, tituloDePantalla, type EspacioDeNav } from "./armazon-core";
import type { NavDelArmazon } from "./navegacion";

/** Cuántos lugares tiene la cápsula antes de la tecla del rubro (5 botones entran en 360 px). */
const LUGARES_EN_LA_CAPSULA = 4;

// ── Señal: sólo cuando falta ─────────────────────────────────────────────────
function suscribirSenal(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

function SinSenal() {
  const enLinea = useSyncExternalStore(suscribirSenal, () => navigator.onLine, () => true);
  if (enLinea) return null;
  // No dice «a salvo»: el panel no guarda nada en el aparato (sólo Vender, que tiene su cola).
  return (
    <div data-ui="franja" data-tono="atencion" role="status">
      Sin señal. Lo que ves puede no estar al día hasta que vuelva.
    </div>
  );
}

const sinSuscripcion = () => () => {};
const esMacCliente = () => /Mac|iPhone|iPad|iPod/.test(navigator.platform);

/** Cierra el desplegable nativo que contiene al elemento (al elegir una app: la ruta cambia). */
function cerrarDesplegable(e: React.MouseEvent<HTMLElement>) {
  const p = e.currentTarget.closest<HTMLElement>("[popover]");
  try {
    if (p?.matches(":popover-open")) p.hidePopover();
  } catch {
    // navegador sin :popover-open: el desplegable se cierra solo al cambiar de pantalla
  }
}

// ── La hoja de un espacio (celular) ──────────────────────────────────────────
function HojaDeEspacio({ id, espacio, actual }: { id: string; espacio: EspacioDeNav; actual: string | null }) {
  const tituloId = `${id}-t`;
  return (
    <div id={id} popover="auto" data-ui="desplegable" data-tipo="espacio" role="dialog" aria-labelledby={tituloId}>
      <div data-parte="cabeza">
        <h2 id={tituloId}>{espacio.nombre}</h2>
        <button type="button" data-ui="icon-button" popoverTarget={id} popoverTargetAction="hide" aria-label={`Cerrar ${espacio.nombre}`}>
          <Icono nombre="cerrar" />
        </button>
      </div>
      <ul data-parte="apps">
        {espacio.apps.map((app) => (
          <li key={app.ruta}>
            <Link href={app.ruta} data-parte="app" aria-current={actual === app.ruta ? "page" : undefined} onClick={cerrarDesplegable}>
              <IconoApp nombre={app.icono} />
              <span className="min-w-0">
                <b>{app.nombre}</b>
                {app.descripcion && <small>{app.descripcion}</small>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div data-parte="pie">
        <Link
          href={`/admin?espacio=${espacio.id}`}
          data-ui="button"
          data-variant="outline"
          data-size="md"
          className="inline-flex items-center"
          onClick={cerrarDesplegable}
        >
          Ver el tablero de {espacio.nombre}
        </Link>
      </div>
    </div>
  );
}

// ── La persona: su rol, el tema, el sitio, cerrar sesión. Sin navegación. ────
function MenuDePersona({
  id,
  userName,
  roleLabel,
  showPublicSite,
}: {
  id: string;
  userName: string;
  roleLabel: string;
  showPublicSite: boolean;
}) {
  return (
    <div id={id} popover="auto" data-ui="desplegable" data-tipo="persona" role="dialog" aria-label={`${userName}: tu cuenta`}>
      <div data-parte="dato">
        <b>{userName}</b>
        Tu rol: {roleLabel}
      </div>
      <div data-parte="opcion">
        <span>Tema claro u oscuro</span>
        <ThemeToggle />
      </div>
      {showPublicSite && (
        <a href="/" target="_blank" rel="noopener" data-parte="opcion" onClick={cerrarDesplegable}>
          Ver el sitio público <Icono nombre="flecha" />
        </a>
      )}
      <FormCerrarSesion>
        <button type="submit" data-parte="opcion">
          Cerrar sesión
        </button>
      </FormCerrarSesion>
    </div>
  );
}

export default function ArmazonNuevo({
  children,
  role,
  userName,
  brandName,
  monogram,
  activeProfile = null,
  showPublicSite = true,
  nav,
}: PropsDelArmazon & { nav: NavDelArmazon }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const base = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const esMac = useSyncExternalStore(sinSuscripcion, esMacCliente, () => false);
  const atajoBuscar = esMac ? "⌘K" : "Ctrl K";

  const [paleta, setPaleta] = useState(false);
  const abrirPaleta = useCallback(() => {
    // Si había un desplegable abierto, se cierra: la paleta va encima de todo.
    try {
      document.querySelectorAll<HTMLElement>("[data-ui='desplegable']:popover-open").forEach((p) => p.hidePopover());
    } catch {
      // sin :popover-open
    }
    setPaleta(true);
  }, []);
  const cerrarPaleta = useCallback(() => setPaleta(false), []);

  const { espacios, rubro, conInicio } = nav;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        abrirPaleta();
      } else if (e.key === "F1" && rubro && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // F1 = la tecla del rubro (Vender / Dar un turno), desde cualquier pantalla.
        e.preventDefault();
        router.push(rubro.ruta);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abrirPaleta, rubro, router]);

  const espacioParam = params.get("espacio");
  const pedido = espacioPedido(pathname, espacioParam, espacios);
  const aqui = dondeEstoy(pathname, espacios);
  const espacioActual = pedido ?? aqui?.espacio ?? null;
  const appActual = aqui?.app.ruta ?? null;
  const enInicio = pathname === "/admin" && !pedido;
  const titulo = tituloDePantalla(pathname, espacioParam, espacios, brandName);
  const idEspacio = (id: string) => `${base}-esp-${id}`;
  const idPersona = `${base}-persona`;
  const roleLabel = ROLE_LABEL[role];
  const casa = conInicio ? "/admin" : (rubro?.ruta ?? "/admin");

  // La cápsula: el Inicio (si es su casa) y los primeros espacios, hasta 4 lugares.
  const enCapsula = espacios.slice(0, LUGARES_EN_LA_CAPSULA - (conInicio ? 1 : 0));
  const lugares = enCapsula.length + (conInicio ? 1 : 0);

  // Las pestañas del renglón 2: las apps del espacio actual; en el Inicio, el Inicio.
  const pestanas = espacioActual ? espacioActual.apps : [];

  return (
    <div data-ui="armazon">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:inline-flex focus:min-h-11 focus:items-center focus:rounded focus:bg-surface-raised focus:px-4 focus:text-sm focus:font-semibold focus:text-strong focus:outline-2 focus:outline-offset-2 focus:outline-focus"
      >
        Saltar al contenido
      </a>

      {/* PC: la cabecera de dos renglones. */}
      <header data-ui="cabecera">
        <div data-parte="fila-1">
          <Link href={casa} data-parte="negocio" aria-label={`${brandName}: ${conInicio ? "Inicio" : "tu puesto"}`}>
            <span data-parte="monograma" aria-hidden>
              {monogram}
            </span>
            <span data-parte="nombre">{brandName}</span>
          </Link>
          {activeProfile && <ProfileBadge profile={activeProfile} />}
          <nav data-parte="espacios" aria-label="Espacios">
            {espacios.map((e) => (
              <Link
                key={e.id}
                href={hrefDelEspacio(e)}
                data-parte="espacio"
                aria-current={espacioActual?.id === e.id ? "true" : undefined}
                title={e.nombre !== e.rotulo ? e.nombre : undefined}
              >
                {e.rotulo}
              </Link>
            ))}
          </nav>
          <button type="button" data-parte="buscar" onClick={abrirPaleta} aria-haspopup="dialog" aria-label="Buscar: ¿qué querés hacer?">
            <Icono nombre="buscar" />
            <span>¿Qué querés hacer?</span>
            <Kbd>{atajoBuscar}</Kbd>
          </button>
          <button type="button" data-parte="persona" popoverTarget={idPersona} aria-label={`${userName}, ${roleLabel}: tu cuenta`}>
            <span data-parte="iniciales" aria-hidden>
              {iniciales(userName)}
            </span>
            <span data-parte="quien" aria-hidden>
              <b>{userName}</b>
              <small>{roleLabel}</small>
            </span>
          </button>
        </div>
        <div data-parte="fila-2">
          <nav data-ui="pestanas" aria-label={espacioActual ? `Apps de ${espacioActual.nombre}` : "Inicio"}>
            {enInicio && conInicio && (
              <Link href="/admin" aria-current="page">
                Inicio
              </Link>
            )}
            {pestanas.map((a) => (
              <Link key={a.ruta} href={a.ruta} aria-current={appActual === a.ruta ? "page" : undefined}>
                {a.nombre}
              </Link>
            ))}
          </nav>
          <div data-parte="accion">
            {rubro && (
              <Link href={rubro.ruta} data-ui="button" data-variant="solid" data-size="md" className="inline-flex items-center" aria-keyshortcuts="F1">
                <IconoApp nombre={rubro.icono} />
                {rubro.palabra}
                <Kbd enBoton>{rubro.atajo}</Kbd>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Celular: arriba, la persona, el título de la app y la lupa. */}
      <header data-ui="barra-movil">
        <button type="button" popoverTarget={idPersona} aria-label={`${userName}, ${roleLabel}: tu cuenta`}>
          <span data-parte="monograma" aria-hidden>
            {monogram}
          </span>
        </button>
        <p data-parte="titulo">{titulo}</p>
        <button type="button" onClick={abrirPaleta} aria-haspopup="dialog" aria-label="Buscar: ¿qué querés hacer?">
          <Icono nombre="buscar" />
        </button>
      </header>

      <div id="contenido" tabIndex={-1} data-parte="contenido">
        <SinSenal />
        {children}
      </div>

      {/* Celular: la cápsula con el Inicio, los primeros espacios y la tecla del rubro. */}
      <nav data-ui="capsula" aria-label="Espacios" style={{ ["--espacios" as string]: String(lugares) }}>
        {conInicio && (
          <Link href="/admin" data-parte="espacio" aria-current={enInicio ? "page" : undefined}>
            <Icono nombre="casa" />
            <span>Inicio</span>
          </Link>
        )}
        {enCapsula.map((e) =>
          e.apps.length === 1 ? (
            <Link
              key={e.id}
              href={e.apps[0].ruta}
              data-parte="espacio"
              aria-current={espacioActual?.id === e.id ? "true" : undefined}
              aria-label={e.nombre}
            >
              <IconoApp nombre={e.icono} />
              <span aria-hidden>{e.rotulo}</span>
            </Link>
          ) : (
            <button
              key={e.id}
              type="button"
              data-parte="espacio"
              popoverTarget={idEspacio(e.id)}
              aria-current={espacioActual?.id === e.id ? "true" : undefined}
              aria-label={e.nombre}
            >
              <IconoApp nombre={e.icono} />
              <span aria-hidden>{e.rotulo}</span>
            </button>
          ),
        )}
        {rubro ? (
          <Link href={rubro.ruta} data-parte="rubro" aria-current={pathname === rubro.ruta ? "page" : undefined}>
            <IconoApp nombre={rubro.icono} />
            {rubro.palabra}
          </Link>
        ) : (
          <button type="button" data-parte="espacio" onClick={abrirPaleta} aria-haspopup="dialog">
            <Icono nombre="buscar" />
            <span>Buscar</span>
          </button>
        )}
      </nav>

      {/* Una hoja por espacio con más de una app: la abre la cápsula. */}
      {espacios
        .filter((e) => e.apps.length > 1)
        .map((e) => (
          <HojaDeEspacio key={e.id} id={idEspacio(e.id)} espacio={e} actual={appActual} />
        ))}

      <MenuDePersona id={idPersona} userName={userName} roleLabel={roleLabel} showPublicSite={showPublicSite} />

      <PaletaDeComandos abierta={paleta} onCerrar={cerrarPaleta} comandos={nav.comandos} buscarRegistros={buscarEnElNegocio} />
    </div>
  );
}
