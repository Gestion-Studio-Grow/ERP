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

## 5. Recomendaciones fuera de mi alcance (para quien sea dueño de esos archivos) — resueltas en la ronda 2 (§8)

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

---

## 8. Ronda 2 — los cuatro puntos que habían quedado afuera (2026-10-17)

Mismas reglas: medir antes y después, sin Neon, sin dependencias nuevas. Para contar consultas se
levantó un **Postgres local descartable** (`/tmp/pgrun`, el de los tests de integración, con
`log_statement=all`) con dos negocios de prueba (`src/test/base-efimera.ts`); se apagó al terminar.
Scripts nuevos en `scratchpad/perf/scripts/`: `buscador-navegador.mjs`, `contar-manifest.sh`,
`sentencias-de-una-pagina.sh`, `crear-base.mts` y el escenario `bajo-carga` de `harness.mjs`.

### Tabla

| Métrica | Antes | Después |
|---|---|---|
| `fmtMoneyARS`, costo por llamada (Node) | 29–31 µs | **1,0 µs** |
| `fmtMoneyARS`, 20.000 precios | 582 ms | 20 ms |
| Vender: render al abrir con 20.000 productos (ahora con `fmtMoneyARS` y sin el formateador local) | 35–46 ms (ronda 1) | 38 ms |
| Buscador, por tecla, 20.000 productos, CPU normal (mediana / p95 / máx.) | 17,9 / 27,9 / 31,0 ms | **0,3 / 1,8 / 2,1 ms** |
| Buscador, por tecla, 20.000 productos, CPU ×4 (mediana / p95 / máx.) | 94,9 / 156,9 / 185,7 ms | **2,3 / 6,7 / 11,4 ms** |
| Buscador, por tecla, 5.000 productos, CPU ×4 (mediana / p95) | 22,1 / 36,2 ms | 0,1 / 1,7 ms |
| Lector a 10 ms con el hilo ocupado 80 ms en el medio de la ráfaga (CPU ×4) | **0 de 10** leídas | **10 de 10** |
| Persona a 120 ms/tecla con el hilo ocupado 2,5 s (CPU ×4): ¿se lee como lector? | **10 de 10** falsos positivos | **0 de 10** |
| Manifiesto `/api/pwa/admin.webmanifest`, sentencias SQL por pedido (negocio conocido) | **6** (2 lecturas por subdominio + BEGIN/set_config/SELECT/COMMIT) | **1** |
| Manifiesto con un host sin negocio | 1 → marca neutra | 1 → marca neutra (MT-1 intacto) |
| `/admin/login`, sentencias SQL por pedido | 11 | **7** |

### Qué se cambió y por qué es seguro

1. **`fmtMoneyARS` y `fmtNumberAR`** (`src/components/ui/format.ts`): un `Intl.NumberFormat` por
   cantidad de decimales, guardado a nivel de módulo. Por spec (ECMA-402) `toLocaleString` ES
   `new Intl.NumberFormat(…).format(n)`. Test permanente en `format.test.ts`: los 28.752 importes
   de −5.000 a 200.000, con 0, 1, 2 y 3 decimales, más los bordes (0, −0, 0,005, medios de
   redondeo, 1e15, 1e21, `MAX_VALUE`, `NaN`, `±Infinity`, `null`, strings vacías, con espacios, con
   coma, hexadecimal), comparados contra la implementación anterior copiada tal cual: **0
   diferencias**. Un `decimals` inválido tira el mismo `RangeError`. El formateador local de H4 en
   `VenderForm.tsx` se sacó: la lista vuelve a usar `fmtMoneyARS`.
2. **Buscador** (`src/components/ui/buscador-filtro.ts`): lo normalizado de cada opción se arma una
   vez por lista (WeakMap atado a esa lista; si la lista cambia en el lugar se nota comparando
   referencias y se rearma). Si el texto nuevo empieza con el anterior, sólo se revisan las que ya
   coincidían. Lo que falta recorrer se busca con un `indexOf` nativo sobre el texto de todas las
   opciones juntas. Y se corta apenas hay `max` que **empiezan** con lo tipeado (ésas van primero y
   en orden). Test permanente en `buscador-filtro.test.ts`: contra el filtro anterior copiado tal
   cual, 6.230 búsquedas tecleadas y borradas letra por letra (listas de 0 a 2.000 opciones, con
   tildes, mayúsculas, espacios dobles, sin detalle; `max` 8, 1, 0, 3, 50, 2,5 y −1), más dos listas
   alternadas y una lista cambiada en el lugar: **mismo resultado y mismo orden**. Costo conocido:
   si quien llama arma una lista NUEVA en cada render y además hay texto, cada tecla rearma el
   índice (20 ms con 20.000, como antes). No pasa en la práctica: el texto vive en el
   `BuscadorCombo`, así que mientras se tipea el que llama no se vuelve a renderizar y la lista es
   la misma. Igual, `TrasladoForm.tsx:74` e `inventario/movimientos/Filtros.tsx:29` arman la lista
   sin `useMemo`: conviene memoizarlas cuando alguien las toque.
3. **Lector** (`src/lib/terminal/lector-core.ts` → `momentoDeLaTecla`, `usar-lector.ts`): la ráfaga
   se mide con el `e.timeStamp` de la tecla (cuándo llegó), no con la hora en que la pantalla la
   atiende. Con el hilo ocupado las teclas esperan en cola y se atienden juntas: con la hora de
   atención, una persona parecía un lector (10 de 10) y una ráfaga cortada por un bloqueo de 80 ms
   (un `print()`, un render) dejaba de serlo (0 de 10). Si un navegador manda un `timeStamp` que no
   es del mismo reloj (0, o ms desde 1970), se usa la hora de atención como antes. Tests nuevos en
   `lector-core.test.ts`. Ojo con un detalle del harness: con CPU ×4, Playwright espera a que la
   pantalla atienda cada tecla antes de mandar la siguiente, así que las teclas "llegan" cada 22–30
   ms en vez de 10 ms. Eso queda cerca del umbral de 35 ms, y el escenario `vender-5000-cpu4` falló
   1 vez de 3 corridas por ese ritmo artificial. Un lector de verdad manda a ritmo fijo, sin esperar
   a la pantalla (el escenario `bajo-carga` lo simula así: 10 de 10). Con sufijo «ninguno», el cierre
   por tiempo sigue usando la hora de atención: si el hilo se traba justo ahí, puede cerrar antes.
   Queda anotado; ningún perfil de fábrica usa «ninguno».
4. **Manifiesto** (`src/lib/tenant.ts` → `resolveTenant`, `slugResueltoDelPedido`; `src/lib/tenant-site.ts`):
   la lectura que resuelve el negocio por el host trae también el `slug` (misma fila), y
   `getCurrentTenantSlug` lo usa en vez de hacer una segunda consulta por id con su transacción de
   RLS. Con el pin (`FORCE_TENANT_SLUG`) el slug es el del pin (se encontró por él). En el sandbox no
   hay slug y se consulta como antes. Mismo orden, mismo fail-closed y mismo fail-open: un host sin
   negocio da `null` y la marca neutra. El ahorro no es sólo del manifiesto: **toda página que pinta
   la marca** (el layout del panel, `/admin/login`) se ahorra las 4 sentencias del slug. En el
   manifiesto, además, se cae la lectura repetida por subdominio: en un Route Handler `react.cache`
   no deduplica, y el cliente con RLS volvía a resolver el negocio. Test nuevo en
   `direccion-sin-negocio-postgres.test.ts`: `resolveTenant` de cada negocio trae su propio id y
   su slug, y uno desconocido sigue siendo `DireccionSinNegocioError`.

### Verificación de la ronda 2

- `npx tsc --noEmit`: 0.
- `npx eslint` de los archivos tocados: 0.
- Tests de lo tocado, todos verdes:
  - `format.test.ts`: 16;
  - `buscador-filtro.test.ts` + `buscador-teclado.test.ts`: 17;
  - `lector-core.test.ts`: 24;
  - `tenant.test.ts`: 25;
  - `direccion-sin-negocio-postgres.test.ts`: 1, contra el Postgres local.
- `npm test` completo, sobre el árbol compartido:
  - 5.053 tests: 4.878 pasan, 28 fallan, 147 salteados;
  - los nombres que fallan son **exactamente los de `fail-w3.txt`** (30 renglones: el runner cuenta 28
    fallos porque algunos nombres son sub-tests dentro del mismo archivo): ninguno nuevo y ninguno menos.
  - `direccion-sin-negocio-postgres.test.ts` (resolución del negocio por host contra Postgres 16 local
    descartable, sin Neon): 1/1 en verde con el cambio de `tenant.ts`.
  - Deuda anotada (Gate, baja, no es regresión): `TrasladoForm.tsx:74` e `inventario/movimientos/Filtros.tsx:29`
    arman la lista del buscador en cada render; si el padre re-renderiza mientras se tipea, el índice se rearma
    (O(n), igual que antes). Arreglo: `useMemo`.
- `npm run build`: verde, sobre el árbol compartido.
- El build también salió verde en una copia limpia: HEAD + sólo estos cambios, sin el trabajo en
  curso de `club/**`.

---

## 9. Ronda 3 — /admin/club (2026-10-17)

### Cómo se midió

- **Harness:** `scratchpad/perf/scripts/club-harness.mjs`.
  - Monta `ClubDemo` REAL en Chromium, con el CSS de la app, en build de producción con profiling de React.
  - Por acción mide: Event Timing (del toque al cuadro pintado, con un piso de 16 ms), `<Profiler>`, renders por
    componente (gancho de DevTools), el tiempo del motor (dentro de `ejecutar`) y el de las fotos, por separado.
  - Deja 2,5 s entre acción y acción, como un cajero. Las tareas de fondo se cuentan en el total de la sesión.
  - Se corrió con la CPU normal y con CPU ×4 (PC de recepción barata o tablet).
- **Estados medidos:**
  - la demo del día (244.149 caracteres);
  - un estado grande: la demo con **6 canchas, turnos de 1 h de punta a punta los 55 días anteriores** (cobrados,
    con mesas y cargos) **y la semana que viene llena**. Son 5.945 turnos, 4.013 movimientos de caja y
    **3.983.058 caracteres**. Esta versión de Chromium aceptó guardar un estado de ese tamaño; el tope exacto de
    localStorage no quedó bien medido.
- **Lighthouse de la página de verdad:** `next start` contra el **Postgres local descartable** (`/tmp/pgrun`, nunca
  Neon), con el módulo `club` asignado al negocio de prueba y una sesión firmada con un secreto de prueba. Postgres
  quedó apagado y las bases de prueba, borradas.

### Tabla (estado grande, CPU ×4, salvo que se diga otra cosa)

| Métrica | Antes | Después |
|---|---|---|
| Foto de «Deshacer» en el toque (cobrar, a cargo de, mover…) | **267–392 ms** | **0 ms** (se arma antes, en reposo) |
| Cobrar a un jugador: del toque al cuadro | 488 ms | **120 ms** |
| Cobrar todo: del toque al cuadro | 552 ms | **120 ms** |
| Mover un turno: del toque al cuadro | 424 ms | **192 ms** |
| Cargar del buffet a un jugador: del toque al cuadro | 368 ms | **136 ms** |
| Tipear el motivo de cancelar (6 letras): React | **2.127 ms** (la previa copiaba el estado en cada letra) | **3 ms** |
| Abrir la previa de cancelar / del plan lluvia | 408 / 440 ms | 144 / 184 ms |
| Guardar en el equipo, por acción | 543 ms juntos (copia + texto + `setItem`), a los 400 ms | 76 ms de texto en reposo + `setItem` (150–220 ms) agrupado 1,5 s, en reposo |
| Tiempo bloqueado en toda la sesión (TBT, 18 acciones) | **10,7 s** | **4,7 s** |
| La misma sesión con CPU normal | 923 ms | **126 ms** |
| «Deshacer» (vuelve con `hidratarEstado`) | 520 ms | 448 ms |
| Abrir la pantalla con el estado grande | 716 ms hasta la agenda | 677 ms (leer + `hidratarEstado` del motor: no se toca) |
| Demo del día (CPU ×4), cualquier acción | 72–216 ms | igual, dentro del ruido |
| Contraste: textos debajo de 4,5:1 (a 768 y 390 px) | **37** (`text-muted` sobre `surface-sunken` = 4,33:1) | **0** (mínimo 4,51:1) |
| Objetivos táctiles de menos de 44 px · scroll de costado (768 y 390 px) | 0 · 0 | 0 · 0 |
| Lighthouse móvil `/admin/club` (perf / a11y / LCP / CLS / TBT) | 88–95 / 100 / 2,8–3,5 s / 0 / 100–170 ms | 89–95 / 100 / 2,7–3,5 s / 0 / 120–200 ms |
| Lighthouse escritorio | 98–99 / 100 / 1,0–1,1 s / 0 / 0 ms | 98–99 / 100 / 1,0–1,1 s / 0 / 0 ms |

### Bundle

- **El motor está SÓLO en `/admin/club`.** La firma de `motor.mjs` («el archivo está vacío o no es de Break Point»)
  aparece en **un solo chunk** (`1ttgcju5-ihwf.js`). Lo pide sólo el chunk de entrada de `/admin/club`, figura sólo
  en `club/page/react-loadable-manifest.json` y no está en ningún chunk del servidor (`ssr: false`).
  `src/lib/club/dominio/*.mjs` no llega al navegador.
- **Peso de `/admin/club`, en gzip:**
  - **175,2 kB** de primera carga: React, Next, el layout del panel y la entrada de la página (638 B). Es lo mismo
    para todo el panel.
  - Después, lo que se pide al montar:
    - **el motor: 20,7 kB** (ahora en su chunk);
    - **la UI de la Agenda: 15,1 kB**;
    - **la lógica de pantalla compartida** (cuenta, buffet, canchas): **8,8 kB**;
    - **piezas de UI: 5,3 kB**.
  - Antes eran 51,6 kB (177 kB sin comprimir); ahora son **49,9 kB (153 kB sin comprimir, −16 % para leer)**.
- **Partido por solapa:** Buffet, Caja, Fijos y Mantenimiento quedaron en chunks aparte, de 2,2 a 4,0 kB cada uno y
  **11,8 kB** entre los cuatro.
  - Se piden apenas el navegador queda libre después de abrir. Si ya llegaron, se pintan directo, sin esqueleto
    (`diferida` en `ClubDemo.tsx`).
  - La primera interacción (tocar un turno) no los espera.
  - **Ojo con lo que gana:** la mayor parte de la lógica la comparte la Agenda (la cuenta usa buffet-core, el día
    usa canchas-core), así que el ahorro en la primera carga es chico: 1,7 kB gzip y 24 kB sin comprimir.
    Partirlo suma unos 10 kB gzip de envoltorio en total. Lighthouse no lo distingue del ruido.
  - Es reversible: si el dueño prefiere un solo chunk, se vuelve a importar directo.

### Qué se cambió (sin tocar el motor ni sus `.mjs`)

1. **Un texto del estado por versión** (`almacen.ts`: `textoDelEstado`, `textoDeLaDemo`, `copia`, `simular`):
   - se arma con `JSON.stringify` directo, sin copiar antes: 76 ms con ×4, contra 292 de `serializarEstado`. Da el
     **mismo texto carácter por carácter**, y `almacen.test.ts` lo compara;
   - se arma en reposo después de cada cambio, y también al abrir;
   - sirve para la foto de «Deshacer», para el guardado y para las copias de las previas.
2. **Guardado:**
   - se agrupa 1,5 s y se escribe cuando el navegador está libre;
   - al cerrar la pestaña o pasar a otra app se escribe en el acto (`pagehide` y `visibilitychange` → `guardarYa`,
     sin cambios);
   - sin almacenamiento disponible, ni se arma el texto.
3. **Previas** (cancelar, falta, cortar, lluvia):
   - corren sobre `JSON.parse` del texto ya armado: 83 ms con ×4, contra 318 de `structuredClone`;
   - se guardan por estado y por opción (`almacen.simular`): una letra del motivo ya no recalcula nada;
   - test: las previas sobre la copia del texto dicen lo mismo que sobre `structuredClone` en todos los turnos de la
     semana, con todas las opciones, y no tocan el estado.
4. **Contraste:** sobre el fondo hundido, los rótulos y horarios pasan a `text-body` (agenda, totales del turno,
   caja). El recuadro de los formularios del ciclo del turno pasa a `surface-raised` con su borde.

### Lo que queda (no se tocó, con su porqué)

- **«Deshacer» y abrir con un estado grande** (~300 ms con ×4) los gasta `hidratarEstado` del motor, que copia
  adentro. Se podría saltar con el estado ya leído, pero se perdería la validación del motor.
  - «Deshacer» es raro y explícito, y vence a los 6 s;
  - abrir pasa una vez por visita.
- **Cambiar de día o de solapa con el estado grande** (150–300 ms con ×4): es el render de React de la grilla
  (83 turnos al montar la semana llena) o del panel. El paso siguiente sería virtualizar la grilla o usar
  `content-visibility` en las solapas largas.
- **El `setItem` de 4 millones de caracteres** (150–220 ms con ×4) es del navegador. Ya no cae en el toque, pero
  sigue siendo una tarea larga en reposo.

### Verificación

- `npx tsc --noEmit`: 0.
- `npx eslint` de `club/`: 0.
- Tests de club y del motor: 85 de 85, incluidos los de pantalla en Chromium.
- `npm test` completo: 5.062 tests, 4.887 pasan, 28 fallan, 147 salteados. Los nombres que fallan son exactamente
  los de `fail-w3.txt`.
- `npm run build`: verde.

## 10. Ola 0 — almacén real (2026-10-17)

El almacén de `/admin/club` ya sabe correr la **jornada real**: reloj real con latido, cambio de día, una pestaña
por equipo (Web Lock), guardado asíncrono enchufable con versión y operador por su propio canal. `/admin/club` sigue
abriendo **siempre la demo**: el modo real sólo entra por la prop `reloj="real"` de `ClubDemo`, y `page.tsx` lo pasa
detrás de `NEGOCIOS_CON_JORNADA_REAL`, que hoy está vacía.

### Cómo se midió

- **Node** (`almacen-real.test.ts`, la última prueba, con `t.diagnostic`): sobre la demo del día cargada como
  jornada real.
- **Chromium** (`club-pantalla.test.ts`, «jornada real»): `ClubDemo` real, con `reloj="real"` y el reloj de
  Playwright (`clock.install` / `runFor`). Se cuentan los renders por componente con el gancho de DevTools que ya
  usaban las otras pruebas.
- CPU normal. En una PC con CPU ×4, multiplicar por ~4.

### Tabla

| Qué | Resultado |
|---|---|
| Latido sin cambio de minuto (3 de cada 4 latidos, cada 15 s) | **1,8 µs**, 0 avisos · en Chromium, **0 renders** |
| Latido que cambia el minuto (latido + rearmar la grilla y reusar) | **0,5 ms**, **0 celdas nuevas** en 60 minutos · en Chromium, se repintan `CintaDelClub` y `AgendaCanchas` (la raya de «ahora»), **ningún `BloqueTurno`** ni `ClubDemo` |
| Cambiar de operador (lo que va a hacer el PIN) | **0,4 µs**, la versión no sube · en Chromium, **0 renders** con la agenda a la vista |
| El toque con el guardado asíncrono enchufado | 0 llamadas al guardado y 0 avisos a la cinta en el toque. Cuesta lo mismo que con el guardado local (0,010 vs. 0,008 ms en una acción chica) |
| Guardado agrupado con respuestas desordenadas (100 acciones) | un guardado a la vez, siempre con lo último. La versión esperada sólo sube y nunca se escribe una vieja encima |

### Qué se cambió y por qué no cuesta

1. **Canales aparte.** Quién opera (`suscribirOperador`) y cómo va el guardado (`suscribirGuardado`) no suben la
   versión del estado. Por eso no despiertan a ninguna pantalla que selecciona del estado.
2. **El latido compara antes de avisar.** `relojReal` con el estado ya cargado es una cuenta de minutos y un
   `horarioDe`. Si el minuto y el día son los mismos, no hace nada más. `ahora()` es un objeto nuevo sólo cuando
   cambia, y las previas (`simular`) se recalculan por estado **y** por reloj.
3. **«Pendiente» no se ve.** En el toque no se avisa a la cinta: sólo cambia cuando el guardado falla o vuelve a andar.
4. **El guardado local es sincrónico, sin promesa de por medio.** Se usa `guardarYa` del adaptador de este equipo. Así
   al salir (`pagehide`) no queda nada «en camino». Con otro guardado (la base de BP-3), al salir se lanza el
   asíncrono y la copia de este equipo se escribe en el acto, con su marca de pendiente.
5. **La versión va pegada al final del texto** (`…,"version":N}`). Se escribe en el mismo `setItem` y se lee mirando
   los últimos 32 caracteres, sin abrir el JSON.

### Lo que queda

- El chequeo de versión del guardado local hace un `getItem` del texto entero antes de escribir. Con 4 millones de
  caracteres es una copia del navegador (algunos ms), al lado del `setItem` de 150–220 ms que ya estaba en reposo.
  Se podría evitar escuchando el evento `storage`; no hizo falta.
- Una pestaña en sólo lectura muestra lo que había al abrir. No se refresca con lo que guarda la otra (el vanilla
  tampoco). «Usar acá» trae lo último.

### Verificación

- `npx tsc --noEmit`: 0.
- `npx eslint` de `club/`: 0.
- Tests de club, motor, módulos y apps: 405, 404 pasan y 1 salteado (la consola de operador pide un Postgres local; no es del club).
- `npm test` completo: 5.090 tests, 4.915 pasan, 28 fallan y 147 salteados. Los que fallan son exactamente los
  de `fail-w3.txt`, ninguno nuevo.
  - En una corrida bajo carga falló «el foco vuelve al turno»: la prueba leía el foco antes del
    `requestAnimationFrame`. Ahora espera ese cuadro y lo que afirma es lo mismo. En solitario pasa 4 de 4.
- `npm run build`: verde.

## 11. Archivado de días cerrados en el almacén (2026-10-17)

El estado de la jornada real crece unos 3 millones de caracteres por mes de club lleno, y el navegador guarda unos 5
millones. El motor ya sabe archivar lo cerrado (`archivarDiasCerrados`, de la sesión del club). El almacén lo envuelve
en dos pasos, sin pantalla (la UI va en Configuración):

1. `prepararArchivo()` valida (rol OWNER + PIN de un dueño del club) y corre el motor sin tocar el estado. Devuelve
   **un solo archivo**, `textoDelArchivo`: el respaldo completo de ahora más el anexo, con sus huellas
   (`paqueteParaArchivar`). Es uno solo porque el navegador frena la segunda descarga del mismo clic. También devuelve
   la `huella` de este paso.
2. `confirmar()`:
   - **Con el guardado de este equipo**, exige `{ archivoElegido }`: el texto del archivo que el dueño vuelve a elegir.
     Lo verifica con `verificarPaqueteArchivo` contra el archivado recalculado sobre el estado de ahora. El navegador
     no avisa si una descarga llegó: elegirlo de vuelta es la prueba de que está entero.
   - **Con la base** (`guardarAnexo`, BP-3), no pide archivo: guarda el anexo en el servidor **antes** de achicar, y
     si falla no achica nada.
   - Recién ahí reemplaza el estado, lo guarda y apaga «Deshacer». Se confirma una sola vez: el doble clic sale en
     silencio.
   - Si falla, dice la `causa`:
     - `otro`: de otro club o de otro corte;
     - `danado`: alterado, cortado o JSON roto;
     - `cambio`: cambió algo de esos días; hay que descargar de nuevo.
     Lo de hoy no molesta: no está en el anexo.

### Cómo se midió

- `almacen-archivo.test.ts`, en la prueba «medición».
- Se usa el fixture `armarMesCargado(HOY_TORNEO, 30)`: un mes de club lleno, abierto como jornada real.
- «Abrir» es `JSON.parse` + `hidratarEstado`, lo que paga cada recarga. Es el promedio de 5 aperturas, con la CPU
  normal; en una PC con CPU ×4, multiplicar por ~4.

### Tabla

| Corte | Guardado (caracteres) | Anexo | Abrir | Archivado |
|---|---|---|---|---|
| Por defecto (quedan 21 días, hasta el 26/9) | 3.042.580 → **2.085.006** (−31 %) | 973.562 | 42,3 → **32,9 ms** | 350 turnos, 1.942 movimientos |
| Al máximo (quedan 7 días, hasta el 10/10) | 3.042.580 → **701.758** (−77 %) | 2.365.462 | 42,0 → **11,1 ms** | 853 turnos, 4.740 movimientos |

- **El archivo que se descarga** (respaldo + anexo) pesa 4,0 millones de caracteres con el corte por defecto y 5,4
  millones al máximo.
- **Confirmar** (parsear el archivo elegido, recalcular, verificar, achicar y guardar) cuesta 345 y 397 ms con la CPU
  normal. Es una acción explícita del dueño, una vez por mes.

### «Lleno»

- `estadoDelGuardado().lleno` usa el umbral del vanilla: `AVISO_LLENO` = 2.500.000 caracteres. También cuenta como
  lleno que el guardado de este equipo haya fallado.
- El mes lleno lo pasa, y después de archivar con el corte por defecto queda abajo. La cinta lo avisa.
- `bytes` se actualiza en cada guardado **sin avisar a nadie**. Sólo se avisa cuando cambia `lleno`, así el
  guardado agrupado no repinta la cinta: la prueba de pantalla «el latido no repinta» sigue dando 0 renders.

### El anexo no se guarda en este equipo

**Decisión del orquestador:** el guardado local no implementa `guardarAnexo`, porque ocuparía el lugar que el archivado
libera. Con él, el anexo va en el archivo descargado, y `confirmar` exige elegirlo de vuelta. Antes alcanzaba con
`{ descargado: true }`, que no probaba nada; ya no existe. Con la base de BP-3, el anexo va al servidor.

— Elaborado por GSG
