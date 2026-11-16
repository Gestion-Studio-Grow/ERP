# Pericia · NextCRM (lectura de código, 16/11/2026)

Repo: github.com/pdovhomilja/nextcrm-app · commit `d3bead9b44efe2cf94d0dfc2948af0f2c9270deb` (14/11/2026). Clon superficial, sólo lectura; no se ejecutó nada.
Licencia MIT (`LICENSE:3`, «Copyright (c) 2023 Pavel Dovhomilja»). Si se copia una pieza sustancial, va el aviso de copyright y el texto MIT en el archivo o en un `THIRD-PARTY`. Las ideas no exigen nada. **Ojo:** es mono-negocio (0 menciones a tenant en `prisma/schema.prisma`) y usa @dnd-kit, zod, better-auth, Inngest y mcp-handler, que nosotros no tenemos. Nada se copia tal cual.

## 1. Modelo
- **Tomar la idea (campos que nos faltan):**
  - probabilidad por etapa (`schema.prisma:443`): sin ella no hay «monto ponderado» en el Embudo;
  - `stage_entered_at` (`:230`): da los «días en etapa»; `last_activity`/`last_activity_by` (`:241,:244`) dan los «días sin movimiento» sin recorrer la línea de tiempo;
  - fecha esperada de cierre `close_date` (`:227`), aparte de nuestra fecha límite de licitación;
  - aprobación con quién, cuándo y nota (`approval_status/requested_at/note/approved_by/approved_at`, `:232-236`): nuestros pases «con aprobación» no tienen dónde quedar;
  - tipo de cambio congelado al guardar (`snapshot_rate`, `:246`) junto a la moneda;
  - varios contactos por oportunidad (`ContactsToOpportunities`, `:1281`): «quién decide» es un contacto con rol, no texto;
  - actividad con estado programada/hecha/cancelada, duración y resultado (`:672-700`): sirve para «seguimiento vencido» en Hoy;
  - tareas atadas a la oportunidad (`crm_Accounts_Tasks.opportunity_id`, `:881-953`);
  - temporizadores por negocio (`crm_FunnelSettings`, `:453-469`: matar a los 45 días, reciclar a los 90, cadencia de 5 toques): calza con DORMIDA, E19 y E23;
  - `external_ref` (`:48`) para unir con otro sistema; baja lógica `deletedAt/deletedBy` + restaurar sólo admin (`lib/crm/opportunities/service.ts:170-183`).
- **No tomar:**
  - vínculo polimórfico `entityType String` + `entityId` sin FK (`:716-726`, también `crm_AuditLog` `:1074`): sin integridad ni RLS natural; nosotros, FK explícitas (`oportunidadId`, `contactoId`…) o una tabla puente por tipo;
  - enums de Postgres para estados (`:284-296`, `:672-684`): agregar o sacar un valor es migración irreversible (Gate 2); va texto + validación en código;
  - etapa (tabla de catálogo) y `status` ACTIVE/INACTIVE por separado (`:251-253`): «perdida» = INACTIVE sin motivo; nuestro ciclo es una sola máquina con motivo de catálogo;
  - contacto único `contact` (`:237`) **y** la tabla M:N a la vez: dos verdades;
  - plata como texto (`annual_revenue String`, `:19`), `tags/notes String[]` (`:547-548`), el error de tipeo `cratedAt` (`:523`) y la columna `v` que nadie usa para versionar (`:222`).

## 2. Embudo
`app/[locale]/(routes)/crm/dashboard/_components/CRMKanban.tsx`.
- **Tomar la idea:** columnas = etapas filtrando `status==="ACTIVE"` (`:66-76`); el movimiento es optimista: cambia la columna en el cliente al pasar por encima (`:250-305`) y guarda al soltar sólo si cambió de etapa (`:325-336`); si el servidor devuelve error o tira, **vuelve todo al dato del servidor** y avisa (`:337-349`). No pisa el estado con datos del servidor mientras se arrastra (`:223-229`). La regla de negocio vive en el servidor: no se entra a «calificada» sin cotización aprobada (`lib/crm/approval-gate.ts:8-24`, llamado en `service.ts:150`).
- **Sin @dnd-kit:** la lógica (buscar columna de origen, sacar, insertar, revertir) son funciones puras sobre un arreglo de columnas y se separa en 40 líneas; la librería sólo da los eventos. Para nosotros: un `<select>` «Mover a…» o botones por tarjeta + la misma reversión. Más accesible y sin dependencia.
- **No tomar:** no hay orden dentro de la columna (no guardan posición; `toOppIdx` sólo es visual, `:287`); errores tragados con `console.log` (`:345`, `:357`); «perder» desde la tarjeta sin motivo ni confirmación (`:178-181` → `set-inactive.ts`).

## 3. Ficha
- **Tomar la idea:** dos pestañas separadas: «Actividades» (lo que hizo la gente: `components/crm/activities/ActivitiesView.tsx`) e «Historial» (auditoría de campos con antes/después: `HistoryTab.tsx` → `getAuditLogByEntity`). La auditoría guarda el diff por campo ignorando campos internos (`lib/audit-log.ts:43-69`). Línea de tiempo paginada por cursor (fecha, id) estable (`actions/crm/activities/get-activities-by-entity.ts:62-89`). Una actividad se une a varias fichas por `crm_ActivityLinks` y se valida escritura sobre **cada** destino al crear (`create-activity.ts:55-58`).
- **No tomar:** la unión polimórfica (ver §1); devolver los `links` completos (`get-activities-by-entity.ts:79`) muestra ids de fichas que el usuario tal vez no puede ver.

## 4. Acciones del servidor y seguridad
- **Tomar:** servicio único que usan acciones y MCP (`lib/crm/opportunities/service.ts:24-30`): permiso, reglas, auditoría y avisos en un solo lugar; envoltorio sin `"use server"` para que no sea un endpoint (`actions/crm/opportunities/run.ts:1-2`); errores tipados → mensaje (`run.ts:30-35`); pertenencia «asignado o creador; gerente/admin todo» (`lib/authz/scopes/crm.ts:499-520`) y responder igual a «no existe» y «no es tuyo» (`service.ts:36-48`, `get-contacts-by-opportunityId.ts:20-26`).
- **Problemas (no heredar):**
  - **IDOR real:** `updateActivity` sólo verifica que la actividad sea tuya (`update-activity.ts:44`) y después reescribe los `links` a cualquier ficha sin comprobarlas (`:73-84`); `entityType` es cualquier texto. Un usuario mete notas en la oportunidad de otro. Los tests no lo cubren (`activities/__tests__/activity-write-ownership.test.ts:53-134`).
  - Auditoría fuera de la transacción y que **traga el error** (`lib/audit-log.ts:78-91`): la escritura queda sin rastro.
  - Verificación y escritura en pasos separados, sin transacción (`service.ts:138-164`; `handleStageTransition` hace un segundo `update`, `lib/crm/stage-transition.ts:15-18`): carrera entre el permiso y el guardado.
  - Sin control de versión: dos personas que mueven la misma tarjeta, gana la última (no usan `v`).
  - `setInactiveOpportunity` cambia el estado sin auditoría y traga errores (`set-inactive.ts:29-44`).
  - Sin validación en tiempo de ejecución en acciones de UI (`create-activity.ts:35-45`: tipos de TS, `metadata` JSON libre, título sin largo); zod sólo en MCP y facturas.
  - `get-currencies.ts:4`, `get-industries.ts` sin sesión (catálogos; menor). 401 `as any` en `actions/` + `lib/`.
- Inyección SQL: no vi SQL crudo en lo leído [A VALIDAR en todo el repo].

## 5. Agentes
- **MCP** (`app/api/mcp/[transport]/route.ts:6-21`, 131 herramientas en `lib/mcp/tools/`): token `nxtc__` con hash, vencimiento, revocación y último uso (`lib/api-tokens.ts:8-61`, `schema.prisma:1470-1483`); usuario inactivo o socio, afuera (`lib/mcp/auth.ts:42-49`); cada llamada corre «como actor token» (`run-tool.ts:12`) y pasa por los mismos permisos.
  - **Tomar la idea:** el agente es un usuario con token propio, revocable, y usa el mismo servicio que la pantalla.
  - **Riesgo:** el token hereda **todo** el rol del usuario: puede borrar, mandar campañas a terceros (`campaigns_send`) y crear contactos; no hay alcance por herramienta, ni tope, ni registro propio de la llamada. Nuestro «puesto» necesita lista blanca de acciones (E16) y tope (E11).
- **Enriquecimiento** (`inngest/functions/enrich-contact.ts`):
  - **Tomar:** fila de corrida con estado PENDING/RUNNING/COMPLETED/FAILED/SKIPPED, resultado, error y quién la pidió (`schema.prisma:131-149`); lista blanca de columnas (`:20-30`); sólo llena campos vacíos (`:122-131`); no repite en 7 días (`:90-106`); lote máx. 100 con permiso por cada id (`lib/mcp/tools/crm-enrichment.ts:80,100`).
  - **Riesgo:** escribe en el contacto lo que el modelo sacó de la web **sin aprobación humana**, sin auditoría ni `updatedBy` (`:133-138`) e ignorando la `confidence` que el mismo modelo devuelve (`:128`); el prompt leído (`lib/enrichment/services/openai.ts:145`) no trata el texto de la web como dato (E10).

## 6. Calidad
442 archivos de test (Jest con Prisma simulado + 25 e2e Playwright); fuertes en permisos (`lib/authz/__tests__` 19, `__tests__/authz` 13, `__tests__/mcp` 15); ninguno contra base real ni de carreras. ~113 mil líneas en `actions/app/components/lib`. **Veredicto: tomar la idea, no el código.** Mono-negocio, otras dependencias, polimorfismo y enums. La única pieza casi trasladable es la lógica de mover y revertir del tablero (§2), reescrita.

## 3 errores de ellos que no hay que repetir
1. Validar el permiso del registro y no el de **los destinos** que se le cambian (`update-activity.ts:44` vs `:73-84`).
2. Auditoría fuera de la transacción y que traga el error (`lib/audit-log.ts:78-91`).
3. Agente con el rol entero del usuario y escritura automática sin aprobación (`lib/mcp/auth.ts:51`; `enrich-contact.ts:133-138`).
