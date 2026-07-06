# Caso: MAGRA Meat Market

**Fecha:** 2026-07-05 · **Extraído por:** sesión preventa magra · **Rubro (texto libre):** boutique de carnes premium
**Fuentes consultadas:** [web](https://magrameatmarket.com.ar/) · [Linktree](https://linktr.ee/magrameatmarket) · [IG @tiendamagra](https://www.instagram.com/tiendamagra/) · reseñas indexadas

> Entrada semilla del registro. Detalle completo: `docs/preventa/analisis-redes-magra.md`.

## 1. Qué se extrajo (resumen)

- **Identidad:** "MAGRA Meat Market"; tagline literal **"Esto no es una carnicería"**; tono
  descontracturado/cercano; estética oxblood/negro/crema (hex exacto no obtenido).
- **Modelo de negocio (el cómo vende):** ⭐ insight clave — **NO** es carnicería de mostrador al corte;
  es **boutique premium envasada al vacío, delivery + WhatsApp**. Reorientó el catálogo (packs) y el copy.
- **Catálogo:** vacuno (Angus, distribuidor oficial Estancia Don Ramón), cerdo, pollo orgánico, gourmet
  (pasta italiana, conservas). Marcas como pista de nivel premium.
- **Servicios:** delivery gratis (Canning, San Vicente, Guernica, Ezeiza, Monte Grande); efectivo/débito/
  crédito/transferencia/Mercado Pago; Lun–Sáb 10–20, Dom 9–13.
- **Contacto:** WhatsApp +54 9 11 6135 4042; José Champagnat 4351, Canning; hola@magrameatmarket.com.ar.
- **Incumbente:** 🎯 **Bistrosoft** — su "lista de precios" del Linktree redirige a su tienda Bistrosoft.

## 2. Completitud

- `demo`: ~1.0 (rubro, nombre, tono, modelo, catálogo, WhatsApp: todos verificados).
- `prod`: <1.0 — faltan hex de marca, logo vectorial, precios/SKUs reales, fotos con permiso.

## 3. Qué falló durante la extracción

| Muro / problema | Fuente | Cómo se resolvió | Provenance final |
|---|---|---|---|
| Instagram login-gated (fetch da sólo el nombre; `?__a=1` muerto; sin browser conectado) | IG @tiendamagra | el handle confirmó el nombre; el resto (bio/reels) se pidió al dueño | `pedido-al-dueno` |
| Tienda de precios carga por JS (SPA de Bistrosoft) | borders.bistrosoft.com | no se transcribieron precios; se detectó el incumbente; precios estimados | `provisional` + pedido |
| Sin logo/paleta descargable | web | estética descripta textual; hex exacto pendiente | `provisional` (acento) |

## 4. Qué se corrigió / se pidió al dueño

- Lista de precios real + SKUs · hex de marca + logo/tipografía · acceso/capturas de Instagram
  (proceso, catálogo, local) · fotos de producto con permiso · confirmar modelo de venta (pack vs kg).

## 5. Heurística nueva (si la hubo)

- Consolidó tres muros hoy en la checklist §3: **IG login-wall (3.1)**, **tienda por JS + incumbente
  (3.2)**, **sin logo/hex → acento provisional (3.3)**. Promovidas ✅.
- Aprendizaje transversal: **el link de "lista de precios" del Linktree revela el software incumbente** —
  no scrapear, pedir el export. → checklist paso 6 / §3.2.

---

## 6. Iteración 2 (2026-07-06) — COPIAR EXACTO la vidriera

**Contexto:** la demo anterior (`public/previews/magra/index.html`) NO coincidía con el sitio real
(usaba paleta **oxblood `#7b2d3b`** — un supuesto de la iteración 1). El dueño autorizó copiar EXACTO
(autorización TOTAL). Se rehízo la vidriera fiel al original leyendo el **render** con el navegador.
Método formalizado en `docs/metodologia/copiar-exacto-vidriera.md`.

### Qué se corrigió (fidelidad real, verificada por DevTools)
- **Paleta REAL** (de las CSS vars de Astra/Elementor, no estimada): oro/tostado `#c5ae86` (acento:
  H1, botones, franja envasados), verde profundo `#004f38`, crema `#f2e6d7` (header/secciones), navy
  `#0f172a` (H2), negro `#1d1d1b` (texto/secciones oscuras). ⛔ El supuesto "oxblood" era **incorrecto**.
- **Tipografías REALES:** **Bebas Neue** (display, mayúsculas condensadas) + **Open Sans** (texto).
- **Estructura fiel** (7 bloques en orden): header crema → hero piedra con badge + "Esto no es una
  carnicería!" + spread de cortes → beneficios (4) → Productos Gourmet (4) → Envasados al vacío (3) →
  Nuestros proveedores → Reviews → footer. Copy **literal** transcripto.
- **Imágenes reales hotlinkeadas** (autorización total): logo, hero `carnes_optimized.png`, 4 fotos
  gourmet, 3 avatares de review (`mat/jes/maca`). Sello GSG en el pie **sin pisar** `@noctiluma_`.

### Muro nuevo encontrado (⭐ heurística)
- **Los `<img>` numerados NO eran las fotos de carne — eran SELLOS de marca.** `7.png` = smiley,
  `5/otro` = "grill & chill". Las fotos reales de los 3 cortes (ojo de bife / churrasco / patamuslo)
  son **background-images de columnas Elementor (lazy)**, no extraíbles por DOM en el tiempo del caso.
  → Se usó **placeholder de marca marcado** en esas 3 cards + se dejó la foto exacta como
  **pendiente del dueño** (ASSET_MANIFEST). **No se hotlinkeó el asset equivocado.** Heurística H8/H9.

### Pendiente del dueño (para prod)
- Las 3 fotos de cortes envasados (o autorizar capturarlas de su Elementor) para reemplazar los
  placeholders · logo vectorial + hex confirmados (ya derivados, a validar) · lista de precios real.
