# Propuesta PLAT-005 · perf 2 · Caché entre pedidos de host → negocio

**Estado:** propuesta para el dueño. No hay código escrito. Toca multi-tenant (ADR-015, fail-closed).

## Qué cambia
Hoy `resolveTenant(host)` (`src/lib/tenant.ts:169`) hace `Tenant WHERE subdomain` **en cada pedido HTTP**: el documento y cada prefetch RSC. El `cache()` de `negocioDelPedido` (`tenant.ts:287`) dura un solo pedido. La propuesta es un `Map` en memoria de la instancia, `subdominio → {id, slug}`, con un TTL corto (30 a 60 s). Sólo se cachean resultados positivos, y sólo de la rama por subdominio, no del fallback single-tenant.

## Ganancia esperada
Estimada desde el log SQL de una base local, **no en producción**: en una vista de `/admin/turnos`, 35 de 58 consultas van a `Tenant`. La caché ahorra la consulta por subdominio en cada pedido; junto con perf 4 (una sola lectura de `Tenant` por pedido), quedarían unas −32 consultas por vista.

## Qué se arriesga
1. **Caché con el negocio equivocado.** Si la clave no es exactamente el subdominio normalizado (minúsculas, sin puerto, después de `TENANT_HOST_MAP`), dos hosts podrían cruzarse. Mitigación: la clave es la salida de `hostMapSubdomain`/`extractSubdomain`, la misma que hoy va a la consulta.
2. **Negocio dado de baja o con el subdominio cambiado.** Durante el TTL se sigue resolviendo al id viejo. No es una fuga, porque el id sigue siendo el de ese subdominio, pero un negocio suspendido podría servir hasta 60 s más. Si el subdominio se **reasigna** a otro negocio en esa ventana, los pedidos irían al negocio anterior: ése es el riesgo real. Mitigación: invalidar al editar `subdomain`/`slug` desde el operador; con varias instancias de Vercel, cada una vence por TTL.
3. **Fail-closed.** Nunca cachear el error `DireccionSinNegocioError`, ni la rama `FORCE_TENANT_SLUG`, ni el sandbox.
4. **Memoria.** Acotado a N entradas (por ejemplo 500), con desalojo del más viejo.

## Test de aislamiento que lo probaría
- **Unitario:** dos hosts, `a.dominio` y `b.dominio` → ids distintos. Un host desconocido lanza y no queda cacheado. El `TENANT_HOST_MAP` mapea al subdominio correcto. Pasado el TTL vuelve a consultar.
- **Integración** (base local, después rama de prueba de Neon): se reasigna el subdominio de A a B y, pasado el TTL, resuelve a B. Antes del TTL, la invalidación explícita lo resuelve igual.
- **Concurrencia:** 200 pedidos alternando hosts y ninguno cruzado (mismo esquema que perf 1).

## Alternativa de menor riesgo
Hacer primero perf 4 (una sola lectura por pedido, ya en construcción como PR de bajo riesgo) y perf 3 (prefetch). Juntos sacan buena parte del costo sin caché entre pedidos. Medir de nuevo después y decidir si perf 2 todavía hace falta.

## Veredicto del refutador
**NO ADOPTAR por ahora** (challenger, agente distinto del autor).
- Bien: la clave es la salida de `hostMapSubdomain`/`extractSubdomain` (`tenant.ts:46-51,62,81`), que ya pasa a minúsculas y saca el puerto, así que no cruza negocios por mayúsculas o puerto. Tampoco se cachea el fallback single-tenant, que cambia de resultado al pasar de 1 a 2 negocios (`:187-192`).
- Riesgos reales:
  1. **Subdominio reasignado.** Durante el TTL es una fuga de verdad: los clientes de B ven el negocio A. Con varias instancias, invalidar en una no llega a las otras.
  2. **Carrera al invalidar.** Una lectura que ya estaba en vuelo vuelve a guardar el id viejo; hace falta un contador de generación.
  3. **Slug viejo.** Si se reasigna el slug, se muestra la marca de otro negocio.
  4. **Baja de un negocio.** `resolveTenant` no mira el estado, así que un negocio dado de baja sigue resolviendo.
- **Para reconsiderarla:** bloquear la reutilización de subdominio y slug por más tiempo que el TTL, sumar el contador de generación, y hacer antes perf 3 y perf 4 y volver a medir.
