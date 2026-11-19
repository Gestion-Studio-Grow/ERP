# MIA-194 · arreglos del recorrido E2E (hallazgos de MIA-193)

Rama `mia-50/recorrido-arreglos`, sobre `mia-50/ambiente-e2e` (PR #212). Sin Neon y sin `main`: todo corre en el ambiente
E2E local (`scripts/proyectos/ambiente-e2e.mjs`, Postgres local, app como `app_rls` sin BYPASSRLS). Datos del recorrido:
`scripts/proyectos/sembrar-recorrido-e2e.mts` (sólo base local). Capturas a 1.280 y 390 px fuera de Git (scratchpad de la
sesión), revisadas por un verificador visual aparte.

| # | Hallazgo | Rojo → verde | Arreglo |
|---|---|---|---|
| 1 | Cuentas a cobrar/pagar rebotan a Inicio sin aviso | `t11-permisos-postgres.test.ts` (C-CF2, `app_rls`): destino `/admin/proyectos/inicio` ≠ `…?sin-acceso=…` → 2/2 | El rebote lleva la app (`puerta-de-gestion.ts:29`, `layout.tsx:289`) e Inicio muestra el aviso (`proyectos/inicio/page.tsx:33`, `:49`, `:73`). |
| 2 | Cabecera con Costo $0 y Margen 100 % | `gestion-core.test.ts`: funciones inexistentes → 42/42 | Sin costo cargado: «Sin cargar» y «Falta el costo» (`gestion-core.ts:116-121`, `:145`). |
| 3 | Precio en USD sin cambio: aviso sin salida | ídem | El error trae enlace a «Monedas y gastos fijos» si el rol abre Administración; si no, dice a quién pedírselo (`gestion-core.ts:135`, `acciones-ficha.ts:551`, `_tabla-ficha.tsx:91`). |
| 4 | Total en USD de T11 | recorrido: «USD aprobado» US$ 1.000 ≈ $ 1.200.000 en Administración y Flujo; «USD lead» no aparece | Es la regla, no un bug: sólo generan cuotas las etapas de `ETAPAS_CON_CUOTAS` (`gestion-core.ts:185`) y las previstas sin marcar no cuentan (`cobranza-core.ts:53`, usado en `empresa.server.ts:27`). |
| 5 | «Vence el» sin anillo de foco | `src/app/foco-fecha.test.ts` (Chromium): Shift+Tab → `outline: none` 1/2 → 2/2 | Al volver con Shift+Tab, Chromium deja el foco en una subparte interna del campo de fecha y no cuenta como `:focus` ni `:focus-visible` (sólo `:focus-within`). Regla en `globals.css:1002`. |
| 6 | «No encontrado» con HTTP 200 | recorrido: 200 en las 4 rutas; `noindex` en proyectos y clientes, no en cuentas | No se cambia. Ver abajo. |
| 7 | Reloj fijo también en el servidor | `reloj-e2e.test.ts` 0/2 → 2/2; Inicio dice «Lunes, 2 de noviembre de 2026» (día real 19/11) | `scripts/proyectos/reloj-fijo.mjs` (precarga con `E2E_RELOJ`), cableado en `ambiente-e2e.mjs:141`. |

## Punto 1: qué rol

- Producción y Producción de campo: no abren Cuentas ni Flujo. Su rol de Proyectos no tiene «Empresa»
  (`gestion-core.ts:703`, módulo `empresa`). Ahora caen en Inicio con el aviso «No pudiste abrir «…»: se abre con
  «Cuentas, cashflow y bancos» en tu rol de Proyectos. Pedíselo a Dirección.»
- Dirección y Administración (OWNER): rebotaban porque el negocio no tenía los módulos `cuentas-a-cobrar` ni
  `cuentas-a-pagar`. Con los módulos, abren las dos y Flujo.
- **Pendiente del dueño (Gate 2):** en un negocio real hay que asignar los módulos desde la consola. Cuentas a pagar
  depende de `catalog` (`modules/descriptors/nativos.ts:250`): sin Catálogo, la activación la descarta y el aviso dice
  «todavía no está prendida». El blueprint `productora` no se tocó.

## Punto 6: por qué sigue en 200

`(dashboard)/loading.tsx` hace streaming: el 200 sale con el esqueleto antes de que la página llame a `notFound()`.
Next lo documenta en `node_modules/next/dist/docs/01-app/02-guides/streaming.md:617-621` y en ese caso inyecta
`<meta name="robots" content="noindex">`. Lo verificamos en proyectos y clientes.

Las fichas de Cuentas (`cuentas-a-cobrar/[id]/page.tsx:37-47` y su par de pagar) no llaman a `notFound()`: muestran un
estado vacío con «Volver», por eso tampoco tienen `noindex`.

Opciones:
- **(a)** Bajar `loading.tsx` a los segmentos de listado. Las fichas `[id]` darían un 404 real, pero perderían el
  esqueleto.
- **(b)** Verificar la existencia en `proxy` antes del streaming. Cuesta una consulta más por pedido y duplica la regla
  de negocio y RLS.

Es todo del backoffice con sesión, sin indexación pública. Recomendación: (a) sólo para `[id]` cuando se toquen.

## Cómo se reproduce

```
node scripts/proyectos/ambiente-e2e.mjs --start          # base limpia + siembra + app :3218, reloj 2026-11-02 10:00 -03
DATABASE_URL=<dueña local> npx tsx scripts/proyectos/sembrar-recorrido-e2e.mts
node --import tsx --test src/lib/proyectos/t11-permisos-postgres.test.ts src/lib/proyectos/sin-acceso.test.ts \
  src/lib/proyectos/gestion-core.test.ts src/lib/proyectos/reloj-e2e.test.ts src/app/foco-fecha.test.ts
```

El ingreso local pide el PIN (mail SIMULADO) y la verificación en dos pasos de los OWNER. El recorrido de Playwright los
resuelve sobre la base local: escribe el hash de un PIN conocido y calcula el TOTP con el reloj fijo del servidor.
