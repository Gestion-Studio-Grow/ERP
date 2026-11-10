// ============================================================================
// SEED QA — Etapa 2 de Proyectos. Datos 100 % FICTICIOS para el recorrido clic por clic de
// T2 (facturación/cuotas), T3 (importador), T4 (topes de IA) y T5 (portal del cliente).
// ============================================================================
//
// 🔴 SÓLO BASE LOCAL. La guarda de abajo corta si DATABASE_URL no apunta a esta máquina: jamás corre
//    contra Neon. Uso: `npm run seed:qa-etapa2`.
//
// Nombres inventados y CUIT con dígito verificador INVÁLIDO a propósito (no existen en ARCA).
// Idempotente: re-correrlo deja el mismo estado (borra y vuelve a crear lo propio del negocio QA).
//
// Ingreso de prueba (NO son credenciales reales; sólo existen en la base local):
//   dueño: admin@qa-etapa2.demo · empleado: equipo@qa-etapa2.demo
//   la clave sale de QA_ETAPA2_PASSWORD (default abajo).

import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/lib/auth-password";
import { defaultModulesForBlueprint } from "../src/blueprints/presets-meta";
import { baseLocalParaSeed } from "../src/lib/seed/guarda-base";
import { provisionTenant } from "../scripts/provision-tenant";
import { CLAVE_ETAPA2, PARTES_ETAPA2 } from "../src/lib/proyectos/etapa2-core";
import { mesDeIA } from "../src/lib/proyectos/ia-tope-core";

const guarda = baseLocalParaSeed(process.env.DATABASE_URL);
if (!guarda.ok) {
  console.error(`❌ seed-qa-etapa2 sólo corre contra una base local. ${guarda.motivo}`);
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: Number(process.env.SEED_DB_MAX ?? 0) || undefined });
const prisma = new PrismaClient({ adapter });

const SLUG = "qa-etapa2";
const CLAVE = process.env.QA_ETAPA2_PASSWORD ?? "qa-etapa2-2026";
const DIA = 86_400_000;
const en = (dias: number) => new Date(Date.now() + dias * DIA);
const token = () => randomBytes(18).toString("base64url");

/** CUIT ficticio con prefijo 20-000000xx y dígito verificador deliberadamente INCORRECTO. */
function cuitFicticio(n: number): string {
  const base = `200000000${String(n).padStart(2, "0")}`.slice(0, 10);
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = base.split("").reduce((s, d, i) => s + Number(d) * pesos[i], 0);
  const dv = 11 - (suma % 11);
  const correcto = dv === 11 ? 0 : dv === 10 ? 9 : dv;
  return `${base}${(correcto + 1) % 10}`;
}

async function main() {
  const r = await provisionTenant(prisma, {
    name: "Productora QA Etapa 2 (ficticia)",
    slug: SLUG,
    owner: { name: "Dueña QA", email: `admin@${SLUG}.demo`, password: CLAVE },
    blueprint: "productora",
    branding: { shortLabel: "Negocio de prueba para QA", contactNote: "Datos ficticios." },
    platform: { status: "ACTIVE", subdomain: SLUG, modules: defaultModulesForBlueprint("productora"), accentPreset: "azul", frontTheme: "light" },
  });
  const tenantId = r.tenantId;

  // Interruptores de Etapa 2: se leen de Tenant.modules (etapa2-core.ts). Se suman SÓLO a este negocio.
  const t = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { modules: true } });
  const claves = PARTES_ETAPA2.map((p) => CLAVE_ETAPA2[p]);
  await prisma.tenant.update({ where: { id: tenantId }, data: { modules: Array.from(new Set([...t.modules, ...claves])) } });

  // Empleado de prueba.
  const emailEquipo = `equipo@${SLUG}.demo`;
  if (!(await prisma.user.findFirst({ where: { tenantId, email: emailEquipo } }))) {
    await prisma.user.create({ data: { tenantId, name: "Empleado QA", email: emailEquipo, passwordHash: await hashPassword(CLAVE), role: "PROFESSIONAL" } });
  }

  await prisma.proyectoConfig.upsert({
    where: { tenantId },
    create: { tenantId, margenPct: 30, validezDias: 15, ivaPct: 21, condiciones: "Valores ficticios de prueba." },
    update: {},
  });

  // Re-sembrado limpio de lo propio del módulo (idempotente).
  await prisma.proyectoCuota.deleteMany({ where: { tenantId } });
  await prisma.cashMovement.deleteMany({ where: { tenantId, proyectoPagoId: { not: null } } });
  await prisma.proyectoPago.deleteMany({ where: { tenantId } });
  await prisma.proyecto.deleteMany({ where: { tenantId } });

  // Clientes ficticios (buscar o crear por nombre).
  const cliente = async (name: string, phone: string, n: number) =>
    (await prisma.client.findFirst({ where: { tenantId, name } })) ??
    prisma.client.create({ data: { tenantId, name, phone, email: `cliente${n}@${SLUG}.demo`, docTipo: 80, docNro: cuitFicticio(n) } });
  const c1 = await cliente("Eventos Brújula (ficticio)", "1150009001", 1);
  const c2 = await cliente("Láminas del Plata (ficticio)", "1150009002", 2);
  const c3 = await cliente("Fundación Faro Norte (ficticia)", "1150009003", 3);
  const c4 = await cliente("Distribuidora Ombú (ficticia)", "1150009004", 4);
  const c5 = await cliente("Estudio Ceibo (ficticio)", "1150009005", 5);

  const proyecto = (numero: number, clientId: string, nombre: string, servicio: string, etapa: string, extra: Record<string, unknown> = {}) =>
    prisma.proyecto.create({ data: { tenantId, numero, clientId, nombre, servicio, etapa, brief: "Proyecto de prueba (ficticio).", ...extra } });

  const p1 = await proyecto(1, c1.id, "Stand en feria de prueba", "ARQUITECTURA", "PRODUCCION", { fechaEvento: en(20), presupuestoEstimado: 4_000_000 });
  const p2 = await proyecto(2, c2.id, "Lanzamiento de producto (QA)", "EVENTOS", "APROBADO", { fechaEvento: en(45), presupuestoEstimado: 2_500_000 });
  const p3 = await proyecto(3, c3.id, "Gala anual (QA, en dólares)", "EVENTOS", "PROPUESTA", { fechaEvento: en(60), moneda: "USD", presupuestoEstimado: 12_000 });
  const p4 = await proyecto(4, c4.id, "Video de marca (QA)", "CONTENIDOS", "PEDIDO");
  const p5 = await proyecto(5, c5.id, "Activación cerrada (QA)", "EXPERIENCIAS", "CIERRE", { fechaEvento: en(-30), presupuestoEstimado: 1_800_000 });
  await proyecto(6, c4.id, "Branding perdido (QA)", "BRANDING", "PEDIDO", { perdidoEl: en(-10), motivoPerdida: "Eligió otra agencia (ficticio)." });

  // Cuotas: pagadas, vencidas, por vencer, en USD, y un pago a proveedor de la empresa.
  const cuota = (clave: string, proyectoId: string | null, tipo: "COBRO" | "PAGO", concepto: string, monto: number, venceEl: Date, extra: Record<string, unknown> = {}) =>
    prisma.proyectoCuota.create({ data: { tenantId, clave: `qa:${clave}`, proyectoId, tipo, concepto, monto, venceEl, ...extra } });
  await cuota("p1-anticipo", p1.id, "COBRO", "Stand en feria — anticipo", 2_000_000, en(-15), { pagadoEl: en(-14), pagadoPor: "Dueña QA", medio: "TRANSFERENCIA" });
  await cuota("p1-saldo", p1.id, "COBRO", "Stand en feria — saldo", 2_000_000, en(5));
  await cuota("p2-anticipo", p2.id, "COBRO", "Lanzamiento — anticipo", 1_250_000, en(-7));
  await cuota("p2-saldo", p2.id, "COBRO", "Lanzamiento — saldo", 1_250_000, en(40));
  await cuota("p3-anticipo", p3.id, "COBRO", "Gala anual — anticipo (USD)", 6_000, en(10), { moneda: "USD" });
  await cuota("p3-saldo", p3.id, "COBRO", "Gala anual — saldo (USD)", 6_000, en(55), { moneda: "USD", prevista: true });
  await cuota("p5-unico", p5.id, "COBRO", "Activación — pago único", 1_800_000, en(-35), { pagadoEl: en(-31), pagadoPor: "Dueña QA", medio: "MERCADOPAGO" });
  await cuota("empresa-alquiler", null, "PAGO", "Alquiler del depósito (ficticio)", 450_000, en(3));

  // Portal del cliente (T5) para el cliente 1.
  await prisma.portalCliente.upsert({
    where: { tenantId_clientId: { tenantId, clientId: c1.id } },
    create: { tenantId, clientId: c1.id, token: token(), creadoPor: "Dueña QA" },
    update: {},
  });

  // Tope de IA (T4) en 0 y un consumo del mes (sólo llamadas gratis).
  await prisma.iaTope.upsert({
    where: { tenantId },
    create: { tenantId, topeMensualMicroUsd: BigInt(0), actualizadoPor: "seed-qa-etapa2" },
    update: { topeMensualMicroUsd: BigInt(0), actualizadoPor: "seed-qa-etapa2" },
  });
  const mes = mesDeIA(new Date());
  await prisma.iaConsumo.upsert({
    where: { tenantId_mes: { tenantId, mes } },
    create: { tenantId, mes, llamadas: 3, llamadasGratis: 3 },
    update: { llamadas: 3, llamadasGratis: 3, reservadoMicroUsd: BigInt(0), gastadoMicroUsd: BigInt(0) },
  });

  console.log(`✅ QA Etapa 2 listo (${tenantId}). Ingreso: admin@${SLUG}.demo · equipo@${SLUG}.demo`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
