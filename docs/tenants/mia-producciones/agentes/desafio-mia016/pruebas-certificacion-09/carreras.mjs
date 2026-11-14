import pg from "/home/user/ERP/node_modules/pg/lib/index.js";
const url = "postgresql://app_rls@localhost:5433/cert09";
const mk = async () => { const c = new pg.Client({ connectionString: url }); await c.connect(); await c.query("SET app.current_tenant_id='A'"); return c; };
const a = await mk(), b = await mk();
// L1: candado de la autorización (llaves paso 2) como app_rls + revocación en vuelo
await a.query("BEGIN");
const r = await a.query(`UPDATE "AgenteAutorizacion" SET "revocadaEl"=NULL WHERE id='a3' AND "tenantId"='A' AND "revocadaEl" IS NULL AND "reemplazadaEl" IS NULL`);
await b.query("SET lock_timeout='1000ms'");
try { await b.query(`UPDATE "AgenteAutorizacion" SET "revocadaEl"=now() WHERE "tenantId"='A' AND "revocadaEl" IS NULL`); console.log("L1 REVOCACION NO ESPERO"); }
catch (e) { console.log("L1 candado count=" + r.rowCount + "; revocación en vuelo bloqueada:", e.message); }
await a.query("ROLLBACK");
// L2: revoca primero (sin commit), el motor espera y al commit ve count=0
await b.query("BEGIN"); await b.query(`UPDATE "AgenteAutorizacion" SET "revocadaEl"=now(), "revocadaPor"='u-owner' WHERE "tenantId"='A' AND "revocadaEl" IS NULL AND "reemplazadaEl" IS NULL`);
const p = a.query(`UPDATE "AgenteAutorizacion" SET "revocadaEl"=NULL WHERE id='a3' AND "revocadaEl" IS NULL AND "reemplazadaEl" IS NULL`);
await new Promise((s) => setTimeout(s, 300)); await b.query("ROLLBACK"); // rollback para no gastar a3
console.log("L2 motor tras rollback de la revocación count=" + (await p).rowCount);
// C1: conciliar literal (acciones-empresa.ts:238-239) desde dos puestos a la vez sobre la misma cuota q1
await a.query("BEGIN"); await b.query("BEGIN");
const ya1 = (await a.query(`SELECT id FROM "MovBancoT" WHERE "tenantId"='A' AND "cuotaId"='q1'`)).rowCount;
const ya2 = (await b.query(`SELECT id FROM "MovBancoT" WHERE "tenantId"='A' AND "cuotaId"='q1'`)).rowCount;
const u1 = ya1 ? 0 : (await a.query(`UPDATE "MovBancoT" SET "cuotaId"='q1' WHERE id='m1' AND "cuotaId" IS NULL`)).rowCount;
const u2 = ya2 ? 0 : (await b.query(`UPDATE "MovBancoT" SET "cuotaId"='q1' WHERE id='m2' AND "cuotaId" IS NULL`)).rowCount;
await a.query("COMMIT"); await b.query("COMMIT");
const n = (await a.query(`SELECT count(*)::int n FROM "MovBancoT" WHERE "cuotaId"='q1'`)).rows[0].n;
console.log(`C1 conciliar a la vez: u1=${u1} u2=${u2} -> movimientos atados a q1: ${n}`);
await a.end(); await b.end();
