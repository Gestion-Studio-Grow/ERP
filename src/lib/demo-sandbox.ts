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
import { computeDeepKpis, type KpiAppointment } from "@/lib/report-kpis";
import { isDemoSandbox, DEMO_TENANT_ID } from "@/lib/demo-flag";

export { isDemoSandbox, DEMO_TENANT_ID };

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

// ─────────────────────────── Fixtures — Agenda & Servicios (rubro piloto) ───

const PROS = [
  { id: "demo-pro-1", name: "Caro", box: { name: "Box 1" } },
  { id: "demo-pro-2", name: "Sofi", box: { name: "Box 2" } },
];

const SERVICES = [
  { id: "demo-svc-facial", name: "Limpieza facial", price: 18000 },
  { id: "demo-svc-laser", name: "Depilación láser", price: 22000 },
  { id: "demo-svc-masaje", name: "Masaje descontracturante", price: 20000 },
  { id: "demo-svc-pestanas", name: "Lifting de pestañas", price: 15000 },
  { id: "demo-svc-manicura", name: "Manicura semi", price: 9000 },
];

const CLIENTS = [
  { name: "Marina G.", phone: "11-5555-0101" },
  { name: "Lucía P.", phone: "11-5555-0102" },
  { name: "Ana R.", phone: "11-5555-0103" },
  { name: "Sofía M.", phone: "11-5555-0104" },
  { name: "Belén T.", phone: "11-5555-0105" },
];

// Devuelve el mismo negocio ficticio "lleno" sin importar qué día se navegue
// (siempre se ve un día de trabajo real, no un calendario vacío).
export function getDemoAgendaDay(date: string) {
  const at = (hhmm: string) => businessWallTimeToUtc(date, hhmm);
  const plus = (d: Date, min: number) => new Date(d.getTime() + min * 60_000);

  const slots: Array<{
    time: string;
    pro: (typeof PROS)[number];
    svc: (typeof SERVICES)[number];
    client: (typeof CLIENTS)[number];
    status: "PENDING" | "CONFIRMED" | "COMPLETED";
  }> = [
    { time: "09:30", pro: PROS[0], svc: SERVICES[0], client: CLIENTS[0], status: "CONFIRMED" },
    { time: "11:00", pro: PROS[1], svc: SERVICES[1], client: CLIENTS[1], status: "CONFIRMED" },
    { time: "12:30", pro: PROS[0], svc: SERVICES[2], client: CLIENTS[2], status: "COMPLETED" },
    { time: "15:30", pro: PROS[1], svc: SERVICES[3], client: CLIENTS[3], status: "PENDING" },
    { time: "17:00", pro: PROS[0], svc: SERVICES[4], client: CLIENTS[4], status: "CONFIRMED" },
  ];

  const appointments = slots.map((s, i) => {
    const startsAt = at(s.time);
    return {
      id: `demo-appt-${i}`,
      startsAt,
      endsAt: plus(startsAt, 45),
      status: s.status,
      professionalId: s.pro.id,
      serviceId: s.svc.id,
      priceAtBooking: s.svc.price,
      notes: null as string | null,
      client: { name: s.client.name, phone: s.client.phone },
      professional: { name: s.pro.name },
      service: { name: s.svc.name, price: s.svc.price },
      box: { name: s.pro.box.name },
      payment:
        s.status === "COMPLETED"
          ? { method: "EFECTIVO", comprobanteNro: "0003-00000147" }
          : null,
    };
  });

  return {
    professionals: PROS.map((p) => ({ id: p.id, name: p.name, box: p.box })),
    appointments,
    blocksToday: [] as { professional: { name: string }; reason: string }[],
  };
}

// ─────────────────────────────────────────────── Fixtures — Caja / POS ─────

export const DEMO_CAJA_DATA = {
  open: {
    id: "demo-cash-session",
    openingFloat: 20000,
    openedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
    openedBy: "user:demo-owner",
    movements: [
      { id: "demo-mov-1", type: "APERTURA", amount: 20000, reason: null, createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000) },
      { id: "demo-mov-2", type: "VENTA", amount: 18000, reason: "Limpieza facial", createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000) },
      { id: "demo-mov-3", type: "VENTA", amount: 9500, reason: "Sérum vitamina C", createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      { id: "demo-mov-4", type: "EGRESO", amount: 4000, reason: "Compra de insumos", createdAt: new Date(Date.now() - 60 * 60 * 1000) },
    ],
  },
  recentClosed: [
    {
      id: "demo-cash-closed-1",
      closedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      closingExpected: 142300,
      closingCounted: 142300,
      closingDiff: 0,
    },
  ],
};

// ─────────────────────────────────────────── Fixtures — Panel del Dueño ────

const DAY_MS = 24 * 60 * 60 * 1000;

function synthAppt(daysAgo: number, pro: string, amount: number | null, method?: string): KpiAppointment {
  const startsAt = new Date(Date.now() - daysAgo * DAY_MS);
  return {
    status: amount ? "COMPLETED" : "NO_SHOW",
    startsAt,
    endsAt: new Date(startsAt.getTime() + 45 * 60_000),
    clientId: `demo-client-${daysAgo}-${pro}`,
    professionalName: pro,
    payment: amount ? { amount, method: method ?? "EFECTIVO" } : null,
  } as KpiAppointment;
}

// Período actual (últimos ~12 días) vs. previo, con un mix de cobros/no-show,
// suficiente para que `computeDeepKpis` (motor real y puro) devuelva números
// coherentes en vez de un dato inventado a mano.
const CURRENT_PERIOD = [
  synthAppt(1, "Caro", 18000, "TRANSFERENCIA"),
  synthAppt(2, "Sofi", 22000, "MERCADOPAGO"),
  synthAppt(3, "Caro", 20000, "EFECTIVO"),
  synthAppt(4, "Sofi", 15000, "EFECTIVO"),
  synthAppt(5, "Caro", 9000, "MERCADOPAGO"),
  synthAppt(6, "Sofi", null),
  synthAppt(8, "Caro", 18000, "EFECTIVO"),
  synthAppt(10, "Sofi", 22000, "TRANSFERENCIA"),
];

const PREVIOUS_PERIOD = [
  synthAppt(16, "Caro", 17000, "EFECTIVO"),
  synthAppt(19, "Sofi", 20000, "MERCADOPAGO"),
  synthAppt(22, "Caro", null),
  synthAppt(25, "Sofi", 21000, "EFECTIVO"),
];

export function getDemoReportData(rangeDays: number) {
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - rangeDays * DAY_MS);
  return {
    rangeDays,
    desde,
    hasta,
    totalIngresos: 312400,
    cantidadPagos: 18,
    porDia: [
      { label: desde.toISOString().slice(0, 10), total: 42000 },
      { label: hasta.toISOString().slice(0, 10), total: 58000 },
    ],
    porProfesional: [
      { label: "Caro", total: 172400 },
      { label: "Sofi", total: 140000 },
    ],
    porServicio: [
      { label: "Limpieza facial", total: 90000 },
      { label: "Depilación láser", total: 88000 },
      { label: "Masaje descontracturante", total: 60000 },
    ],
  };
}

export function getDemoDeepReportData(rangeDays: number) {
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - rangeDays * DAY_MS);
  return {
    rangeDays,
    desde,
    hasta,
    totalTurnos: CURRENT_PERIOD.length,
    kpis: computeDeepKpis(CURRENT_PERIOD),
  };
}

export function getDemoOwnerPanelData(rangeDays: number) {
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - 2 * rangeDays * DAY_MS);
  const current = computeDeepKpis(CURRENT_PERIOD);
  const previous = computeDeepKpis(PREVIOUS_PERIOD);

  // Tendencia: 4 meses ficticios con leve mejora mes a mes, reusando el mismo
  // motor puro para que los números sean internamente consistentes.
  const months = [4, 3, 2, 1].map((monthsAgo, i) => {
    const bucket = CURRENT_PERIOD.map((a) => ({
      ...a,
      startsAt: new Date(a.startsAt.getTime() - monthsAgo * 30 * DAY_MS),
      payment: a.payment ? { ...a.payment, amount: a.payment.amount - i * 800 } : null,
    }));
    const d = new Date(hasta.getFullYear(), hasta.getMonth() - monthsAgo, 1);
    return { month: d.toISOString().slice(0, 7), kpis: computeDeepKpis(bucket) };
  });

  return { rangeDays, desde, hasta, hasPrevious: true, current, previous, months };
}
