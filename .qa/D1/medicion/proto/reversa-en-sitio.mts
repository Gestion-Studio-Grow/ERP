// Si la migración en el lugar se revierte (numeric → float8) con el código NUEVO (Decimal) sirviendo, ¿anda?
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient as Nuevo, Prisma } from "../nueva2/src/generated/prisma/client.ts";
const nuevo = new Nuevo({ adapter: new PrismaPg({ connectionString: "postgresql://postgres@localhost:5433/erp_d1_ensitio" }) });
const r: Record<string, unknown> = {};
try { const c = await nuevo.cashMovement.create({ data: { tenantId: "tA", type: "VENTA", amount: new Prisma.Decimal("1234.56"), createdBy: "x" } }); r.escribe = { valor: c.amount.toString(), decimal: Prisma.Decimal.isDecimal(c.amount) }; }
catch (e) { r.escribe_error = String((e as Error).message).split("\n").filter(Boolean).slice(-1)[0]; }
try { const s = await nuevo.cashMovement.aggregate({ where: { tenantId: "tA" }, _sum: { amount: true } }); r.suma = s._sum.amount?.toString(); }
catch (e) { r.suma_error = String((e as Error).message).split("\n").filter(Boolean).slice(-1)[0]; }
console.log(JSON.stringify(r));
await nuevo.$disconnect();
