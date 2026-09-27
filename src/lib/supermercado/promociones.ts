// ============================================================================
// MOTOR DE PROMOCIONES — 2×1, 3×2, segunda al X %, % por sección o producto, % por medio de
// pago y día, y combos. PURO, en centavos enteros.
// ============================================================================
//
// QUÉ RESUELVE. En un supermercado la promo es el motivo de la compra: "martes 20 % en
// verdulería", "3×2 en yogures", "Fernet + Coca a $X". La caja la tiene que aplicar SOLA, igual
// para todos los cajeros, y el ticket tiene que decir cuál aplicó y cuánto ahorró el cliente.
//
// DÓNDE VA EL DESCUENTO. En el RENGLÓN del producto que lo generó, no en un descuento general
// de la venta: una promo en un producto al 21 % no puede bajar el IVA de la verdura al 10,5 %.
// La factura de un Responsable Inscripto sale renglón por renglón con su alícuota
// (fiscal/impuestos-por-alicuota.ts), así que el motor devuelve el descuento de cada renglón.
// Un combo reparte el suyo entre sus productos, en proporción a lo que vale cada uno.
//
// PRECEDENCIA Y ACUMULACIÓN (configurables en cada promo):
//   · Se aplican en orden de `prioridad` (menor primero; empate: por id, para que el resultado
//     no dependa del orden en que llegaron).
//   · Una promo NO ACUMULABLE sólo toca renglones que todavía no tienen ninguna promo, y los
//     CIERRA: después de ella, ese renglón no recibe otra.
//   · Una promo ACUMULABLE se suma a las acumulables anteriores, sobre lo que queda del renglón
//     (un 10 % después de un 2×1 es el 10 % de lo que se paga), pero no entra en un renglón
//     cerrado.
//   · Las de CANTIDAD (N×M, segunda unidad, combo) usan unidades: una misma unidad no entra en
//     dos promos de cantidad, sean o no acumulables. Sólo valen para productos por unidad.
//
// LA PLATA. Todo en centavos enteros. Los porcentajes con `porcentajeDe` y los repartos con el
// resto mayor: la única regla de redondeo es la de src/lib/dinero/redondeo.ts. El descuento de un
// renglón nunca pasa lo que vale el renglón.
//
// PURO: sin base, sin React, sin reloj. La fecha y el día de la semana los pasa quien llama,
// en la zona del negocio.

import { centavosDe, porcentajeDe } from "@/lib/dinero/redondeo";
import type { MedioDeCobro } from "@/lib/caja/medio-cobro";

// ── Definición ─────────────────────────────────────────────────────────────

export type TipoPromocion = "nxm" | "segunda-unidad" | "porcentaje" | "medio-de-pago" | "combo";

export const TIPOS_PROMOCION: readonly { id: TipoPromocion; nombre: string; ejemplo: string }[] = [
  { id: "nxm", nombre: "Llevás N, pagás M", ejemplo: "2×1 o 3×2 en gaseosas" },
  { id: "segunda-unidad", nombre: "Segunda unidad con descuento", ejemplo: "70 % off en la segunda unidad" },
  { id: "porcentaje", nombre: "Porcentaje de descuento", ejemplo: "20 % en verdulería los martes" },
  { id: "medio-de-pago", nombre: "Descuento por medio de pago", ejemplo: "10 % pagando con Mercado Pago" },
  { id: "combo", nombre: "Combo a precio fijo", ejemplo: "Fernet + Coca a $19.900" },
];

/** Prioridad que se propone por tipo: primero lo que agrupa unidades, al final el medio de pago. */
export const PRIORIDAD_SUGERIDA: Record<TipoPromocion, number> = {
  combo: 10,
  nxm: 20,
  "segunda-unidad": 30,
  porcentaje: 40,
  "medio-de-pago": 90,
};

export interface ComponenteCombo {
  productId: string;
  cantidad: number;
}

export interface Promocion {
  id: string;
  /** Lo que lee el cliente en el ticket y en la vidriera. */
  nombre: string;
  tipo: TipoPromocion;
  /** Productos y secciones donde vale. Vacíos los dos = toda la compra (sólo medio de pago). */
  productos: string[];
  secciones: string[];
  /** N×M: lleva `lleva`, paga `paga`. */
  lleva?: number;
  paga?: number;
  /** Porcentaje de descuento (segunda unidad, porcentaje, medio de pago), con hasta 2 decimales. */
  porcentaje?: number;
  /** Medio de pago: con cuáles vale. */
  medios?: MedioDeCobro[];
  /** Combo: qué lleva y a qué precio. */
  combo?: { componentes: ComponenteCombo[]; precio: number };
  /** Días de la semana en que vale (0 = domingo … 6 = sábado). Vacío = todos. */
  dias: number[];
  /** AAAA-MM-DD, inclusive. Ausente = sin límite. */
  desde?: string | null;
  hasta?: string | null;
  prioridad: number;
  acumulable: boolean;
  activa: boolean;
}

// ── Renglones y contexto ─────────────────────────────────────────────────────

export interface RenglonParaPromo {
  /** Identifica el renglón en la respuesta. */
  clave: string;
  productId: string;
  seccion: string;
  saleUnit: "UNIT" | "WEIGHT";
  /** Unidades (UNIT) o kilos (WEIGHT). */
  cantidad: number;
  /** Precio de la unidad (UNIT) o del kilo (WEIGHT). */
  precioUnitario: number;
  /** Lo que vale el renglón sin promo (el de la etiqueta de balanza, si la había). */
  importe: number;
}

export interface ContextoDePromo {
  /** AAAA-MM-DD en la zona del negocio. */
  fecha: string;
  /** 0 = domingo … 6 = sábado, en la zona del negocio. */
  diaSemana: number;
  /** Con qué se paga TODO. null = no se eligió o se paga con más de un medio. */
  medio: MedioDeCobro | null;
}

export interface DescuentoDeRenglon {
  clave: string;
  /** Descuento en pesos (al centavo). */
  descuento: number;
  /** Lo que se cobra por el renglón: importe − descuento. */
  neto: number;
  /** Nombres de las promos que tocaron el renglón. */
  promos: string[];
}

export interface PromoAplicada {
  promocionId: string;
  nombre: string;
  descuento: number;
  claves: string[];
}

export interface ResultadoPromos {
  renglones: DescuentoDeRenglon[];
  aplicadas: PromoAplicada[];
  totalDescuento: number;
}

// ── Vigencia ─────────────────────────────────────────────────────────────────

/** ¿La promo vale en esa fecha y ese día? No mira el medio de pago ni los productos. */
export function vigenteEn(p: Promocion, ctx: Pick<ContextoDePromo, "fecha" | "diaSemana">): boolean {
  if (!p.activa) return false;
  if (p.desde && ctx.fecha < p.desde) return false;
  if (p.hasta && ctx.fecha > p.hasta) return false;
  if (p.dias.length > 0 && !p.dias.includes(ctx.diaSemana)) return false;
  return true;
}

function enAlcance(p: Promocion, r: RenglonParaPromo): boolean {
  if (p.productos.length === 0 && p.secciones.length === 0) return true;
  return p.productos.includes(r.productId) || p.secciones.includes(r.seccion);
}

// ── El motor ─────────────────────────────────────────────────────────────────

interface Estado {
  r: RenglonParaPromo;
  bruto: number; // centavos
  descuento: number; // centavos
  unidadesLibres: number;
  cerrado: boolean;
  promos: string[];
}

/** Las promos en el orden en que se aplican. */
export function ordenarPromos(promos: readonly Promocion[]): Promocion[] {
  return [...promos].sort((a, b) => a.prioridad - b.prioridad || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** ¿Este renglón puede recibir esta promo, por la regla de acumulación? */
function admite(e: Estado, p: Promocion): boolean {
  if (e.cerrado) return false;
  if (!p.acumulable && e.descuento > 0) return false;
  return e.bruto - e.descuento > 0;
}

/**
 * Reparte `total` centavos en proporción a `pesos` (enteros ≥ 0), por el resto mayor: la suma
 * da exacto `total`. En BigInt: total × peso puede pasar el entero exacto de un número de JS.
 */
export function repartirCentavos(total: number, pesos: readonly number[]): number[] {
  const suma = pesos.reduce((a, b) => a + b, 0);
  if (total <= 0 || suma <= 0) return pesos.map(() => 0);
  const T = BigInt(total);
  const S = BigInt(suma);
  const restos: { i: number; resto: bigint }[] = [];
  const partes = pesos.map((w, i) => {
    const producto = T * BigInt(w);
    restos.push({ i, resto: producto % S });
    return Number(producto / S);
  });
  let sobra = total - partes.reduce((a, b) => a + b, 0);
  restos.sort((x, y) => (x.resto === y.resto ? x.i - y.i : x.resto > y.resto ? -1 : 1));
  for (const { i } of restos) {
    if (sobra <= 0) break;
    partes[i] += 1;
    sobra -= 1;
  }
  return partes;
}

/** Suma un descuento a un renglón sin pasar lo que queda por cobrar. Devuelve lo que entró. */
function descontar(e: Estado, centavos: number, p: Promocion): number {
  const entra = Math.max(0, Math.min(centavos, e.bruto - e.descuento));
  if (entra > 0) {
    e.descuento += entra;
    if (!e.promos.includes(p.nombre)) e.promos.push(p.nombre);
  }
  return entra;
}

/** Una unidad de un renglón, para las promos de cantidad. */
type Unidad = { e: Estado; precio: number };

function unidadesDisponibles(estados: Estado[], p: Promocion): Unidad[] {
  const out: Unidad[] = [];
  for (const e of estados) {
    if (e.r.saleUnit !== "UNIT" || !enAlcance(p, e.r) || !admite(e, p)) continue;
    const precio = centavosDe(e.r.precioUnitario);
    for (let k = 0; k < e.unidadesLibres; k++) out.push({ e, precio });
  }
  // La más cara primero; empate por renglón, para que el resultado sea siempre el mismo.
  return out.sort((a, b) => b.precio - a.precio || (a.e.r.clave < b.e.r.clave ? -1 : a.e.r.clave > b.e.r.clave ? 1 : 0));
}

function aplicarNxM(estados: Estado[], p: Promocion): { descuento: number; tocados: Set<Estado> } {
  const lleva = p.lleva ?? 0;
  const paga = p.paga ?? 0;
  const tocados = new Set<Estado>();
  let descuento = 0;
  const unidades = unidadesDisponibles(estados, p);
  const grupos = Math.floor(unidades.length / lleva);
  for (let g = 0; g < grupos; g++) {
    const grupo = unidades.slice(g * lleva, g * lleva + lleva);
    // En cada grupo se regalan las más baratas (las últimas, por el orden).
    grupo.forEach((u, k) => {
      u.e.unidadesLibres -= 1;
      tocados.add(u.e);
      if (k >= paga) descuento += descontar(u.e, u.precio, p);
    });
  }
  return { descuento, tocados };
}

function aplicarSegundaUnidad(estados: Estado[], p: Promocion): { descuento: number; tocados: Set<Estado> } {
  const tocados = new Set<Estado>();
  let descuento = 0;
  const unidades = unidadesDisponibles(estados, p);
  for (let g = 0; g + 1 < unidades.length; g += 2) {
    const [cara, barata] = [unidades[g], unidades[g + 1]];
    cara.e.unidadesLibres -= 1;
    barata.e.unidadesLibres -= 1;
    tocados.add(cara.e).add(barata.e);
    const off = centavosDe(porcentajeDe(barata.precio / 100, p.porcentaje ?? 0, "centavo"));
    descuento += descontar(barata.e, off, p);
  }
  return { descuento, tocados };
}

function aplicarPorcentaje(estados: Estado[], p: Promocion): { descuento: number; tocados: Set<Estado> } {
  const tocados = new Set<Estado>();
  let descuento = 0;
  for (const e of estados) {
    if (!enAlcance(p, e.r) || !admite(e, p)) continue;
    const base = e.bruto - e.descuento;
    const off = centavosDe(porcentajeDe(base / 100, p.porcentaje ?? 0, "centavo"));
    const entra = descontar(e, off, p);
    if (entra > 0) {
      descuento += entra;
      tocados.add(e);
    }
  }
  return { descuento, tocados };
}

function aplicarCombo(estados: Estado[], p: Promocion): { descuento: number; tocados: Set<Estado> } {
  const tocados = new Set<Estado>();
  const combo = p.combo;
  if (!combo || combo.componentes.length === 0) return { descuento: 0, tocados };
  const precioCombo = centavosDe(combo.precio);
  // Los renglones que sirven para cada componente (sólo por unidad y que admiten la promo).
  const porComponente = combo.componentes.map((c) =>
    estados.filter((e) => e.r.productId === c.productId && e.r.saleUnit === "UNIT" && admite(e, p)),
  );
  let descuento = 0;
  for (;;) {
    // ¿Alcanza para un combo más?
    const alcanza = combo.componentes.every((c, i) => porComponente[i].reduce((s, e) => s + e.unidadesLibres, 0) >= c.cantidad);
    if (!alcanza) break;
    // Se toman las unidades y se calcula lo que valen sueltas.
    const tomadas: { e: Estado; precio: number }[] = [];
    combo.componentes.forEach((c, i) => {
      let falta = c.cantidad;
      for (const e of porComponente[i]) {
        while (falta > 0 && e.unidadesLibres > 0) {
          e.unidadesLibres -= 1;
          falta -= 1;
          tomadas.push({ e, precio: centavosDe(e.r.precioUnitario) });
        }
      }
    });
    const suelto = tomadas.reduce((s, t) => s + t.precio, 0);
    const off = suelto - precioCombo;
    if (off <= 0) continue; // el combo no conviene: se consumen igual las unidades (no aplica otra vez)
    const partes = repartirCentavos(off, tomadas.map((t) => t.precio));
    tomadas.forEach((t, k) => {
      descuento += descontar(t.e, partes[k], p);
      tocados.add(t.e);
    });
  }
  return { descuento, tocados };
}

/**
 * Aplica las promos vigentes a los renglones de una venta. PURA y determinística: el mismo
 * pedido da el mismo resultado en la pantalla (vista previa del ticket) y en el servidor (el
 * alta de la venta, que la vuelve a correr con los precios y las promos de la base).
 */
export function aplicarPromociones(
  renglones: readonly RenglonParaPromo[],
  promos: readonly Promocion[],
  ctx: ContextoDePromo,
): ResultadoPromos {
  const estados: Estado[] = renglones.map((r) => ({
    r,
    bruto: centavosDe(r.importe),
    descuento: 0,
    unidadesLibres: r.saleUnit === "UNIT" && Number.isInteger(r.cantidad) && r.cantidad > 0 ? r.cantidad : 0,
    cerrado: false,
    promos: [],
  }));
  const aplicadas: PromoAplicada[] = [];

  for (const p of ordenarPromos(promos)) {
    if (!vigenteEn(p, ctx) || problemaDeLaPromocion(p)) continue;
    if (p.tipo === "medio-de-pago" && (!ctx.medio || !(p.medios ?? []).includes(ctx.medio))) continue;
    const r =
      p.tipo === "nxm"
        ? aplicarNxM(estados, p)
        : p.tipo === "segunda-unidad"
          ? aplicarSegundaUnidad(estados, p)
          : p.tipo === "combo"
            ? aplicarCombo(estados, p)
            : aplicarPorcentaje(estados, p);
    if (!p.acumulable) for (const e of r.tocados) e.cerrado = true;
    if (r.descuento > 0) {
      aplicadas.push({
        promocionId: p.id,
        nombre: p.nombre,
        descuento: r.descuento / 100,
        claves: estados.filter((e) => r.tocados.has(e)).map((e) => e.r.clave),
      });
    }
  }

  const renglonesOut = estados.map((e) => ({
    clave: e.r.clave,
    descuento: e.descuento / 100,
    neto: (e.bruto - e.descuento) / 100,
    promos: e.promos,
  }));
  return {
    renglones: renglonesOut,
    aplicadas,
    totalDescuento: estados.reduce((s, e) => s + e.descuento, 0) / 100,
  };
}

// ── Validación (lo que llega de la pantalla) ────────────────────────────────

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MEDIOS_VALIDOS: readonly MedioDeCobro[] = ["EFECTIVO", "MERCADOPAGO", "TRANSFERENCIA"];

/** Qué está mal en la promo, en castellano, o null. Lo usan la pantalla, el servidor y el motor. */
export function problemaDeLaPromocion(p: Promocion): string | null {
  if (!p.nombre || !p.nombre.trim()) return "Poné un nombre: es lo que lee el cliente en el ticket.";
  if (p.nombre.length > 80) return "El nombre es muy largo: que entre en un renglón del ticket (80 letras).";
  if (!Number.isInteger(p.prioridad) || p.prioridad < 0 || p.prioridad > 999) return "La prioridad es un número de 0 a 999.";
  if (!p.dias.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return "Los días van de domingo a sábado.";
  if (p.desde && !FECHA.test(p.desde)) return "La fecha de inicio no es válida.";
  if (p.hasta && !FECHA.test(p.hasta)) return "La fecha de fin no es válida.";
  if (p.desde && p.hasta && p.hasta < p.desde) return "La promo termina antes de empezar: revisá las fechas.";
  const conAlcance = p.productos.length > 0 || p.secciones.length > 0;
  const pct = p.porcentaje;
  const pctValido = typeof pct === "number" && Number.isFinite(pct) && pct > 0 && pct <= 100 && centavosDe(pct) / 100 === pct;
  switch (p.tipo) {
    case "nxm":
      if (!conAlcance) return "Elegí los productos o la sección de la promo.";
      if (!Number.isInteger(p.lleva) || !Number.isInteger(p.paga)) return "Completá cuántos lleva y cuántos paga.";
      if ((p.lleva ?? 0) < 2 || (p.lleva ?? 0) > 12) return "Lleva de 2 a 12 unidades.";
      if ((p.paga ?? 0) < 1 || (p.paga ?? 0) >= (p.lleva ?? 0)) return "Paga menos de lo que lleva, y al menos 1.";
      return null;
    case "segunda-unidad":
    case "porcentaje":
      if (!conAlcance) return "Elegí los productos o la sección de la promo.";
      if (!pctValido) return "El porcentaje va de 0,01 a 100, con dos decimales como mucho.";
      return null;
    case "medio-de-pago":
      if (!pctValido) return "El porcentaje va de 0,01 a 100, con dos decimales como mucho.";
      if (!p.medios || p.medios.length === 0 || !p.medios.every((m) => MEDIOS_VALIDOS.includes(m))) {
        return "Elegí con qué medio de pago vale.";
      }
      return null;
    case "combo": {
      const c = p.combo;
      if (!c || c.componentes.length < 2) return "Un combo lleva al menos dos productos distintos.";
      if (new Set(c.componentes.map((x) => x.productId)).size !== c.componentes.length) return "Un producto aparece dos veces en el combo: sumá la cantidad.";
      if (!c.componentes.every((x) => Number.isInteger(x.cantidad) && x.cantidad >= 1 && x.cantidad <= 12)) return "Cada producto del combo va de 1 a 12 unidades.";
      if (!(c.precio > 0) || centavosDe(c.precio) / 100 !== c.precio) return "Poné el precio del combo, con centavos como mucho.";
      return null;
    }
    default:
      return "Tipo de promo desconocido.";
  }
}

/** La promo en dos o tres palabras, para la etiqueta de la góndola y la vidriera. */
export function rotuloDePromocion(p: Promocion): string {
  const pct = (n: number | undefined) => `${(n ?? 0).toLocaleString("es-AR", { maximumFractionDigits: 2 })} %`;
  switch (p.tipo) {
    case "nxm":
      return `${p.lleva}×${p.paga}`;
    case "segunda-unidad":
      return `2ª ${pct(p.porcentaje)} off`;
    case "porcentaje":
      return `${pct(p.porcentaje)} off`;
    case "medio-de-pago":
      return `${pct(p.porcentaje)} off`;
    case "combo":
      return "Combo";
  }
}

const DIAS = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];
const NOMBRE_MEDIO: Record<MedioDeCobro, string> = { EFECTIVO: "efectivo", MERCADOPAGO: "Mercado Pago", TRANSFERENCIA: "transferencia" };

/** Cuándo y cómo vale, en una frase: "Los martes y jueves, pagando con Mercado Pago." */
export function condicionesDePromocion(p: Promocion): string {
  const partes: string[] = [];
  if (p.dias.length > 0 && p.dias.length < 7) {
    const ds = [...p.dias].sort().map((d) => DIAS[d]);
    partes.push(`Los ${ds.length === 1 ? ds[0] : `${ds.slice(0, -1).join(", ")} y ${ds[ds.length - 1]}`}`);
  }
  if (p.tipo === "medio-de-pago" && p.medios?.length) {
    partes.push(`pagando todo con ${p.medios.map((m) => NOMBRE_MEDIO[m]).join(" o ")}`);
  }
  if (p.hasta) partes.push(`hasta el ${p.hasta.slice(8, 10)}/${p.hasta.slice(5, 7)}`);
  if (partes.length === 0) return "Todos los días.";
  const t = partes.join(", ");
  return `${t[0].toUpperCase()}${t.slice(1)}.`;
}

// ── Lo que llega de afuera (la pantalla o una fila guardada) ─────────────────

const TIPOS = new Set<TipoPromocion>(["nxm", "segunda-unidad", "porcentaje", "medio-de-pago", "combo"]);
const esTexto = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const listaDeTextos = (v: unknown, maxItems: number): string[] | null =>
  Array.isArray(v) && v.length <= maxItems && v.every((x) => esTexto(x, 64) && x.length > 0) ? [...new Set(v as string[])] : null;
const numeroOpcional = (v: unknown): number | undefined | null =>
  v === undefined || v === null ? undefined : typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * La promo con la FORMA correcta, o null. No decide si tiene sentido (eso es
 * `problemaDeLaPromocion`): sólo que cada campo sea del tipo que dice ser. Una acción del
 * servidor es un endpoint y una fila de la base pudo escribirla una versión vieja.
 */
export function promocionDesdeAfuera(v: unknown): Promocion | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!esTexto(o.id, 64) || !/^[a-z0-9-]{4,64}$/.test(o.id)) return null;
  if (!esTexto(o.nombre, 200)) return null;
  if (!TIPOS.has(o.tipo as TipoPromocion)) return null;
  const productos = listaDeTextos(o.productos ?? [], 500);
  const secciones = listaDeTextos(o.secciones ?? [], 20);
  if (!productos || !secciones) return null;
  const dias = Array.isArray(o.dias) && o.dias.every((d) => Number.isInteger(d)) ? [...new Set(o.dias as number[])].sort() : null;
  if (!dias) return null;
  const lleva = numeroOpcional(o.lleva);
  const paga = numeroOpcional(o.paga);
  const porcentaje = numeroOpcional(o.porcentaje);
  if (lleva === null || paga === null || porcentaje === null) return null;
  let medios: MedioDeCobro[] | undefined;
  if (o.medios !== undefined && o.medios !== null) {
    if (!Array.isArray(o.medios) || !o.medios.every((m) => MEDIOS_VALIDOS.includes(m as MedioDeCobro))) return null;
    medios = [...new Set(o.medios as MedioDeCobro[])];
  }
  let combo: Promocion["combo"];
  if (o.combo !== undefined && o.combo !== null) {
    const c = o.combo as Record<string, unknown>;
    if (!Array.isArray(c.componentes) || c.componentes.length > 12 || typeof c.precio !== "number" || !Number.isFinite(c.precio)) return null;
    const componentes: ComponenteCombo[] = [];
    for (const x of c.componentes) {
      const k = x as Record<string, unknown>;
      if (!esTexto(k.productId, 64) || !k.productId || typeof k.cantidad !== "number") return null;
      componentes.push({ productId: k.productId, cantidad: k.cantidad });
    }
    combo = { componentes, precio: c.precio };
  }
  const fecha = (x: unknown): string | null | undefined => (x === undefined || x === null || x === "" ? null : esTexto(x, 10) ? x : undefined);
  const desde = fecha(o.desde);
  const hasta = fecha(o.hasta);
  if (desde === undefined || hasta === undefined) return null;
  if (typeof o.prioridad !== "number" || typeof o.acumulable !== "boolean" || typeof o.activa !== "boolean") return null;
  return {
    id: o.id,
    nombre: o.nombre.trim(),
    tipo: o.tipo as TipoPromocion,
    productos,
    secciones,
    dias,
    ...(lleva !== undefined ? { lleva } : {}),
    ...(paga !== undefined ? { paga } : {}),
    ...(porcentaje !== undefined ? { porcentaje } : {}),
    ...(medios ? { medios } : {}),
    ...(combo ? { combo } : {}),
    desde,
    hasta,
    prioridad: o.prioridad,
    acumulable: o.acumulable,
    activa: o.activa,
  };
}

/** Los productos que nombra la promo (alcance y combo), para verificar que son del negocio. */
export function productosDeLaPromocion(p: Promocion): string[] {
  return [...new Set([...p.productos, ...(p.combo?.componentes.map((c) => c.productId) ?? [])])];
}

/** Las promos vigentes esta semana (desde `fecha`, 7 días), para "Ofertas de la semana". PURA. */
export function vigentesEnLaSemana(promos: readonly Promocion[], fecha: string, diaSemana: number): Promocion[] {
  const out: Promocion[] = [];
  for (const p of promos) {
    for (let k = 0; k < 7; k++) {
      const f = sumarDias(fecha, k);
      if (vigenteEn(p, { fecha: f, diaSemana: (diaSemana + k) % 7 })) {
        out.push(p);
        break;
      }
    }
  }
  return ordenarPromos(out);
}

function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1, d + dias));
  return t.toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado de un día AAAA-MM-DD (el día del negocio, sin hora). PURA. */
export function diaDeLaSemana(dia: string): number {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/**
 * El rótulo de la promo de cada producto para el cartel ("2×1"), de las que valen en la semana
 * y lo nombran directo (no las de sección ni las de medio de pago, que dependen del día o de
 * cómo se paga). La primera por prioridad. PURA.
 */
export function rotulosDePromoPorProducto(promos: readonly Promocion[], fecha: string, diaSemana: number): Map<string, string> {
  const out = new Map<string, string>();
  for (const p of vigentesEnLaSemana(promos, fecha, diaSemana)) {
    if (p.tipo === "medio-de-pago" || p.dias.length > 0) continue;
    const ids = p.tipo === "combo" ? (p.combo?.componentes.map((c) => c.productId) ?? []) : p.productos;
    for (const id of ids) if (!out.has(id)) out.set(id, rotuloDePromocion(p));
  }
  return out;
}
