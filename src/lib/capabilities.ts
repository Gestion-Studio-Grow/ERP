// Modelo de capacidades RBAC (ADR-017 §2.b/§2.e) — DATO PURO, sin dependencias de
// servidor. Este módulo lo importan tanto los helpers server-side (`authz.ts`)
// como componentes de cliente (AdminShell, para ocultar navegación por rol). Por
// eso NO puede importar `next/headers`, Prisma ni `session.ts`: nada que arrastre
// código de servidor al bundle del cliente.
//
// El mapa rol→capacidades vive acá, en código, no en la base (ADR-017 §2.e: "el
// mapa rol→permisos vive en código"). Ocultar un botón en el front es UX; la
// seguridad real es el chequeo server-side de `requireCapability` (authz.ts).

export type Role = "OWNER" | "RECEPTION" | "PROFESSIONAL";

export type Capability =
  | "dashboard:read"
  | "agenda:read"
  | "agenda:manage" // crear/mover/cancelar turnos, cobrar
  | "agenda:complete" // marcar completado / no-show
  | "clients:read"
  | "clients:manage"
  | "catalog:read"
  | "catalog:manage"
  | "coupons:manage"
  | "reminders:manage"
  | "reviews:manage"
  | "reports:read"
  | "audit:read"
  | "users:manage"
  | "location:manage" // editar ubicación/contacto del negocio (módulo Localización)
  | "commissions:manage"; // liquidar comisiones a profesionales (marcar período como pagado)

// Todas las capacidades — OWNER las tiene todas (absorbe el "admin" de hoy,
// ADR-017 §2.b). Mantener esta lista sincronizada con el union `Capability`.
export const ALL_CAPABILITIES: Capability[] = [
  "dashboard:read",
  "agenda:read",
  "agenda:manage",
  "agenda:complete",
  "clients:read",
  "clients:manage",
  "catalog:read",
  "catalog:manage",
  "coupons:manage",
  "reminders:manage",
  "reviews:manage",
  "reports:read",
  "audit:read",
  "users:manage",
  "location:manage",
  "commissions:manage",
];

// Mapa rol → capacidades (ADR-017 §2.b, tabla de roles).
// - OWNER: todo (config, precios, reportes, gestión de usuarios).
// - RECEPTION: día a día operativo — agenda (ver/gestionar/cerrar), alta de
//   clientes y cobrar. NO ve reportes financieros ni edita catálogo/precios/
//   config (ADR-017: "No ve reportes financieros ni edita precios/config").
//   Supuesto de esta fase: catálogo, cupones, recordatorios, reseñas, auditoría,
//   usuarios, localización y liquidación de comisiones quedan solo-OWNER — el ADR
//   solo garantiza a RECEPTION agenda +
//   clientes + cobrar; el resto se mantiene en OWNER por ser lo más simple y
//   defendible. Si más adelante la recepción necesita alguna de esas, se agrega
//   la capability al arreglo (un renglón), sin tocar los guardas.
// - PROFESSIONAL: solo su propia agenda — leer y marcar completado/no-show. El
//   scoping a su `professionalId` se hace en el loader (getAgendaDay) y en las
//   acciones de cierre; la capability solo habilita la clase de acción.
export const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  OWNER: ALL_CAPABILITIES,
  RECEPTION: [
    "dashboard:read",
    "agenda:read",
    "agenda:manage",
    "agenda:complete",
    "clients:read",
    "clients:manage",
  ],
  PROFESSIONAL: ["agenda:read", "agenda:complete"],
};

export function roleHasCapability(role: Role, cap: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(cap);
}

// Ruta "home" de cada rol — a dónde mandarlo cuando entra al panel o cuando
// pide una página que su rol no puede ver. La home de cada rol SIEMPRE está
// dentro de sus capacidades (dashboard para OWNER/RECEPTION, agenda para
// PROFESSIONAL), así el redirect de `requireCapability` nunca cae en un loop.
export function homeRoute(role: Role): string {
  return role === "PROFESSIONAL" ? "/admin/turnos" : "/admin";
}
