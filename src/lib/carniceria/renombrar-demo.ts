// ============================================================================
// RENOMBRAR «Magra» en mails y comprobantes del negocio `magra` (orden del dueño D11, opción a) —
// núcleo PURO + ejecutor en la transacción. Lo usa prisma/renombrar-magra.ts.
// ============================================================================
//
// DE DÓNDE SACAN EL NOMBRE (relevado el 10/11/2026):
//   · Tenant.name → los tickets del mostrador y de la caja rápida (`nombreVisibleDelNegocio`,
//     src/lib/marca-demo.ts:100, por debajo de la presentación demo), las etiquetas, el paquete del
//     cierre de mes, el reparto y los mails de acuse de las consultas (proyectos/datos.server.ts:38).
//   · MessageTemplate.subject / body, canal EMAIL → el mail de recordatorio (notifications.ts:49-51).
//     El texto lo escribe el negocio: se reemplaza SÓLO la palabra «Magra», nada más.
//   · El comprobante fiscal (PDF de la factura, comprobante-pdf-datos.ts:209-215) toma la razón
//     social, el CUIT, la condición, el domicilio fiscal y el IIBB de Tenant.arca*: datos que viajan
//     o se declaran a ARCA. NO SE CAMBIAN: si dicen «Magra» el plan los LISTA con «no se cambia
//     (fiscal)» para que decida el dueño.
//   Nunca toca slug, subdominio, User, emails de login ni contraseñas.
//
// Reglas del cambio: Tenant.name que contiene «Magra» pasa ENTERO a MARCA_DEMO_GSG.nombre (es el
// nombre del negocio, no un texto); en las plantillas se cambia la palabra «Magra» (con mayúscula,
// palabra entera, fuera de direcciones web o de mail) por ese nombre. Idempotente: el valor nuevo ya
// no dice «Magra», así que la 2.ª corrida no encuentra nada.

import type { Prisma } from "@/generated/prisma/client";
import { MARCA_DEMO_GSG } from "@/lib/marca-demo";
import { DemoAbortada, SLUG_MAGRA, rechazoDeLaGuarda, type ArgsDemo } from "./demo-datos";

type Tx = Prisma.TransactionClient;

/** Quién figura como autor del rastro en AuditLog (sirve para encontrarlo y deshacerlo). */
export const ACTOR_RENOMBRE = "system:renombrar-magra";
/** `action` de las filas de AuditLog del rastro. */
export const ACCION_RENOMBRE = "renombrar-marca-demo";
/** El nombre nuevo: el de la demo GSG, una sola fuente. */
export const NOMBRE_NUEVO: string = MARCA_DEMO_GSG.nombre;

/** Campos fiscales del negocio que se miran (y nunca se cambian). */
export const CAMPOS_FISCALES = ["arcaRazonSocial", "arcaDomicilioFiscal", "bancosDomicilioEmisor", "arcaIibb"] as const;
type CampoFiscal = (typeof CAMPOS_FISCALES)[number];

export type EstadoRenombre = {
  tenant: { id: string; name: string } & Record<CampoFiscal, string | null>;
  plantillasMail: { id: string; subject: string | null; body: string }[];
};

export type Cambio = { tabla: "Tenant" | "MessageTemplate"; id: string; campo: string; viejo: string; nuevo: string };
export type Fiscal = { tabla: "Tenant"; id: string; campo: CampoFiscal; actual: string };
export type PlanRenombre = { cambios: Cambio[]; fiscales: Fiscal[] };

// «Magra» como palabra, con mayúscula, y no dentro de una dirección (magra.gsg…, @Magra, /Magra).
const PALABRA = /(?<![\p{L}\p{N}_@./])Magra(?![\p{L}\p{N}_@]|\.[\p{L}\p{N}])/gu;

/** PURA. ¿El texto nombra a Magra (según la regla de la palabra)? */
export function nombraMagra(s: string | null | undefined): boolean {
  return !!s && new RegExp(PALABRA.source, PALABRA.flags).test(s);
}

/** PURA. Cambia cada «Magra» del texto por el nombre nuevo; el resto queda igual. */
export function reemplazarMagra(s: string, nombre: string = NOMBRE_NUEVO): string {
  return s.replace(new RegExp(PALABRA.source, PALABRA.flags), nombre);
}

/** PURA. Qué se cambia (y qué fiscal se ve y no se toca) a partir de lo leído. */
export function planRenombre(e: EstadoRenombre, nombre: string = NOMBRE_NUEVO): PlanRenombre {
  const cambios: Cambio[] = [];
  const t = e.tenant;
  if (nombraMagra(t.name) && t.name !== nombre) cambios.push({ tabla: "Tenant", id: t.id, campo: "name", viejo: t.name, nuevo: nombre });
  for (const p of [...e.plantillasMail].sort((a, b) => a.id.localeCompare(b.id))) {
    if (p.subject && nombraMagra(p.subject)) {
      cambios.push({ tabla: "MessageTemplate", id: p.id, campo: "subject", viejo: p.subject, nuevo: reemplazarMagra(p.subject, nombre) });
    }
    if (nombraMagra(p.body)) cambios.push({ tabla: "MessageTemplate", id: p.id, campo: "body", viejo: p.body, nuevo: reemplazarMagra(p.body, nombre) });
  }
  const fiscales: Fiscal[] = [];
  for (const campo of CAMPOS_FISCALES) {
    const v = t[campo];
    if (v && nombraMagra(v)) fiscales.push({ tabla: "Tenant", id: t.id, campo, actual: v });
  }
  return { cambios, fiscales };
}

export const planSinCambios = (p: PlanRenombre): boolean => p.cambios.length === 0;

const entre = (s: string) => `«${s.replace(/\r?\n/g, "⏎")}»`;

/** PURA. Una línea por fila: tabla · id · campo · «viejo» → «nuevo». Nunca URLs de conexión ni secretos. */
export function describirPlanRenombre(p: PlanRenombre): string[] {
  return [
    ...p.cambios.map((c) => `${c.tabla} · ${c.id} · ${c.campo} · ${entre(c.viejo)} → ${entre(c.nuevo)}`),
    ...p.fiscales.map((f) => `${f.tabla} · ${f.id} · ${f.campo} · ${entre(f.actual)} · no se cambia (fiscal): decide el dueño`),
    planSinCambios(p) ? "Nada que cambiar: mails y comprobantes ya no dicen «Magra»." : "",
  ].filter(Boolean);
}

// ── Base ──────────────────────────────────────────────────────────────────────

/** Lo que hay (sólo lecturas, con el `tenantId` escrito en cada consulta). */
export async function leerEstadoRenombreEnTx(tx: Tx, tenantId: string): Promise<EstadoRenombre> {
  const tenant = await tx.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, arcaRazonSocial: true, arcaDomicilioFiscal: true, bancosDomicilioEmisor: true, arcaIibb: true },
  });
  if (!tenant) throw new DemoAbortada("El negocio desapareció durante la corrida. Abortado sin escribir.");
  const plantillasMail = await tx.messageTemplate.findMany({
    where: { tenantId, channel: "EMAIL" },
    select: { id: true, subject: true, body: true },
    orderBy: { id: "asc" },
  });
  return { tenant, plantillasMail };
}

/**
 * Escribe el plan en la transacción del llamador. Cada UPDATE exige el valor viejo (si alguien lo
 * cambió entre la lectura y la escritura, aborta entero) y deja su fila en AuditLog con
 * `changes = { campo: { antes, despues } }`: el `antes` es el rollback.
 */
export async function aplicarRenombreEnTx(tx: Tx, tenantId: string, plan: PlanRenombre): Promise<number> {
  const porFila = new Map<string, Cambio[]>();
  for (const c of plan.cambios) porFila.set(`${c.tabla}:${c.id}`, [...(porFila.get(`${c.tabla}:${c.id}`) ?? []), c]);

  for (const cambios of porFila.values()) {
    const { tabla, id } = cambios[0];
    const donde = Object.fromEntries(cambios.map((c) => [c.campo, c.viejo]));
    const datos = Object.fromEntries(cambios.map((c) => [c.campo, c.nuevo]));
    if (tabla === "Tenant" && id !== tenantId) throw new DemoAbortada(`El plan apunta a otro negocio (${id}). Abortado sin escribir.`);
    const r =
      tabla === "Tenant"
        ? await tx.tenant.updateMany({ where: { id: tenantId, slug: SLUG_MAGRA, ...donde }, data: datos })
        : await tx.messageTemplate.updateMany({ where: { id, tenantId, channel: "EMAIL", ...donde }, data: datos });
    if (r.count !== 1) throw new DemoAbortada(`${tabla} ${id} cambió durante la corrida. Abortado sin escribir nada.`);
    await tx.auditLog.create({
      data: {
        tenantId,
        actor: ACTOR_RENOMBRE,
        action: ACCION_RENOMBRE,
        entity: tabla,
        entityId: id,
        channel: "admin",
        changes: Object.fromEntries(cambios.map((c) => [c.campo, { antes: c.viejo, despues: c.nuevo }])),
      },
    });
  }
  return plan.cambios.length;
}

export type ResultadoRenombre = { tenantId: string; plan: PlanRenombre; cambiados: number | null };

/**
 * La corrida entera: guarda (slug EXACTO `magra`; escribir exige --aplicar + CONFIRMO_TENANT=magra)
 * → negocio por slug → UNA tenantTransaction (lee, planifica y, si corresponde, escribe).
 * Importa la base adentro: los tests puros no levantan un cliente de Prisma.
 */
export async function ejecutarRenombreMagra(args: ArgsDemo): Promise<ResultadoRenombre> {
  const rechazo = rechazoDeLaGuarda(args);
  if (rechazo) throw new DemoAbortada(rechazo);
  const { basePrisma } = await import("@/lib/prisma-base");
  const { tenantTransaction } = await import("@/lib/rls");

  const tenant = await basePrisma.tenant.findUnique({ where: { slug: args.slug }, select: { id: true, slug: true } });
  if (!tenant || tenant.slug !== SLUG_MAGRA) throw new DemoAbortada(`No existe un negocio con slug "${args.slug}". Abortado.`);

  return tenantTransaction(
    async (tx) => {
      const plan = planRenombre(await leerEstadoRenombreEnTx(tx, tenant.id));
      const cambiados = args.aplicar && !planSinCambios(plan) ? await aplicarRenombreEnTx(tx, tenant.id, plan) : null;
      return { tenantId: tenant.id, plan, cambiados };
    },
    { tenantId: tenant.id, timeoutMs: 60_000 },
  );
}
