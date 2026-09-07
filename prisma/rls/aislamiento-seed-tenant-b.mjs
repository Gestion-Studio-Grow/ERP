// Siembra un SEGUNDO tenant ("tenant-b") con datos DISTINGUIBLES en la base local
// de aislamiento (erp_val). Escribe como el OWNER de la base (postgres/neondb_owner),
// que bypassa RLS/WITH CHECK por diseño (bootstrap cross-tenant, ADR-018/019).
//
//   DATABASE_URL="postgresql://postgres@127.0.0.1:5433/erp_val" node prisma/rls/aislamiento-seed-tenant-b.mjs
//
// Idempotente: borra y re-siembra las filas del tenant-b por su tenantId. NUNCA toca
// filas de otro tenant. Todos los ids del tenant B llevan el prefijo "B_" para que
// una fuga cross-tenant sea evidente a simple vista.
//
// Anti-prod: aborta si DATABASE_URL parece prod/main.

import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) { console.error("Falta DATABASE_URL"); process.exit(2); }
if (/prod|production|\bmain\b|neon\.tech/i.test(url)) {
  console.error("DATABASE_URL parece PRODUCCIÓN. Abortado (este script es solo para la base local de aislamiento)."); process.exit(2);
}

const B = "B_tenant";
// hash de "qa-local-1234" (copiado del OWNER de tenant A) → permite loguear al OWNER de B.
const HASH = "scrypt$f93f653ef544d1e832b35a702d8e983c$e3769676b6d6c4189dbb1affbe3e2653a13f2546f8c09f3a0aff2a002b036c312984f58e816257ae163e51e83abbf7ca99c18a6fb82fde77d8dc8fb75b471984";

const c = new pg.Client({ connectionString: url });
await c.connect();

async function q(sql, params) { return c.query(sql, params); }

try {
  await q("BEGIN");

  // Limpieza idempotente (orden inverso a las FK). Solo filas del tenant B.
  for (const t of [
    "CommissionPayout", "Payment", "Appointment", "CashMovement", "CashSession",
    "AccountReceivable", "OrderItem", "Order", "ProfessionalServiceCommission",
    "Professional", "Service", "ServiceCategory", "Box", "Client",
    "BusinessSettings", "User",
  ]) {
    await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [B]);
  }
  await q(`DELETE FROM "Tenant" WHERE id = $1`, [B]);

  await q(
    `INSERT INTO "Tenant"(id,name,slug,subdomain,timezone,status,"blueprintId",modules,profile,"arcaHomologacion","createdAt","updatedAt")
     VALUES ($1,'Tenant B — Carniceria NQN','tenant-b','tenantb','America/Argentina/Buenos_Aires','TRIAL','generico',ARRAY['catalogo','ventas']::text[],'lite',true,now(),now())`,
    [B],
  );

  await q(
    `INSERT INTO "User"(id,"tenantId",name,email,"passwordHash",role,active,"createdAt","updatedAt")
     VALUES ('B_owner',$1,'Owner B','owner@tenant-b.test',$2,'OWNER',true,now(),now())`,
    [B, HASH],
  );

  await q(`INSERT INTO "BusinessSettings"(id,"tenantId","shortLabel",city,"createdAt","updatedAt") VALUES ('B_bs',$1,'TENANT-B SECRETO','Neuquen',now(),now())`, [B]);

  await q(`INSERT INTO "Client"(id,"tenantId",name,phone,email,"createdAt","updatedAt") VALUES ('B_cli',$1,'CLIENTE-SECRETO-B','11-9999-0000','secreto@tenant-b.test',now(),now())`, [B]);

  await q(`INSERT INTO "Box"(id,"tenantId",name,active,"createdAt","updatedAt") VALUES ('B_box',$1,'Box B',true,now(),now())`, [B]);
  await q(`INSERT INTO "ServiceCategory"(id,"tenantId",name,"order","createdAt","updatedAt") VALUES ('B_cat',$1,'Cat B',0,now(),now())`, [B]);
  await q(`INSERT INTO "Service"(id,"tenantId","categoryId",name,"durationMin",price,active,"createdAt","updatedAt") VALUES ('B_svc',$1,'B_cat','Servicio B',30,50000,true,now(),now())`, [B]);
  await q(`INSERT INTO "Professional"(id,"tenantId",name,active,"boxId","commissionPercent","createdAt","updatedAt") VALUES ('B_prof',$1,'PROF-SECRETO-B',true,'B_box',50,now(),now())`, [B]);
  await q(`INSERT INTO "ProfessionalServiceCommission"(id,"tenantId","professionalId","serviceId","commissionPercent","createdAt","updatedAt") VALUES ('B_psc',$1,'B_prof','B_svc',50,now(),now())`, [B]);

  // Turno COMPLETED + cobrado (para atacar comisiones / confirmPayment / complete).
  await q(
    `INSERT INTO "Appointment"(id,"tenantId","clientId","professionalId","serviceId","boxId","startsAt","endsAt",status,"priceAtBooking","discountAmount","isResidentBooking","createdAt","updatedAt")
     VALUES ('B_appt',$1,'B_cli','B_prof','B_svc','B_box', now() - interval '2 days', now() - interval '2 days' + interval '30 min','COMPLETED',50000,0,false,now(),now())`,
    [B],
  );
  await q(
    `INSERT INTO "Payment"(id,"tenantId","appointmentId",amount,method,status,"createdAt","updatedAt")
     VALUES ('B_pay',$1,'B_appt',50000,'EFECTIVO','APPROVED',now(),now())`,
    [B],
  );

  // Pedido del mostrador (para atacar order-actions).
  await q(
    `INSERT INTO "Order"(id,"tenantId",code,status,channel,fulfillment,"clientId","customerName","customerPhone",subtotal,discount,total,"paymentMethod",paid,"createdAt","updatedAt")
     VALUES ('B_order',$1,9001,'READY','COUNTER','PICKUP','B_cli','CLIENTE-SECRETO-B','11-9999-0000',123456,0,123456,'EFECTIVO',false,now(),now())`,
    [B],
  );
  await q(
    `INSERT INTO "OrderItem"(id,"tenantId","orderId",name,"saleUnit",quantity,"unitPrice","lineTotal") VALUES ('B_oi',$1,'B_order','ITEM-SECRETO-B','UNIT',1,123456,123456)`,
    [B],
  );

  // Caja + movimiento (para libro-caja).
  await q(`INSERT INTO "CashSession"(id,"tenantId",status,"openedBy","openingFloat","openedAt","createdAt","updatedAt") VALUES ('B_cash',$1,'OPEN','user:B_owner',0,now(),now(),now())`, [B]);
  await q(`INSERT INTO "CashMovement"(id,"tenantId","sessionId",type,amount,method,reason,"occurredAt","createdBy","createdAt") VALUES ('B_mov',$1,'B_cash','INGRESO',777777,'EFECTIVO','MOV-SECRETO-B',now(),'user:B_owner',now())`, [B]);

  // Cuenta a cobrar (fiado).
  await q(`INSERT INTO "AccountReceivable"(id,"tenantId","clientId",amount,concept,status,"createdBy","createdAt","updatedAt") VALUES ('B_ar',$1,'B_cli',888888,'FIADO-SECRETO-B','OPEN','user:B_owner',now(),now())`, [B]);

  await q("COMMIT");
  console.log("OK — tenant B sembrado (id=B_tenant, slug=tenant-b). Datos con prefijo B_ / *-SECRETO-B.");
} catch (e) {
  await q("ROLLBACK").catch(() => {});
  console.error("ERROR sembrando tenant B:", e.message);
  process.exit(1);
} finally {
  await c.end();
}
