# Matriz de permisos por usuario — PLAN (tanda 1)

Rama `claude/matriz-permisos` · planificado en Fable 5/11/2026 · ejecuta Opus. Tres roles (OWNER=socio, RECEPTION=recepcionista, PROFESSIONAL=profesional) y, por usuario, 8 casillas. El rol sigue dando el default; la casilla sólo graba la **excepción** (prendida o apagada respecto del rol).

## 1. Modelo de datos (migración ADITIVA, SIN aplicar; Gate 2)
- Tabla nueva `UserPermissionOverride` (`id`, `tenantId`, `userId` FK→User, `capability String`, `allowed Boolean`, `createdAt`, `updatedAt`, `@@unique([userId, capability])`, `@@index([tenantId])`). RLS como las demás tablas por tenant. No se toca el enum `UserRole` ni `User`.
- Se guarda **una fila por casilla distinta del default**; volver al default borra la fila. Una tabla aparte y no un JSON en `User` porque se audita por casilla y porque la lectura por request sigue siendo un `select` chico.
- Tolerancia a la ausencia: `src/lib/session.ts:40` suma `permissionOverrides: { select: { capability, allowed } }` dentro de un `try`; si Prisma falla (tabla inexistente en prod, P2021) se loguea una vez y queda `[]` → vale el default del rol. `SessionUser` suma `overrides: ReadonlyArray<{capability, allowed}>` (default `[]`; `DEMO_SESSION_USER` en `src/lib/demo-sandbox.ts:41` lo lleva vacío).

## 2. Un solo resolvedor
- `src/lib/capabilities.ts`: nueva `permisoEfectivo(user: {role, overrides}, cap): boolean` = override si existe, si no `roleHasCapability(role, cap)`. Candado: las capacidades que NO están en las 8 casillas ignoran overrides (lista `CAPACIDADES_POR_USUARIO`), así nadie prende `users:manage` por la base.
- `src/lib/authz.ts:31` y `:47` pasan a `permisoEfectivo(user, cap)`. Con eso caen de una las ~319 `requireCapability`.
- Los ~78 archivos con `roleHasCapability(user.role, …)` directo: donde el `user` es un `SessionUser` se reemplaza mecánicamente por `permisoEfectivo(user, …)` (codemod con `sed` + `tsc`); `roleHasCapability` queda sólo para `permisos-core.ts` (tabla del rol) y tests. Lo hace el constructor A con un test que falla si vuelve a aparecer `roleHasCapability(user.role` fuera de esos archivos.

## 3. Casilla → capacidad y default por rol (3×8)
| # | Casilla | Capability | OWNER | RECEPTION | PROFESSIONAL |
|---|---|---|---|---|---|
| 1 | Disponible para reserva online | `Professional.active` (no es capability; ver §6) | — | — | sí |
| 2 | Agendar turnos en su agenda | **nueva** `agenda:create` (sólo las acciones que CREAN turno) | sí | sí | no |
| 3 | Editar turnos en su agenda | `agenda:manage` (mover/reprogramar/cancelar/editar) | sí | sí | no |
| 4 | Cargar cobranzas en sus turnos | `agenda:collect` | sí | sí | sí |
| 5 | Ver datos de contacto de clientes | **nueva** `clients:contact` | sí | sí | no |
| 6 | Cargar movimientos de stock | `stock:receive`+`stock:count`+`stock:adjust` (una casilla graba las 3) | sí | sí | no |
| 7 | Recibir señas en su cuenta MP | **nueva** `payments:own-account` — «próximamente» (§7) | — | — | no |
| 8 | Habilitar la caja | **nueva** `cash:manage` (abrir/cerrar/arqueo) | sí | sí | no |
Decisión del orquestador (05/11): 2 y 3 van separadas desde la tanda 1 — dos casillas que graban lo mismo confunden. Sólo las acciones que crean turno pasan a `agenda:create`; el resto sigue en `agenda:manage`.

## 4. Qué hace cumplir el servidor y dónde
- **Caja (8):** `src/lib/caja-actions.ts:225` (`openCashSession`), `:406`, `:457` (`closeCashSession`) y el loader `:171` pasan de `orders:manage` a `cash:manage`. Vender (`orders:manage`) no cambia. `cash:manage` se suma a `DEL_DUENIO` y a RECEPTION en `capabilities.ts:112/172`.
- **Contacto (5):** `clients:contact` se suma a `DEL_DUENIO` y RECEPTION. Enmascarado en el servidor, no en el componente: helper `enmascararContacto(ficha, user)` en `src/lib/clientes/telefono.ts` (nuevo `export`), que devuelve `phone`/`email` como `"•••• 4821"` / `"m…@…"`. Lo aplican los loaders: `src/lib/clientes/lista-fichas.server.ts`, `clientes/[id]/page.tsx`, `turnos/agenda.server.ts:61` (`proyectarAgenda` recibe `quien` ya), `clientes/duplicadas/page.tsx`. CSV: `campania/export/route.ts:42` exige `clients:contact` (no `clients:read`); `reportes/export/route.ts` revisa si saca teléfonos y, si sí, igual. Botones de WhatsApp/llamar se ocultan con `canCurrentUser("clients:contact")`.
- **Stock (6):** ya guardado por `stock:*` (`src/lib/stock-adjustment-actions.ts`, `inventario/ajustes-loader.ts:30/77`, `compras/actions.ts`, `carniceria/*`); con el resolvedor alcanza.
- **Agenda (2/3/4):** ya guardado en `src/lib/actions.ts:787…2302` y `src/lib/turnos/cobro-actions.ts:198`.

## 5. Scoping «en su agenda»
Hoy el scoping es `if (user.role === "PROFESSIONAL" && appointment.professionalId !== user.professionalId)` repetido en `actions.ts:1234/1909/1963/2123` y `cobro-actions.ts:120` (`soloLoSuyo`). Se centraliza: `soloLoSuyo` se mueve a `src/lib/authz.ts` y se usa en todas las acciones de `agenda:manage` también (crear `:787`, mover `:1487`, cancelar `:1076`). Regla: un PROFESSIONAL con la casilla 2/3 prendida crea/mueve/cancela **sólo** turnos con `professionalId === user.professionalId`; sin `professionalId` vinculado la casilla no se puede prender (la pantalla lo dice y la acción lo rechaza). El loader `agenda.server.ts` ya filtra la agenda del profesional.

## 6. Casilla 1: reserva online
Es `Professional.active` (ya existe) leído por `getProfessionalsWithServices` (`src/lib/actions.ts:99`, filtra `active: true`) y por `src/app/(site)/reserva/page.tsx:26`. La matriz muestra la casilla para usuarios con `professionalId` y llama `toggleProfessionalActive` (`catalog-actions.ts:558`) con auditoría. Coordinación con `claude/link-servicio-redes` (rama no está en este clon): los links de servicio/redes deben leer el mismo `active` y no listar al profesional apagado; se anota en el PR, no se duplica dato.

## 7. Casilla 7: tanda aparte
MP hoy es por negocio (`src/integraciones/conexiones.server.ts:189 crearConexion`). Que la seña vaya a la cuenta del profesional obliga a decidir: a dónde va la plata (no entra a la caja del negocio), cómo se liquida la comisión (`commissionPercent`) y qué pasa con `cobraEnMostrador`. No es chica ni segura → en tanda 1 la casilla aparece **deshabilitada con «próximamente»** y la capability `payments:own-account` existe en el union pero ningún rol la tiene ni la pantalla la graba.

## 8. Gobierno y auditoría
- Sólo OWNER (`users:manage`) edita la matriz; acción nueva `setUserPermission(formData)` en `src/lib/user-actions.ts` (patrón de `setUserActive:132`): rechaza `userId === actor.id` («nadie se cambia a sí mismo»), rechaza editar a otro OWNER (los socios se arreglan por rol, no por casilla), valida que la capability esté en `CAPACIDADES_POR_USUARIO`, hace upsert/delete y audita con `auditAdmin({ action: "permission_set", entity: "User", entityId, changes: { capability, antes, despues } })` (`src/lib/audit-core.ts:78`). Demo sandbox → `DEMO_WRITE_BLOCKED`.
- La sesión cachea por request, así que el cambio rige en el próximo request del afectado: aceptable y anotado.

## 9. Pantalla (`/admin/usuarios`)
Sección nueva «Qué puede hacer cada persona» en `usuarios/page.tsx`: filas = usuarios agrupados por rol (`etiquetaDeRol`, `roles.ts:38`), columnas = 8 casillas. Cada celda: checkbox con el valor efectivo; si difiere del rol lleva punto «excepción» y tooltip «por rol: sí/no». El propio socio ve su fila gris. Casilla 1 sólo en filas con ficha vinculada; casilla 7 gris con «próximamente». Lógica pura en `usuarios/matriz-core.ts` (como `permisos-core.ts:55`) con test. Criollo claro, a11y (label por celda, foco visible), móvil: columnas con scroll horizontal y cabecera fija.

## 10. Tanda 1 — dos bloques independientes
**Bloque A (motor y servidor):** `prisma/schema.prisma` (modelo nuevo tras `User:476`) + `prisma/migrations/20261105120000_user_permission_override/` sin aplicar · `src/lib/session.ts:16-50` · `src/lib/demo-sandbox.ts:41` · `src/lib/capabilities.ts:13-79` (3 capabilities nuevas), `:112` (DEL_DUENIO), `:170-209` (roles + `permisoEfectivo` + `CAPACIDADES_POR_USUARIO`) · `src/lib/authz.ts:29-48` (+ `soloLoSuyo`) · codemod `roleHasCapability(user.role` → `permisoEfectivo(user` en los 78 archivos · `src/lib/caja-actions.ts:171/225/406/457` · `src/lib/actions.ts:787/1076/1487` (scoping) · `src/lib/turnos/cobro-actions.ts:120` · `src/lib/user-actions.ts` (`setUserPermission`) · tests: `capabilities.test.ts`, `authz` nuevo, `user-actions` postgres.
**Bloque B (contacto y pantalla):** `src/lib/clientes/telefono.ts` (`enmascararContacto` + test) · `src/lib/clientes/lista-fichas.server.ts` · `clientes/[id]/page.tsx` · `clientes/duplicadas/page.tsx` · `turnos/agenda.server.ts:61` · `campania/export/route.ts:42` · `reportes/export/route.ts` · `usuarios/matriz-core.ts` (+test) · `usuarios/page.tsx` · `usuarios/MatrizDePermisos.tsx` · `usuarios/permisos-core.ts:36` (sumar las filas nuevas a la tabla del rol). B usa `permisoEfectivo` con un stub hasta mergear A; contrato: firma de §2.

**Tandas posteriores (ficha del personal: comisiones + servicios que hace; disponibilidad):** `PLAN-ficha-personal.md`.

## 11. Riesgos para el certificador (plata, seguridad, datos)
1. Override que prende una capability fuera de las 8 (p. ej. `users:manage`, `agenda:void`): el candado de §2 debe tener test adversarial.
2. Profesional con casilla 2 crea un turno a OTRO profesional, o cobra turno ajeno: probar `soloLoSuyo` en crear/mover/cancelar/cobrar.
3. Caja: recepcionista con `cash:manage` apagado no abre ni cierra pero sí vende; verificar que `cash-sale` no exija `cash:manage` (si no, se rompe la venta).
4. Contacto: teléfono/mail en CSV, en la agenda del día, en la ficha, en duplicadas, en la búsqueda para venta (`buscar-para-venta.ts`) y en recordatorios; un solo loader sin enmascarar filtra todo.
5. Aislamiento por tenant en la tabla nueva (RLS + `tenantId`), y que `setUserPermission` no edite un `userId` de otro tenant.
6. Tabla ausente en prod (Gate 2 sin aplicar): la app arranca y vale el rol; el `catch` no puede tragar otros errores.
7. Auto-edición y OWNER→OWNER rechazados en el servidor, no sólo en la pantalla; cada cambio con fila en `AuditLog`.
