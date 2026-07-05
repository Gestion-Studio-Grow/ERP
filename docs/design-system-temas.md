# Design system — Temas front/back + branding por tenant

Regla del sistema (2026-07-05). Vale para **cualquier tenant**, sin hardcode por pantalla.

## 1. Base "Nocturne" dual-theme

El look base es **Nocturne** (familia cálida), con dos temas de luminosidad:

- **Claro** (`:root`, default) — Nocturne en luz cálida.
- **Oscuro** (`[data-theme="dark"]`) — Nocturne oscuro.

Ambos temas comparten los **mismos tokens semánticos** (`--surface*`, `--text*`, `--line*`, estados, sombras) definidos en `src/app/globals.css`. Los componentes consumen esos tokens vía utilidades (`bg-surface`, `text-muted`, `border-line`, `bg-accent`, `text-on-accent`, `bg-*-soft`, …), así que **flipan de luminosidad solos** con `data-theme`. No hardcodear colores en componentes.

## 2. Regla FRONT ↔ BACK (contraste de luminosidad)

> El **FRONT** (vidriera / sitio público) y el **BACK** (backoffice / admin) de un tenant usan temas de **luminosidad OPUESTA**.

- Del branding del tenant sale el **tema del front** (`frontTheme`).
- El **back** toma automáticamente el inverso: `backTheme = invertTheme(frontTheme)`.
- Si el front es claro → el back va oscuro. Si el front es oscuro → el back va claro.

Se resuelve en `src/lib/branding.ts` (`invertTheme`, `getTenantBrand`, `getFrontTheme`, `getBackTheme`) y lo aplica cada layout poniendo `data-theme`:

- `src/app/admin/(dashboard)/layout.tsx` → `data-theme={backTheme}`.
- `src/app/(site)/layout.tsx` → `data-theme={frontTheme}`.

## 3. Acento de marca por tenant (afinado por tema)

El acento sale del tenant, **no** está hardcodeado. Cada preset (`ACCENT_PRESETS` en `branding.ts`) define un tono para fondo **claro** y otro para fondo **oscuro** (mismo hue, distinta luminosidad) + su texto-sobre-acento, garantizando **AA en ambos temas**. El layout inyecta, según su tema:

```
--accent           (hex del preset afinado al tema)
--text-on-accent   (texto sobre el acento, AA)
```

`--accent-soft` / `--accent-hover` se derivan en `globals.css` según el tema (mezcla con blanco en claro, con el fondo oscuro en oscuro). Presets disponibles: `petroleo`, `oxblood`, `rosa`, `celeste`, `verde`, `ambar`.

Asignación por tenant (una línea en `TENANTS`, por slug):

```ts
"beauty-spa": { name: "CH Estética", monogram: "CH", preset: "petroleo", frontTheme: "light" }, // → admin oscuro
"magra":      { name: "Magra",       monogram: "M",  preset: "oxblood",  frontTheme: "light" }, // → admin oscuro
```

## 4. Logo + paleta

El logo del tenant se muestra en el encabezado del backoffice (y en la vidriera), sobre su paleta, **cuidando contraste AA**. Hoy es un monograma sobre el acento (par `accent`/`on-accent` del preset = AA garantizado); reemplazable por un asset SVG real sin cambiar la regla.

## 5. Cómo respetar esto en pantallas nuevas

- Usar **solo tokens semánticos** (utilidades `bg-surface`, `text-strong/muted/faint`, `border-line`, `bg-accent`, `text-on-accent`, estados `*-soft`). Nada de hex ni de grises crudos de Tailwind.
- Nunca asumir claro u oscuro: el tema lo pone el layout. Si un color debe contrastar con el acento, usar `text-on-accent`.
- El acento es una variable: nunca hardcodear el color de marca.

## Referencia visual

`ch-estetica-mockups/magra-front-claro.png` (vidriera, claro) y `magra-back-oscuro.png` (admin, oscuro): mismo tenant (Magra, oxblood), luminosidad invertida, acento afinado a cada tema.

## Pendiente

Persistir `{ accentPreset, frontTheme, logo }` por tenant en `BusinessSettings` cuando se despliegue la migración de Neon (hoy viven en el mapa `TENANTS` de `branding.ts`).
