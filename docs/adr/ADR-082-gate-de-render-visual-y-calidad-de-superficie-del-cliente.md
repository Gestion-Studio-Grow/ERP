---
id: ADR-082
nivel: fundacional
dominio: [UX, Operaciones, Producto]
depends_on: [ADR-040, ADR-079, ADR-072, ADR-069]
---
# ADR-082: Gate de RENDER VISUAL real + "lo cosmético para el cliente es crítico" — ninguna página se publica sin verificación de render

**Estado:** Aceptado — **fundamento de calidad, permanente**. Eleva a regla dura la frase del dueño:
*"lo que es cosmético para el cliente es crítico"*. Se **suma** al Gate de Excelencia (ADR-040) y al Gate
UX/UI de craft (ADR-079); no los reemplaza.
**Fecha:** 2026-07-11
**Depende de:** ADR-040 (Gate de Excelencia — este ADR le agrega una valla de render real), ADR-079 (Gate
UX/UI de 7 lentes — la calidad la mide en vivo esta valla), ADR-072 (enfoque de diseño / tokens son la ley),
ADR-069 (UX como pilar de arquitectura, no cosmético)
**Relacionado:** ADR-083 (`main` auto-deploya → un render roto es un deploy roto), ADR-070 (disciplina de
release preview→prod) · `scripts/qa/visual-smoke.mjs` · `scripts/visual-gate.mjs` · `scripts/qa/visual-audit.mjs`
· `scripts/qa/visual-audit-gate.mjs` · `scripts/verify-gates.mjs`

---

## Contexto

El 2026-07-11 el **login de producción estaba roto** (`/operador` y `/admin` colapsados a "una palabra por
línea") **con `tsc` verde, 929 tests verdes y `build` verde**. Los tres gates que teníamos son **ciegos a lo
visual**: verifican tipos, lógica y compilación, no lo que el cliente ve. Peor: la "verificación" del render
se hacía **leyendo el árbol DOM** porque los screenshots fallaban en el entorno — y el DOM estaba *presente y
correcto* mientras la página se veía rota. La lección dura: **"verificado por DOM" no es verificado.** Un
árbol DOM completo no dice nada sobre si el CSS cargó, si el layout colapsó o si el contraste es legible.

La **causa raíz** del bug fue una trampa no obvia de **Tailwind v4**: el namespace `--spacing-*` del `@theme`
(que usábamos para una escala de densidad `p-md`/`gap-sm`) **también alimenta `max-w-<key>`**. Las keys
`sm/md/lg/xl/2xl` colisionaban con la escala t-shirt de contenedor → `max-w-sm` se compilaba a `max-width:
var(--space-sm)` (≈12px) en vez de 24rem, y **toda tarjeta con `max-w-{sm..2xl}` colapsaba a una palabra por
línea**. Pasa `tsc`+`build`+`test` porque es **puramente visual**. (Detalle y fix en la memoria de proyecto
`tailwind-spacing-maxw-colision`.)

El dueño fijó el principio: **lo que el cliente ve ES producto, no cosmética. No existe el defecto visual
"menor".** Una pantalla ilegible o colapsada es un defecto de producto de la misma gravedad que un cálculo
fiscal equivocado — porque es lo primero (y a veces lo único) que el cliente juzga.

## Decisión

**Ninguna página se publica sin verificación de RENDER REAL.** Se agrega una valla de render al Gate
(ADR-040), obligatoria y no salteable, con estas reglas:

1. **Render real, no DOM.** La verificación corre en **Chromium** (Playwright), **desktop + mobile**, sobre
   los **4 temas** DB-backed. Leer el árbol DOM **no cuenta como verificación**.
2. **Qué chequea la valla (dos capas):**
   - **Layout (`visual-smoke.mjs` → `gate:visual`, sin DB):** el CSS cargó (variables `--surface`
     computadas), Tailwind aplicó (display real), el contenedor **no colapsó** (detecta "una palabra por
     línea"), **sin overflow horizontal**, y los elementos clave están presentes. Screenshots como artefacto
     en `qa-shots/visual/`.
   - **Calidad AA (`visual-audit.mjs` → `gate:visual:aa`, DB-backed 4 temas):** **contraste WCAG AA
     computado** (compone el alfa sobre el fondo real; exime disabled/placeholder; texto sobre imagen = no
     medible), **touch targets ≥ 24px** (piso WCAG 2.5.8; exime nativos/links inline) y overflow. Una página
     que tira 500 o queda en blanco = **fallo duro**.
3. **Si el entorno no puede sacar el screenshot, el gate FALLA — no se saltea.** Un render no verificable se
   trata como render roto. (Antídoto directo del incidente: los screenshots fallaban y se "verificó" por DOM.)
4. **Los tokens son la ley.** Los defectos de contraste se corrigen **en el token** (una vez, para todas las
   pantallas), no con parches por pantalla. Cero hex sueltos en pantallas (ADR-072/079).
5. **Robustez del arnés (aprendida a los golpes):** el orquestador espera **SALUD HTTP (200 + hoja de
   estilos), no solo el puerto TCP** — un `next start` **zombie** de un build viejo daba falso rojo "sin
   estilos"; aborta si el puerto ya está ocupado; y **mata el árbol de procesos** al salir (en Windows `next`
   es hijo de `npx`, matar el wrapper no mata el server).

**Wiring:** `scripts/verify-gates.mjs` corre las vallas `visual` (tras build) y `visual-aa`; `npm run
gate:visual` (subset sin DB) · `npm run gate:visual:full` · `npm run gate:visual:aa`; en CI `gates.yml`
instala Chromium y sube los screenshots. **Todo esto está en `main`.**

> **En una línea:** *un `tsc`/test/build verde no prueba que el cliente pueda leer la pantalla; sólo un
> render real lo prueba, y si no se puede renderizar, el gate falla.*

## Evidencia (primera corrida completa, 2026-07-11)

- **324 defectos** en las superficies del cliente: **191 de contraste** + **133 de touch target**.
- `--text-faint` estaba **bajo AA por diseño** (2.0–3.1:1) en los temas → **123 fallos** en todo `/admin`.
  Se subió a ≥ 4.5:1 **en el token** (más el token nuevo `--accent-ink` = acento del tenant afinado a AA como
  texto). Todos los defectos corregidos **por token, no por parche**.
- Trampa de tokens documentada: las custom props con `var()` se computan **donde se declaran** → `--accent-ink`
  hay que re-declararlo en cada bloque que declara `--accent` (Fable light/dark), o toma el de `:root`.

## Consecuencias

- **(+)** El agujero que dejó pasar un login roto a prod **queda cerrado**: el defecto visual ahora rompe el
  gate igual que un test rojo.
- **(+)** La calidad de superficie del cliente pasa a ser **medible y objetiva** (contraste computado, touch,
  overflow), no opinión — encaja como el brazo ejecutor de las 7 lentes de ADR-079.
- **(+)** Corregir por token propaga el fix a todas las pantallas y a todos los tenants de una.
- **(−)** El gate ahora **necesita un navegador** (Chromium) y, para la capa AA, una **DB de dev** (pglite in
  RAM sirve, patrón `npm run demo`) → más setup y más tiempo de corrida que `tsc`+test.
- **(−)** Entornos muy anidados panican Turbopack (`next dev`) → el worktree de QA debe vivir en **ruta corta**
  (ej. `C:/qavis`). Deuda de fondo: **renombrar la escala de densidad** para que no comparta keys con la escala
  de contenedor (hoy cubierto por override unlayered + el propio gate).

## Alternativas descartadas

- **Seguir verificando por DOM / "se ve bien en mi máquina".** Es exactamente lo que dejó pasar el login roto.
  Rechazada: DOM presente ≠ render correcto.
- **Saltear el gate cuando el entorno no puede sacar screenshot.** Rechazada por regla dura: no-verificable =
  roto. El costo de un falso verde en prod (ADR-083: main auto-deploya) es mayor que el de frenar.
- **Tratar el contraste/touch como "mejora cosmética" de backlog.** Rechazada por el principio del dueño: lo
  que el cliente ve es producto; no hay defecto visual "menor".
- **Parchear cada pantalla con su color/tamaño.** Rechazada: multiplica la deuda y diverge del sistema de
  tokens (ADR-072). El fix va al token.

— Elaborado por GSG (Auditoría GSG / UX — gate de calidad de superficie; corre en el Gate, ADR-040)
