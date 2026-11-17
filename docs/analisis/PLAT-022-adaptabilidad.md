# PLAT-022 · ERP adaptable, errores de agentes, arnés y bucle Ralph

Análisis técnico de sólo lectura. 17/11/2026. Pedido del dueño (17/11), despachado por GSG-ORQ-007.
Sin cambios de código, sin Neon, sin datos reales.

- **Sesión (get_session):** modelo `claude-opus-5-5` (servido: `claude-opus-5-5`), esfuerzo `high`, ventana 500k (compactación efectiva 480k, umbral 384k). **Desvío:** `CLAUDE_CODE_AUTO_COMPACT_WINDOW=500000` en el entorno, por encima del tope de 400k de la transición que pide `CLAUDE.md`. Costo de la sesión según `get_session` (`usage.cost_usd`): **US$ 2,41** al recibir la revisión.
- **Base leída:** `main` en `59a71e3`, más las ramas `origin/mia-50/t01-plata` (`c9ded35`) y
  `origin/mia-062/consola-cuadrilla` (`3a64a7c`). Las citas de rama llevan el prefijo `[t01]` o `[cuadrilla]`.
- **Criterio:** cada hallazgo sale de un error del anexo o de un `archivo:línea`. Lo que no pude ver en este repo
  lo marco como **no verificado**.

---

## 1. Errores reales agrupados por causa

| # | Causa | Errores del anexo | Verificado en código |
|---|---|---|---|
| C1 | **Invariante de concurrencia que vive en un comentario, no en un test** | Carrera de plata (#185): el cierre cuenta 0 con una venta de 300 en el libro | Sí |
| C2 | **Guardia que se agrega a mano en cada punto de entrada; el trinquete sólo mira acciones** | `/operador/cuadrilla` escribe en todos los negocios sin `requireOperadorParaNegocio` | Sí |
| C3 | **Dos modelos de permiso sin unir: el del agente y el del puesto** | «El rol del agente no está atado al permiso de la persona del puesto» | Sí |
| C4 | **El «OK» lo pone el agente con palabras; ninguna herramienta lo comprueba** | Informes inflados; 166 de 214 capturas sin mirar; «verificador visual: OK»; control por palabras eludido 9 veces | En parte: `registro-agente.mjs` no está en este repo |
| C5 | **Recorridos E2E/UAT fuera de CI, así que se desactualizan** | Guion `mia-recorrido.mjs` desactualizado; hallazgos de la UAT por roles | En parte (ver C5) |

### C1 · Carrera de plata
- `[t01] src/lib/proyectos/periodo-cerrado.server.ts:10-12` dice: «si lo tomó el asiento, el cierre espera a que
  confirme y lo cuenta». **Es falso con Serializable.**
- `[t01] src/lib/cierre-diario-actions.ts:786-790` y `:919`: `cerrarDia` corre en `tenantTransaction(..., { isolationLevel:
  Serializable })`.
- `src/lib/rls.ts:221-222`: `tenantTransaction` ejecuta `SELECT set_config(...)` como primera sentencia. En Postgres,
  con Serializable o Repeatable Read, la foto de la transacción se toma en la primera sentencia. Por eso la foto es
  anterior a `pg_advisory_xact_lock` (`:790`).
- Sin RLS (`rls.ts:209`) pasa lo mismo: si el candado es la primera sentencia, igual toma la foto antes de esperar.
  El candado de transacción solo no ordena lecturas en Serializable.
- Consecuencia: el asiento toma el candado y confirma. El cierre esperaba el candado, pero lee con su foto vieja
  (`:812` `cashMovement.findMany`), así que no ve la venta y cuenta 0. SSI no lo aborta, porque hay una sola arista
  rw y no se forma ciclo.
- El mismo archivo deja otro hueco abierto (`[t01] periodo-cerrado.server.ts:15-17`): `libro-caja-actions.ts:321` y
  `:519` leen `lastClosedDay` antes de la transacción (`:357`, `:523`) y sin candado.
- **Cura (corregida tras la refutación, probada con dos conexiones en Postgres 16):** que **los asientos también corran en
  Serializable**, con reintento. Así asiento (lee frontera, escribe `CashMovement`) y cierre (lee `CashMovement`,
  escribe la frontera) forman un ciclo lectura↔escritura y SSI aborta a uno; en el reintento ve al otro confirmado.
  Es el patrón que el repo ya usa y explica en `src/lib/cierre-mes/acciones.ts:103-108`.
  - **No sirve** pasar el cierre a Read Committed: la apertura de turno (`src/lib/caja-actions.ts:249-329`) depende del
    ciclo SSI frontera↔turno (`:252`), y sin él puede quedar un día cerrado con un turno abierto.
  - **No sirve** tomar el candado en una transacción previa: `pg_advisory_xact_lock` se suelta al confirmar esa
    transacción.
- **El test que ya existe no lo cubre:** `[t01] src/lib/proyectos/t01-plata-postgres.test.ts:314-342` prueba sólo el
  orden «el cierre toma el candado primero», y simula el cierre con un `BEGIN` plano (Read Committed), no con la
  transacción Serializable de `cerrarDia`. Falta el orden «el asiento primero» contra el `cerrarDia` real.
- **Superficie:** en `[t01]` sólo 4 archivos toman `cierre-dia:` (`caja-actions.ts`, `cierre-diario-actions.ts`,
  `cierre-mes/acciones.ts`, `proyectos/periodo-cerrado.server.ts`). Otros **14 escriben en `CashMovement` sin ese
  candado**:
  - Sin Serializable: `ajuste-peso-cobrado.ts`, `caja/cash-sale.ts`, `caja/cobro-turno.ts`, `libro-caja-actions.ts`,
    `order-anulacion.ts`, `settlement/saldo-del-pedido.ts`, `stock/purchase-core.ts`, `supermercado/pago-mixto-tx.ts`,
    `taller/caja.ts`.
  - Con Serializable en algún camino: `turnos/anulacion.ts`, `vouchers/liquidacion-repo.ts`, `commission-actions.ts`,
    `stock/supplier-return.ts`, `settlement/collection-repo.ts`.
  - Se excluye `reset-golive-db.ts` (script de reinicio).
  - Comando: archivos de `src/lib` con `cashMovement.(create|createMany|update|updateMany|delete|deleteMany|upsert)(`,
    sin tests, y para cada uno `grep -c "cierre-dia:"` y `grep -c Serializable`. Que un archivo tenga Serializable en
    algún camino no prueba que su asiento lo use.
- **Patrón:** la propiedad («el candado ordena asiento y cierre») se afirmó en prosa y la certificación la aceptó sin
  un test de dos conexiones que la rompa.

### C2 · Acción sin control del negocio
- `[cuadrilla] src/app/operador/(console)/cuadrilla/page.tsx:30` sólo llama a `requireOperator()`.
  - `:43` lista todos los `tenant`.
  - `:51` entra en cada uno con `enElNegocio` y llama a `cargarNegocio`.
- `[cuadrilla] src/lib/cuadrilla/cargar.ts:25` llama a `vencerPedidos`, que escribe al renderizar.
  - `pedidos-core.ts:100-116` hace un `updateMany` de los pedidos a `ESCALADO` y crea una `excepcionCuadrilla` y un
    `mensajeCuadrilla`.
  - `:121-133` lo repite para cada pedido abierto.
- Un GET de una página escribe en todos los negocios. Además se salta la regla de `guardia-negocio-core.ts:24-31`
  (un operador que no es el dueño no toca `beauty-spa`).
- Por qué no lo atajó el trinquete: `src/lib/operador/guardia-negocio.test.ts:312` y `:343-346` sólo encuentran
  endpoints con `"use server"`. **El render de un `page.tsx` que escribe no es un endpoint para el test.**
- El hueco es de clase, no de caso. Hay 123 archivos con `"use server"` y 0 acciones en línea (`git grep -lE "^[\"']use server[\"'];?$" -- src ':!*.test.ts' | wc -l`), y cada uno pone a mano su guardia y su
  auditoría.

### C3 · Rol del agente y permiso del puesto
- `[cuadrilla] src/lib/cuadrilla/permisos.ts:26-29` define `Actor` (operador, supervisor o agente), con operaciones
  propias (`:31-46`).
- `[cuadrilla] actor-del-panel.server.ts:15-17`: el agente es un `User` del negocio. Fuera de la consola, el resto del
  ERP lo trata por su `role` (`src/lib/capabilities.ts:11`, `OWNER | RECEPTION | PROFESSIONAL`).
- Nada impide que el usuario de un agente tenga `OWNER` y, por `requireCapability`, cierre el día o condone saldos.
  La consola lo frena dentro de la consola (`:15`, «un agente nunca supervisa»), pero no frena el resto del ERP.
- Hay **69 chequeos de rol** por fuera de `capabilities.ts`, por ejemplo `src/lib/caja/cierre-diario.ts:716-718`
  (`puedeCerrarElDia` compara strings). Así el mapa deja de ser la única fuente.
  - Cuenta: `git grep -nE 'role === "(OWNER|RECEPTION|PROFESSIONAL|ENCARGADO)"|role !== "(OWNER|RECEPTION|PROFESSIONAL)"' -- src ':!*.test.ts' ':!src/lib/capabilities.ts'`.
- Ya hay piezas que este análisis había omitido:
  - Una matriz por usuario: `UserPermissionOverride` (`prisma/schema.prisma:562`), con las casillas que se pueden pisar
    fijadas en código (`CAPACIDADES_POR_USUARIO`).
  - Un guardián: `src/lib/permisos/matriz-permisos.test.ts:149`. Impide resolver una casilla de la matriz con
    `roleHasCapability(x.role, …)`, pero no mira las comparaciones directas `role === "..."`.

### C4 · OK de palabra
- `.claude/settings.json:67-78` tiene un solo gancho de herramienta: `PostToolUse` → `design-lint.js`. No hay gancho
  `Stop` ni `SubagentStop` que exija evidencia antes de cerrar, y no hay `PreToolUse` que proteja los tests.
- `settings.json:4-6` permite `Edit` y `Write` sobre cualquier archivo, `*.test.ts` incluidos.
- No hay `CODEOWNERS` (verificado: no existe).
- Lo que sí está bien y sirve de modelo: `.github/workflows/gates.yml:126-131` falla si se salteó un test, porque lo
  comprueba una herramienta y no la palabra del agente.
- **Límite:** `registro-agente.mjs` está en Factory-GSG, que esta sesión no puede leer. Su control por palabras no se
  verificó, y **ninguna mejora de este documento lo toca**. La conclusión vale igual: una lista de palabras compara
  texto, no hechos. Las mejoras 1, 2 y 7 lo reemplazan por comprobaciones de herramienta, pero la decisión de
  retirarlo se toma en Factory-GSG.

### C5 · Recorridos y UAT
- `scripts/qa/mia-recorrido.mjs:669` sale con 1 si algo falla, así que es comprobable por herramienta. Pero su último
  cambio es `8de40c9` (04/11) y **no está en `gates.yml`**: se pudre en silencio.
- Lo mismo pasa con `test:*-uat` y `test:*-e2e` (`package.json:32-41`), que tampoco están en CI.
- Los cinco hallazgos de UAT (botón de código por WhatsApp, saldo en Cierre, «ahorro» en Finanzas, PIN sin salida)
  **no los ubiqué en `main`**: un grep de «ahorro» en Finanzas no da nada. Quedan como no verificados acá.

---

## 2. Dos lentes: qué cambio hace imposible o visible cada causa

Escala: **impide** > **registra** > **revisa**.

| Causa | a) Agentes que operan el ERP | b) Agentes que lo construyen |
|---|---|---|
| C1 | — | **Impide:** asientos en Serializable con reintento, para que SSI aborte el ciclo con el cierre (patrón de `cierre-mes/acciones.ts:103-108`). Read Committed en el cierre no: rompe la apertura de turno. **Impide:** un test Postgres de dos conexiones con el orden «asiento primero» contra el `cerrarDia` real, que hoy debe fallar; patrón de los `*-postgres.test.ts`. **Impide:** prohibir comentarios de concurrencia sin test que los cite (trinquete de forma). |
| C2 | **Impide:** las lecturas de la consola corren con un cliente de sólo lectura (transacción `READ ONLY`): un GET que escribe revienta. | **Impide:** extender el trinquete de `guardia-negocio.test.ts` a todo `page.tsx` y `route.ts` bajo `/operador` que use `enElNegocio` u `operatorPrisma`. **Registra:** `vencerPedidos` pasa a cron o a acción explícita. |
| C3 | **Impide:** `Capability` del agente = intersección (capacidades del puesto que ocupa) ∩ (operaciones del agente), calculada en `requireCapability` cuando el usuario es de agente. Plata y envíos a terceros, nunca directos. | **Impide:** test de que todo chequeo de rol pase por `capabilities.ts` (sin `role === "OWNER"` sueltos). |
| C4 | **Registra:** toda acción del agente deja `AuditLog` con `actor=agente:<id>` y el puesto, automático y no opcional. | **Impide:** gancho `Stop`/`SubagentStop` que corre `tsc` + tests de la zona y rechaza el cierre si fallan. **Impide:** `PreToolUse` que niega `Edit`/`Write` sobre `*.test.ts` existentes en tareas de arreglo. **Registra:** el informe cita la salida de la herramienta (n/n, hash de captura vista), no el adjetivo. |
| C5 | — | **Impide:** `mia-recorrido` y las UAT por rubro, como trabajo de CI nocturno contra la demo; si fallan, abren una incidencia. Un guion viejo se ve al día siguiente. |

---

## 3. Adaptable: qué ya es configuración y qué está escrito en código

**Lo que ya es configuración (y anda):**
- Rubro: `Tenant.blueprintId` (`src/lib/identidad-rubro.ts:13-16`, «una carnicería nueva no toca una línea de código»).
- Apps por negocio: `FlagsDeApps` (`apps-del-negocio.ts:67`).
- WhatsApp: `BusinessSettings` (`schema.prisma:491`).

**Lo que está escrito en código y debería ser configuración:**

| Qué | Dónde | Efecto |
|---|---|---|
| Zona horaria única | `src/lib/business-config.ts:22` (`BUSINESS_TIMEZONE`, «TODO (G1): pasar a columna por-tenant») | Un negocio fuera de Buenos Aires tiene días de caja corridos. 20 usos de la constante y **82 literales** `"America/Argentina/Buenos_Aires"` fuera de ella (`git grep -n "America/Argentina/Buenos_Aires" -- src ':!*.test.ts' ':!src/lib/business-config.ts' \| wc -l`): pasar la constante a dato no alcanza. |
| Margen entre turnos | `business-config.ts:15` (`BUFFER_MIN = 10`) | Igual para todos los rubros. |
| Mapa rol→capacidad y roles fijos | `src/lib/capabilities.ts:7-11`; `schema.prisma:93-99` (3 roles; `ENCARGADO` y `REPARTIDOR` comentados) | Un puesto nuevo (encargado, agente) exige migración y código. No hay «puesto» configurable. |
| Corte por slug de CH | `palabras-del-negocio.ts:5`, `settings.ts:46`, `(site)/layout.tsx:69`, `apps-del-negocio.ts:87` (`"beauty-spa"`) | El vocabulario y la protección de CH dependen del nombre en la URL, no de un dato. Es el mismo error que `identidad-rubro.ts:6-10` ya corrigió para MAGRA. |
| Chequeos de rol sueltos | `caja/cierre-diario.ts:716-718` | La regla no sale del mapa. |

**Propuesta de forma:** un «puesto» como dato por negocio (nombre + capacidades + topes). El agente ocupa un puesto
igual que una persona. Así C3 se resuelve en el mismo cambio.

---

## 4. Arnés

**Por dónde actúa hoy un agente sobre el ERP:**
1. Navegador sobre la demo, con Playwright (`scripts/qa/mia-*.mjs`): clic por clic, sin tipos y con el OK en texto.
2. Consola de la cuadrilla `[cuadrilla]`: hilo, excepciones y pedidos, con permisos propios (`permisos.ts`).
3. Código: los agentes que construyen editan el repo, con 123 archivos de server actions que se escriben a mano.

No hay API ni MCP para agentes: en `src/app/api` no hay nada para ellos, y `src/lib/proyectos/ia.server.ts` es IA de
producto.

**Qué evitaría una capa de herramientas tipadas.** Serían acciones de negocio con esquema, que adentro llaman a
`requireCapability` del puesto, a la guardia del negocio, al candado de período y a `audit()`:
- **C2:** la herramienta no existe sin guardia, así que no hay `page.tsx` que escriba.
- **C3:** el permiso es el del puesto, sin rol libre.
- **C4 (lado operación):** el registro es automático, y la herramienta devuelve el resultado verificado (id, total
  asentado) en lugar de la palabra del agente.
- **UAT:** el agente no se pierde en una pantalla sin salida; un callejón aparece como error tipado.

**No evitaría:** C1 (concurrencia: hace falta el test) ni el informe inflado del constructor (eso se arregla con
ganchos).

**Recomendación:**
- **Ahora, nada nuevo encima de Claude Code: configurarlo.** Ganchos `Stop`/`SubagentStop` con verificación real,
  `PreToolUse` que proteja los tests y CI nocturno de recorridos. Es configuración de `.claude/settings.json` y
  `gates.yml`, de tamaño S/M, y ataca C4 y C5, que son la mayoría del anexo.
- **Después, y lo decide el dueño:** una capa de acciones tipadas del ERP (un MCP interno o un módulo
  `src/lib/acciones-agente/`) sólo para agentes que **operan**, empezando por 5-10 acciones de la consola. Es
  arquitectura. No conviene construir un arnés propio que reemplace a Claude Code: duplica lo que dan los ganchos.

---

## 5. Bucle Ralph

**Fuente oficial.** El plugin se llama hoy **`ralph-loop`**, en `anthropics/claude-plugins-official`. En
`anthropics/claude-code/plugins` no está: da 404, y su README apunta al repo oficial. Archivos leídos:
- https://github.com/anthropics/claude-plugins-official/tree/main/plugins/ralph-loop
- https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/plugins/ralph-loop/README.md
- https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/plugins/ralph-loop/hooks/hooks.json
- https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/plugins/ralph-loop/hooks/stop-hook.sh
- https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/plugins/ralph-loop/scripts/setup-ralph-loop.sh
- https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/plugins/ralph-loop/commands/ralph-loop.md
- https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/plugins/ralph-loop/commands/cancel-ralph.md

**Cómo funciona:**
- Es un gancho `Stop` que bloquea el cierre y vuelve a darle al agente el mismo prompt. El estado vive en
  `.claude/ralph-loop.local.md`.
- Opciones:
  - `--max-iterations`: por defecto 0, que es **ilimitado**.
  - `--completion-promise`: el fin es **una cadena de texto** que el agente escribe en `<promise>…</promise>`.
- **No verifica nada con herramientas** y **no tiene tope de US$**.
- El README lo recomienda para tareas «with automatic verification (tests, linters)» y no para «human judgment» ni
  «production debugging».

**Choque con lo que nos pasó.** El fin por promesa es exactamente C4: el agente declara que terminó. Usado tal cual,
Ralph multiplica el control por palabras que ya se eludió 9 veces.

**Condiciones para sumarlo al arnés:**
1. **Fin comprobado por herramienta:** el gancho `Stop` propio corre `tsc` + los tests nombrados (+ `gates` relevantes)
   y sólo deja salir con todo verde. La promesa de texto, como mucho, es necesaria pero nunca suficiente.
2. **Topes:** `--max-iterations` obligatorio (≤ 10) y tope de US$ por vuelta acumulada, medido con
   `medir-consumo.mjs`. Si se pasa, el bucle corta y escribe un relevo.
3. **Tests bloqueados:** antes de la primera vuelta se fija el hash de los `*.test.ts` de la tarea; un `PreToolUse`
   niega su edición, y el gancho de fin verifica el hash. Si no, el atajo es reescribir el test.
4. **Riesgo de atajo, más allá del test:** `skip`, `todo` y `.only` ya los ataja `gates.yml:126-131`. Faltan los
   casos que se desactivan con `if` y las aserciones debilitadas: el diff de tests tiene que ser vacío, y se revisa
   como cualquier otro diff.

**Dónde sí:** arreglos con test rojo ya escrito por otra persona o agente. Por ejemplo, el test de dos conexiones de
C1 una vez escrito (el arreglo de plata va igual con certificación), o poner verdes `tsc` o `lint` en una zona, o ajustar `mia-recorrido` a la UI actual, con el
recorrido como condición de fin.

**Dónde no:**
- Plata (caja, cierre, cobros, ARCA), seguridad, multi-tenant y migraciones. Ahí el «test verde» no prueba la
  invariante (C1 lo demuestra), así que queda **fuera de Ralph sin una certificación aparte**.
- Diseño, UAT de criterio y producción.

---

## 6. Propuesta: 10 mejoras ordenadas por errores evitados / costo

**A** = arquitectura (frente nuevo, decide el dueño).

| # | Mejora | Evita | Tamaño | Riesgo |
|---|---|---|---|---|
| 1 | Gancho `Stop`/`SubagentStop` que corre `tsc` + tests de la zona y bloquea el cierre si no da n/n verde; el informe pega esa salida | C4 (informes inflados, OK de palabra) | S | Bajo: más tiempo por cierre |
| 2 | `PreToolUse` que niega editar `*.test.ts` existentes en tareas de arreglo, más un hash de tests en el gancho de fin | C4, atajo de Ralph | S | Bajo: un test legítimo nuevo va en otro archivo |
| 3 | Test Postgres de dos conexiones con orden «asiento primero» contra el `cerrarDia` real (completa `t01-plata-postgres.test.ts:314-342`); asientos en Serializable con reintento; corregir el comentario de `periodo-cerrado.server.ts:10-12` | C1 (plata) | M | Alto: plata, va con certificación |
| 4 | Trinquete de `guardia-negocio.test.ts` extendido a `page.tsx` y `route.ts` de `/operador`, más lecturas de consola en transacción `READ ONLY`; `vencerPedidos` fuera del render | C2 | S-M | Medio: puede marcar páginas existentes |
| 5 | `mia-recorrido` y las UAT por rubro en un CI nocturno contra la demo, con incidencia si fallan | C5 (guion viejo, callejones sin salida) | M | Bajo: costo de minutos de CI |
| 6 | Los 14 archivos que escriben en caja sin candado (lista en C1, empezando por `libro-caja-actions.ts:321,519`) pasan por un único camino de asiento, con candado y Serializable. El candado solo no cierra la carrera | C1 | M-L | Alto: plata, con certificación |
| 7 | Captura «mirada» = hash de captura + archivo de veredicto que escribe el verificador visual; el informe sin hash no pasa | C4 (166/214 sin mirar) | S | Bajo |
| 8 | Extender el guardián de `matriz-permisos.test.ts:149` a las comparaciones `role === "..."` como trinquete: congela los 69 actuales, impide nuevos y se migran de a poco a capacidades | C3 | M | Medio: 69 sitios, varios de plata |
| 9 | **A** · «Puesto» como dato por negocio, y el agente ocupa un puesto; capacidad del agente = puesto ∩ operaciones del agente; `BUSINESS_TIMEZONE`/`BUFFER_MIN` y corte `beauty-spa` pasan a datos | C3, adaptabilidad | L | Alto: migración (Gate 2) y permisos |
| 10 | **A** · Capa de acciones tipadas para agentes que operan (guardia + permiso del puesto + candado + `audit()` adentro), empezando por la consola | C2, C3, C4 (operación), UAT | L | Medio: superficie nueva, necesita certificación de seguridad |

Ralph entra **después de 1 y 2**: sin ellos es un amplificador de C4.

**Límite:** ninguna mejora toca `registro-agente.mjs` (está en Factory-GSG; ver C4).

---

## Chequeos de omisión contra la fuente

1. **Comentario de C1:** releí `[t01] periodo-cerrado.server.ts:8-13` contra `rls.ts:209,221-222` y
   `cierre-diario-actions.ts:786-812`. La foto queda antes del candado, así que la afirmación «lo cuenta» no se
   sostiene con Serializable. Confirmado.
2. **Camino de C2:** seguí `page.tsx:30 → :51 → cargar.ts:25 → pedidos-core.ts:121-133 → :100-116` y busqué
   `requireOperadorParaNegocio`.
   - **Corrección del vigilante:** la primera búsqueda había corrido sobre `main`. Rehecha sobre la rama
     (`git grep OperadorParaNegocio origin/mia-062/consola-cuadrilla` en `3a64a7c`): 0 apariciones en `page.tsx`, y sí
     en `actions.ts:40,62,93,109`. Las acciones tienen la guardia; el render que escribe, no. Confirmado. Las líneas del anexo (29/42) están
   corridas 1 respecto de la rama.
3. **Ralph:** el fin es `<promise>` comparado como texto en `stop-hook.sh`, el defecto es ilimitado y no hay tope de
   US$, según la fuente oficial. Confirmado. El nombre del anexo (`ralph-wiggum`) ya no existe en el repo oficial.

**No verificado en este repo:** `registro-agente.mjs` (Factory-GSG, fuera de alcance), las cifras de capturas y costos, y los cinco hallazgos de UAT
de MIA (no están en `main`).
