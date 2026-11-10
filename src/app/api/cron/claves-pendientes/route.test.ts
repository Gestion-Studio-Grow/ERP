// La ruta del reseteo pendiente no corre nada sin el CRON_SECRET correcto (falla cerrada).
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

const pedido = (auth?: string) =>
  new NextRequest("http://localhost/api/cron/claves-pendientes", { headers: auth ? { authorization: auth } : {} });

test("sin CRON_SECRET en el servidor: 503 y no se toca la base", async (t) => {
  const antes = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  t.after(() => {
    if (antes !== undefined) process.env.CRON_SECRET = antes;
  });
  assert.equal((await GET(pedido("Bearer cualquiera"))).status, 503);
  assert.equal((await POST(pedido())).status, 503);
});

test("con un secreto equivocado o sin header: 401", async (t) => {
  const antes = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "secreto-del-cron-de-prueba";
  t.after(() => {
    if (antes === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = antes;
  });
  assert.equal((await GET(pedido("Bearer otro"))).status, 401);
  assert.equal((await GET(pedido())).status, 401);
});
