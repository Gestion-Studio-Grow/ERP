# 📄 RFC-004-C — Rediseño de identidad del front (Ola 1)

> **Ola 1 autorizada por el dueño.** Problema: los 4 fronts del piloto salen idénticos al template de CH
> ("armamos la web igual que el 90%… Magra con banner arriba-izquierda cuando la original es logo al medio y
> sin banner. Eso no es rediseñar."). Objetivo: **identidades GENUINAMENTE distintas** por tenant, guiadas
> por datos, detrás de flag, **sin tocar la prod real de CH (`beauty-spa`)**. Sigue Challenger (S5) → Gate.
> **Fecha:** 2026-07-09. **Anclado en código.** Base: RFC-004 / 004-A / 004-B.

---

## 1. Causa raíz — por qué todo no-CH cae al template de CH

Dos superficies públicas, **las dos con CH de fallback**:

1. **La landing `/` está hardcodeada como CH y es el default.** [`src/app/(site)/page.tsx:53-54`]:
   ```ts
   const slug = await getCurrentTenantSlug();
   if (resolveRubroIdBySlug(slug)) redirect("/tienda");   // retail → vidriera
   ```
   Si el slug **no** resuelve a un rubro retail, se renderiza la landing de CH literal (hero *"Tu tiempo,
   cuidado a metros de casa"*, equipo/servicios de spa). Ningún dato del tenant maneja su estructura.
2. **`resolveRubroIdBySlug` solo conoce 3 slugs** ([`rubros.ts:441`]): `magra/shinevelas/adosmanos`. El resto
   (incl. `beauty-spa`/CH) cae a la landing CH. Por eso `estetica` (slug `beauty-spa`) **es** CH — y así queda.
3. **Las 3 vidrieras retail salen de UN componente** ([`src/app/tienda/Storefront.tsx`]): mismo hero, mismas
   secciones, mismo orden. Solo variaban **acento + copy** → "el template con otro color" (Sesgo A).
4. **El branding tiene a CH de default** ([`branding.ts`]): slug desconocido / error → `DEFAULT_BRAND`
   (`preset: "petroleo"`, el acento de CH).
5. **Tipografía + metadata globales de CH** ([`src/app/layout.tsx`]): serif de CH + `title: "CH Estética"`.

> **El mecanismo en una línea:** *rubro→null ⇒ landing CH; slug→desconocido ⇒ branding petróleo-CH;
> fuentes/metadata ⇒ globales CH.* No había un modelo que hiciera divergir la **estructura**; solo el color.

---

## 2. Diseño — modelo de identidad por tenant (no "template con otro color")

`TenantBrand.layout` (en [`branding.ts`]) pasa de 3 campos a un **sistema de identidad** completo. Todo
**opcional** (ausente → molde de hoy) y **aditivo** (no rompe contrato de datos):

| Dimensión | Tipo | Qué permite |
|---|---|---|
| `hero` | `standard \| editorial \| poster \| split` | 4 estructuras de portada distintas |
| `logoPosition` | `centered \| left` | crest centrado (boutique) vs logo+nav (retail) |
| `banner` | `string \| null` | anuncio superior, o **sin banner** |
| `typography` | `{ display, body, transform, weight, tracking }` | **voz tipográfica** propia (entre las fuentes ya cargadas — sin descargas nuevas) |
| `palette` | `{ surface, raised, sunken, textStrong, textMuted, line }` | **papel** propio (sobrescribe tokens neutros SOLO en la vidriera; el acento no se toca) |
| `sectionOrder` | `SectionKey[]` | **guion** del negocio (reordena vía CSS `order`; claves faltantes se completan → nunca se pierde contenido) |

`logoAsset` (RFC-004-B) sigue: logo real del tenant vs monograma. Todo se aplica **solo con
`TENANT_FIDELITY_ENABLED` ON**; con OFF, la vidriera ignora el bloque entero → **byte-idéntico a hoy**.

---

## 3. Implementación — las 4 identidades demo, distintas a simple vista

| Tenant | Hero | Logo | Banner | Tipografía | Papel | Guion (orden) |
|---|---|---|---|---|---|---|
| **Magra** (carnicería) | **editorial** (centrado) | centrado | — | Playfair serif / Geist | bone cálido | historia (líneas) → catálogo |
| **Shine** (velas) | **poster** (lavado ámbar) | centrado | envío gratis $25.000 | Fraunces / Hanken | blush | **experiencia (ritual)** primero |
| **A Dos Manos** (pádel) | **split** (panel de acento) | izquierda + nav | — | Hanken **MAYÚS** / Geist | slate frío | **catálogo primero** |
| **CH / estética** (`beauty-spa`) | *(landing spa, sin cambios)* | — | — | *(la de CH)* | *(bone CH)* | — |

- Cada uno tiene **hero + tipografía + paleta + orden** distintos → no es un recolor: es otra experiencia.
- **`beauty-spa` NO se toca:** no es rubro retail → ni pasa por la vidriera → el flag no lo alcanza. La
  landing de CH queda igual. Verificado por el test *"nunca devuelve la marca de CH para otro slug"* y por
  la ausencia de `beauty-spa` en `RUBRO_BY_SLUG`.
- **Guiado por datos:** todo vive en el mapa por slug de `branding.ts`; el material real entra por el
  preset-IA (RFC-004-B) o se persiste en DB (§C/Gate 2).

**Archivos:** `src/lib/branding.ts` (modelo + 4 identidades + `FONT_VAR`/`resolveSectionOrder`),
`src/app/tienda/Storefront.tsx` (aplica hero/tipografía/paleta/orden), `src/lib/branding.test.ts` (+6 tests).

---

## 4. Cómo verlo en staging + prod intacta

**Para que se vea** (Vercel redeploya con el push a `claude/sprint-startup-generic-rf6x0m`): agregar en el
proyecto de staging **`gsg-erp-*`** la env:
```bash
TENANT_FIDELITY_ENABLED=on
```
Es la env que el runbook de deploy ya preveía ("el flag de identidad del piloto se agrega acá cuando cierre").
Con eso, `magra-erp` / `shinevelas-erp` / `adosmanos-erp` adoptan su identidad; `chestetica-erp` (CH) sigue igual.
*(Setear env en Vercel = §C, dueño/S5.)*

**Prod de CH intacta:** la prod real corre en el proyecto **`erp-ch`** trackeando **`main`**. Esta Ola vive en
la branch del piloto y **NO se mergea a `main`** (integra S5/Gate) → `erp-ch` no recibe una sola línea. Y aunque
la recibiera, `TENANT_FIDELITY_ENABLED` es **default OFF** → sin cambio. Doble red.

**Contrato de datos:** sin cambios. Todo es aditivo (campos opcionales en `TenantBrand.layout`) + un flag env.
No toca `schema.prisma` ni migraciones.

---

## 5. Roadmap (Olas siguientes, con Gate)
- Landing `/` por tenant (hoy la landing es 100% CH): un blueprint de landing con datos del tenant, para los
  no-retail que no son CH.
- Fotos/【logo real por tenant (asset) en lugar del monograma/gradiente de marca.
- Persistir `layout`/`palette`/`typography` por tenant en DB (§C/Gate 2) en vez del mapa por slug.
- Más variantes de hero/secciones a medida que entren rubros nuevos.

— RFC-004-C (líder de Diseño, Sesión 4). Ola 1: identidad genuina por tenant, detrás de flag. Sin merge (Gate S5).
