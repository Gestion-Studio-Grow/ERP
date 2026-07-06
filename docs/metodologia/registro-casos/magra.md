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
