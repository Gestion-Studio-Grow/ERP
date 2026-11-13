// PROFETURNOS · Directorio público: las lecturas reales detrás de `armarDirectorio` (directorio-core.ts).
//
// LECTURA ENTRE NEGOCIOS (para el certificador), en dos planos:
//  1. `candidatos`: UNA consulta con el cliente crudo (`basePrisma`) que sólo trae QUIÉNES se
//     anotaron: `PadelConfig.tenantId` de las filas con `plantillas._directorio.visible = true`, y de
//     su `Tenant` (sin RLS, prisma/rls/0001_enable_rls.sql) id, nombre y subdominio. No se lee el JSON
//     de plantillas (ni textos, ni precios, ni nada) entre negocios: el filtro corre en Postgres y
//     vuelve sólo el id. Es un índice: lo que decide si aparece es el paso 2 (`leerDirectorio`,
//     fail-closed). Si algún día el rol de DATABASE_URL deja de estar exento de RLS, esta consulta
//     vuelve vacía: el buscador queda sin profes (falla cerrado, no muestra de más).
//  2. Todo lo demás, POR NEGOCIO ANOTADO, dentro de `runInTenantContext(<su tenantId>)`: con RLS
//     prendido el cliente `prisma` fija `app.current_tenant_id` a ese negocio en cada consulta; con
//     RLS apagado cada consulta lleva además su `where: { tenantId }` explícito. Sin BYPASS.
//
// Qué se lee de cada anotado: `PadelConfig` (sólo `plantillas` para la clave `_directorio`, y los dos
// precios), la verificación de GSG, los horarios libres (`agendaPublica`, lo mismo que muestra su
// turnero) y los nombres de sus clubes. Nunca alumnos, clases con dueño ni teléfonos.
//
// Costo (CERT 13/11): 1 + 4 consultas por anotado, cada 10 minutos por instancia (`memoriaCorta`).
// TODO(deuda): la caché es POR INSTANCIA. El repo no usa `unstable_cache`/"use cache" de Next en
// ningún lado (sólo el doble de tests en src/test/accion-de-servidor.ts), así que no se estrena acá;
// cuando se adopte, este armado es el primer candidato (compartido entre instancias, revalidate 600).
// Quien se anota o se baja aparece o desaparece en hasta 10 minutos.

import "server-only";
import { basePrisma, prisma } from "@/lib/prisma";
import { runInTenantContext } from "@/lib/tenant-context";
import { agendaPublica, clubesDe } from "@/lib/padel/datos.server";
import { CLAVE_DIRECTORIO, DIRECTORIO_DEFAULT, leerDirectorio } from "@/lib/padel/directorio";
import { turneroAbiertoDe } from "./verificacion.server";
import { DIRECTORIO_TTL_MS, armarDirectorio, memoriaCorta, type DepsDirectorio, type ProfePublico } from "./directorio-core";

const MODULO_CLASES = "padel-clases";
const DOMINIO_POR_DEFECTO = "gsgapp.com.ar";

/** Corre `fn` en el contexto del negocio `tenantId` (async + await adentro: el contexto no se pierde). */
const enSuNegocio = <T>(tenantId: string, fn: () => Promise<T>): Promise<T> => runInTenantContext(tenantId, async () => await fn());

export const depsDirectorio: DepsDirectorio = {
  async candidatos(tope) {
    // Primero los anotados (CERT 13/11): el tope corta anotados, no negocios en general.
    const filas = await basePrisma.padelConfig.findMany({
      where: {
        plantillas: { path: [CLAVE_DIRECTORIO, "visible"], equals: true },
        tenant: { status: { in: ["TRIAL", "ACTIVE"] }, modules: { has: MODULO_CLASES }, subdomain: { not: null } },
      },
      select: { tenant: { select: { id: true, name: true, subdomain: true } } },
      orderBy: [{ tenant: { createdAt: "asc" } }, { tenantId: "asc" }],
      take: tope,
    });
    return filas.map(({ tenant: t }) => ({ tenantId: t.id, nombre: t.name, subdomain: t.subdomain }));
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

const memoria = memoriaCorta<ProfePublico[]>(DIRECTORIO_TTL_MS);

/** El directorio entero (sin filtrar), con caché de 10 minutos. */
export function directorioDeProfes(): Promise<ProfePublico[]> {
  const dominio = process.env.APP_BASE_DOMAIN?.trim() || DOMINIO_POR_DEFECTO;
  return memoria(() => armarDirectorio(depsDirectorio, dominio));
}
