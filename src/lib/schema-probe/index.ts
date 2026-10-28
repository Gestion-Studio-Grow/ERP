// Probe de schema del proceso (Gate 2 nivel 2). Ver ./probe.ts para el contrato y la caché.
//
//   import { hayTabla, hayColumna, hayValorEnum } from "@/lib/schema-probe";
//   if (!(await hayTabla("ApiKey"))) return mecanismoDeEnvDeHoy();
//
// Una sola instancia por proceso (módulo). Prisma se importa perezoso: importar este módulo
// no abre la base, y los tests de ./probe.ts no lo necesitan.

import { crearSchemaProbe, type ConsultaSql } from "./probe";

export { crearSchemaProbe, TTL_NEGATIVO_MS } from "./probe";
export type { ConsultaSql, OpcionesProbe, SchemaProbe } from "./probe";

const consultarConPrisma: ConsultaSql = async (sql, params) => {
  const { prisma } = await import("@/lib/prisma");
  return prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...params);
};

const probeDelProceso = crearSchemaProbe(consultarConPrisma);

export const hayTabla = probeDelProceso.hayTabla;
export const hayColumna = probeDelProceso.hayColumna;
export const hayValorEnum = probeDelProceso.hayValorEnum;
export const olvidarSchemaProbe = probeDelProceso.olvidar;
