// Tests de la guardia SSRF. La tabla de IPs es pura; lo de red corre contra un servidor
// local en 127.0.0.1 (permitido sólo con la excepción de prueba) y con un DNS falso
// inyectado: ninguna prueba sale a internet. node:test + tsx.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import * as http from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import {
  SalidaBloqueadaError,
  clasificarIp,
  crearLookupFijado,
  parsearIpv4,
  parsearIpv6,
  pedirSeguro,
  resolverDestino,
  transporteSeguro,
  validarUrlSaliente,
  type MotivoBloqueo,
  type Resolvedor,
} from "./ssrf";

const bloqueo = (motivo: MotivoBloqueo) => (e: unknown) =>
  e instanceof SalidaBloqueadaError && e.motivo === motivo;

// ── Criterio: la tabla de IPs ────────────────────────────────────────────────

test("tabla de IPs que NO son públicas", () => {
  const noPublicas = [
    "169.254.169.254", // metadatos de la nube
    "169.254.0.1",
    "10.0.0.5",
    "10.255.255.255",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "127.0.0.1",
    "127.255.255.254",
    "0.0.0.0",
    "100.64.0.1", // CGNAT
    "100.127.255.255",
    "192.0.0.8",
    "192.0.2.1",
    "198.18.0.1",
    "198.51.100.7",
    "203.0.113.10",
    "224.0.0.1",
    "239.255.255.250",
    "255.255.255.255",
    "::1",
    "::",
    "::ffff:127.0.0.1", // IPv4 mapeada
    "::ffff:7f00:1", // la misma, en hex
    "::ffff:10.0.0.5",
    "::ffff:169.254.169.254",
    "::ffff:8.8.8.8", // mapeada aunque la de adentro sea pública: se rechaza igual
    "0:0:0:0:0:ffff:a9fe:a9fe",
    "::127.0.0.1", // compatible (obsoleta)
    "64:ff9b::a00:5", // NAT64 → 10.0.0.5
    "fe80::1",
    "fc00::1",
    "fd12:3456:789a::1",
    "fec0::1",
    "ff02::1",
    "2001::1", // Teredo
    "2001:db8::1",
    "2002:a00:5::1", // 6to4 con 10.0.0.5 adentro
    "3fff::1",
    "fe80::1%eth0", // con zona
    "no-es-ip",
    "",
    "01.2.3.4",
    "256.1.1.1",
    "1.2.3",
  ];
  for (const ip of noPublicas) {
    assert.equal(clasificarIp(ip).publica, false, ip);
  }
});

test("tabla de IPs públicas", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "100.128.0.1", "200.45.10.1", "2606:4700:4700::1111", "2800:3f0:4002:80b::200e"]) {
    assert.deepEqual(clasificarIp(ip).publica, true, ip);
  }
});

test("parseo estricto de IPv4 e IPv6", () => {
  assert.deepEqual(parsearIpv4("10.0.0.5"), [10, 0, 0, 5]);
  assert.equal(parsearIpv4("10.0.0"), null);
  assert.equal(parsearIpv4("010.0.0.5"), null);
  assert.equal(parsearIpv4("10.0.0.5 "), null);
  assert.deepEqual(parsearIpv6("::1"), [0, 0, 0, 0, 0, 0, 0, 1]);
  assert.deepEqual(parsearIpv6("::ffff:1.2.3.4"), [0, 0, 0, 0, 0, 0xffff, 0x0102, 0x0304]);
  assert.deepEqual(parsearIpv6("1:2:3:4:5:6:7::"), [1, 2, 3, 4, 5, 6, 7, 0]);
  for (const malo of ["1::2::3", "12345::", ":::", "1:2:3:4:5:6:7:8:9", "1:2:3:4:5:6:7:8::", "::ffff:1.2.3", "g::1", "1.2.3.4", "fe80::1%1"]) {
    assert.equal(parsearIpv6(malo), null, malo);
  }
});

// ── La URL ───────────────────────────────────────────────────────────────────

test("URL: sólo https, sin usuario:clave, puertos 443/8443 y nombres de internet", () => {
  const casos: Array<[string, MotivoBloqueo]> = [
    ["http://169.254.169.254/latest/meta-data/", "protocolo"],
    ["https://169.254.169.254/latest/meta-data/", "ip-no-publica"],
    ["https://10.0.0.5/hook", "ip-no-publica"],
    ["https://[::1]/", "ip-no-publica"],
    ["https://[::ffff:127.0.0.1]/", "ip-no-publica"],
    ["https://[::ffff:a9fe:a9fe]/", "ip-no-publica"],
    ["https://0x7f.0.0.1/", "ip-no-publica"], // el parser de URL lo normaliza a 127.0.0.1
    ["https://2130706433/", "ip-no-publica"], // 127.0.0.1 en decimal
    ["https://127.1/", "ip-no-publica"],
    ["https://0/", "ip-no-publica"],
    ["https://10.0.0.5./", "ip-no-publica"], // punto final
    ["https://017700000001/", "ip-no-publica"], // octal
    ["https://%31%32%37.0.0.1/", "ip-no-publica"], // con escapes
    ["https://\u2460\u2461\u2466.0.0.1/", "ip-no-publica"], // dígitos Unicode que el parser pliega a 127
    ["https://[0:0:0:0:0:ffff:7f00:1]/", "ip-no-publica"],
    ["https://localhost./", "nombre-no-publico"],
    ["https://localhost/", "nombre-no-publico"],
    ["https://api.localhost/", "nombre-no-publico"],
    ["https://metadata.google.internal/", "nombre-no-publico"],
    ["https://impresora.local/", "nombre-no-publico"],
    ["https://intranet/", "nombre-no-publico"],
    ["https://usuario:clave@tienda.com.ar/", "credenciales-en-url"],
    ["https://tienda.com.ar:22/", "puerto"],
    ["https://tienda.com.ar:80/", "puerto"],
    ["ftp://tienda.com.ar/", "protocolo"],
    ["file:///etc/passwd", "protocolo"],
    ["javascript:alert(1)", "protocolo"],
    ["gopher://tienda.com.ar/", "protocolo"],
    ["no es una url", "url-invalida"],
    [`https://tienda.com.ar/${"x".repeat(3000)}`, "url-invalida"],
  ];
  for (const [url, motivo] of casos) {
    assert.throws(() => validarUrlSaliente(url), bloqueo(motivo), url);
  }
  const ok = validarUrlSaliente("https://Velas-Shine.MiTiendaNube.com:8443/api?x=1");
  assert.equal(ok.host, "velas-shine.mitiendanube.com");
  assert.equal(ok.puerto, 8443);
  assert.equal(ok.ipLiteral, null);
  assert.equal(validarUrlSaliente("https://8.8.8.8/").ipLiteral, "8.8.8.8");
});

test("el error para el dueño es 'La dirección no es pública' y el técnico no lleva la ruta", () => {
  try {
    validarUrlSaliente("https://10.0.0.5/secreto?access_token=abc123");
    assert.fail("tenía que lanzar");
  } catch (e) {
    assert.ok(e instanceof SalidaBloqueadaError);
    assert.equal(e.codigo, "direccion_no_publica");
    assert.ok(!e.message.includes("abc123"));
    assert.ok(!e.message.includes("/secreto"));
  }
});

// ── Criterio: dominio que resuelve a una IP privada ──────────────────────────

const resolvedorFijo = (...ips: string[]): Resolvedor => async () =>
  ips.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));

test("un dominio que resuelve a una IP privada se rechaza antes de conectar", async () => {
  const casos: Array<[string[], MotivoBloqueo]> = [
    [["10.0.0.5"], "ip-no-publica"],
    [["169.254.169.254"], "ip-no-publica"],
    [["127.0.0.1"], "ip-no-publica"],
    [["::1"], "ip-no-publica"],
    [["::ffff:10.0.0.5"], "ip-no-publica"],
    [["8.8.8.8", "10.0.0.5"], "ip-no-publica"], // una pública y una privada: no pasa
    [["2606:4700:4700::1111", "fd00::1"], "ip-no-publica"],
    [["no-es-una-ip"], "ip-no-publica"],
    [["127.0.0.1"], "ip-no-publica"], // un "127.0.0.1.nip.io": el nombre pasa, la IP no
    [[], "dns-sin-respuesta"],
  ];
  for (const [ips, motivo] of casos) {
    const destino = validarUrlSaliente("https://tienda-del-cliente.com.ar/hook");
    await assert.rejects(resolverDestino(destino, { resolver: resolvedorFijo(...ips) }), bloqueo(motivo), ips.join(","));
    await assert.rejects(
      pedirSeguro("https://tienda-del-cliente.com.ar/hook", { metodo: "POST", cuerpo: "{}" }, { resolver: resolvedorFijo(...ips) }),
      bloqueo(motivo),
      ips.join(","),
    );
  }
});

test("con una IP privada en el DNS no se abre ninguna conexión", async () => {
  // Espía sobre los módulos reales que usa ssrf.ts (tsx los carga como CommonJS).
  const req = createRequire(import.meta.url);
  const modulos = [req("node:https") as typeof import("node:https"), req("node:http") as typeof import("node:http")];
  const originales = modulos.map((m) => m.request);
  let conexiones = 0;
  modulos.forEach((m, i) => {
    (m as { request: unknown }).request = (...args: unknown[]) => {
      conexiones++;
      return (originales[i] as (...a: unknown[]) => unknown)(...args);
    };
  });
  try {
    for (const ips of [["10.0.0.5"], ["169.254.169.254"], ["8.8.8.8", "192.168.0.1"], ["::ffff:127.0.0.1"]]) {
      await assert.rejects(
        pedirSeguro("https://tienda-del-cliente.com.ar/hook", { metodo: "POST", cuerpo: "{}" }, { resolver: resolvedorFijo(...ips) }),
        bloqueo("ip-no-publica"),
      );
    }
    assert.equal(conexiones, 0);
    // Control: el espía sí ve una conexión cuando la dirección pasa (si no, el 0 no probaría nada).
    const { puerto, excepciones } = await excepcionesLocales();
    manejador = (_req, res) => res.end("ok");
    await pedirSeguro(`http://127.0.0.1:${puerto}/`, { metodo: "GET" }, { excepciones });
    assert.equal(conexiones, 1);
  } finally {
    modulos.forEach((m, i) => ((m as { request: unknown }).request = originales[i]));
  }
});

test("todas públicas: se fija la primera", async () => {
  const destino = validarUrlSaliente("https://tienda-del-cliente.com.ar/hook");
  const fijado = await resolverDestino(destino, { resolver: resolvedorFijo("8.8.8.8", "1.1.1.1") });
  assert.equal(fijado.ip, "8.8.8.8");
  assert.equal(fijado.familia, 4);
});

test("el lookup fijado devuelve siempre la IP validada, en las dos formas en que Node lo llama", () => {
  const lookup = crearLookupFijado("8.8.8.8", 4);
  lookup("otro-nombre.com", {}, (err, address, family) => {
    assert.equal(err, null);
    assert.equal(address, "8.8.8.8");
    assert.equal(family, 4);
  });
  lookup("otro-nombre.com", { all: true }, (err, address) => {
    assert.equal(err, null);
    assert.deepEqual(address, [{ address: "8.8.8.8", family: 4 }]);
  });
});

// ── Con un servidor local (excepción de prueba) ──────────────────────────────

type Manejador = (req: http.IncomingMessage, res: http.ServerResponse) => void;
let manejador: Manejador = (_req, res) => res.end("ok");
const recibidas: Array<{ metodo?: string; url?: string; host?: string; cuerpo: string }> = [];
const servidor = http.createServer((req, res) => {
  const partes: Buffer[] = [];
  req.on("data", (c: Buffer) => partes.push(c));
  req.on("end", () => {
    recibidas.push({ metodo: req.method, url: req.url, host: req.headers.host, cuerpo: Buffer.concat(partes).toString() });
    manejador(req, res);
  });
});
const listo = new Promise<number>((resolve) => servidor.listen(0, "127.0.0.1", () => resolve((servidor.address() as AddressInfo).port)));
after(() => {
  servidor.closeAllConnections();
  servidor.close();
});

async function excepcionesLocales() {
  const puerto = await listo;
  return { puerto, excepciones: { permitirHttp: true, ips: ["127.0.0.1"], puertos: [puerto] } };
}

test("DNS rebinding: se conecta a la IP validada aunque el DNS cambie después", async () => {
  const { puerto, excepciones } = await excepcionesLocales();
  let consultas = 0;
  // Primera respuesta: la IP "permitida"; cualquier consulta posterior daría una privada.
  const rebinding: Resolvedor = async () => {
    consultas++;
    return consultas === 1 ? [{ address: "127.0.0.1", family: 4 }] : [{ address: "10.0.0.5", family: 4 }];
  };
  manejador = (_req, res) => res.end("hola");
  recibidas.length = 0;
  // ".test" nunca resuelve (RFC 6761): si Node hiciera su propio DNS, esto fallaría.
  const r = await pedirSeguro(
    `http://rebind.gsg-prueba.test:${puerto}/eco?x=1`,
    { metodo: "POST", encabezados: { "content-type": "application/json", host: "otro.com" }, cuerpo: '{"a":1}' },
    { resolver: rebinding, excepciones },
  );
  assert.equal(r.estado, 200);
  assert.equal(Buffer.from(r.cuerpo).toString(), "hola");
  assert.equal(consultas, 1, "el DNS se consulta una sola vez");
  assert.equal(recibidas.length, 1);
  assert.equal(recibidas[0].url, "/eco?x=1");
  assert.equal(recibidas[0].host, `rebind.gsg-prueba.test:${puerto}`, "el Host no lo puede pisar quien llama");
  assert.equal(recibidas[0].cuerpo, '{"a":1}');
});

test("no se siguen redirecciones", async () => {
  const { puerto, excepciones } = await excepcionesLocales();
  manejador = (_req, res) => {
    res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
    res.end();
  };
  recibidas.length = 0;
  await assert.rejects(
    pedirSeguro(`http://127.0.0.1:${puerto}/`, { metodo: "GET" }, { excepciones }),
    (e: unknown) => bloqueo("redireccion")(e) && (e as SalidaBloqueadaError).codigo === "direccion_invalida",
  );
  assert.equal(recibidas.length, 1, "una sola request: la redirección no se siguió");
});

test("tope de la respuesta: declarado y sin declarar", async () => {
  const { puerto, excepciones } = await excepcionesLocales();
  const grande = Buffer.alloc(70 * 1024, 0x61);
  manejador = (_req, res) => {
    res.writeHead(200, { "content-length": String(grande.length) });
    res.end(grande);
  };
  await assert.rejects(pedirSeguro(`http://127.0.0.1:${puerto}/`, { metodo: "GET" }, { excepciones }), bloqueo("respuesta-grande"));
  manejador = (_req, res) => {
    res.writeHead(200); // sin content-length: va en trozos
    res.write(grande.subarray(0, 40 * 1024));
    setTimeout(() => res.end(grande.subarray(40 * 1024)), 10);
  };
  await assert.rejects(pedirSeguro(`http://127.0.0.1:${puerto}/`, { metodo: "GET" }, { excepciones }), bloqueo("respuesta-grande"));
  // Con un tope más alto, pasa.
  const r = await pedirSeguro(`http://127.0.0.1:${puerto}/`, { metodo: "GET" }, { excepciones, topeBytes: 128 * 1024 });
  assert.equal(r.cuerpo.byteLength, grande.length);
});

test("plazo: un servidor que no contesta corta con tiempo-agotado", async () => {
  const { puerto, excepciones } = await excepcionesLocales();
  manejador = () => {
    /* nunca responde */
  };
  const t0 = Date.now();
  await assert.rejects(
    pedirSeguro(`http://127.0.0.1:${puerto}/`, { metodo: "GET" }, { excepciones, plazoMs: 200 }),
    (e: unknown) => bloqueo("tiempo-agotado")(e) && (e as SalidaBloqueadaError).codigo === "proveedor_caido",
  );
  assert.ok(Date.now() - t0 < 3000);
  // Un DNS que no contesta también entra en el plazo.
  const colgado: Resolvedor = () => new Promise(() => undefined);
  await assert.rejects(
    pedirSeguro("https://tienda-del-cliente.com.ar/", { metodo: "GET" }, { resolver: colgado, plazoMs: 150 }),
    bloqueo("tiempo-agotado"),
  );
});

test("sin la excepción, el mismo servidor local está bloqueado", async () => {
  const puerto = await listo;
  await assert.rejects(pedirSeguro(`http://127.0.0.1:${puerto}/`, { metodo: "GET" }), bloqueo("protocolo"));
  await assert.rejects(
    pedirSeguro(`http://127.0.0.1:${puerto}/`, { metodo: "GET" }, { excepciones: { permitirHttp: true, puertos: [puerto] } }),
    bloqueo("ip-no-publica"),
  );
});

test("las excepciones de prueba no se aceptan con NODE_ENV=production", async () => {
  const antes = process.env.NODE_ENV;
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  try {
    assert.throws(() => validarUrlSaliente("http://127.0.0.1/", { permitirHttp: true }), /producción|production/);
    await assert.rejects(
      pedirSeguro("http://127.0.0.1/", { metodo: "GET" }, { excepciones: { ips: ["127.0.0.1"] } }),
      /production/,
    );
    // Sin excepciones, la guardia funciona igual en producción.
    assert.throws(() => validarUrlSaliente("https://10.0.0.5/"), bloqueo("ip-no-publica"));
  } finally {
    // `process.env.X = undefined` deja el texto "undefined": si no estaba, se borra.
    const env = process.env as Record<string, string | undefined>;
    if (antes === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = antes;
  }
  assert.equal(process.env.NODE_ENV, antes);
});

test("transporteSeguro es un TransporteHttp con las mismas guardias", async () => {
  const { puerto, excepciones } = await excepcionesLocales();
  manejador = (_req, res) => {
    res.writeHead(201, { "X-Algo": "Valor" });
    res.end("creado");
  };
  const t = transporteSeguro({ excepciones });
  const r = await t(`http://127.0.0.1:${puerto}/`, { metodo: "PUT", cuerpo: new Uint8Array([1, 2, 3]) });
  assert.equal(r.estado, 201);
  assert.equal(r.encabezados["x-algo"], "Valor");
  await assert.rejects(t("https://169.254.169.254/", { metodo: "GET" }), bloqueo("ip-no-publica"));
  await assert.rejects(t(`http://127.0.0.1:${puerto}/`, { metodo: "TRACE" as "GET" }), /Método no permitido/);
});
