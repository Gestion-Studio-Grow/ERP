// Guarda del seed de ejemplo (`npm run seed`, prisma/seed.ts). El seed borra y vuelve a cargar
// los datos del negocio de muestra; contra una base real, con el rol dueño de las tablas, eso
// alcanza para borrar datos de clientes (ENG-001, docs/agent/BACKLOG.md). Por eso sólo corre
// contra un Postgres de esta máquina: se decide leyendo la URL, antes de abrir la conexión.
//
// El host efectivo es el que usaría libpq: el parámetro `host` de la URL, si está, manda sobre
// el host de la autoridad. Un `host` que empieza con "/" es un socket unix local.

export type ResultadoGuarda = { ok: true } | { ok: false; motivo: string };

const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function baseLocalParaSeed(url: string | undefined): ResultadoGuarda {
  if (!url) return { ok: false, motivo: "DATABASE_URL está vacía: el seed no sabe a qué base ir." };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, motivo: "DATABASE_URL no es una URL de Postgres legible." };
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    return { ok: false, motivo: `DATABASE_URL no es de Postgres (${parsed.protocol}).` };
  }

  const hostParam = parsed.searchParams.get("host");
  if (hostParam?.startsWith("/")) return { ok: true };

  // Sin host en la URL, node-postgres toma PGHOST del entorno, que puede ser cualquier base.
  const host = (hostParam || parsed.hostname).toLowerCase();
  if (host === "") {
    return { ok: false, motivo: "DATABASE_URL no dice el host: el seed no adivina a qué base va." };
  }
  if (HOSTS_LOCALES.has(host)) return { ok: true };

  return {
    ok: false,
    motivo:
      `DATABASE_URL apunta a ${host}, que no es esta máquina. El seed de ejemplo borra y ` +
      "recarga datos: sólo corre contra un Postgres local. Para datos de demo en QA está " +
      "`npm run seed:qa-tenants`.",
  };
}
