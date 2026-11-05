// VENDER · BUSCAR SERVICIO O PRODUCTO (interruptor `agenda-interaccion`).
//
// Un solo campo en Vender: si lo buscado es un PRODUCTO se suma a la venta como siempre; si es un
// SERVICIO, debajo se abren «Turnos libres»: los próximos huecos de cada profesional que lo hace, y
// tocar uno abre «Dar turno» con servicio, profesional, día y hora cargados.
//
// Lo que se decide sin pantalla vive acá, PURO y client-safe (sin Prisma ni servidor): qué es lo
// buscado, cómo se agrupan los huecos por profesional, el enlace de cada hueco y el texto que se
// anuncia (aria-live). Los huecos los da el motor de siempre (`getAvailableSlotsRange`, con
// `horariosDelDia` de alta-core): acá no se calcula ningún horario.

import { filtrarOpciones, normalizarBusqueda, type OpcionBuscador } from "@/components/ui/buscador-filtro";
import { dateStrInBusinessTz, wallHourMinuteInBusinessTz } from "@/lib/datetime";
import { horariosDelDia, type HuecosPorProfesional } from "../../turnos/_agenda/alta-core";
import { hrefTurnoEnHueco } from "../../turnos/pasos";

/** Las opciones de servicio llevan este prefijo en el buscador (un id de producto nunca lo tiene). */
export const PREFIJO_SERVICIO = "servicio:";
/** Desde cuántas letras el texto tipeado se clasifica solo (antes, sólo al elegir de la lista). */
export const MIN_LETRAS = 3;
/** Espera entre la última tecla y la consulta. */
export const ESPERA_MS = 350;
/** Hoy y los próximos días que se miran. */
export const DIAS_A_MIRAR = 4;
/** Cuántos huecos se muestran por profesional (el resto, en la agenda). */
export const HUECOS_POR_PROFESIONAL = 6;

export type ServicioDelBuscador = { id: string; nombre: string; durationMin: number; precio: number };

export type ProfesionalConHuecos = { id: string; nombre: string; huecos: Readonly<Record<string, readonly string[]>> };

/** Lo que devuelve la acción `turnosLibresDelServicio`. */
export type TurnosLibres =
  | {
      ok: true;
      servicio: { id: string; nombre: string };
      dias: string[];
      profesionales: ProfesionalConHuecos[];
      /** `agenda:manage`: sin esto se ven los huecos, pero sin tecla para dar el turno. */
      puedeDarTurno: boolean;
    }
  | { ok: false; error: string };

export function idDeOpcionDeServicio(servicioId: string): string {
  return `${PREFIJO_SERVICIO}${servicioId}`;
}

/** El id del servicio si la opción es un servicio; `null` si es un producto. */
export function servicioDeLaOpcion(opcionId: string): string | null {
  return opcionId.startsWith(PREFIJO_SERVICIO) ? opcionId.slice(PREFIJO_SERVICIO.length) || null : null;
}

function plata(n: number): string {
  return `$${Math.round(n).toLocaleString("es-AR")}`;
}

/**
 * Las opciones del campo único: primero los productos (tal cual llegan: su orden y su búsqueda no
 * cambian) y después los servicios, con «Servicio · 45 min · $22.000» de detalle.
 */
export function opcionesDelBuscadorUnico(productos: readonly OpcionBuscador[], servicios: readonly ServicioDelBuscador[]): OpcionBuscador[] {
  return [
    ...productos,
    ...servicios.map((s) => ({ id: idDeOpcionDeServicio(s.id), etiqueta: s.nombre, detalle: `Servicio · ${s.durationMin} min · ${plata(s.precio)}` })),
  ];
}

export type Clasificacion = { tipo: "servicio"; servicioId: string } | { tipo: "producto"; productoId: string } | { tipo: "nada" };

/**
 * ¿Lo tipeado es un servicio o un producto? Lo decide la PRIMERA opción que mostraría la lista (el
 * mismo filtro del buscador), así lo que se abre coincide con lo que se ve arriba de todo. Con menos
 * de `MIN_LETRAS` letras, nada (no se consulta por «p»).
 */
export function clasificarBusqueda(texto: string, opciones: OpcionBuscador[]): Clasificacion {
  if (normalizarBusqueda(texto).replace(/\s+/g, "").length < MIN_LETRAS) return { tipo: "nada" };
  const [primera] = filtrarOpciones(opciones, texto, 1);
  if (!primera) return { tipo: "nada" };
  const servicioId = servicioDeLaOpcion(primera.id);
  return servicioId ? { tipo: "servicio", servicioId } : { tipo: "producto", productoId: primera.id };
}

export type DiaConHuecos = { dia: string; horarios: string[] };
export type GrupoDeProfesional = { id: string; nombre: string; total: number; dias: DiaConHuecos[] };

/**
 * Los huecos agrupados por profesional (en el orden dado), con sus días en orden y hasta `max`
 * horarios en total por profesional. Usa `horariosDelDia` del alta (el mismo armado que «Dar
 * turno»). Un horario que ya pasó (`ahora`) no se ofrece. Las que no tienen lugar quedan, con 0.
 */
export function agruparHuecosPorProfesional(
  profesionales: readonly ProfesionalConHuecos[],
  dias: readonly string[],
  { ahora, max = HUECOS_POR_PROFESIONAL }: { ahora: number; max?: number },
): GrupoDeProfesional[] {
  return profesionales.map((p) => {
    const huecos: HuecosPorProfesional = { [p.id]: p.huecos };
    const out: DiaConHuecos[] = [];
    let total = 0;
    for (const dia of dias) {
      if (total >= max) break;
      const horarios = horariosDelDia(huecos, [p.id], dia)
        .map((h) => h.inicio)
        .filter((inicio) => new Date(inicio).getTime() > ahora)
        .slice(0, max - total);
      if (horarios.length === 0) continue;
      total += horarios.length;
      out.push({ dia, horarios });
    }
    return { id: p.id, nombre: p.nombre, total, dias: out };
  });
}

/** «HH:MM» en la hora del negocio. */
export function horaDePared(inicio: string): string {
  const { hour, minute } = wallHourMinuteInBusinessTz(new Date(inicio));
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** El enlace de un hueco: «Dar turno» con el servicio, la profesional, el día y la hora puestos. */
export function hrefDelHueco(servicioId: string, profesionalId: string, inicio: string): string {
  return hrefTurnoEnHueco(dateStrInBusinessTz(new Date(inicio)), profesionalId, horaDePared(inicio), servicioId);
}

/** «Hoy», «Mañana» o «jue 6» para un día «YYYY-MM-DD». */
export function etiquetaDelDia(dia: string, hoy: string): string {
  const dif = Math.round((Date.parse(`${dia}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 86_400_000);
  if (dif === 0) return "Hoy";
  if (dif === 1) return "Mañana";
  const f = new Date(`${dia}T12:00:00Z`);
  const semana = new Intl.DateTimeFormat("es-AR", { weekday: "short", timeZone: "UTC" }).format(f).replace(".", "");
  return `${semana} ${f.getUTCDate()}`;
}

/** Lo que se anuncia (aria-live): «Peeling: 3 turnos libres con Laura, 2 con Marina». */
export function textoDelAnuncio(servicio: string, grupos: readonly GrupoDeProfesional[]): string {
  const con = grupos.filter((g) => g.total > 0);
  if (con.length === 0) return `${servicio}: no hay turnos libres en los próximos días.`;
  const partes = con.map((g, i) => {
    const turnos = i === 0 ? (g.total === 1 ? "1 turno libre" : `${g.total} turnos libres`) : String(g.total);
    return `${turnos} con ${g.nombre}`;
  });
  return `${servicio}: ${partes.join(", ")}.`;
}
