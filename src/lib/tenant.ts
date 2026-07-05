import { cache } from "react";
import { basePrisma } from "@/lib/prisma-base";

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
// USA cliente BASE (no `@/lib/prisma`): cuando el flag RLS está ON, `prisma` es
// la extensión que LLAMA a esta función para resolver el tenant → usar el cliente
// extendido acá sería recursión infinita. La tabla Tenant está fuera de RLS.
//
// cache() de React = dedupe POR REQUEST, no persistente: la extensión RLS llama
// a esta función por operación, así que sin dedupe serían N lecturas de Tenant
// por request; con cache() es una sola. NO contradice el "sin cache" original
// (ADR-015): al ser por-request, un 2º tenant que aparezca se detecta igual en el
// request siguiente — el assert fail-closed sigue vivo.
//
// MAÑANA (2º tenant): la resolución pasa a ser por request (subdominio/sesión) y
// setea el store de tenant-context; la extensión usa ese store en vez de este
// findMany. Este throw es la señal de que ese trabajo (ADR-018 §4) todavía falta.

export const getCurrentTenantId = cache(async (): Promise<string> => {
  // `take: 2` alcanza para distinguir "cero" / "uno" / "más de uno" sin escanear
  // toda la tabla.
  const tenants = await basePrisma.tenant.findMany({
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
});
