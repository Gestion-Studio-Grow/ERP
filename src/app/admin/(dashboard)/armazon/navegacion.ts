// ============================================================================
// LA NAVEGACIÓN DEL ARMAZÓN NUEVO — la arma el SERVIDOR, una vez por pedido (layout.tsx).
// ============================================================================
//
// Con los datos que el layout YA calculó (las apps que la persona ve, su barra de siempre, el rol y
// el rubro) arma lo que el armazón nuevo pinta: los espacios con sus apps, los comandos del buscador
// y la tecla del rubro. No decide qué ve cada uno: reparte lo que `appsVisibles` ya decidió.
//
//   · Negocio con «Trabaja por apps»: los diez espacios de la navegación (ESPACIOS_NAV) con las apps
//     que la persona ve, con su nombre del registro (un nombre por pantalla).
//   · Negocio SIN «Trabaja por apps» (CH): las MISMAS pantallas de su barra de siempre, con los
//     MISMOS rótulos, agrupadas por espacio (ARQUITECTURA §5.10). El espacio de cada pantalla sale
//     de la app dueña de su ruta (`appDeRuta`). Nada que no esté en su barra.
//
// Importa el registro (rutas.ts): sólo servidor. El armazón (cliente) importa sólo sus TIPOS.

import type { AppDescriptor, NombreIcono } from "@/apps/contract";
import { appPermitida, type ItemMenuDeHoy, type NegocioApps } from "@/apps/visibles";
import { appPorId } from "@/apps/registro";
import { vouchersPrendidos, type InterruptorId } from "@/cambios/interruptores";
import {
  espacioNav,
  espacioNavDeApp,
  nombreDeEspacioNav,
  ordenDeEspacioNav,
  ordenDentroDelEspacioNav,
  type EspacioNavId,
} from "@/apps/espacios";
import { appDeRuta } from "@/apps/rutas";
import { accionesParaPersona } from "@/apps/acciones";
import type { Role, UsuarioConPermisos } from "@/lib/capabilities";
import type { Comando } from "@/components/ui/comandos-core";
import { accionDelRubro, puestoDe, type AccionDelRubro, type AppDeNav, type EspacioDeNav } from "./armazon-core";

export interface NavDelArmazon {
  espacios: EspacioDeNav[];
  comandos: Comando[];
  rubro: AccionDelRubro | null;
  /** ¿Su casa es el Inicio (el dueño)? La cajera y la recepción aterrizan en su puesto. */
  conInicio: boolean;
}

export function iconoDeEspacioNav(id: EspacioNavId, esMostrador: boolean): NombreIcono {
  const ICONOS: Record<EspacioNavId, NombreIcono> = {
    mostrador: esMostrador ? "vender" : "agenda",
    caja: "caja",
    locales: "localizacion",
    clientes: "clientes",
    precios: "catalogo",
    stock: "inventario",
    compras: "compras",
    facturacion: "facturacion",
    numeros: "reportes",
    administracion: "modulos",
  };
  return ICONOS[id];
}

/**
 * Una productora (panel de gestión de eventos) no tiene recepción: su primer espacio son sus proyectos y se llama
 * «Gestión», como en la barra de abajo (BarraInferior). QA MIA #6. Los demás rubros siguen como siempre.
 */
const NOMBRE_GESTION = "Gestión";
const APPS_DE_GESTION = new Set(["proyectos", "gestion-inicio"]);
function nombreDelEspacio(id: EspacioNavId, apps: readonly { app: AppDeNav }[], esMostrador: boolean): string {
  if (id === "mostrador" && apps.some((a) => APPS_DE_GESTION.has(a.app.id))) return NOMBRE_GESTION;
  return nombreDeEspacioNav(id, { esMostrador });
}

function agrupar(
  entradas: readonly { espacio: EspacioNavId; orden: number; app: AppDeNav }[],
  esMostrador: boolean,
): EspacioDeNav[] {
  const porEspacio = new Map<EspacioNavId, { orden: number; app: AppDeNav }[]>();
  for (const e of entradas) {
    const lista = porEspacio.get(e.espacio) ?? [];
    lista.push({ orden: e.orden, app: e.app });
    porEspacio.set(e.espacio, lista);
  }
  return [...porEspacio.entries()]
    .sort(([a], [b]) => ordenDeEspacioNav(a) - ordenDeEspacioNav(b))
    .map(([id, apps]) => ({
      id,
      nombre: nombreDelEspacio(id, apps, esMostrador),
      rotulo: nombreDelEspacio(id, apps, esMostrador) === NOMBRE_GESTION ? NOMBRE_GESTION : (espacioNav(id).rotulo ?? nombreDeEspacioNav(id, { esMostrador })),
      icono: iconoDeEspacioNav(id, esMostrador),
      // Orden del espacio; a igual orden (dos no nombradas), el de llegada (estable).
      apps: apps
        .map((a, i) => ({ ...a, i }))
        .sort((x, y) => x.orden - y.orden || x.i - y.i)
        .map((a) => a.app),
    }));
}

/** Los espacios de un negocio con «Trabaja por apps»: sus apps visibles, en los diez espacios. */
export function espaciosDeApps(visibles: readonly AppDescriptor[], esMostrador: boolean): EspacioDeNav[] {
  const entradas = visibles.flatMap((app) => {
    if (app.enLanzador === false) return [];
    const espacio = espacioNavDeApp(app);
    if (!espacio) return [];
    const nav: AppDeNav = { id: app.id, nombre: app.nombre, ruta: app.ruta, icono: app.icono, descripcion: app.descripcion };
    if (app.exacta) nav.exacta = true;
    return [{ espacio, orden: ordenDentroDelEspacioNav(espacio, app.id), app: nav }];
  });
  return agrupar(entradas, esMostrador);
}

/**
 * Los espacios de un negocio SIN «Trabaja por apps» (CH): las pantallas de su barra de siempre,
 * con sus rótulos, agrupadas por el espacio de la app dueña de cada ruta. El Inicio no es de ningún
 * espacio (es la casa). Una pantalla que no es de ninguna app registrada no se pierde: va a
 * Configuración (no pasa hoy: la paridad dorada, paridad-menu.test.ts, ata la barra al registro).
 */
export function espaciosDelMenu(menu: readonly ItemMenuDeHoy[], esMostrador: boolean): EspacioDeNav[] {
  const entradas = menu.flatMap((item, i) => {
    const app = appDeRuta(item.href);
    const espacio: EspacioNavId | null = app ? espacioNavDeApp(app) : "administracion";
    if (!espacio) return [];
    const nav: AppDeNav = { id: app?.id ?? item.href, nombre: item.label, ruta: item.href, icono: item.icon, descripcion: item.descripcion ?? app?.descripcion };
    if (item.exact) nav.exacta = true;
    return [{ espacio, orden: app ? ordenDentroDelEspacioNav(espacio, app.id) : Number.POSITIVE_INFINITY, app: nav, i }];
  });
  return agrupar(entradas, esMostrador);
}

/**
 * Las apps que el registro no ofrece en el lanzador (`enLanzador: false`) porque dependen de un
 * interruptor del negocio que el registro no sabe leer. Hoy: «Vouchers de La Alameda» (CH), sólo con
 * el interruptor «vouchers» prendido Y si la persona puede abrirla (la misma regla que `requireApp`).
 * Apagado o sin permiso: lista vacía y la navegación queda idéntica. PURA.
 */
export function appsDeInterruptores(
  interruptores: Readonly<Partial<Record<InterruptorId, { encendido: boolean }>>>,
  negocio: NegocioApps,
): AppDescriptor[] {
  if (!vouchersPrendidos(interruptores)) return [];
  const app = appPorId("vouchers");
  return appPermitida(app, negocio) ? [app] : [];
}

/** Suma `extras` a sus espacios (sin duplicar una ruta que ya está), con el mismo orden de siempre. */
export function sumarApps(espacios: readonly EspacioDeNav[], extras: readonly AppDescriptor[], esMostrador: boolean): EspacioDeNav[] {
  const rutas = new Set(espacios.flatMap((e) => e.apps.map((a) => a.ruta)));
  const nuevas = extras.filter((a) => !rutas.has(a.ruta));
  if (nuevas.length === 0) return [...espacios];
  const entradas = espacios.flatMap((e) =>
    e.apps.map((app, i) => ({ espacio: e.id, orden: i, app })),
  );
  for (const app of nuevas) {
    const espacio = espacioNavDeApp(app);
    if (!espacio) continue;
    const nav: AppDeNav = { id: app.id, nombre: app.nombre, ruta: app.ruta, icono: app.icono, descripcion: app.descripcion };
    // Al final de su espacio: no cambia el lugar de lo que la persona ya conoce.
    entradas.push({ espacio, orden: Number.MAX_SAFE_INTEGER, app: nav });
  }
  return agrupar(entradas, esMostrador);
}

/** Los comandos del buscador: las acciones que puede usar y las apps que ve, con su espacio. */
export function comandosDe(
  espacios: readonly EspacioDeNav[],
  visibles: readonly AppDescriptor[],
  quien: Role | UsuarioConPermisos,
  menu: readonly ItemMenuDeHoy[] | null,
): Comando[] {
  // CH (con barra de siempre): sólo acciones de sus pantallas.
  const rutas = menu ? new Set(menu.map((m) => m.href)) : undefined;
  const nombreEspacio = new Map(espacios.flatMap((e) => e.apps.map((a) => [a.ruta, e.nombre] as const)));
  const acciones: Comando[] = accionesParaPersona(visibles, quien, rutas).map((a) => ({
    id: `accion-${a.id}`,
    grupo: "acciones",
    nombre: a.verbo,
    segunda: a.nombreApp,
    href: a.href,
    icono: a.icono,
    alias: a.palabras,
  }));
  const porRuta = new Map<string, AppDescriptor>(visibles.map((a) => [a.ruta, a]));
  const apps: Comando[] = espacios.flatMap((e) =>
    e.apps.map((a) => {
      const reg = porRuta.get(a.ruta);
      const alias = [...(reg?.palabras ?? []), ...(reg && reg.nombre !== a.nombre ? [reg.nombre] : []), ...(reg?.menuDeHoy && reg.menuDeHoy.etiqueta !== a.nombre ? [reg.menuDeHoy.etiqueta] : [])];
      return { id: `app-${a.id}`, grupo: "apps" as const, nombre: a.nombre, segunda: nombreEspacio.get(a.ruta) ?? e.nombre, href: a.ruta, icono: a.icono, alias };
    }),
  );
  return [...acciones, ...apps];
}

/** Todo lo que el armazón nuevo necesita, armado una vez en el servidor. */
export function armarNavegacion({
  visibles,
  menu,
  modoApps,
  esMostrador,
  role,
  overrides,
  extras = [],
}: {
  visibles: readonly AppDescriptor[];
  /** Apps fuera del lanzador que igual van en la navegación (`appsDeInterruptores`). */
  extras?: readonly AppDescriptor[];
  menu: readonly ItemMenuDeHoy[];
  modoApps: boolean;
  esMostrador: boolean;
  role: Role;
  /** Las excepciones de la matriz de quien mira: los botones deciden con `permisoEfectivo`. */
  overrides?: UsuarioConPermisos["overrides"];
}): NavDelArmazon {
  const quien: UsuarioConPermisos = { role, overrides: overrides ?? [] };
  const base = modoApps ? espaciosDeApps(visibles, esMostrador) : espaciosDelMenu(menu, esMostrador);
  const espacios = extras.length > 0 ? sumarApps(base, extras, esMostrador) : base;
  // La tecla del rubro, sólo si su pantalla está en la navegación de esta persona (en CH, en su barra).
  const rutas = new Set(espacios.flatMap((e) => e.apps.map((a) => a.ruta)));
  const rubro = accionDelRubro(
    visibles.filter((a) => rutas.has(a.ruta)),
    esMostrador,
    quien,
  );
  return {
    espacios,
    comandos: comandosDe(espacios, visibles, quien, modoApps ? null : menu),
    rubro,
    conInicio: puestoDe(role, esMostrador, visibles.filter((a) => rutas.has(a.ruta))) === null,
  };
}
