# Esquema unificado para el camino de ejecución (MIA-016, 14/11/2026)

Enmienda única a `20261115120000_agentes_base`, que todavía no está aplicada (Gate 2). Todo es aditivo.
Junta los dos avisos que se le mandaron a la orquestadora, ya corregidos por el dictamen
(`certificacion-insumo-y-esquema.md`, que trae los hallazgos H1 a H18).

## AgenteAutorizacion (tabla nueva)

**Columnas**

| Columna | Tipo |
|---|---|
| `id` | |
| `tenantId` | |
| `version` | INT |
| `textoVersion` | INT NOT NULL (H5) |
| `textoHash` | calculado en el servidor sobre `operaciones` + `topes` canónicos (H4) |
| `firmante` | |
| `firmanteUserId` | |
| `firmadoEl` | |
| `metodo` | |
| `evidencia` | JSONB |
| `operaciones` | JSONB |
| `topes` | JSONB |
| `datosSensibles` | |
| `lecturaOps` | |
| `proveedorIa` | |
| `vigenteDesde` | |
| `venceEl` | |
| `reemplazadaEl` | (H2) |
| `revocadaEl` | |
| `revocadaPor` | |
| `motivoRevocacion` | |
| `createdAt` | |

**Índices y CHECK**
- Único `(tenantId, version)`.
- Único parcial `AgenteAutorizacion_tenantId_viva_key ("tenantId") WHERE "revocadaEl" IS NULL AND "reemplazadaEl" IS NULL` (H2).
- `AgenteAutorizacion_firmante_check`: `metodo <> 'APP_CON_SESION' OR "firmanteUserId" IS NOT NULL` (H4).

**Permisos**
- RLS `tenant_isolation`.
- `REVOKE UPDATE, DELETE` a `app_rls`.
- `GRANT UPDATE ("revocadaEl", "revocadaPor", "motivoRevocacion", "reemplazadaEl")`.
- Trigger `AgenteAutorizacion_revocacion_irreversible`.
- Repetir todo en `prisma/rls/0002_app_role.sql` (H3).
- Alta sólo con el permiso `agentes.firmar`, que tiene únicamente el titular (H4).

## AgenteContador

- `monto` BIGINT NOT NULL DEFAULT 0, en centavos.
- `moneda` TEXT NOT NULL DEFAULT 'ARS', **dentro de la PK** (H12).
- `AgenteContador_monto_check ("monto" >= 0)`.
- Para la contraparte: sujeto = `contraparte:<id>`.

## AgentePedido

- Único `AgentePedido_tenantId_id_userId_key ("tenantId", "id", "userId")` (H6).
- `REVOKE UPDATE ("userId", "clave", "pedidoEl")` a `app_rls` (H6).

## AgentePropuesta

**Columnas**

| Columna | Detalle |
|---|---|
| `clave` | TEXT NOT NULL (H9) |
| `origen` | TEXT NOT NULL, `CHECK (origen IN ('RUTINA','PEDIDO'))` y `CHECK (origen <> 'PEDIDO' OR "pedidoId" IS NOT NULL)` (H7) |
| `modo` | `REGLA` o `PERSONA` |
| `autorizacionId` | |
| `autorizacionVersion` | |
| `montoCentavos` | |
| `moneda` | con `AgentePropuesta_monto_check`: los dos nulos o los dos con valor, y monto > 0 (H12) |
| `contraparte` | |
| `revierteA` | |
| `revertibleHasta` | |
| `pedidoId` | |
| `solicitadoPor` | |

**Estados, índices y FK**
- Estado nuevo `REVERTIDA`.
- Único parcial `AgentePropuesta_tenantId_clave_viva_key ("tenantId", "clave") WHERE estado IN ('PENDIENTE','EJECUTADA','REVERTIDA')` (H8). Para rehacer hace falta una persona, con clave `<clave>:rehecha:<n>`.
- La contra-operación lleva clave `REV:<idOriginal>` (H11).
- FK `AgentePropuesta_tenantId_pedidoId_solicitadoPor_fkey ("tenantId", "pedidoId", "solicitadoPor") → AgentePedido("tenantId", "id", "userId")` (H6).
- `pedidoId` y `solicitadoPor` salen sólo del contexto del servidor: Zod rechaza esas llaves en `argumentos`.

## AgenteAccion

- `tipo` suma `REVERSION`, `AUTORIZACION` y `CONTROL`.

## Lo que no es esquema pero es bloqueante (va al diseño 07 a 10)

- **H1:** el candado necesita una escritura real.
  - `updateMany({ where: { id, revocadaEl: null }, data: { revocadaEl: null } })`.
  - En `AgentePuesto`, `data: { pausadoPor: null }`.
  - Prisma 7 no toma la fila con `data: {}`. Lo mismo corrige `03` :484-486.
- **H10:** la clave de B2 es `B2:cuota:<cuotaId>`.
- **H13:** deshacer C5/P6 revierte cada efecto: `ProyectoPago`/`ProyectoGasto`, `CashMovement` y saldo.
- **H14:** respaldo exacto quiere decir unicidad en las dos direcciones, fecha y contraparte verificada.
- **H15:** fuera de horario se difiere; no se manda a una persona.
