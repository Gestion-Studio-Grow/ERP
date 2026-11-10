// ============================================================================
// CONTROL DIARIO DE INTEGRIDAD DE PLATA — cobros contra caja, por negocio. SOLO LECTURA.
// ============================================================================
//
//   INTEGRIDAD_DATABASE_URL=… npx tsx scripts/sre/control-integridad-plata.mts [--dias 2] [--json]
//
// Qué hace: abre UNA conexión, `BEGIN TRANSACTION READ ONLY`, corre los cinco controles de
// src/lib/sre/integridad-plata.ts, `ROLLBACK`, imprime el informe y sale:
//   0 = todo cuadra · 1 = hay diferencias o un control no se pudo evaluar · 2 = no pudo correr.
//
// Qué NO hace: no escribe, no migra, no toca ningún dato. La transacción es de sólo lectura: si
// por un error futuro alguien le agregara una escritura, Postgres la rechaza.
//
// La conexión sale SÓLO de `INTEGRIDAD_DATABASE_URL`. A propósito NO cae en `DATABASE_URL`: nadie
// lo corre contra producción «sin querer». Tiene que ser un rol que vea todos los negocios (con el
// rol de la app, RLS deja ver cero filas y el control daría un OK falso — por eso, si no ve ningún
// negocio, lo dice). Qué rol usar es decisión del dueño: docs/runbooks/SLO-Y-CONFIABILIDAD.md §C.
//
// La URL nunca se imprime; de un error sólo se muestra el código.
// ============================================================================

import { parseArgs } from "node:util";
import pg from "pg";
import { controlarIntegridadPlata, resumenParaAviso, type Consulta } from "../../src/lib/sre/integridad-plata";

const { values } = parseArgs({ options: { dias: { type: "string" }, json: { type: "boolean" } } });

async function principal(): Promise<number> {
  const url = process.env.INTEGRIDAD_DATABASE_URL;
  if (!url) {
    console.error("Falta INTEGRIDAD_DATABASE_URL. No se usa DATABASE_URL a propósito (ver cabecera).");
    return 2;
  }
  const cliente = new pg.Client({ connectionString: url, statement_timeout: 30_000, connectionTimeoutMillis: 15_000 });
  try {
    await cliente.connect();
    await cliente.query("BEGIN TRANSACTION READ ONLY");
    const consulta: Consulta = async (sql, params) => (await cliente.query(sql, params ? [...params] : [])).rows;
    const informe = await controlarIntegridadPlata(consulta, { dias: values.dias ? Number(values.dias) : undefined });
    const negocios = await consulta(`SELECT count(*)::int AS n FROM "Tenant"`);
    await cliente.query("ROLLBACK");

    if (values.json) console.log(JSON.stringify(informe, null, 2));
    else console.log(resumenParaAviso(informe));
    if (Number(negocios[0]?.n ?? 0) === 0) {
      console.error("Este rol no ve NINGÚN negocio (¿RLS?): el resultado no vale. Usá un rol que vea todos.");
      return 1;
    }
    return informe.ok ? 0 : 1;
  } catch (err) {
    const codigo = (err as { code?: string }).code ?? "sin-código";
    console.error(`El control no pudo correr (código ${codigo}). No se muestra el detalle porque puede traer la conexión.`);
    return 2;
  } finally {
    await cliente.end().catch(() => {});
  }
}

process.exitCode = await principal();
