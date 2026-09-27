// El ingreso a la consola como formulario HTML común (route.ts): se ejecuta el POST real, con el
// limitador y el portón (proxy) de verdad.
//
// El caso que lo motivó: una página abierta antes de publicar mandaba el id de una Server Action que
// la versión nueva no conocía, y el dueño veía «Se produjo un error inesperado». Acá el pedido es
// lo que manda un <form method="post"> de CUALQUIER versión: campos urlencoded a una dirección fija,
// sin id de action ni JavaScript.
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { leerSesionOperador } from "@/lib/operator-auth";
import { proxy } from "@/proxy";
import { POST } from "./route";

const ENV = {
  NODE_ENV: "production",
  AUTH_SECRET: "a".repeat(40),
  OPERATOR_SECRET: "s".repeat(40),
  OPERATOR_PASSWORD: "lab-clave-del-duenio\n", // con el Enter del error clásico de Vercel
  OPERADOR_DUENIO: undefined,
  OPERADORES: undefined,
};

async function conEntorno<T>(fn: () => Promise<T>): Promise<T> {
  const e = process.env as Record<string, string | undefined>;
  const antes = Object.fromEntries(Object.keys(ENV).map((k) => [k, e[k]]));
  const poner = (vals: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(vals)) {
      if (v === undefined) delete e[k];
      else e[k] = v;
    }
  };
  poner(ENV);
  try {
    return await fn();
  } finally {
    poner(antes);
  }
}

let ipSiguiente = 10;
/** Cada test con su propia IP: el limitador es uno solo para todo el proceso. */
const otraIp = () => `203.0.113.${ipSiguiente++}`;

function pedido(campos: Record<string, string>, { ip, origen = "https://consola.test" }: { ip: string; origen?: string | null }) {
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
    host: "consola.test",
    "x-forwarded-for": ip,
  };
  if (origen !== null) headers.origin = origen;
  return new NextRequest("https://consola.test/operador/login/ingresar", {
    method: "POST",
    headers,
    body: new URLSearchParams(campos).toString(),
  });
}

function sesionDe(res: Response): string | null {
  const c = res.headers.get("set-cookie") ?? "";
  const m = /(?:^|,\s*)operator_session=([^;]*)/.exec(c);
  return m ? decodeURIComponent(m[1]) : null;
}

test("un formulario común (sin id de action) entra: 303 a la consola con la sesión del dueño", async () => {
  await conEntorno(async () => {
    const ip = otraIp();
    for (const [usuario, clave] of [
      ["", "lab-clave-del-duenio"],
      ["duenio", "lab-clave-del-duenio"],
      ["", "lab-clave-del-duenio "],
    ]) {
      const res = await POST(pedido({ nombre: usuario, password: clave, next: "/operador" }, { ip }));
      assert.equal(res.status, 303, `${JSON.stringify(usuario)} / ${JSON.stringify(clave)}`);
      assert.equal(res.headers.get("location"), "/operador");
      const token = sesionDe(res);
      assert.ok(token, "trae la cookie de sesión");
      assert.deepEqual(await leerSesionOperador(token), { nombre: "duenio", rol: "d", esDuenio: true });
      const cookie = res.headers.get("set-cookie")!;
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /SameSite=lax/i);
      assert.match(cookie, /Secure/i);
      assert.match(cookie, /Path=\//);
    }
    // Sin JavaScript ni cabecera de action: es exactamente lo que manda el HTML.
    const res = await POST(pedido({ password: "lab-clave-del-duenio" }, { ip, origen: null }));
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), "/operador", "sin `next`, a la consola");
  });
});

test("vuelve adonde iba, pero sólo dentro de la consola", async () => {
  await conEntorno(async () => {
    const ip = otraIp();
    const entra = (next: string) => POST(pedido({ password: "lab-clave-del-duenio", next }, { ip }));
    assert.equal((await entra("/operador/tenants/abc?pestana=fiscal")).headers.get("location"), "/operador/tenants/abc?pestana=fiscal");
    for (const next of ["https://evil.test/", "//evil.test", "/admin", "/operador.evil.test", "/operador/\\evil.test", "/operador x"]) {
      assert.equal((await entra(next)).headers.get("location"), "/operador", next);
    }
  });
});

test("clave mal: vuelve al login con el error, sin sesión; el quinto fallo ya dice los minutos", async () => {
  await conEntorno(async () => {
    const ip = otraIp();
    const mal = (i: number) => POST(pedido({ nombre: "", password: `no-es-${i}`, next: "/operador/alta" }, { ip }));
    for (let i = 0; i < 4; i++) {
      const res = await mal(i);
      assert.equal(res.status, 303);
      assert.equal(res.headers.get("location"), "/operador/login?error=1&next=%2Foperador%2Falta");
      assert.equal(sesionDe(res), null);
    }
    const quinto = await mal(4);
    assert.equal(quinto.headers.get("location"), "/operador/login?error=throttled&min=15&next=%2Foperador%2Falta");
    // Frenado, ni la clave buena entra (y no se la mira).
    const buena = await POST(pedido({ password: "lab-clave-del-duenio" }, { ip }));
    assert.match(buena.headers.get("location")!, /^\/operador\/login\?error=throttled&min=\d+&/);
    assert.equal(sesionDe(buena), null);
    // Desde otra conexión, sí.
    const otra = await POST(pedido({ password: "lab-clave-del-duenio" }, { ip: otraIp() }));
    assert.equal(otra.headers.get("location"), "/operador");
  });
});

test("un sitio ajeno no puede hacer entrar al navegador (lo que una Server Action chequeaba sola)", async () => {
  await conEntorno(async () => {
    for (const origen of ["https://evil.test", "null", "https://consola.test.evil.test"]) {
      const res = await POST(pedido({ password: "lab-clave-del-duenio" }, { ip: otraIp(), origen }));
      assert.equal(res.status, 403, origen);
      assert.equal(sesionDe(res), null, origen);
    }
  });
});

test("el portón deja pasar la ruta de ingreso sin sesión, y nada debajo de ella", async () => {
  await conEntorno(async () => {
    const pasa = await proxy(new NextRequest("https://consola.test/operador/login/ingresar", { method: "POST" }));
    assert.equal(pasa.headers.get("x-middleware-next"), "1");
    for (const ruta of ["/operador/login/ingresar/x", "/operador/login/otra", "/operador/alta"]) {
      const r = await proxy(new NextRequest(`https://consola.test${ruta}`));
      assert.equal(r.status, 307, ruta);
      assert.equal(new URL(r.headers.get("location")!).pathname, "/operador/login", ruta);
    }
  });
});
