# 📄 RFC-004-A — Sesgos de plantilla, identidad por edición y piloto implementado

> **Addendum a RFC-004** (identidad de diseño). **Crítica del dueño (dura y correcta):** *lo que hicimos NO fue
> rediseñar — cambiamos plomería (tokens/componentes/nav) pero el look, los colores y la plantilla quedaron
> IGUALES, con un SESGO DE PLANTILLA que no refleja la identidad real de cada cliente. Ej.: el Magra real tiene
> el logo AL CENTRO y SIN banner; le pusimos banner arriba-izquierda. Todas las webs salen iguales.*
> **Fecha:** 2026-07-09. **Anclado en código.** Sigue Challenger (S5, apretará por distintividad real) → Gate →
> impl. **Filosofía:** C-001/C-004 · ADR-058 (un Core, dos motores) · ADR-059 D4/D5 (densidad; el color es del
> tenant) · ADR-034 (preset por IA) · ADR-043 (no-colisión de marca).

---

## 1. Diagnóstico de SESGOS (con evidencia de código)

### Sesgo A — MOLDE ÚNICO (por qué todo sale igual)
La **estructura** del front está **hardcodeada en componentes**, no configurada por tenant:
- Landing: `src/app/(site)/_ch/Header.tsx` + `src/app/(site)/_ch/AnnouncementBar.tsx` — el nombre del directorio es
  **`_ch`** (¡CH!): el molde es literalmente el de CH (logo arriba-izquierda + **banner** anunciador arriba de todo).
- Retail (Magra/Shine/ADM): `src/app/tienda/Storefront.tsx` — **un solo componente**, mismo header/hero para todos.
- La config por tenant (`src/tenants/storefront.ts`, `src/lib/storefront-visual.ts`) es **solo COPY + secciones de
  catálogo** — **no hay campo de LAYOUT** (posición del logo, banner sí/no, disposición del hero). Verificado: la
  interfaz `StorefrontCopy` tiene eyebrow/hero/value-props/reviews… **cero** estructura.

→ **Consecuencia:** todo tenant retail hereda el MISMO molde (logo arriba-izquierda + banner + hero), sin importar
su identidad real. **Magra sale con banner arriba-izquierda cuando el Magra real es logo centrado y sin banner.**

### Sesgo B — PALETA DE CH como default del producto
Ya documentado en **RFC-004 §1** (L1–L7): el `:root` de `globals.css` = paleta **Nocturne de CH** (surface hueso,
text tinta cálida, **`--accent` petróleo CH**); `--ch-*`/`--spa-*` en el CSS global; `DEFAULT_BRAND.preset =
"petroleo"` (CH); tipografía = serif-spa de CH; metadata default = "CH Estética". El producto **no tiene base
propia**: usa la de un salón de estética.

### Sesgo C — CERO fidelidad al branding REAL del cliente
Lo único que varía por tenant es **el acento (un color) + la luminosidad + el copy**. **No** el logo real (hoy es
un monograma sobre el acento, `branding.ts:tenantFaviconDataUri` / `AdminShell.Brand`), **no** el layout real,
**no** los colores propios de la marca. → el branding del cliente **no se refleja**; se le impone la plantilla.

> **Los 3 juntos = "sesgo de plantilla":** mismo molde (A) + misma paleta de CH (B) + sin fidelidad al cliente (C).
> Eso es exactamente lo que el dueño describe: *"todas las webs nos salen iguales"*. No es rediseño; es un template
> con acento variable.

---

## 2. Identidad GSG DIFERENCIADA POR EDICIÓN (dos experiencias, un core)

La identidad de GSG no es "un look": son **dos experiencias distintas** sobre el mismo Core (ADR-058), unidas por
el design system pero **visiblemente diferentes** (no "el mismo con otro color"):

| Eje | **Comercio** (lite) | **Empresa** (enterprise) |
|---|---|---|
| **Densidad** (ADR-059 D4, ya cableada) | Espaciosa (`--density 1.32`) — respira | Densa (`--density 1`) — data-first |
| **Home** | **Guiado, una acción** (ADR-059 D8): tarjetas grandes, "hacé esto ahora", pocos números | **Analítico**: KPIs, tablas de datos, multi-panel, "vista ejecutiva" |
| **Alta / onboarding** | **Preset-IA** (ADR-034): se siente suyo desde el minuto 1 | Estándar con carácter (ADR-058 P5): producto opinado, serio |
| **Tono visual** | Claro, cálido, acompañado | Grafito, sobrio, **premium/con carácter** (anti-"juguete", ADR-059 D8) |
| **Tipografía** | Jerarquía amable, títulos con aire | Jerarquía compacta, numérica/tabular |

Comparten: el **design system**, los **tokens semánticos**, la **densidad como firma**, y el **acento del
tenant**. Cambian: la **estructura del home**, la **densidad**, el **tono** — dos productos que se **sienten**
distintos. Esa es la distintividad que el Challenger va a exigir: **estructural + de densidad + de tono**, no un
recolor.

---

## 3. FIDELIDAD AL CLIENTE — Magra debe verse como Magra

El theming por tenant debe reflejar la **identidad real** del cliente, no la plantilla:
- **Layout por tenant, no un molde:** agregar al brand del tenant campos de **estructura** —posición del logo
  (`centrado`/`izquierda`), **banner** (sí/no), disposición del hero— además del accent/tema. Hoy `TenantBrand`
  (branding.ts) tiene `name/monogram/preset/frontTheme`; **falta** `layout`.
- **Logo real, no monograma:** soportar un **asset de logo** por tenant (SVG/PNG), no solo el monograma sobre el
  acento. El material real (logo, fotos, colores) entra por el **preset-IA / provisioning** (ADR-034), no por la
  plantilla.
- **Colores propios:** el acento ya es del tenant; sumar la posibilidad de una **paleta de marca** del cliente
  (no solo 1 de 6 presets) cuando el material real lo justifique.
- **Ejemplo concreto — Magra:** logo **centrado**, **sin banner**, acento **oxblood**, voz *"carnicería boutique
  premium, envasado al vacío, delivery"* → una vidriera que se ve **Magra**, no "CH con otro color". *(El molde
  actual le pone banner arriba-izquierda: exactamente el sesgo A.)*

**Regla (ADR-043 no-colisión):** la identidad de GSG (chrome del backoffice) es neutra; la marca **visible** es
la del tenant (su logo, su acento, su layout). GSG nunca pisa la marca del cliente, y el cliente nunca se ve como
otro cliente.

---

## 4. QUÉ CONSTRUÍ (piloto, detrás de flag, listo para staging)

**Rebanada 1 de la Dirección A ("Fiori argentino / papel técnico"), detrás de `GSG_IDENTITY_ENABLED` (default OFF):**
- **`src/lib/identity.ts`** (+ tests): flag `gsgIdentityEnabled()` + `identityAttr()`.
- **`globals.css` → `[data-identity="gsg"]`** (light + dark): la **base neutra PROPIA de GSG** — papel técnico
  frío-tibio (NO el marfil de CH), tinta neutra, hairlines marcados, **bordes más crispados** y **sombras planas**
  ("flat enterprise" vs. "spa suave"). **No toca el acento** (sigue siendo del tenant, C-004/D5). Solo redefine
  tokens semánticos neutros → el acento del tenant se monta encima intacto.
- **`src/app/layout.tsx`**: setea `data-identity="gsg"` en `<html>` **solo con el flag ON**; con el flag OFF → sin
  atributo → **byte-idéntico** a hoy (paleta CH). Aditivo/reversible.
- **Fix del leak L3:** `Heading.tsx` `text-ch-mocha` → `text-muted` (token semántico; saca la marca de CH de un
  primitivo compartido).
- **Vallas:** tsc limpio · **suite 732/732** · **globals.css compila con Tailwind v4** (verificado con el CLI,
  79.7 KB, el bloque `[data-identity="gsg"]` presente).

**Cómo verlo renderizado:**
- **Ahora:** el **prototipo distintivo** (Artifact) que acompaña este RFC — muestra las **dos ediciones**
  (Comercio vs Empresa) y la **fidelidad de Magra** (centrado, sin banner, oxblood) vs. el molde actual.
- **En staging:** deployar con `GSG_IDENTITY_ENABLED=on` → el producto adopta la base neutra de GSG (distinta de
  CH), con la densidad por edición ya activa. *(Deploy = acción del dueño/S5, §C.)*

**Lo que ESTE piloto todavía NO hace** (roadmap de la dirección, para el Gate): tipografía propia de GSG (hoy sigue
la de CH); la estructura por edición del home (guiado vs analítico); los campos de **layout por tenant** +
**logo asset** (Sesgo C / §3); sacar `--ch-*`/`--spa-*` a un tema de tenant y GSG-izar `DEFAULT_BRAND`/metadata.
Esta rebanada enciende la **base neutra propia** (el "ya no es CH") como primer paso visible.

---

## 5. Para el Challenger (anti-"mismo con otro color")

La distintividad real de esta dirección **no** es un recolor. Viene de **tres ejes simultáneos**:
1. **Base neutra PROPIA de GSG** (≠ hueso cálido de CH; ≠ gris genérico): papel técnico + bordes crispados +
   sombras planas = carácter "SAP argentinizado".
2. **Dos ediciones estructuralmente distintas** (Comercio guiado/espacioso ↔ Empresa analítico/denso): dos
   experiencias, no dos colores.
3. **Fidelidad al cliente** (logo/layout/colores reales del tenant): Magra se ve **Magra**, no "CH con oxblood".

Si al Challenger le sale "es lo mismo con otro color", es porque falta implementar (2) y (3) — por eso están
**explícitos como roadmap** (§4). El piloto enciende (1); (2) y (3) son las rebanadas siguientes, con su Gate.

— RFC-004-A (líder de Diseño). Propuesta + piloto detrás de flag. El resto es reingeniería posterior, con Gate.
