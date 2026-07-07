// ─────────────────────────────────────────────────────────────────────────────
// MODO SANDBOX DE PREVENTA (Célula Probador Interactivo + Célula Sandbox).
//
// Deja entrar al backoffice REAL (/admin: agenda, caja, panel del dueño) SIN
// password, con datos 100% ficticios, sin tocar la base real ni ningún
// secreto. Existe SOLO si `DEMO_MODE_ENABLED === "true"` — flag exclusiva de un
// deploy AISLADO (nunca el de un tenant real: Carolina/Magra/etc no la tienen
// seteada, así que este módulo es código MUERTO ahí, no un `if` en caliente).
//
// Ver el diseño completo:
//   - docs/preventa/plan-acceso-sandbox-sin-password.md (Célula Probador)
//   - docs/demo/plan-sandbox-persistencia.md (Célula Sandbox)
//
// Con la flag apagada (default en todo deploy real), `isDemoSandbox()` es
// `false` siempre y ningún otro export de este módulo se usa.
//
// TOGGLE DE PERSISTENCIA (lo único "pendiente de activar"): pasar a datos
// reales NO es un botón dentro de la app — es una decisión de DEPLOY (crear el
// Tenant real, redesplegar sin esta flag). Ver ambos docs, §Toggle.
// ─────────────────────────────────────────────────────────────────────────────

import type { SessionUser } from "@/lib/session";
import { businessWallTimeToUtc } from "@/lib/datetime";
import { computeDeepKpis, type KpiAppointment, type KpiPaymentMethod } from "@/lib/report-kpis";
import { isDemoSandbox, DEMO_TENANT_ID } from "@/lib/demo-flag";
import {
  activeDemoRecommendation,
  type ConsultorRecommendation,
} from "@/lib/demo-consultor";
import { getAgendaRubro } from "@/blueprints/agenda/rubros";
import { getRetailRubro } from "@/blueprints/retail/rubros";

export { isDemoSandbox, DEMO_TENANT_ID };
export {
  activeDemoRecommendation,
  recommendForRubro,
  type ConsultorRecommendation,
} from "@/lib/demo-consultor";

export const DEMO_SESSION_USER: SessionUser = {
  id: "demo-owner",
  name: "Vos (modo demo)",
  email: "demo@sandbox.local",
  role: "OWNER",
  professionalId: null,
  tenantId: DEMO_TENANT_ID,
};

// Respuesta uniforme para toda escritura bloqueada en modo demo (mismo shape
// que `CajaActionState`). Honesto en vez de fingir un éxito que no ocurrió
// (Gate de Excelencia — no inventar un estado): el visitante ve por qué no
// pasó nada, no un cartel roto ni un dato que después "desaparece".
export const DEMO_WRITE_BLOCKED = {
  ok: false as const,
  error: "Modo demo: los datos no se guardan de verdad. Se habilita al activar el negocio con datos reales.",
};

// ─────────────────────── Fixtures parametrizadas por la RECOMENDACIÓN ────────
//
// Ya nada está hardcodeado a un rubro: cada fixture se ARMA a partir de la
// `ConsultorRecommendation` (familia + catálogo + forma de datos). Por defecto
// usan `activeDemoRecommendation()` (el rubro del deploy de demo, `DEMO_RUBRO`),
// pero aceptan una recomendación explícita para testear varias familias.

// Ítem vendible ya normalizado (servicio o producto) → precio unitario/representativo.
type DemoItem = { name: string; price: number };

// Catálogo del rubro, sacado del blueprint correspondiente (config pura, sin DB):
// servicios para Agenda&Servicios; productos (precio/kg o /u) para Retail/Mostrador.
// Fallback honesto si el blueprint no trae catálogo (comodín / gastronomía todavía
// sin catálogo semilla): un set genérico, marcado como tal en el nombre.
const GENERIC_SERVICES: DemoItem[] = [
  { name: "Servicio general", price: 12000 },
  { name: "Servicio premium", price: 20000 },
  { name: "Consulta", price: 8000 },
];
const GENERIC_PRODUCTS: DemoItem[] = [
  { name: "Producto destacado", price: 6500 },
  { name: "Producto clásico", price: 3200 },
  { name: "Producto premium", price: 9800 },
];

function demoCatalog(rec: ConsultorRecommendation): DemoItem[] {
  if (rec.itemKind === "servicio") {
    const r = getAgendaRubro(rec.blueprintId);
    if (r && r.services.length > 0) {
      return r.services.map((s) => ({ name: s.name, price: s.price }));
    }
    return GENERIC_SERVICES;
  }
  const r = getRetailRubro(rec.blueprintId);
  if (r && r.catalog.length > 0) {
    return r.catalog.map((it) => ({
      name: it.name,
      price: it.sale === "kg" ? it.pricePerKg : it.price,
    }));
  }
  return GENERIC_PRODUCTS;
}

// Quién "atiende": profesionales con box para agenda; un mostrador único para
// retail/gastronomía (no hay profesionales por turno). Alimenta la agenda y el
// desglose "por profesional/canal" de los reportes.
type DemoProvider = { id: string; name: string; box: { name: string } };

function demoProviders(rec: ConsultorRecommendation): DemoProvider[] {
  if (rec.primaryScreen === "agenda") {
    return [
      { id: "demo-pro-1", name: "Caro", box: { name: "Box 1" } },
      { id: "demo-pro-2", name: "Sofi", box: { name: "Box 2" } },
    ];
  }
  return [{ id: "demo-pro-1", name: "Mostrador", box: { name: "Caja 1" } }];
}

// Clientes ficticios (neutros, sirven para cualquier rubro).
const CLIENTS = [
  { name: "Marina G.", phone: "11-5555-0101" },
  { name: "Lucía P.", phone: "11-5555-0102" },
  { name: "Ana R.", phone: "11-5555-0103" },
  { name: "Sofía M.", phone: "11-5555-0104" },
  { name: "Belén T.", phone: "11-5555-0105" },
];

// Devuelve un día "lleno" del negocio ficticio, cualquier fecha que se navegue.
// Solo las familias con agenda (Agenda&Servicios / Servicios&Oficios) tienen
// turnos; las de mostrador (retail/gastronomía) devuelven una jornada vacía —
// honesto: ese negocio no trabaja con agenda de turnos y el módulo `agenda` ni
// siquiera está entre sus `modules`.
export function getDemoAgendaDay(
  date: string,
  rec: ConsultorRecommendation = activeDemoRecommendation(),
) {
  const professionals: DemoProvider[] = rec.primaryScreen === "agenda" ? demoProviders(rec) : [];
  const appointments: Array<{
    id: string;
    startsAt: Date;
    endsAt: Date;
    status: "PENDING" | "CONFIRMED" | "COMPLETED";
    professionalId: string;
    serviceId: string;
    priceAtBooking: number;
    notes: string | null;
    client: { name: string; phone: string };
    professional: { name: string };
    service: { name: string; price: number };
    box: { name: string };
    payment: { method: string; comprobanteNro: string } | null;
  }> = [];

  if (professionals.length > 0) {
    const catalog = demoCatalog(rec);
    const at = (hhmm: string) => businessWallTimeToUtc(date, hhmm);
    const plus = (d: Date, min: number) => new Date(d.getTime() + min * 60_000);
    const times = ["09:30", "11:00", "12:30", "15:30", "17:00"] as const;
    const statuses = ["CONFIRMED", "CONFIRMED", "COMPLETED", "PENDING", "CONFIRMED"] as const;

    times.forEach((time, i) => {
      const pro = professionals[i % professionals.length];
      const svc = catalog[i % catalog.length];
      const client = CLIENTS[i % CLIENTS.length];
      const status = statuses[i];
      const startsAt = at(time);
      appointments.push({
        id: `demo-appt-${i}`,
        startsAt,
        endsAt: plus(startsAt, 45),
        status,
        professionalId: pro.id,
        serviceId: `demo-svc-${i}`,
        priceAtBooking: svc.price,
        notes: null,
        client: { name: client.name, phone: client.phone },
        professional: { name: pro.name },
        service: { name: svc.name, price: svc.price },
        box: { name: pro.box.name },
        payment:
          status === "COMPLETED"
            ? { method: "EFECTIVO", comprobanteNro: "0003-00000147" }
            : null,
      });
    });
  }

  return {
    professionals: professionals.map((p) => ({ id: p.id, name: p.name, box: p.box })),
    appointments,
    blocksToday: [] as { professional: { name: string }; reason: string }[],
  };
}

// ─────────────────────────────────────────────── Fixtures — Caja / POS ─────

// Caja abierta con un ledger coherente cuyas VENTAs referencian ítems REALES del
// catálogo del rubro (cortes para una carnicería, tratamientos para una estética),
// en vez de nombres fijos de un solo rubro. Se computa por llamada (fechas frescas).
const HOUR_MS = 60 * 60 * 1000;

export function getDemoCajaData(rec: ConsultorRecommendation = activeDemoRecommendation()) {
  const catalog = demoCatalog(rec);
  const now = Date.now();
  const sale = (i: number, fallback: number): DemoItem =>
    catalog[i] ?? { name: rec.itemKind === "servicio" ? "Servicio" : "Venta", price: fallback };
  const s0 = sale(0, 18000);
  const s1 = sale(1, 9500);
  return {
    open: {
      id: "demo-cash-session",
      openingFloat: 20000,
      openedAt: new Date(now - 5 * HOUR_MS),
      openedBy: "user:demo-owner",
      movements: [
        { id: "demo-mov-1", type: "APERTURA", amount: 20000, reason: null as string | null, createdAt: new Date(now - 5 * HOUR_MS) },
        { id: "demo-mov-2", type: "VENTA", amount: s0.price, reason: s0.name, createdAt: new Date(now - 3 * HOUR_MS) },
        { id: "demo-mov-3", type: "VENTA", amount: s1.price, reason: s1.name, createdAt: new Date(now - 2 * HOUR_MS) },
        { id: "demo-mov-4", type: "EGRESO", amount: 4000, reason: "Compra de insumos", createdAt: new Date(now - HOUR_MS) },
      ],
    },
    recentClosed: [
      {
        id: "demo-cash-closed-1",
        closedAt: new Date(now - 24 * HOUR_MS),
        closingExpected: 142300,
        closingCounted: 142300,
        closingDiff: 0,
      },
    ],
  };
}

// ─────────────────────────────────────────── Fixtures — Panel del Dueño ────

const DAY_MS = 24 * 60 * 60 * 1000;
const METHODS: KpiPaymentMethod[] = ["EFECTIVO", "MERCADOPAGO", "TRANSFERENCIA"];

function synthAppt(
  daysAgo: number,
  pro: string,
  amount: number | null,
  method: KpiPaymentMethod,
  clientId: string,
): KpiAppointment {
  const startsAt = new Date(Date.now() - daysAgo * DAY_MS);
  return {
    status: amount ? "COMPLETED" : "NO_SHOW",
    startsAt,
    endsAt: new Date(startsAt.getTime() + 45 * 60_000),
    clientId,
    professionalName: pro,
    payment: amount ? { amount, method } : null,
  };
}

// Arma un período de "operaciones" (turnos cobrados / ventas de mostrador) a
// partir del catálogo y los proveedores del rubro recomendado. Determinista: los
// precios salen del catálogo real, así los KPIs de `computeDeepKpis` (motor puro)
// quedan internamente consistentes para CUALQUIER familia, no solo estética.
// Un ítem cada 6 queda sin cobro (no-show / venta no concretada) para que la
// tasa de fuga no sea trivialmente cero. Los clientes se reciclan de un pool
// chico para que la retención dé algo > 0.
function buildDemoPeriod(rec: ConsultorRecommendation, offsets: number[]): KpiAppointment[] {
  const catalog = demoCatalog(rec);
  const providers = demoProviders(rec);
  return offsets.map((daysAgo, i) => {
    const item = catalog[i % catalog.length];
    const pro = providers[i % providers.length];
    const notPaid = i % 6 === 5;
    const clientId = `demo-client-${i % 4}`;
    return synthAppt(daysAgo, pro.name, notPaid ? null : item.price, METHODS[i % METHODS.length], clientId);
  });
}

// Ventanas del período actual (últimos ~12 días) vs. previo (~16–25 días atrás).
const CURRENT_OFFSETS = [1, 2, 3, 4, 5, 6, 8, 10];
const PREVIOUS_OFFSETS = [16, 19, 22, 25];

export function getDemoReportData(
  rangeDays: number,
  rec: ConsultorRecommendation = activeDemoRecommendation(),
) {
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - rangeDays * DAY_MS);
  const current = buildDemoPeriod(rec, CURRENT_OFFSETS);
  const paid = current.filter((a) => a.payment);

  // Desgloses coherentes calculados sobre el MISMO período que los KPIs, no a
  // mano: por ítem del catálogo (servicio/producto) y por proveedor/canal.
  const byItem = new Map<string, number>();
  const byProvider = new Map<string, number>();
  const catalog = demoCatalog(rec);
  paid.forEach((a, i) => {
    const amount = a.payment!.amount;
    const itemName = catalog[i % catalog.length].name;
    byItem.set(itemName, (byItem.get(itemName) ?? 0) + amount);
    byProvider.set(a.professionalName, (byProvider.get(a.professionalName) ?? 0) + amount);
  });
  const toSorted = (m: Map<string, number>) =>
    Array.from(m.entries())
      .map(([label, total]) => ({ label, total }))
      .sort((a, b) => b.total - a.total);

  const totalIngresos = paid.reduce((s, a) => s + a.payment!.amount, 0);
  return {
    rangeDays,
    desde,
    hasta,
    totalIngresos,
    cantidadPagos: paid.length,
    porDia: [
      { label: desde.toISOString().slice(0, 10), total: Math.round(totalIngresos * 0.42) },
      { label: hasta.toISOString().slice(0, 10), total: Math.round(totalIngresos * 0.58) },
    ],
    // Mismos nombres de campo que `getReportData` real; el contenido lo dicta el
    // rubro (para retail, "por profesional" es el canal/mostrador).
    porProfesional: toSorted(byProvider),
    porServicio: toSorted(byItem),
  };
}

export function getDemoDeepReportData(
  rangeDays: number,
  rec: ConsultorRecommendation = activeDemoRecommendation(),
) {
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - rangeDays * DAY_MS);
  const current = buildDemoPeriod(rec, CURRENT_OFFSETS);
  return {
    rangeDays,
    desde,
    hasta,
    totalTurnos: current.length,
    kpis: computeDeepKpis(current),
  };
}

export function getDemoOwnerPanelData(
  rangeDays: number,
  rec: ConsultorRecommendation = activeDemoRecommendation(),
) {
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - 2 * rangeDays * DAY_MS);
  const currentPeriod = buildDemoPeriod(rec, CURRENT_OFFSETS);
  const previousPeriod = buildDemoPeriod(rec, PREVIOUS_OFFSETS);
  const current = computeDeepKpis(currentPeriod);
  const previous = computeDeepKpis(previousPeriod);

  // Tendencia: 4 meses ficticios con leve mejora mes a mes, reusando el mismo
  // motor puro para que los números sean internamente consistentes.
  const months = [4, 3, 2, 1].map((monthsAgo, i) => {
    const bucket = currentPeriod.map((a) => ({
      ...a,
      startsAt: new Date(a.startsAt.getTime() - monthsAgo * 30 * DAY_MS),
      payment: a.payment ? { ...a.payment, amount: a.payment.amount - i * 800 } : null,
    }));
    const d = new Date(hasta.getFullYear(), hasta.getMonth() - monthsAgo, 1);
    return { month: d.toISOString().slice(0, 7), kpis: computeDeepKpis(bucket) };
  });

  return { rangeDays, desde, hasta, hasPrevious: true, current, previous, months };
}
