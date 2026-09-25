// ENG-001 (docs/agent/BACKLOG.md): el seed de ejemplo sólo corre contra un Postgres de esta
// máquina. Cualquier otra base se rechaza antes de conectar, sin mostrar la contraseña.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { baseLocalParaSeed } from "./guarda-base";

const rechaza = (url: string | undefined) => {
  const r = baseLocalParaSeed(url);
  assert.equal(r.ok, false, `debería rechazar ${url}`);
  return r.ok ? "" : r.motivo;
};

test("el seed rechaza la base de producción en Neon, directa o por el pooler", () => {
  rechaza("postgresql://neondb_owner:clave-secreta@ep-cool-123.sa-east-1.aws.neon.tech/neondb?sslmode=require");
  rechaza("postgresql://app_rls:clave-secreta@ep-cool-123-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require");
});

test("el seed rechaza cualquier host que no sea esta máquina", () => {
  rechaza("postgresql://postgres@db.example.com:5432/erp");
  rechaza("postgresql://postgres@10.0.0.5/erp");
  rechaza("postgres://postgres@localhost.example.com/erp");
});

test("el parámetro host manda sobre el host de la URL, como en libpq", () => {
  rechaza("postgresql://postgres@localhost:5432/erp?host=ep-cool-123.aws.neon.tech");
  assert.equal(baseLocalParaSeed("postgresql://postgres@db.example.com/erp?host=/tmp/pgrun").ok, true);
});

test("el seed acepta un Postgres local por TCP o por socket", () => {
  for (const url of [
    "postgresql://postgres@localhost:5432/erp",
    "postgresql://postgres:postgres@127.0.0.1:5433/erp_local",
    "postgresql://postgres@[::1]:5432/erp",
    "postgresql://postgres@localhost:5433/erp_local?host=/tmp/pgrun",
    "postgresql:///erp?host=/var/run/postgresql",
  ]) {
    assert.equal(baseLocalParaSeed(url).ok, true, url);
  }
});

test("sin DATABASE_URL, ilegible o de otro motor, el seed no corre", () => {
  rechaza(undefined);
  rechaza("");
  rechaza("no es una url");
  rechaza("mysql://root@localhost/erp");
});

test("sin host en la URL el seed no corre: node-postgres tomaría PGHOST, que puede ser remoto", () => {
  rechaza("postgresql:///erp");
  rechaza("postgresql://postgres@/erp");
});

test("el motivo del rechazo nunca muestra la contraseña", () => {
  const motivo = rechaza("postgresql://neondb_owner:clave-secreta@ep-cool-123.aws.neon.tech/neondb");
  assert.ok(!motivo.includes("clave-secreta"), motivo);
  assert.match(motivo, /ep-cool-123\.aws\.neon\.tech/);
});

test("prisma/seed.ts verifica la base antes de conectarse y no borra sin negocio", () => {
  const fuente = readFileSync(path.join(process.cwd(), "prisma/seed.ts"), "utf8");
  const guarda = fuente.indexOf("baseLocalParaSeed(");
  const conexion = fuente.indexOf("new PrismaPg(");
  assert.ok(guarda >= 0, "seed.ts tiene que llamar a baseLocalParaSeed");
  assert.ok(conexion > guarda, "la guarda va antes de crear la conexión");
  assert.equal((fuente.match(/deleteMany\(\s*\)/g) ?? []).length, 0, "ningún deleteMany() sin where");
  for (const m of fuente.matchAll(/deleteMany\(([^)]*)\)/g)) {
    assert.match(m[1], /tenantId/, `deleteMany sin tenantId: ${m[0]}`);
  }
  assert.match(fuente, /\$transaction\(/, "borrar y sembrar en una sola transacción");
});
