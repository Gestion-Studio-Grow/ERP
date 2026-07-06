# Heurísticas aprendidas — rollup del registro de casos

**Qué es:** la destilación de los casos reales en reglas reutilizables. Cuando una heurística acá se
vuelve estable, se **promueve** a `docs/metodologia/checklist-extraccion.md §3` (que es lo que el agente
lee al trabajar). Este archivo es la trazabilidad de **de qué caso salió cada regla**.

| # | Heurística | Salió de | ¿En checklist? |
|---|---|---|---|
| H1 | **IG login-gated:** el handle igual confirma el nombre real (→ `verificado`); bio/reels se piden al dueño con capturas. Nunca describir posts no vistos. | magra | ✅ §3.1 |
| H2 | **Tienda por JS:** buscar el endpoint JSON, o render headless; si el menú vive en un tercero, **eso es el incumbente** → pedir export, no scrapear. | magra (Bistrosoft) | ✅ §3.2 |
| H3 | **El link de "lista de precios" del Linktree suele revelar el software incumbente.** No desperdiciarlo (paso 6). | magra | ✅ §3.2 / paso 6 |
| H4 | **Sin logo/hex:** mapear a preset de acento (`provisional`) + **recrear el logo en CSS/SVG** para la demo; asset oficial = bloqueante de prod. | magra, breakpoint | ✅ §3.3 |
| H5 | **Fuente única (sólo Instagram):** se puede armar demo creíble siendo **explícito** sobre lo "de ejemplo"; el `completenessScore().prod` bajo es la señal honesta. | breakpoint | parcial (implícito en §3.5 + DoD) |
| H6 | **Precios no públicos:** estimación de gama marcada `provisional` + pedido; jamás precio inventado como real. | magra, breakpoint | ✅ §3.5 |
| H7 | **CTA de WhatsApp sin número real:** el placeholder debe ser de **formato válido** (no un patrón obviamente roto como puros ceros) + extraído a una constante única + registrado acá como `pedido-al-dueno`. Un CTA roto en una demo en vivo es peor que uno de ejemplo bien marcado. | adosmanos | parcial (1 caso; candidata a checklist §3.5 si se repite) |
| H8 | **Para COPIAR EXACTO, leer el RENDER, no el fetch.** El fetch→markdown descarta el CSS → nunca da hex ni fuentes. La paleta real sale de las **CSS vars globales** (`--e-global-color-*`/Astra) con `getComputedStyle` en el navegador. *(En Magra el color estimado "a ojo" —oxblood— era incorrecto; el real es oro `#c5ae86` + verde `#004f38` + crema `#f2e6d7`.)* | magra (copia exacta) | ✅ copiar-exacto §1/§3 |
| H9 | **Cuidado: `<img>` numerados pueden ser SELLOS de marca, no producto.** En Elementor las fotos de producto de una card suelen ser **background-images de columna hermana (lazy)**; los `<img>` numerados (`5/7/9.png`) resultaron sellos (smiley, "grill & chill"). **Abrí la imagen antes de usarla**; si la real es un background no extraíble, **placeholder marcado + pedirla**, nunca hotlinkear el asset equivocado. | magra (copia exacta) | ✅ copiar-exacto §3 |
| H10 | **Assets lazy / SPA:** scrollear para forzar la carga y/o leer el **panel de red** para capturar todos los `src` reales antes de listarlos. | magra (copia exacta) | ✅ copiar-exacto §2.5 |

## Cómo agregar una heurística

1. Sale de un caso → se anota en la entrada del caso (§5 de la plantilla).
2. Se suma una fila acá con su origen.
3. Si es estable/repetida, se promueve a la checklist §3 y se marca ✅.

## Candidatas / a validar con más casos

- **Reseñas como fuente de tono y diferencial percibido** (calidad vs. precio vs. atención) — usado en
  magra; falta más evidencia para volverlo regla dura.
- **Facebook menos login-gated que IG** — probable, a confirmar en un caso donde IG cierre y FB abra.
