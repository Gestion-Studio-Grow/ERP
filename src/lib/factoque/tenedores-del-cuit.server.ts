// Quién tiene cargado un CUIT, y si lo verificó (alta web de Factoque, ver alta-web-core.ts:
// «CUIT sin verificar»). Se lee DENTRO de una transacción, parándose en cada negocio (RLS): la
// credencial, la auditoría y los usuarios son filas del negocio. Al terminar deja el negocio vacío:
// quien llama vuelve a pararse donde necesite.

import type { PrismaClient } from "@/generated/prisma/client";
import { ACCION_PRUEBA_OK } from "@/lib/fiscal/contador-arca";
import type { TenedorDelCuit } from "./alta-web-core";

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/** Lo que usa `cargarCredencialTenant` y el alta web para ponerse en fila por un CUIT. */
export async function bloquearCuit(tx: Tx, cuit: string): Promise<void> {
  // La MISMA llave que `bloquearCuit` de src/lib/operator-actions.ts y del alta.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`arca-punto-venta:${cuit}`}))`;
}

// D4 del dueño (09/11): `Tenant.cuitVerificadoEn` = última vez que ARCA de PRODUCCIÓN aceptó el certificado del
// negocio. Migración 20261110170000_tenant_cuit_verificado (aditiva, Gate 2): puede no estar aplicada. Se pregunta
// al catálogo antes de tocarla (una sentencia que falla aborta la transacción entera, ver must-change-password.ts).
// Se recuerda sólo el «sí»: la columna no desaparece sin reinicio.
let _hayColumna = false;
export async function hayColumnaCuitVerificado(tx: Tx): Promise<boolean> {
  if (_hayColumna) return true;
  const filas = await tx.$queryRaw<{ hay: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'Tenant' AND column_name = 'cuitVerificadoEn'
    ) AS hay`;
  _hayColumna = filas[0]?.hay === true;
  return _hayColumna;
}

/** Sólo para tests: olvida lo memorizado (el test saca y vuelve a poner la columna). */
export function olvidarColumnaCuitVerificado(): void {
  _hayColumna = false;
}

export async function tenedoresDelCuit(tx: Tx, cuit: string, excluir?: string): Promise<TenedorDelCuit[]> {
  const negocios = await tx.tenant.findMany({
    where: { arcaCuit: cuit, ...(excluir ? { id: { not: excluir } } : {}) },
    select: { id: true, subdomain: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  // `Tenant` no tiene RLS (es el plano de control): se lee de una vez, fuera del GUC de cada negocio.
  const marcas = new Map<string, Date | null>();
  if (negocios.length > 0 && (await hayColumnaCuitVerificado(tx))) {
    const ids = negocios.map((n) => n.id);
    const filas = await tx.$queryRaw<{ id: string; cuitVerificadoEn: Date | null }[]>`
      SELECT id, "cuitVerificadoEn" FROM "Tenant" WHERE id = ANY(${ids})`;
    for (const f of filas) marcas.set(f.id, f.cuitVerificadoEn);
  }
  const out: TenedorDelCuit[] = [];
  for (const n of negocios) {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${n.id}, true)`;
    const [credencial, web, titulares] = await Promise.all([
      tx.tenantFiscalCredential.findFirst({ where: { tenantId: n.id, certCuit: cuit }, select: { updatedAt: true } }),
      tx.auditLog.findFirst({ where: { tenantId: n.id, action: "factoque.alta", actor: { startsWith: "web:" } }, select: { id: true } }),
      tx.user.findMany({
        where: { tenantId: n.id, role: "OWNER", active: true, deletedAt: null },
        select: { id: true, email: true, lastLoginAt: true },
      }),
    ]);
    // VERIFICADO = ARCA aceptó el certificado de PRODUCCIÓN: un ingreso al WSAA que salió bien DESPUÉS de la última
    // carga. Un certificado cargado no alcanza: cualquiera puede armar uno con el CUIT de otro firmado
    // por su propia CA (certificación adversarial 08/11); ARCA sólo acepta los que emitió al titular.
    // La columna (D4) alcanza si es posterior a la última carga del certificado: rotarlo la invalida. Si falta (base
    // sin migrar, o negocio verificado antes de la migración, que no lleva backfill) se mira la auditoría.
    const marca = marcas.get(n.id) ?? null;
    const porColumna = credencial !== null && marca !== null && marca.getTime() >= credencial.updatedAt.getTime();
    const prueba = credencial && !porColumna
      ? await tx.auditLog.findFirst({
          where: {
            tenantId: n.id,
            action: ACCION_PRUEBA_OK,
            createdAt: { gte: credencial.updatedAt },
            // Sólo PRODUCCIÓN: ahí ARCA además reconoce el punto de venta de ese CUIT. Con homologación
            // no está probado que el certificado de prueba sólo salga para el CUIT de quien entra
            // (certificación 08/11): no verifica.
            changes: { path: ["entorno"], equals: "produccion" },
          },
          select: { id: true },
        })
      : null;
    out.push({ tenantId: n.id, subdomain: n.subdomain, creado: n.createdAt, verificado: porColumna || prueba !== null, web: web !== null, titulares });
  }
  await tx.$executeRaw`SELECT set_config('app.current_tenant_id', '', true)`;
  return out;
}
