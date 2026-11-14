# Tarjetas Gate 2 · índices propuestos (PLAT-005, perf 8 y 9)

Reglas comunes a las cinco tarjetas:
- La migración es aditiva y **se escribe sin aplicar**. Un archivo por índice, con **una sola sentencia**: `CREATE INDEX CONCURRENTLY` no puede ir dentro de una transacción, y un archivo con varias sentencias sale como transacción implícita.
- El repo no tiene precedente de `CONCURRENTLY`: verificar que `prisma migrate deploy` lo acepte, sobre una rama de respaldo de Neon.
- **Volver atrás:** `DROP INDEX CONCURRENTLY IF EXISTS "<nombre>";` es una operación destructiva, así que la ejecuta el dueño. El código no depende de ningún índice: sin él, la consulta es más lenta pero da el mismo resultado.
- **Antes de aplicar:** correr `EXPLAIN` sobre una copia con volumen. La lista de candidatos (`indices.txt`, 159) es heurística y trae ruido.
- **Evidencia:** estática, por el patrón de consulta en el código. Con la semilla chica de la base local la diferencia no se ve.

| # | Índice | Por qué (archivo:línea) | Riesgo |
|---|---|---|---|
| G2-1 | `AuditLog (tenantId, action, createdAt)` | Unas 152 lecturas filtran por `action` (se usa como clave-valor): `src/lib/fiscal/asistente-arca.server.ts:189,269,313`, `src/lib/fiscal/tenant-cert.ts:108,173`, `src/lib/factoque/tenedores-del-cuit.server.ts:58`. Hoy sólo existe `[tenantId, createdAt]`. La tabla sólo crece. | Bajo. Tabla grande: usar CONCURRENTLY. |
| G2-2 | `Appointment (tenantId, clientId)` | `turnos/proximo/[id]/page.tsx:26`, `src/lib/crm/lecturas.ts:169`, `src/lib/crm/cargas.server.ts:422`, `src/lib/crm/unificar-en-tx.ts:88` (ficha del cliente). | Bajo. |
| G2-3 | `Payment (tenantId, status, createdAt)` | `src/apps/kpis/finanzas.server.ts:271`, `src/lib/actions.ts:1766,1770,2665`. Hoy hay sólo `[tenantId]` y `[appointmentId]`. | Plata: sólo lectura más rápida, sin cambio de comportamiento. |
| G2-4 | `Order (tenantId, createdAt)` | 11 `findMany` ordenados por `createdAt desc`. Hoy hay `[tenantId, status]` y `[tenantId, code]`. | Bajo. |
| G2-5 | `Invoice (tenantId, fecha)` | `src/lib/cierre-mes/lectura.ts:108,165`, `src/app/contador/exportar/route.ts:33`, `src/lib/cartera-abonos.ts:161`. | Plata/ARCA: sólo lectura. |

**Migración tipo (G2-1):**
```sql
-- prisma/migrations/<timestamp>_auditlog_tenant_action_idx/migration.sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AuditLog_tenantId_action_createdAt_idx" ON "AuditLog" ("tenantId", "action", "createdAt");
```
En `schema.prisma`: `@@index([tenantId, action, createdAt])`. El nombre tiene que coincidir con la convención de Prisma, para que `migrate diff` no proponga recrearlo.
