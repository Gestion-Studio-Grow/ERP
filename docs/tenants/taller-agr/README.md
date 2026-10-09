# Taller Mecánico AGR — módulo `taller`

Rama `tenant/taller-agr` (worktree `C:\agr`), nacida de `origin/main` el 08/10/2026. **Sin push.**

## Qué es

Primer negocio del rubro **taller mecánico**. Es un negocio más del motor (no una app aparte): rubro
`taller` dentro de la familia oficios + módulo `taller` asignable sólo a talleres.

| Pieza | Dónde |
|---|---|
| Rubro (servicios de ejemplo, textos) | `src/blueprints/oficios/rubros.ts` (id `taller`) |
| Módulos por defecto del rubro | `src/blueprints/presets-meta.ts` (`EXPLICIT_BLUEPRINT_MODULES.taller`) |
| Descriptor del módulo | `src/modules/descriptors/taller.ts` |
| App del panel (una, con sus pantallas) | `src/apps/catalogo/comercial.ts` (id `taller`, ruta `/admin/taller`) |
| Reglas puras + pruebas | `src/lib/taller/core.ts`, `core.test.ts` |
| Lecturas / escrituras | `src/lib/taller/datos.server.ts`, `acciones.ts` |
| Marca por negocio | `src/lib/taller/marca.ts` + `public/tenants/taller-agr/marca/` |
| Panel | `src/app/admin/(dashboard)/taller/` (hoy, ingreso, orden, imprimir, vehículos, avisos, reportes, config) |
| Link del cliente (sin login) | `src/app/seguimiento/[token]/` |
| Página pública | `src/app/taller/` (la raíz `/` de un taller redirige acá) |
| Tablas + RLS | `prisma/migrations/20261008120000_modulo_taller/` |
| Datos de ejemplo | `prisma/seed-taller-agr.ts` (sólo base local) |
| Demo en esta máquina | `node scripts/taller/demo-local.mjs` → `http://taller-agr.localhost:3217` |

## Marca — autorización registrada

El dueño de GSG confirmó el 08/10/2026 que el cliente autorizó usar su Instagram
(`@tallermecanicoagr`) para tomar logo, temática y servicios. Leído ese día de Instagram y de su ficha
de Google Maps:

- Logo: óvalo blanco con borde negro, "AGR" en rojo, "Taller / Mecánico" con serifa. Es el suyo,
  recortado de su posteo del 25/04/2026 (`logo.webp`, 498×247). Si mandan el original, reemplazarlo.
- Av. Pedro Dreyer 870, Monte Grande · tel. 011 5183-9732 · 4,6 en Google.
- Horario: jueves 8:30–12 y 14:30–19 (verificado). **El resto de la semana, provisional a confirmar.**
- WhatsApp: 11 5183-9732 (lo publica su flyer con el ícono de WhatsApp).

## Permisos

| Rol del motor | En el taller | Qué puede |
|---|---|---|
| OWNER | Dueño | Todo, incluida la configuración (márgenes, recargos, plantillas). |
| RECEPTION | Administrativo | Presupuestos, cobros, entregas, avisos, reportes. Sin configuración. |
| PROFESSIONAL | Mecánico | Sus autos y los sin asignar: ingresar, mover de estado, diagnóstico, horas, fotos. No ve precios, cobros, avisos ni reportes. |

## Qué NO está hecho (dicho de frente)

1. **Las dos migraciones no están aplicadas en Neon** (`20261008120000_modulo_taller` y
   `20261009120000_taller_caja`, declaradas en `prisma/lote-deploy.txt`). El código está en `main`
   desde el 09/10, pero el deploy de producción frena hasta que el dueño cargue
   `MIGRATE_DATABASE_URL` en Vercel (runbook `migracion-caja-neon.md` §A). Mientras tanto producción
   sirve el código anterior.
2. ~~Los cobros del taller no entran a la Caja del motor.~~ **Hecho el 09/10** (`src/lib/taller/caja.ts`):
   cada cobro asienta una VENTA en el libro de caja dentro de la misma transacción; anularlo
   escribe su contrapartida (EGRESO, con fecha de hoy) y el cobro queda marcado, no se borra.
   Pide la migración `20261009120000_taller_caja`.
3. ~~El stock no se descuenta.~~ **Hecho el 09/10**: al entregar el auto salen del stock los
   repuestos del catálogo aprobados y puestos por el taller (ledger de siempre, tipo CONSUMO). No
   frena la entrega por faltante. La pantalla "Movimientos de un producto" es sólo de mostrador:
   el taller ve el stock en Inventario y Catálogo, pero no el detalle de cada movimiento.
4. **Sin modo offline real.** Hay borrador del ingreso guardado en el teléfono y reintento, y la app
   es instalable; no hay service worker que abra el panel sin conexión.
5. **PDF = imprimir/guardar como PDF del navegador** sobre un papel con marca. No hay generador propio.
6. **Recordatorio de turno del día anterior:** usa la pantalla existente "Confirmar turnos de mañana".
   La plantilla `turno` del taller queda editable pero esa pantalla todavía usa su propio texto.
7. **Factura electrónica:** sale "documento no válido como factura"; quedó guardado el tipo (A/B/C) y el
   campo `invoiceId` para enganchar el plugin ARCA.
8. **Acento del panel:** bordó (`oxblood`), el más cercano disponible. El rojo exacto de AGR está en las
   superficies públicas; sumar un acento "rojo" al motor toca cinco archivos y se dejó afuera.
9. **Menú:** la app Taller aparece en el Inicio por apps. Hay que prender **"Trabaja por apps"** para
   este negocio desde la consola (sin deploy). Sin eso se entra por `/admin/taller`.
10. **Slug real del negocio:** no se consultó la base. `marca.ts` acepta `taller-agr`,
    `taller-mecanico-agr`, `tallermecanicoagr`, `talleragr` y `agr`; si el alta usó otro, sumarlo ahí.
    Lo mismo el rubro: si nació `generico`, hay que pasarlo a `taller` (decisión del dueño, ADR-036).

## Verificación hecha (08/10/2026)

- `tsc` y `eslint` de lo nuevo: limpios. `next build`: OK.
- Pruebas del taller y estructurales del motor: sin fallas nuevas. Tres fallas ya existían en `main`
  (una en `(site)/diseno-nuevo.test.ts`, dos en `guardia-bundle-cliente.test.ts`).
- `prisma/rls/check-coverage.mjs`: OK (las 7 tablas nacen con RLS).
- Recorrido en el navegador a 375 px contra la demo local: ingreso → orden → ítems con margen →
  presupuesto por WhatsApp → el cliente aprueba y rechaza desde su link → cobro en 3 cuotas con
  recargo → entrega con garantía → reseña. Como mecánico: no ve plata ni entra a configuración.
- **No corrido:** las dos vallas visuales del Gate (Playwright) ni la suite completa de tests.
