**NO SE PUDO RECORRER:** (1) la demo publicada `https://wpe-prueba.vercel.app` (el proxy de salida rechaza la conexión, 403): el "antes" es `circuito-wpe/deploy/index.html` (commit 55262eb) servido en local; (2) nada de Vercel ni de producción: si `*.gsgapp.com.ar` apunta al proyecto del ERP, si la CDN comprime la respuesta del manejador y si `SITE_GATE_PASSWORD` está cargada (el portón taparía `/` de WPE); (3) el panel del negocio por dentro: `wpe-lab@gsgapp.com.ar` no entra con la clave común del laboratorio ("Email o contraseña incorrectos"); (4) el alta con el asistente de la consola usando los valores del README (el negocio del laboratorio se creó por script); (5) Google Fonts en el original: este Chromium no confía en el certificado del proxy, así que el "antes" se vio y se midió sin su tipografía.

# QA wpe-2609 — Circuito WPE servido por el ERP (26/09/2026)

Viaje: **"una jugadora entra desde el link de Instagram en el celular, mira el torneo en curso, abre el menú, busca, se inscribe (con errores, doble toque y recarga), y el organizador entra al modo organizador, lo usa y vuelve; después Soporte busca el negocio en la consola"**. Recorrido a 390 y a 1440 en `http://wpe.localhost:3215` (build de producción de esta rama, base `erp_lab`) contra el original en `:3216` (gzip) y `:3217` (sin comprimir). Evidencia: `.qa/wpe-2609/qa-recorrido/`.

## Gate
- `tsc --noEmit`: 0 errores.
- `npm test` (`qa-recorrido/npm-test.txt`): 4290 tests, 4283 pasan y 7 fallan: las 4 conocidas de XLSX y 3 de la suite "Vender en el navegador" (pantalla que esta rama no toca). Esa suite, corrida sola, da lo mismo en `main` 4b27521 y en esta rama (en la segunda corrida): 55 de 56, y la que falla es la #49 ("POS de la bandeja… red caída"). O sea que la #49 **ya fallaba en main** y no está en la lista de conocidas. Las otras 3 caen en cascada cuando la suite pasa su tope de 120 s con la máquina cargada. La suite tardó 126,3 s en la corrida completa y 123,7 s en la primera corrida sola de la rama, que también falló 4; corrida sola sin carga tardó 94,5 s en main y 97,4 s en la rama. Comparado por nombre contra main: sin regresiones. Evidencia: `vender-pantalla-main-4b27521.txt`, `vender-pantalla-solo.txt` y `vender-pantalla-rama-2.txt`.
- `next build` de producción: OK. Trazado de la función: entran sólo los 4 archivos del sitio.

## El viaje, paso por paso (móvil 390; en escritorio dio lo mismo)
| Paso | Esperaba | Pasó | Evidencia |
|---|---|---|---|
| 1. Abrir `wpe.localhost:3215` | 200, torneo en curso | 200 · "ETAPA 4 MAJOR 2026" · "EVENTO EN CURSO" · 846 jugados · 301 pendientes · 17 categorías · Inter propia | `rec-erp-movil.txt`, `lado-a-lado-movil-01-inicio.png` |
| 1b. Scroll de costado | ninguno | scrollWidth 390 = ancho 390 (también con el menú, la inscripción y el modo organizador abiertos) | `rec-erp-movil.txt` |
| 2-3. Menú → Ranking | abre, cierra y baja | aria-expanded=true, 6 enlaces; cierra y deja `#ranking` a 84 px | `erp-movil-02-menu.png`, `-03-ranking.png` |
| 4. Atrás del navegador | vuelve al inicio | vuelve a `/` | `rec-erp-movil.txt` |
| 5. Buscar | buscador | **a 390 no hay buscador** (el campo está oculto y no hay otra entrada). En 1440 anda: "ranking" → 1 resultado → Enter lleva a Ranking. Igual en el original | `rec-*-movil.txt`, `erp-escritorio-05-buscar.png` |
| 6-8. Inscribirse vacío / sin reglamento | no envía y dice qué falta | "Completá jugador/a, WhatsApp y compañero/a…" · "Tenés que aceptar el reglamento…". El WhatsApp acepta "abc" | `rec-erp-movil.txt` |
| 9. Enviar con doble toque | una sola inscripción | una sola (21/24 → 22/24), modal cerrado, aviso "✓ Inscripción enviada — Caballeros 3ra. Te confirmamos por WhatsApp en 48 h." **No sale a ningún lado** (la demo no manda nada) | `erp-movil-09-enviada.png` |
| 10. Recargar a mitad | vuelve limpio | vuelve limpio, se pierde lo tipeado, sin error | `rec-erp-movil.txt` |
| 11-13. Modo organizador | pide clave y entra | vacío y clave mala rechazan con mensaje; con la de demo entra como ORGANIZADOR y "Motor de torneo conectado — WPETorneo v1.1.0" | `lado-a-lado-movil-13-organizador.png` |
| 14-15. Gestión, Zonas, Llave, Programación, Configuración, Simular | cada vista sin error | las 5 vistas se ven; "Resultados simulados — … llave propagada hasta el campeón" | `erp-movil-14-org-*.png` |
| 16. Atrás con el organizador abierto | cierra el organizador | **sale del sitio** (about:blank; desde Instagram, vuelve a Instagram). Igual en el original | `rec-erp-movil.txt` |
| 17-18. Recargar, volver a entrar y salir | recuerda la sesión de la pestaña | entra directo; "Salir" devuelve el sitio con scroll | `erp-movil-18-salida.png` |
| 19. Manual | PDF | 200 `application/pdf`, 16.825 B, idéntico al original | `rec-erp-movil.txt` |
| 20. ¿Se llega al manual desde el sitio? | un enlace | **0 enlaces**: sólo con la URL directa. Igual en el original | `rec-erp-movil.txt` |

Consola del navegador en el ERP: **0 errores y 0 avisos** en los 4 recorridos (el original tira 1 error por carga: Google Fonts, por el certificado del proxy). Log del servidor (`server-3215.log`): sin errores del host `wpe`; los únicos son de las pruebas con subdominios que no existen.

## Mismo contenido
Texto visible idéntico línea por línea en 1440 (201/200) y en 390 (184/183). La única línea que falta es "Powered by Gestión Studio Grow" (oculta a propósito, ADR-043). El cuerpo es byte a byte el del original y `pulir.py` regenera el archivo servido idéntico. Capturas de página entera: `lado-a-lado-{movil,escritorio}-pagina-entera.png`.

## Consola de Soporte (`localhost:3215/operador`, 1440 y 390)
En el laboratorio aparece "Circuito WPE · wpe". Su ficha dice: En prueba · Genérico / Comodín · Sin plan · 1 persona. Sin scroll de costado y sin errores de consola (`consola.txt`, `consola-*-lista.png`, `consola-*-ficha.png`). **En producción no aparece hasta que el dueño haga el alta**: esta rama no da de alta nada allá.

## Otros negocios: antes (main 4b27521, mismo laboratorio, `:3218`) contra después (`:3215`)
66 pares host × ruta (`hosts.txt`, `hosts-antes-despues.json`): 16 cambian. De esos, 6 son de `wpe`, que es el cambio buscado, y 10 son `/sitio-estatico` en los otros 5 hosts. CH, MAGRA, MAGRA Canning, una dirección que no existe y el dominio a secas responden igual en `/`, `/tienda`, `/reserva`, `/admin`, `/admin/login`, `/manual.pdf`, `/og.png` e `/index.html`. Lo único que cambió es `/sitio-estatico`: antes daba la página 404 del sitio y ahora da un 404 de texto pelado ("No encontrado"). Sin negocio para el host (`wpe.example.com`), `/` y `/manual.pdf` responden 404 y el sitio no se sirve: falla cerrado. `wpex.` no se reescribe y `WPE.` en mayúsculas sí.

## Peso y tiempo de carga (mediana de 3; móvil con CPU 4x, 1,6 Mbps y 150 ms) — `carga.txt`
| | LCP | TBT | load | HTML transferido | Otros bytes |
|---|---|---|---|---|---|
| 1440 original (gzip) | 220 ms | 30 | 324 | 74,2 KB | Google Fonts falló (sandbox) |
| 1440 ERP | 236 ms | 14 | 148 | **274,9 KB (sin comprimir)** | Inter 47,4 KB |
| 390 original (gzip) | 568 ms | 385 | 1.049 | 74,2 KB | Google Fonts falló (sandbox) |
| 390 original (sin comprimir) | 712 ms | 353 | 1.712 | 273,1 KB | — |
| 390 ERP | **1.036 ms** | 442 | **1.957** | **274,9 KB** | Inter 47,4 KB |
CLS 0,0000 en 1440 y 0,0002 en 390, igual en todos. `next start` comprime la página de CH (gzip) pero **no la respuesta del manejador de WPE**. La medición "después" de la implementación (`lcp-variantes.txt`) usó un servidor estático con brotli, no el camino real del ERP, y aun así su LCP en celular dio peor que el original (852–896 contra 412–584 ms).

## Pulido medido
- **Toques de 44 px** (390, dedo): en el ERP quedan 0 blancos chicos en inicio, menú y acceso, y 2 en la inscripción (la casilla y el enlace del reglamento, cuya fila mide 44 px o más). El original tiene 13, 19, 16 y 17 (`equivalencia.txt`).
- **Foco con Tab** (1440, 64 Tab): el ERP no tiene ningún foco sin indicador; el original tenía 1 (la búsqueda).
- **Metadatos**: el título y la descripción están; `canonical` y `og:url` apuntan a `https://wpe.gsgapp.com.ar/`; `og:image` es absoluta (1200×630); el ícono de inicio mide 180×180; `generator` es GSG y `lang` es es-AR. Ojo: la descripción y la tarjeta para compartir dicen "inscripción abierta", pero la página dice "Inscripción cerrada".

## 🔴 Rompe el viaje o no deja cerrar
1. **"Y no aparece en la consola" sigue siendo cierto en producción.** WPE aparece sólo en el laboratorio. En producción aparece recién cuando el dueño haga el alta (Soporte → Alta de negocio) con el nombre corto exacto `circuito-wpe` y el link `wpe`, como indica `docs/tenants/circuito-wpe/README.md`. El asistente con esos valores no se probó.
2. **Rendimiento: por el camino real del ERP, el sitio carga peor que el original.** La página sale sin comprimir (274,9 KB contra 74,2 KB), y en celular el LCP es 1.036 ms contra 568 ms y la carga completa 1.957 ms contra 1.049 ms. El pedido era mejorar el rendimiento y, según el estándar §8, un número que empeora no cierra el slice sin corregirse o explicarse. Hay dos salidas: servir el HTML comprimido desde el manejador, o comprobar en un deploy que la CDN de Vercel lo comprime y volver a medir. En los dos casos queda por explicar el LCP en celular, que empeora con la precarga de la fuente.

## 🟡 Molesta pero se puede seguir
- **Contenido vencido de la demo (ya venía así).** Dice "Evento en curso" con fechas de agosto, la cuenta regresiva está en 00 y dice "Inscripción cerrada". Aun así, "Inscribirse al Major" acepta y confirma "Te confirmamos por WhatsApp en 48 h" **sin mandar nada**. La tarjeta nueva para compartir repite "inscripción abierta". Para difundir la dirección entre jugadores esto es rojo.
- El ingreso `wpe…/admin/login` dice **"Comerciante"**, con monograma C, y habla de facturar lo cobrado "por el banco y por Mercado Pago". La ficha "Circuito WPE / WPE" que se agregó en `src/lib/branding.ts` no se ve ahí, porque la identidad del producto le gana (`src/app/admin/login/page.tsx:42,53-54`). El README dice lo contrario.
- El botón Atrás con el modo organizador o un modal abierto saca del sitio en vez de cerrarlo (igual que el original).
- A 390 no hay forma de buscar (igual que el original).
- No hay enlace al manual (igual que el original).
- El WhatsApp de la inscripción acepta cualquier texto (igual que el original).
- `wpe…/tienda` y `/reserva` muestran pantallas genéricas de la plataforma ("Circuito WPE" y "Panel de gestión") y `wpe…/index.html` da 404 (en el original, sirve la página).
- `/sitio-estatico` en los otros negocios devuelve texto pelado en vez de la página 404 del sitio.
- **De la plataforma, no de esta rama:** una dirección sin negocio (`noexiste.localhost/`) responde 200 con una landing de estética que dice "La Alameda · Canning" y "Atienden Carolina, Macarena y Romina". Es texto fijo de `src/app/(site)/page.tsx:167`, no sale de la base. En la misma dirección, `/tienda` y `/reserva` dan 500. Antes y después es igual.
- Laboratorio: el botón "Abrir su panel" de la consola apunta a `https://wpe.localhost/admin`, sin puerto. La ficha no tiene enlace al sitio público del negocio, y su lista de pendientes le habla a un organizador de torneos de "Dirección del local" y del "cliente que va a retirar".

## 🟢 Anduvo (recorrido, no supuesto)
Se probó todo lo de la tabla, a 390 y a 1440, en el ERP y en el original, con el mismo resultado paso por paso:
- apertura, menú, anclas y Atrás;
- búsqueda en escritorio;
- inscripción: vacía, sin reglamento, doble toque (una sola), recarga a mitad;
- acceso organizador: vacío, clave mala y la de demo;
- las 5 vistas del organizador, Simular, recarga con la sesión y Salir;
- el manual.

Además:
- 0 errores de consola en el ERP y sin scroll horizontal a 390;
- texto idéntico salvo el sello;
- metadatos y cabeceras (`nosniff`, `strict-origin-when-cross-origin`, `private`);
- falla cerrado sin negocio;
- los otros negocios, iguales que en `main` en 45 de 55 pares; los 10 que difieren son `/sitio-estatico` y `/sitio-estatico/manual.pdf` en cada uno de los 5 hosts (404 de texto en vez de la página 404 del sitio);
- la consola de Soporte lista a WPE en el laboratorio.
