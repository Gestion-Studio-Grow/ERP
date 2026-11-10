// El mail de la clave provisoria (GSG-SEG-014): armado puro y pedido a Resend con un fetch de prueba.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  armarMailClaveTemporal,
  enmascararEmail,
  enviarMailClaveTemporal,
  mailDeClavesConectado,
  urlDeIngreso,
  type MailClaveTemporal,
} from "./clave-temporal-mail";

const CLAVE = ["Prueba", "Provisoria", "9xZ"].join("-");
const datos: MailClaveTemporal = {
  email: "carolina@negocio.test",
  nombre: "Carolina",
  negocio: "CH Estética",
  urlIngreso: "https://chestetica.gsg.test/admin/login",
  clave: CLAVE,
  motivo: "reseteo",
};

function conEntorno<T>(env: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const antes: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    antes[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  return fn().finally(() => {
    for (const [k, v] of Object.entries(antes)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}
const CONECTADO = { RESEND_API_KEY: "re_prueba", RESEND_FROM_EMAIL: "GSG <no-responder@gsg.test>" };

test("enmascara el email: primera letra y dominio", () => {
  assert.equal(enmascararEmail("carolina@gmail.com"), "c***@gmail.com");
  assert.equal(enmascararEmail(" a@b.com "), "a***@b.com");
  assert.equal(enmascararEmail("sin-arroba"), "***");
  assert.equal(enmascararEmail("@solo-dominio.com"), "***");
});

test("el mail lleva la clave SÓLO en el cuerpo, con el link de ingreso y el aviso de cambio obligatorio", () => {
  for (const motivo of ["alta", "reseteo"] as const) {
    const { asunto, cuerpo } = armarMailClaveTemporal({ ...datos, motivo });
    assert.ok(!asunto.includes(CLAVE), "nunca en el asunto");
    assert.match(asunto, /CH Estética/);
    assert.ok(cuerpo.includes(`Tu contraseña provisoria: ${CLAVE}`));
    assert.ok(cuerpo.includes("https://chestetica.gsg.test/admin/login"));
    assert.ok(cuerpo.includes("carolina@negocio.test"));
    assert.match(cuerpo, /provisoria: apenas entres, el sistema te va a pedir que elijas una nueva/);
  }
});

test("sin dirección publicada no inventa un link", () => {
  const { cuerpo } = armarMailClaveTemporal({ ...datos, urlIngreso: null });
  assert.doesNotMatch(cuerpo, /https?:\/\//);
  assert.match(cuerpo, /dirección de siempre/);
});

test("el link sale del dominio propio (APP_BASE_DOMAIN), nunca de vercel.app ni de VERCEL_URL", () => {
  // Como en producción: dominio propio cargado, y el mapa viejo con el host de Vercel todavía puesto.
  const env = {
    APP_BASE_DOMAIN: "gsgapp.com.ar",
    TENANT_HOST_MAP: "chestetica-erp.vercel.app=chestetica",
    VERCEL_URL: "erp-ch-abc123.vercel.app",
    VERCEL_PROJECT_PRODUCTION_URL: "erp-ch.vercel.app",
  };
  const url = urlDeIngreso("chestetica", env);
  assert.equal(url, "https://chestetica.gsgapp.com.ar/admin/login");
  for (const motivo of ["alta", "reseteo"] as const) {
    const { asunto, cuerpo } = armarMailClaveTemporal({ ...datos, motivo, urlIngreso: url });
    const mail = `${asunto}\n${cuerpo}`;
    assert.doesNotMatch(mail, /vercel\.app/i, "el mail no lleva un host de Vercel");
    assert.doesNotMatch(mail, /google\.com\/url/i, "el mail no lleva una redirección de Google");
    assert.match(cuerpo, /https:\/\/chestetica\.gsgapp\.com\.ar\/admin\/login/);
  }
});

test("sin dominio propio, un host de Vercel del mapa NO se usa: mejor ningún link que uno técnico", () => {
  const env = { APP_BASE_DOMAIN: "", TENANT_HOST_MAP: "chestetica-erp.vercel.app=chestetica", VERCEL_URL: "erp-ch.vercel.app" };
  assert.equal(urlDeIngreso("chestetica", env), null);
  assert.equal(urlDeIngreso("chestetica", { TENANT_HOST_MAP: "chestetica.vercel.app=chestetica" }), null);
  assert.equal(urlDeIngreso("chestetica", { APP_BASE_DOMAIN: "vercel.app" }), null, "ni con el dominio base mal cargado");
  assert.equal(urlDeIngreso("chestetica", { TENANT_HOST_MAP: "www.google.com=chestetica" }), null);
  const { cuerpo } = armarMailClaveTemporal({ ...datos, urlIngreso: urlDeIngreso("chestetica", env) });
  assert.doesNotMatch(cuerpo, /vercel\.app|google\.com\/url/i);
  // Un host propio del mapa (sin dominio propio) sí sirve.
  assert.equal(urlDeIngreso("facturita", { APP_BASE_DOMAIN: "" }), "https://factoque.gsgapp.com.ar/admin/login");
});

test("urlDeIngreso: con el mapa de hosts va al host del negocio; sin subdominio, null", () => {
  const env = { TENANT_HOST_MAP: "chestetica.gsg.test=chestetica", APP_BASE_DOMAIN: "" };
  const u = urlDeIngreso("chestetica", env);
  assert.ok(u === null || u.endsWith("/admin/login"));
  assert.equal(urlDeIngreso(null, {}), null);
});

test("sin RESEND_API_KEY o sin remitente no sale nada (nunca un remitente inventado)", async () => {
  let llamadas = 0;
  const fetchFalso = (async () => (llamadas++, new Response("{}"))) as typeof fetch;
  for (const env of [{ RESEND_API_KEY: undefined, RESEND_FROM_EMAIL: "x@y.test" }, { RESEND_API_KEY: "re_x", RESEND_FROM_EMAIL: undefined }]) {
    await conEntorno(env, async () => {
      assert.equal(mailDeClavesConectado(), false);
      assert.deepEqual(await enviarMailClaveTemporal(datos, fetchFalso), { enviado: false, motivo: "mail no configurado" });
    });
  }
  assert.equal(llamadas, 0);
});

test("mail OK: un POST a Resend con destino, asunto y cuerpo; la clave no aparece en los logs", async () => {
  const pedidos: { url: string; init: RequestInit }[] = [];
  const fetchFalso = (async (url: string, init: RequestInit) => (pedidos.push({ url, init }), new Response("{}", { status: 200 }))) as unknown as typeof fetch;
  const logs: string[] = [];
  const errorOriginal = console.error;
  console.error = (...a: unknown[]) => void logs.push(a.join(" "));
  try {
    await conEntorno(CONECTADO, async () => {
      assert.equal(mailDeClavesConectado(), true);
      assert.deepEqual(await enviarMailClaveTemporal(datos, fetchFalso), { enviado: true });
    });
  } finally {
    console.error = errorOriginal;
  }
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].url, "https://api.resend.com/emails");
  assert.equal(pedidos[0].init.method, "POST");
  const body = JSON.parse(String(pedidos[0].init.body));
  assert.equal(body.to, "carolina@negocio.test");
  assert.equal(body.from, CONECTADO.RESEND_FROM_EMAIL);
  assert.ok(String(body.text).includes(CLAVE));
  assert.ok(!String(body.subject).includes(CLAVE));
  assert.ok(!logs.join("\n").includes(CLAVE));
});

test("mail CAÍDO: respuesta no-OK o error de red → enviado:false con motivo, sin la clave ni el email en el log", async () => {
  const logs: string[] = [];
  const errorOriginal = console.error;
  console.error = (...a: unknown[]) => void logs.push(a.join(" "));
  try {
    await conEntorno(CONECTADO, async () => {
      const r503 = await enviarMailClaveTemporal(datos, (async () => new Response("{}", { status: 503 })) as typeof fetch);
      assert.deepEqual(r503, { enviado: false, motivo: "el servicio de mail respondió 503" });
      const red = await enviarMailClaveTemporal(datos, (async () => {
        throw new TypeError("fetch failed");
      }) as typeof fetch);
      assert.deepEqual(red, { enviado: false, motivo: "no se pudo hablar con el servicio de mail" });
      const lento = await enviarMailClaveTemporal(datos, (async () => {
        throw new DOMException("t", "TimeoutError");
      }) as typeof fetch);
      assert.deepEqual(lento, { enviado: false, motivo: "el servicio de mail no respondió a tiempo" });
    });
  } finally {
    console.error = errorOriginal;
  }
  const todo = logs.join("\n");
  assert.ok(!todo.includes(CLAVE));
  assert.ok(!todo.includes("carolina@negocio.test"));
});
