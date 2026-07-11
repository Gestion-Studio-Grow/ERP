# Regla — Verificación de RENDER REAL antes de publicar (Gate visual)

**Estado:** vigente · **Origen:** incidente 2026-07-11 (login de `/operador` roto en prod) · **Célula:** Confiabilidad
**— Elaborado por GSG**

## La regla (dura, no salteable)

> **Ninguna página se publica sin verificación de RENDER REAL.**
> El gate `tsc + lint + test + build` **no ve bugs visuales**: una página puede compilar,
> buildear y pasar todos los tests y aun así salir con el layout colapsado (CSS que no
> aplica, contenedor ausente, "una palabra por línea"). Por eso el gate incluye una valla
> de render real (Playwright, navegador de verdad, desktop + mobile) que **falla igual que
> un test** cuando el layout está roto.

## Por qué (el incidente que la motivó)

El 2026-07-11 la página de login del plano de operador (`/operador/login`) salió a
producción con el layout colapsado: el texto apilado una palabra por línea, el CSS/Tailwind
sin aplicar. Compilaba, buildeaba y pasaba los tests — **ninguna valla lo detectó** porque
ninguna valla miraba un render. El agujero no era el bug puntual: era que el gate era ciego
a lo visual.

## Qué verifica la valla (`npm run gate:visual`)

Sobre las rutas críticas (login de operador, consola, alta, login de admin, vidriera
pública), en navegador real y en desktop **y** mobile:

1. **CSS cargó** — una custom property de `globals.css` (`:root { --surface }`) resuelve a
   un valor no vacío. Si el stylesheet no cargó, queda vacío → falla.
2. **Tailwind aplicó** — las utilidades de layout (`flex`, `min-h-screen`) producen estilos
   computados reales, no los defaults del navegador.
3. **No hay columna colapsada** — el contenedor de contenido tiene un ancho razonable; se
   detecta el patrón "una palabra por línea" (contenedor angosto a min-content).
4. **Sin overflow horizontal** — `scrollWidth <= innerWidth`.
5. **Elementos clave presentes** — los controles esperados (input de contraseña, botón,
   heading) existen y tienen tamaño > 0.

Cada ruta deja **screenshots** como artefacto (desktop + mobile).

## Regla de tooling (importante)

> **Si el entorno no puede sacar screenshots, eso NO es excusa para dar por bueno.** Un gate
> visual que no puede renderizar es un gate que **falla**, no uno que se saltea. Se resuelve
> la herramienta (instalar Chromium de Playwright, levantar el server) hasta que el render
> funcione — no se declara "verde" sin haber visto el render.

## Dónde vive

- `scripts/qa/visual-smoke.mjs` — el smoke (assertions + screenshots).
- `scripts/visual-gate.mjs` — orquestador: levanta `next start`, corre el smoke, baja el server.
- `npm run gate:visual` (subset sin DB) · `npm run gate:visual:full` (incluye consola autenticada, con DB de dev).
- Integrado en `scripts/verify-gates.mjs` (valla `visual`) y en `.github/workflows/gates.yml`
  (que sube los screenshots como artefacto del run).

## Cobertura y su límite honesto

El subset de CI corre **sin base de datos**: cubre las rutas que renderizan con branding
fail-open (login de operador, login de admin, vidriera). Son las que atrapan la clase de bug
del incidente. Las rutas de consola **autenticadas** (`/operador`, `/operador/alta`, ficha de
tenant) necesitan DB (`operatorPrisma`) y se cubren en el pre-push local con
`npm run gate:visual:full` contra el server de dev con DB. Este límite está documentado a
propósito: no se declara cobertura que no existe.
