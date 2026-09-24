// Cómo se arma el Inicio por apps a partir de las apps que la persona ve. PURO: lo prueban
// los tests con el registro real, sin base ni render.

import type { AppDescriptor, NombreIcono } from "@/apps/contract";
import { ESPACIOS, nombreDeEspacio, type EspacioId } from "@/apps/espacios";
import type { AlertaKpi, ResultadoKpi } from "@/apps/kpis/nucleo.server";

export interface SeccionInicio {
  id: EspacioId;
  /** "Mostrador" en un local, "Recepción" en una estética. */
  nombre: string;
  apps: AppDescriptor[];
}

/**
 * Una sección por espacio, en el orden de los espacios, con las apps que la persona ve. Un
 * espacio sin apps visibles no aparece (RECEPTION no ve "Finanzas" porque no ve ninguna app
 * de finanzas). Los espacios que no van en el Inicio (plataforma, el estudio contable) nunca.
 * `visibles` ya viene ordenada por `appsVisibles`; acá sólo se reparte.
 */
export function seccionesDelInicio(
  visibles: readonly AppDescriptor[],
  opts: { esMostrador: boolean },
): SeccionInicio[] {
  return ESPACIOS.filter((e) => e.enInicio)
    .map((e) => ({
      id: e.id,
      nombre: nombreDeEspacio(e.id, opts),
      apps: visibles.filter((a) => a.espacio === e.id),
    }))
    .filter((s) => s.apps.length > 0);
}

/**
 * Las apps en el orden en que aparecen en pantalla, sin repetir: primero Mis apps, después
 * cada espacio de arriba abajo y al final el resto de las visibles (las que no van en una
 * sección del Inicio igual pueden pedir atención). Es el orden en que se piden los números a
 * la base (la fila de números atiende por orden de llegada): lo que se ve primero, llega primero.
 */
export function enOrdenDePantalla(
  misApps: readonly AppDescriptor[],
  secciones: readonly SeccionInicio[],
  visibles: readonly AppDescriptor[] = [],
): AppDescriptor[] {
  const vistas = new Set<string>();
  const orden: AppDescriptor[] = [];
  for (const app of [...misApps, ...secciones.flatMap((s) => s.apps), ...visibles]) {
    if (vistas.has(app.id)) continue;
    vistas.add(app.id);
    orden.push(app);
  }
  return orden;
}

/**
 * Qué sube a "Para atender hoy": los números en alerta, en el orden del Inicio. Y cuáles no
 * se pudieron calcular: sin ellos no se puede decir "nada pendiente", porque puede haber algo
 * justo ahí.
 */
export function paraAtenderHoy(
  items: readonly { app: AppDescriptor; resultado: ResultadoKpi | null }[],
): { alertas: { app: AppDescriptor; alerta: AlertaKpi }[]; sinRevisar: AppDescriptor[] } {
  const alertas: { app: AppDescriptor; alerta: AlertaKpi }[] = [];
  const sinRevisar: AppDescriptor[] = [];
  for (const { app, resultado } of items) {
    if (resultado?.estado === "ok" && resultado.alerta) alertas.push({ app, alerta: resultado.alerta });
    else if (resultado?.estado === "error") sinRevisar.push(app);
  }
  return { alertas, sinRevisar };
}

/** "Pedidos para preparar", "Pedidos y Stock", "Pedidos, Stock y Caja del día". */
export function listaDeNombres(apps: readonly AppDescriptor[]): string {
  const n = apps.map((a) => a.nombre);
  if (n.length <= 1) return n.join("");
  return `${n.slice(0, -1).join(", ")} y ${n[n.length - 1]}`;
}

// ── La barra de abajo en el celular ──────────────────────────────────────────

/** Cuántos espacios entran en la barra de abajo: 4 y el buscador, 5 botones en 412 px. */
export const ESPACIOS_EN_LA_BARRA = 4;

export interface EspacioDeLaBarra {
  id: EspacioId;
  /** El nombre entero: título de la hoja que se abre y nombre accesible del botón. */
  nombre: string;
  /** El rótulo debajo del ícono, corto para que entren cinco en un celular. */
  rotulo: string;
  icono: NombreIcono;
  apps: AppDescriptor[];
}

/** Rótulos cortos donde el nombre entero no entra en un quinto de 412 px. */
const ROTULO_CORTO: Partial<Record<EspacioId, string>> = {
  precios: "Catálogo",
  stock: "Stock",
  locales: "Locales",
};

function iconoDeEspacio(id: EspacioId, esMostrador: boolean): NombreIcono {
  switch (id) {
    case "mostrador":
      return esMostrador ? "vender" : "agenda";
    case "caja":
      return "caja";
    case "clientes":
      return "clientes";
    case "precios":
      return "catalogo";
    case "stock":
      return "inventario";
    case "finanzas":
      return "facturacion";
    case "administracion":
      return "usuarios";
    default:
      return "dashboard";
  }
}

/**
 * Los espacios de la barra de abajo: los primeros 4 del Inicio de ESTA persona, en el mismo
 * orden (sale de `seccionesDelInicio`, así que un espacio sin apps visibles no ocupa lugar y
 * la recepción no ve Finanzas). Los que no entran siguen en el Inicio, el buscador y el menú.
 */
export function espaciosDeLaBarra(
  visibles: readonly AppDescriptor[],
  opts: { esMostrador: boolean },
): EspacioDeLaBarra[] {
  return seccionesDelInicio(visibles, opts)
    .slice(0, ESPACIOS_EN_LA_BARRA)
    .map((s) => ({
      id: s.id,
      nombre: s.nombre,
      rotulo: ROTULO_CORTO[s.id] ?? s.nombre,
      icono: iconoDeEspacio(s.id, opts.esMostrador),
      apps: s.apps,
    }));
}

/**
 * El espacio de la pantalla actual, para marcarlo en la barra: el de la app dueña de la ruta,
 * buscada entre las apps que la persona VE (las que llegan del servidor). El Inicio y las
 * pantallas sin app no marcan ninguno.
 *
 * Es la regla de `appDeRuta` (src/apps/rutas.ts: por segmento, la ruta más larga gana, las
 * `exacta` sólo por igualdad) repetida acá a propósito: `rutas.ts` importa el registro entero,
 * y la barra de abajo es un client component. Importarla mandaba al navegador los nombres y
 * rutas de TODAS las apps, también las que esta persona no ve. El test compara las dos con
 * el registro real, ruta por ruta.
 */
export function espacioDeRuta(pathname: string, apps: readonly AppDescriptor[]): EspacioId | null {
  const sinQuery = pathname.split(/[?#]/, 1)[0];
  const path = sinQuery.length > 1 && sinQuery.endsWith("/") ? sinQuery.slice(0, -1) : sinQuery;
  let duenia: AppDescriptor | undefined;
  for (const app of apps) {
    const cubre = app.exacta ? path === app.ruta : path === app.ruta || path.startsWith(app.ruta + "/");
    if (cubre && (!duenia || app.ruta.length > duenia.ruta.length)) duenia = app;
  }
  if (!duenia || duenia.espacio === "plataforma") return null;
  return duenia.espacio;
}
