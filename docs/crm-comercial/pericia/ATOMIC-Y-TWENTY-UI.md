# Pericia · Atomic CRM y twenty-ui/twenty-shared (16/11/2026)

Lectura sin ejecutar nada. Rutas relativas a cada repo.
- **Atomic CRM** `marmelab/atomic-crm` @ `aeccb98f`. `LICENSE.md` **MIT**: copiar exige conservar el aviso (Marmelab).
- **Twenty** `twentyhq/twenty` @ `23826377`, sparse. `LICENSE` raíz: núcleo **AGPLv3** (+ archivos `@license Enterprise`). Comprobado en `LICENSE` y `package.json` de cada paquete: **twenty-ui, twenty-shared y twenty-sdk son MIT** (aviso «Twenty.com, PBC»). Del núcleo no se leyó ni se toma nada.

## 1. Modelo (Atomic)
`supabase/migrations/20240730075029_init_db.sql`: companies :1-20, contactNotes :26-33, contacts :39-60, dealNotes :66-73, deals :79-93, sales :99-107, tags :113-116, tasks :122-128.
- **Tomar la idea · `tax_identifier`** en la empresa (:19). Confirma sumar el CUIT.
- **Tomar · `last_seen`** en el contacto (:54). Lo actualiza la nota (`notes/NoteCreate.tsx:90-97`) y da «días sin movimiento». Ellos lo hacen en el cliente, sin atomicidad; nosotros, en la transacción.
- **Tomar · `archived_at`** aparte de la etapa (:90); el tablero filtra lo archivado (`deals/DealList.tsx:84`).
- **Tomar · `status` en la nota** (:32; colores `root/defaultConfiguration.ts:48-53`): «temperatura» del contacto, distinta de la etapa. Nos falta.
- **Tomar · adjuntos en notas** (:33): `ActividadComercial` no tiene.
- **Tomar · CHECK de rango en fechas** (`20261105134224…sql:9`): un año mal tipeado rompía la ficha y trababa el arrastre. Para «fecha límite» y «despertar el».
- **No tomar · arrays de ids** `contact_ids` (:83) y `tags` (:57): sin FK, la unión reescribe arrays. Tabla puente con FK y RLS.
- **Ojo:** `lost_reason` texto libre se agregó y se borró (`20260924…sql:1`, `20260928…sql:1`). Nuestro motivo de catálogo va mejor.
- **Etapas configurables** en JSON singleton (`20260211194545_app_configuration.sql:6-11`, defaults `defaultConfiguration.ts:29-38`); etapa desconocida cae en la 1.ª columna (`deals/stages.ts:13-16`). **No tomar**: las nuestras son máquina de estados con evidencia. **Idea**: etiqueta y color por negocio, código fijo.
- **Orden en la columna:** `index smallint` entero (:93), ordenado en `stages.ts:26-30`.

## 2. Tablero (Atomic)
`deals/DealListContent.tsx`, `DealColumn.tsx`, `DealCard.tsx`; arrastre con `@hello-pangea/dnd` (`package.json:32`).
- **Mover:** cambia el estado local (:58-65), persiste y recarga (:68-70). Persistir es renumerar vecinos con N `update` sueltos en `Promise.all` (:124-244), tras traer la columna con tope de 100 (:135-139).
- **Si falla: nada.** Sin `catch`: lo local queda mal hasta recargar. Sin transacción; dos personas se pisan. Muta arrays con `splice` (:100-101).
- **Separación a medias:** `updateDealStageLocal` (:88) y `updateDealStage` (:124) están fuera del componente, pero usan índices de la librería, y el índice visual de una columna filtrada se mezcla con el guardado (:134).
- **No tomar el código. Idea:** optimista con reversión. Una Server Action `moverOportunidad(id, etapa, antesDe, version)` en `tenantTransaction`, con evidencia (E4) y versión (E2). Posición fraccionaria (un UPDATE) y reordenar en función pura con test. Arrastre HTML5 nativo + «mover a…» por teclado.
- **Tomar · total por columna** (`DealColumn.tsx:15,24-30`); nosotros, ponderado.

## 3. Ficha y actividad (Atomic)
- **Línea de tiempo = vista `UNION ALL`** de 5 tablas, id sintético `tipo.id.created` (`20260314120000_activity_log_view.sql:5-73`), `security_invoker=on` (:6) para respetar RLS, índices (:76-79), scroll infinito (`activity/ActivityLog.tsx:20-26`). **Idea** para unir lo que vive en otras tablas (borradores, pases, pedidos). Sólo registra altas, no cambios: a nosotros nos falta eso.
- **Tareas:** vencimiento opcional (`20260127140209_imports.sql:15`). Grupos vencidas/hoy/mañana/semana/después (`tasks/tasksPredicate.ts:23-48`, `TasksListByDueDate.tsx:105-132`). La recién hecha sigue visible 5 min (`tasksPredicate.ts:19-21`). **Tomar** para «Hoy», con reloj inyectado.
- **CSV:** `dataImport/`. Empresa por nombre con caché (`useCompanyResolver.ts:8-30`). Cuenta lo que entró de verdad con `allSettled` para no reimportar y duplicar (`createEachRow.ts:1-21`). **Idea** del conteo honesto. **No** resolver por nombre: dominio o CUIT (E1). Por §3, ningún agente importa.
- **Duplicados:** candidato por nombre y apellido exactos (`contacts/ContactMergeButton.tsx:79-90`), conteo de lo que se mueve (:94-120). Función SQL transaccional (`20260309112831_fix_security_warnings.sql:186`). **Tomar**: vista previa con conteos, servidor y confirmación humana (E18). **No**: match por nombre.

## 4. Tests (Atomic)
49 archivos (vitest + Playwright `e2e/`). Bordes de fechas al ms (`tasks/tasksPredicate.test.ts:114-197`), importación (`dataImport/DataImport.test.tsx:152-176`), filtro del tablero (`deals/DealList.test.tsx:14,38`). **Sin test de reordenar ni de concurrencia.** Veredicto: fuente de ideas y de pocas piezas puras; react-admin + Supabase no encaja con Server Actions.

## 5. twenty-ui / twenty-shared (MIT)
- **twenty-ui: no vale la pena.** Depende de `@base-ui/react`, `@tabler/icons-react`, `react-datepicker` y `zod`, más peer `monaco-editor` (`twenty-ui/package.json`). Estilos SCSS modules (`primitives/data-display/Tag/Tag.tsx:10`). Sin kanban ni timeline. Choca con el kit y con «sin dependencias».
- **twenty-shared, utilidades puras copiables con aviso:**
  - **Tomar** `utils/url/normalizeDomain.ts:28` (`normalizeDomain(raw: string): string`): quita esquema, `www`, puerto y usuario; punycode; con test. Es la clave de E1.
  - **Tomar** anti-inyección CSV: `utils/csv/sanitizeValueForCSVExport.ts:4` + `constants/CsvDangerousCharacters.ts:3`.
  - **Idea:** verbos de actividad cerrados (`timeline/TimelineActivityAction.ts:3-10`), nombre `objeto.accion` (`parseTimelineActivityAction.ts:9`).
  - **No** el paquete entero: arrastra `ai`, `esbuild`, `typescript`, `react-router-dom`.

## 6. Cinco detalles de experiencia (Atomic)
1. **Ctrl/Cmd+K** abre el buscador global (`search/GlobalSearchButton.tsx:96-106`).
2. **Vacío que guía:** sin contactos, el tablero propone crearlos o importarlos (`deals/DealEmpty.tsx:19-39`).
3. **«Sólo los míos»** siempre a la vista (`deals/OnlyMineInput.tsx:5-25`, `DealList.tsx:76`); el admin filtra por comercial (`DealList.test.tsx:14`).
4. **Tarea en un toque:** tilde (`tasks/Task.tsx:70,98`), posponer (:180,196), borrar con deshacer (:55-56).
5. **La nota actualiza estado y último contacto** sin otro formulario (`notes/NoteCreate.tsx:90-97`).
Vistas guardadas con nombre: no encontradas [A VALIDAR].
