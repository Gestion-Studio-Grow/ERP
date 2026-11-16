# Pericia · NextCRM (lectura de código, 16/11/2026)

Repo `github.com/pdovhomilja/nextcrm-app`, commit `d3bead9b44efe2cf94d0dfc2948af0f2c9270deb` (14/11/2026). Sólo lectura; no se ejecutó nada.
Licencia MIT (`LICENSE:3`, «Copyright (c) 2023 Pavel Dovhomilja»): si se copia una pieza sustancial, va ese aviso + texto MIT. Las ideas no exigen nada. Es **mono-negocio** (0 «tenant» en `prisma/schema.prisma`) y usa @dnd-kit, zod, better-auth, Inngest, mcp-handler. Nada se copia tal cual.

## 1. Modelo (`prisma/schema.prisma`)
**Tomar la idea (nos falta):**
- probabilidad por etapa (`:443`) → monto ponderado del Embudo;
- `stage_entered_at` (`:230`) → días en etapa; `last_activity`/`_by` (`:241,:244`) → días sin movimiento sin recorrer la línea de tiempo;
- `close_date` esperada (`:227`), aparte de nuestra fecha límite;
- aprobación con quién/cuándo/nota (`:232-236`): nuestros pases «con aprobación» no tienen dónde quedar;
- `snapshot_rate` (`:246`): tipo de cambio congelado junto a la moneda;
- varios contactos por oportunidad (`ContactsToOpportunities`, `:1281`): «quién decide» como contacto con rol;
- actividad programada/hecha/cancelada + duración + resultado (`:672-700`) → «seguimiento vencido»;
- tareas atadas a la oportunidad (`crm_Accounts_Tasks.opportunity_id`, `:881-953`);
- temporizadores configurables (`crm_FunnelSettings`, `:453-469`: matar 45 d, reciclar 90 d, 5 toques) → DORMIDA, E19, E23;
- `external_ref` (`:48`); baja lógica + restaurar sólo admin (`lib/crm/opportunities/service.ts:170-183`).

**No tomar:**
- vínculo polimórfico `entityType String` + `entityId` sin FK (`:716-726`; `crm_AuditLog` `:1074`): sin integridad ni RLS natural → FK explícitas o puente por tipo;
- enums de Postgres (`:284-296`, `:672-684`): cambiar un valor = migración irreversible (Gate 2) → texto + validación en código;
- etapa y `status` ACTIVE/INACTIVE separados (`:251-253`): «perdida» = INACTIVE sin motivo;
- `contact` único (`:237`) **y** tabla M:N: dos verdades;
- plata como texto (`:19`), `String[]` para tags/notas (`:547-548`), `cratedAt` (`:523`), columna `v` que nadie usa para versionar (`:222`).

## 2. Embudo (`app/[locale]/(routes)/crm/dashboard/_components/CRMKanban.tsx`)
- **Tomar la idea:** columnas = etapas con `status==="ACTIVE"` (`:66-76`); optimista: mueve en el cliente (`:250-305`), guarda al soltar sólo si cambió de etapa (`:325-336`); si falla, **vuelve al dato del servidor** y avisa (`:337-349`); no pisa el estado mientras se arrastra (`:223-229`). La regla vive en el servidor (`lib/crm/approval-gate.ts:8-24`, desde `service.ts:150`).
- **Sin @dnd-kit:** la lógica (buscar origen, sacar, insertar, revertir) es pura sobre el arreglo de columnas; la librería sólo da eventos. Nuestro equivalente: «Mover a…» por tarjeta + la misma reversión.
- **No tomar:** no guardan orden dentro de la columna (`:287` es sólo visual); errores a `console.log` (`:345,:357`); «perder» con un clic, sin motivo ni confirmación (`:178-181` → `set-inactive.ts`).

## 3. Ficha
- **Tomar la idea:** dos pestañas: «Actividades» (`components/crm/activities/ActivitiesView.tsx`) e «Historial» de campos antes/después (`HistoryTab.tsx`; diff en `lib/audit-log.ts:43-69`). Paginado por cursor (fecha, id) (`actions/crm/activities/get-activities-by-entity.ts:62-89`). Una actividad se une a varias fichas (`crm_ActivityLinks`) y al crear se valida escritura en **cada** destino (`create-activity.ts:55-58`).
- **No tomar:** el polimorfismo (§1); devolver todos los `links` (`get-activities-by-entity.ts:79`) filtra ids de fichas ajenas.

## 4. Acciones del servidor y seguridad
- **Tomar:** un servicio que usan acciones y MCP (`service.ts:24-30`) con permiso, reglas, auditoría y avisos; envoltorio sin `"use server"` para no abrir un endpoint (`actions/crm/opportunities/run.ts:1-2`); errores tipados → mensaje (`run.ts:30-35`); pertenencia «asignado o creador; gerente/admin todo» (`lib/authz/scopes/crm.ts:499-520`); «no existe» = «no es tuyo» (`service.ts:36-48`).
- **Problemas (no heredar):**
  - **IDOR:** `updateActivity` verifica sólo que la actividad sea tuya (`update-activity.ts:44`) y reescribe los `links` a cualquier ficha sin comprobarlas (`:73-84`), con `entityType` libre. Tests: sólo cubren `createActivity` (`__tests__/authz/link-write-checks.test.ts:78-97`) y la propiedad (`activity-write-ownership.test.ts:52-134`).
  - Auditoría fuera de la transacción y que **traga el error** (`lib/audit-log.ts:78-91`).
  - Permiso y escritura sin transacción (`service.ts:138-164`) + segundo `update` en `lib/crm/stage-transition.ts:15-18`.
  - Sin control de versión: gana el último que guarda.
  - `set-inactive.ts:29-44`: cambia estado sin auditoría y traga errores.
  - Acciones de UI sin validación en ejecución (`create-activity.ts:35-45`: `metadata` JSON libre, título sin largo); zod sólo en MCP y facturas.
  - `get-currencies.ts:4` sin sesión; 401 `as any`.
  - SQL: sólo `$queryRaw` con plantilla parametrizada (`actions/crm/similarity/get-similar-accounts.ts:45`); no hay `Unsafe`.

## 5. Agentes
- **MCP** (`app/api/mcp/[transport]/route.ts:6-21`, ~131 herramientas en `lib/mcp/tools/`): token `nxtc__` con hash, vencimiento, revocación y último uso (`lib/api-tokens.ts:8-61`); inactivo o socio, afuera (`lib/mcp/auth.ts:42-49`); corre «como actor token» por el mismo servicio (`lib/mcp/run-tool.ts:12`).
  - **Tomar la idea:** el agente es un usuario con token propio y revocable, y usa el servicio de la pantalla.
  - **Riesgo:** el token hereda **todo** el rol (`auth.ts:51`): borrar, `campaigns_send` a terceros, crear contactos; sin alcance por herramienta, sin tope, sin registro propio. Nuestro puesto: lista blanca (E16) y tope (E11).
- **Enriquecimiento** (`inngest/functions/enrich-contact.ts`):
  - **Tomar:** fila de corrida PENDING/RUNNING/COMPLETED/FAILED/SKIPPED con resultado, error y quién la pidió (`schema.prisma:131-149`); lista blanca de columnas (`:20-30`); sólo llena vacíos (`:122-131`); no repite en 7 días (`:90-106`); lote ≤ 100 con permiso por id (`lib/mcp/tools/crm-enrichment.ts:80,100`).
  - **Riesgo:** escribe lo que sacó de la web **sin aprobación**, sin auditoría ni `updatedBy` (`:133-138`) e ignora la `confidence` (`:128`); el prompt leído (`lib/enrichment/services/openai.ts:145`) no trata la web como dato (E10).

## 6. Calidad
442 tests (Jest con Prisma simulado + 25 e2e Playwright); fuertes en permisos (`lib/authz/__tests__` 19, `__tests__/authz` 13, `__tests__/mcp` 15); ninguno contra base real ni de carreras.  **Tomar la idea, no el código** (mono-negocio, otras dependencias, polimorfismo, enums). Lo único casi trasladable: mover y revertir del tablero (§2), reescrito.

## 3 errores de ellos que no hay que repetir
1. Validar el registro y no **los destinos** que se le cambian (`update-activity.ts:44` vs `:73-84`).
2. Auditoría fuera de la transacción y que traga el error (`lib/audit-log.ts:78-91`).
3. Agente con el rol entero del usuario y escritura automática sin aprobación (`lib/mcp/auth.ts:51`; `enrich-contact.ts:133-138`).
