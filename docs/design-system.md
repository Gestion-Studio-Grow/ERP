# Design System — Upgrade UX/UI 2026

Sesión: **UX/UI upgrade** · Rama: `feature/ux-ui-upgrade` (worktree `estetica-erp-uxui`, sobre `main`).
Estado: **fundación commiteada, verificación (tsc + build) PENDIENTE** (ver §5).

## 1. Diagnóstico de partida

El sistema visual estaba bifurcado:

- **Sitio público** usa tokens `--ch-*` vía **estilos inline** (`style={{ color: "var(--ch-petrol)" }}`).
- **/admin** usa utilidades Tailwind **`neutral-*` / `bg-black` / hex crudos**.
- **Dos paletas solapadas**: `--spa-*` (editorial legacy, aún viva en el flujo `/reserva`) + `--ch-*` (marca CH 2026).
- La paleta de marca **no estaba expuesta como utilidades Tailwind** → obligaba a inline styles en todos lados.
- **Bug**: `body { font-family: Arial }` en `globals.css` **pisaba las fuentes de marca** cargadas en el layout. Todo lo que no re-declaraba `fontFamily` inline (notablemente **todo /admin**) salía en Arial.

## 2. Estrategia (capa de diseño, sin chocar con features en vuelo)

Se trabaja **solo la capa de diseño** que propaga sin tocar markup de features que están tocando otras sesiones
(comisiones/reportes, lista de espera + `AdminShell`, multi-tenant):

- Tokens / tema (`globals.css`), tipografía, foco.
- Primitivas UI base compartidas (`src/components/ui/`).
- Páginas del **sitio público**.
- **NO** reestructurar `/admin/reportes`, comisiones, "Lista de espera" ni `AdminShell` — si mejora el shell, es
  vía tokens/estilos globales, nunca reescribiendo su markup.

## 3. Lo implementado (commit `feat(ui): capa de design tokens semanticos + primitivos de UI`)

### 3.1 Capa semántica de tokens — `src/app/globals.css`

Tokens **por rol, no por color** (aditivos; no se borró ningún `--ch-*`/`--spa-*` existente):

| Grupo | Tokens |
|---|---|
| Superficies | `--surface-sunken`, `--surface`, `--surface-raised`, `--surface-inverted` |
| Texto | `--text-strong`, `--text`, `--text-muted`, `--text-faint`, `--text-on-accent` |
| Líneas | `--line`, `--line-strong` |
| Acento | `--accent`, `--accent-hover`, `--accent-soft` |
| Estados | `--success(-soft)`, `--warning(-soft)`, `--danger(-soft)`, `--info(-soft)` (matizados a la paleta cálida, contraste AA) |
| Foco | `--focus-ring` (petróleo de marca) |
| Radios | `--radius-sm/-/-lg/-xl` |
| Sombras | `--shadow-xs/-sm/-md/-lg` (tono tinta, no negro puro) |

Todo se expone en `@theme inline` como **utilidades Tailwind**:
`bg-surface`, `text-muted`, `border-line`, `text-accent`, `bg-danger-soft`, `outline-focus`, `shadow-card`, `rounded-lg`,
más la paleta de marca (`bg-ch-petrol`, `text-ch-mocha`, `border-ch-clay`, …).

**Fixes globales** (elevan /admin gratis, sin tocar su markup):
- `body` ahora hereda la tipografía de marca (`--font-body` Hanken → Geist → system), no Arial.
- Foco visible en **petróleo de marca** (WCAG 2.4.7), no `#171717`, y extendido a `textarea`/`[tabindex]`/`summary`.

### 3.2 Primitivas UI — `src/components/ui/`

Sin dependencias nuevas (no hay clsx/cva; hay helper `cn`).

| Archivo | Exporta | Notas |
|---|---|---|
| `cn.ts` | `cn()` | une clases condicionales |
| `Button.tsx` | `Button`, `ButtonLink`, `buttonClasses` | variantes `solid/outline/ghost/danger/subtle`, tamaños `sm/md/lg`, alturas táctiles |
| `Card.tsx` | `Card`, `CardHeader`, `CardTitle`, `CardDescription` | superficie elevada, `flush`/`interactive` |
| `Badge.tsx` | `Badge` | tonos `neutral/accent/success/warning/danger/info` + `dot` |
| `Field.tsx` | `Input`, `Select`, `Textarea`, `Field` | foco de marca, label asociado, hint/error |
| `Heading.tsx` | `Eyebrow`, `SectionHeading` | jerarquía tipográfica del sitio |
| `index.ts` | barrel | importar desde `@/components/ui` |

Son **presentacionales** (sin `"use client"`): andan como `submit` dentro de forms con server actions
(el estado `pending` sigue en `SubmitButton`).

**Aditivo**: todavía no se consumen en pantallas → **no cambia el render actual**. Bajo riesgo de conflicto de merge.

## 4. Próximos pasos (para retomar)

1. **Adoptar primitivas en el sitio público** — `(site)/page.tsx` (hero, secciones, tarjetas de servicio/equipo/reseñas),
   reemplazando bloques de estilos inline por `SectionHeading`/`Card`/`Badge`/`ButtonLink`. Migrar el `eyebrow`/`display`
   inline a `Eyebrow`/`font-display`.
2. **Flujo `/reserva`** — migrar de `--spa-*` (paleta legacy) a la capa semántica + `Field`/`Button`; unifica look con el resto.
3. **/admin de bajo riesgo** — páginas standalone (login, catálogo, clientes) pueden adoptar `Card`/`Badge`/`Field`/`Button`
   **sin tocar `AdminShell`**. Los estados de turno (confirmado/pendiente/cancelado) → `Badge` con tono semántico.
4. **Warm-up opcional del admin** — evaluar remapear `--color-neutral-*` de Tailwind a neutrales cálidos en `@theme`
   para alinear /admin al hueso de marca sin editar markup (decisión de riesgo; dejar para una pasada dedicada).
5. **Documentar tokens con muestra visual** (página `/admin` interna o Storybook liviano) — opcional.

## 5. Verificación PENDIENTE

El worktree **no tiene `node_modules`** (no copiar — cuelga en Windows). Antes de mergear a `main`, correr en el
**checkout principal** (`estetica-erp`, que sí tiene deps) tras traer la rama:

```
node_modules/.bin/tsc --noEmit          # o: npx next build  (sin turbopack)
npm run build
```

Esperado en verde: los cambios son aditivos y no alteran render. **No pushear a `main` sin OK del owner.**

## 6. Decisiones de marca abiertas (requieren al owner)

- No se tocó **logo definitivo** ni se fijó **paleta corporativa oficial**: se consolidó la paleta CH del handoff 2026
  (`--ch-*`) como canónica y se construyó la capa semántica encima. Si el owner define otra paleta, solo cambian los
  hex en `:root` — los componentes no se tocan (esa es la ventaja de tokenizar por rol).
