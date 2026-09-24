import { test } from "node:test";
import assert from "node:assert/strict";
import { appPorId } from "@/apps/registro";
import { hrefDelTile } from "./href-del-tile";
import { leerFiltros, whereAuditoria } from "../auditoria/filtros";
import { auditoria } from "@/apps/kpis/administracion.server";
import type { ContextoLoader, DbKpi } from "@/apps/kpis/nucleo.server";

test("el tile de Auditoría abre la pantalla filtrada a hoy; el resto, su ruta", () => {
  const hoy = "2026-09-24";
  assert.equal(hrefDelTile(appPorId("auditoria"), hoy, true), "/admin/auditoria?desde=2026-09-24&hasta=2026-09-24");
  // Sin número (quien no lo ve) no hay nada que hacer coincidir: la pantalla entera.
  assert.equal(hrefDelTile(appPorId("auditoria"), hoy, false), "/admin/auditoria");
  assert.equal(hrefDelTile(appPorId("usuarios"), hoy, true), "/admin/usuarios");
});

test("el número de Auditoría cuenta con el MISMO where que la pantalla abierta desde el tile", async () => {
  const hoy = "2026-09-24";
  let where: unknown;
  const db = { auditLog: { count: async (a: { where: unknown }) => ((where = a.where), 7) } } as unknown as DbKpi;
  const r = await auditoria({ db, tenantId: "t-qa", hoy, ahora: new Date(), esMostrador: true, sustantivo: { uno: "corte", varios: "cortes" }, monto: true } as ContextoLoader);
  assert.deepEqual(r, { valor: "7", detalle: "acciones hoy" });
  // La pantalla, abierta con la URL del tile, lee estos filtros de la URL y arma este where.
  const url = new URL(hrefDelTile(appPorId("auditoria"), hoy, true), "http://x");
  const filtros = leerFiltros(Object.fromEntries(url.searchParams), new Set());
  assert.deepEqual(where, { tenantId: "t-qa", ...whereAuditoria(filtros) });
});
