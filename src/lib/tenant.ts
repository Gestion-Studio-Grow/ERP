import { prisma } from "@/lib/prisma";

// Resolución del tenant actual — G1 (ADR-010 / ADR-001), blindada fail-closed (ADR-015).
//
// HOY: hay un único tenant (Beauty & Spa). El aislamiento es a nivel de
// aplicación: cada create escribe `tenantId` y cada read filtra por él. Con un
// solo tenant no hay leak cross-tenant posible **siempre que la resolución sea
// fail-closed** — de eso se ocupa esta función. Si la tabla `Tenant` tuviera ≠1
// fila (un seed de prueba, una migración mal corrida, el alta de un 2º tenant
// sin haber hecho antes el trabajo de RLS), lanza un error explícito en vez de
// agarrar "el más viejo" en silencio y servir datos del tenant equivocado. Un
// throw visible es infinitamente preferible a un cross-tenant mudo en
// producción (ADR-015).
//
// SIN CACHE a propósito (ADR-015): cachear el id enmascararía la aparición de un
// 2º tenant en caliente — justo lo que este assert existe para atrapar. La tabla
// tiene una fila y se lee por PK; el costo por request es despreciable.
//
// MAÑANA (2º tenant): este es el único punto que cambia. El día que se cree
// deliberadamente un 2º tenant, este throw es la señal de diseño de que PRIMERO
// hay que activar RLS de Postgres + resolución por request: leer el tenant de la
// sesión/subdominio y envolver cada operación en una transacción con
// `SET LOCAL app.current_tenant_id = ...` (seguro con pooling). El resto del
// código ya pasa por getCurrentTenantId(), así que no se toca.

export async function getCurrentTenantId(): Promise<string> {
  // `take: 2` alcanza para distinguir "cero" / "uno" / "más de uno" sin escanear
  // toda la tabla.
  const tenants = await prisma.tenant.findMany({
    take: 2,
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (tenants.length === 0) {
    throw new Error(
      "getCurrentTenantId: no hay ningún tenant en la base. Se esperaba exactamente uno (ADR-015).",
    );
  }
  if (tenants.length > 1) {
    throw new Error(
      "getCurrentTenantId: hay más de un tenant en la base y el sistema todavía no tiene RLS " +
        "ni resolución de tenant por request (ADR-015). Resolver el tenant 'más viejo' en " +
        "silencio serviría datos del tenant equivocado. Antes de dar de alta un 2º tenant hay " +
        "que hacer el trabajo de RLS + resolución por request (ADR-001 / ADR-010).",
    );
  }

  return tenants[0].id;
}
