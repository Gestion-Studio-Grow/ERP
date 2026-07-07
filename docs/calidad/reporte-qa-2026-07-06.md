# Reporte QA — Demos y previews en vivo

**Fecha:** 2026-07-06
**Equipo:** Calidad / QA (GSG)
**Alcance:** una pasada de QA sobre lo que está EN VIVO hoy — `/demo` + los 5 previews.
**Método:** solo lectura. Se leyó el código fuente que está desplegado (los previews son
HTML estático commiteado en `public/previews/`, sin build; verificado que no hay cambios sin
commitear) y se verificó cada URL en vivo por HTTP/DOM sobre `https://erp-ch.vercel.app`.
No se tocó prod ni se arregló nada.

> **Contexto (aclaración del PMO):** lo publicado en `/previews/chestetica` es un **demo
> genérico**, NO el CH real (que vive en `main` + Neon, sin republicar). Este reporte evalúa
> lo que un usuario ve HOY en las URLs públicas.

---

## Resultado por producto (semáforo)

| Producto | Carga | CTA WhatsApp | Sello GSG | Veredicto |
|---|---|---|---|---|
| `/demo` | ✅ 200 | ✅ just-in-time | ✅ (marca GSG) | **OK** |
| `/previews/magra` | ✅ 200 | ✅ número real | ✅ pie | **OK con reservas** (fotos placeholder + assets hotlinked) |
| `/previews/chestetica` | ✅ 200 | ❌ **rota** (número falso, sin guarda) | ✅ pie | **DEFECTO CRÍTICO** |
| `/previews/adosmanos` | ✅ 200 | ⚠️ just-in-time ambiguo | ✅ pie | **OK con reservas** |
| `/previews/shinevelas` | ✅ 200 | ⚠️ just-in-time ambiguo | ✅ pie | **OK con reservas** |
| `/previews/breakpoint` | ✅ 200 | ✅ número real | ✅ pie | **OK** (todo foto = placeholder, por diseño) |

**Titular:** los 6 cargan y todos llevan el sello GSG. El problema serio está en **CH Estética**,
que es justo lo que revisó el dueño — y hay una **incoherencia de patrón de WhatsApp** entre los
previews que conviene unificar.

---

## Checklist de calidad (criterios de aceptación)

Aplicada a cada preview/demo:

1. **Carga sin error** — responde 200, no 404 ni pantalla de error; render completo.
2. **Fidelidad de marca** — nombre, paleta, tono y catálogo coherentes con el cliente real
   (o con el rubro de referencia declarado). No "genérico" donde se esperaba lo del cliente.
3. **Flujos andan** — filtros, carrito, reserva, modales: interacción sin romperse.
4. **CTAs / links funcionan** — WhatsApp abre un chat a un número **real o guardado**
   (nunca a un placeholder muerto); links internos y externos no quedan inertes.
5. **Funcionalidades completas** — no faltan piezas que el producto promete (secciones, precios).
6. **Coherencia** — mismo estándar entre productos; sin placeholders sueltos donde no se avisó.
7. **Accesibilidad básica** — foco visible, `prefers-reduced-motion`, roles/labels, teclado.
8. **Sello GSG presente** — crédito discreto de Gestión Studio Grow, sin pisar la marca del tenant.

---

## Defectos priorizados

### 🔴 CRÍTICOS

**C-1 · CH Estética: los CTA de WhatsApp mueren en un número falso.**
`public/previews/chestetica/index.html` es el **único** preview que abre WhatsApp directo a un
**número placeholder** (`5491100000000`) **sin la guarda just-in-time**. Todos los botones de
reserva (`waHola()`, `bookWA()` en cada servicio, "Escribinos por WhatsApp") hacen
`window.open("https://wa.me/5491100000000?text=...")`. Un cliente real que entre al link y toque
"Reservar turno" cae en un chat a un número inexistente. Evidencia: `index.html:191-199`.
Contraste: `/demo`, `adosmanos` y `shinevelas` piden el número just-in-time antes de abrir;
`magra` y `breakpoint` usan número **real**. CH es el tenant faro y es lo que el dueño estaba
mirando → es el peor lugar para tener el CTA roto. **Prioridad de corrección: máxima.**

**C-2 · CH Estética: el preview público sub-representa la marca frente a sus pares.**
Muy probablemente la raíz del *"no es lo que era"* del dueño. El preview de CH es delgado y
genérico: 205 líneas vs. 384 (magra) / 502 (shinevelas) / 931 (breakpoint); catálogo y precios
son de **referencia del rubro `estetica`** (no los servicios reales de CH), diseño de una sola
columna sin las secciones ricas (ritual, comunidad, bodegón, sets) que sí recibieron los otros
tenants. Es correcto que sea demo (el CH real está en `main`+Neon sin publicar), pero **como
vidriera pública de CH hoy queda por debajo del nivel del resto**. Evidencia: comparar
`chestetica/index.html` con `magra`/`breakpoint`/`shinevelas`. Recomendación QA: republicar la
vidriera CH real, o elevar este preview al mismo estándar experiencial que los pares.

### 🟠 MEDIOS

**M-1 · Incoherencia de patrón de WhatsApp entre previews.** Conviven tres patrones sin criterio
unificado: (a) número real directo — magra, breakpoint; (b) placeholder + prompt just-in-time —
adosmanos, shinevelas, demo; (c) placeholder directo sin guarda — chestetica (el bug C-1).
Definir UN patrón (recomendado: just-in-time cuando no hay número confirmado; número real cuando
sí) y aplicarlo a los 5. Sin esto, el bug de CH puede reaparecer en el próximo preset.

**M-2 · Prompt just-in-time ambiguo para un cliente real (adosmanos + shinevelas).** El prompt
dice *"Para abrir WhatsApp necesitamos tu número… Tu WhatsApp"*. Está pensado para que **quien
muestra la demo** cargue el número del negocio, pero como los previews se comparten como **link
público**, un prospecto real leería *"tu número"*, cargaría **el suyo**, y WhatsApp abriría un
chat **a sí mismo**. Evidencia: `adosmanos/index.html:290-311`, `shinevelas/index.html:327-351`.
Recomendación: cuando el link es público, precargar el número real del tenant (patrón M-1) o
recon­figurar el copy para que no se confunda con "el número del visitante".

**M-3 · Magra: 3 fotos de producto son placeholders visibles.** Las tarjetas de "Envasados al
vacío" (Ojo de bife / Churrasco / Patamuslo) muestran cajas rayadas con emoji, no fotos.
Documentado como pendiente (`magra/index.html:28-32, 293-305`), pero sobre una réplica que se
vende como "fiel", el dueño lo va a notar. Para venta: pedir/capturar las 3 fotos reales y bajarlas
a `public/tenants/magra/`.

**M-4 · Magra: todos los assets están hotlinked al sitio real del cliente.** Logo, hero (2.7 MB
sin optimizar), fotos gourmet y avatares de reviews cargan desde `magrameatmarket.com.ar`
(`index.html:211, 223, 228, 265-277, 330-340, 351`). Verificado: **hoy cargan** (el hero devuelve
200). Riesgo: dependencia externa frágil — si el sitio real agrega hotlink-protection, cambia el
theme o borra los assets, el preview se rompe con imágenes cortadas, sin aviso. Además el hero de
2.7 MB penaliza la carga. Para PROD: bajar todo a `public/tenants/magra/`.

### 🟡 MENORES

**m-1 · adosmanos: el CTA de Instagram es un link muerto.** `@adosmanospadel` tiene
`onclick="return false"` y no abre nada (`index.html:236`). O se cablea al IG real o se saca.

**m-2 · Accesibilidad (chestetica, adosmanos): navegación con `<a onclick>` sin `href`.** Los
links del menú no son enfocables por teclado ni operables con Enter (deberían ser `<button>` o
`<a href>`). Ej. `chestetica/index.html:108-110`, `adosmanos/index.html:203-205`. El resto de la
a11y (foco visible, `prefers-reduced-motion`, `aria-pressed`, labels) está bien resuelto en los 5.

**m-3 · shinevelas: el número de ejemplo queda cableado en el `href` al cargar.** `heroWa`/`footWa`
reciben `wa.me/5491176213834` en `href` en `updateWaLinks()` (`index.html:313-317`). El clic normal
está guardado por just-in-time (el `onclick` devuelve `false`), pero abrir-en-nueva-pestaña /
clic-medio **saltea la guarda** y va al número de ejemplo. Bajo impacto; se resuelve con el patrón
único de M-1.

**m-4 · breakpoint: toda la sección visual son placeholders de foto.** Es **por diseño** (rótulos
`data-photo` "listos para reemplazar", consistentes y prolijos), pero para un preview cara-a-venta
faltan fotos reales del club. También la fecha del torneo ("18, 25 y 26 de Julio") está hardcodeada
y se vuelve obsoleta (hoy está OK porque es futura).

**m-5 · Magra: sin banner "demo" arriba; solo el disclaimer del pie.** Por el método "copiar
exacto" se ve idéntico al sitio real; un visitante podría confundirlo con la web viva. Los otros
previews sí llevan banner/ribbon superior. Evaluar si Magra debería llevarlo también.

**m-6 · `/demo`: el número de captación sigue siendo placeholder en código** (`5491100000000`,
`demo-content.ts:89`). Guardado por just-in-time, así que **no está roto**, pero GTM debe fijar el
real antes de tráfico pago (ya documentado en el archivo). Nota menor: `metadata.generator` no
está seteado a "Gestión Studio Grow" a nivel app (sello formal del Gate); la marca GSG igual es
visible porque la demo ES de GSG.

---

## Lo que SÍ pasó bien (para no romperlo)

- **Los 6 cargan en vivo** (200) y **todos** llevan el sello GSG en el pie/marca.
- **`/demo`** es la implementación de referencia del just-in-time de WhatsApp: `force-static`,
  aislada de la DB, a11y sólida (congela auto-avance bajo `prefers-reduced-motion`, teclado, swipe).
- **breakpoint** es el más completo y prolijo: reservas con anti-solapamiento, tienda con carrito,
  clases, horarios, torneos, bodegón, identidad y módulos ERP; a11y ejemplar (`scope`, `caption`,
  `role="status"`, labels). Es el estándar al que deberían llegar los demás.
- **shinevelas** tiene catálogo rico (velas + aromas + deco + accesorios + sets + ritual) y lógica
  de envío/carrito coherente con el ERP.
- **magra** es una réplica de marca fiel (paleta, tipografías, wording, reviews reales) con el
  crédito del diseñador original preservado (`@noctiluma_`) — respeta al cliente.

---

## Recomendación de corrección (orden sugerido)

1. **C-1** — arreglar el CTA de WhatsApp de CH (bloqueante; es lo que mira el dueño).
2. **C-2** — republicar la vidriera CH real o elevar el preview al nivel de los pares.
3. **M-1 / M-2** — unificar el patrón de WhatsApp y desambiguar el prompt just-in-time para links públicos.
4. **M-3 / M-4** — bajar los assets de Magra al repo y reemplazar las 3 fotos placeholder.
5. Menores (m-1…m-6) — cuando se toque cada preview.

— Elaborado por GSG (Equipo de Calidad)
