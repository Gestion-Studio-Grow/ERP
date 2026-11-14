// ============================================================================
// AISLAMIENTO ENTRE NEGOCIOS CON LOS TRES FLAGS DEL POOL (PLAT-005) — contra Postgres, con app_rls.
// ============================================================================
//
// Qué prueba. Los tres flags de src/lib/db-pool.ts (DB_CONNECTION_LIMIT, DB_BEGIN_CON_NEGOCIO,
// DB_TENANT_DIRECTO) cambian cómo habla con la base TODO negocio. Este test corre la capa de datos
// REAL (prisma-base.ts, rls.ts, db.ts) con cada flag apagado y prendido, por separado y los tres
// juntos, y con un pool chico (2) que obliga a reusar conexiones, y exige:
//   1. El rol de la conexión NO tiene BYPASSRLS, no es superusuario y no es dueño de ninguna tabla
//      (con el dueño, RLS no se aplica y el test saldría verde sin probar nada): si lo es, FALLA.
//   2. 200 pedidos concurrentes alternando A y B (transacción con consulta cruda, lectura suelta
//      por la extensión, findMany, Tenant directo y Tenant con `_count`), mezclados con consultas
//      sueltas sin negocio: ninguno ve filas del otro; las sueltas ven 0.
//   3. Después del COMMIT y del ROLLBACK, una consulta suelta por LA MISMA conexión (mismo
//      pg_backend_pid) devuelve 0 filas de tablas con RLS, y el GUC queda en '' (no NULL).
//   4. Fallas inyectadas — timeout de la transacción, statement_timeout, conflicto Serializable
//      con reintento (bookingTransaction), transacciones vacías, $queryRaw dentro de
//      tenantTransaction (bien y con error) — y después de cada una, el siguiente pedido del OTRO
//      negocio no ve nada ajeno.
// Las consultas crudas son la sonda fuerte: no pasan por el candado de la app (tenant-scope.ts),
// así que sólo RLS + el GUC las acota. Si algo se filtra, se ve ahí.
//
// Los flags se leen AL IMPORTAR los módulos (prisma-base.ts, rls.ts): cada combinación corre en su
// propio proceso. Este archivo es las dos cosas: el test (crea la base efímera y lanza un hijo por
// combinación) y el hijo (con AISLAMIENTO_HIJO puesta, corre la batería y escribe el resultado).
//
// DÓNDE CORRE. NUNCA Neon ni producción.
//   · AISLAMIENTO_DATABASE_URL: superusuario en la base de mantenimiento de un Postgres LOCAL (la
//     misma forma que ERP_TEST_PG_URL; pasa por la guarda de src/test/base-efimera.ts, que rechaza
//     cualquier servidor que no sea de esta máquina). Sin ella usa ERP_TEST_PG_URL (la de CI); sin
//     ninguna de las dos, en CI falla y fuera de CI se SALTEA y lo dice.
//       AISLAMIENTO_DATABASE_URL='postgresql://postgres@localhost:5433/postgres?host=/tmp/pgrun'
//   · AISLAMIENTO_PGBOUNCER (opcional): `host:puerto` de un PgBouncer LOCAL en modo transacción
//     delante del mismo Postgres (como el pooler de Neon). Con ella, todo corre además a través de
//     él. El test verifica en su consola que `pool_mode` sea `transaction`.
// SÓLO toca la base efímera (se borra al terminar). Escribe una sola columna (`Order.notes`) para
// provocar el conflicto Serializable.

import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import pg from "pg";
import { baseEfimeraParaElTest, type BaseEfimera, DOMINIO_DE_PRUEBA } from "@/test/base-efimera";

interface Negocio {
  nombre: "A" | "B";
  id: string;
  /** Pedidos (Order) y clientes (Client) que tiene: A 3/2, B 2/1. */
  n: number;
  c: number;
  pedidos: string[];
}

interface Combinacion {
  nombre: string;
  env: Record<string, string>;
  limite: number;
  begin: boolean;
  directo: boolean;
}

interface ConfigHijo {
  via: string;
  combinacion: Combinacion;
  a: Negocio;
  b: Negocio;
}

const MARCA_RESULTADO = "AISLAMIENTO_RESULTADO ";
const FLAGS = ["DB_CONNECTION_LIMIT", "DB_BEGIN_CON_NEGOCIO", "DB_TENANT_DIRECTO", "DB_CONNECT_TIMEOUT_MS", "DB_IDLE_TIMEOUT_MS"];

const COMBINACIONES: Combinacion[] = [
  { nombre: "todo apagado (defecto, 5 conexiones)", env: {}, limite: 5, begin: false, directo: false },
  { nombre: "DB_CONNECTION_LIMIT=10", env: { DB_CONNECTION_LIMIT: "10" }, limite: 10, begin: false, directo: false },
  { nombre: "DB_BEGIN_CON_NEGOCIO=on", env: { DB_BEGIN_CON_NEGOCIO: "on" }, limite: 5, begin: true, directo: false },
  { nombre: "DB_TENANT_DIRECTO=on", env: { DB_TENANT_DIRECTO: "on" }, limite: 5, begin: false, directo: true },
  {
    nombre: "los tres prendidos (10 conexiones)",
    env: { DB_CONNECTION_LIMIT: "10", DB_BEGIN_CON_NEGOCIO: "on", DB_TENANT_DIRECTO: "on" },
    limite: 10,
    begin: true,
    directo: true,
  },
  { nombre: "pool chico (2), apagado", env: { DB_CONNECTION_LIMIT: "2" }, limite: 2, begin: false, directo: false },
  {
    nombre: "pool chico (2) con BEGIN junto y Tenant directo",
    env: { DB_CONNECTION_LIMIT: "2", DB_BEGIN_CON_NEGOCIO: "on", DB_TENANT_DIRECTO: "on" },
    limite: 2,
    begin: true,
    directo: true,
  },
];

// ── EL HIJO: una combinación de flags, en su propio proceso ─────────────────────────────────────

type Rls = typeof import("@/lib/rls");
type Tx = Parameters<Parameters<Rls["tenantTransaction"]>[0]>[0];
type Visto = { pid: number; g: string | null; iso: string; n: number; c: number };
type Suelta = { pid: number; g: string | null; n: number; c: number; st: string };

const texto = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).replace(/\s+/g, " ").slice(0, 300);

async function correrHijo(cfg: ConfigHijo): Promise<void> {
  const { combinacion: comb, a: A, b: B } = cfg;
  const otro = (x: Negocio) => (x.id === A.id ? B : A);
  const fallas: string[] = [];
  let pasos = 0;
  const exigir = (ok: boolean, msg: string) => {
    pasos++;
    if (!ok && fallas.length < 50) fallas.push(msg);
  };
  const terminar = (extra: Record<string, unknown>) => {
    process.stdout.write(`\n${MARCA_RESULTADO}${JSON.stringify({ pasos, fallas, ...extra })}\n`);
  };

  // Cada mensaje que sale de verdad a la base, y por qué conexión (del lado de la app). Tiene que
  // estar puesto ANTES de que el pool abra su primera conexión.
  const salidas: string[] = [];
  const conexiones = new WeakMap<object, number>();
  let conexionesVistas = 0;
  const queryOriginal = pg.Client.prototype.query;
  pg.Client.prototype.query = function (this: pg.Client, ...args: unknown[]) {
    if (!conexiones.has(this)) conexiones.set(this, ++conexionesVistas);
    const c = args[0] as string | { text?: string };
    salidas.push(typeof c === "string" ? c : String(c?.text ?? ""));
    return (queryOriginal as (...a: unknown[]) => unknown).apply(this, args);
  } as typeof queryOriginal;

  const { basePrisma } = await import("@/lib/prisma-base");
  const { prisma } = await import("@/lib/db");
  const { tenantTransaction, bookingTransaction } = await import("@/lib/rls");
  const { runInTenantContext } = await import("@/lib/tenant-context");

  const mirar = async (tx: Tx): Promise<Visto> =>
    (
      await tx.$queryRaw<Visto[]>`SELECT pg_backend_pid() AS pid,
             current_setting('app.current_tenant_id', true) AS g,
             current_setting('transaction_isolation') AS iso,
             (SELECT count(*) FROM "Order")::int AS n,
             (SELECT count(*) FROM "Client")::int AS c`
    )[0];
  const suelta = async (): Promise<Suelta> =>
    (
      await basePrisma.$queryRaw<Suelta[]>`SELECT pg_backend_pid() AS pid,
             current_setting('app.current_tenant_id', true) AS g,
             (SELECT count(*) FROM "Order")::int AS n,
             (SELECT count(*) FROM "Client")::int AS c,
             current_setting('statement_timeout') AS st`
    )[0];
  const exigirVisto = (v: Visto, quien: Negocio, donde: string, iso = "read committed") =>
    exigir(
      v.g === quien.id && v.n === quien.n && v.c === quien.c && v.iso === iso,
      `${donde}: la transacción de ${quien.nombre} vio ${JSON.stringify({ ...v, pid: undefined })} (esperado g=${quien.nombre}, n=${quien.n}, c=${quien.c}, ${iso})`,
    );
  const exigirSuelta = (s: Suelta, donde: string) =>
    exigir(
      (s.g === null || s.g === "") && s.n === 0 && s.c === 0 && s.st === "0",
      `${donde}: una consulta suelta sin negocio vio ${JSON.stringify({ ...s, pid: undefined })} (esperado 0 filas, GUC vacío, statement_timeout 0)`,
    );
  const verTx = (quien: Negocio, iso?: "Serializable") =>
    iso ? bookingTransaction(mirar, { tenantId: quien.id }) : tenantTransaction(mirar, { tenantId: quien.id });
  const seccion = async (nombre: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      exigir(false, `${nombre}: excepción inesperada: ${texto(e)}`);
    }
  };

  /** Una consulta suelta que cae en la conexión del servidor `pid`: rondas de `limite` a la vez. */
  const sueltaEn = async (pid: number, donde: string): Promise<Suelta | null> => {
    for (let ronda = 0; ronda < 15; ronda++) {
      const lote = await Promise.all(Array.from({ length: comb.limite }, () => suelta()));
      for (const s of lote) exigirSuelta(s, donde);
      const hit = lote.find((s) => s.pid === pid);
      if (hit) return hit;
    }
    return null;
  };

  /** Después de una falla con `quien`: el siguiente pedido del OTRO negocio, y las sueltas, limpios. */
  const verificarDespues = async (donde: string, quien: Negocio) => {
    const el = otro(quien);
    exigirVisto(await verTx(el), el, `${donde} → siguiente pedido`);
    exigirSuelta(await suelta(), `${donde} → siguiente suelta`);
    const lote = await Promise.all(
      Array.from({ length: comb.limite * 3 }, (_, i) =>
        i % 2 === 0 ? verTx(el).then((v) => exigirVisto(v, el, `${donde} → lote`)) : suelta().then((s) => exigirSuelta(s, `${donde} → lote`)),
      ),
    );
    void lote;
  };

  // 1) EL ROL. Con un rol exento de RLS el test no prueba nada: falla y no sigue.
  type Rol = { usuario: string; superu: boolean; bypass: boolean; propias: number; rls: boolean };
  const [rol] = await basePrisma.$queryRaw<Rol[]>`
    SELECT current_user AS usuario, r.rolsuper AS superu, r.rolbypassrls AS bypass,
           (SELECT count(*) FROM pg_class k JOIN pg_namespace s ON s.oid = k.relnamespace
             WHERE s.nspname = 'public' AND k.relkind IN ('r', 'p', 'v', 'm')
               AND pg_get_userbyid(k.relowner) = current_user)::int AS propias,
           (SELECT relrowsecurity FROM pg_class WHERE oid = '"Order"'::regclass) AS rls
      FROM pg_roles r WHERE r.rolname = current_user`;
  if (!rol || rol.superu || rol.bypass || rol.propias > 0 || !rol.rls) {
    exigir(
      false,
      `ROL INVÁLIDO para probar aislamiento: ${JSON.stringify(rol)}. Tiene que ser un rol sin BYPASSRLS, no superusuario, ` +
        `sin ser dueño de ninguna tabla (app_rls), y "Order" con RLS.`,
    );
    terminar({ conexiones: conexionesVistas });
    await basePrisma.$disconnect();
    process.exit(1);
  }
  exigirSuelta(await suelta(), "arranque");

  // 2) LA FIRMA DE LOS FLAGS: que la combinación pedida sea la que de verdad corre.
  await seccion("firma de los flags", async () => {
    salidas.length = 0;
    exigirVisto(await verTx(A), A, "firma");
    const mensajes = [...salidas];
    if (comb.begin) {
      exigir(mensajes.length === 3 && /^BEGIN; SELECT set_config\(/.test(mensajes[0]), `firma: BEGIN junto esperado, salió ${JSON.stringify(mensajes)}`);
    } else {
      exigir(mensajes.length === 4 && /^BEGIN$/.test(mensajes[0].trim()), `firma: BEGIN aparte esperado, salió ${JSON.stringify(mensajes)}`);
    }
    salidas.length = 0;
    const t = await runInTenantContext(A.id, async () => prisma.tenant.findUnique({ where: { id: A.id }, select: { id: true, slug: true } }));
    exigir(t?.id === A.id, `firma: Tenant leído ${JSON.stringify(t)}`);
    const tm = [...salidas];
    if (comb.directo) exigir(tm.length === 1 && !/BEGIN/.test(tm[0]), `firma: Tenant directo esperado, salió ${JSON.stringify(tm)}`);
    else exigir(tm.length > 1 && tm.some((m) => /BEGIN/.test(m)), `firma: Tenant por transacción esperado, salió ${JSON.stringify(tm)}`);
  });

  // 3) DESPUÉS DEL COMMIT Y DEL ROLLBACK, por la MISMA conexión: 0 filas y el GUC en ''.
  await seccion("commit / rollback", async () => {
    for (const quien of [A, B]) {
      const v = await verTx(quien);
      exigirVisto(v, quien, "antes del COMMIT");
      const s = await sueltaEn(v.pid, `después del COMMIT de ${quien.nombre}`);
      exigir(s !== null, `después del COMMIT de ${quien.nombre}: ninguna consulta suelta cayó en la conexión ${v.pid}`);
      if (s) exigir(s.g === "", `después del COMMIT de ${quien.nombre}: el GUC en la misma conexión es ${JSON.stringify(s.g)}, se esperaba ''`);

      let pid = -1;
      const error = await tenantTransaction(
        async (tx) => {
          const adentro = await mirar(tx);
          exigirVisto(adentro, quien, "antes del ROLLBACK");
          pid = adentro.pid;
          throw new Error("ROLLBACK provocado");
        },
        { tenantId: quien.id },
      ).then(
        () => null,
        (e: unknown) => e,
      );
      exigir(error instanceof Error && error.message === "ROLLBACK provocado", `ROLLBACK de ${quien.nombre}: error inesperado ${texto(error)}`);
      const r = await sueltaEn(pid, `después del ROLLBACK de ${quien.nombre}`);
      exigir(r !== null, `después del ROLLBACK de ${quien.nombre}: ninguna consulta suelta cayó en la conexión ${pid}`);
      if (r) exigir(r.g === "", `después del ROLLBACK de ${quien.nombre}: el GUC en la misma conexión es ${JSON.stringify(r.g)}, se esperaba ''`);
    }
  });

  // 4) 200 PEDIDOS CONCURRENTES alternando A y B, de cinco formas, con 50 sueltas mezcladas.
  await seccion("200 concurrentes", async () => {
    const tareas: Promise<void>[] = [];
    for (let i = 0; i < 200; i++) {
      const quien = i % 2 === 0 ? A : B;
      const forma = Math.floor(i / 2) % 5;
      const donde = `concurrente #${i} (${quien.nombre}, forma ${forma})`;
      if (forma === 0) tareas.push(verTx(quien).then((v) => exigirVisto(v, quien, donde)));
      if (forma === 1)
        tareas.push(
          runInTenantContext(quien.id, async () => prisma.order.findMany({ select: { id: true, tenantId: true } })).then((filas) =>
            exigir(filas.length === quien.n && filas.every((f) => f.tenantId === quien.id), `${donde}: findMany ${JSON.stringify(filas)}`),
          ),
        );
      if (forma === 2)
        tareas.push(
          runInTenantContext(quien.id, async () => prisma.order.count()).then((n) => exigir(n === quien.n, `${donde}: count ${n}`)),
        );
      if (forma === 3)
        tareas.push(
          runInTenantContext(quien.id, async () => prisma.tenant.findUnique({ where: { id: quien.id }, select: { id: true } })).then((t) =>
            exigir(t?.id === quien.id, `${donde}: Tenant ${JSON.stringify(t)}`),
          ),
        );
      if (forma === 4)
        tareas.push(
          runInTenantContext(quien.id, async () =>
            prisma.tenant.findUnique({ where: { id: quien.id }, select: { id: true, _count: { select: { orders: true } } } }),
          ).then((t) => exigir(t?._count.orders === quien.n, `${donde}: Tenant con _count ${JSON.stringify(t)}`)),
        );
      if (i % 4 === 0) tareas.push(suelta().then((s) => exigirSuelta(s, `suelta mezclada #${i}`)));
    }
    const res = await Promise.allSettled(tareas);
    for (const r of res) if (r.status === "rejected") exigir(false, `200 concurrentes: un pedido falló: ${texto(r.reason)}`);
    exigir(
      conexionesVistas === comb.limite,
      `pool: se esperaban exactamente ${comb.limite} conexiones reusadas por 250 pedidos, se vieron ${conexionesVistas}`,
    );
  });

  // 5) FALLAS INYECTADAS, cada una con A y con B; después, el siguiente pedido del otro negocio.
  for (const quien of [A, B]) {
    await seccion(`timeout de transacción (${quien.nombre})`, async () => {
      const e = await tenantTransaction(
        async (tx) => {
          await tx.$queryRaw`SELECT pg_sleep(0.6)`;
          return mirar(tx);
        },
        { tenantId: quien.id, timeoutMs: 150 },
      ).then(
        () => null,
        (err: unknown) => err,
      );
      exigir(e !== null, `timeout de transacción (${quien.nombre}): la transacción no se cortó`);
      await verificarDespues(`timeout de transacción (${quien.nombre})`, quien);
    });

    await seccion(`statement_timeout (${quien.nombre})`, async () => {
      const e = await tenantTransaction(
        async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '50ms'`);
          await tx.$queryRaw`SELECT pg_sleep(0.5)`;
        },
        { tenantId: quien.id },
      ).then(
        () => null,
        (err: unknown) => err,
      );
      exigir(e !== null && /statement timeout|57014|canceling statement/i.test(texto(e)), `statement_timeout (${quien.nombre}): ${texto(e)}`);
      await verificarDespues(`statement_timeout (${quien.nombre})`, quien);
    });

    await seccion(`conflicto Serializable con reintento (${quien.nombre})`, async () => {
      const pedido = quien.pedidos[0];
      let intentos = 0;
      let leyeron = 0;
      let soltar!: () => void;
      const ambosLeyeron = new Promise<void>((r) => (soltar = r));
      const correr = (marca: string) => {
        let vuelta = 0;
        return bookingTransaction(
          async (tx) => {
            intentos++;
            vuelta++;
            const v = await mirar(tx);
            exigirVisto(v, quien, `Serializable ${marca} vuelta ${vuelta}`, "serializable");
            await tx.$queryRaw`SELECT notes FROM "Order" WHERE id = ${pedido}`;
            if (vuelta === 1) {
              if (++leyeron === 2) soltar();
              await ambosLeyeron;
            }
            await tx.$executeRaw`UPDATE "Order" SET notes = ${marca} WHERE id = ${pedido}`;
            return marca;
          },
          { tenantId: quien.id },
        );
      };
      const r = await Promise.allSettled([correr(`s1-${quien.nombre}`), correr(`s2-${quien.nombre}`)]);
      exigir(
        r.every((x) => x.status === "fulfilled"),
        `Serializable (${quien.nombre}): ${r.map((x) => (x.status === "fulfilled" ? "ok" : texto(x.reason))).join(" | ")}`,
      );
      exigir(intentos >= 3, `Serializable (${quien.nombre}): no hubo conflicto (intentos=${intentos}); el reintento no se probó`);
      await verificarDespues(`Serializable (${quien.nombre})`, quien);
    });

    await seccion(`transacciones vacías (${quien.nombre})`, async () => {
      exigir((await tenantTransaction(async () => 7, { tenantId: quien.id })) === 7, "tenantTransaction vacía");
      exigir((await basePrisma.$transaction(async () => 8)) === 8, "basePrisma.$transaction vacía");
      await basePrisma.$transaction([]);
      const e = await basePrisma
        .$transaction(async () => {
          throw new Error("vacía con rollback");
        })
        .then(
          () => null,
          (err: unknown) => err,
        );
      exigir(e instanceof Error && e.message === "vacía con rollback", `vacía con rollback: ${texto(e)}`);
      await verificarDespues(`transacciones vacías (${quien.nombre})`, quien);
    });

    await seccion(`$queryRaw dentro de tenantTransaction (${quien.nombre})`, async () => {
      const filas = await tenantTransaction(async (tx) => tx.$queryRaw<{ id: string; tenantId: string }[]>`SELECT id, "tenantId" FROM "Order"`, {
        tenantId: quien.id,
      });
      exigir(filas.length === quien.n && filas.every((f) => f.tenantId === quien.id), `$queryRaw sin filtro (${quien.nombre}): ${JSON.stringify(filas)}`);
      const e = await tenantTransaction(
        async (tx) => {
          await tx.$queryRaw`SELECT count(*) FROM "Order"`;
          await tx.$queryRawUnsafe(`SELECT * FROM "TablaQueNoExiste_aislamiento"`);
        },
        { tenantId: quien.id },
      ).then(
        () => null,
        (err: unknown) => err,
      );
      exigir(e !== null, `$queryRaw con error (${quien.nombre}): no falló`);
      await verificarDespues(`$queryRaw dentro de tenantTransaction (${quien.nombre})`, quien);
    });
  }

  // 6) Al final: nada quedó puesto en ninguna conexión, y el pool no pasó su techo.
  await seccion("cierre", async () => {
    const lote = await Promise.all(Array.from({ length: comb.limite * 4 }, () => suelta()));
    for (const s of lote) exigirSuelta(s, "cierre");
    exigir(conexionesVistas <= comb.limite, `pool: ${conexionesVistas} conexiones, techo ${comb.limite}`);
  });

  pg.Client.prototype.query = queryOriginal;
  terminar({ conexiones: conexionesVistas });
  await basePrisma.$disconnect();
  process.exit(fallas.length === 0 ? 0 : 1);
}

// ── EL TEST: la base efímera y un hijo por combinación y por vía ────────────────────────────────

const RAIZ = path.resolve(__dirname, "..", "..");

function urlPorPgBouncer(urlApp: string, hostPuerto: string): string {
  const u = new URL(urlApp);
  u.host = hostPuerto;
  u.searchParams.delete("host");
  return u.toString();
}

function esLocal(hostPuerto: string): boolean {
  const host = hostPuerto.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

interface Resultado {
  codigo: number | null;
  pasos?: number;
  fallas?: string[];
  conexiones?: number;
  cola: string;
}

function correrUnHijo(cfg: ConfigHijo, url: string): Promise<Resultado> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const v of [...FLAGS, "NODE_TEST_CONTEXT", "FORCE_TENANT_SLUG", "TENANT_HOST_MAP", "DEMO_MODE_ENABLED"]) delete (env as Record<string, string | undefined>)[v];
  Object.assign(env, cfg.combinacion.env, {
    AISLAMIENTO_HIJO: JSON.stringify(cfg),
    DATABASE_URL: url,
    OPERATOR_DATABASE_URL: url,
    RLS_ENFORCEMENT: "on",
    APP_BASE_DOMAIN: DOMINIO_DE_PRUEBA,
    NODE_ENV: "development",
    DB_CONNECT_TIMEOUT_MS: "8000",
  });
  return new Promise((resolve) => {
    const hijo = spawn(process.execPath, ["--import", "tsx", __filename], { cwd: RAIZ, env, stdio: ["ignore", "pipe", "pipe"] });
    let salida = "";
    hijo.stdout.on("data", (d) => (salida += d));
    hijo.stderr.on("data", (d) => (salida += d));
    const reloj = setTimeout(() => hijo.kill("SIGKILL"), 180_000);
    hijo.on("close", (codigo) => {
      clearTimeout(reloj);
      const linea = salida.split("\n").find((l) => l.startsWith(MARCA_RESULTADO));
      const r = linea ? (JSON.parse(linea.slice(MARCA_RESULTADO.length)) as Omit<Resultado, "codigo" | "cola">) : {};
      resolve({ codigo, ...r, cola: salida.slice(-1500) });
    });
  });
}

async function poolModeDelPgBouncer(hostPuerto: string): Promise<string> {
  const c = new pg.Client({ connectionString: `postgresql://postgres@${hostPuerto}/pgbouncer` });
  await c.connect();
  try {
    const r = await c.query("SHOW CONFIG");
    const fila = (r.rows as { key: string; value: string }[]).find((f) => f.key === "pool_mode");
    return fila?.value ?? "(desconocido)";
  } finally {
    await c.end();
  }
}

function negocio(nombre: "A" | "B", n: BaseEfimera["a"]): Negocio {
  return { nombre, id: n.id, n: n.pedidos.length, c: n.clientes.length, pedidos: n.pedidos };
}

async function correrTest(t: TestContext): Promise<void> {
  // AISLAMIENTO_DATABASE_URL manda; si no está, el mismo Postgres de los tests (ERP_TEST_PG_URL), que
  // en CI ya existe (gates.yml): así el test corre en CI en vez de saltearse.
  const servidor = process.env.AISLAMIENTO_DATABASE_URL?.trim() || process.env.ERP_TEST_PG_URL?.trim();
  if (!servidor) {
    const aviso =
      "Ni AISLAMIENTO_DATABASE_URL ni ERP_TEST_PG_URL están puestas: el aislamiento de los flags del pool queda SIN verificar. " +
      "Apuntala a un Postgres LOCAL (nunca Neon), p. ej. postgresql://postgres@localhost:5433/postgres?host=/tmp/pgrun";
    // En CI no se saltea en silencio (misma regla que src/test/base-efimera.ts).
    if (process.env.CI) assert.fail(aviso);
    console.warn(`[aislamiento-flags-pool] ${aviso}`);
    t.skip(aviso);
    return;
  }
  // La guarda de la base efímera rechaza cualquier servidor que no sea de esta máquina.
  const base = await baseEfimeraParaElTest(t, { ...process.env, ERP_TEST_PG_URL: servidor });
  if (!base) return;
  const A = negocio("A", base.a);
  const B = negocio("B", base.b);
  assert.notEqual(A.n, B.n, "A y B tienen que tener distinta cantidad de pedidos");

  const vias: { nombre: string; url: string }[] = [{ nombre: "Postgres directo", url: base.urlApp }];
  const pgb = process.env.AISLAMIENTO_PGBOUNCER?.trim();
  if (pgb) {
    assert.ok(esLocal(pgb), `AISLAMIENTO_PGBOUNCER tiene que ser un PgBouncer de esta máquina, no ${pgb}`);
    assert.equal(await poolModeDelPgBouncer(pgb), "transaction", "el PgBouncer tiene que estar en modo transacción (como el pooler de Neon)");
    vias.push({ nombre: `PgBouncer ${pgb} (transacción)`, url: urlPorPgBouncer(base.urlApp, pgb) });
  } else {
    t.diagnostic("AISLAMIENTO_PGBOUNCER no está puesta: corre sólo contra Postgres directo.");
  }

  for (const via of vias) {
    for (const combinacion of COMBINACIONES) {
      await t.test(`${via.nombre} · ${combinacion.nombre}`, async (st) => {
        const r = await correrUnHijo({ via: via.nombre, combinacion, a: A, b: B }, via.url);
        st.diagnostic(`pasos ${r.pasos ?? "?"} · conexiones ${r.conexiones ?? "?"} · fallas ${r.fallas?.length ?? "?"}`);
        assert.ok(r.pasos !== undefined, `el hijo no terminó (código ${r.codigo}). Cola:\n${r.cola}`);
        assert.deepEqual(r.fallas, [], `fugas o fallas:\n${(r.fallas ?? []).join("\n")}`);
        assert.equal(r.codigo, 0, `el hijo salió con ${r.codigo}. Cola:\n${r.cola}`);
      });
    }
  }
}

const hijo = process.env.AISLAMIENTO_HIJO;
if (hijo) {
  correrHijo(JSON.parse(hijo) as ConfigHijo).catch((e: unknown) => {
    process.stdout.write(`\n${MARCA_RESULTADO}${JSON.stringify({ pasos: 0, fallas: [`el hijo se cayó: ${texto(e)}`] })}\n`);
    process.exit(1);
  });
} else {
  test("aislamiento entre negocios con los flags del pool (app_rls, 200 concurrentes, fallas inyectadas)", correrTest);
}
