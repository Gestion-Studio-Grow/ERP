// ============================================================================
// COMBOS — varias zonas en UN turno (camino B) y el combo del catálogo (camino A). PURO.
// ============================================================================
//
// Reingeniería CH, Tanda 3 · 3-B (ch-DISENO.md §2.3, CH-033, CH-034, CH-054). La clienta llama:
// «quiero bozo, axilas, piernas y cavado». Son CUATRO servicios del catálogo, pero es UN turno: un
// bloque en la agenda (10:00 a 11:10), una seña, un cobro, un renglón «4 zonas · 70′».
//
//   · Camino B (con la migración M3, `AppointmentItem`): el turno guarda sus ítems en orden, cada
//     uno con su duración y su precio congelado. La duración del turno es la SUMA de las zonas, sin
//     márgenes entre una y otra (es la misma profesional, en el mismo box, sin levantarse); el
//     margen de limpieza (`BUFFER_MIN`) va sólo después del bloque, como en cualquier turno.
//   · Camino A (siempre, sin migración): la dueña carga el combo frecuente como un servicio más del
//     catálogo (Catálogo → Combos). Es un ALTA: los servicios que lo componen no se tocan.
//
// Todo lo que se decide sin base vive acá con su test (combos.test.ts): duración, precio, cómo se
// reparte el precio del turno entre las zonas (para el reporte por servicio), la seña, el nombre.
// Sin imports de servidor: lo usa también la pantalla del alta.

import { centavosDe } from "@/lib/dinero/redondeo";
import { precioCongeladoDeReserva, type ServicioConPrecio } from "@/lib/turnos/precio-reserva";
import { seniaDelServicio } from "@/lib/turnos/cobros";

/** Más zonas que esto en un turno es, casi seguro, un error de la pantalla (o un pedido armado a mano). */
export const MAX_ZONAS = 8;

export type ServicioDelCombo = ServicioConPrecio & {
  id: string;
  name: string;
  durationMin: number;
  depositAmount: number | null;
};

/** Un ítem tal como se escribe en `AppointmentItem` (sin ids ni negocio). */
export type ItemDelCombo = { serviceId: string; order: number; durationMin: number; priceAtBooking: number };

/**
 * Los servicios pedidos, en el orden en que llegaron: sin vacíos, sin repetidos (una zona no se hace
 * dos veces en el mismo turno), como mucho `MAX_ZONAS`. Lo que no es texto se descarta.
 */
export function leerServiciosDelCombo(raw: readonly unknown[]): { ok: true; ids: string[] } | { ok: false; error: string } {
  const ids: string[] = [];
  for (const r of raw) {
    if (typeof r !== "string") continue;
    const id = r.trim();
    if (id && !ids.includes(id)) ids.push(id);
  }
  if (ids.length > MAX_ZONAS) return { ok: false, error: `Hasta ${MAX_ZONAS} servicios en un mismo turno.` };
  return { ok: true, ids };
}

/** Los minutos del bloque: la suma de las zonas, SIN margen entre una y otra. */
export function duracionDelCombo(servicios: readonly { durationMin: number }[]): number {
  return servicios.reduce((s, x) => s + (Number.isFinite(x.durationMin) && x.durationMin > 0 ? x.durationMin : 0), 0);
}

/** El precio de lista del combo para esta clienta: la suma de cada zona con su regla (ADR-013). */
export function precioDeListaDelCombo(servicios: readonly ServicioConPrecio[], isResident: boolean | null | undefined): number {
  const c = servicios.reduce((s, x) => s + centavosDe(precioCongeladoDeReserva(x, isResident).priceAtBooking), 0);
  return c / 100;
}

/** ¿Alguna zona salió con el precio de la zona (vecina)? — `Appointment.isResidentBooking`. */
export function esReservaDeVecina(servicios: readonly ServicioConPrecio[], isResident: boolean | null | undefined): boolean {
  return servicios.some((x) => precioCongeladoDeReserva(x, isResident).isResidentBooking);
}

/**
 * Reparte `total` en partes proporcionales a `pesos`, al centavo, y la suma da EXACTO `total`
 * (método del resto mayor: cada parte se trunca y los centavos que sobran van a las de mayor resto;
 * en empate, a la primera). Pesos todos en cero → partes iguales. Para el cupón de un combo y para
 * el reporte por servicio.
 */
export function repartirAlCentavo(total: number, pesos: readonly number[]): number[] {
  const n = pesos.length;
  if (n === 0) return [];
  if (total < 0) return repartirAlCentavo(-total, pesos).map((x) => (x === 0 ? 0 : -x));
  const totalC = centavosDe(total);
  const w = pesos.map((p) => (Number.isFinite(p) && p > 0 ? centavosDe(p) : 0));
  const sumaW = w.reduce((s, x) => s + x, 0);
  const base = sumaW > 0 ? w : w.map(() => 1);
  const denom = sumaW > 0 ? sumaW : n;
  const partes = base.map((x) => Math.floor((totalC * x) / denom));
  const restos = base.map((x, i) => ({ i, r: (totalC * x) % denom }));
  let sobra = totalC - partes.reduce((s, x) => s + x, 0);
  restos.sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; sobra > 0 && k < restos.length; k++, sobra--) partes[restos[k].i] += 1;
  return partes.map((c) => c / 100);
}

/**
 * Los ítems del turno, en orden: cada zona con su duración y su parte del PRECIO DEL TURNO (el que
 * quedó congelado, con el cupón ya restado). La suma de los `priceAtBooking` es exactamente
 * `precioDelTurno` (la regla de `AppointmentItem` en schema.prisma): el reporte por servicio suma
 * igual que el turno.
 */
export function itemsDelTurno(servicios: readonly ServicioDelCombo[], isResident: boolean | null | undefined, precioDelTurno: number): ItemDelCombo[] {
  const lista = servicios.map((s) => precioCongeladoDeReserva(s, isResident).priceAtBooking);
  const partes = repartirAlCentavo(Math.max(0, precioDelTurno), lista);
  return servicios.map((s, i) => ({ serviceId: s.id, order: i, durationMin: s.durationMin, priceAtBooking: partes[i] }));
}

/**
 * UNA seña por turno (CH-033): la mayor de las zonas (D4: la seña es un monto fijo del catálogo,
 * no se suma zona por zona — *provisional a confirmar con el dueño*), nunca más que el precio.
 */
export function seniaDelCombo(servicios: readonly { depositAmount: number | null }[], precio: number): number {
  const mayor = servicios.reduce<number | null>((m, s) => (s.depositAmount != null && s.depositAmount > 0 && (m == null || s.depositAmount > m) ? s.depositAmount : m), null);
  return seniaDelServicio({ depositAmount: mayor, precio });
}

/** «4 zonas» (lo que dice el renglón, al lado de «· 70′»). Con una sola, su nombre. */
export function etiquetaDelCombo(nombres: readonly string[]): string {
  if (nombres.length === 1) return nombres[0];
  return `${nombres.length} zonas`;
}

/** «Bozo, axilas, piernas completas y cavado» (para el WhatsApp y el detalle del turno). */
export function nombresDelCombo(nombres: readonly string[]): string {
  const limpios = nombres.map((n, i) => (i === 0 ? n.trim() : minusculaInicial(n.trim()))).filter(Boolean);
  if (limpios.length <= 1) return limpios[0] ?? "";
  return `${limpios.slice(0, -1).join(", ")} y ${limpios[limpios.length - 1]}`;
}

function minusculaInicial(s: string): string {
  // «Piernas completas» → «piernas completas», pero una sigla («IPL») queda como está.
  if (s.length > 1 && s[1] === s[1].toUpperCase() && s[1] !== s[1].toLowerCase()) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** Las profesionales que hacen TODAS las zonas elegidas (ADR-055: cada zona se asigna aparte). */
export function quienesHacenTodo(servicios: readonly { profesionales: readonly string[] }[]): string[] {
  if (servicios.length === 0) return [];
  const [primero, ...resto] = servicios;
  return primero.profesionales.filter((id) => resto.every((s) => s.profesionales.includes(id)));
}

/**
 * Lo que un cobro de un turno con zonas aporta a cada servicio, para «Por servicio» del reporte:
 * el monto se reparte en proporción al precio congelado de cada zona y suma EXACTO el cobro. Sin
 * ítems (un turno de un servicio), todo al servicio del turno.
 */
export function cobroPorServicio(
  monto: number,
  servicioDelTurno: string,
  items: readonly { servicio: string; priceAtBooking: number }[] | null | undefined,
): { servicio: string; monto: number }[] {
  if (!items || items.length < 2) return [{ servicio: servicioDelTurno, monto }];
  const partes = repartirAlCentavo(monto, items.map((i) => i.priceAtBooking));
  const porNombre = new Map<string, number>();
  // En centavos (dos zonas del mismo servicio se suman exacto) y de vuelta a pesos al final.
  items.forEach((it, k) => porNombre.set(it.servicio, (porNombre.get(it.servicio) ?? 0) + centavosDe(partes[k])));
  return [...porNombre].map(([servicio, c]) => ({ servicio, monto: c / 100 }));
}

/**
 * La duración PROPIA de un turno ya dado (fin − inicio). Al moverlo se conserva: un combo de 70′
 * no se achica a la duración de su servicio principal. Si no se puede leer, la del servicio.
 */
export function duracionPropiaDelTurno(t: { startsAt: Date; endsAt: Date }, delServicio: number): number {
  const min = Math.round((t.endsAt.getTime() - t.startsAt.getTime()) / 60_000);
  return Number.isFinite(min) && min > 0 ? min : delServicio;
}

/** Lo que dice el alta cuando la base todavía no guarda varias zonas en un turno (cae al camino A). */
export const MENSAJE_COMBOS_SIN_ACTIVAR =
  "Todavía no se pueden dar varias zonas en un mismo turno (falta activar esa actualización). Elegí una zona, o el combo armado en Catálogo → Combos.";

// ── Camino A: el combo del catálogo (Catálogo → Combos, ADR-055) ──────────────────────────────

/** La categoría donde viven los combos del catálogo (se crea con el primer combo; es un alta). */
export const CATEGORIA_COMBOS = "Combos";

/** «Combo: Bozo + Axilas + Cavado» — la descripción del servicio, para saber qué tiene adentro. */
export function descripcionDelCombo(nombres: readonly string[]): string {
  return `Combo: ${nombres.join(" + ")}`;
}

export type ComboPedido = {
  nombre: string;
  /** Los servicios que lo componen, en orden. */
  ids: readonly string[];
  precio: number;
  /** Vacío/NaN → la suma de las zonas. */
  duracion: number;
  /** Vacío/NaN/0 → sin seña. */
  senia: number;
  profesionales: readonly string[];
};

export type ComboValidado = { nombre: string; precio: number; durationMin: number; depositAmount: number | null; profesionales: string[]; descripcion: string };

/**
 * ¿Se puede dar de alta este combo? PURO. `componentes` son los servicios del negocio que se
 * encontraron (activos, no combos); `nombresTomados`, los nombres de los servicios vivos del negocio.
 * La profesional que lo hace tiene que hacer TODAS las zonas (si no, el combo se daría con quien no
 * hace una parte). Nunca cambia los servicios que lo componen: sólo los lee.
 */
export function validarComboDelCatalogo(
  p: ComboPedido,
  componentes: readonly { id: string; name: string; durationMin: number; profesionales: readonly string[] }[],
  nombresTomados: readonly string[],
): { ok: true; combo: ComboValidado } | { ok: false; error: string } {
  const nombre = p.nombre.trim().replace(/\s+/g, " ");
  if (!nombre) return { ok: false, error: "Ponele un nombre al combo (por ejemplo, «Piernas + axilas + cavado»)." };
  if (nombre.length > 80) return { ok: false, error: "El nombre es muy largo: hasta 80 letras." };
  const lectura = leerServiciosDelCombo(p.ids);
  if (!lectura.ok) return lectura;
  if (lectura.ids.length < 2) return { ok: false, error: "Un combo lleva al menos dos servicios." };
  const elegidos = lectura.ids.map((id) => componentes.find((c) => c.id === id));
  if (elegidos.some((c) => !c)) return { ok: false, error: "Uno de los servicios ya no está. Recargá y elegilos de nuevo." };
  const zonas = elegidos as { id: string; name: string; durationMin: number; profesionales: readonly string[] }[];
  const comparable = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  if (nombresTomados.some((n) => comparable(n) === comparable(nombre))) return { ok: false, error: `Ya hay un servicio que se llama «${nombre}». Usá otro nombre.` };
  if (!Number.isFinite(p.precio) || p.precio <= 0) return { ok: false, error: "Poné el precio del combo." };
  if (centavosDe(p.precio) / 100 !== p.precio) return { ok: false, error: "El precio va con centavos como mucho." };
  const suma = duracionDelCombo(zonas);
  const durationMin = Number.isFinite(p.duracion) && p.duracion > 0 ? Math.round(p.duracion) : suma;
  if (durationMin > 600) return { ok: false, error: "La duración es de más de 10 horas: revisala." };
  const senia = Number.isFinite(p.senia) && p.senia > 0 ? p.senia : null;
  if (senia !== null && senia >= p.precio) return { ok: false, error: "La seña tiene que ser menor al precio del combo." };
  const hacenTodo = quienesHacenTodo(zonas);
  const profesionales = [...new Set(p.profesionales)].filter((id) => typeof id === "string" && id);
  const ajenas = profesionales.filter((id) => !hacenTodo.includes(id));
  if (ajenas.length > 0) return { ok: false, error: "Elegiste a alguien que no hace todas las zonas del combo. Sacala o asignale antes esas zonas." };
  if (profesionales.length === 0) {
    return { ok: false, error: hacenTodo.length === 0 ? "Nadie hace todas esas zonas: asigná las zonas a una profesional antes de armar el combo." : "Elegí quién hace el combo." };
  }
  return { ok: true, combo: { nombre, precio: p.precio, durationMin, depositAmount: senia, profesionales, descripcion: descripcionDelCombo(zonas.map((z) => z.name)) } };
}
