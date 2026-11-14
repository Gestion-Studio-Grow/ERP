import { PrismaClient } from "/tmp/claude-0/-home-user-ERP/1a9045e2-a9b1-59ab-b227-859db07fea0d/scratchpad/cert/src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: "postgresql://postgres@localhost:5433/cert0708", max: 20 }) });
const k = { tenantId: "A", puesto: "cobranzas", tope: "monto-dia", sujeto: "*", periodo: "2026-11-15" };
const max = 100000000n, importe = 40000000n; // $1.000.000 tope, $400.000 cada una
const una = () => prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe('SELECT 1');
  await tx.agenteContador.createMany({ data: [{ ...k, n: 0 }], skipDuplicates: true });
  const r = await tx.$executeRawUnsafe('UPDATE "AgenteContador" SET monto = monto + $1, n = n + 1 WHERE "tenantId"=$2 AND puesto=$3 AND tope=$4 AND sujeto=$5 AND periodo=$6 AND monto <= $7', importe, k.tenantId, k.puesto, k.tope, k.sujeto, k.periodo, max - importe);
  if (r !== 1) throw new Error("sin cupo");
  await new Promise((s) => setTimeout(s, 50));
});
const res = await Promise.allSettled(Array.from({ length: 12 }, una));
console.log("ganaron:", res.filter((x) => x.status === "fulfilled").length, "de 12; errores:", [...new Set(res.filter((x) => x.status === "rejected").map((x: any) => x.reason.message.slice(0, 60)))]);
console.log(await prisma.agenteContador.findMany({ where: k }).then((f) => f.map((x) => ({ n: x.n }))));
console.log(await prisma.$queryRawUnsafe('SELECT monto::text FROM "AgenteContador" WHERE tope=$1', k.tope));
await prisma.$disconnect();
