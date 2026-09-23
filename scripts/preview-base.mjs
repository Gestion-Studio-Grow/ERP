// ¿La base a la que apunta este preview es la de PRODUCCIÓN?
//
// POR QUÉ (medido el 2026-09-23): en Vercel, DATABASE_URL y OPERATOR_DATABASE_URL estaban
// cargadas para Preview Y Production a la vez. Cada push a una rama publicaba código nuevo
// conectado a los datos reales de los clientes, y la consola /operador de cualquier preview
// podía cambiar negocios reales. La solución de fondo es de configuración (una base de QA sólo
// para Preview); esto es la red por si esa configuración falta o se rompe.
//
// La señal: la base tiene el negocio vivo (`beauty-spa`). La base de QA se arma SIN negocios
// reales, así que no lo tiene. No poder mirar cuenta como "no sé" y bloquea igual (fail-closed):
// un preview con la base inaccesible no sirve para nada, y uno con la base de producción es
// peligroso. Sólo lectura: un SELECT sobre Tenant.

import pg from "pg";

export const SLUG_VIVO = "beauty-spa";

/** true = producción (o no se pudo mirar) → el preview se bloquea. false = base sin negocios reales. */
export async function previewDebeBloquearse(urls) {
  const presentes = urls.map((u) => (u ?? "").trim()).filter(Boolean);
  if (presentes.length === 0) return { bloquear: true, motivo: "el preview no tiene base configurada" };
  for (const url of presentes) {
    const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
    try {
      await client.connect();
      const r = await client.query(`SELECT 1 FROM "Tenant" WHERE slug = $1 LIMIT 1`, [SLUG_VIVO]);
      if (r.rowCount > 0) return { bloquear: true, motivo: `la base tiene el negocio vivo (${SLUG_VIVO}): es la de producción` };
    } catch (e) {
      return { bloquear: true, motivo: `no se pudo mirar la base (${e.code ?? e.message})` };
    } finally {
      await client.end().catch(() => {});
    }
  }
  return { bloquear: false, motivo: "base sin negocios reales" };
}
