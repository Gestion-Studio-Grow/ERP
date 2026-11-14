// SEG-006 · Tanda 1 · FK compuestas con el negocio en las tablas de PLATA.
//
// Prueba contra una base efímera (migraciones + RLS + app_rls, src/test/base-efimera.ts) que, con
// la migración 20261109120000_fk_compuestas_plata, la BASE impide que un negocio referencie una fila
// de otro aunque la server action no lo verifique: con la sesión de A (app_rls + negocio A) y aun
// como dueño de las tablas (exento de RLS, como la consola), un id de B en una columna de plata rebota
// con la FK compuesta. Y que los borrados siguen haciendo lo mismo que antes (CASCADE / SET NULL sólo
// de la columna, nunca del negocio). Inventario: docs/seguridad/INVENTARIO-FK-SIN-TENANT.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { baseEfimeraDelArchivo, type BaseEfimera } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();

/** [tabla, columna, destino, ON DELETE (pg_constraint.confdeltype: c CASCADE, n SET NULL, r RESTRICT)] de las 17 FK de la tanda 1. */
const FK_PLATA: [string, string, string, "c" | "n" | "r"][] = [
  ["CashMovement", "sessionId", "CashSession", "c"],
  ["CashMovement", "orderId", "Order", "n"],
  ["CashMovement", "paymentId", "Payment", "n"],
  ["CashMovement", "collectionId", "Collection", "n"],
  ["CashMovement", "tallerPagoId", "TallerPago", "n"],
  ["CashMovement", "proyectoPagoId", "ProyectoPago", "n"],
  ["CashMovement", "proyectoGastoId", "ProyectoGasto", "n"],
  ["Collection", "orderId", "Order", "n"],
  ["Collection", "appointmentId", "Appointment", "n"],
  ["Payment", "appointmentId", "Appointment", "r"],
  ["Invoice", "orderId", "Order", "n"],
  ["Invoice", "appointmentId", "Appointment", "n"],
  ["Voucher", "loteId", "VoucherLote", "r"],
  ["Voucher", "clientId", "Client", "r"],
  ["Voucher", "appointmentId", "Appointment", "n"],
  ["Voucher", "collectionId", "Collection", "n"],
  ["MovimientoImportado", "importacionId", "ImportacionBancaria", "c"],
];

type Q = (sql: string, params?: unknown[]) => Promise<pg.QueryResult>;

async function conCliente<T>(url: string, fn: (q: Q) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    return await fn((sql, params) => c.query(sql, params as unknown[]));
  } finally {
    await c.end();
  }
}

/** Como la app: app_rls, en una transacción con el negocio puesto. Siempre ROLLBACK. */
function comoNegocio<T>(base: BaseEfimera, tenantId: string, fn: (q: Q) => Promise<T>): Promise<T> {
  return conCliente(base.urlApp, async (q) => {
    await q("BEGIN");
    try {
      await q("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      return await fn(q);
    } finally {
      await q("ROLLBACK");
    }
  });
}

const comoDuenio = <T>(base: BaseEfimera, fn: (q: Q) => Promise<T>) => conCliente(base.urlDuenio, fn);

const id = () => `fk-${Math.random().toString(36).slice(2, 12)}`;

async function nuevaCaja(q: Q, tenantId: string): Promise<string> {
  const r = await q(
    `INSERT INTO "CashSession"(id,"tenantId","openedBy","updatedAt") VALUES ($1,$2,'test',now()) RETURNING id`,
    [id(), tenantId],
  );
  return r.rows[0].id;
}

async function nuevoMovimiento(q: Q, tenantId: string, extra: Record<string, string | null> = {}): Promise<string> {
  const cols = Object.keys(extra);
  const r = await q(
    `INSERT INTO "CashMovement"(id,"tenantId",type,amount,"createdBy"${cols.map((c) => `,"${c}"`).join("")})
     VALUES ($1,$2,'INGRESO',100,'test'${cols.map((_, i) => `,$${i + 3}`).join("")}) RETURNING id`,
    [id(), tenantId, ...Object.values(extra)],
  );
  return r.rows[0].id;
}

async function nuevoLote(q: Q, tenantId: string): Promise<string> {
  const r = await q(`INSERT INTO "VoucherLote"(id,"tenantId",numero) VALUES ($1,$2,$3) RETURNING id`, [id(), tenantId, id()]);
  return r.rows[0].id;
}

async function nuevaImportacion(q: Q, tenantId: string): Promise<string> {
  const r = await q(
    `INSERT INTO "ImportacionBancaria"(id,"tenantId","nombreArchivo",origen,archivo,"mapeoJson","updatedAt")
     VALUES ($1,$2,'x.csv','banco','\\x00'::bytea,'{}'::jsonb,now()) RETURNING id`,
    [id(), tenantId],
  );
  return r.rows[0].id;
}

const FK_COMPUESTA = (tabla: string, col: string) => new RegExp(`${tabla}_${col}_tenant_fkey`);

test("la migración deja las 17 FK de plata compuestas con el negocio y los 10 índices (negocio, id)", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  await comoDuenio(base, async (q) => {
    for (const [tabla, col, destino, alBorrar] of FK_PLATA) {
      const r = await q(
        `SELECT c.confrelid::regclass::text AS destino, c.confdeltype AS del, c.confupdtype AS upd, c.condeferrable AS dif,
                array(SELECT a.attname::text || '>' || b.attname::text
                        FROM unnest(c.conkey, c.confkey) AS k(hijo, padre)
                        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.hijo
                        JOIN pg_attribute b ON b.attrelid = c.confrelid AND b.attnum = k.padre ORDER BY 1) AS pares,
                (SELECT array_agg(a.attname::text) FROM unnest(c.confdelsetcols) k JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k) AS anula
           FROM pg_constraint c WHERE c.conname=$1 AND c.contype='f'`,
        [`${tabla}_${col}_tenant_fkey`],
      );
      assert.equal(r.rowCount, 1, `${tabla}.${col}: falta la FK compuesta`);
      const fk = r.rows[0];
      assert.equal(fk.destino, `"${destino}"`, `${tabla}.${col}: destino`);
      // Cada columna contra la suya: la referencia contra id y el negocio contra el negocio.
      assert.deepEqual([...fk.pares], [`${col}>id`, "tenantId>tenantId"].sort(), `${tabla}.${col}: pares`);
      assert.equal(fk.del, alBorrar, `${tabla}.${col}: ON DELETE igual a la FK vieja`);
      assert.equal(fk.upd, "a", `${tabla}.${col}: ON UPDATE NO ACTION`);
      assert.equal(fk.dif, false, `${tabla}.${col}: no diferible`);
      // SET NULL sólo de la columna: nunca pone el negocio en NULL.
      assert.deepEqual(alBorrar === "n" ? fk.anula : null, alBorrar === "n" ? [col] : null, `${tabla}.${col}: SET NULL ("${col}")`);
    }
    const ix = await q(
      `SELECT count(*)::int AS n FROM pg_indexes WHERE indexname = ANY($1)`,
      [["CashSession", "Order", "Payment", "Collection", "TallerPago", "ProyectoPago", "Appointment", "ImportacionBancaria", "VoucherLote", "Client"].map((x) => `${x}_tenantId_id_key`)],
    );
    assert.equal(ix.rows[0].n, 10);
  });
});

test("con la sesión de A, un id de B en una columna de plata rebota (y el de A entra)", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const { a, b } = base;
  const [cajaB, loteB, impB] = await comoDuenio(base, async (q) => [await nuevaCaja(q, b.id), await nuevoLote(q, b.id), await nuevaImportacion(q, b.id)]);

  await comoNegocio(base, a.id, async (q) => {
    // Mismo negocio: entra.
    await nuevoMovimiento(q, a.id, { orderId: a.pedidos[0], sessionId: await nuevaCaja(q, a.id) });

    const casos: [string, () => Promise<unknown>, RegExp][] = [
      ["CashMovement.orderId", () => nuevoMovimiento(q, a.id, { orderId: b.pedidos[0] }), FK_COMPUESTA("CashMovement", "orderId")],
      ["CashMovement.sessionId", () => nuevoMovimiento(q, a.id, { sessionId: cajaB }), FK_COMPUESTA("CashMovement", "sessionId")],
      [
        "Collection.orderId",
        () =>
          q(
            `INSERT INTO "Collection"(id,"tenantId","originType","originId",amount,method,"collectedBy","orderId")
             VALUES ($1,$2,'ORDER',$3,100,'EFECTIVO','test',$3)`,
            [id(), a.id, b.pedidos[0]],
          ),
        FK_COMPUESTA("Collection", "orderId"),
      ],
      [
        "Voucher.clientId",
        async () => {
          const loteA = await nuevoLote(q, a.id);
          return q(`INSERT INTO "Voucher"(id,"tenantId",numero,"loteId","clientId","updatedAt") VALUES ($1,$2,$3,$4,$5,now())`, [
            id(), a.id, id(), loteA, b.clientes[0],
          ]);
        },
        FK_COMPUESTA("Voucher", "clientId"),
      ],
      [
        "Voucher.loteId",
        () =>
          q(`INSERT INTO "Voucher"(id,"tenantId",numero,"loteId","clientId","updatedAt") VALUES ($1,$2,$3,$4,$5,now())`, [
            id(), a.id, id(), loteB, a.clientes[0],
          ]),
        FK_COMPUESTA("Voucher", "loteId"),
      ],
      [
        "MovimientoImportado.importacionId",
        () =>
          q(
            `INSERT INTO "MovimientoImportado"(id,"tenantId","importacionId",hash,fecha,monto,descripcion,clasificacion,"estadoPropuesta","updatedAt")
             VALUES ($1,$2,$3,$4,'2026-11-09',100,'x','venta','auto',now())`,
            [id(), a.id, impB, id()],
          ),
        FK_COMPUESTA("MovimientoImportado", "importacionId"),
      ],
      [
        "Invoice.orderId",
        () =>
          q(
            `INSERT INTO "Invoice"(id,"tenantId","puntoVenta",concepto,"docTipo","docNro",fecha,neto,iva,total,"orderId","updatedAt")
             VALUES ($1,$2,1,1,99,'0','2026-11-09',100,21,121,$3,now())`,
            [id(), a.id, b.pedidos[0]],
          ),
        FK_COMPUESTA("Invoice", "orderId"),
      ],
    ];
    for (const [que, intento, fk] of casos) {
      await q("SAVEPOINT s");
      await assert.rejects(intento(), fk, `${que}: un id de B tiene que rebotar`);
      await q("ROLLBACK TO SAVEPOINT s");
    }
  });
});

test("aun como dueño de las tablas (exento de RLS) la base impide el cruce de negocios", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const { a, b } = base;
  await comoDuenio(base, async (q) => {
    await assert.rejects(nuevoMovimiento(q, a.id, { orderId: b.pedidos[1] }), FK_COMPUESTA("CashMovement", "orderId"));
    // Mover la fila hija a otro negocio, conservando el padre de A, tampoco.
    const mov = await nuevoMovimiento(q, a.id, { orderId: a.pedidos[1] });
    await assert.rejects(q(`UPDATE "CashMovement" SET "tenantId"=$1 WHERE id=$2`, [b.id, mov]), FK_COMPUESTA("CashMovement", "orderId"));
    // Ni mover el padre: ON UPDATE NO ACTION en la FK compuesta lo bloquea en vez de arrastrar hijos.
    await assert.rejects(q(`UPDATE "Order" SET "tenantId"=$1, code=876543 WHERE id=$2`, [b.id, a.pedidos[1]]), FK_COMPUESTA("CashMovement", "orderId"));
    await q(`DELETE FROM "CashMovement" WHERE id=$1`, [mov]);
  });
});

test("los borrados hacen lo mismo que antes: SET NULL sólo de la columna, CASCADE donde lo había", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const { a } = base;
  await comoDuenio(base, async (q) => {
    const pedido = (
      await q(
        `INSERT INTO "Order"(id,"tenantId",code,"customerName","customerPhone","updatedAt") VALUES ($1,$2,987654,'x','0',now()) RETURNING id`,
        [id(), a.id],
      )
    ).rows[0].id;
    const mov = await nuevoMovimiento(q, a.id, { orderId: pedido });
    await q(`DELETE FROM "Order" WHERE id=$1`, [pedido]);
    const r = await q(`SELECT "orderId","tenantId" FROM "CashMovement" WHERE id=$1`, [mov]);
    assert.deepEqual(r.rows[0], { orderId: null, tenantId: a.id }, "SET NULL deja el negocio");

    const caja = await nuevaCaja(q, a.id);
    const enCaja = await nuevoMovimiento(q, a.id, { sessionId: caja });
    await q(`DELETE FROM "CashSession" WHERE id=$1`, [caja]);
    assert.equal((await q(`SELECT 1 FROM "CashMovement" WHERE id=$1`, [enCaja])).rowCount, 0, "CASCADE de la caja");
    await q(`DELETE FROM "CashMovement" WHERE id=$1`, [mov]);
  });
});
