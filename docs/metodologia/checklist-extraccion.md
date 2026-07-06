# Checklist de extracción — fuente por fuente + fallbacks ante muros conocidos

**Tipo:** guía operativa de la fase 1 (ingesta/extracción) · **Consume:** el Material de Marca
(`src/preset/extraction/material-de-marca.ts`) · **Alimentado por:** el registro de casos (§4 del ancla).

**Para qué:** que cualquier agente de extracción trabaje **en el mismo orden** y **no redescubra** los
muros que ya conocemos. Cada muro tiene un **fallback concreto** y una **provenance** de salida. La regla
madre: cuando una fuente se cierra, no se inventa — se baja a `provisional` con nota, o a
`pedido-al-dueno`, y se anota la fuente intentada.

---

## 1. Orden de barrido (de más rico/público a más cerrado)

| # | Fuente | Suele dar | Riqueza | Notas |
|---|---|---|---|---|
| 1 | **Web propia** | estructura, copy literal, catálogo, "quiénes somos", contacto, colores | 🟢 alta | fue la fuente de oro en magra |
| 2 | **Linktree / link-in-bio** | canales, "lista de precios", tienda, WhatsApp | 🟢 alta | suele **revelar el incumbente** (paso 6) |
| 3 | **Ficha de Google / Maps** | dirección, horarios, teléfono, reseñas, fotos | 🟢 alta | indexada, casi siempre pública |
| 4 | **Reseñas indexadas** | diferencial percibido (calidad/precio/atención), tono | 🟡 media | buscar por nombre + localidad |
| 5 | **Facebook** | a veces catálogo, horarios, "acerca de" | 🟡 media | menos login-gated que IG |
| 6 | **Instagram / TikTok** | identidad visual, proceso, catálogo en reels | 🔴 baja (login-gated) | ver fallbacks §3 |
| 7 | **Marketplaces / tienda online** | precios, SKUs reales | 🟡 varía | a menudo cargan por JS (§3) |

**Salida esperada de este barrido:** un Material de Marca con el máximo de campos en `verificado`,
lo estimable en `provisional` (con nota), y el resto en `pedido-al-dueno` + su línea en
`pendientesDelDueno`. Corré `completenessScore()` para saber si alcanza para **demo** (y qué falta para
**prod**).

---

## 2. Qué extraer para cada campo del Material

| Campo del Material | Dónde mirar primero | Pista de calidad |
|---|---|---|
| `rubro` | web (título, "quiénes somos"), Google (categoría) | texto libre → lo resuelve `resolveBlueprint` |
| `identidad.nombrePublico` | web / IG handle | el handle confirma el nombre real |
| `identidad.tagline` | hero de la web, bio | **transcribir literal**, no parafrasear |
| `identidad.tono` | copy de la web + reseñas | formal vs. descontracturado |
| `identidad.colores` | CSS de la web (si la red deja), capturas | hex exacto; si no → provisional |
| `identidad.accentPreset` | derivar de colores → preset más cercano | `petroleo/oxblood/rosa/celeste/verde/ambar` |
| `identidad.logo` | header de la web / avatar de IG | bajar a `public/tenants/<slug>/` (réplica §6) |
| `modeloNegocio` | leer el **cómo vende** (mostrador vs pack, delivery, canal) | el insight que más reorienta el tenant |
| `catalogo` | secciones de producto, tienda, marcas/proveedores | "distribuidor oficial de X" = premium |
| `ofertas` | banners, historias destacadas | suelen ser temporales |
| `quienesSomos` | sección "nosotros"/"about" | historia, valores, equipo |
| `servicios.delivery` | web / Linktree | **zonas** concretas |
| `servicios.mediosPago` | checkout, "formas de pago" | ¿Mercado Pago? transferencia? fiado? |
| `servicios.horarios` | Google / web | por día |
| `servicios.canalesVenta` | Linktree, botones | local / web / WhatsApp / apps |
| `contacto.*` | web (footer), Google | WhatsApp con formato `wa.me` |
| `incumbente` | seguir "tienda"/"lista de precios" del Linktree | revela **qué software usa hoy** |

---

## 3. Muros conocidos y su fallback (heurísticas duras)

> Cada fila salió de un caso real. Cuando aparezca uno nuevo, se agrega vía el registro de casos (§4).

### 3.1 Instagram / TikTok tras muro de login  *(caso: magra)*
- **Síntoma:** el fetch del perfil devuelve sólo el nombre; `?__a=1` ya no responde sin auth; los
  reels/bio no son accesibles por herramientas.
- **Fallback, en orden:**
  1. El **handle igual confirma el nombre real** → `identidad.nombrePublico` puede subir a `verificado`
     (fuente = la URL del perfil).
  2. Buscar el **mismo contenido reposteado** en fuentes públicas (Facebook, notas de prensa, blogs).
  3. Si hay **navegador conectado** (extensión Chrome) y el dueño autoriza login → leer con el browser
     (aun así IG limita el scraping; tratar lo obtenido como `verificado` sólo si se ve directo).
  4. Si nada: **pedir al dueño 2-3 capturas/descripciones** de los reels clave (proceso, catálogo,
     local) → `pedido-al-dueno` + línea en `pendientesDelDueno`.
- **Nunca:** describir posts que no viste como si los hubieras visto.

### 3.2 Web / tienda que carga por JavaScript (client-side)  *(casos: magra→Bistrosoft)*
- **Síntoma:** el HTML llega casi vacío; el catálogo/precios se hidratan por JS (SPA, o menú
  embebido tipo Bistrosoft) → el fetch no ve los precios.
- **Fallback, en orden:**
  1. Buscar el **endpoint de datos** (XHR/JSON) que la SPA consume; si es público, leerlo directo.
  2. Renderizar con **navegador headless** (extensión Chrome) y leer el DOM ya hidratado.
  3. Si el menú vive en un **tercero** (Bistrosoft, PedidosYa, etc.): eso **es el incumbente** →
     registrarlo en `incumbente` y pedir el **export/planilla** al dueño (mejor que scrapear).
  4. Precios que no se pudieron leer → `provisional` (estimación de gama, con nota) **+** pedirlos.
- **Bonus:** el link a la tienda de un tercero suele **revelar el software incumbente** (paso 6 del
  playbook) — no lo desperdicies.

### 3.3 Marca sin logo/paleta descargable  *(caso: magra; Break Point resuelto a mano)*
- **Síntoma:** hay identidad visual pero no un asset limpio (logo en PNG, hex exactos).
- **Fallback, en orden:**
  1. Extraer colores del **CSS** de la web si se puede leer; si no, **muestrear de capturas**.
  2. Mapear al **preset de acento** más cercano del ERP → `accentPreset` `provisional` (nota: "derivado
     de la estética, hex exacto pendiente").
  3. **Recrear el logo fielmente en CSS/SVG** como placeholder de demo (lo hicimos en Break Point:
     círculo + tipografía + pelota como "O"), marcando que es recreación, no el asset oficial.
  4. Pedir al dueño el **logo vectorial + hex de marca** para producción → `pendientesDelDueno`.
- **Regla:** el logo recreado es válido para **demo**; para **prod** se exige el asset real (lo refleja
  `completenessScore().missingForProd`).

### 3.4 Red del shell bloqueada (no se bajan binarios)  *(nota operativa del playbook réplica)*
- **Síntoma:** se ven las URLs de assets pero no se pueden descargar al repo.
- **Fallback:** dejar los `AssetRef` con `downloaded:false` y su URL (hotlink temporal), listar cada
  uno para bajarlo después. La demo puede hotlinkear; prod exige bajarlos a `public/tenants/<slug>/`.

### 3.5 Sin datos de precios reales
- **Fallback:** `provisional` con estimación de gama (marcada) **+** pedido explícito. Nunca precios
  inventados como reales — ni en la demo.

---

## 4. Cierre de una extracción (definition of done)

1. `validateMaterial()` sin errores (warnings admitidos, anotados).
2. `completenessScore().demo` suficiente para la demo a medida (idealmente 1.0; si no, saber qué falta).
3. `missingForProd` y `pendientesDelDueno` **explícitos** en el hand-off a Adaptación/Calidad.
4. Entrada creada en `docs/metodologia/registro-casos/<prospecto>.md` (qué se extrajo/falló/corrigió).
5. Toda heurística nueva promovida a `registro-casos/heuristicas-aprendidas.md`.

---

## Casos de referencia

- **magra** — muro de IG + tienda por JS (Bistrosoft) + sin hex: `docs/preventa/analisis-redes-magra.md`.
- **Break Point** — logo recreado en CSS/SVG desde Instagram, a mano: `docs/artefactos/breakpoint-preventa.html`.
