# Esquema final: UNA enmienda a `20261115120000_agentes_base` (MIA-016, 14/11/2026)

> Junta cuatro fuentes:
> - `esquema-unificado.md` (H1 a H18);
> - `dictamen-09.md` (X1 a X13);
> - `dictamen-p1-p12-canales.md` (P1, P2 y P6).
>
> Todo es aditivo y se suma a la misma migración, que todavía no está aplicada: un solo Gate 2. No toca tablas existentes.
>
> La escribe quien construya la enmienda (brief propio, certificado antes del Gate 2). Esta lista es la que se certificó.
> Lo que entra acá se probó en Postgres 16 local o en PGlite, en bases descartables, salvo donde dice «lectura».

## AgentePedido
- **Permisos (D1, probado):** `REVOKE UPDATE ON "AgentePedido" FROM app_rls;` y después `GRANT UPDATE ("estado","tomadoHasta","intentos","respondidoEl","respuesta","filas","motivo","conModelo","respondidoPor") ON "AgentePedido" TO app_rls;`. Reemplaza al REVOKE por columna, que no tiene efecto si el permiso es de tabla.
- **Único:** `AgentePedido_tenantId_id_userId_key ("tenantId","id","userId")`.
- **Pedido derivado (X13):** `origenPedidoId TEXT NULL` y la FK `AgentePedido_tenantId_origenPedidoId_userId_fkey ("tenantId","origenPedidoId","userId") → AgentePedido("tenantId","id","userId")`.

## AgenteAutorizacion (tabla nueva)

**Columnas**

| Columna | Tipo |
|---|---|
| `id` | |
| `tenantId` | |
| `version` | INT |
| `textoVersion` | INT NOT NULL |
| `textoHash` | lo calcula el servidor sobre `operaciones` + `topes` + `datosSensibles` canónicos (P6) |
| `firmante` | |
| `firmanteUserId` | NOT NULL |
| `firmadoEl` | |
| `metodo` | |
| `evidencia` | JSONB |
| `operaciones` | JSONB; los `canales` van adentro, sin columna propia |
| `topes` | JSONB |
| `datosSensibles` | JSONB NOT NULL DEFAULT '[]' (P6; antes era Boolean) |
| `lecturaOps` | |
| `proveedorIa` | |
| `vigenteDesde` | |
| `venceEl` | |
| `reemplazadaEl` | |
| `revocadaEl` | |
| `revocadaPor` | |
| `motivoRevocacion` | |
| `createdAt` | |

**Índices y CHECK**
- Únicos:
  - `(tenantId, version)`;
  - `AgenteAutorizacion_tenantId_id_key`;
  - `AgenteAutorizacion_tenantId_id_version_key`, destino de la FK de la propuesta;
  - parcial `AgenteAutorizacion_tenantId_viva_key ("tenantId") WHERE "revocadaEl" IS NULL AND "reemplazadaEl" IS NULL`.
- `AgenteAutorizacion_metodo_check`: `metodo = 'APP_CON_SESION' AND "firmanteUserId" IS NOT NULL`. Reemplaza a `_firmante_check`, que se esquivaba cambiando `metodo` (X5).

**Permisos**
- RLS `tenant_isolation`.
- `REVOKE UPDATE, DELETE` a `app_rls`.
- `GRANT UPDATE ("revocadaEl","revocadaPor","motivoRevocacion","reemplazadaEl")`.
- Disparador `AgenteAutorizacion_irreversible`: da error si `OLD."revocadaEl"` o `OLD."reemplazadaEl"` ya tenían valor y se los quiere cambiar (X1: probado que `SET "reemplazadaEl"=NULL` revivía v1).

## AgenteContador
- `monto` BIGINT NOT NULL DEFAULT 0, con `AgenteContador_monto_check ("monto" >= 0)`.
- `moneda` TEXT NOT NULL DEFAULT 'ARS', dentro de la PK.
- `sujeto` = `contraparte:cliente:<id>` | `contraparte:contacto:<id>` | `*` | `<userId>`.

## AgentePropuesta

**Columnas**

| Columna | Detalle |
|---|---|
| `clave` | TEXT NOT NULL |
| `origen` | TEXT NOT NULL, con `AgentePropuesta_origen_check IN ('RUTINA','PEDIDO','CANAL')` (P1: entra ahora para no tener que hacer DROP CONSTRAINT después) |
| `modo` | TEXT NOT NULL DEFAULT 'PERSONA', con `AgentePropuesta_modo_check IN ('REGLA','PERSONA')` (X7) |
| `autorizacionId`, `autorizacionVersion` | `CHECK (("autorizacionId" IS NULL) = ("autorizacionVersion" IS NULL))` y FK `AgentePropuesta_tenantId_autorizacion_version_fkey` → `AgenteAutorizacion("tenantId","id","version")` |
| `montoCentavos`, `moneda` | `AgentePropuesta_monto_check`: los dos nulos o los dos con valor, monto > 0 y `moneda = 'ARS'` mientras no haya topes en USD |
| `contraparte` | |
| `revierteA` | |
| `revertibleHasta` | |
| `pedidoId`, `solicitadoPor` | |
| `canalOfertaId`, `solicitanteContactoId` | TEXT NULL (P2) |
| `fuenteTipo`, `fuenteId` | documento fuente, con `AgentePropuesta_fuente_check` (`char_length("fuenteId") > 0`) |

**CHECK de procedencia y reglas**

`AgentePropuesta_origen_solicitante_check` junta X2, H7 y P2, y reemplaza a `_procedencia_check`:

| origen | `pedidoId` | `solicitadoPor` | `canalOfertaId` | `solicitanteContactoId` |
|---|---|---|---|---|
| RUTINA | nulo | nulo | nulo | nulo |
| PEDIDO | con valor | con valor | nulo | nulo |
| CANAL | nulo | nulo | con valor | con valor |

Adelantar la rutina por pedido de una persona cuenta como **PEDIDO**: así rige el permiso más chico.

Otros CHECK:
- `AgentePropuesta_regla_check` (D4): `modo='REGLA'` exige `autorizacionId`.
- `AgentePropuesta_no_aprueba_lo_propio_check`.

**Estados e índices**
- Estado nuevo `REVERTIDA`.
- Único parcial `AgentePropuesta_tenantId_clave_viva_key ("tenantId","clave") WHERE estado IN ('PENDIENTE','EJECUTADA','REVERTIDA','RECHAZADA')`. RECHAZADA entra por X6: estaba probado que la rutina la recreaba.
  - Rehacer: sólo una persona, con clave `<clave>:rehecha:<n>`.
  - Contra-operación: clave `REV:<idOriginal>`.
- Único parcial `AgentePropuesta_tenantId_canalOfertaId_viva_key ("tenantId","canalOfertaId") WHERE "canalOfertaId" IS NOT NULL AND estado IN ('PENDIENTE','EJECUTADA','REVERTIDA','RECHAZADA')` (P2).

**FK y permisos**
- FK `AgentePropuesta_tenantId_pedidoId_solicitadoPor_fkey ("tenantId","pedidoId","solicitadoPor") → AgentePedido("tenantId","id","userId")`. Es MATCH SIMPLE: el que cierra el hueco es el CHECK de procedencia.
- Fuera del `GRANT UPDATE` de columnas a `app_rls`: `origen`, `clave`, `pedidoId`, `solicitadoPor`, `canalOfertaId`, `solicitanteContactoId`, `montoCentavos`, `moneda`, `contraparte`, `autorizacionId`, `autorizacionVersion`. Es el patrón D1: REVOKE de tabla y GRANT de las columnas de estado.

## AgenteAccion
- `tipo` suma `REVERSION`, `AUTORIZACION` y `CONTROL`.

## Cierre de la migración y `prisma/rls/0002_app_role.sql`
- Repetir en `0002_app_role.sql` todos los REVOKE y GRANT de arriba, como ya se hace con `AgenteAccion`. Si no, volver a correr 0002 los deshace (X8).
- Al final de la migración y de 0002, un `DO` que aserte con `has_table_privilege` / `has_column_privilege` que `app_rls` **no** tiene los privilegios revocados, y haga `RAISE EXCEPTION` si alguno quedó otorgado. Cubre que corra el REVOKE un rol que no es el dueño, que hoy sólo da un WARNING.
- Scripts locales que vuelven a dar UPDATE y DELETE sobre todas las tablas: `aislamiento-ataque-db.mjs:59`, `verify-wiring.mts:55`, `verify-provision-gate.mts:137` y `verify-tenant-resolution.mts:48`. No invalidan las pruebas, porque los permisos son por base, pero tienen que correr 0002 al final y un test tiene que verificar los permisos después.
- **Sin verificar:** qué rol aplica la migración en producción. El REVOKE necesita al dueño de las tablas. Lo verifica `data-dba` antes del Gate 2, contra el registro de despliegue, sin consultar Neon de más.

## Fuera de esta enmienda
- `ProyectoMovBanco_tenantId_cuotaId_key` y el `FOR UPDATE` de la cuota en `conciliarEnTx`: van en GSG-MIA-018, que arregla el ERP de hoy.
- La FK `AgentePropuesta_tenantId_canalOfertaId_solicitanteContactoId_fkey → CanalOferta("tenantId","id","contactoId")`: va en la migración de canales (ALTER aditivo; valida al instante porque no hay filas CANAL).
- `LiberacionOperacion` y el expediente: no van en `AuditLog`, que se purga a los 18 meses (`src/lib/audit-retention.ts:70`). Tabla propia exenta de la purga, o exención explícita. Decide el dueño (ver `dictamen-final.md`).
