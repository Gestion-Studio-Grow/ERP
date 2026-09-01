# Shop de Shine — lienzo de diseño

Diseño de la **tienda (shop) de Shine velas store**: catálogo por familia olfativa, ficha de
producto, versión de teléfono, quiz de aroma y carrito. **Elaborado por GSG.**

Lienzo publicado: https://claude.ai/code/artifact/1e9f7ed3-1564-4cbd-9769-7f0e4f7c74f3

## De dónde sale cada cosa

- **Marca:** `docs/diseno/marca-shine-spec.md` (manual oficial 2026, Cisterna Aylén). Paleta,
  tipografía e isotipo salen de ahí, sin agregados.
- **Tokens:** los mismos que ya corre `src/app/tienda/ShineFront.tsx` en producción
  (crema `#f3ebe1`, burdeos `#671128`, malva `#b88a89`/`#835c5b`, nude `#d0aeac`, blush
  `#e8d9d5`, tinta `#3a2429`; Cormorant Garamond + Kumbh Sans; radios 16/14/999; sombra cálida).
- **Copy y datos:** `src/tenants/storefront.ts → shinevelas` (envío $3.500, gratis desde
  $25.000, CABA y GBA, medios de pago, sets de regalo, aromas de temporada).
- **Fotos e isotipo:** `public/tenants/shinevelas/`.

## Qué resuelve

El problema del rubro es que **no se puede oler por pantalla**. Todo el diseño ataca eso:
familias olfativas como filtro (tintes de la propia paleta, no colores nuevos), notas visibles
en cada tarjeta, pirámide salida/corazón/fondo en la ficha, medidor de intensidad con el
isotipo, horas que dura, m² que ambienta y quiz de aroma de tres pasos.

## Datos de muestra a reemplazar

Reales: envío, umbral de envío gratis, zonas, medios de pago, los tres sets con su precio,
los siete aromas de temporada, todo el copy de marca.
**De muestra:** precios de las velas sueltas, horas de duración y m². WhatsApp quedó como
`[TU NÚMERO]`. El "Trío para descubrir · 3 minis" de la ficha va marcado *A proponer*: no
existe hoy, es una propuesta de producto.

## Cómo regenerar la página

Los `.dc.html` y `canvas.json` son la fuente. La página armada NO se versiona (~3 MB,
`.gitignore`): se rearma con el helper de la skill `design`, pasando los ocho artboards, el
`canvas.json` y las imágenes de `public/tenants/shinevelas/` (`logo.png`, `flame-mask.png`,
`hero.jpg`, `ambiance.jpg`, `gift.jpg`, `mundo-velas.jpg`, `mundo-aromas.jpg`,
`mundo-decoracion.jpg`), y se republica sobre la MISMA URL de arriba.
