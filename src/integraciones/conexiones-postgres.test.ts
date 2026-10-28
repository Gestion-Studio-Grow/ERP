// ============================================================================
// Conexiones por negocio y ruta genérica, con DOS negocios (Tanda P1, Postgres con RLS)
// ============================================================================
//
// Contra la base efímera del arnés (A = "magra", B = "breakpoint" en el QA): la app conecta
// como `app_rls` con RLS_ENFORCEMENT=on; lo que se mira "desde afuera" va con el dueño.
//
//  · crearConexion sin INTEGRACIONES_MASTER_KEY → error claro y cero filas (P1-C1);
//  · dos conexiones MP (una por negocio), una notificación por cada una por su token: cada
//    EventoIntegracion queda en SU negocio y el handler corre con SU tenant (P1-C2, P1-C6);
//  · la firma de A en la URL de B → 401; sin secreto → 503; token desconocido → 404 vacío;
//  · misma cuentaExterna en el otro negocio → rechazada (@@unique([conector, cuentaExterna]));
//  · reenvío → dedupe (en serie y en paralelo), el handler corre una sola vez;
//  · rotarCredencial cambia la DEK y ultimos4; la credencial vieja no verifica más (P1-C7).
//
// La KEK se genera acá, en memoria del proceso: nunca se escribe en un archivo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { avisoMpFirmado } from "@/plugins/mercadopago/conector";
import type { EntradaCruda } from "./contrato";
import type { ContextoHandler, DepsEntrada } from "./entrada.server";

const laBase = baseEfimeraDelArchivo();
const env = process.env as Record<string, string | undefined>;

const SECRETO_A = "whsec-negocio-A-7c1d9e2f4a6b";
const SECRETO_B = "whsec-negocio-B-0e8a3c5d7f91";

function aRequest(token: string, e: EntradaCruda): Request {
  const qs = new URLSearchParams(e.consulta).toString();
  return new Request(`https://erp.test/api/integraciones/c/${token}?${qs}`, {
    method: "POST",
    headers: e.encabezados as Record<string, string>,
    body: e.cuerpo as unknown as BodyInit,
  });
}

interface Estado {
  base: BaseEfimera;
  duenio: Awaited<ReturnType<typeof prismaComoDuenio>>;
  m: typeof import("./conexiones.server");
  ent: typeof import("./entrada.server");
  llamados: Array<{ ctx: ContextoHandler; tenantDelStore: string | undefined; pedidosVisibles: number }>;
  deps: () => DepsEntrada;
}
let estado: Estado | null = null;

async function preparar(t: import("node:test").TestContext): Promise<Estado | null> {
  if (estado) return estado;
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  Object.assign(env, { DB_CONNECTION_LIMIT: "4", DB_CONNECT_TIMEOUT_MS: "3000" });
  delete env.INTEGRACIONES_MASTER_KEY;
  delete env.INTEGRACIONES_MASTER_KEY_ID;
  const duenio = await prismaComoDuenio(base);
  const m = await import("./conexiones.server");
  const ent = await import("./entrada.server");
  const { prisma } = await import("@/lib/prisma");
  const { getTenantStore } = await import("@/lib/tenant-context");
  const llamados: Estado["llamados"] = [];
  const yaFallaron = new Set<string>();
  const deps = (): DepsEntrada => ({
    ...ent.depsDeProduccion(),
    limitar: () => null,
    manejadores: {
      // El handler lee pedidos con el cliente de la app (RLS): sólo tiene que ver los de SU negocio.
      mercadopago: async (ctx) => {
        const pedidosVisibles = await prisma.order.count();
        llamados.push({ ctx, tenantDelStore: getTenantStore()?.tenantId, pedidosVisibles });
        if (ctx.evento.idExterno.includes("falla-una-vez") && !yaFallaron.has(ctx.evento.idExterno)) {
          yaFallaron.add(ctx.evento.idExterno);
          throw new Error("falla simulada");
        }
        return { estado: "procesado", resumen: "pago visto" };
      },
    },
  });
  estado = { base, duenio, m, ent, llamados, deps };
  return estado;
}

const nuevaKek = () => randomBytes(32).toString("base64");

test("P1-C1: sin INTEGRACIONES_MASTER_KEY no se escribe nada y el error lo dice", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  delete env.INTEGRACIONES_MASTER_KEY;
  await assert.rejects(
    s.m.crearConexion(s.base.a.id, "mercadopago", {
      cuentaExterna: "mp-cuenta-a",
      credenciales: { access_token: "APP_USR-token-a-000011112222", webhook_secret: SECRETO_A },
    }),
    (e: unknown) => e instanceof s.m.ConexionError && e.motivo === "sin_clave_maestra" && /INTEGRACIONES_MASTER_KEY/.test(e.message),
  );
  assert.equal(await s.duenio.integracionConexion.count(), 0);
  assert.equal(await s.duenio.integracionCredencial.count(), 0);
});

test("P1-C1/C2/C6: dos negocios, dos conexiones MP, un aviso por cada una, cero cruce, dedupe", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  env.INTEGRACIONES_MASTER_KEY = nuevaKek();
  const { a, b } = s.base;
  const ca = await s.m.crearConexion(a.id, "mercadopago", {
    cuentaExterna: "mp-cuenta-a",
    credenciales: { access_token: "APP_USR-token-a-000011112222", webhook_secret: SECRETO_A },
    conectadaPor: "cli",
  });
  const cb = await s.m.crearConexion(b.id, "mercadopago", {
    cuentaExterna: "mp-cuenta-b",
    credenciales: { access_token: "APP_USR-token-b-333344445555", webhook_secret: SECRETO_B },
    conectadaPor: "cli",
  });
  assert.ok(ca.token && cb.token && ca.token !== cb.token);
  assert.equal(s.m.negocioDelToken(ca.token), a.id);

  // Las credenciales quedan selladas: nada en claro, ultimos4 a la vista.
  const creds = await s.duenio.integracionCredencial.findMany({ where: { conexionId: ca.conexionId } });
  assert.equal(creds.length, 2);
  for (const c of creds) {
    assert.equal(c.tenantId, a.id);
    assert.ok(!c.sealed.includes(SECRETO_A) && !c.sealed.includes("APP_USR"));
  }
  assert.equal(creds.find((c) => c.campo === "webhook_secret")?.ultimos4, SECRETO_A.slice(-4));
  const filaA = await s.duenio.integracionConexion.findUnique({ where: { id: ca.conexionId } });
  assert.equal(filaA?.rutaHash, s.m.hashDeRuta(ca.token));
  assert.ok(!JSON.stringify(filaA).includes(ca.token.split(".")[1]), "el token no se guarda, sólo su hash");

  // La misma cuenta de MP en el otro negocio → rechazada por la base, y no queda nada a medias.
  await assert.rejects(
    s.m.crearConexion(b.id, "mercadopago", {
      cuentaExterna: "mp-cuenta-a",
      credenciales: { access_token: "APP_USR-token-x-999988887777", webhook_secret: "whsec-x-123456789abc" },
    }),
    (e: unknown) => e instanceof s.m.ConexionError && e.motivo === "cuenta_en_uso",
  );
  assert.equal(await s.duenio.integracionConexion.count({ where: { tenantId: b.id } }), 1);
  assert.equal(await s.duenio.integracionCredencial.count({ where: { tenantId: b.id } }), 2);

  // Por la ruta real (sin handler en producción todavía): queda "recibido", con su negocio.
  const { POST } = await import("@/app/api/integraciones/c/[token]/route");
  const ahora = new Date();
  const r0 = await POST(aRequest(ca.token, avisoMpFirmado(SECRETO_A, ahora, { pagoId: "900", requestId: "req-ruta-1" })), {
    params: Promise.resolve({ token: ca.token }),
  });
  assert.equal(r0.status, 200);
  const ev0 = await s.duenio.eventoIntegracion.findMany({ where: { idExterno: "pago:900:req-ruta-1" } });
  assert.deepEqual(ev0.map((e) => [e.tenantId, e.conexionId, e.estado]), [[a.id, ca.conexionId, "recibido"]]);

  // Con el handler: una notificación por cada negocio.
  const enviar = (token: string, e: EntradaCruda) => s.ent.atenderAvisoPorConexion(aRequest(token, e), token, s.deps());
  const ra = await enviar(ca.token, avisoMpFirmado(SECRETO_A, ahora, { pagoId: "1001", requestId: "req-a-1" }));
  const rb = await enviar(cb.token, avisoMpFirmado(SECRETO_B, ahora, { pagoId: "2002", requestId: "req-b-1" }));
  assert.equal(ra.status, 200);
  assert.equal(rb.status, 200);
  assert.equal(s.llamados.length, 2);
  const [la, lb] = s.llamados;
  assert.deepEqual([la.ctx.tenantId, la.tenantDelStore, la.ctx.conexionId], [a.id, a.id, ca.conexionId]);
  assert.deepEqual([lb.ctx.tenantId, lb.tenantDelStore, lb.ctx.conexionId], [b.id, b.id, cb.conexionId]);
  assert.equal(la.pedidosVisibles, a.pedidos.length, "el handler de A ve sólo los pedidos de A");
  assert.equal(lb.pedidosVisibles, b.pedidos.length, "el handler de B ve sólo los pedidos de B");

  const eventos = await s.duenio.eventoIntegracion.findMany({ where: { idExterno: { in: ["pago:1001:req-a-1", "pago:2002:req-b-1"] } } });
  assert.deepEqual(
    eventos.map((e) => [e.idExterno, e.tenantId, e.conexionId, e.estado]).sort(),
    [
      ["pago:1001:req-a-1", a.id, ca.conexionId, "procesado"],
      ["pago:2002:req-b-1", b.id, cb.conexionId, "procesado"],
    ],
  );
  // Cero cruce: ningún evento de un negocio colgado de la conexión del otro.
  assert.equal(await s.duenio.eventoIntegracion.count({ where: { tenantId: a.id, conexionId: cb.conexionId } }), 0);
  assert.equal(await s.duenio.eventoIntegracion.count({ where: { tenantId: b.id, conexionId: ca.conexionId } }), 0);

  // La firma de A en la URL de B → 401, sin fila ni handler.
  const cruzada = await enviar(cb.token, avisoMpFirmado(SECRETO_A, ahora, { pagoId: "1001", requestId: "req-cruce" }));
  assert.equal(cruzada.status, 401);
  assert.equal(await s.duenio.eventoIntegracion.count({ where: { idExterno: { contains: "req-cruce" } } }), 0);

  // Reenvío del mismo aviso: en serie y en paralelo → dedupe, el handler no vuelve a correr.
  const mismo = () => enviar(ca.token!, avisoMpFirmado(SECRETO_A, ahora, { pagoId: "1001", requestId: "req-a-1" }));
  const serie = await mismo();
  assert.equal(serie.status, 200);
  assert.equal(((await serie.json()) as { duplicados: number }).duplicados, 1);
  const paralelo = await Promise.all([mismo(), mismo(), mismo()]);
  assert.ok(paralelo.every((r) => r.status === 200));
  assert.equal(s.llamados.length, 2);
  assert.equal(await s.duenio.eventoIntegracion.count({ where: { idExterno: "pago:1001:req-a-1" } }), 1);

  // Un aviso nuevo y distinto en paralelo, varias veces: una sola fila y un solo handler.
  await Promise.all([1, 2, 3].map(() => enviar(cb.token!, avisoMpFirmado(SECRETO_B, ahora, { pagoId: "2003", requestId: "req-b-par" }))));
  assert.equal(await s.duenio.eventoIntegracion.count({ where: { idExterno: "pago:2003:req-b-par" } }), 1);
  assert.equal(s.llamados.filter((l) => l.ctx.evento.idExterno === "pago:2003:req-b-par").length, 1);

  // Token desconocido, mal formado o con el negocio de otro → 404 vacío (sin pista).
  const ajeno = `${cb.token.split(".")[0]}.${ca.token.split(".")[1]}`;
  const inventado = `${ca.token.split(".")[0]}.${randomBytes(32).toString("base64url")}`;
  for (const tk of [ajeno, inventado, "no-es-un-token", `${ca.token}x`]) {
    const r = await enviar(tk, avisoMpFirmado(SECRETO_A, ahora, { pagoId: "1", requestId: "req-404" }));
    assert.equal(r.status, 404, tk);
    assert.equal(await r.text(), "");
  }
});

test("handler que falla → 500 y fallido; el reenvío lo reclama y lo procesa una vez", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const ca = await s.duenio.integracionConexion.findFirst({ where: { cuentaExterna: "mp-cuenta-a" } });
  assert.ok(ca);
  // El token no se guarda: se arma una conexión nueva para tenerlo.
  const nueva = await s.m.crearConexion(s.base.a.id, "mercadopago", {
    cuentaExterna: "mp-cuenta-a2",
    credenciales: { access_token: "APP_USR-token-a2-00001111", webhook_secret: SECRETO_A },
  });
  const aviso = () => avisoMpFirmado(SECRETO_A, new Date(), { pagoId: "3003", requestId: "falla-una-vez" });
  const r1 = await s.ent.atenderAvisoPorConexion(aRequest(nueva.token!, aviso()), nueva.token!, s.deps());
  assert.equal(r1.status, 500);
  const f1 = await s.duenio.eventoIntegracion.findFirst({ where: { idExterno: "pago:3003:falla-una-vez" } });
  assert.equal(f1?.estado, "fallido");
  const r2 = await s.ent.atenderAvisoPorConexion(aRequest(nueva.token!, aviso()), nueva.token!, s.deps());
  assert.equal(r2.status, 200);
  const f2 = await s.duenio.eventoIntegracion.findFirst({ where: { idExterno: "pago:3003:falla-una-vez" } });
  assert.deepEqual([f2?.estado, f2?.intentos], ["procesado", 2]);
  const r3 = await s.ent.atenderAvisoPorConexion(aRequest(nueva.token!, aviso()), nueva.token!, s.deps());
  assert.equal(((await r3.json()) as { duplicados: number }).duplicados, 1);
});

test("P1-C7: rotarCredencial cambia DEK y ultimos4; la vieja deja de verificar. Sin KEK → 503", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { a, b } = s.base;
  const c = await s.m.crearConexion(a.id, "mercadopago", {
    cuentaExterna: "mp-cuenta-rotar",
    credenciales: { access_token: "APP_USR-token-r-00002222", webhook_secret: "whsec-viejo-aaaa1111" },
  });
  const antes = await s.duenio.integracionCredencial.findFirst({ where: { conexionId: c.conexionId, campo: "webhook_secret" } });
  const nuevo = "whsec-nuevo-bbbb2222";
  const r = await s.m.rotarCredencial(a.id, c.conexionId, "webhook_secret", nuevo, { cargadaPor: "cli" });
  assert.equal(r.ultimos4, "2222");
  const despues = await s.duenio.integracionCredencial.findFirst({ where: { conexionId: c.conexionId, campo: "webhook_secret" } });
  assert.ok(antes && despues);
  assert.notEqual(despues.wrappedDek, antes.wrappedDek, "DEK nueva");
  assert.notEqual(despues.sealed, antes.sealed);
  assert.deepEqual([antes.ultimos4, despues.ultimos4], ["1111", "2222"]);
  assert.equal(await s.m.leerCredencial(a.id, c.conexionId, "webhook_secret"), nuevo);

  const enviar = (secreto: string, req: string) =>
    s.ent.atenderAvisoPorConexion(aRequest(c.token!, avisoMpFirmado(secreto, new Date(), { pagoId: "4004", requestId: req })), c.token!, s.deps());
  assert.equal((await enviar("whsec-viejo-aaaa1111", "rot-1")).status, 401);
  assert.equal((await enviar(nuevo, "rot-2")).status, 200);

  // Otro negocio no rota la credencial de A (RLS + candado): "credencial_inexistente".
  await assert.rejects(
    s.m.rotarCredencial(b.id, c.conexionId, "webhook_secret", "whsec-intruso-cccc3333"),
    (e: unknown) => e instanceof s.m.ConexionError && e.motivo === "credencial_inexistente",
  );
  assert.equal(await s.m.leerCredencial(a.id, c.conexionId, "webhook_secret"), nuevo);

  // Sin la KEK, la firma no se puede verificar: 503 (fail-closed), nunca pasa.
  const kek = env.INTEGRACIONES_MASTER_KEY;
  delete env.INTEGRACIONES_MASTER_KEY;
  try {
    assert.equal((await enviar(nuevo, "rot-3")).status, 503);
  } finally {
    env.INTEGRACIONES_MASTER_KEY = kek;
  }
});

test("P1-C5 (servicio): resolverConexionPorFirma elige la conexión que firmó, entre negocios", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { a, b } = s.base;
  for (const n of [a, b]) {
    await s.duenio.tenant.update({ where: { id: n.id }, data: { modules: { push: "mercadopago" } } });
  }
  // Las conexiones de A comparten SECRETO_A (cuenta-a y cuenta-a2): una firma de A es ambigua.
  const deB = await s.m.resolverConexionPorFirma("mercadopago", avisoMpFirmado(SECRETO_B, new Date()), new Date());
  assert.ok(deB.ok);
  assert.equal(deB.ok && deB.conexion.tenantId, b.id);
  const deA = await s.m.resolverConexionPorFirma("mercadopago", avisoMpFirmado(SECRETO_A, new Date()), new Date());
  assert.deepEqual(deA, { ok: false, motivo: "ambigua" });
  const nadie = await s.m.resolverConexionPorFirma("mercadopago", avisoMpFirmado("whsec-de-nadie-0000", new Date()), new Date());
  assert.deepEqual(nadie, { ok: false, motivo: "firma_invalida" });
});
