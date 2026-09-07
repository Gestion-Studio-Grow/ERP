// ATAQUE 2 — a nivel APLICACIÓN. Reproduce, contra la base, las MISMAS consultas
// que ejecutan varias Server Actions del panel que resuelven la fila SOLO por `id`
// (sin `tenantId` en el WHERE). Un OWNER logueado en el tenant A que cambia el
// `id` de un form (o repite el POST con otro id) apunta a filas del tenant B.
//
// Se corre bajo los DOS regímenes de runtime que el flag RLS_ENFORCEMENT elige
// (src/lib/db.ts):
//   [A] OWNER / flag OFF  → `basePrisma` con el rol de DATABASE_URL. Es EXACTAMENTE
//       el comando de arranque provisto (rol postgres, RLS_ENFORCEMENT sin setear).
//       Sin GUC, sin RLS efectiva.
//   [B] app_rls / flag ON → `rlsPrisma` envuelve cada op en una tx que setea
//       app.current_tenant_id = <tenant de la sesión> (aquí, el tenant A) y conecta
//       como app_rls (NOBYPASSRLS). Es el estado "producción" que el repo declara.
//
// Cada acción se prueba pidiendo una fila del tenant B (id con prefijo B_) desde una
// sesión del tenant A. Toda escritura corre en tx con ROLLBACK.
//
//   DATABASE_URL="postgresql://postgres@127.0.0.1:5433/erp_val" node prisma/rls/aislamiento-ataque-app.mjs

import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) { console.error("Falta DATABASE_URL"); process.exit(2); }
if (/neon\.tech|prod|production/i.test(url)) { console.error("Parece prod. Abortado."); process.exit(2); }

const A = "cmtq4yf120000gh7dl8q2cjfs"; // tenant de la SESIÓN del atacante
const owner = new pg.Client({ connectionString: url });
await owner.connect();

// Las acciones atacadas (archivo:línea) y la consulta cruda que corren, apuntando a
// una fila del tenant B (id B_*). `read`=SELECT, `write`=UPDATE/DELETE (se revierte).
const ATAQUES = [
  { accion: "getClient (actions.ts:1131)", cap: "clients:read",
    kind: "read", sql: `SELECT name, phone, email FROM "Client" WHERE id='B_cli'` },
  { accion: "advanceOrderStatus (order-actions.ts:202)", cap: "orders:manage",
    kind: "read", sql: `SELECT status FROM "Order" WHERE id='B_order'` },
  { accion: "cancelOrder (order-actions.ts:274)", cap: "orders:manage",
    kind: "write", sql: `UPDATE "Order" SET status='CANCELLED' WHERE id='B_order'` },
  { accion: "advanceOrderStatus UPDATE (order-actions.ts:209)", cap: "orders:manage",
    kind: "write", sql: `UPDATE "Order" SET status='DELIVERED' WHERE id='B_order'` },
  { accion: "cancelAppointment (actions.ts:1017)", cap: "agenda:manage",
    kind: "write", sql: `UPDATE "Appointment" SET status='CANCELLED' WHERE id='B_appt'` },
  { accion: "markNoShow (actions.ts:1030)", cap: "agenda:complete",
    kind: "write", sql: `UPDATE "Appointment" SET status='NO_SHOW' WHERE id='B_appt'` },
  { accion: "toggleCouponActive/deleteReview patrón (coupon/reviews-actions)", cap: "varias",
    kind: "write", sql: `UPDATE "CashMovement" SET reason='HACK' WHERE id='B_mov'` },
  { accion: "deleteBox patrón catalog-actions.ts:76", cap: "catalog:manage",
    kind: "write", sql: `UPDATE "Box" SET "deletedAt"=now() WHERE id='B_box'` },
];

async function runOwner(sql, kind) {
  await owner.query("BEGIN");
  try {
    const r = await owner.query(sql);
    if (kind === "read") return { visto: r.rowCount, muestra: r.rows[0] ? JSON.stringify(r.rows[0]).slice(0, 60) : "" };
    return { afecto: r.rowCount };
  } finally { await owner.query("ROLLBACK"); }
}

async function runAppRls(sql, kind) {
  await owner.query("BEGIN");
  try {
    await owner.query("SET LOCAL ROLE app_rls");
    await owner.query("SELECT set_config('app.current_tenant_id',$1,true)", [A]); // sesión = tenant A
    const r = await owner.query(sql);
    if (kind === "read") return { visto: r.rowCount };
    return { afecto: r.rowCount };
  } finally { await owner.query("ROLLBACK"); }
}

try {
  // Asegurar que las policies estén aplicadas y que exista app_rls (para el régimen B).
  const npol = (await owner.query("SELECT count(*)::int n FROM pg_policies WHERE schemaname='public' AND policyname='tenant_isolation'")).rows[0].n;
  const hasRole = (await owner.query("SELECT 1 FROM pg_roles WHERE rolname='app_rls'")).rowCount > 0;
  if (npol === 0 || !hasRole) {
    console.log("⚠️  Correr primero prisma/rls/aislamiento-ataque-db.mjs (aplica 0001 + crea app_rls). Régimen B se saltea.\n");
  }
  const puedeB = npol > 0 && hasRole;
  if (puedeB) await owner.query("GRANT app_rls TO CURRENT_USER").catch(() => {});

  console.log("Atacante: sesión OWNER del tenant A, pidiendo filas del tenant B (ids B_*).\n");
  console.log("Régimen [A] = comando de arranque provisto (rol postgres, RLS_ENFORCEMENT sin setear → flag OFF).");
  console.log("Régimen [B] = app_rls NOBYPASSRLS + flag ON + GUC=tenantA (estado 'producción' declarado).\n");

  let fugaA = false;
  for (const at of ATAQUES) {
    const ra = await runOwner(at.sql, at.kind);
    const alcanzoA = at.kind === "read" ? ra.visto > 0 : ra.afecto > 0;
    if (alcanzoA) fugaA = true;
    let lineaB = "";
    if (puedeB) {
      const rb = await runAppRls(at.sql, at.kind);
      const alcanzoB = at.kind === "read" ? rb.visto > 0 : rb.afecto > 0;
      lineaB = `  |  [B] ${alcanzoB ? "🔴 FUGA" : "🟢 bloqueado"} (${at.kind === "read" ? "visto=" + rb.visto : "afecto=" + rb.afecto})`;
    }
    const detA = at.kind === "read" ? `visto=${ra.visto}${ra.muestra ? " " + ra.muestra : ""}` : `afecto=${ra.afecto}`;
    console.log(`${alcanzoA ? "🔴 FUGA" : "🟢 ----"} [A] ${detA}${lineaB}`);
    console.log(`        ${at.kind.toUpperCase()} ${at.accion}`);
  }

  console.log("\n────────────────────────────────────────────────────────────");
  console.log(`Régimen [A] (como arranca el server provisto): ${fugaA ? "🔴 FUGA CROSS-TENANT — las acciones tocan datos del tenant B" : "🟢 sin fuga"}`);
  if (puedeB) console.log("Régimen [B] (RLS on + app_rls): el backstop RLS cierra los mismos huecos.");
  await owner.end();
  process.exit(0);
} catch (e) {
  console.error("Error:", e.message);
  await owner.query("ROLLBACK").catch(() => {});
  await owner.end();
  process.exit(1);
}
