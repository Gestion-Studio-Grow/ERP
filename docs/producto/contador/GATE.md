# Gate de Excelencia — Consola del contador (abonos, lote del mes, comprobantes, exportación)

**Frente:** facturación automática · consola del contador · rama `claude/facturacion-automatica-contador`
**Fecha:** 2026-10-22 · **Corrió:** el agente de la consola del contador (Opus).
**Alcance:** `src/app/contador/{abonos,lote,exportar,cliente/[clienteId]/comprobantes}/**`,
`rechazo-core.ts`, `exportar-core.ts`, `src/lib/cartera-{gate,abonos,abonos-actions}.ts`, el
refactor de `cartera-actions.ts` (las llaves pasan a `cartera-gate.ts`) y los enlaces nuevos en
`page.tsx` / `CarteraPanel.tsx`.

## Calibración (ADR-052)

- **El aislamiento manda:** todo dato de un cliente se lee y se escribe con
  `tenantTransaction({ tenantId: cliente })`, después de verificar que es de la cartera del estudio
  de la sesión. Nunca `operatorPrisma`, nunca un id que venga de afuera sin pasar por la cartera.
- **La plata no se duplica:** una factura por (regla, mes), decidida y escrita en la MISMA
  transacción, con candado. Ante la duda, no se emite (DESCONOCIDO cuenta como emitida).
- **Reusar el motor, no reescribirlo:** `createInvoiceInTx`, `procesarEnviosDelNegocio`,
  `autorizarEnTandas`, `lista.server`, `calcularImpuestos`. Lo que falta va a `PEDIDOS-AL-MOTOR.md`.
- **Lógica en núcleos puros con tests (MP-8);** UI chica, accesible y mobile-first.
- **Zona de de-sesgo (ADR-046):** textos visibles en criollo claro para una contadora argentina
  («Frenado», «Volver a emitir», «Lo resuelve Soporte GSG»); código y nombres, estándar.

## Bloque 1 — Auditoría SAP Fiori (7 ángulos) + ángulo argentino

- [x] **Rol-based:** todo vive detrás de `cartera:manage` + módulo `cartera` (`exigirEstudio`); la
  usuaria de un negocio común no ve nada (test postgres: B no puede emitir el lote).
- [x] **Coherente:** mismos componentes que el resto del panel (`PageHeader`, `Bloque`, `Renglon`,
  `Plata`, `Franja`, `ButtonLink`), mismo pie de GSG, misma navegación «Volver a la cartera».
- [x] **Simple:** el mes se resuelve en una pantalla (lote) con un botón; el abono es un formulario
  de una columna en el celular; los rechazos dicen qué hacer en una línea.
- [x] **Adaptable:** grilla de 1 columna en celular y 2 en PC (`sm:grid-cols-2`); botones de 44 px
  (`min-h-11`); textos largos con `break-words`; hereda el acento y el tema del estudio (layout).
- [x] **Delightful/enterprise:** confirmación en el lugar (sin ventanas emergentes), resultado del
  lote con lo emitido, lo frenado y lo que dijo ARCA; nada desaparece callado (sin leer → franja).
- [x] **Accesibilidad:** `Field` con `label` real y `htmlFor`; errores devueltos al campo con
  `aria-invalid`; una región viva por formulario (`role="alert"` si falló, `role="status"` si
  salió bien); navegación con `aria-label` y `aria-current`; todo operable por teclado (botones y
  enlaces nativos). Contraste: tokens del sistema (`text-strong`/`text-muted`/`text-danger`).
- [x] **Consistencia:** no se duplican patrones: el reintento usa `autorizarEnTandas` y su aviso
  (`avisoDeAutorizar`), la lista usa `leerFiltros`/`urlDeLista`/`paginaDeComprobantesEn`, el CSV
  usa `camposCsv`/`filaCsv`, el acceso por cliente usa `accesoAClienteDeCartera`.
- [x] **🇦🇷 Argentinizar SAP:** criollo claro; fiscal ARCA explicado (Factura C, plazo de 5/10 días,
  CbteFch, Administrador de Relaciones, punto de venta RECE web services); CSV con `;`, coma
  decimal y BOM para Excel en castellano; CUIT con dígito verificador.

## Bloque 2 — Sello GSG

- [x] App: `/contador` ya declara `metadata.generator = "Gestión Studio Grow"` (layout); las
  páginas nuevas llevan el pie discreto «Con tecnología de Gestión Studio Grow» (backoffice del
  estudio, no vidriera).
- [x] Docs: `ESCENARIOS-DEBORA.md`, `PEDIDOS-AL-MOTOR.md` y este archivo firman «— Elaborado por GSG».
- [x] Commit: trailer del equipo (`Co-Authored-By`).

## Bloque 3 — Excelencia de arquitectura

- [x] **Capas:** núcleos puros (`abonos-core`, `rechazo-core`, `exportar-core`) ← servidor sin
  "use server" (`cartera-abonos`, `cartera-gate`) ← actions con la llave (`cartera-abonos-actions`)
  ← páginas. Las funciones que reciben un tenantId NO son endpoints.
- [x] **Multi-tenant:** reglas en la auditoría del estudio (RLS por su `tenantId`); emisiones,
  facturas y lecturas de cada cliente en su `tenantTransaction`; los clientes salen de
  `filasDeCarteraDb(estudio)`. `Tenant` sólo para metadata de control (fuera de RLS por diseño).
- [x] **Seguridad/RLS:** sin `operatorPrisma`; un id de regla del formulario sólo vale si es del
  estudio; un cliente fuera de la cartera da el mismo «no está en tu cartera» (test postgres).
  El trinquete de endpoints (`guardia-negocio.test.ts`) sigue verde con las llaves movidas.
- [x] **Testabilidad:** 12 + 3 + 4 tests puros nuevos y 1 de integración contra Postgres con RLS
  (dos lotes simultáneos → una factura; rechazo → re-emisión; baja; estudio ajeno).
- [x] **Deuda anotada:** reglas en `AuditLog` hasta la tabla propia; idempotencia en la consola
  hasta el origen ABONO del motor; RI frenado hasta IVA por renglón; NC sin emisión — todo en
  `PEDIDOS-AL-MOTOR.md`. Lote secuencial por cliente (como `recorrerCartera`): medir con 30+
  clientes antes de paralelizar.

## Bloque 4 — Confiabilidad de producción

- [x] `npx tsc --noEmit`: **verde**.
- [x] `npm test` (suite completa, Postgres local): 5812 tests, 5802 verdes, 10 rojos. Uno era de
  este frente (redondeo a mano en `abonos-core.ts`, ya corregido con `@/lib/dinero/redondeo`);
  los 9 restantes son ajenos y no tocan archivos de este frente: navegador (2), búsqueda sin
  tildes/colación de la base local (`lista-postgres`, 3), carga/p95 (2), layout de admin (1) y
  los redondeos del club. Lo de este frente + las pruebas de forma que lo vigilan
  (`monitor-core`, `guardia-negocio`, `forma`, `src/app/contador/**`, `src/lib/cartera-*`):
  158 tests, 157 verdes (el rojo es el de redondeos del club) + la integración nueva verde.
- [x] `npm run build`: **verde** (rutas nuevas `/contador/abonos`, `/contador/lote`,
  `/contador/exportar`, `/contador/cliente/[clienteId]/comprobantes`).
- [ ] `npm run gates`: no terminó en 10 minutos en este contenedor (cortado por tiempo); queda
  para la integración.
- [x] **Aislamiento por tenant:** probado contra Postgres con rol `app_rls`.
- [x] **Errores:** cada cliente del lote falla solo (los demás siguen); lo que no se pudo leer se
  frena y se avisa; el CSV avisa arriba qué cliente no se leyó o quedó recortado; la facturación
  apagada se dice con una franja y el reintento se niega con el motivo.
- [x] **No rompe prod:** sin migraciones, sin cambios de schema, sin tocar Neon, sin deploy. Nada a
  `main`. Sin dependencias nuevas.
- N/A **Gate 2:** no hay migración en este frente (las tablas nuevas quedaron pedidas).

— Elaborado por GSG
