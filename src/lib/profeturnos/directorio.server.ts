// PROFETURNOS · Directorio público: las lecturas reales detrás de `armarDirectorio` (directorio-core.ts).
//
// LECTURA ENTRE NEGOCIOS (para el certificador), en dos planos:
//  1. `candidatos`: UNA consulta a `Tenant` (tabla SIN RLS: excluida a propósito en
//     prisma/rls/0001_enable_rls.sql:41, y la resolución de negocio por request la lee igual) que trae
//     id, nombre y subdominio de los negocios activos con el módulo de clases. NO toca PadelConfig:
//     esa tabla tiene RLS (prisma/migrations/20261015120000_modulo_padel_clases/migration.sql:180) y
//     con el rol `app_rls` + RLS_ENFORCEMENT=on una lectura sin contexto vuelve VACÍA (QA PROFE-004:
//     el buscador quedaba siempre sin profes). Es un índice: no dice quién se anotó.
//  2. Todo lo demás, POR NEGOCIO, dentro de `runInTenantContext(<su tenantId>)`: con RLS prendido
//     el cliente `prisma` fija `app.current_tenant_id` a ese negocio en cada consulta; con RLS
//     apagado cada consulta lleva además su `where: { tenantId }` explícito. Sin BYPASS ni SECURITY
//     DEFINER. El primero es `ajuste` (el opt-in `_directorio`); a quien no se anotó no se le lee más.
//
// Qué se lee de cada anotado: `PadelConfig` (sólo `plantillas` para la clave `_directorio`, y los dos
// precios), la verificación de GSG, los horarios libres (`agendaPublica`, lo mismo que muestra su
// turnero) y los nombres de sus clubes. Nunca alumnos, clases con dueño ni teléfonos.
//
// Costo (PROFE-005, medido por el certificador): 1 + 1 por negocio con el módulo (tope TOPE_NEGOCIOS)
// + ~7 transacciones por anotado (con RLS cada lectura es una transacción), cada 10
// minutos por instancia (`memoriaCorta`). Volver a 1 + 4·anotados pide sacar `_directorio` a una
// columna o tabla sin RLS: migración, Gate 2 del dueño.
// TODO(deuda): la caché es POR INSTANCIA. El repo no usa `unstable_cache`/"use cache" de Next en
// ningún lado (sólo el doble de tests en src/test/accion-de-servidor.ts), así que no se estrena acá;
// cuando se adopte, este armado es el primer candidato (compartido entre instancias, revalidate 600).
// Quien se anota o se baja aparece o desaparece en hasta 10 minutos.

import "server-only";
import { basePrisma, prisma } from "@/lib/prisma";
import { runInTenantContext } from "@/lib/tenant-context";
import { agendaPublica, clubesDe } from "@/lib/padel/datos.server";
import { DIRECTORIO_DEFAULT, leerDirectorio } from "@/lib/padel/directorio";
import { turneroAbiertoDe } from "./verificacion.server";
import { DIRECTORIO_TTL_MS, armarDirectorio, memoriaCorta, type DepsDirectorio, type ProfePublico } from "./directorio-core";

const MODULO_CLASES = "padel-clases";
const DOMINIO_POR_DEFECTO = "gsgapp.com.ar";

/** Corre `fn` en el contexto del negocio `tenantId` (async + await adentro: el contexto no se pierde). */
const enSuNegocio = <T>(tenantId: string, fn: () => Promise<T>): Promise<T> => runInTenantContext(tenantId, async () => await fn());

export const depsDirectorio: DepsDirectorio = {
  async candidatos(tope) {
    // `Tenant` no tiene RLS: esta consulta ve lo mismo con el dueño de las tablas que con `app_rls`.
    const filas = await basePrisma.tenant.findMany({
      where: { status: { in: ["TRIAL", "ACTIVE"] }, modules: { has: MODULO_CLASES }, subdomain: { not: null } },
      select: { id: true, name: true, subdomain: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: tope,
    });
    // CERT PROFE-005 (MEDIA): al llegar al tope, los más nuevos quedan afuera. Que se vea en el log.
    if (filas.length >= tope) console.warn(`[profeturnos/directorio] tope de ${tope} negocios alcanzado: los más nuevos no se miran (pasar _directorio a columna, Gate 2)`);
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

type Armado = { profes: ProfePublico[]; completo: boolean };
// Un armado con negocios que fallaron (p. ej. el pool esperando a Neon en frío) no se guarda 10 min.
const memoria = memoriaCorta<Armado>(DIRECTORIO_TTL_MS, Date.now, (a) => a.completo);

/** El directorio entero (sin filtrar), con caché de 10 minutos. */
export function directorioDeProfes(): Promise<ProfePublico[]> {
  const dominio = process.env.APP_BASE_DOMAIN?.trim() || DOMINIO_POR_DEFECTO;
  return memoria(async () => {
    const fallas: string[] = [];
    const profes = await armarDirectorio(depsDirectorio, dominio, (id) => fallas.push(id));
    if (fallas.length) console.warn(`[profeturnos/directorio] ${fallas.length} negocio(s) no se pudieron leer; el armado no se guarda en caché`);
    return { profes, completo: fallas.length === 0 };
  }).then((a) => a.profes);
}
