// ============================================================================
// Soporte GSG apagado: el titular SIEMPRE puede sacar el permiso (base efímera, como app_rls).
// ============================================================================
//
// Hallazgo del certificador de la tanda 3: con el interruptor «Soporte GSG» apagado, la pantalla y su
// action no guardaban nada, tampoco una revocación. Un permiso dado antes del apagado quedaba sin
// forma de sacarse y volvía a valer al prender. Ahora:
//   · apagado, sacar (n1 o n2) se guarda, con su AuditLog y la copia en borrador; dar NO se guarda;
//   · la regla vive en el servidor (registrarConsentimientoConCopia), no sólo en la action;
//   · al volver a prender, lo sacado sigue sacado;
//   · negativos: recepción no saca; el titular de otro negocio no saca el de éste;
//   · carrera: con el interruptor apagado, sacadas y dadas a la vez → todas las sacadas se guardan,
//     ninguna dada, y el resultado final es «sin permiso»;
//   · carrera con el apagado: un «dar» que esperaba el candado relee el interruptor y no da.
// La tabla mínima es la de borrador-y-permiso-postgres.test.ts (el archivo entero lo prueba
// roles-soporte-postgres.test.ts).

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const TABLA_MINIMA = [
  `CREATE TABLE IF NOT EXISTS "SoporteConsentimiento" (
    "id" TEXT NOT NULL PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id"),
    "nivel" TEXT NOT NULL CHECK ("nivel" IN ('n1', 'n2')), "aceptado" BOOLEAN NOT NULL,
    "versionTexto" TEXT NOT NULL, "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT clock_timestamp())`,
  `ALTER TABLE "SoporteConsentimiento" ENABLE ROW LEVEL SECURITY`,
  `CREATE POLICY tenant_isolation ON "SoporteConsentimiento"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true))`,
  `GRANT SELECT, INSERT ON "SoporteConsentimiento" TO app_rls`,
];

function fd(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

test("Soporte GSG apagado: sacar el permiso se guarda siempre, darlo no", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const antes = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "secreto-de-auth-qa";
  t.after(() => {
    if (antes === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = antes;
  });
  prepararAccionesDeServidor();

  const { operatorPrisma } = await import("@/lib/operator-db");
  const { cambiarPermisoSoporteAction } = await import("@/app/admin/(dashboard)/ajustes/soporte/actions");
  const { registrarConsentimientoConCopia, leerConsentimiento, permisoDadoAlgunaVez } = await import("./consentimiento.server");
  base.alBorrar(() => operatorPrisma.$disconnect());
  const duenio = await prismaComoDuenio(base);
  const A = base.a;
  const B = base.b;
  for (const sql of TABLA_MINIMA) await duenio.$executeRawUnsafe(sql);

  const interruptor = (tenantId: string, prender: boolean) =>
    duenio.auditLog.create({
      data: { tenantId, actor: "operator:qa", action: prender ? "interruptor.encender" : "interruptor.apagar", entity: "Interruptor", entityId: "soporte-gsg", channel: "operador" },
    });
  const accion = (negocio: typeof A, usuario: typeof A.duenia, campos: Record<string, string>) =>
    ejecutarAccion({ negocio, usuario }, () => cambiarPermisoSoporteAction(null, fd(campos)));
  const filas = (tenantId: string) =>
    duenio.$queryRaw<{ nivel: string; aceptado: boolean }[]>`SELECT nivel, aceptado FROM "SoporteConsentimiento" WHERE "tenantId" = ${tenantId} ORDER BY "createdAt", id`;

  assert.equal(await permisoDadoAlgunaVez(A.id), false, "sin filas: nunca lo dio (la pantalla en pausa no aparece)");
  // ── Prendido en A y en B: los titulares dan n1 y n2 ──
  await interruptor(A.id, true);
  await interruptor(B.id, true);
  for (const n of [A, B]) {
    for (const nivel of ["n1", "n2"]) {
      const r = await accion(n, n.duenia, { nivel, aceptado: "on" });
      assert.ok(r.tipo === "respuesta" && r.valor.ok, `${n.slug} da ${nivel}`);
    }
  }
  assert.deepEqual(await leerConsentimiento(A.id), { n1: true, n2: true });

  // ── Se apaga en A ──
  await new Promise((r) => setTimeout(r, 5)); // la fila de apagado, después de la de prendido
  await interruptor(A.id, false);
  const { soporteGsgPrendidoEn } = await import("./interruptor.server");
  assert.equal(await soporteGsgPrendidoEn(A.id), false);

  await t.test("negativo: apagado, dar no se guarda (ni por la action ni directo al servidor)", async () => {
    const antesN = (await filas(A.id)).length;
    const r = await accion(A, A.duenia, { nivel: "n1", aceptado: "on" });
    assert.ok(r.tipo === "respuesta" && !r.valor.ok && /no está disponible/.test(r.valor.error), "la action no da");
    const directo = await registrarConsentimientoConCopia({ tenantId: A.id, userId: A.duenia.id, rol: "OWNER", nivel: "n2", aceptado: true }, operatorPrisma);
    assert.ok(!directo.ok && /no está disponible/.test(directo.error), "el servidor no da");
    assert.equal((await filas(A.id)).length, antesN, "nada guardado");
  });

  await t.test("negativo: apagado, recepción no saca y el titular de B no saca el de A", async () => {
    const antesN = (await filas(A.id)).length;
    const rec = await accion(A, A.recepcion, { nivel: "n2", aceptado: "" });
    assert.ok(rec.tipo === "respuesta" && !rec.valor.ok && /titular/.test(rec.valor.error), "recepción no saca");
    const cruzado = await registrarConsentimientoConCopia({ tenantId: A.id, userId: B.duenia.id, rol: "OWNER", nivel: "n2", aceptado: false }, operatorPrisma);
    assert.equal(cruzado.ok, false, "el titular de B no saca el permiso de A");
    assert.equal((await filas(A.id)).length, antesN, "nada guardado");
    assert.deepEqual(await leerConsentimiento(A.id), { n1: true, n2: true });
  });

  await t.test("apagado, el titular saca n2 por la action: se guarda con su rastro y su copia", async () => {
    const r = await accion(A, A.duenia, { nivel: "n2", aceptado: "" });
    assert.ok(r.tipo === "respuesta" && r.valor.ok, r.tipo === "respuesta" && !r.valor.ok ? r.valor.error : "sin respuesta");
    assert.ok(r.valor.ok && r.valor.copia.para === A.duenia.email);
    assert.deepEqual(await leerConsentimiento(A.id), { n1: true, n2: false });
    const rastro = await duenio.auditLog.count({ where: { tenantId: A.id, action: "soporte.permiso.sacar" } });
    assert.equal(rastro, 1);
  });

  await t.test("carrera: apagado, sacadas y dadas a la vez → todas las sacadas, ninguna dada", async () => {
    const intentos = Array.from({ length: 8 }, (_, i) => ({ nivel: i % 4 < 2 ? "n1" : "n2", aceptado: i % 2 === 0 }));
    const res = await Promise.all(
      intentos.map((p) => registrarConsentimientoConCopia({ tenantId: A.id, userId: A.duenia.id, rol: "OWNER", ...p }, operatorPrisma)),
    );
    res.forEach((r, i) => {
      if (intentos[i]!.aceptado) assert.ok(!r.ok && /no está disponible/.test(r.error), `dada ${i} rechazada`);
      else assert.ok(r.ok, `sacada ${i} guardada: ${r.ok ? "" : r.error}`);
    });
    assert.deepEqual(await leerConsentimiento(A.id), { n1: false, n2: false });
    assert.equal(await permisoDadoAlgunaVez(A.id), true, "sacado todo, la pantalla en pausa sigue a mano para verlo");
    const dadasDespues = (await filas(A.id)).slice(4).filter((f) => f.aceptado);
    assert.equal(dadasDespues.length, 0, "ninguna fila «dada» después del apagado");
  });

  await t.test("al volver a prender, lo sacado sigue sacado (no vuelve a valer)", async () => {
    await new Promise((r) => setTimeout(r, 5));
    await interruptor(A.id, true);
    assert.equal(await soporteGsgPrendidoEn(A.id), true);
    assert.deepEqual(await leerConsentimiento(A.id), { n1: false, n2: false });
  });

  await t.test("B no se enteró: su permiso sigue y su interruptor sigue prendido", async () => {
    assert.equal(await soporteGsgPrendidoEn(B.id), true);
    assert.deepEqual(await leerConsentimiento(B.id), { n1: true, n2: true });
  });

  await t.test("carrera con el apagado: un «dar» que esperaba el candado se frena si el apagado entró antes", async () => {
    const pg = (await import("pg")).default;
    const otro = new pg.Client({ connectionString: base.urlDuenio });
    await otro.connect();
    try {
      // Otro clic de B tiene el candado del permiso; mientras, el «dar» ya pasó la primera lectura (prendido).
      await otro.query("BEGIN");
      await otro.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`soporte-permiso:${B.id}`]);
      const antesN = (await filas(B.id)).length;
      const dar = registrarConsentimientoConCopia({ tenantId: B.id, userId: B.duenia.id, rol: "OWNER", nivel: "n1", aceptado: true }, operatorPrisma);
      let esperando = false;
      for (let i = 0; i < 250 && !esperando; i++) {
        const r = await duenio.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_locks
          WHERE locktype = 'advisory' AND NOT granted AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`;
        esperando = r[0]!.n > 0;
        if (!esperando) await new Promise((ok) => setTimeout(ok, 20));
      }
      assert.ok(esperando, "el «dar» quedó esperando el candado");
      await new Promise((ok) => setTimeout(ok, 5));
      await interruptor(B.id, false); // GSG apaga B y se confirma mientras el «dar» espera
      await otro.query("COMMIT");
      const r = await dar;
      assert.ok(!r.ok && /no está disponible/.test(r.error), "con el candado tomado relee el interruptor: apagado, no da");
      assert.equal((await filas(B.id)).length, antesN, "nada guardado");
    } finally {
      await otro.query("ROLLBACK").catch(() => {});
      await otro.end().catch(() => {});
    }
  });
});
