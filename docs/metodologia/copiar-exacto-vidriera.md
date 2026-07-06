# Método "COPIAR EXACTO" — replicar la vidriera real de un cliente, fiel al píxel

**Tipo:** playbook de la fase de Extracción (generador de preset IA) · **Dueño:** célula Preset IA — Extracción
**Ancla:** `docs/metodologia/generador-preset-ia.md` · **Complementa:** `docs/preventa/playbook-replica-web-a-tenant.md`
(que cubre el *encuadre de producto*: réplica = vidriera del tenant + backoffice). Este doc cubre el
**método técnico de fidelidad**: cómo se extrae y se reproduce una web para que *se vea igual al original*.

> **Cuándo aplica.** El cliente autoriza copiar su sitio **idéntico** (es su negocio). El objetivo del
> paso 1 es **fidelidad total** (estructura, colores, tipografía, copy, catálogo, contacto). La
> adaptación (enchufar el backoffice, mejorar) viene **después** — primero copiamos exacto.

> **🔒 Autorización primero.** Sin OK explícito y registrado, no se copia (ver ancla §Autorización).
> En Magra la autorización fue **TOTAL** (el dueño confirmó que el material es suyo).

---

## 1. La regla de fidelidad: reproducir el RESULTADO, no adivinar

No se levanta el código del estudio; se **reproduce el resultado visual** desde datos extraídos del
sitio **renderizado** (no del HTML crudo). El HTML servido suele venir vacío/incompleto (WordPress +
Elementor, SPAs, lazy-load) → **hay que mirar la página ya renderizada en un navegador**, no el
`view-source` ni el markdown de un fetch.

**Herramienta correcta por dato:**

| Dato a extraer | Cómo (fiable) | Trampa a evitar |
|---|---|---|
| Colores exactos (hex) | DevTools → `getComputedStyle` de `:root`/body/botones; en WordPress leer las **CSS vars globales** (`--e-global-color-*` / Astra) | El fetch a markdown **descarta el CSS** → nunca da hex. No estimar de una captura si podés leer el CSS. |
| Tipografías | `getComputedStyle(h1/body).fontFamily` + `<link fonts.googleapis>` | Suponer la fuente "a ojo" |
| Estructura + copy | Navegador renderizado (accessibility tree / DOM) + transcripción **literal** | Parafrasear el copy (la réplica es fiel a SU voz) |
| Imágenes (logo, fotos) | URLs reales del DOM; **hotlink** con autorización total, o bajar a `public/tenants/<slug>/` | Mapear la imagen equivocada (ver §3, muro de los sellos) |
| Contacto/horarios/redes | Footer renderizado | — |

---

## 2. Procedimiento (paso a paso, reproducible)

1. **Abrir el sitio en un navegador real** (Chrome MCP) y **navegar el render**, no el fetch.
2. **Extraer la paleta por CSS vars** (`getComputedStyle`): fondo, acento, texto, botones, secciones.
   Guardar cada hex con su uso. → van a las CSS custom properties de la réplica.
3. **Extraer tipografías** (display + texto) y su fuente (Google Fonts `<link>`).
4. **Recorrer la página de arriba a abajo** (scroll + screenshot por sección) y anotar el **orden de
   secciones**, el **copy literal** y el **layout** (grillas, splits, cards).
5. **Listar las imágenes reales** del DOM (con `naturalWidth>0`, filtrando logos/thumbs/sellos).
   Ojo con lazy-load: **scrollear primero** para forzar la carga, y si hace falta leer el **panel de
   red** para capturar todos los assets pedidos.
6. **Construir la réplica** en un solo HTML autocontenido (`public/previews/<slug>/index.html`):
   CSS vars = la paleta real; fuentes reales; secciones en orden; copy literal; imágenes reales
   (hotlink autorizado + `ASSET_MANIFEST` en comentario). Responsive + accesible (alt, aria, contraste).
7. **Verificar contra el original** lado a lado en el navegador (screenshots por sección). Corregir.
8. **Sello GSG + modo demo:** sello GSG en el pie **sin pisar** la marca ni el crédito del estudio;
   sin datos reales sensibles, sin secretos, sin precios inventados.
9. **Registrar el caso** (`docs/metodologia/registro-casos/<slug>.md`) y promover heurísticas nuevas.

---

## 3. Muros conocidos de la copia exacta (y su fallback)

> Cada uno salió de un caso real (Magra). Ver también `docs/metodologia/checklist-extraccion.md §3`.

- **Fetch→markdown descarta el CSS.** Nunca te da hex ni fuentes. → **Leé el render** con el navegador
  (`getComputedStyle`, CSS vars globales). *(Magra: la paleta real —oro `#c5ae86`, verde `#004f38`,
  crema `#f2e6d7`— sólo apareció leyendo las vars de Astra; a ojo se había estimado MAL "oxblood".)*
- **Imágenes que parecen de producto pero son SELLOS de marca.** En Elementor las fotos de producto de
  una card suelen ser **background-images de una columna hermana** (lazy), mientras que los `<img>`
  numerados (`5.png`, `7.png`, `9.png`…) resultan ser **stickers de marca** (en Magra: un smiley y un
  "grill & chill"). → Verificá **abriendo la imagen** antes de usarla; si la foto real es un background
  no extraíble en el tiempo del caso, **placeholder de marca marcado** + pedila para prod. **Nunca
  hotlinkees el asset equivocado.**
- **Lazy-load / SPA.** Las imágenes no están en el HTML inicial. → Scrollear para dispararlas y/o leer
  el **panel de red**; recién ahí listar los `src` reales.
- **Assets que no se pueden bajar (red del shell bloqueada).** → Hotlink temporal (autorización total)
  + `ASSET_MANIFEST` con destino local para bajarlos en prod.

---

## 4. Definition of done (copia exacta)

- [ ] Autorización registrada.
- [ ] Paleta = hex reales (de CSS vars), no estimados.
- [ ] Tipografías reales.
- [ ] Todas las secciones, en orden, con **copy literal**.
- [ ] Imágenes reales (o placeholder marcado + pendiente en el manifest); **ninguna imagen equivocada**.
- [ ] Contacto/horarios/redes fieles.
- [ ] Responsive + accesible.
- [ ] Sello GSG en el pie **sin pisar** la marca; modo demo (sin secretos/datos reales).
- [ ] Verificado contra el original en el navegador; caso registrado.

## Caso trabajado
Magra: `docs/metodologia/registro-casos/magra.md` · réplica en `public/previews/magra/index.html`.
