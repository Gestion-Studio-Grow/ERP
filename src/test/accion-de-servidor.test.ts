// ENG-000, criterio 3 (docs/agent/BACKLOG.md): una Server Action REAL, con la sesión de un usuario
// real, contra la base efímera con `app_rls` y RLS forzado. `getClients` (src/lib/actions.ts) lee
// clientes SIN filtrar por negocio en su consulta: lo que la separa de los de B es el negocio que
// resuelve la sesión (del host, con el usuario de la cookie firmada), que alimenta las dos murallas
// de datos (RLS y el candado de la app, src/lib/tenant-scope.ts). Medido: sin la política de RLS
// en Client, el candado sigue filtrando (.qa/ENG-000/mutaciones-humo.txt); RLS de frente se prueba
// en base-efimera.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { redirect, notFound } from "next/navigation";
import { apuntarLaAppA, baseEfimeraParaElTest } from "./base-efimera";
import { CookiesDelPedido, corteDeNext, ejecutarAccion, prepararAccionesDeServidor } from "./accion-de-servidor";

test("los cortes de Next se leen del digest que ponen redirect() y notFound() de verdad", () => {
  const cortes: unknown[] = [];
  for (const cortar of [() => redirect("/admin/login"), () => redirect("/a;b?c=1"), () => notFound()]) {
    try {
      cortar();
    } catch (err) {
      cortes.push(corteDeNext(err));
    }
  }
  assert.deepEqual(cortes, [
    { tipo: "redireccion", destino: "/admin/login" },
    { tipo: "redireccion", destino: "/a;b?c=1" },
    { tipo: "no-encontrado" },
  ]);
  assert.equal(corteDeNext(new Error("otra cosa")), null);
});

test("las cookies del pedido se leen, se escriben y se borran como en una Server Action", () => {
  const c = new CookiesDelPedido({ admin_session: "u.firma", tema: "oscuro" });
  assert.deepEqual(c.get("admin_session"), { name: "admin_session", value: "u.firma" });
  c.set("tema", "claro").set({ name: "nueva", value: "1", httpOnly: true });
  c.delete("admin_session");
  assert.equal(c.get("tema")?.value, "claro");
  assert.equal(c.has("admin_session"), false);
  assert.deepEqual(Object.fromEntries(c.puestas), { tema: "claro", nueva: "1" });
  assert.deepEqual([...c.borradas], ["admin_session"]);
  assert.equal(c.toString(), "tema=claro; nueva=1");
});

test("los dobles de Next: dentro del pedido anotan lo que la acción hace; fuera fallan como en Next", async () => {
  prepararAccionesDeServidor();
  const { revalidatePath, revalidateTag, unstable_cache } = await import("next/cache");
  const { cookies, headers } = await import("next/headers");

  const r = await ejecutarAccion({ negocio: { host: "negocio-a.erp.test" }, cookies: { tema: "oscuro" } }, async () => {
    const c = await cookies();
    const h = await headers();
    const antes = c.get("tema")?.value;
    c.set("tema", "claro");
    c.delete("aviso");
    revalidatePath("/admin/clientes");
    revalidateTag("clientes", "max");
    const cacheada = unstable_cache(async (n: number) => n * 2, ["doble"]);
    return { antes, despues: c.get("tema")?.value, host: h.get("host"), cookie: h.get("cookie"), doble: await cacheada(21) };
  });
  assert.deepEqual(r, {
    tipo: "respuesta",
    valor: { antes: "oscuro", despues: "claro", host: "negocio-a.erp.test", cookie: "tema=oscuro", doble: 42 },
    revalidadas: ["/admin/clientes", "tag:clientes"],
    cookiesPuestas: { tema: "claro" },
    cookiesBorradas: ["aviso"],
  });

  await assert.rejects(cookies(), /`cookies` se llamó fuera de un pedido/);
  await assert.rejects(headers(), /`headers` se llamó fuera de un pedido/);
  assert.throws(() => revalidatePath("/admin"), /`revalidatePath` se llamó fuera de un pedido/);
});

test("contra Postgres (app_rls + RLS): con la sesión de A, una acción de lectura real devuelve sólo filas de A", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const { getClients } = await import("@/lib/actions");
  const { basePrisma } = await import("@/lib/prisma-base");

  // La app corre como en producción: un rol sin BYPASSRLS, y sin negocio puesto no ve nada.
  const [rol] = await basePrisma.$queryRaw<{ r: string; bypass: boolean }[]>`
    SELECT current_user AS r, rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user`;
  assert.deepEqual(rol, { r: "app_rls", bypass: false });
  assert.equal(await basePrisma.client.count(), 0, "sin negocio puesto, RLS no deja ver clientes");

  const ids = (filas: { id: string; tenantId: string }[]) => filas.map((f) => f.id).sort();

  // La dueña de A: exactamente los clientes de A.
  const comoA = await ejecutarAccion({ negocio: base.a, usuario: base.a.duenia }, () => getClients());
  assert.equal(comoA.tipo, "respuesta");
  if (comoA.tipo !== "respuesta") return;
  assert.deepEqual(ids(comoA.valor), [...base.a.clientes].sort());
  assert.ok(comoA.valor.every((c) => c.tenantId === base.a.id));

  // La recepcionista de B, a la vez que la dueña de A: cada una ve lo suyo.
  const [a2, b] = await Promise.all([
    ejecutarAccion({ negocio: base.a, usuario: base.a.duenia }, () => getClients()),
    ejecutarAccion({ negocio: base.b, usuario: base.b.recepcion }, () => getClients()),
  ]);
  assert.ok(a2.tipo === "respuesta" && b.tipo === "respuesta");
  assert.deepEqual(ids(a2.valor), [...base.a.clientes].sort());
  assert.deepEqual(ids(b.valor), [...base.b.clientes].sort());

  // Sin sesión: al login, sin leer nada.
  assert.deepEqual(await ejecutarAccion({ negocio: base.a }, () => getClients()), {
    tipo: "redireccion",
    destino: "/admin/login",
    revalidadas: [],
    cookiesPuestas: {},
    cookiesBorradas: [],
  });

  // La cookie de la dueña de A en el host de B no abre B: ese usuario no es de B.
  const cruzada = await ejecutarAccion({ negocio: base.b, usuario: base.a.duenia }, () => getClients());
  assert.equal(cruzada.tipo, "redireccion");
  assert.equal(cruzada.tipo === "redireccion" && cruzada.destino, "/admin/login");

  // Una cookie forjada (firma de otro) tampoco.
  const forjada = await ejecutarAccion(
    { negocio: base.a, cookies: { admin_session: `${base.a.duenia.id}.${"0".repeat(64)}` } },
    () => getClients(),
  );
  assert.equal(forjada.tipo, "redireccion");
});
