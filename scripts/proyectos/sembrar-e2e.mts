// ============================================================================
// SIEMBRA E2E (MIA-193) — 3 productoras VACÍAS «de prueba», idempotente. Sólo base local.
// ============================================================================
//
// Lo corre `scripts/proyectos/ambiente-e2e.mjs` como `neondb_owner`. Cada negocio sale del mismo alta que usa
// la consola (`provisionTenant`, rubro productora) y queda en cero: caja 0, banco 0, sin proyectos, sueldos 0.
// Una cuenta de banco en 0. Una persona por rol de Proyectos (Dirección, Administración, Producción, Producción de campo), con su cuenta.
// Reloj fijo: las altas llevan RELOJ como fecha (el navegador se fija aparte, en el recorrido).
// Re-correrla no suma filas: usuarios y fichas se buscan por (negocio, email).
//
// Ingreso de prueba (NO son credenciales reales; sólo existen en la base local): <rol>@<slug>.test · clave CLAVE.

import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../../src/lib/auth-password";
import { defaultModulesForBlueprint } from "../../src/blueprints/presets-meta";
import { baseLocalParaSeed } from "../../src/lib/seed/guarda-base";
import { provisionTenant } from "../provision-tenant";

const guarda = baseLocalParaSeed(process.env.DATABASE_URL);
if (!guarda.ok) throw new Error(`sembrar-e2e sólo corre contra una base local. ${guarda.motivo}`);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }) });

export const CLAVE = process.env.E2E_PASSWORD ?? "clave-e2e-2026";
export const RELOJ = new Date("2026-11-02T10:00:00-03:00");
const NEGOCIOS = [
  { slug: "prueba-uno", name: "Productora Uno (de prueba)" },
  { slug: "prueba-dos", name: "Productora Dos (de prueba)" },
  { slug: "prueba-tres", name: "Productora Tres (de prueba)" },
];
// [local del email, nombre, rol en el ERP, rol de la ficha]. Administración es Dueño en el ERP: Facturación lo exige.
const EQUIPO = [
  ["direccion", "Dirección de prueba", "OWNER", "DIRECCION"],
  ["administracion", "Administración de prueba", "OWNER", "ADMINISTRACION"],
  ["produccion", "Producción de prueba", "PROFESSIONAL", "PRODUCCION"],
  ["campo", "Campo de prueba", "PROFESSIONAL", "PRODUCCION_CAMPO"],
] as const;

const hash = await hashPassword(CLAVE);
for (const n of NEGOCIOS) {
  const email = (local: string) => `${local}@${n.slug}.test`;
  const r = await provisionTenant(prisma, {
    name: n.name,
    slug: n.slug,
    owner: { name: EQUIPO[0][1], email: email("direccion"), password: CLAVE },
    blueprint: "productora",
    platform: { status: "ACTIVE", subdomain: n.slug, modules: defaultModulesForBlueprint("productora"), accentPreset: "azul", frontTheme: "light" },
  });
  const tenantId = r.tenantId;
  // Como la consola al prender «Trabaja por apps» (igual que la demo de MIA).
  if (!(await prisma.auditLog.findFirst({ where: { tenantId, entity: "Interruptor", entityId: "inicio-por-apps" } })))
    await prisma.auditLog.create({ data: { tenantId, actor: "operator:e2e-local", action: "interruptor.encender", entity: "Interruptor", entityId: "inicio-por-apps", channel: "operador", changes: {}, createdAt: RELOJ } });

  for (const [local, nombre, role, rol] of EQUIPO) {
    // Base local de prueba: sin cambio de clave obligatorio, para que el recorrido entre directo.
    const u =
      (await prisma.user.findFirst({ where: { tenantId, email: email(local) }, select: { id: true } })) ??
      (await prisma.user.create({ data: { tenantId, name: nombre, email: email(local), passwordHash: hash, role, createdAt: RELOJ }, select: { id: true } }));
    await prisma.user.update({ where: { id: u.id }, data: { mustChangePassword: false, passwordHash: hash } });
    const ficha = await prisma.proyectoPersona.findFirst({ where: { tenantId, userId: u.id }, select: { id: true } });
    if (ficha) await prisma.proyectoPersona.update({ where: { id: ficha.id }, data: { rol, sueldoBase: 0, nombre, puesto: nombre.replace(" de prueba", "") } });
    else await prisma.proyectoPersona.create({ data: { tenantId, userId: u.id, nombre, email: email(local), rol, puesto: nombre.replace(" de prueba", ""), sueldoBase: 0, createdAt: RELOJ } });
  }

  // Una cuenta de banco en 0 (PLAN-MIA-50-E2E-VEEDOR § 1): «banco» es su saldo, el neto del libro.
  if (!(await prisma.proyectoCuentaBanco.findFirst({ where: { tenantId } })))
    await prisma.proyectoCuentaBanco.create({ data: { tenantId, nombre: "Cuenta de prueba", moneda: "ARS", saldo: 0, createdAt: RELOJ } });

  const conteo = {
    usuarios: await prisma.user.count({ where: { tenantId } }),
    owners: await prisma.user.count({ where: { tenantId, role: "OWNER" } }),
    fichas: await prisma.proyectoPersona.count({ where: { tenantId } }),
    proyectos: await prisma.proyecto.count({ where: { tenantId } }),
    caja: await prisma.cashMovement.count({ where: { tenantId } }),
    cuentas: await prisma.proyectoCuentaBanco.count({ where: { tenantId } }),
    saldo: (await prisma.proyectoCuentaBanco.aggregate({ where: { tenantId }, _sum: { saldo: true } }))._sum.saldo ?? 0,
    movBanco: await prisma.proyectoMovBanco.count({ where: { tenantId } }),
    sueldos: await prisma.proyectoPersona.count({ where: { tenantId, sueldoBase: { not: 0 } } }),
  };
  console.log(`[e2e] ${n.slug}: ${r.tenantCreated ? "alta" : "ya estaba"} · usuarios ${conteo.usuarios} (OWNER ${conteo.owners}) · fichas ${conteo.fichas} · proyectos ${conteo.proyectos} · movimientos de caja ${conteo.caja} · cuentas de banco ${conteo.cuentas} (saldo ${conteo.saldo}, movimientos ${conteo.movBanco}) · sueldos≠0 ${conteo.sueldos}`);
}
await prisma.$disconnect();
