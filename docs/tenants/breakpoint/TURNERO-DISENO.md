# Break Point Pádel — Turnero web: decisiones de diseño

**Fecha:** 2026-10-15 · **Rol:** Diseño & Marca (célula del pool, ADR-053) · **Estado:** maqueta lista para el JS (`app.mjs`, lo escribe otra sesión en paralelo).
**Archivos:** `public/previews/breakpoint/turnero/index.html` · `public/previews/breakpoint/turnero/turnero.css`
**Marca:** autorizada por el dueño de GSG el 15/10/2026 (`MARCA-INSTAGRAM.md`; falta asentar la firma en ADR-034 [A VALIDAR]).
**Base visual:** estilo «Chapa» del backoffice (`ESTILOS.md` §2.1), llevado a la vidriera pública con los colores medidos del Instagram.

## 1. Idea

El club se comunica con **placas**: títulos en sans pesada, cursiva y condensada, y bandas azules como trazos de pincel («ESCUELITA DE PÁDEL», «ANOTATE»).
El turnero toma ese lenguaje en un solo gesto: el titular «RESERVÁ / TU CANCHA», con la segunda línea en blanco sobre una banda azul recortada.
Todo lo demás es Chapa: header azul sólido con el filete doble naranja, bordes en vez de sombras, radios de 2 a 6 px y números en columna.
El protagonista es **la pelota naranja**: marca cada franja horaria, gira mientras esperamos la seña y, cuando la transferencia concilia, cae y pica al lado del check.
No hay degradés, vidrio esmerilado, fotos de stock ni urgencia inventada.

## 2. Tokens

### Color (claro / oscuro por `prefers-color-scheme`, sin JS)

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--marca` | `#035BA8` | `#035BA8` | header, botón primario, día elegido, banda del titular (siempre la de marca) |
| `--azul` | `#035BA8` | `#7DB6F2` | texto/borde azul sobre el papel (en oscuro se aclara para AA) |
| `--azul-s` / `--azul-t` | `#E3EEF9` / `#02427D` | `#14304E` / `#A9CDF6` | etiqueta «Techada», resumen de la reserva |
| `--nar` | `#DC6E22` | `#DC6E22` | pelota, filete del header, borde del toast (decorativo) |
| `--nar-ui` | `#BF5A00` | `#FF9A3D` | trazos naranjas finos: borde de turno pico, foco, lista de espera |
| `--nar-t` / `--nar-s` | `#8F4400` / `#FFEBD9` | `#FFB873` / `#3B2512` | texto naranja chico («Pico», «Esperando seña») |
| `--ok` / `--ok-s` | `#1B7A3D` / `#DDF3E3` | `#62CF8E` / `#10311F` | «¡Turno firme!», reserva firme |
| `--mal` / `--mal-s` | `#B3261E` / `#FBE2E0` | `#FF8C82` / `#44191A` | errores, cancelar |
| `--tinta`/`--tinta2`/`--gris` | `#101418`/`#2B3138`/`#5B6570` | `#EEF2F6`/`#CBD3DC`/`#9AA7B5` | texto |
| `--linea`/`--linea2` | `#7D8893`/`#D7DCE2` | `#5A6B7E`/`#26323F` | bordes de control (≥3:1) / divisores |
| `--papel`/`--panel` | `#F5F7F9`/`#FFFFFF` | `#0E1620`/`#141F2C` | fondo / tarjetas |

**Contraste calculado (WCAG 2.x):** blanco sobre `#035BA8` 6,8:1 · `#035BA8` sobre papel 6,4:1 · `#02427D` sobre `#E3EEF9` 8,6:1 · `#8F4400` sobre `#FFEBD9` 6,0:1 · blanco sobre `#1B7A3D` 5,4:1 · `#1B7A3D` sobre `#DDF3E3` 4,6:1 · `#5B6570` sobre blanco 5,9:1 · `#BF5A00` como trazo sobre papel 4,2:1 (≥3:1) · `#7DB6F2` sobre `#0E1620` 8,5:1.
**Nota sobre el naranja:** `#BF5A00` contra blanco puro da **4,49:1** y queda apenas por debajo de AA para texto chico. Por eso va en trazos y bordes, y el texto naranja chico usa `#8F4400`. El naranja de marca `#DC6E22` sólo se usa en la pelota y en elementos decorativos.

### Tipografía

| Rol | Fuente | Detalle |
|---|---|---|
| Placas (h1, franjas, títulos de diálogo y de tarjeta, número del día) | **Anton** (Google), cursiva sintetizada, MAYÚSCULAS | h1 `clamp(44px, 12.5vw, 76px)/.98`; franja 22/28; diálogo 26; tarjeta 24. Google Fonts no publica Anton Italic, así que la cursiva la sintetiza el navegador, como en las placas del club |
| UI y cuerpo | **fuente del sistema** (`system-ui`, SF, Segoe, Roboto) | 16/1.45; hora del turno 22/28 800 con `tabular-nums`; precio 16 800 |
| Alias y código | `ui-monospace` | para dictar y copiar sin confundir 0/O |
| Logo | trazos SVG, sin fuente | geométrica fina tipo Montserrat Light, dibujada a mano: no carga Montserrat |

### Espaciado, forma y elevación
Grilla de 4 px (los pasos que se usan son 2, 4, 6, 8, 10, 12, 14, 16, 20, 24 y 28). Radios: 2 px en botones y etiquetas, 4 px en tarjetas, controles y turnos, y 6 px en diálogos. El chip nunca es una píldora.
La elevación usa bordes. Sólo llevan sombra lo que flota de verdad: los diálogos y el aviso.
Firmas de Chapa: el **filete doble naranja** bajo el header, la **barra izquierda de 4 px** en cada turno (azul si es normal, naranja si es pico) y el **subrayado naranja** del día elegido.

## 3. Movimiento (sólo `transform`/`opacity`, salvo una excepción anotada)

`--e-out: cubic-bezier(.2,0,0,1)` para entradas y `--e-in: cubic-bezier(.4,0,1,1)` para salidas.

| Momento | Selector | Duración / curva | Para qué |
|---|---|---|---|
| Toque en turno, día o botón | `:active` → `scale(.97)` | 60 ms | confirmar el toque en el dedo |
| Hover en escritorio | `.slot:hover` → `translateY(-2px)` + borde azul | 120 ms | mostrar qué se puede tocar (sólo con `hover:hover`) |
| Llega un turno por tiempo real | `.slot.is-nuevo` → entra desde 8 px + destello naranja 2 px | 420 ms `--e-out` + 1,6 s | que se note que **apareció** sin pegar un salto |
| Alguien tomó el turno | `.slot.is-saliendo` → cartel «Lo acaban de reservar» y después achica a .9 y se apaga | 640 ms (se mantiene el 45 % para que se pueda leer) | explicar **por qué** desaparece |
| Hoja de diálogo (celular) | `dialog` sube desde `translateY(100%)` con `@starting-style` | 260 ms `--e-out` | hoja nativa que sube del pulgar |
| Diálogo (escritorio) | fundido + 12 px | 180 ms | — |
| Fondo del diálogo | `::backdrop` opacidad | 200 ms | — |
| Indicador «En vivo» | `.vivo.on::after` → `scale(2.8)` y opacidad a 0 | 1,8 s infinito | latido de conexión viva |
| Skeleton | `.sk::after` → `translateX(-100%→100%)` | 1,3 s lineal | «estamos cargando», sin cambiar de tamaño |
| Esperando la seña | `#pago-ok .aro` → `rotate` | 1,4 s lineal | espera activa |
| **¡Turno firme!** | `#dlg-pago.is-firme`: círculo verde `scale(.4→1)` 260 ms → check trazado 360 ms (retardo 160) → la pelota cae y pica dos veces (1 s, retardo 260) → la etiqueta pasa a verde con un pop de 260 ms | ~1,3 s en total | el momento de alegría: la plata llegó |
| Aviso | `#aviso.on` → sube desde abajo | 220 ms | — |

**Excepción anotada:** el check anima `stroke-dashoffset`, que se repinta y no corre en el compositor. Lo pidió el contrato. Son 72 × 72 px durante 360 ms, una vez por reserva: el costo es despreciable.
**`prefers-reduced-motion: reduce`:** todas las animaciones y transiciones pasan a durar 1 ms y una sola iteración, y las View Transitions se apagan. Se eligió 1 ms en vez de `none` a propósito: así **`animationend` sigue disparando** y el JS que saca `.is-saliendo` al terminar no se queda trabado. Los estados finales (check visible, pelota quieta) están escritos como estado base, no como fin de la animación.
**View Transitions (opcional):** `#grilla` tiene `view-transition-name: grilla`. Si el JS envuelve el cambio de día en `document.startViewTransition`, la grilla hace un fundido cruzado.

## 4. Presupuesto de performance y cómo se cumple

| Meta | Cómo |
|---|---|
| CSS < 20 KB | un solo `turnero.css`, de ~19,6 KB sin comprimir (≈ 4–5 KB con gzip), cacheable. No hay CSS en JS |
| LCP < 1,5 s en 4G | el LCP es el h1 de texto. **Cero imágenes** (logo y favicon son SVG inline o data-URI). La fuente de las placas **no bloquea**: `media="print"` + `onload` y `display=swap`. El h1 pinta primero con la fuente de respaldo y no se anima la opacidad del candidato a LCP (trampa medida en QBO, skill `vidriera-de-autor` §5) |
| Fuentes mínimas | sólo Anton, recortada con `&text=` a mayúsculas A–Z, ÁÉÍÓÚÑÜ, dígitos y ¡!¿?$.,:- (unos pocos KB). El cuerpo usa la fuente del sistema: 0 bytes. `preconnect` a googleapis y gstatic |
| **CLS 0** | alturas reservadas para todo lo que llega async: `#dias` `min-height:78px` (con chips fantasma por CSS mientras está vacío), skeleton de 6 turnos con la misma altura que un turno real (116 px) y el mismo alto de título de franja (28 px), `#grilla` `min-height:300px`, `#subtitulo` reservado a 2 líneas en el celular, y titular siempre en 2 líneas con `line-height` fijo, así el cambio de fuente no cambia la altura. `.is-firme` oculta el contador con `visibility` (no lo saca del flujo) y `.resumen` tiene `min-height` |
| Nada de scroll horizontal | `overflow-x: clip` en el body, porque `hidden` rompería el `position: sticky` del lateral. La tira de días scrollea **dentro** de sí con `scroll-snap` y `overscroll-behavior-x: contain` |
| Animaciones baratas | todo es `transform`/`opacity`, salvo el check (§3) |

**Sin verificar en esta entrega:** no se corrió Lighthouse ni se renderizó en un navegador (esta célula no tiene navegador ni shell). Medirlo cuando esté `app.mjs`: Lighthouse móvil (LCP, CLS, TBT) y bytes reales con `performance.getEntriesByType("resource")`.

## 5. Accesibilidad (Fiori + ángulo argentino)

- **Diálogos nativos** `<dialog>` con `aria-labelledby`. Esc cierra. El de ingreso trae una ✕ con `form method="dialog"`, que cierra sin JS.
- **Labels reales** en todos los campos, con `autocomplete` correcto (`username`, `current-password`, `new-password`, `name`, `tel`, `email`), `inputmode` y `font-size:16px` para que iOS no haga zoom. El hint de la clave va atado con `aria-describedby`.
- **Avisos que se anuncian:** `#res-error` y `#login-error` (`role="alert"`, vacíos y visibles: un `display:none` no se anunciaría), `#aviso` (`role="status"`), `#pago-estado` (`role="status"`, anuncia «¡Turno firme!»), `#en-vivo` (`role="status"`, anuncia «Sin conexión») y `#grilla` (`aria-live="polite"` + `aria-busy`). El contador `#pago-cuenta` es `role="timer"` y no se anuncia cada segundo.
- **Días:** `role="group"` + botones con `aria-pressed`. Se eligió en vez de `tablist`, porque un tablist exige `role="tab"`/`aria-selected` y el contrato usa `aria-pressed`.
- **Duración:** radios reales dentro de un `fieldset` con `legend`, ocultos visualmente pero enfocables. El foco se dibuja en el label.
- **Objetivos ≥ 44 px** en todos los controles. Turno de 116 px de alto y día de 60 × 68.
- **Foco visible:** 3 px naranja `--nar-ui` en todo, y blanco sobre el header azul.
- **Ángulo argentino:** criollo y con tuteo («Avisame si se libera», «te avisamos al toque», «¿Con quién jugás?»), precios en `$` con punto de miles (los formatea el JS), seña por **transferencia con alias y código** en el concepto, y comprobante **por WhatsApp**. El botón de WhatsApp lleva un globo genérico y **no el logo de WhatsApp**, que es marca de un tercero (ADR-042). El botón de Google sí usa la «G», según la guía de marca de Google para el ingreso.
- **Honestidad de la demo:** una cinta fija dice «Demo: los datos son de ejemplo y no se guardan», hay una nota en el ingreso y el botón «Simular comprobante (demo)» va con borde punteado. `noindex` mientras sea preventa.

## 6. 390 px vs 1440 px

- **390 (diseño base):** una columna: cinta, header de 68 px (logo 48, «En vivo», «Ingresar»), titular, días a sangre con scroll-snap, filtros (el segmentado y el check bajan a dos filas), grilla de **2 columnas** de turnos, lista de espera, Mis reservas, «Cómo es» y pie. Los diálogos son **hojas inferiores** con manija, `92dvh` y `safe-area-inset-bottom`.
- **≥ 600:** los días dejan de ir a sangre, el subtítulo pasa a una línea y la grilla usa `auto-fill` de 164 px.
- **≥ 1024 (1440 se ve así):** contenedor de 1200 px y **dos columnas** (`1fr` + 360 px). A la izquierda van el titular de 76 px, los días, los filtros y una grilla de 4 a 5 turnos por fila. A la derecha va el **lateral pegajoso** con Mis reservas y «Cómo es». Los diálogos se centran en 440 px.

## 7. Contrato de DOM: notas para quien escribe `app.mjs`

- `#pago-cuenta` contiene **sólo `mm:ss`**. El texto «La reserva se sostiene … min» está fijo alrededor.
- `#lista-reservas` trae un `<li class="reserva-vacia">Todavía no tenés reservas</li>`. Reemplazalo (`innerHTML`/`replaceChildren`) al pintar.
- `#en-vivo` lleva el texto. El punto es un `::before`, así que podés cambiar `textContent` sin perderlo.
- `.slot.is-saliendo`: sacalo del DOM en `animationend`, que dispara también con movimiento reducido. `.slot.is-nuevo`: sacale la clase a los ~1,6 s si querés que el destello pueda repetirse.
- Al reemplazar el skeleton, poné `aria-busy="false"` en `#grilla` y cambiá `body[data-estado]`. Con `sin-conexion`, la grilla baja a 60 % de opacidad.
- Botones de `.reserva`: pueden ir sueltos dentro del `<li>` o envueltos en un `<div>`; ambos casos quedan en una fila propia debajo de la cancha.
- `#btn-whatsapp` viene con `href="#"`; el JS pone el `wa.me` con el texto.

## 8. Desvíos del contrato

1. `#dias` usa `role="group"` (con `aria-labelledby` al rótulo «Elegí el día») en lugar de `tablist`, por coherencia con `aria-pressed` (§5).
2. Agregados que no rompen nada: el rótulo `.paso` «Elegí el día», la ✕ de cierre nativa en `#dlg-login`, la tarjeta «Cómo es» en el lateral, un `<p class="sr">` de «Cargando…» dentro de `#grilla` y la cinta de demo.
3. Para el texto naranja chico se usa `#8F4400` en vez de `#BF5A00`, que da 4,49:1 sobre blanco. `#BF5A00` queda para trazos.

## 9. Pendientes

- Reemplazar el logo provisional (comentario `<!-- LOGO: reemplazar por el SVG oficial de ccr-63ed11dc-brcdpp -->` en el HTML).
- Validar con el club que la ubicación es «Ezeiza» ([INFERIDO] en `MARCA-INSTAGRAM.md`).
- Medir Lighthouse y CLS con el JS integrado (§4).

— Elaborado por GSG
