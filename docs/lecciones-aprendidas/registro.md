# 📓 Registro de Lecciones Aprendidas — calibración de PMO y Arquitecto (GSG)

> **Qué es:** la **memoria de lo que ya nos pasó**, destilada en lecciones + **guardarraíles** concretos
> para que **no vuelva a pasar**. Es **lectura obligatoria de calibración** para el **PMO** (autor de
> planes) y el **Arquitecto de Solución** (ejecutor), y **para cualquier célula antes de tocar un área de
> riesgo** (Prod/Deploy, Datos/DB, Multi-tenant, Seguridad).
>
> **Se alimenta de la retro (ADR-047):** en **cada cierre de sprint** la cadencia (a) **suma o actualiza**
> una entrada; la consolidación (b) las destila. Este registro **crece**; no es una foto congelada.

**Formato fijo de cada entrada:**
`[ID] Síntoma → Causa raíz → Fix aplicado (commit) → Lección → Guardarraíl → Refs`.
Un guardarraíl es una **regla concreta y verificable**, no un consejo. Categorías (prefijo del ID):
**PD** Prod/Deploy · **DB** Datos/DB · **MT** Multi-tenant · **DX** Demo/UX · **MP** Metodología/Proceso · **SEC** Seguridad.

## Índice
- **PD** — PD-1 build lento ≠ colgado · PD-2 gates humanos · PD-3 cron Hobby · PD-4 GitHub App en la org
- **DB** — DB-1 seed/deleteMany contra prod · DB-2 `modules:[]` · DB-3 `migrate deploy` aplica todas · DB-4 overbooking TOCTOU
- **MT** — MT-1 `findFirst` sin `where` · MT-2 home con acción admin-gated · MT-3 resolución fail-closed · MT-4 ruteo por hostname · MT-5 RLS = aislamiento + performance
- **DX** — DX-1 backoffice-demo sin password · DX-2 falta sello GSG · DX-3 previews estáticos · DX-4 CTA WhatsApp roto · DX-5 réplica exacta a ojo vs. relevada · DX-6 relación seedeada uniforme = front miente por entidad · DX-7 fix de dato de prod sin seed/deleteMany (dry-run→apply→verify)
- **MP** — MP-1 sync file-tool↔bash · MP-2 tree compartido / commit-race · MP-3 congestión ≤4 · MP-4 subagentes en Opus · MP-5 FASE 0 · MP-6 `npm install` por worktree · MP-7 higiene de contexto · MP-8 sin tests · MP-9 modelo mal etiquetado · MP-10 reconciliar rama vieja = selectivo (no `git merge`)
- **SEC** — SEC-1 secretos nunca en chat + rotación · SEC-2 rol con BYPASSRLS · SEC-3 firma de webhook + rate-limit

---

## PD — Prod / Deploy

**[PD-1] Build de Vercel "colgado"**
- **Síntoma:** el build de Vercel parece colgado / no termina.
- **Causa raíz:** el **prerender de rutas que tocan la DB** es lento; no está colgado, está trabajando.
- **Fix:** entender que tarda; `/demo` es `force-static` (sin DB) para el primer link vivo.
- **Lección:** build lento ≠ build roto; el prerender contra DB tarda.
- **Guardarraíl:** rutas públicas/demo **`force-static` sin DB**; **no matar** un build por lento — revisar logs antes.
- **Refs:** ADR-031, `docs/metodologia/demo-publica-costo-cero.md`.

**[PD-2] Deploy/migración corridos "solos"**
- **Síntoma:** riesgo de publicar o migrar prod sin querer.
- **Causa raíz:** confundir "push a `main`" con "deploy"; ambos son cosas distintas.
- **Fix:** Gate 1 (deploy = *"deployá"* del dueño) y Gate 2 (`migrate deploy` = OK Neon del dueño).
- **Lección:** push a GitHub es libre; **publicar y tocar la DB son acción humana del dueño**.
- **Guardarraíl:** **nunca** deploy ni `migrate deploy` sin OK explícito; lo irreversible se **eleva** (ADR-048/049).
- **Refs:** ADR-048, ADR-049, `CLAUDE.md` → "Autorización y gates".

**[PD-3] Cron horario rompe el deploy en Vercel Hobby**
- **Síntoma:** el deploy falla al configurar un cron `0 * * * *`.
- **Causa raíz:** Vercel **Hobby** no permite cron sub-diario.
- **Fix:** cron **diario** (`0 12 * * *`).
- **Lección:** el plan free tiene límites que rompen el deploy, no solo el runtime.
- **Guardarraíl:** en Hobby, **cron diario**; si hace falta sub-diario → **parar y avisar** (es gasto).
- **Refs:** `docs/metodologia/demo-publica-costo-cero.md` (errores típicos).

**[PD-4] "Vercel no ve el repo"**
- **Síntoma:** al importar en Vercel, el repo no aparece; el dueño "no encuentra dónde dar acceso".
- **Causa raíz:** la GitHub App de Vercel estaba en la **cuenta personal**, pero el repo vive en la **org**.
- **Fix:** autorizar la app **a nivel de la organización** dueña del repo.
- **Lección:** el permiso vive **donde vive el repo** (la org).
- **Guardarraíl:** instalar la GitHub App en el **scope de la org**, no en la cuenta personal.
- **Refs:** `docs/metodologia/demo-publica-costo-cero.md`.

## DB — Datos / DB

**[DB-1] Un seed/`deleteMany` contra prod borra todo**
- **Síntoma:** riesgo de **wipe** de datos reales (Neon es producción).
- **Causa raíz:** `deleteMany`/seed **sin scope** corre sobre toda la tabla; los seeds no son para datos vivos.
- **Fix:** regla **surface-before-overwrite** + borrado **scopeado por `tenantId`** (ADR-036).
- **Lección:** la base es **prod real**; ninguna operación de datos es "de prueba".
- **Guardarraíl:** **NUNCA seed contra prod**; `deleteMany` **siempre** con `where { tenantId }`; migraciones = **carpeta SIN aplicar** (Gate 2); **destructivo bloqueado** por config.
- **Refs:** ADR-036, ADR-019, `CLAUDE.md` (gates).

**[DB-2] Contador de módulos en 0 (OP-2)**
- **Síntoma:** el backoffice mostraba **0 módulos** para el tenant.
- **Causa raíz:** el campo `modules` del tenant estaba **`[]`** en la DB (alta incompleta).
- **Fix:** poblar `modules` en el alta del tenant.
- **Lección:** un array vacío **silencioso** rompe la UI sin error; los datos del tenant deben reflejar sus capabilities.
- **Guardarraíl:** el alta/preset **valida `modules` no vacío**; el probador **falla ruidoso** si faltan.
- **Refs:** QA `docs/calidad/` OP-2; ADR-034 (preset).

**[DB-3] `migrate deploy` aplica TODAS las pendientes**
- **Síntoma:** correr `migrate deploy` por "una" migración aplica **todas** las pendientes.
- **Causa raíz:** `migrate deploy` no es selectivo.
- **Fix:** `predeploy-check` antes; aplicar **solo** con OK del dueño (Gate 2).
- **Lección:** no hay "aplicar una sola"; es todo o nada.
- **Guardarraíl:** verificar pendientes con `predeploy-check`; **Gate 2** (owner) antes de `migrate deploy`.
- **Refs:** `docs/metodologia/demo-publica-costo-cero.md`, ADR-018.

**[DB-4] Doble reserva (overbooking TOCTOU)**
- **Síntoma:** dos reservas del mismo cupo bajo concurrencia.
- **Causa raíz:** `check-then-insert` en `ReadCommitted` → carrera *time-of-check/time-of-use*.
- **Fix:** transacción **`Serializable`** ya; `EXCLUDE USING GIST` cuando el plan lo permita.
- **Lección:** "chequear y después insertar" **no** es atómico; la BD debe imponer la exclusión.
- **Guardarraíl:** invariantes de unicidad/exclusión **en la BD** (constraint/serializable), no en la app.
- **Refs:** ADR-004, ADR-023.

## MT — Multi-tenant

**[MT-1] Todos los tenants mostraban la marca de CH (J-2)**
- **Síntoma:** `getTenantBrand` devolvía **CH** para cualquier tenant.
- **Causa raíz:** `findFirst` **sin `where`** → devuelve la **primera fila** (la más vieja = CH).
- **Fix:** agregar `where { tenantId }`.
- **Lección:** `findFirst`/`findFirstOrThrow` **sin predicado de tenant** es un **leak cross-tenant silencioso** (mismo patrón que ADR-015).
- **Guardarraíl:** **toda** query lleva predicado `tenantId`; **prohibido `findFirst` sin `where`**; RLS como backstop.
- **Refs:** QA J-2; ADR-015, ADR-018, ADR-023.

**[MT-2] La raíz del tenant redirigía a login (C-1)**
- **Síntoma:** la home de CH hacía **redirect a login** en vez de mostrar la vidriera.
- **Causa raíz:** la raíz llamaba a **`getCatalog` admin-gated** (capability), no a la vista pública.
- **Fix:** la raíz usa la **vista pública**; login no-branded corregido (commit `21c70d0`).
- **Lección:** una **superficie pública** no puede depender de una acción **gateada por rol**.
- **Guardarraíl:** separar **data pública** de **data admin-gated** en las home de tenant; el Gate (role-based §1) lo chequea.
- **Refs:** QA C-1; ADR-040 (Gate, role-based).

**[MT-3] Con 2 tenants, resolvía "el más viejo" en silencio**
- **Síntoma:** una 2ª fila en `Tenant` haría que todo el tráfico leyera/escribiera el tenant equivocado.
- **Causa raíz:** `getCurrentTenantId()` hacía `findFirstOrThrow(orderBy asc)` + cache.
- **Fix:** **fail-closed** — `throw` si hay ≠ 1 tenant.
- **Lección:** sin RLS, "no hay 2º tenant" es una **precondición de seguridad**; se **afirma con un assert ruidoso**, no se asume.
- **Guardarraíl:** resolución de tenant **fail-closed**; el alta del 2º tenant **dispara RLS** (Gate).
- **Refs:** ADR-015, ADR-018.

**[MT-4] Home pelada con >1 tenant: ¿a quién sirvo?**
- **Síntoma:** la URL raíz del proyecto (sin mapa) con varios tenants no sabe a quién servir.
- **Causa raíz:** las URLs `.vercel.app` **no** son subdominios de un dominio común → el ruteo por subdominio no las resuelve.
- **Fix:** `TENANT_HOST_MAP` (hostname→tenant) + **fail-closed 500**; `APP_BASE_DOMAIN` **vacío** en demo.
- **Lección:** rutear por **hostname exacto**; ante ambigüedad, **fallar cerrado**, no adivinar.
- **Guardarraíl:** mapear cada host; **nunca `APP_BASE_DOMAIN=vercel.app`**; home pelada solo para `/demo`.
- **Refs:** ADR-029, ADR-015.

**[MT-5] Índices compuestos que no rendían**
- **Síntoma:** queries de agenda/dashboard/reportes lentas pese a los índices que lideran con `tenantId`.
- **Causa raíz:** las queries **no filtraban por `tenantId`** → el índice compuesto no se enciende.
- **Fix:** activar **RLS**, que **inyecta el predicado** `tenantId` y enciende los índices.
- **Lección:** **RLS no es solo aislamiento: también es performance** (fuerza el predicado).
- **Guardarraíl:** toda query con predicado `tenantId` / `tenantTransaction`; RLS enforced en prod (Gate 2).
- **Refs:** ADR-023, ADR-018.

## DX — Demo / UX

**[DX-1] Cómo mostrar el backoffice sin fricción (J-1/J-3)**
- **Síntoma:** el prospecto no podía navegar el backoffice de demo (o requería password).
- **Causa raíz:** la demo mezclaba "operación real" (login/datos) con "mostrar el producto".
- **Fix:** **backoffice-demo sin password + datos ficticios + toggle de persistencia**; puerta visible `/probar` + banner gateado por flag (commit `43aab61`), fixtures por rubro.
- **Lección:** la demo navegable exige backoffice **accesible sin fricción pero aislado** (sin datos reales).
- **Guardarraíl:** demo = **FASE 1 sin secretos**; **toggle de persistencia** separa demo de operación; **nunca datos reales** en demo.
- **Refs:** ADR-031, ADR-041; QA J-1/J-3.

**[DX-2] Entregable sin sello GSG (OP-3)**
- **Síntoma:** un entregable salió **sin el sello de marca GSG**.
- **Causa raíz:** `metadata.generator` + crédito en footer del backoffice **no cableados**.
- **Fix:** cablear el sello (metadata + footer del backoffice).
- **Lección:** el sello es el **bloque 2 del Gate**, obligatorio en **todo** entregable.
- **Guardarraíl:** **sin sello no se integra** (Gate bloque 2); sello **en el backoffice/metadatos**, nunca sobre la vidriera del tenant.
- **Refs:** QA OP-3; ADR-043, ADR-040.

**[DX-3] Confundir la lámina estática con el producto**
- **Síntoma:** `public/previews/*` estáticos se trataban como el entregable del negocio.
- **Causa raíz:** los previews estáticos eran un stopgap que divergía del producto real.
- **Fix:** **consolidado = tenant real** (front+back) en su URL; **demo = app del flujo**; **deprecar** previews.
- **Lección:** un artefacto paralelo al producto **miente** y se desincroniza.
- **Guardarraíl:** el entregable **es la app real**; no mantener láminas paralelas; retirar el preview al servir el producto real.
- **Refs:** ADR-028, `docs/PLAN-RECONVERSION-CLIENTES.md`.

**[DX-4] CTA de WhatsApp roto**
- **Síntoma:** el botón de WhatsApp de adosmanos estaba **roto**.
- **Causa raíz:** número/placeholder **hardcodeado** en el front.
- **Fix:** **prompt just-in-time** si falta el dato + **helper único** `whatsapp-cta`.
- **Lección:** un placeholder inventado en el front queda roto en producción.
- **Guardarraíl:** **cero placeholders de WhatsApp**; el link/intent sale del **helper único** (una fuente de verdad).
- **Refs:** ADR-037.

**[DX-5] "No es la copia de la web real, hay que afinar el lápiz" (Magra)**
- **Síntoma:** el dueño detectó que el front replicado (`SiteReplica.tsx` + `magra-replica.ts`) no se sentía
  fiel al sitio real (`magrameatmarket.com.ar`), y por separado que el tenant en vivo mostraba dirección/IG/
  horario **genéricos del rubro** en vez de los reales.
- **Causa raíz:** dos causas independientes, confundidas como una sola. **(1)** la transcripción de contenido
  se hizo la 1ª vez sin un **diff explícito** contra el sitio real (faltaba 2ª frase del hero, sufijo
  "envasado/a al vacío", Facebook, teléfono, sección "ABOUT US", copyright). **(2)** el **Branding
  (BusinessSettings) en Neon** nunca se actualizó con los valores reales ya escritos en el runbook de alta
  (`docs/tenants/magra/provisioning-magra.md`) — quedó en los placeholders del rubro `carniceria`.
- **Fix:** préstamo de pool (Diseño + Adaptador/Delivery + QA, ADR-053) hizo el diff **con navegador real**
  (accessibility tree + `innerText` de header/footer vía JS — un `WebFetch` de texto plano **no** agarra
  header/footer, que quedan fuera del `<article>` principal) y completó `magra-replica.ts`/`SiteReplica.tsx`
  (commit `32924c4`). El gap de Branding en Neon queda **pendiente del dueño** (Gate 2, dato de prod, no lo
  toca el front).
- **Lección:** "copia exacta" no es relevar a ojo ni un `WebFetch` superficial del texto principal — hay que
  extraer el DOM real completo (header/footer suelen quedar fuera de lo que agarra un fetch de texto) y
  **separar dos capas que se confunden fácil**: contenido de marketing (literal, vive versionado en el
  archivo réplica del tenant) vs. **dato de negocio** (Branding en DB, lo carga el alta/Adaptador — si el
  front está bien pero se ve "genérico" en producción, revisar esto ANTES de tocar el código).
- **Guardarraíl:** en todo cliente "réplica exacta" — **(a)** extraer el sitio real con navegador (tree +
  `innerText` de header/footer), no solo `WebFetch`; **(b)** correr el checklist de réplica exacta
  (`auditoria-sap-fiori.md` §Excepción) ítem por ítem contra el sitio real, no de memoria; **(c)** un préstamo
  de pool (ADR-053) que toca un tenant existente **primero verifica si el gap es código o dato de Neon** antes
  de asumir que hay que reescribir el front.
- **Refs:** ADR-042, ADR-043, ADR-053 (este caso = ejemplo canónico del ADR), `docs/metodologia/auditoria-sap-fiori.md`
  §Excepción réplica exacta, `docs/tenants/magra/provisioning-magra.md`.

**[DX-6] Una relación seedeada uniforme hace que el front "mienta" por entidad**
- **Síntoma:** en la home de CH (faro), las **3 profesionales** mostraban **la misma** lista de
  servicios y encima solo de depilación — Carolina (faciales/estética) aparecía como si solo depilara.
- **Causa raíz:** la relación **profesional↔servicio** en Neon quedó cargada **igual para todas** — el
  **import del catálogo real** (las 149 altas) conectó a **cada profesional con casi todo** el catálogo
  (Carolina 72, Macarena 72, Romina 86 sobre 70 activos), no el `prisma/seed.ts` (que **sí** asigna
  distinto por persona). El render `p.services…slice(0,4)` cae en los primeros por id (los de depilación).
  La UI "carga bien" (no hay error) pero **representa mal la realidad** — capa de DATO, no de layout.
- **Fix:** ✅ **aplicado 2026-07-07** (OK del dueño, patrón DX-7). Reasignación **diferenciada** por
  profesional, scoped al `tenantId` de CH, tocando **solo** la join `_ProfessionalServices` con
  `professional.update({ services: { set } })` — **sin seed, sin deleteMany**. Dry-run con diff →
  `--apply` → verificación por categoría: Carolina Faciales+Cejas+Corporal+Capacitaciones (39, sin
  depilación) · Macarena Depilación+Masajes (24) · Romina Manos+Spa de pies+Cejas+Depilación (29); las 8
  categorías activas quedan cubiertas (ningún servicio huérfano). Aproximación **plausible y distinta**,
  no el mapeo exacto real (relevamiento fino sigue pendiente con la clienta si se quiere afinar).
- **Lección:** que una entidad "cargue" no implica que **su relación refleje lo real**; un **import que
  conecta todo-con-todo** (o un seed uniforme) produce entidades **idénticas y falsas** sin ningún error
  (primo de DB-2 "array vacío" y DX-5 "front no refleja lo real"). Verificar **por entidad**, no en
  agregado. Cuando no hay mapeo real, una asignación **diferenciada y coherente** ya evita que el front
  mienta; el relevamiento exacto puede afinarse después sin bloquear el fix.
- **Guardarraíl (mejora de proceso — MEJORAR EL ALTA):** (1) el **provisioning/import de catálogo real**
  **captura y aplica la asignación por profesional** (nunca `connect`-a-todo ni dejar vacío) — es parte
  del relevamiento, no un default; si el mapeo real no está, sembrar una **asignación diferenciada por
  categoría**, jamás uniforme. (2) El **alta/preset valida** que las relaciones N–N por entidad sean
  **reales y distintas** (no todas iguales, no todas vacías). (3) **QA valida por-entidad** (equipo,
  catálogo por profesional) **caso por caso** contra lo esperado del rubro — chequeo explícito "¿los sets
  por profesional son distintos y coherentes?" —, no solo que la sección aparezca.
- **Refs:** QA `docs/calidad/reporte-qa-productos-2026-07-07.md` A-1 (RESUELTO); DX-7 (patrón del fix),
  DB-2, DX-5.

**[DX-7] Fix de dato de prod con guardarraíl "sin seed/sin deleteMany" necesita su propio patrón de 3 fases**
- **Síntoma:** Magra en vivo tenía **branding genérico del rubro** (dirección/IG/horario de placeholder,
  DX-5) y **catálogo con cortes inventados** en vez del real (M-2/M-3, con OK del dueño, Gate 2). Había que
  corregirlo en Neon sin las herramientas existentes: `provisionTenant` es **create-only** (no pisa lo que
  ya existe) y el seed de `prisma/seed.ts` es **destructivo** (DB-1) — ninguno de los dos sirve para
  "corregir un dato puntual de un tenant que ya existe".
- **Causa raíz:** faltaba un patrón intermedio entre "alta nueva" (aditivo, create-only) y "seed de demo"
  (destructivo): un **fix de dato puntual** sobre un tenant existente, en prod, sin recrear ni borrar nada.
- **Fix:** script versionado `scripts/fix-magra-data-2026-07-07.ts` — dry-run **por default** (imprime diff
  actual→propuesto campo por campo, no escribe), `--apply` explícito recién después de revisar el diff, y
  un **re-dry-run posterior** que debe dar 0 cambios (prueba de idempotencia = el fix quedó completo). Todo
  `UPDATE`/`CREATE` puntual, **scoped por el `tenantId` de un único tenant** (resuelto por slug, nunca
  iterando tenants); lo sin equivalente real confirmado se **desactiva** (`active:false`), nunca se borra.
  En la 1ª pasada, mapear el catálogo existente **mirando el preview truncado** (no una query completa a la
  DB) dejó 2 productos genéricos sin cubrir ("Asado de tira", "Pollo entero") — se detectó recién al
  **verificar visualmente el resultado** en el preview, no solo leyendo el log de éxito del script, y se
  corrigió con una 2ª pasada dry-run→apply.
- **Lección:** un guardarraíl "nunca seed/nunca deleteMany" no alcanza solo, necesita **su propio patrón**
  (dry-run con diff explícito → apply → re-dry-run de verificación) y un **relevamiento exhaustivo del
  estado actual vía DB**, no vía una vista parcial (preview/UI truncada) — mismo espíritu que DX-6: lo que
  "carga bien" puede no representar lo real si el mapeo de origen quedó incompleto.
- **Guardarraíl:** todo fix de dato de prod (no-migración) usa **script versionado** con dry-run default +
  `--apply` explícito; el diff se imprime **campo por campo** antes de escribir; **scope por `tenantId`** de
  un único tenant, nunca loop entre tenants; lo no confirmado se **desactiva**, nunca se borra; tras aplicar,
  **correr el mismo script en dry-run de nuevo** (debe dar 0 cambios) y **verificar el resultado final por
  una vía independiente** (preview/DB), no solo el log del script.
- **Refs:** ADR-018 (aislamiento `tenantId`), ADR-019 (provisioning aditivo/idempotente), DB-1 (seed
  destructivo), DX-5, DX-6; `docs/tenants/magra/provisioning-magra.md`.

## MP — Metodología / Proceso

**[MP-1] Archivos corrompidos al editar**
- **Síntoma:** contenido corrupto/duplicado al modificar un archivo.
- **Causa raíz:** **mezclar** herramientas de escritura (file-tool y `bash`/redirect) sobre el mismo archivo.
- **Fix:** una sola vía de escritura por archivo; para `bash`, **heredoc**; edición por file-tool consistente.
- **Lección:** alternar mecanismos de escritura corrompe el estado del archivo.
- **Guardarraíl:** **no alternar** file-tool ↔ bash en el mismo archivo; para shell usar **heredoc**.
- **Refs:** golden rule operativa.

**[MP-2] Sesiones pisándose en el tree compartido**
- **Síntoma:** WIP ajeno mezclado; riesgo de commitear/clobberear trabajo de otra sesión (teardown de canon).
- **Causa raíz:** **varias sesiones sobre el MISMO working tree**; `git add -A` arrastra lo ajeno.
- **Fix:** **commit por pathspec**, nunca `-A`; **verificar origin** en una tirada; **worktree temporal** para editar canon sin clobber.
- **Lección:** en tree compartido, lo no commiteado **no es canon**; no ratificar WIP ajeno.
- **Guardarraíl:** **pathspec siempre, nunca `-A`**; editar sobre `origin/main` en worktree descartable; una vez en `origin/main` es permanente.
- **Refs:** ADR-039; memoria commit-race.

**[MP-3] "Servicio ocupado" por congestión**
- **Síntoma:** abrir muchas sesiones a la vez **satura el servicio** y frena todo.
- **Causa raíz:** sin tope de concurrencia.
- **Fix:** **tope ≤ 4** sesiones + **olas chicas** + prioridades **P1/P2/P3**.
- **Lección:** más paralelo no es más throughput si satura el servicio.
- **Guardarraíl:** **≤ 4 corriendo**; en congestión **solo P1** (demos/venta); P2 espera, P3 pausado.
- **Refs:** ADR-032.

**[MP-4] Subagentes gastando de más (Opus por herencia)**
- **Síntoma:** subagentes corriendo en **Opus por herencia** → gasto tirado (US$ ~37 medidos).
- **Causa raíz:** el subagente hereda el modelo del padre por default.
- **Fix:** subagentes en **Sonnet/Haiku**; Opus solo para el alto juicio y el Gate.
- **Lección:** el grunt work paralelo **no necesita Opus**.
- **Guardarraíl:** **cada célula etiqueta su modelo explícito**; **subagentes nunca Opus**; Gate GSG siempre Opus.
- **Refs:** ADR-032, `docs/organizacion/factory-reforzada.md`.

**[MP-5] Despachar sin la foto**
- **Síntoma:** errores de migración, cosas dejadas afuera, pérdida de contexto entre sprints.
- **Causa raíz:** despachar frentes **sin relevar el estado** real del repo/prod.
- **Fix:** **FASE 0 obligatoria** → produce/actualiza `docs/ESTADO-ACTUAL.md` antes de despachar.
- **Lección:** sin la foto completa se repiten los mismos errores.
- **Guardarraíl:** **"sin la foto no se despacha"**; FASE 0 no salteable.
- **Refs:** ADR-039.

**[MP-6] Worktree nuevo sin dependencias**
- **Síntoma:** un worktree nuevo no compila/testea; el build de Turbopack rechaza el `node_modules` por junction.
- **Causa raíz:** `git worktree add` **no** trae `node_modules` (gitignore); un junction sirve a `tsc`/test pero **no** al build.
- **Fix:** **`npm install` real** en cada worktree (materializar deps, no copiar/junction).
- **Lección:** cada worktree necesita sus deps propias, instaladas limpias.
- **Guardarraíl:** **`npm install` una vez por worktree**; no copiar `node_modules` ni depender de junctions para el build.
- **Refs:** ADR-039; memoria worktree.

**[MP-7] Contexto que se relee a sí mismo**
- **Síntoma:** costo dominado por el **acarreo de contexto** (86% del gasto); sesiones larguísimas.
- **Causa raíz:** sesiones que no se acotan ni se compactan.
- **Fix:** higiene de contexto (`/compact`, cerrar sesiones largas, células de contexto acotado).
- **Lección:** el gran ahorro está en el **contexto**, no en el swap de modelo.
- **Guardarraíl:** acotar el contexto por célula; compactar/cerrar sesiones largas; el repo es la memoria (no el chat).
- **Refs:** ADR-008, `docs/organizacion/factory-reforzada.md`.

**[MP-8] Sin red de tests, la lógica regresiona**
- **Síntoma:** no había **ningún test automatizado**; solo `tsc`+build+preview.
- **Causa raíz:** la lógica de dominio no estaba protegida contra regresiones.
- **Fix:** harness **`node:test` + `tsx`** (cero deps nuevas), tests al lado del código, lógica pura/mockeada.
- **Lección:** `tsc` no protege la **lógica de negocio**.
- **Guardarraíl:** la lógica de **mayor riesgo** (reserva/fiscal/retención/tenant) va **con tests**; verde antes de commitear.
- **Refs:** ADR-026.

**[MP-9] Frente reversible corriendo en Opus (modelo mal etiquetado)**
- **Síntoma:** F3 (`frente/demo-vendible`) — trabajo **reversible** (demo sin datos reales) — corrió en **Opus**, cuando por norma le correspondía **Sonnet** (Plan de Ventana: Sonnet por defecto, Opus solo Gate/juicio crítico).
- **Causa raíz:** la sesión **no etiquetó/forzó su modelo** al abrir (o heredó Opus del contexto) — se saltó la §4 del Modelo de Trabajo ("cada célula declara y fija su modelo explícito").
- **Fix:** al despachar/abrir cada frente, **fijar el modelo explícito** (`/model sonnet` para ejecución reversible) como Paso 0 junto con la calibración; el PMO **verifica el etiquetado** al despachar.
- **Lección:** un frente reversible en Opus **gasta juicio caro donde no hace falta** — el control (Gate) es lo único que va siempre en Opus, la ejecución reversible va en Sonnet.
- **Guardarraíl:** **ningún frente arranca sin modelo declarado**; reversible → Sonnet; una sesión sin modelo etiquetado está **fuera de norma** y se corrige antes de trabajar.
- **Refs:** ADR-032, ADR-049; `docs/organizacion/asignacion-modelos-sprint.md`; Plan de Ventana 2026-07-08.

**[MP-10] Reconciliar una rama vieja a main = selectivo, no `git merge`**
- **Síntoma:** `gsg-lab` (base 63f54ca, solo ADRs 001-028) estaba **135 commits detrás** de `main` y 82 adelante; un `git merge` habría **regresionado** cosas que `main` sumó después (sello GSG del layout, nav Cockpit, scripts `gates`/`load-test`, `.env.vercel.template`) porque la rama vieja las **borra** en su versión de esos archivos.
- **Causa raíz:** una rama larga y divergente tiene versiones **viejas** de archivos compartidos (config, layout, .gitignore, package.json); traerla entera pisa el trabajo nuevo de `main`.
- **Fix:** reconciliación **selectiva y aditiva** — `git checkout <rama> -- <rutas nuevas>` para lo que no existe en main (carpeta célula, rutas del panel), y **merge quirúrgico archivo por archivo** (Read+diff, agregar solo el delta) en cada archivo compartido; **nunca overwrite** del archivo entero de la rama vieja. Vallas (tsc+test+build) + Gate antes de mergear a main (commit 405a066).
- **Lección:** ante ramas muy divergentes, **diff primero, integrá el delta** — asumí que la rama vieja borra mejoras nuevas y verificá cada archivo compartido antes de traerlo.
- **Guardarraíl:** reconciliar rama vieja → main **por pathspec/delta, no `git merge`**; para cada archivo tocado por ambas, comparar contra `main` y traer **solo** lo nuevo. Colisión de nº de ADR → **renumerar el de la rama** al siguiente libre + arreglar el INDEX.
- **Gotcha de infra:** `robocopy` desde Git Bash **necesita `MSYS_NO_PATHCONV=1`** — sin eso, MSYS convierte `/E` en `E:/` y el copiado falla en silencio (exit 0, 0 archivos). Materializar `node_modules` real (no junction) para el build de Turbopack sigue vigente (MP-6).
- **Refs:** ADR-039, ADR-049; ADR-056 (renumerado desde ADR-028 de la rama); memoria worktree/robocopy.

## SEC — Seguridad

**[SEC-1] Secretos en el chat / credenciales expuestas**
- **Síntoma:** riesgo de pegar un secreto (connection string, password) en el chat o en un campo.
- **Causa raíz:** falta de una regla dura sobre quién y cuándo introduce secretos.
- **Fix:** **dos fases de credenciales** — demo sin secretos; datos reales con secretos que **pega el dueño**, nunca el agente.
- **Lección:** menos manos sobre el secreto = menos superficie de fuga; el secreto no pasa por el chat ni por el repo.
- **Guardarraíl:** **el agente NUNCA toca secretos**; si un secreto se **expuso, se ROTA** de inmediato; el repo lleva solo la **plantilla** (`.env.vercel.template`).
- **Refs:** ADR-041, ADR-031.

**[SEC-2] Un rol de app que evade RLS**
- **Síntoma:** RLS activo pero el aislamiento no se cumple.
- **Causa raíz:** el rol de la app (`app_user`) tenía **`BYPASSRLS`** (inarreglable en ese rol).
- **Fix:** conectar la app con un **rol nuevo sin `BYPASSRLS`** (`app_rls`).
- **Lección:** RLS es tan fuerte como el **rol** con el que conecta la app.
- **Guardarraíl:** la app conecta **siempre** con un rol **sin `BYPASSRLS`**; verificar aislamiento antes del go-live.
- **Refs:** ADR-018; memoria RLS go-live.

**[SEC-3] Webhooks y logins sin defensa**
- **Síntoma:** superficies expuestas (webhook de pago, login) sin verificación ni límite.
- **Causa raíz:** faltaba firma de webhook y rate-limit.
- **Fix:** **firma del webhook MP** (`MP_WEBHOOK_SECRET`) + **rate-limit** en logins (hardening).
- **Lección:** toda superficie pública necesita **autenticación de origen** y **límite de tasa**.
- **Guardarraíl:** verificar **firma** de todo webhook; **rate-limit** en endpoints de auth y API pública.
- **Refs:** memoria Célula 2 hardening.

---

## Cómo se mantiene (ADR-047)
- **Cierre de cada sprint (cadencia a):** cada célula que tocó un área de riesgo **suma o actualiza** una
  entrada (síntoma → … → guardarraíl). Es parte de la **Definición de terminado**.
- **Consolidación (cadencia b):** se **destilan** las entradas nuevas, se **deduplican** y se promueven los
  guardarraíles recurrentes a **regla dura** (CLAUDE.md / Gate / ADR).
- **Nuevos IDs:** siguen el prefijo de categoría; si una lección origina una decisión, se le abre su **ADR** y
  se enlaza acá.

— Elaborado por **Gestión Studio Grow (GSG)**.
