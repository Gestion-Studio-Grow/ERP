// ============================================================================
// SIEMBRA DEL RECORRIDO (MIA-194) — proyectos para llegar a los puntos 2, 3 y 4 del recorrido MIA-193, encima de la
// siembra vacía (`sembrar-e2e.mts`). Sólo base LOCAL (misma guarda). Idempotente: si el negocio ya tiene proyectos, no suma.
//   prueba-uno · USD a 1.200 · «USD aprobado» (APROBADO, cuota de cobro US$ 1.000 que vence a 10 días) y «USD lead»
//               (PRESUPUESTO, sin cuotas): el aprobado tiene que figurar en Administración y Flujo; el lead, no (la regla).
//   prueba-dos  · SIN tipo de cambio · «USD sin cambio» (PRESUPUESTO en USD, un ítem en borrador) y «Pesos sin costo»
//               (venta $ 1.000 a precio fijo, costo 0).
//   DATABASE_URL=<dueña local> npx tsx scripts/proyectos/sembrar-recorrido-e2e.mts
// ============================================================================
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { baseLocalParaSeed } from "../../src/lib/seed/guarda-base";

const guarda = baseLocalParaSeed(process.env.DATABASE_URL);
if (!guarda.ok) throw new Error(`sembrar-recorrido-e2e sólo corre contra una base local. ${guarda.motivo}`);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }) });

const RELOJ = new Date("2026-11-02T10:00:00-03:00"); // el de sembrar-e2e.mts y del servidor (reloj-fijo.mjs)
const DIA = 86_400_000;
const en = (dias: number) => new Date(RELOJ.getTime() + dias * DIA);

type P = { nombre: string; etapa: string; moneda: string; tcVenta: number | null; estado: string; item: { costo: number; precio: number }; cobroUsd?: number };
const PLAN: Record<string, { tc: number | null; proyectos: P[] }> = {
  "prueba-uno": {
    tc: 1200,
    proyectos: [
      { nombre: "USD aprobado", etapa: "APROBADO", moneda: "USD", tcVenta: 1200, estado: "APROBADO", item: { costo: 600_000, precio: 1_200_000 / 1.21 }, cobroUsd: 1000 },
      { nombre: "USD lead", etapa: "PRESUPUESTO", moneda: "USD", tcVenta: null, estado: "BORRADOR", item: { costo: 300_000, precio: 600_000 } },
    ],
  },
  "prueba-dos": {
    tc: null,
    proyectos: [
      { nombre: "USD sin cambio", etapa: "PRESUPUESTO", moneda: "USD", tcVenta: null, estado: "BORRADOR", item: { costo: 0, precio: 0 } },
      { nombre: "Pesos sin costo", etapa: "PRESUPUESTO", moneda: "ARS", tcVenta: null, estado: "BORRADOR", item: { costo: 0, precio: 1000 } },
    ],
  },
};

for (const [slug, plan] of Object.entries(PLAN)) {
  const t = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (!t) throw new Error(`Falta ${slug}: corré antes sembrar-e2e.mts`);
  const tenantId = t.id;
  if ((await prisma.proyecto.count({ where: { tenantId } })) > 0) {
    console.log(`[e2e] ${slug}: ya tenía proyectos, no se suma nada`);
    continue;
  }
  if (plan.tc) await prisma.proyectoTipoCambio.upsert({ where: { tenantId_moneda: { tenantId, moneda: "USD" } }, create: { tenantId, moneda: "USD", porUnidad: plan.tc }, update: { porUnidad: plan.tc } });
  const cliente = await prisma.client.create({ data: { tenantId, name: "Cliente de prueba", phone: "1100000000", createdAt: RELOJ }, select: { id: true } });
  let numero = 0;
  for (const d of plan.proyectos) {
    const p = await prisma.proyecto.create({
      data: { tenantId, numero: ++numero, clientId: cliente.id, nombre: d.nombre, servicio: "EVENTOS", etapa: d.etapa, moneda: d.moneda, fechaArmado: en(18), fechaEvento: en(20), fechaDesarme: en(21), createdAt: RELOJ },
      select: { id: true },
    });
    const pres = await prisma.proyectoPresupuesto.create({ data: { tenantId, proyectoId: p.id, version: 1, estado: d.estado, token: `e2e-${p.id}`, ivaPct: 21, tcVenta: d.tcVenta, aprobadoInternoEl: d.estado === "APROBADO" ? RELOJ : null, createdAt: RELOJ }, select: { id: true } });
    await prisma.proyectoItem.create({ data: { tenantId, presupuestoId: pres.id, rubro: "General", descripcion: "Stand de prueba", cantidad: 1, costo: d.item.costo, precio: d.item.precio } });
    if (d.cobroUsd) await prisma.proyectoCuota.create({ data: { tenantId, proyectoId: p.id, tipo: "COBRO", concepto: "Anticipo de prueba", monto: d.cobroUsd, moneda: "USD", venceEl: en(10), auto: false, prevista: false } });
  }
  const conteo = { proyectos: await prisma.proyecto.count({ where: { tenantId } }), cuotas: await prisma.proyectoCuota.count({ where: { tenantId } }), tc: plan.tc ?? "sin cargar" };
  console.log(`[e2e] ${slug}: proyectos ${conteo.proyectos} · cuotas ${conteo.cuotas} · USD ${conteo.tc}`);
}
await prisma.$disconnect();
