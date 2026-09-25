// Alternativa descartada: cambiar el tipo de la columna en el lugar. ¿Qué ve el código viejo (Float)?
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient as Viejo } from "../copia/src/generated/prisma/client.ts";
const viejo = new Viejo({ adapter: new PrismaPg({ connectionString: "postgresql://postgres@localhost:5433/erp_d1_plan" }) });
const r: Record<string, unknown> = {};
try { const m = await viejo.cashMovement.findFirst({ where: { id: "cmres" } }); r.lee = { valor: m?.amount, tipo: typeof m?.amount, esObjeto: typeof m?.amount === "object" }; }
catch (e) { r.lee_error = String((e as Error).message).split("\n").filter(Boolean).slice(-1)[0]; }
try { const c = await viejo.cashMovement.create({ data: { tenantId: "tA", type: "VENTA", amount: 0.1 + 0.2, createdBy: "x" } }); r.escribe = { valor: c.amount, tipo: typeof c.amount }; }
catch (e) { r.escribe_error = String((e as Error).message).split("\n").filter(Boolean).slice(-1)[0]; }
try { const s = await viejo.cashMovement.aggregate({ _sum: { amount: true } }); r.suma = { valor: s._sum.amount, tipo: typeof s._sum.amount }; }
catch (e) { r.suma_error = String((e as Error).message).split("\n").filter(Boolean).slice(-1)[0]; }
console.log(JSON.stringify(r));
await viejo.$disconnect();
