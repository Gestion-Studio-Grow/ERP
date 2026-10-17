# Performance de las terminales de mostrador (T-1..T-7) — auditoría con números

**Fecha:** 2026-10-17 · **Rama:** `ccr-f8859297-5ru6oe` (diff `78abc617...HEAD -- src`) · **Célula:** Plataforma / Deploy / Infra
**Base de comparación ("antes"):** `origin/main @78abc617`, exportado con `git archive` fuera del repo y compilado igual.
**Scripts y resultados crudos:** `/tmp/claude-0/-home-user/66198f27-4e14-5cb7-a219-1ba77d397b30/scratchpad/perf/` (`scripts/`, `raw/`).
**Base de datos:** ninguna. No había `DATABASE_URL` en el entorno ni en archivos `.env`; Prisma apuntaba a `127.0.0.1:5432` (nadie escuchando). Neon no se tocó.

---

## 0. Principios con los que se midió (ADR-052)

- **Lo que importa es el tiempo entre que el lector termina y la línea aparece**, y que ninguna lectura se pierda. En una caja con mucho movimiento, una lectura perdida cuesta más que 10 ms de render.
- **Se mide antes de tocar, y se toca sólo lo que el número justifica.** Si algo cuesta microsegundos, no se "optimiza": se anota y se deja.
- **Sin el módulo `terminal` todo tiene que quedar igual** (CH vive en producción). Cada arreglo se pensó para no cambiar nada a quien no tiene el módulo.
- **Nada de Neon ni de deploy.** Todo en local, sin base; lo que necesita base y sesión se mide montando el componente real en Chromium con dobles de las server actions.
- **Zona de de-sesgo: ESTÁNDAR** (ADR-046) para números, código y criterios; la prosa, en criollo claro.

## 1. Cómo se midió

| Qué | Cómo |
|---|---|
| Núcleo del lector y catálogo | `scripts/micro-lector.ts` (Node 22 + tsx), catálogos sintéticos de 500, 5.000 y 20.000 productos con EAN-13 válidos |
| "Ráfaga → línea" y re-renders | `scripts/harness.mjs`: `VenderForm` y `CajaRapida` **reales**, armados con esbuild en modo producción + profiling de React (`<Profiler>`), montados en el Chromium de Playwright (`/opt/pw-browsers`), con las server actions reemplazadas por dobles (mismo patrón que `vender-pantalla.test.ts`). El lector se simula con teclas de verdad de Playwright: 13 dígitos a 10 ms + Enter. Latencia = `timeStamp` del Enter → `MutationObserver` que ve la línea (DOM) y → el cuadro siguiente (`requestAnimationFrame` + `setTimeout 0`). 15 lecturas por escenario, se descartan las 2 primeras. También con la CPU frenada ×4 (CDP `Emulation.setCPUThrottlingRate`) para simular una PC de caja barata |
| Peso del JS por ruta | `scripts/peso-js.mjs`: suma `rootMainFiles` (`.next/build-manifest.json`) + `entryJSFiles` de layouts y página (`.next/server/app/**/page_client-reference-manifest.js`, el manifiesto de Turbopack en Next 16). gzip nivel 9. "Página" = lo que baja al navegar a esa ruta desde otra del panel |
| Render real | `npm run build` + `next start` local sin base, Lighthouse 12 (móvil, throttling simulado) sobre las rutas que sirven sin base |
| Impresión | `harness.mjs` escenario `imprimir-*`: 50 ventas seguidas con «Imprimir solo al cobrar», pasando el lector **sin tocar la pantalla** entre venta y venta |

## 2. Tabla de métricas (antes → después)

"T-1..7" = la rama tal como estaba; "arreglado" = con los cambios de esta auditoría. Navegador a CPU normal salvo que diga ×4.

| Métrica | Antes (main) | T-1..7 | Arreglado |
|---|---|---|---|
| **Vender: Enter → línea en pantalla** (5.000 prod.) | no había lector | 3,8 ms | 4,2 ms (ruido) |
| Vender: Enter → cuadro siguiente (5.000 / 20.000) | — | 5,7 / 5,4 ms | 6,0 / 6,3 ms |
| Vender: Enter → línea, CPU ×4 (5.000) | — | 19,7 ms (p95 32) | 16,5 ms (p95 19,3) |
| Vender: renders mientras llegan los 13 dígitos | — | **0** | 0 |
| Caja con lector: Enter → línea (5.000) | 2,7 ms | 2,7 ms | 2,7–3,3 ms |
| Caja con lector: Enter → línea, CPU ×4 (5.000) | 14,3 ms | 14,4 ms | 14,3 ms |
| Caja: renders por lectura (input controlado, ya era así) | 14 | 14 | 14 |
| **Vender: render al abrir, 5.000 productos** | 131 ms | 112–119 ms | **27–31 ms** |
| **Vender: render al abrir, 20.000 productos** | 401 ms | 402–412 ms | **35–46 ms** |
| Vender: render al abrir, 5.000 prod., CPU ×4 | — | 861 ms | **121 ms** |
| **Lecturas perdidas en 50 ventas con «Imprimir solo»** (Caja / Vender) | — | **49 / 49** | **0 / 0** |
| iframes de impresión tras 50 ventas (Caja / Vender) | — | **50** / 1 | **1 / 1** |
| Memoria JS tras 50 ventas (Caja) | — | 23,5 MB | 7,8 MB |
| JS primera carga `/admin/vender` (gzip) | 201,9 kB | 208,2 kB | 208,4 kB |
| JS que suma la página `/admin/vender` (gzip) | 28,0 kB | 34,1 kB | 34,2 kB |
| JS primera carga `/admin/caja-rapida` (gzip) | 187,1 kB | 190,4 kB | 190,6 kB |
| JS primera carga `/admin/ajustes/terminal` (gzip) | no existía | 177,6 kB (página 3,5 kB) | 177,7 kB |
| JS `/admin/ventas` · `/admin/pedidos` · `/admin` (gzip) | 183,8 · 203,0 · 175,0 kB | 185,5 · 203,3 · 175,1 kB | 185,6 · 203,4 · 175,1 kB |
| Lighthouse `/admin/login` (perf / a11y / LCP / CLS / TBT) | 94–96 / 100 / 2,6–2,9 s / 0 / 100 ms | 95–97 / 100 / 2,6–2,9 s / 0 / 60–80 ms | sin cambios en esa ruta |
| Lighthouse `/demo` | 95 / 100 / 2,9 s / 0 / 80–100 ms | 94–97 / 100 / 2,5–3,0 s / 0 / 90–100 ms | — |
| Lighthouse `/` (vidriera) | 91–93 / 100 / 3,2–3,5 s / 0 / 40 ms | 91–92 / 100 / 3,3–3,5 s / 0 / 50 ms | — |

Núcleo puro (Node, mediana): una ráfaga completa de 14 teclas por la máquina del detector = **2,5 µs**; una tecla ≈ 0,9 µs; `quitarPrefijoSufijo` 0,2 µs (con prefijo `]E0` y STX/ETX también); `resolverCodigo` 0,3–0,5 µs **sin importar el tamaño del catálogo** (es un `Map`). `indexarPorCodigo`: 0,08 ms (500), 0,85 ms (5.000), 3,8 ms (20.000); lo que hace Vender (map + indexar) 4,9 ms con 20.000. Está memoizado (`useMemo` sobre `[products, conLector]`): se arma **una vez** al hidratar, no por render ni por tecla.

## 3. Hallazgos y arreglos

**H1 — El ticket impreso se quedaba con el foco y la lectura siguiente se perdía (arreglado).** `TicketVenta` llamaba `iframe.contentWindow.focus()` antes de `print()` y nunca devolvía el foco. Con el teclado adentro del iframe, el lector "tipeaba" en el documento del ticket: en 50 ventas seguidas con «Imprimir solo», **49 lecturas no entraron** (en Caja y en Vender), y el cajero tenía que tocar la pantalla en cada venta. Ahora, después de `print()`, el foco vuelve a donde estaba (el campo del lector en Caja) o a la página (Vender). Medido: 0 de 50 perdidas.

**H2 — Un iframe huérfano por venta en la Caja con lector (arreglado).** Cada `TicketVenta` creaba su iframe y no lo sacaba al desmontarse; en la Caja el ticket cobrado se desmonta con el próximo producto. Con la impresión automática eran 50 iframes en 50 ventas (23,5 MB de memoria JS contra 7,8 MB). Ahora hay **un solo iframe por página**, compartido. El hilo no se bloquea: en las 50 ventas hubo 1 tarea larga (38 ms de TBT en total).

**H3 — Vender, después de cobrar, dejaba el foco en el buscador y la próxima lectura se escribía como texto (arreglado, sólo con el módulo).** `limpiar()` lleva el foco al buscador del renglón nuevo, y Enter en el peso/cantidad también (`prod-N` en el diseño de siempre, `vender-buscar` en el nuevo). En un campo de texto el teclado es de la persona, así que el código quedaba escrito en el buscador ("Sin resultados para 7790…") y la línea no entraba. Con el módulo `terminal` (y sólo con él), el foco ya no se lleva al buscador: se suelta el campo y queda en la página, donde el lector lee. Para buscar por nombre se toca el buscador. **Es un cambio de comportamiento para el Gate**: sin el módulo, idéntico a antes.

**H4 — Abrir Vender con un catálogo grande bloqueaba el hilo 0,4 s (arreglado).** No era del lector: el armado de las opciones del buscador llamaba `fmtMoneyARS` por producto, que usa `toLocaleString` con opciones y arma un `Intl.NumberFormat` nuevo por llamada (**30 µs** cada una: 150 ms con 5.000, 580 ms con 20.000 en Node). Ahora esa lista usa un formateador armado una vez (0,7 µs por precio) que da **el mismo texto** (comparados 28.752 importes de −5.000 a 200.000: 0 diferencias). Render al abrir: 401 → 35 ms con 20.000; con CPU ×4 y 5.000, 861 → 121 ms. El lector es lo que trae catálogos con EAN de miles de productos a Vender: por eso entra en esta auditoría.

**Sin cambios, con su porqué:**
- **El listener global no re-renderiza el formulario por tecla**: 0 renders durante los 13 dígitos en Vender (`useLectorDeRafaga` guarda la ráfaga en un cierre, no en estado, y se suscribe una vez por configuración del lector). En la Caja hay 14 renders por lectura porque el campo del lector es un input controlado: **ya era así en main** (mismos números antes y después) y a ×4 cada uno cuesta ~5 ms, por debajo de los 10 ms entre teclas.
- `usePerfilDeTerminal` lee `localStorage` en cada render (28 lecturas por lectura en la Caja con el módulo): cada una cuesta **0,57 µs** en Chromium → 16 µs por lectura. No se cachea: no se ve en ningún número.
- Sin el módulo, `claveSegura` tira y ataja un `RangeError` por render (4 µs). Ruido; se deja.
- **Peso del JS:** las piezas del terminal suman 4,4 kB gzip a Vender (lector-core 1,0 · usar-lector 0,9 · usar-perfil + perfil-core 1,2 · señal 0,6 · `indexar/resolver` + EAN + balanza 1,6) y 3,3 kB a la Caja. No se pasan a `import()` dinámico: es el 2–3 % de la ruta, se compila en menos de 1 ms, y cargarlo tarde haría que la **primera** lectura llegue antes que el código. `/admin`, `/admin/login` y `/demo` no suman nada del terminal (verificado por firmas de texto en los chunks); `manifest-core` y `terminal.server.ts` no aparecen en ningún chunk del cliente.

**Servidor:**
- `terminalDelEquipo` (`src/lib/terminal/terminal.server.ts:32`): `getNegocioApps(role)` está cacheado por pedido (`src/apps/contexto.server.ts:76`, `react.cache`) y `requireApp` ya lo llamó con el mismo rol → 0 consultas nuevas. **Sin el módulo, corta ahí: 0 consultas** (CH). Con el módulo suma `getCurrentTenantSlug` (`src/lib/tenant-site.ts:10`): en la carga completa lo encuentra cacheado (el layout lo pidió vía `getTenantBrand`, `src/lib/branding.ts:255`); en una navegación dentro del panel el layout no se vuelve a renderizar y es **1 lectura por clave primaria**, en paralelo con el resto del `Promise.all` (no suma espera).
- `/api/pwa/admin.webmanifest` (`src/app/api/pwa/admin.webmanifest/route.ts:30`): sin sesión hace **2 lecturas chicas por índice** (resolver el host, `src/lib/tenant.ts:159`, y el slug, `src/lib/tenant-site.ts:12`) y nada más; la marca y los íconos son puros. `Cache-Control: private, max-age=300` → como mucho 12 pedidos por hora por equipo. Medido sin base: 88 ms la primera vez (con el intento de conexión fallido), 542 B de respuesta.

## 4. Lo que no se pudo medir, y por qué

- **`/admin/vender`, `/admin/caja-rapida` y `/admin/ajustes/terminal` servidas de verdad (Lighthouse, LCP, CLS):** necesitan sesión y base. Sin base devuelven 500 incluso con `DEMO_MODE_ENABLED=true`, y golpear Neon está prohibido. Se midió el componente real aislado (sección 1); el LCP/CLS de esas pantallas queda para un QA con base de prueba.
- **LCP móvil de `/admin/login`, `/demo` y `/` (2,5–3,5 s, arriba del umbral de 2,5 s):** es de antes (main da lo mismo), con throttling simulado de Lighthouse y servido local; no lo tocan T-1..T-7.
- **`print()` real en modo kiosco y en una térmica:** el Chromium sin pantalla no abre el diálogo ni manda a una impresora; cuánto bloquea el hilo un `print()` real (armar el trabajo de impresión) se mide en el equipo, con `--kiosk-printing`.
- **El sonido:** sin salida de audio en este entorno; el `AudioContext` se crea recién con un gesto y sólo con «Sonido» prendido.
- **INP real:** se aproximó con la latencia Enter → cuadro y las tareas largas; el INP de campo necesita usuarios reales.

## 5. Recomendaciones fuera de mi alcance (para quien sea dueño de esos archivos)

1. **`fmtMoneyARS` (`src/components/ui/format.ts:27`)** arma un `Intl.NumberFormat` por llamada (30 µs). Cachear un formateador por cantidad de decimales arregla lo mismo que H4 en todo el sistema, con el mismo texto.
2. **El buscador (`src/components/ui/buscador-filtro.ts:17`)** normaliza etiqueta y detalle de TODAS las opciones en cada tecla: 8,5–14,7 ms por tecla con 20.000 productos (Node), ~35–60 ms en una PC de caja lenta. Normalizar una vez por lista (memo) lo baja a una pasada de `includes`.
3. **El manifiesto** podría resolver el slug en la misma lectura que el host (1 consulta en vez de 2) y cachearse un día en vez de 5 minutos (cambia poco).
4. **`useLectorDeRafaga`** usa `performance.now()` en el momento de atender la tecla; con el hilo ocupado, teclas de una persona que quedaron en cola se atienden juntas y parecen una ráfaga. Usar `e.timeStamp` (mismo reloj, el momento real de la tecla) lo evita. No lo cambié: el riesgo hoy es bajo (en Vender el lector sólo mira fuera de los campos de texto y en peso/cantidad) y prefiero que lo decida el dueño del lector con su test.

## 6. Archivos tocados

- `src/app/admin/(dashboard)/vender/TicketVenta.tsx` — un iframe de impresión por página y el foco que vuelve después de `print()` (H1, H2).
- `src/app/admin/(dashboard)/vender/VenderForm.tsx` — formateador armado una vez para las opciones del buscador (H4); con el módulo `terminal`, el foco no se lleva al buscador después de cobrar ni de cargar un peso (H3).
- `src/app/admin/(dashboard)/vender/vender-pantalla.test.ts` — test nuevo: con «Imprimir solo al cobrar», después del ticket impreso la próxima lectura entra sin tocar la pantalla y queda un solo iframe. Falla con el código anterior («el foco vuelve a la página») y pasa con el arreglo.

## 7. Verificación

- `npx tsc --noEmit`: 0 errores.
- `npx eslint` de los 3 archivos: 0.
- `vender-pantalla.test.ts`: 57 tests, 56 pasan; el que falla («POS de la bandeja: un pedido con la red caída…») ya fallaba en la línea de base (`fail-w3.txt`).
- `npm test` completo: 5.008 tests, 4.832 pasan, 29 fallan, 147 salteados. Contra `fail-w3.txt`: **ningún fallo nuevo de lo tocado**. Aparecen 2 nombres nuevos, «Canchas del club en el navegador» y «Cobrar la cancha y cerrarla · la mesa sigue…» («el foco vuelve al turno»), de `club/club-pantalla.test.ts`: no importa ninguno de los archivos tocados acá y sale del trabajo sin commitear que otro agente tiene abierto en `club/` (`almacen.ts`, `cuenta-core.ts`, `buffet-core.ts`).
- `npm run build`: verde (incluye el chequeo de tipos de Next).

— Elaborado por GSG
