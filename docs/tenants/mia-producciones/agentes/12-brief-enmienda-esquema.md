# Equipo de agentes de Administración · MIA — 12 · Brief de la enmienda del esquema

> GSG-MIA-019, 15/11/2026. Corrige H12 del dictamen de MIA-016 («la enmienda del esquema no tiene brief») y el punto
> 1 de «Antes de construir» de `desafio-mia016/dictamen-final.md`.

## Qué es

**Una sola enmienda**, y es ésta: `desafio-mia016/esquema-final-enmienda.md` (rama `agentes/diseno-ejecucion`,
commit `1506c9c0`). Se suma a la migración `20261115120000_agentes_base` de la tanda 1A (rama `agentes/tanda-1`,
490d2048), que todavía no está aplicada: un solo Gate 2. **1A no se reabre**: esta es una tarea nueva, con su rama,
su certificación y su Gate. No hay segunda enmienda: lo que el esquema final deja afuera (único de `cuotaId` →
GSG-MIA-018; FK a `CanalOferta` → migración de canales; tabla de liberación → decisión del dueño, `11` §3, D2) no
entra acá.

## Orden

1. Brief E (abajo), una sesión nueva en Opus alto.
2. Certificación adversarial sobre el diff (agente `gsg-certificador`, otra sesión), con la lista del esquema final
   y X1 a X8 de `dictamen-09.md`.
3. `data-dba` verifica, contra el registro de despliegue y sin consultar Neon de más, **con qué rol se aplica la
   migración en producción**: el REVOKE necesita al dueño de las tablas. La aserción final de la migración convierte
   el caso contrario en error.
4. Gate 2: lo decide el dueño. Recién después se abre la tanda 2 (`13`).

## Brief E · enmienda del esquema (≤ 2 KB)

```
Rol: ingeniero del ERP (Opus alto; superficie: datos y seguridad). Rama nueva desde agentes/tanda-1.
Única fuente: desafio-mia016/esquema-final-enmienda.md (agentes/diseno-ejecucion, 1506c9c0).
Antes: confirmá por docs (sin Neon) que 20261115120000_agentes_base NO está aplicada.
Si lo está: frená y reportá; no escribas otra migración.
Hacé, en ESA migración y en schema.prisma:
- AgentePedido: REVOKE UPDATE de tabla + GRANT de las 9 columnas; único (tenantId,id,userId);
  origenPedidoId + FK al pedido original con el mismo userId.
- AgenteAutorizacion completa: metodo_check, únicos (version; id; id+version), viva parcial, RLS,
  REVOKE UPDATE/DELETE + GRANT de 4 columnas, disparador _irreversible (revocadaEl y reemplazadaEl).
- AgenteContador: monto >= 0, moneda en la PK.
- AgentePropuesta: columnas; origen_check con CANAL; origen_solicitante_check; modo_check; regla_check;
  monto_check con ARS; fuente_check; no_aprueba_lo_propio; FK de versión y de pedido; estado REVERTIDA;
  únicos clave_viva y canalOfertaId_viva (con RECHAZADA); GRANT sólo de columnas de estado.
  Verificá que el único de 1A (herr_entidad_pendiente) no choque con clave: si choca, avisá.
- AgenteAccion.tipo + REVERSION, AUTORIZACION, CONTROL.
- Repetí cada REVOKE/GRANT en prisma/rls/0002_app_role.sql; migración y 0002 cierran con un DO que
  hace RAISE EXCEPTION si app_rls conserva un privilegio revocado.
- Los 4 scripts que dan UPDATE/DELETE (lista en el esquema) corren 0002 al final.
- Código de 1A que escribe estas tablas: ajustado hasta tsc verde.
ESCRIBÍ PRIMERO enmienda-postgres.test.ts (base efímera, app_rls): un caso por CHECK, único, FK y
disparador, incluidos X1, X2, X5, X6, X7 y P2; privilegios tras correr 0002 dos veces.
No toques ProyectoMovBanco, CanalOferta ni AuditLog. Sin Neon, sin migrate deploy, sin push a main.
Verificación: tsc · tests (n/n con scripts/ci/resumen-tests.mjs) · build. Informe ≤ 300 palabras:
qué, n/n, archivo:línea, pendientes. Un push a tu rama.
```
