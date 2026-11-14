// ============================================================================
// MANT-003 contra Postgres (base efímera): el permiso del titular (D4) y el borrador aprobado (D5/D6).
// ============================================================================
//
// Con la app y la consola como `app_rls` (igual que producción) se mide:
//   · PERMISO: sin la tabla, mensaje claro y nada guardado; sólo el OWNER de la SESIÓN lo cambia (un
//     tenantId/userId/rol del formulario se ignora); un titular de A no escribe el permiso de B; n2 sin
//     n1 se rechaza; la copia por mail queda en borrador (AuditLog), en la misma transacción.
//   · BORRADOR: aprobar/descartar va atado a la versión; dos aprobaciones a la vez → una; una versión
//     vieja tras un borrador nuevo → rechazo; un id cruzado de otro negocio no aprueba nada; en CH sólo
//     el dueño (rol «d»). Aprobar pasa el texto a la respuesta y deja quién aprobó; no envía nada.
//
// La tabla `SoporteConsentimiento` se crea acá con lo mínimo de prisma/pending-gate2/MANT_roles_soporte.sql
// (tabla, RLS tenant_isolation, SELECT/INSERT para app_rls): el archivo entero lo prueba
// roles-soporte-postgres.test.ts; este test no depende de sus roles.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const TABLA_MINIMA = [
  `CREATE TABLE IF NOT EXISTS "SoporteConsentimiento" (
    "id" TEXT NOT NULL PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id"),
    "nivel" TEXT NOT NULL CHECK ("nivel" IN ('n1', 'n2')), "aceptado" BOOLEAN NOT NULL,
    "versionTexto" TEXT NOT NULL, "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
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

test("permiso del titular (D4) y borrador aprobado (D5/D6): aislamiento, carrera, roles y tolerancia sin tabla", async (t) => {
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
  const { registrarConsentimientoConCopia, leerEstadoDelPermiso, ultimaCopiaEnBorrador } = await import("./consentimiento.server");
  const { cambiarTicket, fichaDeTicket } = await import("./tickets.server");
  base.alBorrar(() => operatorPrisma.$disconnect());
  const duenio = await prismaComoDuenio(base);
  const A = base.a;
  const B = base.b;
  const filasDe = (tenantId: string) => duenio.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "SoporteConsentimiento" WHERE "tenantId" = ${tenantId}`.then((r) => r[0].n);
  const borradoresDe = (tenantId: string) => duenio.auditLog.count({ where: { tenantId, entity: "MailBorrador" } });

  // ── PERMISO 1) Sin la tabla: mensaje claro, nada guardado ──
  const sinTabla = await ejecutarAccion({ negocio: A, usuario: A.duenia }, () => cambiarPermisoSoporteAction(null, fd({ nivel: "n1", aceptado: "on" })));
  assert.ok(sinTabla.tipo === "respuesta" && !sinTabla.valor.ok && /todavía no está habilitado/.test(sinTabla.valor.error), "sin tabla: lo dice");
  assert.deepEqual(await leerEstadoDelPermiso(A.id), { habilitado: false, vigente: { n1: false, n2: false } });
  assert.equal(await duenio.auditLog.count({ where: { tenantId: A.id, entity: { in: ["SoporteConsentimiento", "MailBorrador"] } } }), 0, "sin tabla no queda rastro");

  for (const sql of TABLA_MINIMA) await duenio.$executeRawUnsafe(sql);

  // ── PERMISO 2) Rol no OWNER: rechazado, nada guardado ──
  const recepcion = await ejecutarAccion({ negocio: A, usuario: A.recepcion }, () => cambiarPermisoSoporteAction(null, fd({ nivel: "n1", aceptado: "on" })));
  assert.ok(recepcion.tipo === "respuesta" && !recepcion.valor.ok && /titular/.test(recepcion.valor.error), "recepción no da permiso");
  // Aunque el formulario diga OWNER: el rol sale de la sesión.
  const disfrazada = await ejecutarAccion({ negocio: A, usuario: A.recepcion }, () =>
    cambiarPermisoSoporteAction(null, fd({ nivel: "n1", aceptado: "on", rol: "OWNER", role: "OWNER", userId: A.duenia.id })),
  );
  assert.ok(disfrazada.tipo === "respuesta" && !disfrazada.valor.ok, "un rol en el formulario no cuenta");
  assert.equal(await filasDe(A.id), 0);

  // ── PERMISO 3) n2 sin n1: rechazado ──
  const n2Solo = await ejecutarAccion({ negocio: A, usuario: A.duenia }, () => cambiarPermisoSoporteAction(null, fd({ nivel: "n2", aceptado: "on" })));
  assert.ok(n2Solo.tipo === "respuesta" && !n2Solo.valor.ok && /Primero/.test(n2Solo.valor.error), "n2 sin n1 no se guarda");
  assert.equal(await filasDe(A.id), 0);

  // ── PERMISO 4) El titular de A, con un tenantId de B en el formulario: escribe en A, nunca en B ──
  const ok = await ejecutarAccion({ negocio: A, usuario: A.duenia }, () =>
    cambiarPermisoSoporteAction(null, fd({ nivel: "n1", aceptado: "on", tenantId: B.id, negocio: B.id, userId: B.duenia.id })),
  );
  assert.ok(ok.tipo === "respuesta" && ok.valor.ok, "el titular da n1");
  assert.ok(ok.valor.ok && ok.valor.copia.asunto.includes("Diste permiso") && ok.valor.copia.para === A.duenia.email, "la copia queda armada para el titular");
  assert.equal(await filasDe(A.id), 1);
  assert.equal(await filasDe(B.id), 0, "nada en B");
  assert.equal(await borradoresDe(A.id), 1, "la copia por mail quedó en borrador");
  const copia = await duenio.auditLog.findFirstOrThrow({ where: { tenantId: A.id, entity: "MailBorrador" } });
  assert.equal((copia.changes as Record<string, unknown>).enviado, false, "no se envió");
  assert.equal((await ultimaCopiaEnBorrador(A.id))?.asunto, ok.valor.ok ? ok.valor.copia.asunto : "");
  assert.deepEqual(await leerEstadoDelPermiso(A.id), { habilitado: true, vigente: { n1: true, n2: false } });
  assert.deepEqual(await leerEstadoDelPermiso(B.id), { habilitado: true, vigente: { n1: false, n2: false } });

  // Directo al servidor: un OWNER de A con el negocio B → rechazado (el usuario no es de B).
  const cruzado = await registrarConsentimientoConCopia({ tenantId: B.id, userId: A.duenia.id, rol: "OWNER", nivel: "n1", aceptado: true }, operatorPrisma);
  assert.equal(cruzado.ok, false, "un titular de A no escribe el permiso de B");
  assert.equal(await filasDe(B.id), 0);
  assert.equal(await borradoresDe(B.id), 0);
  // La sesión de A contra el host de B tampoco escribe en B.
  const otroHost = await ejecutarAccion({ negocio: B, usuario: A.duenia }, () => cambiarPermisoSoporteAction(null, fd({ nivel: "n1", aceptado: "on" })));
  assert.ok(!(otroHost.tipo === "respuesta" && otroHost.valor.ok && (await filasDe(B.id)) > 0), "la sesión de A en el host de B no escribe en B");
  assert.equal(await filasDe(B.id), 0);

  // n2 con n1 vigente: sí. Sacar n1: n2 deja de valer.
  const n2 = await ejecutarAccion({ negocio: A, usuario: A.duenia }, () => cambiarPermisoSoporteAction(null, fd({ nivel: "n2", aceptado: "on" })));
  assert.ok(n2.tipo === "respuesta" && n2.valor.ok);
  const sacar = await ejecutarAccion({ negocio: A, usuario: A.duenia }, () => cambiarPermisoSoporteAction(null, fd({ nivel: "n1" })));
  assert.ok(sacar.tipo === "respuesta" && sacar.valor.ok && sacar.valor.copia.asunto.startsWith("Sacaste"));
  assert.deepEqual(await leerEstadoDelPermiso(A.id), { habilitado: true, vigente: { n1: false, n2: false } });

  // ── BORRADOR: un ticket en A y otro en B con el mismo número ──
  for (const n of [A, B]) {
    await duenio.supportTicket.create({ data: { tenantId: n.id, numero: 1, tipo: "otro", prioridad: "P3", asunto: `Pedido de ${n.nombre}`, canal: "consola", creadoPor: "operator:qa" } });
  }
  const sug = (respuesta: string) => ({ tipo: "otro" as const, prioridad: "P3" as const, respuesta, motivo: "prueba" });
  const t1 = new Date("2026-11-14T12:00:00.000Z");
  const t2 = new Date("2026-11-14T12:05:00.000Z");
  const tB = new Date("2026-11-14T12:01:00.000Z");
  const poner = (tenantId: string, texto: string, ahora: Date) =>
    cambiarTicket(operatorPrisma, { tenantId, numero: 1, operador: "soporte-qa", cambio: { que: "borrador", sugerencia: sug(texto) } }, ahora);
  const aprobar = (tenantId: string, version: unknown, rolOperador: "d" | "o" = "o", operador = "soporte-qa") =>
    cambiarTicket(operatorPrisma, { tenantId, numero: 1, operador, cambio: { que: "aprobar_borrador", version, rolOperador } });

  assert.deepEqual(await poner(A.id, "Respuesta vieja de A", t1), { ok: true });
  assert.deepEqual(await poner(B.id, "Respuesta de B", tB), { ok: true });
  const vieja = (await fichaDeTicket(operatorPrisma, A.id, 1))!.borradorVersion;
  assert.equal(vieja, t1.toISOString());

  // Versión vieja tras un borrador nuevo → rechazo.
  assert.deepEqual(await poner(A.id, "Respuesta nueva de A", t2), { ok: true });
  const nueva = (await fichaDeTicket(operatorPrisma, A.id, 1))!.borradorVersion;
  assert.notEqual(nueva, vieja);
  const rv = await aprobar(A.id, vieja);
  assert.ok(!rv.ok && /cambió/.test(rv.error), "una aprobación vieja no pisa el borrador nuevo");
  assert.equal((await fichaDeTicket(operatorPrisma, A.id, 1))!.respuesta, null);

  // Id cruzado: la versión de A contra el ticket #1 de B → rechazo; B queda igual.
  const rc = await aprobar(B.id, nueva);
  assert.ok(!rc.ok, "la versión de A no aprueba el borrador de B");
  const fichaB = (await fichaDeTicket(operatorPrisma, B.id, 1))!;
  assert.equal(fichaB.respuesta, null);
  assert.equal(fichaB.borradorIa?.respuesta, "Respuesta de B");
  assert.deepEqual(await aprobar(B.id, "cualquiera"), { ok: false, error: "El borrador cambió desde que lo abriste. Recargá la ficha y revisá el nuevo." });
  // Un número que en B no existe.
  const noExiste = await cambiarTicket(operatorPrisma, { tenantId: B.id, numero: 2, operador: "x", cambio: { que: "aprobar_borrador", version: nueva, rolOperador: "o" } });
  assert.deepEqual(noExiste, { ok: false, error: "Ese ticket no existe." });

  // Carrera: dos aprobaciones a la vez de la misma versión → una.
  const [c1, c2] = await Promise.all([aprobar(A.id, nueva, "o", "ana"), aprobar(A.id, nueva, "o", "beto")]);
  assert.equal([c1, c2].filter((r) => r.ok).length, 1, "una sola aprobación");
  const fallida = [c1, c2].find((r) => !r.ok);
  assert.ok(fallida && !fallida.ok && /Ya no hay borrador/.test(fallida.error));
  const fichaA = (await fichaDeTicket(operatorPrisma, A.id, 1))!;
  assert.equal(fichaA.respuesta, "Respuesta nueva de A", "aprobar pasa el texto a la respuesta");
  assert.equal(fichaA.borradorIa, null, "el borrador se consume");
  assert.ok(fichaA.respondidoEl);
  const aprobados = fichaA.eventos.filter((e) => e.tipo === "borrador_aprobado");
  assert.equal(aprobados.length, 1);
  assert.ok(["ana", "beto"].includes((aprobados[0].datos as Record<string, unknown>).aprobadoPor as string), "queda quién aprobó");

  // Descartar: atado a la versión también.
  assert.deepEqual(await poner(A.id, "Otra", new Date("2026-11-14T12:10:00.000Z")), { ok: true });
  const v3 = (await fichaDeTicket(operatorPrisma, A.id, 1))!.borradorVersion;
  const dv = await cambiarTicket(operatorPrisma, { tenantId: A.id, numero: 1, operador: "qa", cambio: { que: "descartar_borrador", version: vieja, rolOperador: "o" } });
  assert.ok(!dv.ok);
  assert.deepEqual(await cambiarTicket(operatorPrisma, { tenantId: A.id, numero: 1, operador: "qa", cambio: { que: "descartar_borrador", version: v3, rolOperador: "o" } }), { ok: true });
  const fichaA2 = (await fichaDeTicket(operatorPrisma, A.id, 1))!;
  assert.equal(fichaA2.borradorIa, null);
  assert.equal(fichaA2.respuesta, "Respuesta nueva de A", "descartar no toca la respuesta");

  // CH: sólo el dueño (rol «d»).
  await duenio.tenant.update({ where: { id: B.id }, data: { slug: "beauty-spa" } });
  const vB = fichaB.borradorVersion;
  const op = await aprobar(B.id, vB, "o");
  assert.deepEqual(op, { ok: false, error: "Este borrador lo aprueba sólo el dueño de GSG." });
  assert.deepEqual(await aprobar(B.id, vB, "d", "duenio"), { ok: true });
  assert.equal((await fichaDeTicket(operatorPrisma, B.id, 1))!.respuesta, "Respuesta de B");
});
