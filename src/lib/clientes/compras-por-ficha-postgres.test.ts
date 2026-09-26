// Clientes muestra UN número de compras por clienta, sea cual sea el diseño (QA vuelta 2: la
// misma clienta tenía 35 compras en el diseño viejo y 33 en el nuevo, bajo el mismo «compras»).
// El criterio es el del motor comercial (lib/crm/lecturas.ts, `leerFichasConActividad`): pedidos
// no anulados dentro de la ventana de historial (reglas.ts, `ventanaHistorialDias`). Es el que ya
// usan el diseño nuevo, la ficha y «Recuperar»; el listado viejo contaba además los de antes.
// Contra Postgres real (src/test/base-efimera.ts). Sin Postgres local se saltea y lo dice.

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraDelArchivo } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();

test("la misma clienta tiene el mismo número de compras en el listado viejo y en el nuevo", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  const a = base.a.id;
  const c = new pg.Client({ connectionString: base.urlDuenio });
  await c.connect();
  try {
    await c.query(`INSERT INTO "Client" (id, "tenantId", name, phone, "updatedAt") VALUES ('cli_unificada', $1, 'Clienta Unificada', '1150001111', now())`, [a]);
    // Una compra reciente, una anulada y una de hace 600 días (fuera de los 548 de la ventana).
    await c.query(
      `INSERT INTO "Order" (id, "tenantId", code, "customerName", "customerPhone", "clientId", paid, status, "createdAt", "updatedAt") VALUES
         ('ord_uni_1', $1, 910001, 'Clienta Unificada', '1150001111', 'cli_unificada', true, 'DELIVERED', now() - interval '10 days', now()),
         ('ord_uni_2', $1, 910002, 'Clienta Unificada', '1150001111', 'cli_unificada', true, 'CANCELLED', now() - interval '5 days', now()),
         ('ord_uni_3', $1, 910003, 'Clienta Unificada', '1150001111', 'cli_unificada', true, 'DELIVERED', now() - interval '600 days', now())`,
      [a],
    );
  } finally {
    await c.end();
  }

  const [{ tenantTransaction }, { paginaDeFichasEn }, lecturas, { todayInBusinessTz }] = await Promise.all([
    import("@/lib/rls"),
    import("@/lib/clientes/lista-fichas.server"),
    import("@/lib/crm/lecturas"),
    import("@/lib/datetime"),
  ]);
  const ahora = new Date();
  const [viejo, nuevo] = await tenantTransaction(
    async (tx) => {
      const pagina = await paginaDeFichasEn(tx, a, { q: "Clienta Unificada", pagina: 1, rubro: "mostrador", ahora });
      const fichas = await lecturas.leerFichasConActividad(tx, a, { desde: lecturas.desdeHistorial(ahora), rubro: "mostrador" });
      const evaluadas = lecturas.evaluarFichas(fichas, "mostrador", todayInBusinessTz(), ahora);
      return [
        pagina.filas.find((f) => f.id === "cli_unificada")?.actividad,
        evaluadas.find(({ persona }) => persona.id === "cli_unificada")?.ev.cantidadVisitas,
      ];
    },
    { tenantId: a },
  );
  assert.equal(nuevo, 1, "diseño nuevo: la compra reciente (ni la anulada ni la de hace 600 días)");
  assert.equal(viejo, nuevo, "diseño viejo: el mismo número que el nuevo");
});
