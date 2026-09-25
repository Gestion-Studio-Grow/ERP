// ============================================================================
// «LISTO PARA ABRIR» DE TODOS LOS NEGOCIOS, EN LOTE — lo leen la lista de Negocios y el Tablero.
// ============================================================================
//
// Una sola definición de «listo» (src/lib/operador/checklist-apertura.ts) y una sola lectura: la
// pregunta del lunes es «¿cuál de los cinco locales está listo?», y no puede exigir entrar de a una
// en cinco fichas. Cuatro consultas para TODOS los negocios (no una por negocio): el Tablero se
// refresca cada 30 s y un N+1 acá se paga en conexiones.
//
// Sólo metadatos de plataforma y lo mínimo del catálogo que el chequeo compara (nombre y precio),
// por la conexión de operador (ADR-021). Cada lectura opcional tolera su tabla faltante.

import { operatorPrisma } from "@/lib/operator-db";
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

  const ids = tenants.map((t) => t.id);
  const [settings, productos, usuarios, creds] = await Promise.all([
    operatorPrisma.businessSettings
      .findMany({ where: { tenantId: { in: ids } }, select: { tenantId: true, addressLine: true, instagram: true, whatsapp: true } })
      .catch(() => []),
    operatorPrisma.product
      .findMany({
        where: { tenantId: { in: ids }, deletedAt: null },
        select: { tenantId: true, name: true, price: true, pricePerKg: true },
        take: 2000, // techo defensivo: el chequeo compara contra catálogos semilla de ~20 ítems
      })
      .catch(() => []),
    operatorPrisma.user.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: ids }, active: true, deletedAt: null },
      _count: { _all: true },
    }),
    // La tabla de credenciales puede no estar aplicada (Gate 2): `null` = «no se sabe», que el
    // evaluador reporta como bloqueo de migración en vez de como «falta cargar el certificado».
    operatorPrisma.tenantFiscalCredential
      .findMany({ where: { tenantId: { in: ids } }, select: { tenantId: true, certCuit: true } })
      .then((rows) => new Map(rows.map((r) => [r.tenantId, r])))
      .catch(() => null),
  ]);

  const modoArca = modoDesdeEnv();
  type FilaProducto = (typeof productos)[number];
  const prods = new Map<string, FilaProducto[]>();
  for (const r of productos) {
    const acc = prods.get(r.tenantId);
    if (acc) acc.push(r);
    else prods.set(r.tenantId, [r]);
  }
  const sets = new Map(settings.map((r) => [r.tenantId, r]));
  const users = new Map(usuarios.map((r) => [r.tenantId, r._count._all]));

  return tenants.map((t) => {
    const cred = creds?.get(t.id) ?? null;
    const estado: EstadoApertura = {
      slug: t.slug,
      blueprintId: t.blueprintId,
      subdomain: t.subdomain,
      usuariosActivos: users.get(t.id) ?? 0,
      arcaCuit: t.arcaCuit,
      arcaPuntoVenta: t.arcaPuntoVenta,
      arcaHomologacion: t.arcaHomologacion,
      certificadoCargado: creds === null ? null : Boolean(cred),
      certCuit: cred?.certCuit ?? null,
      modoArca,
      // La columna `arcaCondicionIva` no existe todavía (ver la ficha del negocio).
      condicionIvaDisponible: false,
      contacto: sets.get(t.id) ?? null,
      productos: prods.get(t.id) ?? [],
    };
    return { id: t.id, name: t.name, slug: t.slug, ...checklistApertura(estado) };
  });
}
