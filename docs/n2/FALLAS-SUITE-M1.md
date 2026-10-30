# Fallas de la suite — clasificación (rama `n2/m1-caja-medios-dc01`, 29/10/2026)

**Cómo se midió.** `npm test` completo en dos worktrees de esta máquina (Windows 11, Node 24.22.1,
`core.autocrlf=true`), con Chromium para los tests de navegador:

| Corrida | Tests | Fallan | Salteados |
|---|---|---|---|
| `main` (`e2976802`) | 7219 | 32 | 299 |
| esta rama, antes de los arreglos de abajo | 7247 | 30 | 307 |

Para separar lo de Windows de lo real, cada archivo que falla se volvió a correr en una copia
de la rama con **fin de línea LF** (`git -c core.autocrlf=false worktree add`), que es como
quedan los archivos en CI (Linux, Node 22).

No se pudo leer el estado de CI en GitHub (`gh` sin sesión en esta máquina): la clasificación
«del entorno» descansa en la corrida LF y en el error exacto, no en ver CI en verde.

## Resumen

| Clase | Tests | Qué hacer |
|---|---|---|
| Del entorno: fin de línea CRLF de Windows | 10 | nada; en LF pasan |
| Del entorno: rutas de Windows | 4 | nada; el test arma rutas con `/` |
| Del entorno: `spawnSync("npx")` sin `.cmd` | 9 | nada; en Windows `npx` es `npx.cmd` |
| Del entorno: Node 24 trae `navigator.locks` | 2 | nada; CI usa Node 22 `[A VALIDAR]` |
| Del entorno: tiempo bajo carga | 2 | nada; solos pasan |
| Obsoletas (el código cambió y el test no) | 2 | **arregladas en esta rama** |
| Real | 1 | **no se arregla acá**: toca plata en 13 módulos fuera de caja |
| **Total** | **30** | |

Arregladas por M1 (fallan en `main`, no en la rama): `medio-cobro.test.ts` «createOrder y
setOrderPaidCore llaman a medioDeCobroRequerido». Las dos de `vender-pantalla` y
`club/vender-pantalla` que fallaron sólo en `main` son de navegador y pasan en la rama: se toman
como intermitentes.

## Detalle

### Del entorno — CRLF (pasan con LF)
- `src/app/(site)/diseno-nuevo.test.ts` — regex con `\n`
- `src/app/admin/(dashboard)/pedidos/boutique/piel-de-la-bandeja.test.ts` — regex con `\n`
- `src/app/magra-oro-contraste.test.ts` — bloque leído con `\n`
- `src/design/hoja.test.ts` (2) — el bloque generado y su hash cambian con `\r\n`
- `src/lib/club/anonimizar.test.ts` — compara el fixture byte a byte
- `src/lib/ensayo-lote-neon.test.ts` — lee una línea de comentario como migración
- `src/lib/rechazo-de-dominio.test.ts` — regex con `\n`
- `src/lib/seguridad-hallazgos.test.ts` — regex `/\n\s+vinculosActivos,\n/`
- `src/lib/sitio-estatico.test.ts` — hash del HTML

### Del entorno — rutas de Windows
- `src/integraciones/contrato.test.ts`, `src/integraciones/redaccion.test.ts` — `scandir 'C:\C:\…'`
  (usa `new URL(...).pathname` como ruta)
- `src/lib/guardia-bundle-cliente.test.ts` (2) — espera `app/contador/...` y recibe `app\contador\...`

### Del entorno — `spawnSync npx ENOENT`
- `src/lib/seed/acceso-comun-lab.test.ts` (3), `src/lib/seed/seed-postgres.test.ts` (1),
  `src/lib/vercel-build.test.ts` (5). Error literal: `Error: spawnSync npx ENOENT`
  (`scripts/vercel-build.mjs:45`, `shell: false`). En Vercel y en CI es Linux.

### Del entorno — Node 24
- `src/tenants/breakpoint/turnero/demo-local.test.ts` (2) — «sin Web Locks (como Node…)»: en Node
  24.22 `'locks' in navigator` es `true` (verificado acá), así que el bus toma el camino del
  navegador y llama a `addEventListener`, que Node no tiene. `[A VALIDAR]`: confirmar que CI corre
  Node 22 sin `navigator.locks` (`.github/workflows/gates.yml:97`).

### Del entorno — tiempo bajo carga
- `src/apps/kpis/fila.test.ts` («consultó en 49 ms»), `src/app/admin/(dashboard)/club/almacen-real.test.ts`
  («latido ~0: 28.96 µs») — miden tiempos; solos pasan.

### Obsoletas — arregladas
- `src/app/admin/(dashboard)/pie-pegado-zona-segura.test.ts` — no cargaba: la raíz del layout pasó a
  `cn(...)` y el regex buscaba la clase en un solo literal. Después, el pie de Vender se pega sólo con
  `data-fijo` (`not-data-fijo:static`) y el pie de prueba no lo tenía. Con los dos ajustes: 7/7.
  Commit `72644a07`.
- `src/app/admin/(dashboard)/club/bloqueo-pantalla.test.ts` — «el PIN de Rober no cambió» esperaba
  `"11"` en claro; desde `94bc3441` la foto guarda `h1:<PBKDF2 con la sal del club>`. Ahora compara
  contra `hashPin("11", salPin)`: 9/9, o sea el PIN efectivamente no cambió. Commit `0cc906eb`.

### Real — no arreglada
- `src/lib/dinero/redondeos-locales.test.ts` — la guardia de plata (25/09) encuentra **25 redondeos a
  mano sin marca** en código posterior: club (stock-core, tablero), reparto, armar, cerrar turnos,
  vender (balanza, reglas-venta, boutique, WhatsApp), clientes, cobro, lector, pádel, pedidos,
  mensajes. Unos son porcentajes (llevan `// no-es-plata:`); otros son plata y van con
  `@/lib/dinero/redondeo`, que no redondea igual que `Math.round(n * 100) / 100`: 1,005 → 1,01 y
  −2,675 → −2,68, lejos del cero (`src/lib/dinero/redondeo.ts:58-80`). Es un cambio de plata
  repartido en 13 módulos fuera de caja: va en su propia rama y con el certificador completo.

### Agregado con F2 (29/10, contra PGlite) — previa, no de F2
- `src/lib/caja/m1-cert-reabrir-vs-congelar-postgres.test.ts` — corta con `DireccionSinNegocioError`
  («no hay tenant para el subdominio "negocio-a"») antes de llegar al cierre. Falla igual con el
  código anterior a F2 (`ba71f668`): no la causa F2. `[A VALIDAR]`: no pude establecer la causa (la
  resolución del negocio de prueba falla sólo en este test); correrla en CI antes de clasificarla.
- `src/lib/caja/m1-caja-medios-postgres.test.ts` — pasó a las 23:48 y falla a las 00:17 del 30/10
  (`ventasSinCobrar` da 0 en vez de 2), también con el arreglo O1 revertido: depende de la hora en
  que corre (de 00:00 a 03:00, el día UTC de los pedidos sembrados con `now()` y el día del negocio
  no son el mismo). `[A VALIDAR]`: correrlo fuera de esa franja o en CI.
