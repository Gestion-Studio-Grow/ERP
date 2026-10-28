# Gate de Excelencia — Consola del contador (abonos, lote, comprobantes, notas de crédito, exportación)

**Frente:** facturación automática · consola del contador · rama `claude/facturacion-automatica-contador`
**Fecha:** 2026-10-22 (2ª vuelta, ya con el motor nuevo `ba965cc3`) · **Corrió:** el agente de la
consola del contador (Opus).
**Alcance:** `src/app/contador/{abonos,lote,exportar,cliente/[clienteId]/comprobantes}/**`,
`Avisos.tsx`, `rechazo-core.ts`, `exportar-core.ts`, `src/lib/cartera-{gate,abonos,abonos-actions}.ts`,
el refactor de `cartera-actions.ts` (las llaves pasan a `cartera-gate.ts`) y los enlaces en
`page.tsx` / `CarteraPanel.tsx`.

## Calibración (ADR-052)

- **El aislamiento manda:** todo dato de un cliente se lee y se escribe con
  `tenantTransaction({ tenantId: cliente })`, después de verificar que es de la cartera del estudio
  de la sesión. Nunca `operatorPrisma`, nunca un id que venga de afuera sin pasar por la cartera.
- **La plata no se duplica:** una factura por (regla, mes) con el origen `ABONO` del motor y su
  índice único; una nota de crédito nunca anula más de lo facturado (lo decide el motor con la
  factura bloqueada). Ante la duda, no se emite.
- **Reusar el motor, no reescribirlo:** `createInvoiceInTx`, `claveDeAbono`, `crearNotaDeCredito`,
  `montosDeRenglones`, `contarPendientesDelNegocio`, `procesarEnviosDelNegocio`, `autorizarEnTandas`,
  `lista.server`. Lo que falta va a `PEDIDOS-AL-MOTOR.md`.
- **Lógica en núcleos puros con tests (MP-8);** UI chica, accesible y mobile-first.
- **Zona de de-sesgo (ADR-046):** textos visibles en criollo claro para una contadora argentina
  («Frenado», «Volver a emitir», «Lo resuelve Soporte GSG»); código y nombres, estándar.

## Hallazgos de la Auditoría GSG (2ª vuelta) — cerrados

| # | Hallazgo | Cómo se cerró |
|---|---|---|
| I2 | `mandarPendientesDelCliente` no pasaba `ignorarEspera` / `reactivarDetenidos` | Recibe `OpcionesDeEnvio`: `OPCIONES_DE_UNA_PERSONA` (las dos en `true`) desde «Mandar los pendientes a ARCA»; `OPCIONES_DEL_LOTE` (en `false`) desde el lote. Test Postgres con el simulador de ARCA: un envío detenido NO se toma con las del lote y SÍ con las de una persona (queda autorizado). |
| M2 | Consumidor final sin identificar por encima del umbral | `validarReglaAbono` usa `UMBRAL_IDENTIFICACION_CONSUMIDOR_FINAL` + `vigenteEn` (tabla de vigencias del motor) al 1° del mes de inicio: «Desde $10.000.000, ARCA pide identificar al comprador: cargale CUIT o DNI». Con test. |
| M4 | Emitir a un cliente dado de baja durante el lote | Antes de CADA emisión se relee la fila de `CarteraCliente`; si no está activa, no se emite y se dice por qué. **Va en la transacción del estudio, no en la del cliente:** `CarteraCliente` es del estudio y con el GUC del cliente RLS devuelve 0 filas (el GUC es uno por transacción). La ventana que queda es la de una sola emisión. |
| M5 | Foco al body al confirmar; región viva que cambiaba de rol | `EmitirLote`, `BajaRegla` y `AnularFactura` mueven el foco al «Sí, …» (o al primer campo) y lo devuelven al botón al cancelar. Todos los controles usan `Avisos.tsx`: dos regiones FIJAS, `role="status"` y `role="alert"`. |
| M6 | Lote sin `maxDuration` | `export const maxDuration = 60` en `/contador/lote` y en `/contador/cliente/[id]/comprobantes` (Next 16, route segment config: el tope de la página vale para sus Server Actions). Si una cartera grande lo pasa, el lote se corta sin duplicar (ABONO) y se retoma al tocar de nuevo. |
| — | GATE decía «sin migraciones» | Corregido abajo (Bloque 4 y Gate 2). |

## Bloque 1 — Auditoría SAP Fiori (7 ángulos) + ángulo argentino

- [x] **Rol-based:** todo vive detrás de `cartera:manage` + módulo `cartera` (`exigirEstudio`); la
  usuaria de un negocio común no ve nada (test Postgres: B no puede emitir el lote).
- [x] **Coherente:** mismos componentes que el resto del panel (`PageHeader`, `Bloque`, `Renglon`,
  `Plata`, `Franja`, `ButtonLink`), mismo pie de GSG, misma navegación «Volver a la cartera».
- [x] **Simple:** el mes se resuelve en una pantalla (lote) con un botón; anular es «Anular» en el
  renglón de la factura (motivo + importe opcional); los rechazos dicen qué hacer en una línea.
- [x] **Adaptable:** 1 columna en celular y 2 en PC; botones de 44 px (`min-h-11`); textos largos
  con `break-words`; hereda el acento y el tema del estudio (layout).
- [x] **Delightful/enterprise:** confirmación en el lugar (sin ventanas emergentes), resultado del
  lote con lo emitido, lo frenado y lo que dijo ARCA; nada desaparece callado (sin leer → franja;
  migración pendiente → franja, no un 500).
- [x] **Accesibilidad:** `Field` con `label` real y `htmlFor`; errores al campo con `aria-invalid`;
  dos regiones vivas fijas (`Avisos`); foco gestionado al confirmar y al cancelar (M5); navegación
  con `aria-label` y `aria-current`; todo operable por teclado. Contraste: tokens del sistema.
- [x] **Consistencia:** el reintento usa `autorizarEnTandas` y su aviso; la lista usa
  `leerFiltros`/`urlDeLista`/`paginaDeComprobantesEn`; el CSV usa `camposCsv`/`filaCsv`; el acceso
  por cliente usa `accesoAClienteDeCartera`; el umbral del consumidor final es la tabla del motor.
- [x] **🇦🇷 Argentinizar SAP:** criollo claro; fiscal ARCA explicado (Factura C, A/B con IVA 21 %,
  nota de crédito asociada, plazo 5/10 días, umbral RG 5700, Administrador de Relaciones, punto de
  venta RECE web services); CSV con `;`, coma decimal y BOM; CUIT con dígito verificador.

## Bloque 2 — Sello GSG

- [x] App: `/contador` declara `metadata.generator = "Gestión Studio Grow"` (layout); las páginas
  nuevas llevan el pie discreto «Con tecnología de Gestión Studio Grow» (backoffice, no vidriera).
- [x] Docs: `ESCENARIOS-DEBORA.md`, `PEDIDOS-AL-MOTOR.md` y este archivo firman «— Elaborado por GSG».
- [x] Commit: trailer del equipo (`Co-Authored-By`).

## Bloque 3 — Excelencia de arquitectura

- [x] **Capas:** núcleos puros (`abonos-core`, `rechazo-core`, `exportar-core`) ← servidor sin
  "use server" (`cartera-abonos`, `cartera-gate`) ← actions con la llave (`cartera-abonos-actions`)
  ← páginas. Las funciones que reciben un tenantId NO son endpoints.
- [x] **Multi-tenant:** reglas en `ReglaFacturacion` del estudio (RLS + llave foránea a
  `CarteraCliente`: la base impide una regla sobre un negocio fuera de la cartera); facturas y notas
  de crédito de cada cliente en su `tenantTransaction`; los clientes salen de
  `filasDeCarteraDb(estudio)`. `Tenant` sólo para metadata de control.
- [x] **Seguridad/RLS:** sin `operatorPrisma`; un id de regla sólo cambia una regla activa de ESE
  estudio (predicado + RLS); un cliente fuera de la cartera da el mismo «no está en tu cartera»
  (test Postgres, también para la nota de crédito). El trinquete `guardia-negocio.test.ts` sigue verde.
- [x] **Testabilidad:** núcleos puros (abonos 14, rechazos 3, CSV 4) y 1 integración contra
  Postgres con RLS que recorre: regla → dos lotes simultáneos (1 factura, ABONO + descripción) →
  rechazo y re-emisión en la misma fila → detenido (lote no / persona sí, simulador de ARCA) →
  nota de crédito parcial y exceso rechazado → baja → estudio ajeno.
- [x] **Deuda anotada:** alícuota fija 21 % en abonos de inscripto (pedido §7); descripción con
  una consulta extra en el CSV (pedido §8); lote secuencial por cliente (medir con 30+ clientes);
  M4 relee la cartera fuera de la transacción del cliente (por RLS, ver tabla de hallazgos).

## Bloque 4 — Confiabilidad de producción

- [x] `npx tsc --noEmit`: **verde**.
- [x] `npm test` (suite completa, Postgres 16 local en :5434, `TSX_DISABLE_CACHE=1`): **5905 tests,
  5902 verdes, 3 rojos**, los 3 de la base conocida y ajenos a este frente (`pie-pegado-zona-segura`,
  cron de recordatorios con RLS, redondeos a mano del club; ninguno nombra un archivo de
  `src/app/contador` ni `src/lib/cartera-*`). **Cero rojos nuevos.** Lo del frente
  (`src/app/contador/**` + la integración): 61 verdes, 0 rojos; la integración corrida también con
  `CI=1` (no se puede saltear).
- [x] `npm run build`: **verde** (`/contador`, `/contador/abonos`, `/contador/lote`,
  `/contador/exportar`, `/contador/cliente/[clienteId]/comprobantes`).
- [x] eslint sobre lo tocado: limpio. (`npm run gates` no se corrió en esta vuelta: en la 1ª no
  terminó en 10 minutos en este contenedor.)
- [x] **Aislamiento por tenant:** probado contra Postgres con rol `app_rls`.
- [x] **Errores:** cada cliente del lote falla solo; lo que no se pudo leer se frena y se avisa;
  migración pendiente → mensaje honesto; el CSV avisa arriba qué cliente no se leyó o quedó
  recortado; facturación apagada → franja y el reintento se niega con el motivo.
- [x] **No rompe prod:** sin deploy, nada a `main`, sin dependencias nuevas, no se tocó Neon ni
  `prisma/**`.
- [ ] **Gate 2 — PENDIENTE DEL DUEÑO:** esta vuelta **sí depende de migraciones**. Abonos, lote y la
  descripción del CSV consumen `ReglaFacturacion` y `Invoice.abonoClave`/`descripcion`, de
  `20261022140000_invoice_abono_descripcion` y `20261022140100_regla_facturacion` (del motor,
  generadas y SIN aplicar). Sin ellas: «Abonos» y «Lote del mes» muestran «falta un paso de base de
  datos» (P2021/P2022 atrapados), la nota de crédito contesta lo mismo (el motor le guarda la
  descripción) y el CSV sale con «Qué se facturó» vacío; la lista de comprobantes y el reintento
  andan igual. **No integrar a `main` antes de aplicarlas.**

## Nota de integración (X0, 28/10/2026)

La consola quedó integrada con `main` en la rama `integ-facturacion` (dictamen: `docs/producto/X0-integracion-facturacion.md`).
Nada llegó a `main` y la advertencia de arriba sigue vigente.
- Choque R3 (`5ed613f7`, la factura del proveedor es UNA compra): sobre PGlite, importar dos veces el mismo
  «Mis Comprobantes Recibidos» desde la consola deja 8 compras y avisa «Ya estaba cargado» en las 8
  (`recibidos-postgres.test.ts:132-155`); `compra-factura-postgres` 1/1. La afirmación de RLS del mismo
  test no se puede probar en PGlite.
- Choque Serializable (`003c27c1`): el lote usa `tenantTransaction` sin Serializable (`cartera-abonos.ts:260-275`)
  y el reintento nuevo sólo actúa cuando se pide Serializable; el duplicado sigue llegando como P2002 →
  «ya emitida». `cartera-abonos-postgres` y `una-factura-por-cobro-postgres` verdes en PGlite, que
  atiende de a una sesión: prueba el resultado de la dedupe, **no la carrera**.
- QA a 360 px sobre la app compilada: cartera → Abonos (alta) → Lote (confirmación, «1 autorizado»; repetir
  no emite) → Comprobantes → NC por más de lo facturado (rechazada con el saldo) → NC parcial (−$30.000) →
  Exportar (CSV con la NC en negativo). Sin las 3 migraciones: todas las pantallas 200, Abonos con la franja
  «falta un paso de base de datos».
- Arreglado en X0 (`f0ad761f`): la tabla de la cartera lleva `relative` en su contenedor con scroll (el
  `caption` `sr-only` podía desbordar la página).

— Elaborado por GSG
