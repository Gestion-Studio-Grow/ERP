// PROFETURNOS · Directorio público: las lecturas reales detrás de `armarDirectorio` (directorio-core.ts).
//
// LECTURA ENTRE NEGOCIOS (para el certificador), en dos planos:
//  1. `candidatos`: `basePrisma.tenant` — `Tenant` no tiene RLS (prisma/rls/0001_enable_rls.sql) y
//     sólo se leen columnas propias (id, nombre, subdominio), igual que el ruteo y los trámites
//     públicos (tramites.server.ts). Ninguna otra tabla se lee con el cliente crudo.
//  2. Todo lo demás, POR NEGOCIO, dentro de `runInTenantContext(<su tenantId>)`: con RLS prendido el
//     cliente `prisma` fija `app.current_tenant_id` a ese negocio en cada consulta; con RLS apagado
//     cada consulta lleva además su `where: { tenantId }` explícito. Sin BYPASS.
//
// Qué se lee de cada negocio: `PadelConfig` (sólo `plantillas` para la clave `_directorio`, y los dos
// precios); si se anotó, la verificación de GSG, los horarios libres (`agendaPublica`, lo mismo que
// muestra su turnero) y los nombres de sus clubes. Nunca alumnos, clases con dueño ni teléfonos.
//
// Caché corta en memoria (60 s por instancia): el directorio no se arma en cada visita. Quien se
// anota o se baja aparece o desaparece en ese plazo.

import "server-only";
import { basePrisma, prisma } from "@/lib/prisma";
import { runInTenantContext } from "@/lib/tenant-context";
import { agendaPublica, clubesDe } from "@/lib/padel/datos.server";
import { DIRECTORIO_DEFAULT, leerDirectorio } from "@/lib/padel/directorio";
import { turneroAbiertoDe } from "./verificacion.server";
import { armarDirectorio, memoriaCorta, type DepsDirectorio, type ProfePublico } from "./directorio-core";

const MODULO_CLASES = "padel-clases";
const DOMINIO_POR_DEFECTO = "gsgapp.com.ar";

/** Corre `fn` en el contexto del negocio `tenantId` (async + await adentro: el contexto no se pierde). */
const enSuNegocio = <T>(tenantId: string, fn: () => Promise<T>): Promise<T> => runInTenantContext(tenantId, async () => await fn());

export const depsDirectorio: DepsDirectorio = {
  async candidatos(tope) {
    const filas = await basePrisma.tenant.findMany({
      where: { status: { in: ["TRIAL", "ACTIVE"] }, modules: { has: MODULO_CLASES }, subdomain: { not: null } },
      select: { id: true, name: true, subdomain: true },
      orderBy: { createdAt: "asc" },
      take: tope,
    });
    return filas.map((t) => ({ tenantId: t.id, nombre: t.name, subdomain: t.subdomain }));
  },
  ajuste: (tenantId) =>
    enSuNegocio(tenantId, async () => {
      const c = await prisma.padelConfig.findUnique({
        where: { tenantId },
        select: { plantillas: true, precioIndividual: true, precioGrupal: true },
      });
      return {
        directorio: c ? leerDirectorio(c.plantillas) : { ...DIRECTORIO_DEFAULT },
        precioIndividual: Number(c?.precioIndividual ?? 0),
        precioGrupal: Number(c?.precioGrupal ?? 0),
      };
    }),
  abierto: (tenantId) => enSuNegocio(tenantId, () => turneroAbiertoDe(tenantId)),
  agenda: (tenantId) => enSuNegocio(tenantId, () => agendaPublica(tenantId)),
  clubes: (tenantId) => enSuNegocio(tenantId, async () => (await clubesDe(tenantId)).map((c) => c.nombre)),
};

const memoria = memoriaCorta<ProfePublico[]>(60_000);

/** El directorio entero (sin filtrar), con caché corta. */
export function directorioDeProfes(): Promise<ProfePublico[]> {
  const dominio = process.env.APP_BASE_DOMAIN?.trim() || DOMINIO_POR_DEFECTO;
  return memoria(() => armarDirectorio(depsDirectorio, dominio));
}
