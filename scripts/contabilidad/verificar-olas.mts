// ============================================================================
// ¿Están aplicadas las migraciones de Contabilidad? (T0 de Control de gestión, GSG-CTRL-001)
// ============================================================================
//
// SÓLO LECTURA y a mano: lo corre el dueño (Neon free: el agente no consulta producción). Dos
// SELECT, sin escribir nada:
//   1. `_prisma_migrations`: las filas de contabilidad_ola1 / contabilidad_ola2_roles, terminadas
//      (finished_at) y sin rollback.
//   2. `information_schema`: que las tablas y columnas existan de verdad (una migración marcada a
//      mano como aplicada con `migrate resolve` no las crea).
//
//   VERIFICAR_DATABASE_URL='<cadena de sólo lectura>' npx tsx scripts/contabilidad/verificar-olas.mts
//
// Sale con 0 si ola 1 está completa (la ola 2 se informa: es la de T0, pendiente de Gate 2), 1 si
// la ola 1 falta o quedó a medias, 2 si no conecta. Evidencia sin base (08/11/2026): la ola 1 sale
// de prisma/lote-deploy.txt como «aplicada por el build de producción» y los builds de #23 y #36
// (07/11) pasaron el freno 1b de scripts/vercel-build.mjs, que exige pendientes == lote.

import pg from "pg";

const OLAS = [
  {
    nombre: "20261104122000_contabilidad_ola1",
    tablas: ["CuentaContable", "Ejercicio", "Asiento", "AsientoLinea", "ObligacionFiscal", "VencimientoFiscal"],
    columnas: [] as [string, string][],
  },
  {
    nombre: "20261108150000_contabilidad_ola2_roles",
    tablas: ["CuentaRol", "ConfigContable"],
    columnas: [
      ["CuentaContable", "rubro"],
      ["CuentaContable", "monedaCuenta"],
      ["AsientoLinea", "fechaOrigen"],
    ] as [string, string][],
  },
];

const url = process.env.VERIFICAR_DATABASE_URL;
if (!url) {
  console.error("Falta VERIFICAR_DATABASE_URL (una cadena de sólo lectura). No se consulta nada.");
  process.exit(2);
}

const cliente = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15_000 });
try {
  await cliente.connect();
} catch (e) {
  console.error(`No conecta: ${(e as Error).message}`);
  process.exit(2);
}

try {
  const migraciones = await cliente.query<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>(
    `SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name = ANY($1)`,
    [OLAS.map((o) => o.nombre)],
  );
  const columnas = await cliente.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ANY($1)`,
    [[...new Set(OLAS.flatMap((o) => [...o.tablas, ...o.columnas.map(([t]) => t)]))]],
  );
  const hay = new Set(columnas.rows.map((r) => `${r.table_name}.${r.column_name}`));
  const tablas = new Set(columnas.rows.map((r) => r.table_name));

  let ola1Completa = false;
  for (const ola of OLAS) {
    const fila = migraciones.rows.find((r) => r.migration_name === ola.nombre && r.rolled_back_at === null);
    const registrada = !!fila?.finished_at;
    const faltan = [...ola.tablas.filter((t) => !tablas.has(t)), ...ola.columnas.filter(([t, c]) => !hay.has(`${t}.${c}`)).map(([t, c]) => `${t}.${c}`)];
    const completa = registrada && faltan.length === 0;
    if (ola.nombre.includes("ola1")) ola1Completa = completa;
    console.log(`${completa ? "APLICADA" : registrada ? "A MEDIAS" : "PENDIENTE"}  ${ola.nombre}${faltan.length ? `  (faltan: ${faltan.join(", ")})` : ""}`);
  }
  process.exitCode = ola1Completa ? 0 : 1;
} finally {
  await cliente.end();
}
