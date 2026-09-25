// ============================================================================
// ARNÉS DE INTEGRACIÓN · Server Actions reales con una sesión (ENG-000)
// ============================================================================
//
// Ejecuta una Server Action TAL CUAL (el mismo módulo "use server" que llama la pantalla, con su
// guardia, su Prisma con RLS y su auditoría) como si llegara un pedido de Next con la sesión de un
// usuario. Lo único que se simula es lo que pone Next alrededor del pedido:
//
//   · `cookies()` y `headers()` de `next/headers`: devuelven las del pedido de prueba. La cookie
//     de sesión se firma con la función REAL (`createSessionToken`), así que la guardia real la
//     verifica y busca al usuario en la base real. Diferencia a sabiendas:
//     en Next los headers son de sólo lectura; acá son un `Headers` común.
//   · `revalidatePath` / `revalidateTag` / `updateTag` / `refresh` de `next/cache`: se anotan
//     (`revalidadas`) en vez de invalidar una caché que acá no existe. `unstable_cache` ejecuta la
//     función sin guardar (como una caché vacía).
//   · `server-only`: se resuelve al módulo vacío, como en el bundle de servidor de Next.
//   · `redirect()` y `notFound()` son los de Next de verdad; la salida los traduce.
//
// Fuera de `ejecutarAccion`, `cookies()`, `headers()` y `revalidatePath()` fallan igual que en
// Next fuera de un pedido (la resolución del negocio por host, por ejemplo, cae a su camino "sin
// pedido"). Los pedidos simultáneos no se mezclan: cada uno vive en su propio contexto
// (AsyncLocalStorage), así dos sesiones de negocios distintos pueden correr a la vez.
//
// ── CÓMO SE USA ───────────────────────────────────────────────────────────────────────────────
//
//   const base = await baseEfimeraParaElTest(t);
//   if (!base) return;
//   apuntarLaAppA(base);                 // src/test/base-efimera.ts
//   prepararAccionesDeServidor();        // ANTES de importar módulos de la app
//   const { getClients } = await import("@/lib/actions");
//
//   const r = await ejecutarAccion({ negocio: base.a, usuario: base.a.duenia }, () => getClients());
//   assert.equal(r.tipo, "respuesta");   // "respuesta" | "redireccion" | "no-encontrado"
//   // r.valor: lo que devolvió la acción · r.revalidadas: rutas y tags invalidados
//   // r.cookiesPuestas / r.cookiesBorradas: lo que la acción escribió en las cookies
//
// El pedido (`PedidoDePrueba`):
//   · `negocio`: de qué negocio es el pedido (se manda su `host`; la app lo resuelve por
//     subdominio de `APP_BASE_DOMAIN`, como en producción). Sin negocio, sin host.
//   · `usuario`: la sesión del panel (cookie `admin_session` firmada para ese usuario). Sin
//     usuario, el pedido es anónimo (la vidriera, una acción pública).
//   · `cookies` / `headers`: extras, o para forjar una cookie a mano. La sesión de la consola se
//     pone así: `cookies: { operator_session: await createOperatorToken(nombre) }`.
// Un error que no es un corte de Next (redirect, notFound) se propaga: el test lo ve tal cual.
// ============================================================================

import { AsyncLocalStorage } from "node:async_hooks";
import Module, { createRequire } from "node:module";
import { createSessionToken, getSessionCookieName } from "@/lib/auth";

/** IP de documentación (RFC 5737): la que ve la auditoría en los pedidos de prueba. */
export const IP_DE_PRUEBA = "203.0.113.10";

export interface PedidoDePrueba {
  negocio?: { host: string } | null;
  usuario?: { id: string } | null;
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
}

interface Efectos {
  revalidadas: string[];
  cookiesPuestas: Record<string, string>;
  cookiesBorradas: string[];
}

export type SalidaDeAccion<R> =
  | ({ tipo: "respuesta"; valor: R } & Efectos)
  | ({ tipo: "redireccion"; destino: string } & Efectos)
  | ({ tipo: "no-encontrado" } & Efectos);

type OpcionesDeCookie = Record<string, unknown>;

/** Las cookies del pedido, con la forma de las de Next en una Server Action (se leen y se escriben). */
export class CookiesDelPedido {
  private readonly valores = new Map<string, string>();
  readonly puestas = new Map<string, string>();
  readonly borradas = new Set<string>();

  constructor(iniciales: Record<string, string> = {}) {
    for (const [nombre, valor] of Object.entries(iniciales)) this.valores.set(nombre, valor);
  }

  get size(): number {
    return this.valores.size;
  }

  get(nombre: string | { name: string }): { name: string; value: string } | undefined {
    const n = typeof nombre === "string" ? nombre : nombre.name;
    const value = this.valores.get(n);
    return value === undefined ? undefined : { name: n, value };
  }

  getAll(nombre?: string | { name: string }): { name: string; value: string }[] {
    const todas = [...this.valores].map(([name, value]) => ({ name, value }));
    if (nombre === undefined) return todas;
    const n = typeof nombre === "string" ? nombre : nombre.name;
    return todas.filter((c) => c.name === n);
  }

  has(nombre: string): boolean {
    return this.valores.has(nombre);
  }

  set(...args: [string, string, OpcionesDeCookie?] | [{ name: string; value: string } & OpcionesDeCookie]): this {
    const [nombre, valor] = typeof args[0] === "string" ? [args[0], String(args[1])] : [args[0].name, String(args[0].value)];
    this.valores.set(nombre, valor);
    this.puestas.set(nombre, valor);
    this.borradas.delete(nombre);
    return this;
  }

  delete(nombre: string | { name: string }): this {
    const n = typeof nombre === "string" ? nombre : nombre.name;
    this.valores.delete(n);
    this.puestas.delete(n);
    this.borradas.add(n);
    return this;
  }

  toString(): string {
    return [...this.valores].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ");
  }
}

interface ContextoDelPedido {
  cookies: CookiesDelPedido;
  headers: Headers;
  revalidadas: string[];
}

const PEDIDO = new AsyncLocalStorage<ContextoDelPedido>();

function pedidoActual(api: string): ContextoDelPedido {
  const p = PEDIDO.getStore();
  if (!p) {
    throw new Error(`\`${api}\` se llamó fuera de un pedido (en Next pasa lo mismo: sólo existe dentro de un request).`);
  }
  return p;
}

let preparado = false;

/**
 * Pone los dobles de Next (`next/headers`, `next/cache`, `server-only`). Idempotente. Llamala
 * ANTES de importar módulos de la app: un `import()` de `next/headers` hecho antes ve el original.
 */
export function prepararAccionesDeServidor(): void {
  if (preparado) return;
  preparado = true;
  const requerir = createRequire(__filename);

  const vacio = requerir.resolve("next/dist/compiled/server-only/empty.js");
  const M = Module as unknown as { _resolveFilename: (pedido: string, ...resto: unknown[]) => string };
  const resolverOriginal = M._resolveFilename;
  M._resolveFilename = function (this: unknown, pedido: string, ...resto: unknown[]) {
    return pedido === "server-only" ? vacio : resolverOriginal.call(this, pedido, ...resto);
  };

  const headers = requerir("next/headers") as Record<string, unknown>;
  headers.cookies = async () => pedidoActual("cookies").cookies;
  headers.headers = async () => pedidoActual("headers").headers;

  const cache = requerir("next/cache") as Record<string, unknown>;
  const anotar = (api: string, que: string) => {
    pedidoActual(api).revalidadas.push(que);
  };
  cache.revalidatePath = (ruta: string, tipo?: string) => anotar("revalidatePath", tipo ? `${ruta} (${tipo})` : ruta);
  cache.revalidateTag = (tag: string) => anotar("revalidateTag", `tag:${tag}`);
  cache.updateTag = (tag: string) => anotar("updateTag", `tag:${tag}`);
  cache.refresh = () => anotar("refresh", "refresh");
  cache.unstable_cache =
    <A extends unknown[], R>(fn: (...a: A) => Promise<R>) =>
    (...a: A) =>
      fn(...a);
}

/** Traduce los cortes de Next (`redirect()`, `notFound()`) por su `digest`, el formato de Next. */
export function corteDeNext(err: unknown): { tipo: "redireccion"; destino: string } | { tipo: "no-encontrado" } | null {
  const digest =
    typeof err === "object" && err !== null && "digest" in err && typeof (err as { digest: unknown }).digest === "string"
      ? (err as { digest: string }).digest
      : "";
  if (digest.startsWith("NEXT_REDIRECT;")) return { tipo: "redireccion", destino: digest.split(";").slice(2, -2).join(";") };
  if (digest === "NEXT_HTTP_ERROR_FALLBACK;404") return { tipo: "no-encontrado" };
  return null;
}

/** Ejecuta `accion` dentro de un pedido de Next con esta sesión. Ver el encabezado. */
export async function ejecutarAccion<R>(pedido: PedidoDePrueba, accion: () => Promise<R>): Promise<SalidaDeAccion<R>> {
  if (!preparado) throw new Error("ejecutarAccion: falta prepararAccionesDeServidor() antes de importar la app.");
  const iniciales: Record<string, string> = {};
  if (pedido.usuario) iniciales[getSessionCookieName()] = await createSessionToken(pedido.usuario.id);
  const cookies = new CookiesDelPedido({ ...iniciales, ...pedido.cookies });

  const headers = new Headers({ "x-forwarded-for": IP_DE_PRUEBA, "user-agent": "arnes-de-prueba" });
  if (pedido.negocio) headers.set("host", pedido.negocio.host);
  if (cookies.size > 0) headers.set("cookie", cookies.toString());
  for (const [nombre, valor] of Object.entries(pedido.headers ?? {})) headers.set(nombre, valor);

  const contexto: ContextoDelPedido = { cookies, headers, revalidadas: [] };
  const efectos = (): Efectos => ({
    revalidadas: [...contexto.revalidadas],
    cookiesPuestas: Object.fromEntries(cookies.puestas),
    cookiesBorradas: [...cookies.borradas],
  });
  try {
    const valor = await PEDIDO.run(contexto, accion);
    return { tipo: "respuesta", valor, ...efectos() };
  } catch (err) {
    const corte = corteDeNext(err);
    if (corte) return { ...corte, ...efectos() };
    throw err;
  }
}
