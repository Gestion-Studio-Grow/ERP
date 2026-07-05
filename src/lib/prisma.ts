// Punto de entrada del cliente Prisma para el RUNTIME de la app.
//
// `prisma` es el cliente CONMUTADO por el flag RLS_ENFORCEMENT (ver db.ts):
// con el flag OFF es el crudo (idéntico a hoy); con el flag ON aplica RLS por
// tenant (ADR-018). Los ~20 archivos de runtime siguen importando `prisma` de
// acá sin cambios.
//
// Para paths que NO deben pasar por RLS (resolución de tenant, seed, provisioning),
// importar `basePrisma` de `@/lib/prisma-base` — SIEMPRE el cliente crudo.

export { prisma } from "@/lib/db";
export { basePrisma, RLS_ENFORCEMENT } from "@/lib/prisma-base";
