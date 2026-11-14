import { PrismaClient } from "/tmp/claude-0/-home-user-ERP/1a9045e2-a9b1-59ab-b227-859db07fea0d/scratchpad/cert/src/generated/prisma/client.ts";
import { PrismaPg } from "/home/user/ERP/node_modules/@prisma/adapter-pg/dist/index.mjs";
import pg from "/home/user/ERP/node_modules/pg/lib/index.js";
const url = "postgresql://postgres@localhost:5433/cert0708";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }), log: [{ emit: "event", level: "query" }] });
const sql: string[] = [];
(prisma as any).$on("query", (e: any) => sql.push(e.query));
const otro = new pg.Client({ connectionString: url }); await otro.connect();
let r: any;
await prisma.$transaction(async (tx) => {
  r = await tx.agentePuesto.updateMany({ where: { tenantId: "A", puesto: "cobranzas", estado: "ACTIVO" }, data: { pausadoPor: null } });
  await otro.query("SET lock_timeout = '1500ms'");
  try { await otro.query(`UPDATE "AgentePuesto" SET estado='PAUSADO' WHERE "tenantId"='A' AND puesto='cobranzas'`); console.log("PAUSA NO ESPERO: el candado sin cambios NO tomo la fila"); }
  catch (e: any) { console.log("pausa bloqueada (candado OK):", e.message); }
}, { timeout: 10000 });
console.log("count devuelto:", r.count);
console.log("SQL emitido en la tx:", sql.filter((q) => !/BEGIN|COMMIT/.test(q)));
await otro.end(); await prisma.$disconnect();
