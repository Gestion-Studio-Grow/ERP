// MEDICIÓN LOCAL (PLAT-005, perf 4): cuántas consultas a `Tenant` hace un pedido del Inicio.
//
// Lo corre `tenant-fila-del-pedido.test.ts` en un proceso hijo con `--conditions=react-server`:
// así `cache()` de React es el de verdad (el del servidor), con un despachador por pedido montado
// sobre AsyncLocalStorage, que es como Next le da a cada pedido su propio caché. Fuera de esa
// condición `cache()` no memoiza y la medición no diría nada.
//
// SIN BASE: los delegados `tenant` de los dos clientes de Prisma se reemplazan por contadores que
// devuelven filas falsas. No se conecta a ninguna base (nunca Neon). Imprime UNA línea JSON.
//
// Lectores medidos: los de `Tenant` que corren en el layout del panel + la página del Inicio, salvo
// `leerTenant` de `src/apps/contexto.server.ts` (importa `server-only`, que fuera de Next no resuelve):
// suma UNA consulta más por pedido, igual antes y después (no se tocó).
// `MODULE_REGISTRY_ENABLED=on` para que el gate por módulo también lea (peor caso).

import { AsyncLocalStorage } from "node:async_hooks";
import * as React from "react";

process.env.DATABASE_URL ??= "postgresql://medicion:medicion@127.0.0.1:1/medicion";
process.env.MODULE_REGISTRY_ENABLED = "on";
delete process.env.APP_BASE_DOMAIN;
delete process.env.TENANT_HOST_MAP;

type Fila = { id: string; slug: string; subdomain: string; blueprintId: string | null; modules: string[]; accentPreset: string | null };
const FILAS: Fila[] = [
  { id: "t-a", slug: "negocio-a", subdomain: "negocio-a", blueprintId: "carniceria", modules: ["caja"], accentPreset: "rosa" },
  { id: "t-b", slug: "negocio-b", subdomain: "negocio-b", blueprintId: "servicios", modules: ["turnos"], accentPreset: "verde" },
];

function buscar(where: Record<string, unknown> | undefined): Fila | null {
  if (!where) return FILAS[0];
  return FILAS.find((f) => Object.entries(where).every(([k, v]) => (f as Record<string, unknown>)[k] === v)) ?? null;
}
function proyectar(f: Fila | null, select: Record<string, boolean> | undefined) {
  if (!f || !select) return f;
  return Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, (f as Record<string, unknown>)[k]]));
}

async function main() {
  const internals = (React as unknown as Record<string, { A: unknown }>)
    .__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  if (!internals) throw new Error("correr con --conditions=react-server");
  const pedido = new AsyncLocalStorage<Map<unknown, unknown>>();
  internals.A = {
    getCacheForType(crear: () => unknown) {
      const m = pedido.getStore();
      if (!m) throw new Error("lectura fuera de un pedido");
      if (!m.has(crear)) m.set(crear, crear());
      return m.get(crear);
    },
  };

  const { basePrisma, prisma } = await import("@/lib/prisma");
  let consultas = 0;
  for (const cliente of [basePrisma, prisma] as unknown as Record<string, Record<string, unknown>>[]) {
    const t = cliente.tenant;
    t.findUnique = async (a: { where?: Record<string, unknown>; select?: Record<string, boolean> }) => (consultas++, proyectar(buscar(a?.where), a?.select));
    t.findFirst = t.findUnique;
    t.findMany = async () => (consultas++, FILAS.slice(0, 1));
    t.count = async () => (consultas++, FILAS.length);
  }

  const { getCurrentTenantId } = await import("@/lib/tenant");
  const { getProductoContexto, getProductoActual } = await import("@/lib/producto");
  const { getTeamAccentPreset } = await import("@/lib/team-accent");
  const { getActiveModuleIds } = await import("@/lib/module-gating");
  const { getTenantBrand } = await import("@/lib/branding");
  const { getCurrentTenantRubro } = await import("@/lib/carniceria/rubro");

  async function pedidoDelInicio(slug: string) {
    process.env.FORCE_TENANT_SLUG = slug;
    const antes = consultas;
    const r = await pedido.run(new Map(), async () => {
      // Layout (Promise.all) + página del Inicio, en el orden en que se piden.
      const [id, ctx, acento] = await Promise.all([
        getCurrentTenantId(),
        getProductoContexto(),
        getTeamAccentPreset(),
        getTenantBrand(),
        getCurrentTenantRubro(),
      ]);
      const producto = await getProductoActual();
      const activos = await getActiveModuleIds();
      return { id, blueprintId: ctx.blueprintId, producto, acento, activos: activos ? [...activos].sort() : null };
    });
    return { ...r, consultasTenant: consultas - antes };
  }

  const a = await pedidoDelInicio("negocio-a");
  const b = await pedidoDelInicio("negocio-b");
  const a2 = await pedidoDelInicio("negocio-a");
  process.stdout.write(JSON.stringify({ a, b, a2 }) + "\n");
}

main().then(
  () => process.exit(0),
  (e) => {
    process.stderr.write(String(e?.stack ?? e).slice(0, 2000) + "\n");
    process.exit(1);
  },
);
