# DESIGN.md — Identidad visual de GSG

> Completado desde el CÓDIGO (fuente de verdad) el 2026-10-06. Cada valor lleva `archivo:línea`. Lo marcado con ❓ no está definido en el código o se infirió con poca seguridad. Multi-tenant: la capa BASE vive en `src/app/globals.css` (`:root` Nocturne claro + `[data-theme="dark"]`), y los TENANTS la sobreescriben por `[data-brand="…"]` (theme packs, globals.css:211-292), `[data-identity="gsg"]` (globals.css:162-209) y `[data-skin="fable"]` (backoffice, globals.css:345-477). El acento de marca es SIEMPRE por tenant (`--accent` inyectado por el layout, `src/lib/branding.ts`).

## Personalidad
- GSG se siente: ❓ no definido en el código. Pistas: "papel técnico frío-tibio, enterprise-creíble", "SAP argentinizado" (globals.css:151-157); "Apple en la piel, SAP en la profundidad" (globals.css:347-348).
- GSG nunca se siente: ❓ no definido en el código. Por CLAUDE.md: nada que parezca "plantilla de IA" (gradientes violeta, tarjetas genéricas).
- Referencias que admiramos: Aesop, Aman, COS — paleta editorial hueso cálido + tinta + un acento (globals.css:13-14; Aesop también en globals.css:42-44 por la transición única). ❓ sin URLs en el código.
- Competidores y en qué nos diferenciamos: ❓ no definido en el código.

## Tipografía
Todas se cargan con `next/font/google` en `src/app/layout.tsx:2`, `subsets: ["latin"]`. Excepción: la vidriera CH usa `@font-face` propio (`src/design/fuentes.ts:52,61`, "Archivo Renglon" + "Archivo Renglon Respaldo", `src/design/tokens.ts:234`) por decisión ADR-099.
- Display / títulos (base): `--font-display: var(--font-fraunces)` → **Fraunces**, normal+italic, variable (sin pesos fijos), `display: swap` (layout.tsx:55-60; globals.css:485). Tracking: `-0.02em` en h1 y `-0.01em` en h2 de la landing premium (`src/components/premium/PremiumLanding.tsx:47,71`) ❓ no hay token de tracking.
- Texto (base): `--font-body: var(--font-hanken)` → **Hanken Grotesk**, `display: swap` (layout.tsx:62-66; globals.css:486). Fallback del body: `var(--font-body), var(--font-geist-sans), system-ui, -apple-system…` (globals.css:624). Tamaño base: ❓ no hay token; `font-size: 0.875rem` en componentes (globals.css:676,692,711) y `line-height: 1.5` (PremiumLanding.tsx:25).
- Sans UI / Tailwind `font-sans`: **Geist** (`--font-geist-sans`, layout.tsx:35-38; globals.css:482).
- Serif alternativa `font-serif`: **Playfair Display** (`--font-spa-serif`, layout.tsx:48-52; globals.css:484).
- Mono: **Geist Mono** (`--font-geist-mono`, layout.tsx:40-46; globals.css:483), `preload: false`.
- Por tenant (layout.tsx:68-106): Magra → **Bebas Neue** 400 + **Open Sans**; Shine → **Cormorant** 400/500/600 normal+italic + **Kumbh Sans**. Theme packs reasignan `--font-display`/`--font-body` (globals.css:224,239,254,269,284).
- Escala: ❓ no definida como tokens. Tamaños sueltos en globals.css: 0.6875 / 0.75 / 0.8125 / 0.875 / 1 rem (globals.css:929-1039); landing: `clamp(40px,7vw,86px)` h1, `clamp(28px,4vw,46px)` h2 (PremiumLanding.tsx:47,71).

## Color
Capa base = tema CLARO Nocturne (`:root`, globals.css:60-120). Los tenants sobreescriben (ver cabecera).
- Fondo: `--surface: #f6f3ec` (globals.css:63) · Superficie elevada: `--surface-raised: #ffffff` (:64) · hundida: `--surface-sunken: #ece7db` (:62) · invertida: `--surface-inverted: #1b1a14` (:65) · Texto fuerte: `--text-strong: #1f1b14` (:68) · Texto cuerpo: `--text: #413b31` (:69) · Texto secundario: `--text-muted: #736a58` (:70) · tenue: `--text-faint: #766d5f` (:71, AA 4.6:1).
- Líneas: `--line: #e6dfd0` (:75) · `--line-strong: #d2c9b5` (:76).
- Acento principal: `--accent: #2c6e77` (petróleo, FALLBACK; cada tenant inyecta el suyo — globals.css:78-82) · hover/soft/ink derivados con `color-mix` (:83-89). Acento secundario: ❓ no hay token; en marca CH `--ch-terracotta: #a85e3c` "acento alternativo" (:30) y `--ch-brass: #9a8350` para subrayado de links (:36).
- Estados: éxito `--success: #4e6b4a` (:94, soft `#e7eee4`) · alerta `--warning: #8a6a1f` (:96, soft `#f5ebd7`) · error `--danger: #b23b2b` (:98, soft `#f6e3de`) · info = `var(--accent-ink)` (:103).
- Marca CH (tenant beauty-spa, hex exactos del handoff): ivory `#f3eee5`, linen `#e6ddce`, clay `#c7b49c`, mocha `#856b52`, terracotta `#a85e3c`, sage `#6b7660`, sage-deep `#414a3c`, petrol `#2c6e77`, teal-logo `#1e93a6`, ink `#201f1b`, brass `#9a8350` (globals.css:26-36). Paleta spa legacy `--spa-*` (:15-23).
- Identidad GSG propia (`[data-identity="gsg"]`, detrás de flag `GSG_IDENTITY_ENABLED`): surface `#f5f5f2`, raised `#ffffff`, sunken `#ececea`, text-strong `#17181a`, text `#35363a`, muted `#6a6b70`, line `#e2e2df` (globals.css:162-177).
- Modo oscuro: SÍ. `[data-theme="dark"]` (globals.css:299-343): fondo `#15140f`, raised `#201e17`, sunken `#100f0b`, text-strong `#f0ebde`, text `#c9c3b4`, muted `#928b7b`, accent fallback `#5fb0bc`, success `#86a97f`, warning `#c2724a`, danger `#e08472`. Regla: front y back de cada tenant van en luminosidades OPUESTAS (globals.css:6-8, `src/lib/branding.ts`). Skin Fable (backoffice) con sus propios tonos (globals.css:345-477).
- Regla de consumo: los componentes usan tokens semánticos (`bg-surface`, `text-muted`, `border-line`, `text-accent`…) expuestos en `@theme inline` (globals.css:479-553); nunca hex sueltos.

## Espacio y forma
- Escala de espaciado: `--space-3xs..2xl` = 0.125 / 0.25 / 0.5 / 0.75 / 1 / 1.5 / 2 / 3 rem × `--density` (globals.css:134-141); `--density` 1 = enterprise, 1.32 = `[data-density="lite"]` (:131,:147-149). Utilidades `p-md`, `gap-sm`… (:557-564). Convive con la escala numérica de Tailwind. Área táctil mínima `--tap-min: 2.75rem` (44px, :132).
- Radios: `--radius-sm: 0.375rem` · `--radius: 0.625rem` · `--radius-lg: 1rem` · `--radius-xl: 1.5rem` (globals.css:111-114). GSG identity más crispado: 0.25 / 0.4375 / 0.75 / 1.125 rem (:180-183). Cada theme pack ajusta `--radius` (0.375 a 1rem, :225-285).
- Sombras: cuatro niveles cálidos `--shadow-xs/sm/md/lg` (globals.css:117-120); oscuro (:339-342); GSG "flat enterprise" (:186-189). Utilidades `shadow-card/raised/overlay` (:550-553).
- Grilla: ❓ no hay tokens de columnas ni breakpoints propios; se usan los de Tailwind v4. Anchos `--max-width-xs: 20rem`, `sm: 24rem`… re-declarados (globals.css:578+).

## Movimiento
- Carácter: "sale despacio y frena suave, el gesto de una puerta bien colgada" — UNA sola transición para todo el sitio CH (globals.css:39-49). ❓ para el backoffice no hay token de carácter.
- Duraciones: `--ch-transicion-tiempo: 380ms` (globals.css:47). Micro/entrada: ❓ no hay tokens; la norma 120–200 ms / 300–500 ms es de `.claude/rules/movimiento.md`, no del código.
- Easings permitidos: `--ch-transicion-curva: cubic-bezier(0.2, 0.65, 0.3, 1)` (globals.css:48); nunca ease-in. (`ease-in-out` existe sólo en el loader global, globals.css:800.)
- Qué se anima: loader global y reveals (globals.css:774-892); vidrieras premium/3D (`src/components/premium`, skill `vidriera-de-autor`). ❓ sin lista explícita en el código.
- Qué NO se anima: ❓ no definido en el código (regla: lo que se ve 100+ veces al día).
- Reduced motion: `@media (prefers-reduced-motion: reduce)` en globals.css:774, 798, 892 y gate `no-preference` en :868. Fallback: busy indicator sin movimiento (globals.css:781).

## 3D (si aplica)
- Stack: ❓ no verificado en este pase (ver `src/app/tienda/quebienoles/` y skill `vidriera-de-autor`).
- Formatos y presupuesto: ❓ no definido en el código revisado.
- Iluminación y materiales base: ❓ no definido en el código revisado.
- Fallback sin WebGL: ❓ no definido en el código revisado.

## Voz y textos
- Tono: criollo claro, "Argentinizar SAP" (CLAUDE.md, ADR-044/046) · Persona: **vos** (textos de UI y comentarios del código en rioplatense) · Palabras que usamos: ❓ no hay glosario en el código · Palabras prohibidas: ❓ no definido en el código (CLAUDE.md: sin "Bienvenido a nuestra plataforma", sin lorem ipsum).
