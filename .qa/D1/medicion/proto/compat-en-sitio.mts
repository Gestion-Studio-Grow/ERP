// Porción aplicada (numeric + respaldo _float). Código viejo (Float) y nuevo (Decimal, respaldo @ignore) a la vez.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient as Viejo } from "../copia/src/generated/prisma/client.ts";
import { PrismaClient as Nuevo, Prisma } from "../nueva2/src/generated/prisma/client.ts";
const url = "postgresql://postgres@localhost:5433/erp_d1_ensitio";
const viejo = new Viejo({ adapter: new PrismaPg({ connectionString: url }) });
const nuevo = new Nuevo({ adapter: new PrismaPg({ connectionString: url }) });
const r: Record<string, unknown> = {};
const v = await viejo.cashMovement.create({ data: { tenantId: "tA", type: "VENTA", amount: 0.1 + 0.2, createdBy: "viejo" } });
r.viejo_escribe_y_lee = [v.amount, typeof v.amount];
r.nuevo_lee_lo_del_viejo = (await nuevo.cashMovement.findUniqueOrThrow({ where: { id: v.id } })).amount.toString();
const n = await nuevo.cashMovement.create({ data: { tenantId: "tA", type: "VENTA", amount: "1234.56", createdBy: "nuevo" } });
r.nuevo_escribe = n.amount.toString();
r.viejo_lee_lo_del_nuevo = (await viejo.cashMovement.findUniqueOrThrow({ where: { id: n.id } })).amount;
r.nuevo_ve_respaldo = Object.keys(n).includes("amount_float");
const s = await nuevo.cashMovement.aggregate({ where: { tenantId: "tA" }, _sum: { amount: true } });
r.suma_nuevo = s._sum.amount?.toString();
console.log(JSON.stringify(r));
await viejo.$disconnect(); await nuevo.$disconnect();
