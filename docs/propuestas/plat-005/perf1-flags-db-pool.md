# Propuesta PLAT-005 · perf 1 · Prender los 3 flags de base que ya existen

**Estado:** propuesta para el dueño. No se prende nada. Toca RLS y aislamiento entre negocios.

## Qué cambia
Los tres flags son variables de Vercel. No hay código nuevo: ya está escrito y apagado en `src/lib/db-pool.ts:13-15`.

| Flag | Qué hace | Dónde |
|---|---|---|
| `DB_BEGIN_CON_NEGOCIO=on` | Manda el `BEGIN` y el `set_config('app.current_tenant_id', id, true)` en un solo mensaje. Pasa de 4 viajes a 3 por lectura. | `src/lib/pg-begin-con-negocio.ts`, enchufado en `prisma-base.ts` |
| `DB_TENANT_DIRECTO=on` | Lee las columnas propias de `Tenant` sin transacción. `Tenant` no tiene RLS. | `src/lib/rls.ts:52,76,126` |
| `DB_CONNECTION_LIMIT=10` | Pool de 10 conexiones por instancia, en vez de 5. | `src/lib/db-pool.ts:46` |

## Ganancia medida
Medido en una base local con latencia simulada, **no en producción**. Build real, Postgres local y un proxy que agrega 30 ms a cada respuesta de la base:
- tiempo de documento: entre −17 % y −40 %. CH inicio pasa de 954 a 573 ms y MIA inicio de 2010 a 1479 ms;
- viajes por documento: entre −25 % y −36 %.

## Qué se arriesga
1. **Fuga entre negocios por el empaquetado** (`BEGIN_CON_NEGOCIO`). Si el pooler de Neon (PgBouncer en modo transacción) trata el mensaje combinado distinto que Postgres directo, el GUC podría quedar en la conexión y verlo el siguiente pedido de otro negocio.
   - Mitigación en el código: `set_config(..., true)` es LOCAL a la transacción. El id sólo viaja como literal si tiene forma de id, y además escapado.
   - Lo que falta: nunca se probó contra el pooler de Neon.
2. **Lectura de `Tenant` fuera de la transacción** (`TENANT_DIRECTO`). Si una lectura que sí depende del GUC (un include o un filtro por relación) se clasificara como «directa», saldría sin negocio puesto. El clasificador es conservador: con una sola clave que no sea columna propia, va por el camino de siempre. Ya hay un test: `src/lib/rls-tenant-directo.test.ts`.
3. **Conexiones** (`CONNECTION_LIMIT`). 10 × las instancias concurrentes de Vercel tiene que entrar en el límite del pooler de Neon free (en torno a 100 por rol y base en la compute más chica, según la documentación de Neon; no medido acá). Si no entra, aparecen errores de conexión bajo carga, no fugas.

## Test de aislamiento que lo probaría
Sobre una **rama de prueba de Neon**, creada desde un respaldo y nunca `main`, con un preview de Vercel y los tres flags prendidos:
- dos negocios, A y B, con datos sembrados distintos;
- 200 pedidos concurrentes que alternan A y B sobre agenda, caja e inicio;
- cada respuesta se verifica: ninguna trae filas del otro negocio;
- después de cada `COMMIT`, `current_setting('app.current_tenant_id', true)` vuelve vacío en una conexión reutilizada del pooler;
- el mismo test con `DB_TENANT_DIRECTO=on`, más una lectura de `Tenant` con `include` que tiene que ir por la transacción.

La base para armarlo ya existe: `src/lib/pg-begin-con-negocio-postgres.test.ts` (rol `app_rls`, adentro se ve, afuera no). Falta correrlo **a través del pooler** y con concurrencia.

## Orden sugerido
Prender de a uno, en preview y con el test de arriba en verde. Primero `DB_CONNECTION_LIMIT=10`, que es el de menor riesgo: no toca el aislamiento. Después `DB_TENANT_DIRECTO`. Último `DB_BEGIN_CON_NEGOCIO`. Para volver atrás alcanza con borrar la variable y redeployar.

## Veredicto del refutador
**ADOPTABLE CON CONDICIONES** (challenger, agente distinto del autor).
- No encontró ningún camino por el que el GUC salga de la transacción. `set_config(...,true)` va escrito fijo (`pg-begin-con-negocio.ts:156`). Un BEGIN pendiente nunca sale a la red (`:23,148-151,182`). El estado «fallido» contesta el ROLLBACK sin mandarlo, y es correcto porque la transacción nunca arrancó (`:126-128`).
- **Riesgo residual:** esas respuestas armadas a mano dependen de cómo se comporta hoy `@prisma/adapter-pg`. Toda actualización de Prisma vuelve a correr los tests de `pg-begin-con-negocio`.
- No hay ninguna lectura de `Tenant` que dependa de RLS y pase por el atajo. El atajo sólo acepta columnas propias (`rls.ts:62-83`), y el negocio se resuelve antes (`:122`): sigue fallando cerrado.
- **El test de aislamiento tiene que sumar:**
  1. Correr con el rol `app_rls` por el host `-pooler`. Con `neondb_owner` (`prisma-base.ts:8`) no pasa por RLS y el test sale verde sin probar nada.
  2. Leer el GUC como `''` y no como NULL. Mejor todavía: verificar que una consulta suelta por el pooler, sin GUC, devuelve 0 filas de una tabla con RLS.
  3. Inyectar fallas: timeout de transacción, `statement_timeout`, conflicto Serializable con reintento (`bookingTransaction`), transacciones vacías y `$queryRaw` dentro de `tenantTransaction`.
  4. Usar un pool chico, para obligar a que se reusen las conexiones.
  5. Contar las conexiones sumando scripts y migraciones a las 10 × instancias.
