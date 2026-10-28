// Entrada genérica y servicio de conexiones, sin base (dependencias inyectadas). El camino con
// Postgres y dos negocios está en conexiones-postgres.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { avisoMpFirmado, conectorMercadoPago } from "@/plugins/mercadopago/conector";
import { avisoWaFirmado, conectorWhatsApp } from "@/plugins/whatsapp/conector";
import { conectorArca } from "@/plugins/arca/conector";
import { construirRegistro } from "./registro";
import {
  ConexionError,
  crearConexion,
  elegirPorFirma,
  generarTokenDeRuta,
  hashDeRuta,
  negocioDelToken,
  type ConexionResuelta,
} from "./conexiones.server";
import {
  atenderAvisoDeApp,
  atenderAvisoPorConexion,
  atenderDesafio,
  filtroDeReclamo,
  LEASE_RECIBIDO_MS,
  MARCA_SIN_MANEJADOR,
  type DepsEntrada,
} from "./entrada.server";
import type { EntradaCruda } from "./contrato";

const reg = construirRegistro();
const MP: ConexionResuelta = { tenantId: "neg-a", conexionId: "cnx-a", conector: "mercadopago", cuentaExterna: "mp-a" };

function req(url: string, e: EntradaCruda): Request {
  const qs = new URLSearchParams(e.consulta).toString();
  return new Request(`${url}?${qs}`, {
    method: e.metodo,
    headers: e.encabezados as Record<string, string>,
    body: e.metodo === "POST" ? (e.cuerpo as unknown as BodyInit) : undefined,
  });
}

/** Deps sin base: el registro de eventos nunca se alcanza en estos casos (rechazan antes). */
function deps(sobre: Partial<DepsEntrada> = {}): DepsEntrada {
  return {
    registro: reg,
    env: {},
    ahora: () => new Date(),
    manejadores: {},
    conexionPorToken: async () => null,
    conexionPorCuenta: async () => null,
    leerSecreto: async () => null,
    limitar: () => null,
    ...sobre,
  };
}

test("el token lleva el negocio como selector y 256 bits al azar; el hash es del token entero", () => {
  const tk = generarTokenDeRuta("cmabc123tenant");
  assert.match(tk, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
  assert.equal(negocioDelToken(tk), "cmabc123tenant");
  assert.notEqual(generarTokenDeRuta("cmabc123tenant"), tk);
  assert.match(hashDeRuta(tk), /^[0-9a-f]{64}$/);
  for (const malo of ["", "sin-punto", `${tk}.x`, `${tk.split(".")[0]}.corto`, "%%%.".concat("a".repeat(43)), null]) {
    assert.equal(negocioDelToken(malo), null, String(malo));
  }
});

test("crearConexion: conector desconocido, credencial mal nombrada o sin el secreto de firma → error, sin tocar la base", async () => {
  const env = { INTEGRACIONES_MASTER_KEY: randomBytes(32).toString("base64") };
  const motivo = (p: Promise<unknown>) =>
    p.then(
      () => "sin error",
      (e: unknown) => (e instanceof ConexionError ? e.motivo : `otro: ${String(e)}`),
    );
  assert.equal(await motivo(crearConexion("neg-a", "no-existe", { credenciales: { access_token: "x" } }, { env })), "conector_desconocido");
  assert.equal(
    await motivo(crearConexion("neg-a", "mercadopago", { credenciales: { usuario: "x", webhook_secret: "y" } }, { env })),
    "datos_invalidos",
  );
  assert.equal(
    await motivo(crearConexion("neg-a", "mercadopago", { credenciales: { access_token: "APP_USR-1234567890" } }, { env })),
    "datos_invalidos",
  );
  assert.equal(
    await motivo(crearConexion("neg-a", "mercadopago", { cuentaExterna: "con espacio", credenciales: { webhook_secret: "y" } }, { env })),
    "datos_invalidos",
  );
  assert.equal(
    await motivo(crearConexion("neg-a", "mercadopago", { credenciales: { webhook_secret: "whsec-123456789012" } }, { env: {} })),
    "sin_clave_maestra",
  );
});

test("ruta por conexión: token desconocido → 404 vacío; sin secreto o sin KEK → 503; firma mala → 401", async () => {
  const ahora = new Date();
  const url = "https://erp.test/api/integraciones/c/tk";
  const r404 = await atenderAvisoPorConexion(req(url, avisoMpFirmado("s", ahora)), "tk", deps());
  assert.equal(r404.status, 404);
  assert.equal(await r404.text(), "");

  const conConexion = (leerSecreto: DepsEntrada["leerSecreto"]) => deps({ conexionPorToken: async () => MP, leerSecreto });
  const sinSecreto = await atenderAvisoPorConexion(req(url, avisoMpFirmado("s", ahora)), "tk", conConexion(async () => null));
  assert.equal(sinSecreto.status, 503);
  const sinKek = await atenderAvisoPorConexion(
    req(url, avisoMpFirmado("s", ahora)),
    "tk",
    conConexion(async () => {
      throw new Error("Falta INTEGRACIONES_MASTER_KEY");
    }),
  );
  assert.equal(sinKek.status, 503);
  const mala = await atenderAvisoPorConexion(req(url, avisoMpFirmado("otro-secreto", ahora)), "tk", conConexion(async () => "el-secreto"));
  assert.equal(mala.status, 401);
  const vieja = await atenderAvisoPorConexion(
    req(url, avisoMpFirmado("el-secreto", new Date(ahora.getTime() - 10 * 60_000))),
    "tk",
    conConexion(async () => "el-secreto"),
  );
  assert.equal(vieja.status, 401, "fuera de la ventana anti-replay");

  // Una conexión de un conector "url-de-app" no entra por la ruta con token.
  const wa = await atenderAvisoPorConexion(
    req(url, avisoMpFirmado("s", ahora)),
    "tk",
    deps({ conexionPorToken: async () => ({ ...MP, conector: "whatsapp" }), leerSecreto: async () => "s" }),
  );
  assert.equal(wa.status, 404);
  const limitado = await atenderAvisoPorConexion(req(url, avisoMpFirmado("s", ahora)), "tk", deps({ limitar: () => 7 }));
  assert.deepEqual([limitado.status, limitado.headers.get("retry-after")], [429, "7"]);
});

test("ruta de la aplicación (WhatsApp): desafío, firma de entorno y cuenta sin conexión", async () => {
  const url = "https://erp.test/api/integraciones/whatsapp";
  const desafio: EntradaCruda = {
    metodo: "GET",
    encabezados: {},
    consulta: { "hub.mode": "subscribe", "hub.verify_token": "tok-123", "hub.challenge": "777" },
    cuerpo: new Uint8Array(0),
  };
  const ok = await atenderDesafio(req(url, desafio), "whatsapp", deps({ env: { WHATSAPP_VERIFY_TOKEN: "tok-123" } }));
  assert.deepEqual([ok.status, await ok.text()], [200, "777"]);
  assert.equal((await atenderDesafio(req(url, desafio), "whatsapp", deps({ env: { WHATSAPP_VERIFY_TOKEN: "otro" } }))).status, 403);
  assert.equal((await atenderDesafio(req(url, desafio), "whatsapp", deps())).status, 503);
  assert.equal((await atenderDesafio(req(url, desafio), "mercadopago", deps())).status, 404);
  assert.equal((await atenderDesafio(req(url, desafio), "__proto__", deps())).status, 404);

  const aviso = avisoWaFirmado("app-secret");
  assert.equal((await atenderAvisoDeApp(req(url, aviso), "whatsapp", deps())).status, 503);
  assert.equal((await atenderAvisoDeApp(req(url, aviso), "whatsapp", deps({ env: { WHATSAPP_APP_SECRET: "otro" } }))).status, 401);
  const cuentas: string[] = [];
  const sinConexion = await atenderAvisoDeApp(
    req(url, aviso),
    "whatsapp",
    deps({
      env: { WHATSAPP_APP_SECRET: "app-secret" },
      conexionPorCuenta: async (_c, cuenta) => {
        cuentas.push(cuenta);
        return null;
      },
    }),
  );
  assert.equal(sinConexion.status, 200);
  assert.deepEqual(cuentas, ["109876543210987"]);
  assert.equal(((await sinConexion.json()) as { descartados: number }).descartados, 2);
  // MP no es "url-de-app": su aviso no entra por acá.
  assert.equal((await atenderAvisoDeApp(req(url, avisoMpFirmado("s", new Date())), "mercadopago", deps())).status, 404);
});

test("filtroDeReclamo: sin handler sólo 'fallido'; con handler también 'recibido' sin handler o vencido (lease)", () => {
  const ahora = new Date("2026-10-28T12:00:00Z");
  assert.deepEqual(filtroDeReclamo(ahora, false), { OR: [{ estado: "fallido" }] });
  const corte = new Date(ahora.getTime() - LEASE_RECIBIDO_MS);
  assert.deepEqual(filtroDeReclamo(ahora, true), {
    OR: [
      { estado: "fallido" },
      { estado: "recibido", resumen: MARCA_SIN_MANEJADOR },
      { estado: "recibido", procesadoEn: { lt: corte } },
      { estado: "recibido", procesadoEn: null, createdAt: { lt: corte } },
    ],
  });
});

test("elegirPorFirma: exactamente una conexión gana; ninguna, dos o demasiadas → rechazo", () => {
  const ahora = new Date();
  const aviso = avisoMpFirmado("sec-b", ahora);
  const c = (id: string, secreto: string | null) => ({ conexion: { ...MP, conexionId: id }, secreto });
  const una = elegirPorFirma(conectorMercadoPago, aviso, [c("a", "sec-a"), c("b", "sec-b"), c("x", null)], ahora);
  assert.ok(una.ok && una.conexion.conexionId === "b");
  assert.deepEqual(elegirPorFirma(conectorMercadoPago, aviso, [c("a", "sec-a")], ahora), { ok: false, motivo: "firma_invalida" });
  assert.deepEqual(elegirPorFirma(conectorMercadoPago, aviso, [c("a", null)], ahora), { ok: false, motivo: "sin_secreto" });
  // Dos NEGOCIOS con el mismo secreto → ambigua. Dos conexiones del MISMO negocio (reconexión) →
  // la primera, que conexionesDelConector da como la más reciente (certificación P1, ADV-reconexion).
  const deOtro = { conexion: { ...MP, tenantId: "neg-b", conexionId: "b" }, secreto: "sec-b" };
  assert.deepEqual(elegirPorFirma(conectorMercadoPago, aviso, [c("a", "sec-b"), deOtro], ahora), { ok: false, motivo: "ambigua" });
  const mismo = elegirPorFirma(conectorMercadoPago, aviso, [c("nueva", "sec-b"), c("vieja", "sec-b")], ahora);
  assert.ok(mismo.ok && mismo.conexion.conexionId === "nueva");
  assert.deepEqual(elegirPorFirma(conectorMercadoPago, aviso, null, ahora), { ok: false, motivo: "demasiadas" });
  const muchas = Array.from({ length: 21 }, (_, i) => c(`c${i}`, "sec-b"));
  assert.deepEqual(elegirPorFirma(conectorMercadoPago, aviso, muchas, ahora), { ok: false, motivo: "demasiadas" });
  const viejo = avisoMpFirmado("sec-b", new Date(ahora.getTime() - 10 * 60_000));
  assert.deepEqual(elegirPorFirma(conectorMercadoPago, viejo, [c("b", "sec-b")], ahora), { ok: false, motivo: "fuera_de_ventana" });
});

test("probarConexion de los tres conectores, con el transporte del simulador", async () => {
  const ahora = new Date();
  const mp = conectorMercadoPago.simulador().transporte!;
  assert.deepEqual(
    await conectorMercadoPago.probarConexion({ credenciales: { access_token: "TEST-token-valido-0000" }, transporte: mp, ahora }),
    { ok: true, detalle: "Mercado Pago respondió con la cuenta del negocio." },
  );
  assert.deepEqual(
    await conectorMercadoPago.probarConexion({ credenciales: { access_token: "vencido" }, transporte: mp, ahora }),
    { ok: false, codigo: "credencial_vencida" },
  );
  const arca = await conectorArca.probarConexion({ credenciales: {}, transporte: conectorArca.simulador().transporte!, ahora });
  assert.equal(arca.ok, true);
  const caido = await conectorArca.probarConexion({
    credenciales: {},
    transporte: async () => {
      throw new Error("red");
    },
    ahora,
  });
  assert.deepEqual(caido, { ok: false, codigo: "proveedor_caido" });
  assert.equal((await conectorWhatsApp.probarConexion({ credenciales: {}, transporte: mp, ahora })).ok, true);
});

test("lease de 'recibido' > maxDuration de toda ruta que despacha avisos (una ejecución viva no se reclama)", () => {
  const rutas = [
    "src/app/api/integraciones/c/[token]/route.ts",
    "src/app/api/integraciones/[conector]/route.ts",
    "src/app/api/webhooks/mercadopago/route.ts",
  ];
  for (const ruta of rutas) {
    const m = /export const maxDuration = (\d+);/.exec(readFileSync(path.join(process.cwd(), ruta), "utf8"));
    assert.ok(m, `${ruta} tiene que declarar maxDuration (sin él vale el tope de la cuenta, que puede igualar al lease)`);
    const ms = Number(m[1]) * 1000;
    assert.ok(ms + 60_000 <= LEASE_RECIBIDO_MS, `${ruta}: maxDuration ${m[1]} s + 1 min de margen supera el lease (${LEASE_RECIBIDO_MS} ms)`);
  }
});
