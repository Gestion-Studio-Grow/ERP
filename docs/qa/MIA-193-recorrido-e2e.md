# MIA-193 · Ambiente E2E de Proyectos y recorrido final de MIA-50

Rama `mia-50/ambiente-e2e` (desde `mia-50/t12-liquidacion-2` 37eeef94). Nada toca Neon ni `main`.

## A. Ambiente
- `node scripts/proyectos/ambiente-e2e.mjs`: Postgres 16 local, base `erp_e2e` limpia, `prisma migrate deploy`
  (95 migraciones, orden alfabético de carpeta, `migrate status` al día; vale como R10 de la ola 5), roles y RLS
  (`prisma/rls/0002`, `0001`), siembra y prueba de aislamiento como `app_rls` (`bypassrls=false`; parado en
  prueba-uno ve 4 usuarios propios y 0 de prueba-dos; sin negocio fijado, 0).
- `--sembrar` siembra sin rehacer la base; `--start` levanta `next start -p 3218` como `app_rls`
  (`<slug>.localhost:3218`). Hay que correr `next build` antes (con `NODE_OPTIONS=--max-old-space-size=8192`).
- Siembra (`scripts/proyectos/sembrar-e2e.mts`, idempotente): prueba-uno, prueba-dos y prueba-tres, productora,
  «de prueba»: 4 personas (Dirección y Administración OWNER; Producción y campo PROFESSIONAL), caja 0, una
  cuenta de banco en 0, sin proyectos, sueldos 0. Los usuarios de prueba no tienen que cambiar la clave.
- El reloj fijo se puso sólo en el navegador (`page.clock`). El servidor usa la hora real: la app no trae cómo fijarlo.

## B. Recorrido (Chromium, es-AR, 1.280 y 390 px; capturas fuera de Git)
| Punto | ¿Se reproduce? | Dónde |
|---|---|---|
| T11 barra fija a 390 | No: el final de Administración, Flujo e Inicio queda por encima | — |
| T11 anillo de foco | Sí, en un campo: «Vence el» de Cuentas no muestra anillo (1 de 40 paradas) | `administracion/_cuentas.tsx:381`, `proyectos/_vista.tsx:7` |
| T11 total en USD | No se llegó: un lead en USD no aparece en Administración ni en Flujo hasta aprobarse | — |
| 183 «Quitar» a 390 | No: entero (x=265, w=92) | `[id]/_pestanas-datos.tsx:156` |
| 183 fechas en inglés | Sí, en el campo nativo vacío (mm/dd/yyyy) con navegador es-AR headless; los textos de la app salen en castellano | `type="date"`, p. ej. `_cuentas.tsx:381` |
| 183 Costo $0 / Margen 100 % | Sí: venta $ 1.000 sin costos → «Margen $ 1.000 (100%)»; en USD, igual | `[id]/page.tsx:87-91`, `lib/proyectos/gestion-core.ts:113-118` |
| 183 «no encontrado» HTTP 200 | Sí también con `next start`: 4 rutas inexistentes dan 200 con la página «No encontramos esta página» | `admin/(dashboard)/loading.tsx` (el streaming arranca antes del `notFound()`) |
| 183 re-provisionar suma un OWNER | No desde la consola: el alta frena «El slug "prueba-uno" ya está en uso» y no deja seguir; OWNER sigue en 2 | `lib/provisioning/dry-run.ts:45-46` |
| Callejón: Cuentas a cobrar / a pagar | Sí: Dirección y Administración rebotan (307) a Inicio sin aviso; la productora no trae esos módulos | `blueprints/presets-meta.ts:113`, `admin/(dashboard)/layout.tsx:288` |
| Callejón: precio en USD sin cambio | Sí: «Falta el tipo de cambio de USD: cargalo en Monedas y gastos fijos.», sin enlace | `lib/proyectos/acciones-ficha.ts:551` |

Las capturas las miró un verificador visual distinto del que recorrió. Al cerrar se rehízo la base limpia.
