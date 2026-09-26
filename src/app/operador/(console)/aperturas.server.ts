// ============================================================================
// «LISTO PARA ABRIR» DE TODOS LOS NEGOCIOS, EN LOTE — lo leen la lista de Negocios y el Tablero.
// ============================================================================
//
// Una sola definición de «listo» (src/lib/operador/checklist-apertura.ts) y una sola lectura: la
// pregunta del lunes es «¿cuál de los cinco locales está listo?», y no puede exigir entrar de a una
// en cinco fichas.
//
// CON RLS (la conexión de operador está sujeta a RLS en producción, ver operator-db.ts): las filas
// de un negocio sólo se ven parado en él, así que es UNA transacción por negocio (las cuatro
// lecturas adentro), todas en paralelo. Antes eran cuatro consultas para todos juntos, que con RLS
// volvían vacías: todos los negocios aparecían sin usuarios, sin contacto y sin catálogo. Costo:
// una transacción por negocio en cada refresco del Tablero (30 s); para cientos de negocios, el
// camino es un resumen por negocio del lado de la base (BACKLOG).
//
// Sólo metadatos de plataforma y lo mínimo del catálogo que el chequeo compara (nombre y precio),
// por la conexión de operador (ADR-021). Si la lectura de un negocio falla, ese negocio queda como
// «no se sabe» en el certificado y vacío en lo demás; los otros no se enteran.

import { operatorPrisma, enElNegocio } from "@/lib/operator-db";
import { modoDesdeEnv } from "@/plugins/arca";
import { checklistApertura, type EstadoApertura, type ResultadoApertura } from "@/lib/operador/checklist-apertura";

export interface AperturaDeNegocio extends ResultadoApertura {
  id: string;
  name: string;
  slug: string;
}

export async function cargarAperturas(): Promise<AperturaDeNegocio[]> {
  const tenants = await operatorPrisma.tenant.findMany({
    select: {
      id: true, name: true, slug: true, blueprintId: true, subdomain: true,
      arcaCuit: true, arcaPuntoVenta: true, arcaHomologacion: true,
    },
    orderBy: { createdAt: "asc" },
  });
  if (tenants.length === 0) return [];

  // Por negocio: contacto, catálogo, usuarios activos y certificado (`undefined` = no se pudo leer).
  const lecturas = await Promise.all(
    tenants.map((t) =>
      enElNegocio(t.id, async (tx) => ({
        contacto: await tx.businessSettings.findUnique({
          where: { tenantId: t.id },
          select: { addressLine: true, instagram: true, whatsapp: true },
        }),
        productos: await tx.product.findMany({
          where: { tenantId: t.id, deletedAt: null },
          select: { name: true, price: true, pricePerKg: true },
          take: 300, // techo defensivo: el chequeo compara contra catálogos semilla de ~20 ítems
        }),
        usuarios: await tx.user.count({ where: { tenantId: t.id, active: true, deletedAt: null } }),
        cred: (await tx.tenantFiscalCredential.findUnique({
          where: { tenantId: t.id },
          select: { certCuit: true },
        })) as { certCuit: string } | null | undefined,
      })).catch(() => ({ contacto: null, productos: [], usuarios: 0, cred: undefined })),
    ),
  );

  const modoArca = modoDesdeEnv();

  return tenants.map((t, i) => {
    const { contacto, productos, usuarios, cred } = lecturas[i];
    const estado: EstadoApertura = {
      slug: t.slug,
      blueprintId: t.blueprintId,
      subdomain: t.subdomain,
      usuariosActivos: usuarios,
      arcaCuit: t.arcaCuit,
      arcaPuntoVenta: t.arcaPuntoVenta,
      arcaHomologacion: t.arcaHomologacion,
      // `null` = «no se sabe» (el evaluador lo reporta como bloqueo, no como «falta cargarlo»).
      certificadoCargado: cred === undefined ? null : cred !== null,
      certCuit: cred?.certCuit ?? null,
      modoArca,
      // La columna `arcaCondicionIva` no existe todavía (ver la ficha del negocio).
      condicionIvaDisponible: false,
      contacto,
      productos,
    };
    return { id: t.id, name: t.name, slug: t.slug, ...checklistApertura(estado) };
  });
}
