// Conexión de los SCRIPTS OPERATIVOS (reset de contraseña, altas, verificaciones) a la base.
// NO es runtime de producción: la app sigue con `PrismaPg` por TCP (`prisma-base.ts`, `operator-db.ts`).
// Nada de `src/app` ni de las actions importa este archivo (lo cuida `db-de-scripts.test.ts`).
//
// Por qué existe: las sesiones en la nube sólo salen por HTTPS a través de un proxy (CONNECT). Postgres
// por TCP (5432) no pasa: el 10/11 el reset de Carolina falló con «Can't reach database server». Neon
// atiende el mismo protocolo de Postgres envuelto en un WebSocket seguro (wss://<host>/v2, puerto 443),
// y `@prisma/adapter-neon` habla por ahí con transacciones interactivas, que `enElNegocio` necesita
// (el driver HTTP de Neon no las tiene). El WebSocket es el de undici, con el proxy del entorno.
//
//   OPS_DB_DRIVER=neon-ws  → WebSocket seguro a Neon (sólo hosts *.neon.tech), por el proxy si hay uno.
//   OPS_DB_DRIVER=pg-tcp   → `PrismaPg` por TCP, como siempre. Es el defecto si la variable no está.
//
// La contraseña de la conexión nunca se imprime: los errores pasan por `sinSecretos` antes de salir.
import type { PrismaClient } from "@/generated/prisma/client";

export type DriverDeScript = "pg-tcp" | "neon-ws";

type Env = Readonly<Record<string, string | undefined>>;

export type EleccionDeDriver =
  | { ok: true; driver: DriverDeScript; host: string }
  | { ok: false; error: string };

const DRIVERS: readonly DriverDeScript[] = ["pg-tcp", "neon-ws"];

/** Decide el driver sin abrir nada. Pura: testeable sin red. Los errores no llevan la conexión. */
export function elegirDriverDeScript(env: Env, connectionString: string | undefined): EleccionDeDriver {
  const pedido = (env.OPS_DB_DRIVER ?? "").trim().toLowerCase() || "pg-tcp";
  if (!DRIVERS.includes(pedido as DriverDeScript)) {
    return { ok: false, error: `OPS_DB_DRIVER no reconocido. Valores: ${DRIVERS.join(", ")}.` };
  }
  const driver = pedido as DriverDeScript;
  if (!connectionString?.trim()) return { ok: false, error: "Falta la cadena de conexión." };

  let url: URL;
  try {
    url = new URL(connectionString.trim());
  } catch {
    return { ok: false, error: "La cadena de conexión no es una URL válida." };
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    return { ok: false, error: "La cadena de conexión tiene que ser postgres:// o postgresql://." };
  }
  const host = url.hostname.toLowerCase();
  // El WebSocket lleva la contraseña: sólo se habla con Neon, nunca con otro host por esta vía.
  if (driver === "neon-ws" && !host.endsWith(".neon.tech")) {
    return { ok: false, error: "OPS_DB_DRIVER=neon-ws sólo vale para hosts de Neon (*.neon.tech)." };
  }
  return { ok: true, driver, host };
}

/** Saca de un texto la cadena de conexión y su contraseña (también codificada), por si un error las trae. */
export function sinSecretos(texto: string, connectionString: string | undefined): string {
  if (!connectionString) return texto;
  let limpio = texto.split(connectionString).join("[conexión]");
  try {
    const pass = new URL(connectionString).password;
    if (pass) {
      for (const v of new Set([pass, decodeURIComponent(pass)])) {
        if (v.length >= 4) limpio = limpio.split(v).join("[secreto]");
      }
    }
  } catch {
    // Si no es URL no hay contraseña que extraer: ya se quitó la cadena entera.
  }
  return limpio;
}

/** Proxy HTTPS del entorno (CONNECT), o `undefined` si no hay. */
export function proxyDelEntorno(env: Env): { httpsProxy?: string; httpProxy?: string; noProxy?: string } | undefined {
  const httpsProxy = env.HTTPS_PROXY || env.https_proxy || undefined;
  const httpProxy = env.HTTP_PROXY || env.http_proxy || undefined;
  if (!httpsProxy && !httpProxy) return undefined;
  return { httpsProxy, httpProxy, noProxy: env.NO_PROXY ?? env.no_proxy ?? "" };
}

type WebSocketCtor = new (url: string | URL, protocols?: string | string[]) => unknown;

/**
 * Constructor de WebSocket (undici) que sale por el proxy del entorno, si hay; si no, directo.
 * `cerrar` suelta las conexiones al proxy: sin eso el proceso del script no termina.
 */
export async function webSocketPorProxy(env: Env): Promise<{ Ctor: WebSocketCtor; cerrar: () => Promise<void> }> {
  const { WebSocket, EnvHttpProxyAgent } = await import("undici");
  const proxy = proxyDelEntorno(env);
  // `proxyTunnel`: siempre CONNECT. El proxy de la nube no acepta pedidos HTTP planos (405).
  const dispatcher = proxy ? new EnvHttpProxyAgent({ ...proxy, proxyTunnel: true }) : undefined;
  const Ctor = class WebSocketConProxy extends WebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, dispatcher ? { protocols, dispatcher } : { protocols });
    }
  };
  return { Ctor, cerrar: async () => void (await dispatcher?.destroy()) };
}

/** Lo que usa un script: el cliente y cómo cerrarlo del todo (base y proxy). */
export type ClienteDeScript = { prisma: PrismaClient; driver: DriverDeScript; cerrar: () => Promise<void> };

/**
 * El cliente Prisma de un script operativo. `connectionString` es explícita (el script decide de qué
 * variable sale). Con `neon-ws` configura el WebSocket del driver de Neon antes de armar el adaptador.
 */
export async function crearClienteDeScript(env: Env, connectionString: string | undefined): Promise<ClienteDeScript> {
  const eleccion = elegirDriverDeScript(env, connectionString);
  if (!eleccion.ok) throw new Error(eleccion.error);
  const cadena = connectionString!.trim();
  const { PrismaClient } = await import("@/generated/prisma/client");

  if (eleccion.driver === "pg-tcp") {
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: cadena }) });
    return { prisma, driver: "pg-tcp", cerrar: () => prisma.$disconnect() };
  }

  const { neonConfig } = await import("@neondatabase/serverless");
  const { PrismaNeon } = await import("@prisma/adapter-neon");
  const ws = await webSocketPorProxy(env);
  neonConfig.webSocketConstructor = ws.Ctor as typeof neonConfig.webSocketConstructor;
  neonConfig.useSecureWebSocket = true; // wss:// siempre: la contraseña viaja cifrada hasta Neon.
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: cadena, max: 1 }) });
  return {
    prisma,
    driver: "neon-ws",
    cerrar: async () => {
      try {
        await prisma.$disconnect();
      } finally {
        await ws.cerrar();
      }
    },
  };
}
