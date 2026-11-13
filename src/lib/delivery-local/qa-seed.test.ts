// Datos de ejemplo de la prueba cerrada de Bitácora (qa-seed.ts): los dos frenos anti-producción, la
// carta real del seed y la siembra entera contra una base efímera (sin Postgres local, se saltea; en CI falla).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CARTA_DEL_SEED,
  ENDPOINT_NEON_MAIN,
  ENVIOS_DE_EJEMPLO,
  frenoPorContenido,
  frenoPorUrl,
  sembrarBitacoraQA,
  SLUG_QA,
} from "./qa-seed";
import { cartaPorCategoria } from "@/app/tienda/local/carta";
import { fichasDeLaCarta, planoDelNombre } from "./carta-del-local";
import { configDeliveryLocal } from "./config";
import { validarConfigEnvios } from "@/lib/envios/modelo";
import { baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";

const CLAVE = "provisoria-de-prueba-1234";

test("freno por URL: corta la rama main de Neon en cualquiera de sus formas", () => {
  for (const url of [
    `postgresql://app_rls:x@${ENDPOINT_NEON_MAIN}-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require`,
    `postgresql://neondb_owner:x@${ENDPOINT_NEON_MAIN}.sa-east-1.aws.neon.tech/neondb`,
    `postgres://u:x@${ENDPOINT_NEON_MAIN.toUpperCase()}-gbp.sa-east-1.aws.neon.tech/neondb`,
    `postgresql://u:x@sa-east-1.aws.neon.tech/neondb?options=endpoint%3D${ENDPOINT_NEON_MAIN}`,
  ]) {
    const r = frenoPorUrl(url);
    assert.equal(r.ok, false, url);
    assert.match((r as { motivo: string }).motivo, /producción/);
  }
});

test("freno por URL: sin URL, ilegible o que no es Postgres, también corta", () => {
  for (const url of [undefined, "", "   ", "no es una url", "mysql://u@localhost/db"]) assert.equal(frenoPorUrl(url).ok, false, String(url));
});

test("freno por URL: deja pasar otra rama de Neon y una base local", () => {
  assert.equal(frenoPorUrl("postgresql://u:x@ep-otra-rama-abc123-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require").ok, true);
  assert.equal(frenoPorUrl("postgresql://postgres@127.0.0.1:54331/postgres").ok, true);
});

const base = (slugs: string[]) => ({ tenant: { findMany: async () => slugs.map((slug) => ({ slug })) } });

test("freno por contenido: corta si hay un negocio real o una copia de él", async () => {
  for (const s of ["beauty-spa", "magra", "magra-demo", "shinevelas", "adosmanos"]) {
    const r = await frenoPorContenido(base([s]));
    assert.equal(r.ok, false, s);
    assert.match((r as { motivo: string }).motivo, new RegExp(s));
  }
});

test("freno por contenido: corta si hay cualquier otro negocio, aunque no sea real", async () => {
  assert.equal((await frenoPorContenido(base(["negocio-a"]))).ok, false);
  assert.equal((await frenoPorContenido(base([SLUG_QA, "negocio-a"]))).ok, false);
});

test("freno por contenido: deja pasar la base vacía o sólo con Bitácora", async () => {
  assert.equal((await frenoPorContenido(base([]))).ok, true);
  assert.equal((await frenoPorContenido(base([SLUG_QA]))).ok, true);
});

test("freno por contenido: si no se puede mirar la base, corta", async () => {
  const rota = { tenant: { findMany: async () => Promise.reject(new Error("sin conexión")) } };
  assert.equal((await frenoPorContenido(rota)).ok, false);
});

test("la carta del seed: 84 productos, códigos y nombres únicos, precios enteros y cada uno con su categoría", () => {
  assert.equal(CARTA_DEL_SEED.length, 84);
  assert.equal(new Set(CARTA_DEL_SEED.map((p) => p.codigo)).size, CARTA_DEL_SEED.length);
  assert.equal(new Set(CARTA_DEL_SEED.map((p) => planoDelNombre(p.name))).size, CARTA_DEL_SEED.length, "el nombre es la llave de la ficha");
  const fichas = fichasDeLaCarta(configDeliveryLocal(SLUG_QA)?.carta);
  for (const p of CARTA_DEL_SEED) {
    assert.ok(Number.isInteger(p.price) && p.price > 0, p.name);
    assert.match(p.codigo, /^bit-[a-z0-9-]+$/);
    assert.ok(fichas.get(planoDelNombre(p.name)), `«${p.name}» no tiene categoría en la carta del local`);
  }
  // Ninguno cae en «Más de la carta» en la vidriera (carta explícita + regla por palabras).
  const carta = cartaPorCategoria(CARTA_DEL_SEED, configDeliveryLocal(SLUG_QA)?.carta);
  assert.ok(!carta.some((g) => g.categoria.id === "otros"));
  assert.ok(validarConfigEnvios(ENVIOS_DE_EJEMPLO).ok, "los envíos de ejemplo pasan la validación de Ajustes → Envíos");
});

test("siembra contra una base: corta con otros negocios; en una base vacía siembra una vez y es idempotente", async (t) => {
  const b = await baseEfimeraParaElTest(t);
  if (!b) return;
  const db = await prismaComoDuenio(b);

  // La base del arnés trae dos negocios (A y B): el freno corta y no escribe nada.
  await assert.rejects(sembrarBitacoraQA(db, { ownerEmail: "titular@bitacora.test", ownerPassword: CLAVE }), /Freno anti-producción/);
  assert.equal(await db.tenant.count({ where: { slug: SLUG_QA } }), 0);

  // Como una rama sólo con estructura: sin negocios.
  await db.$executeRawUnsafe(`TRUNCATE "Tenant" CASCADE`);
  await assert.rejects(sembrarBitacoraQA(db, { ownerEmail: "titular@bitacora.test", ownerPassword: "corta" }), /12 caracteres/);
  assert.equal(await db.tenant.count(), 0);

  const r1 = await sembrarBitacoraQA(db, { ownerEmail: "titular@bitacora.test", ownerPassword: CLAVE });
  assert.equal(r1.tenantCreado, true);
  assert.equal(r1.ownerCreado, true);
  assert.equal(r1.productosNuevos, CARTA_DEL_SEED.length);
  assert.equal(r1.enviosCargados, true);

  const duenio = await db.user.findFirstOrThrow({ where: { tenantId: r1.tenantId }, select: { role: true, mustChangePassword: true, passwordHash: true } });
  assert.equal(duenio.role, "OWNER");
  assert.equal(duenio.mustChangePassword, true, "la provisoria obliga a cambiarla en el primer ingreso");
  assert.ok(!duenio.passwordHash.includes(CLAVE), "la contraseña se guarda con hash");

  // Lo que la vidriera lee (getStorefront): productos activos con precio.
  const visibles = await db.product.count({ where: { tenantId: r1.tenantId, active: true, deletedAt: null, price: { not: null } } });
  assert.equal(visibles, CARTA_DEL_SEED.length);

  // El dueño edita un precio en la prueba; volver a correr no lo pisa ni duplica nada.
  await db.product.update({ where: { tenantId_codigo: { tenantId: r1.tenantId, codigo: "bit-cortado" } }, data: { price: 9999 } });
  const r2 = await sembrarBitacoraQA(db, { ownerEmail: "titular@bitacora.test", ownerPassword: CLAVE });
  assert.deepEqual(
    { tenantCreado: r2.tenantCreado, ownerCreado: r2.ownerCreado, productosNuevos: r2.productosNuevos, enviosCargados: r2.enviosCargados },
    { tenantCreado: false, ownerCreado: false, productosNuevos: 0, enviosCargados: false },
  );
  assert.equal(await db.tenant.count(), 1);
  assert.equal(await db.user.count({ where: { tenantId: r1.tenantId } }), 1);
  assert.equal(await db.product.count({ where: { tenantId: r1.tenantId } }), CARTA_DEL_SEED.length);
  const cortado = await db.product.findUniqueOrThrow({ where: { tenantId_codigo: { tenantId: r1.tenantId, codigo: "bit-cortado" } }, select: { price: true } });
  assert.equal(cortado.price, 9999);
});
