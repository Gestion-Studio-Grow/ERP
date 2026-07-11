# 📄 RFC-004-B — Detección de identidad por IA + fidelidad de branding por tenant

> **Addendum a RFC-004 / RFC-004-A.** El dueño eligió la **Dirección A ("Papel técnico")** como
> identidad GSG base y pidió tres piezas: (1) **encender** la identidad GSG en staging, (2) **fidelidad
> por tenant** (romper el molde único: cada cliente con SU logo/color/layout), y (3) **detección por IA**
> (dada la URL de la web/red del cliente, detectar su identidad para pre-cargar el alta).
> **Fecha:** 2026-07-09. **Anclado en código, detrás de flags, reversible.** Sigue Challenger (S5) → Gate.
> **Filosofía:** C-001/C-004 · ADR-058 (un Core, dos motores) · ADR-059 D4/D5 · ADR-034 (preset por IA)
> · ADR-043 (no-colisión de marca).

---

## 1. Identidad GSG (Dirección A) — encendida detrás de flag

Ya en código (RFC-004-A, commit `9502530`) y listo para verse en staging:
- **`GSG_IDENTITY_ENABLED`** ON → `<html data-identity="gsg">` → `globals.css [data-identity="gsg"]`
  aplica la **base neutra propia de GSG** (papel técnico frío-tibio, bordes crispados, sombras planas),
  distinta del hueso cálido de CH. **No toca `--accent`** (sigue siendo del tenant, C-004/D5). Light + dark.
- **Densidad por edición** (ya cableada, ADR-059 D4): el layout del backoffice pone `data-density="lite"`
  para **Comercio** (espacioso, `--density 1.32`) y lo omite para **Empresa** (denso, `--density 1`).
- **Cómo verlo en staging:** deploy con `GSG_IDENTITY_ENABLED=on` (+ `PROFILES_ENABLED=on` para ver la
  densidad por edición). Con los flags OFF → byte-idéntico a hoy. *(Deploy = §C, dueño/S5.)*

---

## 2. Fidelidad de branding por tenant — romper el molde único (Sesgo A)

**Problema (RFC-004 §1, Sesgo A):** la estructura de la vidriera estaba hardcodeada (mismo header/hero
para todos) → "todas las webs salen iguales"; a Magra se le imponía banner + logo arriba-izquierda cuando
el Magra real es **logo centrado y sin banner**.

**Solución (en código):** `TenantBrand` (`src/lib/branding.ts`) gana **campos de estructura**:

| Campo | Valores | Qué controla |
|---|---|---|
| `layout.logoPosition` | `"centered"` \| `"left"` | Logo centrado (boutique) o a la izquierda con nav (retail) |
| `layout.banner` | `string \| null` | Texto del anuncio superior, o `null` = **sin banner** |
| `layout.hero` | `"editorial"` \| `"standard"` | Hero centrado con aire, o a la izquierda enfocado en el CTA |
| `logoAsset` | `string?` (URL/data-URI) | **Logo real** del tenant; ausente → monograma sobre el acento |

`resolveTenantLayout(brand)` completa los faltantes con `DEFAULT_LAYOUT` (= el molde de hoy) → aditivo,
sin regresiones. La vidriera (`src/app/tienda/Storefront.tsx`) renderiza **masthead** (logo + wordmark,
centrado o a la izquierda), **banner** (si lo hay) y **hero** (editorial/estándar) — todo **detrás de
`TENANT_FIDELITY_ENABLED`** (`src/lib/identity.ts`, default OFF). Flag OFF → molde de hoy, byte-idéntico.

**Branding demo seteado a mano (para que se vean DISTINTOS entre sí y de CH):**

| Tenant | Acento | Logo | Banner | Hero | Lectura |
|---|---|---|---|---|---|
| **Magra** | oxblood | **centrado** | **no** | editorial | Carnicería boutique — se ve Magra, no "CH con otro color" |
| **Shine** | ámbar | centrado | envío gratis $25.000 | editorial | Velas & deco — boutique experiencial cálida |
| **A Dos Manos** | verde | izquierda + nav | no | estándar | Tienda de pádel — retail clásico, foco catálogo |
| **CH Estética** | petróleo | izquierda + nav | Reservá online · Canning | estándar | El molde "de siempre" ES, correctamente, el de CH |

> **Regla ADR-043 (no-colisión):** el chrome de GSG es neutro; la marca **visible** es la del tenant
> (su logo, su acento, su layout). GSG nunca pisa la marca del cliente; ningún cliente se ve como otro.

---

## 3. Detección de identidad por IA (v1) — `src/lib/brand-detection/`

**Objetivo:** dado la URL de la web/red del cliente, **detectar su identidad** (color, logo, tipografía,
nombre) para **pre-cargar el branding del tenant** en el alta. v1 **heurística y explicable** (no una caja
negra): mismas reglas → mismo resultado, auditable, testeable, sin dependencias nuevas.

### Arquitectura (puro + un solo punto de I/O)
```
detectBrandFromUrl(url)          ← detect.ts  (ÚNICA parte con red; fetch inyectable)
      │  baja el HTML (≤512KB, timeout, valida http/https, nunca lanza)
      ▼
extractBrandSignals(html, url)   ← extract.ts (PURO)   → BrandSignals
      │  title/og:site_name · theme-color · colores no-neutros por frecuencia ·
      │  logo (apple-touch-icon → og:image → favicon → <img "logo">) · font-family
      ▼
proposeBranding(signals)         ← propose.ts (PURO)   → BrandProposal
         color de marca → preset de acento MÁS CERCANO del ERP (distancia perceptual) +
         nombre + logo + fuentes + confianza (low/medium/high) + notas explicables
```
`color.ts` (puro): normaliza hex/`rgb()`, distancia perceptual "redmean", y descarta **neutros**
(grises + casi-blanco/negro) para no confundir el fondo con la marca.

### Qué produce (`BrandProposal`)
`{ name, accentHex, nearestPreset, presetDistance, logoUrl, fonts[], confidence, notes[] }`.
El `nearestPreset` mapea el color real del cliente a uno de los 6 presets del ERP → **conserva el sistema
de contraste AA** de `branding.ts` aunque el hex exacto varíe. `notes[]` explica cada decisión para el
revisor (p. ej. *"Acento tomado de theme-color (#6e1e28). Preset más cercano: oxblood (distancia 14)."*).

### Límite v1 explícito (roadmap v2)
- **Lee lo DECLARADO** en el HTML/CSS inline. **NO decodifica píxeles** del logo ni de la og:image
  (extracción de paleta a partir de la imagen = **v2**, requiere decodificar el bitmap).
- Redes sociales login-walled (p. ej. IG de A Dos Manos) no son fetch-ables → v2 vía API oficial o
  material que aporte el dueño. v1 cubre webs públicas / TiendaNube / Linktree.

---

## 4. Integración al ALTA del tenant (cómo se usa)

Punto de integración: la **consola del operador** (`/operador/tenants/[id]`, la misma que audita RFC-003)
y el alta de tenant. Flujo propuesto (v1, con humano en el loop — **la IA propone, el operador confirma**):

1. **Input:** en el alta, campo "Web o red del cliente" → el operador pega la URL.
2. **Detectar:** botón **"Detectar identidad"** → `detectBrandFromUrl(url)` (server action; el fetch vive
   en el server, nunca en el browser del operador).
3. **Propuesta:** se muestra `BrandProposal` — swatch del acento + preset sugerido, logo candidato,
   fuentes, y las `notes[]` explicables + el nivel de confianza.
4. **Confirmar/corregir:** el operador acepta o edita (elige otro preset, sube el logo real, ajusta el
   layout: logo centrado/izq, banner sí/no, hero). Nada se aplica sin su OK.
5. **Persistir:** al confirmar, se guarda en el branding del tenant (hoy el mapa de `branding.ts`;
   **§C/Gate 2:** persistir en `BusinessSettings`/`Tenant` — `accentPreset`, `frontTheme`, `logoAsset`,
   `layout` — cuando se despliegue la migración de Neon). Un único punto de cambio, ya previsto en el
   `TODO` de `getTenantBrand`.

Esto realiza la visión de **ADR-034 (preset por IA)**: el material real del cliente entra por el
provisioning, **no** por la plantilla — el tenant "se siente suyo desde el minuto 1".

---

## 5. Qué se construyó (esta entrega, detrás de flags)

| Pieza | Archivos | Flag | Estado |
|---|---|---|---|
| Flag de fidelidad | `src/lib/identity.ts` (+test) | `TENANT_FIDELITY_ENABLED` (OFF) | ✅ |
| Estructura por tenant | `src/lib/branding.ts` (+test) | — (datos; se aplican con el flag) | ✅ |
| Vidriera fiel | `src/app/tienda/Storefront.tsx` · `page.tsx` | `TENANT_FIDELITY_ENABLED` | ✅ |
| Detección IA v1 | `src/lib/brand-detection/{color,extract,propose,detect,index}.ts` (+4 tests) | — (se invoca desde el alta) | ✅ |

**Vallas:** tsc limpio · suite completa verde · `globals.css` compila con Tailwind v4. Todo aditivo y
reversible (apagar el flag o revertir el commit). **Sin merge a main** (integra S5/Gate).

### Roadmap (con Gate)
- v2 de detección: **paleta desde píxeles** del logo/og:image; redes login-walled vía API.
- UI del alta: cablear "Detectar identidad" en `/operador/tenants/[id]` (server action + confirmación).
- Persistencia por tenant en DB (§C/Gate 2): `layout` + `logoAsset` + `accentPreset` en `BusinessSettings`.
- Densidad/estructura del home por edición (guiado vs analítico) — RFC-004-A §2, rebanada siguiente.

— RFC-004-B (líder de Diseño, Sesión 4). Propuesta + implementación detrás de flag. El resto, con Gate.
