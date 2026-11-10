// ============================================================================
// GSG-SEG-014 · RESETEO PENDIENTE contra Postgres con RLS (base efímera, src/test/base-efimera.ts).
//
// El reseteo de Carolina corre solo en producción (cron diario). Acá se prueba el ejecutor real con la
// conexión de la consola sujeta a RLS, como en producción, y un mail de prueba que acierta o falla:
//   · mail caído → no cambia nada (hash, flag) y la falla queda auditada; no cuenta como hecho;
//   · mail OK → cambia el hash a la clave del mail, deja el cambio obligatorio y una auditoría con la
//     clave del pendiente (sin la contraseña);
//   · corridas repetidas, también a la vez → un solo reseteo (candado + búsqueda en la auditoría);
//   · el PORTÓN: con la provisoria, la sesión del dueño no pasa hasta que la cambia.
// Sin Postgres local se saltea con el motivo (en CI falla).
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import type { MailClaveTemporal } from "@/lib/clave-temporal-mail";

test("reseteo pendiente: mail caído no cambia nada; mail OK resetea una sola vez y el portón frena", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const antes = { ...process.env };
  // Como en producción: dominio propio cargado, el host viejo de Vercel todavía en el mapa y VERCEL_URL
  // puesta. El link del mail tiene que salir del dominio propio (el de Carolina salió con vercel.app).
  const ENV_DE_PRUEBA = {
    RESEND_API_KEY: "re_prueba",
    RESEND_FROM_EMAIL: "GSG <avisos@gsgapp.com.ar>",
    APP_BASE_DOMAIN: "gsgapp.com.ar",
    TENANT_HOST_MAP: `${base.a.subdominio}-erp.vercel.app=${base.a.subdominio}`,
    VERCEL_URL: "erp-ch-prueba.vercel.app",
  };
  Object.assign(process.env, ENV_DE_PRUEBA);
  const restaurarEntorno = () => {
    for (const k of Object.keys(ENV_DE_PRUEBA)) {
      if (antes[k] === undefined) delete process.env[k];
      else process.env[k] = antes[k];
    }
  };
  t.after(restaurarEntorno);
  prepararAccionesDeServidor();

  const duenio = await prismaComoDuenio(base);
  const { correrResetsPendientesEnLaBase } = await import("@/lib/claves-pendientes.server");
  const { verifyPassword } = await import("@/lib/auth-password");
  const a = base.a;
  // Declarada hoy y con 30 días por delante: el test no depende de la fecha en que corre.
  const dia = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const pendiente = { clave: `${dia(Date.now())}-prueba-owner`, slug: a.slug, motivo: "test", vence: dia(Date.now() + 30 * 86_400_000) };
  const fila = () =>
    duenio.user.findUniqueOrThrow({ where: { id: a.duenia.id }, select: { passwordHash: true, mustChangePassword: true } });
  const cuenta = (action: string) => duenio.auditLog.count({ where: { tenantId: a.id, action } });
  const enviados: MailClaveTemporal[] = [];
  const mailOk = async (d: MailClaveTemporal) => (enviados.push(d), { enviado: true as const });
  const mailCaido = async () => ({ enviado: false as const, motivo: "el servicio de mail respondió 503" });

  const original = await fila();

  // 1) Mail caído: nada cambia, la falla se audita, no cuenta como hecho.
  const [caido] = await correrResetsPendientesEnLaBase([pendiente], mailCaido);
  assert.equal(caido.estado, "fallo");
  assert.deepEqual(await fila(), original);
  assert.equal(await cuenta("owner.password.reset"), 0);
  assert.equal(await cuenta("clave_temporal.mail_fallido"), 1);

  // 2) Mail OK, tres corridas, dos a la vez: un solo reseteo.
  const [primera, segunda] = await Promise.all([
    correrResetsPendientesEnLaBase([pendiente], mailOk),
    correrResetsPendientesEnLaBase([pendiente], mailOk),
  ]);
  const tercera = await correrResetsPendientesEnLaBase([pendiente], mailOk);
  assert.deepEqual([primera[0].estado, segunda[0].estado].sort(), ["hecho", "ya-estaba"]);
  assert.equal(tercera[0].estado, "ya-estaba");
  assert.equal(enviados.length, 1, "un solo mail");
  assert.equal(enviados[0].email, a.duenia.email);
  assert.equal(enviados[0].motivo, "reseteo");
  assert.equal(enviados[0].urlIngreso, `https://${a.subdominio}.gsgapp.com.ar/admin/login`, "el link es el del dominio propio");
  assert.doesNotMatch(JSON.stringify(enviados[0]), /vercel\.app|google\.com\/url/i);

  const despues = await fila();
  assert.equal(despues.mustChangePassword, true);
  assert.equal(await verifyPassword(enviados[0].clave, despues.passwordHash), true, "la clave del mail es la que quedó");
  const audits = await duenio.auditLog.findMany({ where: { tenantId: a.id, action: "owner.password.reset" }, select: { actor: true, changes: true } });
  assert.equal(audits.length, 1);
  assert.equal(audits[0].actor, "system:claves-pendientes");
  assert.equal((audits[0].changes as { pendiente?: string }).pendiente, pendiente.clave);
  assert.ok(!JSON.stringify(audits).includes(enviados[0].clave), "la auditoría no lleva la clave");

  // 3) El otro negocio no se tocó.
  const deB = await duenio.auditLog.count({ where: { tenantId: base.b.id, action: "owner.password.reset" } });
  assert.equal(deB, 0);

  // 4) Portón del cambio obligatorio: con la provisoria, la sesión del dueño no pasa. La sesión resuelve
  //    el negocio por el host del arnés: vuelve el ruteo del arnés (sin el dominio propio de arriba).
  restaurarEntorno();
  const { getCurrentUser } = await import("@/lib/session");
  const yo = await ejecutarAccion({ negocio: a, usuario: a.duenia }, () => getCurrentUser());
  assert.equal(yo.tipo === "respuesta" && yo.valor, null, "con el cambio pendiente no hay sesión útil");
});
