// Ataque adversarial a P1/P2 (§19 canales) sobre PGlite. No toca el repo ni Neon.
import { PGlite } from "/home/user/ERP/node_modules/@electric-sql/pglite/dist/index.js";

const db = new PGlite();
const r = [];
async function caso(nombre, sql, esperaFalla) {
  try {
    await db.exec(sql);
    r.push(`${esperaFalla ? "FALLA" : "ok   "} ${nombre}: aceptado`);
  } catch (e) {
    r.push(`${esperaFalla ? "ok   " : "FALLA"} ${nombre}: rechazado (${e.message.split("\n")[0].slice(0, 90)})`);
  }
}

await db.exec(`
CREATE TABLE "AgentePedido"(id text, "tenantId" text, "userId" text, PRIMARY KEY(id), UNIQUE("tenantId",id,"userId"));
CREATE TABLE "AgentePropuesta"(
  id text PRIMARY KEY, "tenantId" text NOT NULL, clave text NOT NULL, estado text NOT NULL,
  origen text NOT NULL, "pedidoId" text, "solicitadoPor" text,
  "canalOfertaId" text, "solicitanteContactoId" text,
  CONSTRAINT "AgentePropuesta_origen_check" CHECK (origen IN ('RUTINA','PEDIDO','CANAL')),
  CONSTRAINT "AgentePropuesta_origen_pedido_check" CHECK (origen <> 'PEDIDO' OR "pedidoId" IS NOT NULL),
  CONSTRAINT "AgentePropuesta_origen_canal_check" CHECK (
    (origen = 'CANAL' AND "canalOfertaId" IS NOT NULL AND "solicitanteContactoId" IS NOT NULL
       AND "pedidoId" IS NULL AND "solicitadoPor" IS NULL)
    OR (origen <> 'CANAL' AND "canalOfertaId" IS NULL AND "solicitanteContactoId" IS NULL)),
  FOREIGN KEY ("tenantId","pedidoId","solicitadoPor") REFERENCES "AgentePedido"("tenantId",id,"userId"));
CREATE UNIQUE INDEX "AgentePropuesta_tenantId_clave_viva_key" ON "AgentePropuesta"("tenantId",clave)
  WHERE estado IN ('PENDIENTE','EJECUTADA','REVERTIDA');
-- Migración de canales (posterior):
CREATE TABLE "CanalOferta"(id text, "tenantId" text, "contactoId" text, estado text, PRIMARY KEY(id),
  UNIQUE("tenantId",id,"contactoId"));
INSERT INTO "CanalOferta" VALUES ('ofA','t1','cA','CONFIRMADA'),('ofA2','t1','cA','CONFIRMADA'),('ofB','t2','cB','CONFIRMADA');
ALTER TABLE "AgentePropuesta" ADD CONSTRAINT "AgentePropuesta_tenantId_canalOfertaId_solicitanteContactoId_fkey"
  FOREIGN KEY ("tenantId","canalOfertaId","solicitanteContactoId") REFERENCES "CanalOferta"("tenantId",id,"contactoId") ON DELETE RESTRICT;
`);

await caso("CANAL legítimo (t1, ofA, cA)", `INSERT INTO "AgentePropuesta" VALUES ('p1','t1','turnos.reservar:oferta:ofA','EJECUTADA','CANAL',NULL,NULL,'ofA','cA')`, false);
await caso("botón de otro contacto (ofA con cX)", `INSERT INTO "AgentePropuesta" VALUES ('p2','t1','k2','PENDIENTE','CANAL',NULL,NULL,'ofA','cX')`, true);
await caso("oferta de otro negocio (t1 con ofB)", `INSERT INTO "AgentePropuesta" VALUES ('p3','t1','k3','PENDIENTE','CANAL',NULL,NULL,'ofB','cB')`, true);
await caso("CANAL sin contacto (MATCH SIMPLE)", `INSERT INTO "AgentePropuesta" VALUES ('p4','t1','k4','PENDIENTE','CANAL',NULL,NULL,'ofA',NULL)`, true);
await caso("RUTINA con oferta colgada", `INSERT INTO "AgentePropuesta" VALUES ('p5','t1','k5','PENDIENTE','RUTINA',NULL,NULL,'ofA','cA')`, true);
await caso("RUTINA haciéndose pasar: pedidoId sin FK completa", `INSERT INTO "AgentePedido" VALUES ('ped1','t1','u1'); INSERT INTO "AgentePropuesta" VALUES ('p5b','t1','k5b','PENDIENTE','RUTINA','ped1',NULL,NULL,NULL)`, true);
await caso("MISMA oferta, otra clave (C3 reutiliza clave del motor)", `INSERT INTO "AgentePropuesta" VALUES ('p6','t1','C3:cuota:q1:2026-11-20','PENDIENTE','CANAL',NULL,NULL,'ofA','cA')`, true);
await caso("reatar propuesta a otra oferta del mismo contacto (UPDATE)", `UPDATE "AgentePropuesta" SET "canalOfertaId"='ofA2' WHERE id='p1'`, true);
await caso("borrar la oferta (derecho de supresión)", `DELETE FROM "CanalOferta" WHERE id='ofA'`, true);

await caso("PEDIDO sin solicitadoPor (MATCH SIMPLE)", `INSERT INTO "AgentePropuesta" VALUES ('p5c','t1','k5c','PENDIENTE','PEDIDO','ped1',NULL,NULL,NULL)`, true);
// Con el único parcial que propone el dictamen:
await db.exec(`DELETE FROM "AgentePropuesta" WHERE id='p6';
CREATE UNIQUE INDEX "AgentePropuesta_tenantId_canalOfertaId_viva_key" ON "AgentePropuesta"("tenantId","canalOfertaId")
  WHERE "canalOfertaId" IS NOT NULL AND estado IN ('PENDIENTE','EJECUTADA','REVERTIDA');`);
await caso("con único parcial: misma oferta, otra clave", `INSERT INTO "AgentePropuesta" VALUES ('p7','t1','C3:cuota:q1:2026-11-20','PENDIENTE','CANAL',NULL,NULL,'ofA2','cA')`, true);

// D1: REVOKE de columna con GRANT de tabla no tiene efecto
await db.exec(`CREATE ROLE app_rls; GRANT ALL ON "AgentePropuesta" TO app_rls; REVOKE UPDATE ("canalOfertaId") ON "AgentePropuesta" FROM app_rls;`);
await caso("D1: app_rls actualiza columna revocada", `SET ROLE app_rls; UPDATE "AgentePropuesta" SET "canalOfertaId"='ofA2' WHERE id='p1'; RESET ROLE;`, true);
await db.exec(`RESET ROLE`);
console.log(r.join("\n"));
