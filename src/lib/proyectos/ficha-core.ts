// FICHA DEL PROYECTO — reglas puras de las pantallas de proyectos: pipeline, versiones, planilla de venta y cashflow.
// Sin base ni React. Las reglas de plata viven en gestion-core.ts; acá, lo que las une a la pantalla.

import { esCancelado } from "./cancelacion-core";
import { ETAPAS, leerNumero, redondear } from "./core";
import { claveFoto, costoTotalItem, ventaTotalItem, type CuotaLeida, type FotoItem, type LineaCashflow } from "./gestion-core";

export const PERDIDO = "PERDIDO";
/** Lo que contesta el servidor si se intenta cobrar, marcar una cuota de cobro o cargar un cobro en un perdido (MIA-089 · V2). */
/** MIA-208/213: el productor (rol de gestión que no ve la plata) no cobra, no paga, no anula ni carga cuotas: lo hace Administración. */
export const SIN_PLATA = "Tu usuario no ve la plata del negocio: los cobros, los pagos y sus anulaciones los hace Administración.";
export const PERDIDO_NO_COBRA = "Este proyecto está perdido: no se le registran cobros ni se marcan cuotas de cobro. Si se retoma, reabrilo primero.";

/**
 * Qué se mueve en un proyecto perdido, igual en la pantalla y en el servidor: un cobro no (no debe nada, pregunta 2 = A);
 * un pago a proveedor sí, marcar su cuota o cargarlo a mano, sin reabrir: es plata que se debe igual. Decisión 2 = A del
 * veredicto MIA-094, confirmada por el dueño el 20/11 (MIA-224). Falla cerrada: sólo PAGO pasa; un tipo desconocido no (la
 * columna es un String sin CHECK; observación del par revisor de MIA-099).
 */
export const perdidoAdmite = (tipo: string): boolean => tipo === "PAGO";

/**
 * Las cuotas del plan que siguen corriendo según cómo salió el proyecto. Vivo: todas. Perdido: sólo las de pago a proveedor
 * (decisión 2 del dueño, 20/11, MIA-224: «queda en el proyecto trazado y queda en deuda a ese proveedor»), las mismas
 * claves, así que reabrir no las duplica. Cancelado: ninguna (C-O04: Dirección resuelve a mano lo que queda). PURA.
 */
export function planQueSigue<T extends { tipo: string }>(plan: readonly T[], p: { perdidoEl: Date | null; motivoPerdida: string | null }): T[] {
  if (!p.perdidoEl) return [...plan];
  if (esCancelado(p.motivoPerdida)) return [];
  return plan.filter((c) => perdidoAdmite(c.tipo));
}

/**
 * Una cuota sin marcar de un proyecto perdido que la regla de arriba no admite (un cobro): no se cobra y no está pendiente
 * de cobro. Administración la muestra en «Todos» con su porqué, sin «Cobrado» (ADV-7, MIA-107). Falla cerrada como
 * `perdidoAdmite`. PURA.
 */
export const cobroFrenadoPorPerdido = (c: { tipo: string; pagadoEl: Date | string | null; proyecto?: { perdidoEl: Date | string | null } | null }): boolean => !c.pagadoEl && !!c.proyecto?.perdidoEl && !perdidoAdmite(c.tipo);

/**
 * «Vendido (aprobado, con IVA)» de la ficha de un cliente: el total aprobado de sus proyectos, sin los perdidos (decisión 1
 * del dueño, 20/11, MIA-224; hallazgo H3 de GSG-PR215-v1), igual que Rentabilidad y Dirección. Reabierto vuelve a sumar. PURA.
 */
export const vendidoDelCliente = (proyectos: readonly { t: { total: number } | null; perdidoEl: Date | string | null }[]): number =>
  redondear(proyectos.reduce((s, p) => s + (p.perdidoEl ? 0 : (p.t?.total ?? 0)), 0));

/** La fila de historial que deja una aprobación quitada al volver a Pedido (MIA-224 · D4). */
export const VOLVIO_A_PEDIDO = "Volvió a Pedido: la tiene que aprobar el cliente de nuevo";
export const FALTA_REAPROBAR =
  "Este proyecto volvió a Pedido y perdió la aprobación: no pasa a Confirmado hasta que el cliente apruebe una versión (por su link o con «Registrar respuesta»).";
export const FALTA_APROBACION =
  "Este proyecto no tiene una versión aprobada por el cliente: no pasa a Confirmado hasta que el cliente apruebe una (por su link o con «Registrar respuesta»).";

/**
 * MIA-234 · «1 a» del dueño (20/11), que generaliza H2 de MIA-232: ningún proyecto entra en Confirmado ni en una etapa
 * posterior sin una versión aprobada por el cliente, haya vuelto a Pedido o no. Vale también al reabrir un perdido (vuelve
 * a su etapa). Freno duro: Dirección no lo fuerza. Las etapas comerciales no se miran. PURA.
 */
export function frenaSinAprobacion(d: { destino: string; aprobada: boolean }): boolean {
  const etapas: readonly string[] = ETAPAS;
  return !d.aprobada && etapas.indexOf(d.destino) >= etapas.indexOf("APROBADO");
}

/** Un lead sigue abierto hasta que el cliente confirma o se pierde. */
export const ETAPAS_DE_LEAD = ["PEDIDO", "DISENO", "RENDER", "PRESUPUESTO", "PROPUESTA"] as const;

export const COLUMNAS_PIPELINE: readonly string[] = [...ETAPAS, PERDIDO];

export const columnaDe = (p: { etapa: string; perdidoEl: Date | string | null }): string => (p.perdidoEl ? PERDIDO : p.etapa);

export function resumenPipeline(proyectos: readonly { etapa: string; venta: number; perdido: boolean }[]): { abiertos: number; valor: number } {
  const abiertos = proyectos.filter((p) => !p.perdido && (ETAPAS_DE_LEAD as readonly string[]).includes(p.etapa));
  return { abiertos: abiertos.length, valor: redondear(abiertos.reduce((s, p) => s + p.venta, 0)) };
}

export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

/** `null` si no es un número: `leerNumero` da 0 con cualquier cosa, y un costo tipeado mal no puede quedar en cero callado. */
export function numeroDe(texto: string): number | null {
  const s = texto.trim().replace(/^\$\s*/, "");
  if (!/^\d[\d.,]*$/.test(s)) return null;
  // «1,234.50» (una planilla en inglés): el último separador es el de los decimales y las comas, de miles.
  if (s.includes(",") && s.lastIndexOf(".") > s.lastIndexOf(",")) {
    // Sólo con los miles bien agrupados («1,234.50»): «1,2.3» no se adivina.
    return /^\d{1,3}(,\d{3})+\.\d+$/.test(s) ? Number(s.replace(/,/g, "")) : null;
  }
  // Varias comas sin punto no se adivinan («1,2,3»): mejor pedirlo bien que guardar un cero callado.
  if ((s.match(/,/g) ?? []).length > 1) return null;
  return leerNumero(s);
}

/** Los stands se presupuestan como arquitectura promocional; el resto, como producción de eventos. */
export const servicioDeTipo = (tipo: string): "ARQUITECTURA" | "EVENTOS" => (tipo === "Stand / Feria" ? "ARQUITECTURA" : "EVENTOS");

export function linkSeguro(u: string): boolean {
  try {
    return new URL(u).protocol === "https:";
  } catch {
    return false;
  }
}

// ── Ítems ───────────────────────────────────────────────────────────────────

export interface ItemVenta {
  descripcion: string;
  rubro: string;
  unidad?: string;
  cantidad: number;
  costo: number;
  moneda: string;
  recargoPct: number | null;
  precio: number;
  visibleCliente?: boolean;
}

/** Monedas con ítems que todavía no tienen tipo de cambio: sin él, sus costos valdrían cero y nadie se enteraría. */
export function monedasSinCambio(items: readonly { moneda: string }[], tc: Readonly<Record<string, number>>): string[] {
  return [...new Set(items.map((i) => i.moneda))].filter((m) => m !== "ARS" && !(tc[m] > 0));
}

/**
 * El link del cliente y la planilla leen `precio`. Al enviar, el precio que salía del recargo queda escrito, y el recargo
 * general se fija en el ítem: así la versión siguiente puede volver a calcularlo (ver `precioAlCopiar`).
 */
export function precioAlEnviar(i: ItemVenta, tc: Readonly<Record<string, number>>, recargoGeneral: number): { precio: number; recargoPct: number } | null {
  if (i.precio > 0) return null;
  const unitario = i.cantidad > 0 ? redondear(ventaTotalItem(i, tc, recargoGeneral) / i.cantidad) : 0;
  return { precio: unitario, recargoPct: i.recargoPct ?? recargoGeneral };
}

/**
 * En un evento en otra moneda, el precio a mano se TIPEA en esa moneda y se guarda en pesos al cambio de la versión
 * (`guardarCampoItem`): lo que vale es lo tipeado. Si cambia el cambio de la versión, se recupera lo tipeado (pesos ÷
 * cambio viejo, al centavo) y se vuelve a pasar a pesos con el nuevo: el cliente sigue viendo US$ 4.033,33. Sin precio a
 * mano (sale del recargo sobre costos en pesos), no se toca. PURA.
 */
export function precioAlCambiarCambio(precio: number, viejo: number, nuevo: number): number {
  if (!(precio > 0) || !(viejo > 0) || !(nuevo > 0)) return precio;
  return redondear(redondear(precio / viejo) * nuevo);
}

/** Con recargo, el precio se recalcula en la versión nueva; sin recargo, alguien lo fijó a mano y se respeta. */
export const precioAlCopiar = (i: { recargoPct: number | null; precio: number }): number => (i.recargoPct != null ? 0 : i.precio);

/** Lo que se guarda al enviar. Dos ítems pueden llamarse igual: el segundo lleva marca, para no pisarse al comparar. */
export function fotoDeVersion(items: readonly ItemVenta[], tc: Readonly<Record<string, number>>, recargoGeneral: number): FotoItem[] {
  const vistas = new Map<string, number>();
  return items.map((i) => {
    const base = claveFoto(i.descripcion);
    const n = (vistas.get(base) ?? 0) + 1;
    vistas.set(base, n);
    return { clave: n === 1 ? base : `${base}#${n}`, descripcion: i.descripcion, rubro: i.rubro, importe: ventaTotalItem(i, tc, recargoGeneral), costo: costoTotalItem(i, tc) };
  });
}

/** El margen tal como quedó al enviar. */
export function margenDeFoto(foto: readonly FotoItem[]): { margen: number; pct: number } {
  const venta = redondear(foto.reduce((s, i) => s + i.importe, 0));
  const margen = redondear(venta - foto.reduce((s, i) => s + (i.costo ?? 0), 0));
  return { margen, pct: venta > 0 ? redondear((margen / venta) * 100) : 0 };
}

export function esFoto(v: unknown): v is FotoItem[] {
  return Array.isArray(v) && v.every((x) => x && typeof (x as FotoItem).clave === "string" && typeof (x as FotoItem).importe === "number");
}

export interface LineaPlanilla {
  descripcion: string;
  cantidad: number | null;
  unidad: string;
  importe: number;
}

export interface GrupoPlanilla {
  rubro: string;
  subtotal: number;
  lineas: LineaPlanilla[];
}

/**
 * La planilla que ve el cliente: sin costos. Lo no visible no se detalla, pero se cobra: va junto en «Otros conceptos»
 * para que el total siga dando lo mismo que las cuotas.
 */
export function planillaDeVenta(items: readonly ItemVenta[], tc: Readonly<Record<string, number>>, recargoGeneral: number): { grupos: GrupoPlanilla[]; neto: number } {
  const grupos = new Map<string, GrupoPlanilla & { otros: number }>();
  for (const i of items) {
    let g = grupos.get(i.rubro);
    if (!g) {
      g = { rubro: i.rubro, subtotal: 0, lineas: [], otros: 0 };
      grupos.set(i.rubro, g);
    }
    const importe = ventaTotalItem(i, tc, recargoGeneral);
    g.subtotal = redondear(g.subtotal + importe);
    if (i.visibleCliente === false) g.otros = redondear(g.otros + importe);
    else g.lineas.push({ descripcion: i.descripcion, cantidad: i.cantidad, unidad: i.unidad ?? "u", importe });
  }
  const lista = [...grupos.values()].map(({ otros, ...g }) => ({ ...g, lineas: otros > 0 ? [...g.lineas, { descripcion: "Otros conceptos", cantidad: null, unidad: "", importe: otros }] : g.lineas }));
  return { grupos: lista, neto: redondear(lista.reduce((s, g) => s + g.subtotal, 0)) };
}

/** Las cuotas guardan de qué ítem salieron en la clave. Una versión nueva copia los ítems con otro id: la clave los sigue. */
export function clavesARenombrar(proyectoId: string, ids: ReadonlyMap<string, string>): { de: string; a: string }[] {
  const salida: { de: string; a: string }[] = [];
  for (const [viejo, nuevo] of ids) {
    for (const tramo of ["anticipo", "saldo"]) salida.push({ de: `${proyectoId}:${viejo}:${tramo}`, a: `${proyectoId}:${nuevo}:${tramo}` });
  }
  return salida;
}

export function itemDeClave(clave: string | null | undefined): string | null {
  const partes = (clave ?? "").split(":");
  return partes.length === 3 && partes[1] !== "cliente" ? partes[1] : null;
}

export function conteoPorEstado(items: readonly { estadoItem: string }[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const i of items) c[i.estadoItem] = (c[i.estadoItem] ?? 0) + 1;
  return c;
}

export const fechaAntesDe = (evento: Date | null, dias: number): Date | null => (evento ? new Date(evento.getTime() - dias * 86_400_000) : null);

// ── Lo que se manda al navegador ────────────────────────────────────────────

/** Una fila de la ficha tal como sale del servidor: lo que este rol no ve, no viaja. */
export interface FilaFicha {
  id: string;
  descripcion: string;
  rubro: string;
  supplierId: string | null;
  proveedorTexto: string | null;
  cantidad: number;
  costo?: number;
  moneda: string;
  recargoPct?: number | null;
  /** El precio fijado a mano; 0 si sale del recargo. */
  precioManual?: number;
  ventaUnitaria?: number;
  /** MIA-237: sin importes (productor de campo) no viajan la venta ni el precio. */
  venta?: number;
  costoTotal?: number;
  margen?: number;
  fechaLimite: string;
  estadoItem: string;
  visibleCliente: boolean;
  adjuntos: number;
  costoReal?: number | null;
}

/** Qué es lo que se está subiendo, mirando el contenido y no el nombre. `null` si no se acepta o pesa de más. PURA. */
export function tipoDeArchivoSubido(datos: string, maxImagen: number, maxPdf: number): "imagen" | "pdf" | null {
  if (/^data:image\/(jpeg|png|webp);base64,/.test(datos)) return datos.length <= maxImagen ? "imagen" : null;
  if (datos.startsWith("data:application/pdf;base64,JVBER")) return datos.length <= maxPdf ? "pdf" : null; // JVBER = «%PDF» en base64
  return null;
}

export function filaDeFicha(
  i: ItemVenta & { id: string; supplierId: string | null; supplier?: { name: string } | null; proveedor: string | null; fechaLimite: string; estadoItem: string; visibleCliente: boolean; adjuntos: number; costoReal?: number | null },
  tc: Readonly<Record<string, number>>,
  recargoGeneral: number,
  ocultas: ReadonlySet<string>,
): FilaFicha {
  const venta = ventaTotalItem(i, tc, recargoGeneral);
  const costoTotal = costoTotalItem(i, tc);
  return {
    id: i.id,
    descripcion: i.descripcion,
    rubro: i.rubro,
    supplierId: i.supplierId,
    proveedorTexto: i.supplier?.name ?? i.proveedor,
    cantidad: i.cantidad,
    moneda: i.moneda,
    ...(!ocultas.has("venta") && { precioManual: i.precio, ventaUnitaria: i.cantidad > 0 ? redondear(venta / i.cantidad) : 0, venta }),
    fechaLimite: i.fechaLimite,
    estadoItem: i.estadoItem,
    visibleCliente: i.visibleCliente,
    adjuntos: i.adjuntos,
    ...(!ocultas.has("costoUnit") && { costo: i.costo }),
    ...(!ocultas.has("recargo") && { recargoPct: i.recargoPct }),
    ...(!ocultas.has("costoTotal") && { costoTotal, costoReal: i.costoReal ?? null }),
    ...(!ocultas.has("margen") && { margen: redondear(venta - costoTotal) }),
  };
}

// ── Cashflow ────────────────────────────────────────────────────────────────

export const FILTROS_CASHFLOW = [
  { id: "todos", label: "Todos" },
  { id: "cobros", label: "Cobros" },
  { id: "pagos", label: "Pagos" },
  { id: "pendientes", label: "Pendientes" },
] as const;

/** Se filtra después de calcular: el saldo acumulado de cada línea sigue siendo el del evento entero. */
export function filtrarCashflow<T extends CuotaLeida>(lineas: readonly LineaCashflow<T>[], filtro: string): LineaCashflow<T>[] {
  if (filtro === "cobros") return lineas.filter((l) => l.cuota.tipo === "COBRO");
  if (filtro === "pagos") return lineas.filter((l) => l.cuota.tipo === "PAGO");
  if (filtro === "pendientes") return lineas.filter((l) => !l.cuota.pagadoEl);
  return [...lineas];
}

// ── Historial ───────────────────────────────────────────────────────────────

const CAMPOS_DE_COSTO = ["Costo", "Recargo", "Moneda", "Plus"];

/** El historial no le muestra a nadie lo que su permiso le esconde en la ficha. */
export function cambioVisible(c: { entidad: string; campo: string }, permisos: { costos: boolean; pagos: boolean; importes?: boolean }): boolean {
  if (c.campo === "Asiento" || c.campo === "Cuenta movida" || c.campo === "Envío") return false;
  // MIA-237: sin importes (productor de campo), tampoco el precio que se cambió.
  if (permisos.importes === false && (c.campo.startsWith("Precio") || c.campo.startsWith("Venta"))) return false;
  if (!permisos.pagos && (c.entidad === "ProyectoCuota" || c.entidad === "ProyectoPago" || c.entidad === "ProyectoGasto")) return false;
  if (!permisos.costos && CAMPOS_DE_COSTO.some((k) => c.campo.startsWith(k))) return false;
  return true;
}

/**
 * «Avance de cobro» del Estado financiero de la ficha, 0 a 100: lo cobrado sobre lo cobrado más lo que falta cobrar.
 * Un perdido no le falta nada y un «100 %» diría que se cobró la venta: su avance es lo cobrado contra la venta original
 * (decisión 3 = B del dueño, 20/11, MIA-224, PROVISIONAL A CONFIRMAR CON ALE). Sin venta original (perdido sin versión
 * aprobada), null: no se muestra.
 */
export function avanceDeCobro(f: { cobrado: number; aCobrar: number; ventaOriginal?: number | null } | null | undefined, perdido: boolean): number | null {
  if (perdido) return f?.ventaOriginal && f.ventaOriginal > 0 ? (f.cobrado / f.ventaOriginal) * 100 : null;
  return f && f.cobrado + f.aCobrar > 0 ? (f.cobrado / (f.cobrado + f.aCobrar)) * 100 : 0;
}

/** «1 ítem», «3 ítems», «0 ítems»: el número con la palabra en singular sólo cuando es uno. */
export function contar(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
