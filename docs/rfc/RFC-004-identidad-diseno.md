# 📄 RFC-004 — Identidad de diseño de GSG (producto ≠ tenant)

> **Tipo:** RFC (investigación + propuesta de diseño, **NO decisión, NO implementa**). **Estado:** Etapa 1.
> Sigue **Challenger (S5, ADR-045) → Gate (ADR-040) → implementación**.
> **Autor:** Diseño / Identidad. **Fecha:** 2026-07-09. **Anclado en el código real.**
> **Problema (del dueño):** *"el producto se ve como un ERP GENÉRICO hecho por IA — el front muestra la marca de
> CH Estética y el backoffice siempre los mismos colores."* Quiere una **identidad PROPIA de GSG**.
> **Filosofía:** C-001 (SAP Public Cloud argentinizado; "la IA que construye necesita arquitectura") · C-004
> (Comercio/Empresa; el color es del tenant) · ADR-058 (un Core, dos motores) · ADR-059 D5 (**tier en canal
> neutro, el acento es del tenant**) · ADR-043 (no-colisión de marca) · ADR-044 (argentinizar).

---

## 1. ROOT-CAUSE técnico — por qué TODO se ve como CH

**Causa raíz de una línea:** *el producto nació para CH y la paleta/tipografía/identidad de CH quedó como el
DEFAULT del producto.* No hay una capa de identidad de **GSG**; el "look base" ES el de CH. La marca por tenant
(accent) se resuelve **encima** de una base que ya es de CH. Enumerado, cada filtración:

| # | Dónde | Qué filtra CH | Evidencia (archivo) |
|---|---|---|---|
| **L1** | **Tokens semánticos `:root` = paleta "Nocturne" de CH** | El "look base" del producto (surface/text/line/shadow) es la paleta **hueso cálido + petróleo** de CH. `--surface:#f6f3ec` (marfil CH), `--text-strong:#1f1b14`, `--line:#e6dfd0` (lino CH), y **`--accent:#2c6e77` = PETRÓLEO de CH** como fallback. El comentario lo dice: *"LOOK BASE = Nocturne… Referencia de marca: CH Estética"*. | `src/app/globals.css:48-97, 128-171` |
| **L2** | **Tokens `--ch-*` + `--spa-*` en el CSS del producto** | Colores de marca de CH (ivory/linen/clay/mocha/terracotta/sage/petrol/teal-logo/ink/brass) + spa-* — hardcodeados en el stylesheet global y **expuestos como utilidades** (`bg-ch-petrol`, `text-ch-mocha`, `border-ch-clay`) vía `@theme inline`. | `globals.css:15-37, 182-194` |
| **L3** | **Componente del design system usa `--ch-*`** | `Heading` (el "eyebrow"/kicker de TODO el producto) pinta con **`text-ch-mocha`** → cada encabezado del backoffice usa el marrón de CH. *(El `Badge` ya se corrigió — su comentario cita que usaba `bg-ch-linen`.)* | `src/components/ui/Heading.tsx:10` |
| **L4** | **Acento DEFAULT del producto = `petroleo` (CH)** | `DEFAULT_BRAND.preset = "petroleo"`, `DEFAULT_ACCENT = petroleo.light`, y el fallback de `resolveAccent` → `petroleo`. El preset está rotulado **"salón CH"**. Cualquier tenant desconocido / entorno sin DB / fallback = **petróleo de CH**. | `src/lib/branding.ts:31,66-71,81,118` |
| **L5** | **Tipografía DEFAULT = la de CH** | El root layout carga **Fraunces** (`--font-display`) + **Hanken** (`--font-body`) + Playfair (`--font-spa-serif`); el cuerpo global es `--font-body`. El comentario: *"Identidad CH Estética (rediseño): display serif editorial + grotesque de cuerpo."* → **la voz tipográfica del producto ES la de CH.** | `src/app/layout.tsx:2,16-33`; `globals.css:176-180` |
| **L6** | **Metadata DEFAULT = CH** | El title/description por defecto del root layout: *"CH Estética — La Alameda, Canning"* + la bio de Carolina. Cualquier ruta que no la sobreescriba hereda la marca de CH en la pestaña. | `src/app/layout.tsx:45-47` |
| **L7** | **Favicon con teja hueso CH** | `tenantFaviconDataUri` hornea `#faf7f2` (marfil CH) como fondo del glifo. | `src/lib/branding.ts:129` |

> **Nota:** el bug **J-2** (mostrar CH en todos los dominios) YA se arregló — `getTenantBrand` resuelve por el
> tenant del request (`branding.ts:91-107`). Ese era el *"todos ven CH por error"*. Lo que **queda** (L1–L7) es
> distinto y más profundo: **CH es el DEFAULT del PRODUCTO por diseño**, no un bug de resolución. Aunque cada
> tenant resuelva su accent, **la base (colores, tipografía, carácter) sigue siendo la de CH**.

**Por eso el backoffice "siempre los mismos colores":** lo único que cambia por tenant es **el acento (un color)
+ la luminosidad** (regla front/back). Todo lo demás —surface, text, line, tipografía, densidad, estructura— es
**FIJO y es el de CH**. Dos backoffices distintos = "la misma Nocturne cálida de CH + otro acento".

---

## 2. DIAGNÓSTICO — por qué se ve "genérico hecho por IA"

Anclado en pantallas reales (login, shell/admin, fichas):

- **D1 · No hay identidad de PRODUCTO, solo un acento.** El sistema es competente y tokenizado, pero la única
  "personalidad" configurable es **un color de acento**. La base es un neutro cálido anónimo → lee como *"admin
  template correcto pero sin autor"*. Es la firma del "ERP genérico de IA": todo bien ordenado, nada que diga
  **"esto es GSG"**.
- **D2 · La identidad prestada es de CH, no de GSG.** Lo que sí tiene carácter (el serif editorial "spa", el
  hueso cálido, el petróleo) es **de CH** — un salón de estética. Aplicado a una carnicería (Magra) o una
  ferretería, ese carácter *"spa"* **no pega** y se percibe como plantilla mal calzada.
- **D3 · Jerarquía plana en el chrome.** El shell (nav, header) usa spacing/paddings fijos y un tratamiento
  uniforme; sin una jerarquía tipográfica fuerte ni una firma estructural, las pantallas se ven "todas iguales".
  La **densidad por perfil** (ADR-059 D4, recién cableada) es un diferenciador que casi no se explota como
  identidad.
- **D4 · Sin sistema de marca propio.** No hay logotipo/marca-palabra de GSG, ni un lenguaje visual (grilla,
  íconos, tono) que sea del producto. El monograma es del tenant; el producto no tiene el suyo.

**En una línea:** *el producto no se ve mal — se ve **de nadie**. Tiene los colores de CH y la neutralidad de un
template. Falta la voz de GSG.*

---

## 3. PROPUESTA — identidad de diseño de GSG (RFC-004)

**Principio rector (ADR-059 D5 / C-004):** **el COLOR es del tenant; la IDENTIDAD es de GSG.** Hoy está al revés
—la identidad es de CH y el color es lo único del tenant—. La propuesta invierte eso: **una identidad de producto
GSG, tenant-agnóstica, neutra y con carácter**, y el theming por tenant (accent + tema + logo) **encima**.

Lo que GSG debe transmitir, bajado de la filosofía:
- **Rigor enterprise creíble** (anti-"juguete"; ADR-059 D8: que la pyme no rechace por percepción) — disciplina
  tipo **SAP Fiori / Stripe / Linear**, sin copiarlos.
- **Argentino, cálido donde corresponde** (ADR-044/046 de-sesgo): preciso y sobrio en el producto/datos, cálido
  en el copy/venta. **No** "spa"; **sí** "pyme seria argentina".
- **Un Core, dos motores hecho visible** (ADR-058): la **densidad** (Comercio espacioso ↔ Empresa denso) como
  **firma de identidad**, no solo como ajuste.

### 3.2 · Direcciones visuales (2-3, con su esencia)

Cada una define **base neutra del producto + rol del acento + tipografía + densidad + carácter**. Todas son
tenant-agnósticas (ningún tenant se ve como CH); el acento del tenant entra encima.

#### Dirección A — **"Fiori argentino / papel técnico"** ⭐ (recomendada)
- **Esencia:** el rigor de un ERP enterprise, cálido y claro como un documento bien hecho. Serio pero no frío —
  la "pyme argentina que se toma en serio su operación".
- **Base:** neutro **grafito-cálido PROPIO de GSG** (no el hueso de CH): superficies gris-tibio muy claras / casi
  blancas en claro, grafito profundo en oscuro; texto tinta neutra; líneas hairline sobrias. Es un neutro **de
  GSG**, calibrado para que **cualquier** acento de tenant (oxblood, verde, ámbar…) se vea bien encima.
- **Acento:** del tenant, usado con moderación (estado activo, foco, CTA primario) — el chrome queda neutro.
- **Tipografía:** una **grotesque de datos** precisa y legible para toda la UI (números tabulares, densidad) + un
  **display sobrio** (no serif-spa) para títulos de sección. Voz "software serio", no "editorial spa".
- **Densidad:** la firma. Comercio respira (D4 lite), Empresa comprime (D4 default) — el mismo sistema, dos
  motores, **visible**.
- **Carácter:** SAP Fiori argentinizado. Disciplina + criollo en el copy.

#### Dirección B — **"Grafito de precisión" (Linear/Vercel)**
- **Esencia:** herramienta de software moderna, monocromática, de altísimo contraste. El acento del tenant es
  **el único color** en un chrome grafito.
- **Base:** neutro **frío** (slate/grafito), UI casi monocroma, bordes finos, mucho aire estructural.
- **Acento:** protagonista por contraste (único color sobre gris).
- **Tipografía:** grotesque geométrica ajustada, muy "tool".
- **Densidad:** tiende a denso/data-first por naturaleza; Comercio afloja apenas.
- **Carácter:** modernísimo, inconfundiblemente "producto". **Riesgo:** puede leerse **frío / poco argentino** —
  tensiona con ADR-044/046 (calidez). Bueno para el Empresa; hay que cuidar que el Comercio no se sienta hostil.

#### Dirección C — **"Libro mayor criollo" (editorial serio, cálido)**
- **Esencia:** la seriedad fiscal/administrativa de la pyme AR — "libros y papeles" bien llevados. Carácter, pero
  del PRODUCTO (no del spa de CH).
- **Base:** neutro **papel-cálido de GSG** (gris tibio de "libro contable", **distinto** del hueso de CH — clave
  para no repetir el error), con un **serif de datos DISTINTO** para títulos/tablas + grotesque limpia para la UI.
- **Acento:** del tenant, para estado/CTA.
- **Densidad:** Empresa denso como una planilla; Comercio espacioso como una ficha.
- **Carácter:** argentino, administrativo, con voz. **Riesgo:** si el serif/base no se aleja bien de CH, recae en
  "otra vez spa-editorial". Exige un serif y un neutro claramente NO-CH.

> **Recomendación:** **A** como base (máxima credibilidad enterprise + calidez argentina + explota la densidad
> como firma), con la opción de tomar de **C** un toque de carácter (un serif de títulos distinto) si el Gate lo
> pide. **B** queda como referencia de disciplina, no como dirección principal (riesgo de frialdad).

---

## 4. ESTRUCTURA — separar identidad de PRODUCTO (GSG) de branding de TENANT

El fix estructural (aditivo, sin romper el theming que ya funciona):

### 4.1 · Dos capas de tokens, explícitas
- **Capa PRODUCTO (GSG, tenant-agnóstica) — la identidad.** El `:root` base deja de ser la Nocturne de CH y pasa
  a ser la **paleta neutra de GSG** (Dirección elegida) + la **tipografía de GSG** + la escala de **densidad** (ya
  existe, ADR-059 D4). Es el "chrome": shell, nav, estructura, tipografía, spacing. **No** contiene ningún color
  de marca de un tenant.
- **Capa TENANT (branding) — el color.** Solo **accent + tema (front/back) + logo/monograma**, inyectados por
  layout (como hoy: `--accent`/`--text-on-accent` + `data-theme`). El acento del tenant **monta encima** del
  neutro de GSG.

### 4.2 · CH pasa a ser UN TENANT MÁS (no el default del producto)
- Los tokens **`--ch-*` y `--spa-*`** salen del `globals.css` del producto y viven en un **tema de tenant**
  (`beauty-spa`): son la marca de **CH**, no del producto. La vidriera de CH sigue igual; el producto ya no los
  trae de fábrica.
- **`DEFAULT_BRAND` / `DEFAULT_ACCENT` dejan de ser `petroleo` (CH)** → un **neutro/acento de GSG** por defecto.
- **La tipografía default** deja de ser el serif-spa de CH → la de GSG.
- **La metadata default** deja de ser "CH Estética…" → neutra del producto (cada tenant/ruta la sobreescribe).
- **El favicon** deja de hornear el marfil de CH → neutro de GSG (o el del tenant).

### 4.3 · Regla dura (Gate)
- **Ningún componente del design system usa `--ch-*` / `bg-ch-*` / `--spa-*`.** Solo tokens semánticos
  (`surface`, `text`, `line`, `accent`, `success`…). *(Fix pendiente: `Heading.tsx` `text-ch-mocha`.)* El acento
  es el único canal de color del tenant (D5). Un **check** (grep en el Gate) puede fallar si vuelve a aparecer un
  `-ch-` en `src/components` o `src/app/admin`.
- El neutro de GSG se calibra para **contraste AA con cualquier preset de acento** (los 6 y los que vengan).

---

## 5. Root-cause resumido + qué sigue

- **Root-cause:** CH es el **default del producto** en 7 capas (L1 tokens semánticos = Nocturne CH · L2 `--ch-*`/
  `--spa-*` en el CSS global · L3 `Heading` usa `text-ch-mocha` · L4 accent default = petróleo CH · L5 tipografía =
  serif-spa CH · L6 metadata = "CH Estética" · L7 favicon marfil CH). El bug J-2 (resolución) ya está arreglado;
  esto es **identidad prestada por diseño**, no un bug.
- **Diagnóstico:** se ve "genérico de IA" porque **no hay identidad de GSG** (solo un acento) y la que hay es de
  un **salón de estética**, mal calzada a otros rubros.
- **Propuesta:** identidad de producto GSG **neutra + con carácter**, tenant-agnóstica, con el color del tenant
  encima (invertir "identidad de CH + color del tenant" → "identidad de GSG + color del tenant"). **3 direcciones**
  (A Fiori argentino ⭐ · B grafito de precisión · C libro mayor criollo).
- **Estructura:** dos capas de tokens (producto GSG ≠ tenant); CH pasa a ser un tenant más; regla dura anti-`ch-`.
- **Sigue:** **Challenger (S5, ADR-045)** tensiona las 3 direcciones y elige → **Gate (ADR-040)** → **prototipo** →
  implementación aditiva (reemplazar la base de tokens sin tocar el mecanismo de accent/tema que ya funciona;
  reversible). **NO se implementa en este RFC.**

— RFC de identidad (frente Diseño). Propuesta, no decisión. No toca código de producto.
