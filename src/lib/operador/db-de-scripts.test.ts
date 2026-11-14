// Conexión de los scripts operativos (db-de-scripts.ts): elección del driver, que los errores no
// lleven secretos, que el WebSocket salga por el proxy del entorno (CONNECT, como en la nube) y que
// el runtime de producción no lo importe. Sin red externa: proxy y servidor WebSocket son locales.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { join, relative } from "node:path";
import {
  crearClienteDeScript,
  elegirDriverDeScript,
  proxyDelEntorno,
  sinSecretos,
  webSocketPorProxy,
} from "@/lib/operador/db-de-scripts";

const NEON = "postgresql://ops:Cl4ve%2Fsecreta@ep-algo-123.sa-east-1.aws.neon.tech/neondb?sslmode=require";
const LOCAL = "postgresql://ops:otraClave@127.0.0.1:5433/erp";

test("driver: por defecto pg-tcp (comportamiento de siempre)", () => {
  assert.deepEqual(elegirDriverDeScript({}, LOCAL), { ok: true, driver: "pg-tcp", host: "127.0.0.1" });
  assert.deepEqual(elegirDriverDeScript({ OPS_DB_DRIVER: " " }, NEON), {
    ok: true,
    driver: "pg-tcp",
    host: "ep-algo-123.sa-east-1.aws.neon.tech",
  });
});

test("driver: neon-ws sólo con hosts de Neon", () => {
  const r = elegirDriverDeScript({ OPS_DB_DRIVER: "NEON-WS" }, NEON);
  assert.deepEqual(r, { ok: true, driver: "neon-ws", host: "ep-algo-123.sa-east-1.aws.neon.tech" });
  const local = elegirDriverDeScript({ OPS_DB_DRIVER: "neon-ws" }, LOCAL);
  assert.equal(local.ok, false);
  // Un host que sólo *contiene* neon.tech no pasa.
  const trampa = elegirDriverDeScript({ OPS_DB_DRIVER: "neon-ws" }, "postgres://u:p@neon.tech.atacante.com/db");
  assert.equal(trampa.ok, false);
  const trampa2 = elegirDriverDeScript({ OPS_DB_DRIVER: "neon-ws" }, "postgres://u:p@atacanteneon.tech/db");
  assert.equal(trampa2.ok, false);
  // `?host=` redirigiría el WebSocket a otro destino; una lista de hosts con coma tampoco pasa.
  const desvio = elegirDriverDeScript({ OPS_DB_DRIVER: "neon-ws" }, "postgresql://u:p@ep-x.neon.tech/db?host=evil.example");
  assert.equal(desvio.ok, false);
  const coma = elegirDriverDeScript({ OPS_DB_DRIVER: "neon-ws" }, "postgresql://u:p@evil.example,ep.neon.tech/db");
  assert.equal(coma.ok, false);
  // Los parámetros de TLS sí.
  const tls = elegirDriverDeScript(
    { OPS_DB_DRIVER: "neon-ws" },
    "postgresql://u:p@ep-x.neon.tech/db?sslmode=require&channel_binding=require",
  );
  assert.equal(tls.ok, true);
});

test("driver: valores inválidos y cadenas rotas se rechazan sin mostrar la conexión", () => {
  for (const [env, cadena] of [
    [{ OPS_DB_DRIVER: "tcp" }, NEON],
    [{}, undefined],
    [{}, ""],
    [{}, "no es una url Cl4ve"],
    [{}, "mysql://ops:Cl4ve@host/db"],
  ] as const) {
    const r = elegirDriverDeScript(env, cadena);
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(!r.error.includes("Cl4ve") && !r.error.includes("otraClave"), r.error);
  }
});

test("crearClienteDeScript tira con el error de la elección, sin la conexión", async () => {
  await assert.rejects(
    () => crearClienteDeScript({ OPS_DB_DRIVER: "neon-ws" }, LOCAL),
    (e: Error) => /sólo vale para hosts de Neon/.test(e.message) && !e.message.includes("otraClave"),
  );
});

test("sinSecretos: quita la cadena entera y la contraseña, codificada o no", () => {
  const msg = `falló ${NEON} con Cl4ve%2Fsecreta y Cl4ve/secreta`;
  const limpio = sinSecretos(msg, NEON);
  assert.ok(!limpio.includes("Cl4ve"), limpio);
  assert.match(limpio, /\[conexión\]/);
  assert.equal(sinSecretos("nada que ver", NEON), "nada que ver");
  assert.equal(sinSecretos("texto", undefined), "texto");
  // Un `%` mal formado no deja la contraseña a la vista.
  const rara = "postgresql://ops:abc%zzClave@ep-x.neon.tech/db";
  assert.ok(!sinSecretos("error: abc%zzClave", rara).includes("abc%zzClave"));
});

test("proxyDelEntorno: toma HTTPS_PROXY o https_proxy; sin proxy, directo", () => {
  assert.equal(proxyDelEntorno({}), undefined);
  assert.deepEqual(proxyDelEntorno({ https_proxy: "http://127.0.0.1:9", no_proxy: "localhost" }), {
    httpsProxy: "http://127.0.0.1:9",
    httpProxy: undefined,
    noProxy: "localhost",
  });
});

// Servidor WebSocket mínimo (sólo el handshake, RFC 6455 §4.2.2) y proxy CONNECT que anota a dónde abre túnel.
async function levantar() {
  const ws = http.createServer();
  ws.on("upgrade", (req, socket) => {
    sockets.add(socket as net.Socket);
    const accept = createHash("sha1")
      .update(`${req.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64");
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
  });
  const tuneles: string[] = [];
  const sockets = new Set<net.Socket>();
  const proxy = http.createServer((_req, res) => res.writeHead(405).end());
  proxy.on("connect", (req, cliente, head) => {
    tuneles.push(String(req.url));
    sockets.add(cliente as net.Socket);
    const [host, port] = String(req.url).split(":");
    const destino = net.connect(Number(port), host, () => {
      sockets.add(destino);
      cliente.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      destino.write(head);
      destino.pipe(cliente).pipe(destino);
    });
    destino.on("error", () => cliente.destroy());
    cliente.on("error", () => destino.destroy());
  });
  await new Promise<void>((r) => ws.listen(0, "127.0.0.1", r));
  await new Promise<void>((r) => proxy.listen(0, "127.0.0.1", r));
  const puerto = (s: http.Server) => (s.address() as net.AddressInfo).port;
  return {
    wsPort: puerto(ws),
    proxyUrl: `http://127.0.0.1:${puerto(proxy)}`,
    tuneles,
    cerrar: () => {
      for (const s of sockets) s.destroy();
      ws.closeAllConnections();
      proxy.closeAllConnections();
      ws.close();
      proxy.close();
    },
  };
}

function abrir(Ctor: new (url: string) => unknown, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = new Ctor(url) as EventTarget & { close: () => void };
    s.addEventListener("open", () => {
      s.close();
      resolve();
    });
    s.addEventListener("error", () => reject(new Error("no abrió")));
  });
}

test("webSocketPorProxy: con proxy en el entorno, el WebSocket abre túnel CONNECT por el proxy", async (t) => {
  const srv = await levantar();
  t.after(srv.cerrar);
  const ws = await webSocketPorProxy({ HTTP_PROXY: srv.proxyUrl, HTTPS_PROXY: srv.proxyUrl, NO_PROXY: "" });
  t.after(ws.cerrar);
  await abrir(ws.Ctor, `ws://127.0.0.1:${srv.wsPort}/v2`);
  assert.deepEqual(srv.tuneles, [`127.0.0.1:${srv.wsPort}`]);
});

test("webSocketPorProxy: sin proxy en el entorno, va directo (no toca el proxy)", async (t) => {
  const srv = await levantar();
  t.after(srv.cerrar);
  const ws = await webSocketPorProxy({});
  t.after(ws.cerrar);
  await abrir(ws.Ctor, `ws://127.0.0.1:${srv.wsPort}/v2`);
  assert.deepEqual(srv.tuneles, []);
});

// El runtime de producción no carga el driver de Neon ni este módulo: sólo scripts y tests.
test("runtime intacto: nadie fuera de scripts/ y de este módulo importa neon ni db-de-scripts", () => {
  const raiz = process.cwd();
  const prohibidos = [/@prisma\/adapter-neon/, /@neondatabase\/serverless/, /db-de-scripts/];
  const permitidos = new Set(["src/lib/operador/db-de-scripts.ts", "src/lib/operador/db-de-scripts.test.ts"]);
  const culpables: string[] = [];
  const recorrer = (dir: string) => {
    for (const nombre of readdirSync(dir)) {
      if (nombre === "node_modules" || nombre === "generated" || nombre.startsWith(".")) continue;
      const ruta = join(dir, nombre);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else if (/\.(ts|tsx|mts|js|mjs)$/.test(nombre)) {
        const rel = relative(raiz, ruta);
        if (permitidos.has(rel)) continue;
        const txt = readFileSync(ruta, "utf8");
        if (prohibidos.some((p) => p.test(txt))) culpables.push(rel);
      }
    }
  };
  recorrer(join(raiz, "src"));
  assert.deepEqual(culpables, []);
  // Y el cliente de producción sigue en TCP.
  assert.match(readFileSync(join(raiz, "src/lib/prisma-base.ts"), "utf8"), /new PrismaPg\(/);
  assert.match(readFileSync(join(raiz, "src/lib/operator-db.ts"), "utf8"), /new PrismaPg\(/);
});
