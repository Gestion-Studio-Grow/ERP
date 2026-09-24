// ============================================================================
// FILTROS DE LA AUDITORÍA — qué pidió la persona y el `where` que lo responde. PURO.
// ============================================================================
//
// La pantalla mostraba sólo las últimas 100 filas: "¿quién anuló la venta del martes?" o "las
// anulaciones de Juan en septiembre" no se podían contestar si pasaron más de 100 cosas desde
// entonces. Ahora se filtra por período, por quién, por qué hizo y sobre qué, y se pagina.
//
// Los filtros viajan en la URL (un formulario GET, sin JavaScript): se pueden compartir, el
// botón Atrás funciona y un filtro no se pierde al recargar. Por eso TODO lo que llega se lee
// como texto no confiable: una fecha que no es fecha o un usuario que no es del negocio se
// ignoran, no rompen la pantalla. `getAuditLog` (audit.ts) es además un endpoint ("use
// server"), así que vuelve a pasar lo que recibe por acá.
//
// Sin imports de valor de Prisma: sólo el tipo del `where`.

import type { Prisma } from "@/generated/prisma/client";
import { businessWallTimeToUtc } from "@/lib/datetime";

/** Filas por página: entra un día movido de un local sin que la página pese. */
export const POR_PAGINA = 50;

/** Tope de páginas: 500 × 50 = 25.000 filas hacia atrás; más allá, se acota por fecha. */
const PAGINA_MAX = 500;

// ── Qué hizo ────────────────────────────────────────────────────────────────
//
// Las acciones se guardan con nombres internos y algunas no tienen nombre propio: anular una
// venta es un "update" del pedido con `status: "CANCELLED"` en el detalle (order-actions.ts).
// Cada tipo junta las formas en que ESE hecho queda escrito. Los textos de las acciones van
// literales y un test los compara con las constantes de cada módulo, para no arrastrar acá
// módulos de servidor.

export const TIPOS = [
  { id: "anulaciones", etiqueta: "Anulaciones y cancelaciones" },
  { id: "cobros", etiqueta: "Cobros" },
  { id: "precios", etiqueta: "Cambios de precio" },
  { id: "cierres", etiqueta: "Cierres de caja y del mes" },
  { id: "borrados", etiqueta: "Borrados y bajas" },
] as const;
export type TipoId = (typeof TIPOS)[number]["id"];

const WHERE_TIPO: Record<TipoId, Prisma.AuditLogWhereInput> = {
  anulaciones: {
    OR: [
      // La anulación de una venta: la misma forma que cuenta el Inicio (`whereAnulacionesDelDia`).
      { entity: "Order", action: "update", changes: { path: ["status"], equals: "CANCELLED" } },
      { entity: "Appointment", action: "cancel" },
      { action: "void_collection" },
    ],
  },
  cobros: {
    OR: [
      { action: { in: ["confirm_payment", "collect_payment"] } },
      { entity: "Order", action: "update", changes: { path: ["paid"], equals: true } },
    ],
  },
  precios: { action: "cambio-de-precio" },
  cierres: {
    OR: [
      { action: { in: ["caja.cierre-diario", "caja.corte-inicial", "cierre-mes.congelar", "cierre-mes.reabrir"] } },
      { entity: "CashSession", action: "close" },
    ],
  },
  borrados: { action: { in: ["delete", "libro.delete", "deactivate", "multilocal.baja"] } },
};

// ── Sobre qué ───────────────────────────────────────────────────────────────

export const SOBRE = [
  { id: "ventas", etiqueta: "Ventas y pedidos", entidades: ["Order", "PaymentLink", "Coupon"] },
  {
    id: "turnos",
    etiqueta: "Turnos y agenda",
    entidades: ["Appointment", "WaitlistEntry", "ProfessionalBlock", "ProfessionalNews"],
    soloConAgenda: true,
  },
  { id: "caja", etiqueta: "Caja", entidades: ["CashSession", "CashMovement", "CierreDiario", "CierreMes", "CommissionPayout"] },
  { id: "catalogo", etiqueta: "Catálogo y precios", entidades: ["Product", "Service", "Box"] },
  {
    id: "stock",
    etiqueta: "Stock, compras y proveedores",
    entidades: [
      "StockMovement",
      "StockPurchase",
      "ProductBatch",
      "Supplier",
      "DevolucionProveedor",
      "Traslado",
      "AccountPayable",
      "PayableCheque",
    ],
  },
  {
    id: "clientes",
    etiqueta: "Clientes",
    entidades: ["Client", "Review", "LeadCampania", "ContactoCliente", "ConsentimientoCliente", "MessageTemplate", "ServiceReminderConfig"],
  },
  {
    id: "equipo",
    etiqueta: "Equipo y configuración",
    entidades: [
      "User",
      "Professional",
      "ProfessionalServiceCommission",
      "BusinessSettings",
      "Tenant",
      "Tenant.accentPreset",
      "TenantFiscalCredential",
      "Interruptor",
      "CarteraCliente",
      "ProcessingRun",
    ],
  },
] as const satisfies readonly { id: string; etiqueta: string; entidades: readonly string[]; soloConAgenda?: boolean }[];
export type SobreId = (typeof SOBRE)[number]["id"];

/** Las opciones de "Sobre qué" de este negocio: sin agenda, "Turnos" no tiene nada que mostrar. */
export function opcionesSobre(conAgenda: boolean) {
  return SOBRE.filter((s) => conAgenda || !("soloConAgenda" in s && s.soloConAgenda));
}

// ── Quién ───────────────────────────────────────────────────────────────────
//
// Un usuario del negocio (`u:<id>`), GSG (la consola), los clientes desde la web o el sistema.
// Un usuario también figura como `casa:<id>:user:<id>` o `traslado:user:<id>` cuando actuó
// desde la casa de su red (multilocal): es la misma persona.

export type Quien = { tipo: "usuario"; id: string } | { tipo: "gsg" } | { tipo: "web" } | { tipo: "sistema" };

export const QUIEN_FIJOS = [
  { valor: "gsg", etiqueta: "GSG (soporte)" },
  { valor: "web", etiqueta: "Clientes desde la web" },
  { valor: "sistema", etiqueta: "El sistema (automático)" },
] as const;

function whereQuien(q: Quien): Prisma.AuditLogWhereInput {
  switch (q.tipo) {
    case "usuario":
      return { OR: [{ actor: `user:${q.id}` }, { actor: { endsWith: `:user:${q.id}` } }] };
    case "gsg":
      return { actor: { startsWith: "operator:" } };
    case "web":
      return { actor: { startsWith: "cliente" } };
    case "sistema":
      return { actor: "system" };
  }
}

export function valorDeQuien(q: Quien | null): string {
  if (!q) return "";
  return q.tipo === "usuario" ? `u:${q.id}` : q.tipo;
}

// ── Lectura de la URL ──────────────────────────────────────────────────────

export type FiltrosAuditoria = {
  desde: string | null;
  hasta: string | null;
  quien: Quien | null;
  tipo: TipoId | null;
  sobre: SobreId | null;
  pagina: number;
};

export const SIN_FILTROS: FiltrosAuditoria = { desde: null, hasta: null, quien: null, tipo: null, sobre: null, pagina: 1 };

type Crudo = Record<string, string | string[] | undefined> | null | undefined;

function uno(crudo: Crudo, clave: string): string {
  const v = crudo?.[clave];
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" ? s.trim() : "";
}

/** "2026-09-01", y que exista (un 31 de febrero no es un día). */
export function esDia(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [a, m, d] = s.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

/** El día siguiente de un "AAAA-MM-DD" (calendario, sin zona). */
export function diaSiguiente(dia: string): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * Lo que pidió la persona, validado. `usuarios` son los ids de los usuarios de ESTE negocio:
 * un id que no está se ignora (no se filtra por un actor que el negocio no tiene).
 */
export function leerFiltros(crudo: Crudo, usuarios: ReadonlySet<string>): FiltrosAuditoria {
  let desde: string | null = esDia(uno(crudo, "desde")) ? uno(crudo, "desde") : null;
  let hasta: string | null = esDia(uno(crudo, "hasta")) ? uno(crudo, "hasta") : null;
  // Un rango al revés ("del 30 al 1") se entiende: se da vuelta en vez de mostrar nada.
  if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde];

  const q = uno(crudo, "quien");
  let quien: Quien | null = null;
  if (q.startsWith("u:") && usuarios.has(q.slice(2))) quien = { tipo: "usuario", id: q.slice(2) };
  else if (q === "gsg" || q === "web" || q === "sistema") quien = { tipo: q };

  const t = uno(crudo, "tipo");
  const tipo = TIPOS.some((x) => x.id === t) ? (t as TipoId) : null;
  const s = uno(crudo, "sobre");
  const sobre = SOBRE.some((x) => x.id === s) ? (s as SobreId) : null;

  const p = Number(uno(crudo, "pagina"));
  const pagina = Number.isInteger(p) && p >= 1 ? Math.min(p, PAGINA_MAX) : 1;
  return { desde, hasta, quien, tipo, sobre, pagina };
}

/** Sólo el día de hoy (del negocio): lo que cuenta el número del Inicio y lo que abre su tile. */
export function filtrosDeHoy(hoy: string): FiltrosAuditoria {
  return { ...SIN_FILTROS, desde: hoy, hasta: hoy };
}

/** ¿Hay algún filtro puesto? (la página no cuenta). */
export function hayFiltros(f: FiltrosAuditoria): boolean {
  return Boolean(f.desde || f.hasta || f.quien || f.tipo || f.sobre);
}

// ── El where ────────────────────────────────────────────────────────────────

/**
 * El `where` de la lista. El negocio lo pone el cliente de Prisma del request (candado de
 * tenant y RLS, db.ts): acá no entra ningún tenantId de afuera. Los días son del NEGOCIO
 * (hora argentina), no del servidor: "hasta el 30" incluye todo el 30 hasta las 23:59.
 */
export function whereAuditoria(f: FiltrosAuditoria): Prisma.AuditLogWhereInput {
  const partes: Prisma.AuditLogWhereInput[] = [];
  if (f.desde || f.hasta) {
    partes.push({
      createdAt: {
        ...(f.desde ? { gte: businessWallTimeToUtc(f.desde, "00:00") } : {}),
        ...(f.hasta ? { lt: businessWallTimeToUtc(diaSiguiente(f.hasta), "00:00") } : {}),
      },
    });
  }
  if (f.quien) partes.push(whereQuien(f.quien));
  if (f.tipo) partes.push(WHERE_TIPO[f.tipo]);
  if (f.sobre) {
    const grupo = SOBRE.find((s) => s.id === f.sobre)!;
    partes.push({ entity: { in: [...grupo.entidades] } });
  }
  return partes.length === 0 ? {} : partes.length === 1 ? partes[0] : { AND: partes };
}

/** La página pedida dentro de las que hay (una página de más muestra la última, no un vacío). */
export function paginaValida(pagina: number, total: number): number {
  const ultima = Math.max(1, Math.ceil(total / POR_PAGINA));
  return Math.min(Math.max(1, pagina), ultima);
}

// ── Links ───────────────────────────────────────────────────────────────────

/** La URL de la auditoría con estos filtros (sin los vacíos, y sin `pagina=1`). */
export function hrefAuditoria(f: FiltrosAuditoria, cambios: Partial<FiltrosAuditoria> = {}): string {
  const g = { ...f, ...cambios };
  const params = new URLSearchParams();
  if (g.desde) params.set("desde", g.desde);
  if (g.hasta) params.set("hasta", g.hasta);
  if (g.quien) params.set("quien", valorDeQuien(g.quien));
  if (g.tipo) params.set("tipo", g.tipo);
  if (g.sobre) params.set("sobre", g.sobre);
  if (g.pagina > 1) params.set("pagina", String(g.pagina));
  const qs = params.toString();
  return qs ? `/admin/auditoria?${qs}` : "/admin/auditoria";
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function ultimoDiaDelMes(anio: number, mes: number): string {
  return new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
}

/**
 * Los períodos de un toque: hoy, los últimos 7 días, este mes y el anterior, dichos con el
 * nombre del mes ("Septiembre"): "las anulaciones de septiembre" se piden así, no con dos
 * fechas. `hoy` es el día del negocio.
 */
export function atajosDePeriodo(hoy: string): { id: string; etiqueta: string; desde: string; hasta: string }[] {
  const [a, m, d] = hoy.split("-").map(Number);
  const hace7 = new Date(Date.UTC(a, m - 1, d - 6)).toISOString().slice(0, 10);
  const mesActual = { anio: a, mes: m };
  const mesAnterior = m === 1 ? { anio: a - 1, mes: 12 } : { anio: a, mes: m - 1 };
  const nombre = (x: { mes: number }) => MESES[x.mes - 1][0].toUpperCase() + MESES[x.mes - 1].slice(1);
  const inicio = (x: { anio: number; mes: number }) => `${x.anio}-${String(x.mes).padStart(2, "0")}-01`;
  return [
    { id: "hoy", etiqueta: "Hoy", desde: hoy, hasta: hoy },
    { id: "7d", etiqueta: "Últimos 7 días", desde: hace7, hasta: hoy },
    { id: "mes", etiqueta: nombre(mesActual), desde: inicio(mesActual), hasta: hoy },
    {
      id: "mes-anterior",
      etiqueta: nombre(mesAnterior),
      desde: inicio(mesAnterior),
      hasta: ultimoDiaDelMes(mesAnterior.anio, mesAnterior.mes),
    },
  ];
}
