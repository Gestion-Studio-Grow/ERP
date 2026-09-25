import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient as Viejo } from "../copia/src/generated/prisma/client.ts";
import { PrismaClient as Nuevo, Prisma } from "../nueva/src/generated/prisma/client.ts";
const url = "postgresql://postgres@localhost:5433/erp_d1_lab";
const viejo = new Viejo({ adapter: new PrismaPg({ connectionString: url }) });
const nuevo = new Nuevo({ adapter: new PrismaPg({ connectionString: url }) });
const r: Record<string, unknown> = {};
const n = await nuevo.cashMovement.create({ data: { tenantId: "tA", type: "VENTA", amount: new Prisma.Decimal("77.70"), createdBy: "nuevo-post" } });
r.nuevo_crea = n.amount.toString();
r.nuevo_suma = (await nuevo.cashMovement.aggregate({ where: { tenantId: "tA" }, _sum: { amount: true } }))._sum.amount?.toString();
try { await viejo.cashMovement.findFirst({ where: { tenantId: "tA" } }); r.viejo_lee = "anduvo"; } catch (e) { r.viejo_lee = "falla: " + String((e as Error).message).split("\n").filter(Boolean).slice(-1)[0].slice(0, 120); }
console.log(JSON.stringify(r));
await viejo.$disconnect(); await nuevo.$disconnect();
