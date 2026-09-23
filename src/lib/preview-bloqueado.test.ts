// Un preview compilado contra la base de producción no atiende nada salvo /api/health.
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

async function conBloqueo<T>(valor: string | undefined, fn: () => Promise<T>) {
  const antes = process.env.GSG_PREVIEW_BLOQUEADO;
  if (valor === undefined) delete process.env.GSG_PREVIEW_BLOQUEADO;
  else process.env.GSG_PREVIEW_BLOQUEADO = valor;
  try {
    return await fn();
  } finally {
    if (antes === undefined) delete process.env.GSG_PREVIEW_BLOQUEADO;
    else process.env.GSG_PREVIEW_BLOQUEADO = antes;
  }
}

test("bloqueado: el panel, la consola del operador y la vidriera responden 503", async () => {
  await conBloqueo("1", async () => {
    for (const ruta of ["/admin", "/admin/caja", "/operador", "/operador/tenants/x", "/", "/tienda", "/api/cron/reminders"]) {
      const res = await proxy(new NextRequest(`https://preview.test${ruta}`));
      assert.equal(res.status, 503, ruta);
      assert.match(await res.text(), /base de datos de producción/);
    }
  });
});

test("bloqueado: /api/health sigue respondiendo (dice qué commit corre, no toca datos)", async () => {
  await conBloqueo("1", async () => {
    const res = await proxy(new NextRequest("https://preview.test/api/health"));
    assert.notEqual(res.status, 503);
  });
});

test("sin bloqueo el proxy se comporta como siempre", async () => {
  await conBloqueo(undefined, async () => {
    const res = await proxy(new NextRequest("https://app.test/admin/caja"));
    assert.notEqual(res.status, 503);
  });
});
