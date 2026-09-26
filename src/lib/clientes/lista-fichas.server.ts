// ============================================================================
// LISTA DE FICHAS (diseño de siempre) — paginada y con búsqueda EN LA BASE.
// ============================================================================
//
// Antes la pantalla traía todas las fichas con su cantidad de turnos y el navegador filtraba
// (`getClients`, sin límite): con miles de clientes viajaban miles de filas en cada visita. Ahora
// viajan las 50 de la página. Dos consultas, siempre las mismas:
//   1. cuántas fichas tiene el negocio y cuántas coinciden con lo buscado (una sola lectura);
//   2. las 50 de la página, con la actividad de ESAS 50 (un GROUP BY acotado a la página, no una
//      consulta por ficha): los turnos si el negocio da turnos, las compras si vende en el
//      mostrador (el rubro del CRM, `rubroDelCrm`). Antes contaba siempre turnos: a quien compró 35
//      veces en una ferretería le decía «0 turnos». Las compras se cuentan con el criterio del
//      motor comercial (no anuladas, dentro de la ventana de historial: `leerFichasConActividad`),
//      el mismo del diseño nuevo, la ficha y «Recuperar» (QA vuelta 2: 35 acá y 33 allá).
// La búsqueda es la misma regla que tenía el navegador (ClientsList): el nombre sin tildes ni
// mayúsculas, el teléfono como está guardado o de corrido («1140007919» encuentra
// «11 4000-7919»), y con 8 dígitos o más, el número local (encuentra «011 15 4000-7919»).
// Dentro de `tenantTransaction` (RLS) y con `"tenantId"` explícito.

import { Prisma } from "@/generated/prisma/client";
import { tenantTransaction } from "@/lib/rls";
import { CON_TILDE, SIN_TILDE, escaparLike, textoComparable } from "@/lib/facturacion/lista-core";
import type { ConsultaCruda } from "@/lib/facturacion/lista.server";
import { normalizarTelefono } from "@/lib/clientes/telefono";
import type { Rubro } from "@/lib/crm/personas";
import { desdeHistorial } from "@/lib/crm/lecturas";

export { textoComparable };

export const FICHAS_POR_PAGINA = 50;

/** `actividad`: turnos (rubro «servicios») o compras (rubro «mostrador»); lo dice `rubro`. */
export type FichaDeLista = { id: string; name: string; phone: string; actividad: number };
export type PaginaDeFichas = { filas: FichaDeLista[]; total: number; coinciden: number; pagina: number; paginas: number; rubro: Rubro };

function busqueda(q: string): Prisma.Sql {
  const t = q.trim();
  if (!t) return Prisma.sql`TRUE`;
  const nombre = `%${escaparLike(textoComparable(t))}%`;
  const o: Prisma.Sql[] = [
    Prisma.sql`translate(lower(c.name), ${CON_TILDE}, ${SIN_TILDE}) LIKE ${nombre}`,
    Prisma.sql`c.phone LIKE ${`%${escaparLike(t)}%`}`,
  ];
  const tel = normalizarTelefono(t);
  if (tel) {
    const digitos = Prisma.sql`regexp_replace(c.phone, '\\D', '', 'g')`;
    o.push(Prisma.sql`${digitos} LIKE ${`%${tel}%`}`);
    if (tel.length >= 8) o.push(Prisma.sql`${digitos} LIKE ${`%${tel.slice(-8)}%`}`);
  }
  return Prisma.sql`(${Prisma.join(o, " OR ")})`;
}

/** Una página de fichas. `db` es la transacción del negocio (el test la envuelve para contar consultas). */
export async function paginaDeFichasEn(
  db: ConsultaCruda,
  tenantId: string,
  p: { q: string; pagina: number; rubro: Rubro; ahora?: Date },
): Promise<PaginaDeFichas> {
  const rubro = p.rubro;
  const desde = desdeHistorial(p.ahora ?? new Date());
  const [cuenta] = await db.$queryRaw<{ total: number; coinciden: number }[]>(Prisma.sql`
    SELECT count(*)::int AS total, (count(*) FILTER (WHERE ${busqueda(p.q)}))::int AS coinciden
    FROM "Client" c
    WHERE c."tenantId" = ${tenantId}`);
  const total = cuenta?.total ?? 0;
  const coinciden = cuenta?.coinciden ?? 0;
  const paginas = Math.max(1, Math.ceil(coinciden / FICHAS_POR_PAGINA));
  const pagina = Math.min(Math.max(1, p.pagina), paginas);
  if (coinciden === 0) return { filas: [], total, coinciden, pagina, paginas, rubro };
  // La actividad de las fichas de la página: todos sus turnos (lo de siempre), o sus compras no
  // anuladas (lib/crm/lecturas.ts, `leerFichasConActividad`: el mismo estado).
  const actividad =
    rubro === "servicios"
      ? Prisma.sql`SELECT a."clientId", count(*) AS n
      FROM "Appointment" a
      WHERE a."tenantId" = ${tenantId} AND a."clientId" IN (SELECT id FROM pagina)
      GROUP BY a."clientId"`
      : Prisma.sql`SELECT o."clientId", count(*) AS n
      FROM "Order" o
      WHERE o."tenantId" = ${tenantId} AND o."clientId" IN (SELECT id FROM pagina) AND o.status <> 'CANCELLED'::"OrderStatus"
        AND o."createdAt" >= ${desde}
      GROUP BY o."clientId"`;
  const filas = await db.$queryRaw<FichaDeLista[]>(Prisma.sql`
    WITH pagina AS (
      SELECT c.id, c.name, c.phone
      FROM "Client" c
      WHERE c."tenantId" = ${tenantId} AND ${busqueda(p.q)}
      ORDER BY c.name ASC, c.id ASC
      LIMIT ${FICHAS_POR_PAGINA} OFFSET ${(pagina - 1) * FICHAS_POR_PAGINA}
    )
    SELECT p.id, p.name, p.phone, COALESCE(t.n, 0)::int AS actividad
    FROM pagina p
    LEFT JOIN (${actividad}) t ON t."clientId" = p.id
    ORDER BY p.name ASC, p.id ASC`);
  return { filas, total, coinciden, pagina, paginas, rubro };
}

/** La página pedida, en la transacción del negocio (RLS). Sin chequeo de rol: lo hace quien llama. */
export function leerPaginaDeFichas(tenantId: string, p: { q: string; pagina: number; rubro: Rubro }): Promise<PaginaDeFichas> {
  return tenantTransaction((tx) => paginaDeFichasEn(tx, tenantId, p), { tenantId });
}
