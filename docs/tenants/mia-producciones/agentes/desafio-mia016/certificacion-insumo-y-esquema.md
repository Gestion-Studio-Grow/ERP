# Certificación adversarial · 07 camino de ejecución + 08 controles · 14/11/2026

> Dictamen del certificador en contra (MIA-016, 14/11). Las líneas «07 :n» son de `insumo-camino-de-ejecucion.md`. Las pruebas corrieron en un Postgres local descartable (`pruebas-certificacion/`), no contra Neon.

Objeto: `docs/tenants/mia-producciones/agentes/desafio-mia016/insumo-camino-de-ejecucion.md` (líneas = original +2),
`desafio-mia016/controles-erp-faltantes.md`, esquema `73386729` (`agentes_base`).
No se reabre la regla del permiso más chico (decisión del dueño).

## Evidencia ejecutada (Postgres 16 local, base descartable `cert0708`; Prisma 7.8.0 generado del esquema de 1A)
Archivos en `scratchpad/cert/`: `mig.sql` (1A literal), `propuesto07.sql` (columnas de §3.1/§3.2 traducidas
literalmente), `ataques.sql`, `candado.mts`, `candado2.mts`, `cupo.mts`.

| Prueba | Resultado |
|---|---|
| `updateMany({ where: estado:'ACTIVO', data: {} })` dentro de la tx + otra conexión que pausa | Prisma emite **sólo un SELECT**; la pausa **no espera** (`PAUSA NO ESPERO`). Con `data: { pausadoPor: null }` emite UPDATE y la pausa queda bloqueada (lock timeout) |
| app_rls inserta v2 de la autorización con otro `textoVersion`, `firmanteUserId` nulo y topes gigantes | Aceptado |
| Revocar v2 y leer como §3.3 paso 1 | Devuelve **v1** (no revocada) |
| `UPDATE SET revocadaEl=NULL, topes=...` sobre una firmada | Aceptado (sólo DELETE está revocado) |
| Propuesta con `pedidoId` de un pedido de `u-diseno` y `solicitadoPor='u-direccion'` | Aceptada |
| Original REVERTIDA + `INSERT … ON CONFLICT DO NOTHING` de la rutina con la misma `clave` | Se crea otra PENDIENTE |
| Dos EJECUTADA sin `clave` | Aceptadas (columna nula) |
| B2 de dos movimientos distintos a la misma cuota | Dos EJECUTADA (claves distintas) |
| Contra-operación con la misma `clave` que la original | Choca con el único y aborta la tx |
| `AgenteContador.monto = -500000000`, `montoCentavos = -100` | Aceptados |
| 12 tomas de cupo de $400.000 a la vez contra tope de $1.000.000 | 2 ganan, n=2, monto=80000000: el UPDATE condicional es correcto (sin TOCTOU en el contador) |
| RLS: tenant B lee AgenteAutorizacion de A | 0 filas (correcto) |

## Hallazgos

| id | sev | dónde | problema | corrección |
|---|---|---|---|---|
| H1 | BLOQUEANTE | 07 :164-165, :354-356 (y `03` :484-486) | El «candado sin cambiar nada» no toma la fila: Prisma 7 no emite UPDATE con `data: {}`. T8 (revocar en vuelo) y la pausa fallan | Candado con escritura real: `updateMany({ where: { id, revocadaEl: null }, data: { revocadaEl: null } })` (y `data: { pausadoPor: null }` en AgentePuesto), o `SELECT … FOR SHARE` crudo. Test de carrera con dos conexiones |
| H2 | ALTO | 07 :349 (paso 1), :326-328 | Revocar la versión vigente revive la anterior: firmar v2 no cierra v1 | Columna `AgenteAutorizacion.reemplazadaEl TIMESTAMP(3)`; firmar v(n) la pone en v(n-1) en la misma tx; revocar = `updateMany where tenantId AND revocadaEl IS NULL`; índice `AgenteAutorizacion_tenantId_viva_key ON ("tenantId") WHERE "revocadaEl" IS NULL AND "reemplazadaEl" IS NULL` |
| H3 | ALTO | 07 :326-328 | Sólo `REVOKE DELETE`: app_rls puede des-revocar y reescribir `operaciones`/`topes`; la defensa es un test estático | `REVOKE UPDATE ON "AgenteAutorizacion" FROM app_rls; GRANT UPDATE ("revocadaEl","revocadaPor","motivoRevocacion","reemplazadaEl")`; trigger `AgenteAutorizacion_revocacion_irreversible` (error si `OLD."revocadaEl" IS NOT NULL`); repetir en `prisma/rls/0002_app_role.sql` (su :58 re-otorga) |
| H4 | ALTO | 07 :311, :365-367 | Quién firma no está en código: cualquier usuario que llegue a la acción inserta una versión más amplia; `firmante` es texto libre | Permiso propio `agentes.firmar` (sólo titular); CHECK `AgenteAutorizacion_firmante_check`: `metodo<>'APP_CON_SESION' OR "firmanteUserId" IS NOT NULL`; `textoHash` calculado en servidor sobre `operaciones`+`topes` canónicos |
| H5 | MEDIO | 07 :308, :350 | `textoVersion` texto comparado con `≥`: `'AUT-AGENTES-10' < 'AUT-AGENTES-9'` | `textoVersion INTEGER NOT NULL` (la etiqueta va en `textoHash`/evidencia) |
| H6 | ALTO | 07 :341, :435 | `solicitadoPor` no está atado al pedido: se falsifica quién pide, y con él el permiso efectivo | Índice `AgentePedido_tenantId_id_userId_key ("tenantId","id","userId")` y FK `AgentePropuesta_tenantId_pedidoId_solicitadoPor_fkey ("tenantId","pedidoId","solicitadoPor") → AgentePedido("tenantId","id","userId")`; `REVOKE UPDATE ("userId","clave","pedidoEl") ON "AgentePedido"`; `pedidoId`/`solicitadoPor` sólo del contexto de servidor, nunca de `argumentos` (Zod rechaza esas llaves; test) |
| H7 | MEDIO | 07 :122 vs :341 | «Adelantar la rutina» graba origen RUTINA con los dos nulos: quien la disparó no queda en la propuesta; y el permiso de la persona se mira en `recorte` (foto al dejar el pedido) | Columna `origen TEXT NOT NULL CHECK (origen IN ('RUTINA','PEDIDO'))`, `CHECK (origen<>'PEDIDO' OR "pedidoId" IS NOT NULL)`; `pedidoId` también al adelantar. El permiso se recalcula del usuario vigente al decidir, no de `recorte` |
| H8 | ALTO | 07 :242-243 | Una REVERTIDA libera la `clave` y la rutina, determinista, la rehace en el barrido siguiente: Deshacer no sirve (B2, C5, C6) | Índice `AgentePropuesta_tenantId_clave_viva_key … WHERE estado IN ('PENDIENTE','EJECUTADA','REVERTIDA')`; rehacer sólo por persona con `clave` `<clave>:rehecha:<n>` y `modo='PERSONA'` |
| H9 | MEDIO | 07 :335 | `clave` nullable: el único no protege filas sin clave | `clave TEXT NOT NULL` (la tabla está vacía: sin aplicar) |
| H10 | ALTO | 07 :235 (ej. B2), :473 (T7) | Clave B2 por par (mov, cuota): dos movimientos a la misma cuota son dos claves; T7 no lo garantiza el único (08 :133, sin único de `cuotaId`) | Clave B2 = `B2:cuota:<cuotaId>` (el recurso escaso); el movimiento ya lo cuida `where cuotaId IS NULL` |
| H11 | MEDIO | 07 :247-250 | Contra-operación sin `clave` definida; con la misma, choca con la original y aborta | `clave` de la contra = `REV:<idOriginal>` |
| H12 | ALTO | 07 :202, :334, :338 | Falta la moneda: `ProyectoMovBanco` no la tiene (está en `ProyectoCuentaBanco.moneda`, schema :4063); USD 1.000,00 consumiría cupo como $1.000; montos negativos aceptados | `AgentePropuesta.moneda TEXT` + CHECK `AgentePropuesta_monto_check (("montoCentavos" IS NULL)=("moneda" IS NULL) AND ("moneda" IS NULL OR "moneda"='ARS') AND ("montoCentavos" IS NULL OR "montoCentavos">0))`; `AgenteContador.moneda TEXT NOT NULL DEFAULT 'ARS'` en la PK + `AgenteContador_monto_check ("monto">=0)`; B2 compara `cuenta.moneda` y `cuota.moneda` |
| H13 | ALTO | 07 :261-262 | La contra de C5/P6 no deja todo como estaba: marcar crea `ProyectoPago`/`ProyectoGasto`, `CashMovement` en la caja abierta, suma `saldo` y avisa (`acciones-ficha.ts:793-822`, `acciones-empresa.ts:95-112`); anular deja otro movimiento en la sesión de hoy (día cerrado) | Contra nombrada que revierte cada efecto (o reutiliza `anularCuotaEmpresa`/anular cobro) con test «estado idéntico» y «con la caja cerrada» |
| H14 | ALTO | 07 :82, :78-81 | «Respaldo exacto» = sólo importe y sentido: un depósito redondo de otro pagador o de otra fecha (08 :45, extracto de cualquier fecha) marca cobrada una cuota ajena y P6 tapa un pago desviado. Al adelantar, la unicidad tiene que mirarse de los dos lados | Unicidad bidireccional (mov→1 cuota Y cuota→1 mov), fecha del movimiento ≥ alta de la cuota y dentro de N días; P6 sólo con contraparte verificada, o persona |
| H15 | MEDIO | 07 :208-209 | Fuera de horario, R2 va a persona: contradice «persona sólo sobre el tope o en lo irreversible» | Diferir (sigue en la rutina de las 8:00), no derivar |
| H16 | MEDIO | 07 :24, :247 | Quién puede tocar Deshacer no está: quien pidió sin permiso de editar ve el botón | `exigirEditar(módulo)` en Deshacer |
| H17 | BAJO | 07 :169-172; :196 | Toma topes antes de reclamar la propuesta (los perdedores traban contadores); `AgenteAjuste` no tiene columna de topes | Paso 8 antes del 6; filas en orden canónico; columna `AgenteAjuste.topes JSONB` o quitar la mención |
| H18 | BAJO | 07 :75 vs :208 | K6 a las 18:00 y R2 hasta las 20:00 | K6 después del cierre de la ventana |

08: verificadas 7 referencias, todas exactas: schema :3838, :3852, :4082, :4075; acciones-empresa :95-112, :227, :237-239;
0002_app_role.sql :57-64.

## Veredicto: NO CUMPLE
H1 rompe la revocación y la pausa. H2, H3, H4, H6, H8, H10, H12 y H13 son correcciones concretas de esquema y diseño.
Corregidas, la próxima vuelta se mira sólo eso.

## Separación: diseño de agentes vs. defectos del ERP de hoy (agregado por MIA-016, 14/11)

Cómo leer la columna «Evidencia»:
- **Prueba:** la corrió el certificador en un Postgres 16 local descartable. El script está en `pruebas-certificacion/` y el resultado es el que informó en el dictamen.
- **Lectura:** sale de leer el código. No se ejecutó.

### 1. Del diseño de agentes: esquema de 1A y el insumo `07` / `03`

No existen en producción. Se corrigen antes del Gate 2.

| Hallazgo | Evidencia |
|---|---|
| H1, candado con `data:{}` | Prueba (`candado.mts`, `candado2.mts`): Prisma 7 emite sólo un SELECT y una pausa en paralelo no espera |
| H2, revocar revive la anterior | Prueba (`ataques.sql` A2) |
| H3, des-revocar y editar topes | Prueba (A3) |
| H4, autofirma | Prueba (A1) |
| H5, `textoVersion` como texto | Lectura |
| H6, `solicitadoPor` falsificable | Prueba (F1) |
| H7, origen | Lectura y F2 |
| H8, REVERTIDA rehecha | Prueba (I1) |
| H9, `clave` nula | Prueba (I2) |
| H10, B2 misma cuota | Prueba (I3) |
| H11, clave de la contra | Prueba (I4) |
| H12, moneda y negativos | Prueba (M1, M2) |
| H15 a H18 | Lectura |

Cupo de `AgenteContador`: prueba (`cupo.mts`). De 12 tomas a la vez ganaron 2: sin carrera.

### 2. Mixtos: el diseño se apoya en un comportamiento del ERP de hoy

| Hallazgo | Evidencia |
|---|---|
| H13, deshacer C5/P6 | Lectura de `acciones-ficha.ts:793-822` y `acciones-empresa.ts:95-112`: marcar crea `ProyectoPago`/`ProyectoGasto`, `CashMovement` y saldo |
| H14, respaldo exacto | Lectura: el extracto acepta movimientos de cualquier fecha (`controles-erp-faltantes.md` a) |

### 3. Defectos del ERP de hoy (con o sin agentes)

Todos salen de `controles-erp-faltantes.md`. **Son lectura de código: ninguno se probó en Postgres.** El certificador verificó 7 de esas referencias contra el código, también por lectura, y las 7 son exactas.

- Cobrar no es idempotente: `src/app/admin/(dashboard)/proyectos/acciones.ts:212` crea un cobro nuevo en cada envío.
- Conciliar comprueba y después actualiza, y no compara el importe (`acciones-empresa.ts:237-239`). `cuotaId` no es único (`prisma/schema.prisma:4082`).
- El extracto bancario se deduplica sin índice único y sin transacción (`acciones-empresa.ts:216-220`).
- Proyectos no usa la frontera de cierre de día y de mes (`src/lib/caja/frontera-cierre.ts:48-89`). La fecha de un gasto acepta cualquier día (`acciones.ts:290`).
- No hay tope por monto ni separación de funciones fuera de rendiciones (`rendiciones/aprobacion.ts:8,19`).
- `AuditLog` se purga a los 18 meses (`audit-retention.ts:70`), contra 10 años de conservación contable (a confirmar con la contadora).

**Pendiente:** probar en Postgres local «cobrar dos veces» y «conciliar dos veces a la vez» antes de arreglarlos. Va como test de carrera escrito antes del arreglo.

### 4. H1 en el código de producción

**No aparece.** Se buscó el patrón `data:\s*\{\s*\}` en `src/` (en `main` local y en `agentes/tanda-1`): sólo sale en dos tests (`cartera-core.test.ts:279`, `guardia-negocio.test.ts:545`), y ninguno es un candado de plata.

El código de plata que hoy está en producción toma la fila de dos maneras:
- `FOR UPDATE` / `FOR SHARE` crudo: `invoice-core.ts:372,727`, `liquidacion-repo.ts:901`, `pin.server.ts:102`, `reparto/acciones.ts:160`.
- Un `updateMany` que **sí cambia** el estado, con `count === 1`.

H1 está sólo en el diseño: `03-especificacion-tecnica.md:484-486` (el candado de pausa) y el insumo `07`.
