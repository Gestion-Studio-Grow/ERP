// Probe de schema del proceso (Gate 2 nivel 2). Ver ./probe.ts para el contrato y la caché.
//
//   import { hayTabla, hayColumna, hayValorEnum, sePuedeEscribirValorEnum } from "@/lib/schema-probe";
//   if (!(await hayTabla("ApiKey"))) return mecanismoDeEnvDeHoy();
//   if (!(await sePuedeEscribirValorEnum("PaymentMethod", "DEBITO"))) ocultarElMedio();
//
// Una sola instancia por proceso (módulo). Prisma se importa perezoso: importar este módulo
// no abre la base, y los tests de ./probe.ts no lo necesitan.

import * as enumsDelCliente from "@/generated/prisma/enums";
import { crearSchemaProbe, type ConsultaSql } from "./probe";

export { clienteConoceValor, crearSchemaProbe, TTL_NEGATIVO_MS } from "./probe";
export type { ConsultaSql, OpcionesProbe, SchemaProbe } from "./probe";

const consultarConPrisma: ConsultaSql = async (sql, params) => {
  const { prisma } = await import("@/lib/prisma");
  return prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...params);
};

// `enumsDelCliente`: los enums del cliente de Prisma de ESTE build (módulo liviano, sin conexión).
const probeDelProceso = crearSchemaProbe(consultarConPrisma, { enumsDelCliente });

export const hayTabla = probeDelProceso.hayTabla;
export const hayColumna = probeDelProceso.hayColumna;
export const hayValorEnum = probeDelProceso.hayValorEnum;
/** Para ESCRIBIR un valor nuevo de enum (M1: DEBITO/CREDITO · M6: REPARTIDOR/ENCARGADO). */
export const sePuedeEscribirValorEnum = probeDelProceso.sePuedeEscribirValorEnum;
export const olvidarSchemaProbe = probeDelProceso.olvidar;
