# Motor de facturación automática — diagnóstico (22/10/2026)

**Rama:** `claude/facturacion-automatica-motor` (sobre `claude/facturacion-automatica`).
**Contrato de API:** `src/lib/facturacion/README.md`. **Gate:** `GATE.md` (esta carpeta).

## Calibración (zona estándar: precisa, convencional)

- Nunca dos CAE por comprobante: la invariante vive en la base (índice único, fila tomada), no en
  la app (DB-4). Ante la duda se consulta a ARCA antes de pedir otro número.
- Todo parado en el negocio (`tenantTransaction`) y con `tenantId` en la consulta; tabla nueva con
  RLS en la misma migración (MT-1, MT-5, SEC-2).
- Credenciales fiscales por negocio, nunca en el repo; homologación a prueba de errores (ADR-066,
  ADR-077 §6, SEC-1).
- Migraciones generadas **sin aplicar**, con timestamp sin colisión (DB-1, DB-3).
- La lógica fiscal va con tests contra el simulador; verde antes de commitear (MP-8).

## Qué estaba sólido (no se tocó)

| Pieza | Dónde | Por qué es sólido |
|---|---|---|
| Outbox transaccional | `invoice-core.ts` | Factura PENDING + envío en la misma transacción (ADR-002). |
| «En duda» (ENG-020) | `plugins/arca/handler.ts` | Anota el número antes de pedirlo; el reintento consulta (`FECompConsultar`) y, si ARCA ya lo autorizó con esos datos y no es de otra factura, lo adopta. Contempla la autorización tardía (602 + último ≥ número). |
| Pasajero vs rechazo (ENG-021) | `arca-dispatch.ts`, `domain/errores-arca.ts` | 600/10016/501/5xx/timeout dejan PENDING; un `R` rechaza y cierra el envío en una transacción. |
| Toma con reserva | `arca-reserva.ts` | `FOR UPDATE SKIP LOCKED` + token de corrida: dos despachos no mandan el mismo envío. |
| Idempotencia por venta | `@@unique` de pedido/turno/pago MP | La base corta la carrera (P2002). |
| Decisión fiscal única | `fiscal/decidir-comprobante.ts` | Letra, NC (saldo, misma letra/receptor), ventana de fechas, umbral del consumidor final. |
| Credencial por negocio | `fiscal/tenant-cert.ts`, `afip/factory.ts` | Cifrada; fail-closed; guard cert↔CUIT en real. |

## Qué estaba a medias (WIP `5c066682`, sin verificar) y cómo quedó

| WIP | Estado encontrado | Qué se hizo |
|---|---|---|
| Reintentos con espera creciente y tope (`arca-reintentos.ts`, `arca-reserva.ts`) | Escrito, sin tests; las columnas `proximoIntentoEn`/`muertoEn` ya existían (`20260925120000_lanzamiento_base`) | Verificado (21/21 de los Postgres del WIP); tests puros; la acción humana «Autorizar los pendientes» ahora pasa `ignorarEspera` y `reactivarDetenidos` (si no, el backoff la dejaba «sin avance»). |
| Interruptor por servicio (`afip/interruptor.ts`) | Escrito, sin tests | Tests con reloj inyectado y con el transporte real + simulador. |
| Firmante / delegación (`fiscal/firmante.ts`, `resolverFirmaParaTenant`) | Escrito, sin tests | Tests puros y del resolvedor. |
| `modoEfectivoDelTenant` | Escrito, **sin usar** | Cableado en `crearClientePara`: con `ARCA_MODO=real`, un negocio en homologación corre como homologación (endpoint de prueba, sin guard estricto). |
| NC en el payload (`clase`/`asociado`) | Tipos y payload listos, **ningún camino la creaba** | `crearNotaDeCreditoInTx` / `crearNotaDeCredito`. |
| `LoteFacturacion` / `BorradorComprobante` en el schema | Modelos sin migración y sin código (`motor.server.ts` no existía) | **Sacados.** Nada los usaba y la consola ya resuelve el lote; sumarlos era otra migración sin consumidor (MP-13). Si se quieren, es una decisión aparte. |

## Qué faltaba y se cerró

1. **Nota de crédito asociada (pedido 1, alta).** Firma pedida, en `invoice-core.ts`. Toma la
   factura `FOR UPDATE`, suma las notas vivas, prorratea al centavo (`nota-credito-core.ts`),
   valida con `decidirComprobante` y encola el envío con CbtesAsoc. Probado contra el simulador:
   parcial + resto, saldo excedido, dos pedidos a la vez (sale uno), sobre otra nota, otro negocio.
2. **Conteo de pendientes por negocio (pedido 6).** `contarPendientesDelNegocio(tenantId)` en
   `arca-dispatch.ts`; el panel del negocio ya la usa (una sola cuenta).
3. **Descripción del comprobante (pedido 5).** `CreateInvoiceInput.descripcion` → `Invoice.descripcion`
   (sólo se escribe si viene). Migración nueva (Gate 2).
4. **Origen `ABONO` con clave única (pedido 2).** `origin: { type: "ABONO", id: claveDeAbono(regla, mes) }`
   → `Invoice.abonoClave` con `@@unique([tenantId, abonoClave])`. Probado: dos pedidos a la vez dan
   una factura y un CAE. Migración `20261022140000_invoice_abono_descripcion` (Gate 2).
5. **Tabla `ReglaFacturacion` (pedido 3).** Con la forma pedida, FK de dos columnas a
   `CarteraCliente` (sólo clientes de la cartera del estudio), CHECK y RLS en la migración.
   `20261022140100_regla_facturacion` (Gate 2). Ensayada en Postgres 16 local.
6. **Abonos de RI con IVA por renglón (pedido 4).** `montosDeRenglones` (`facturacion/renglones.ts`):
   misma cuenta que una venta, marca `ivaPorProducto` y el plugin lo deja emitir.
7. **Bug encontrado y arreglado:** en `createInvoice`, el perdedor de una carrera por el mismo
   origen leía al ganador con `prisma` sin contexto de negocio y, con `RLS_ENFORCEMENT=on`,
   reventaba (`getCurrentTenantId`). Ahora lee con `tenantTransaction`. Afectaba también a
   pedido/turno/pago MP.
8. **Umbral de identificación del consumidor final.** La tabla ya tenía $10.000.000 desde el
   29/05/2025 (RG ARCA 5700/2025), de fuentes secundarias. No se pudo leer el Boletín Oficial desde
   este entorno: el valor queda **«a confirmar con el contador»** (anotado en la fila).

## Lo que no se hizo (y por qué)

- **Interruptor compartido entre instancias.** Hoy vive en la memoria de cada instancia; entre
  procesos protegen la espera por envío y el corte de la corrida. Compartirlo es una tabla nueva
  → decisión del dueño (abajo).
- **Borrar los adaptadores de la consola.** Son de `src/app/contador/**` y `src/lib/cartera-*` (no
  son de este frente) y dependen de que se apliquen las migraciones.
- **Respuestas grabadas de ARCA.** El simulador sigue «provisional a confirmar» hasta la prueba de
  homologación del dueño (esta máquina no llega a `*.afip.gov.ar`).

## Ensayos

- Postgres 16 local (cluster aparte en `:5433`, `trust` sólo por socket local, el que documenta
  `src/test/base-efimera.ts`). El arnés aplica **todas** las migraciones, incluidas las dos nuevas,
  y la RLS (`0002_app_role`, `0001_enable_rls`) en cada base efímera: las dos nuevas aplican limpio.
- Drift schema ↔ migraciones (`prisma migrate diff --from-migrations`, base sombra local): sólo
  aparece `Client.phone SET NOT NULL`, **preexistente y ajeno** a este frente.
- Nada contra Neon.

## Decisiones del dueño

1. **Gate 2:** aplicar `20261022140000_invoice_abono_descripcion` y `20261022140100_regla_facturacion`
   (aditivas). Orden: migración → deploy (el código nuevo lee/escribe esas columnas).
2. **Umbral del consumidor final:** confirmar con el contador el monto vigente ($10.000.000, RG 5700/2025).
3. **Interruptor compartido** entre instancias (tabla nueva) — hoy no hace falta con el cron diario.
4. **Política de reintentos** (8 intentos, 1→60 min ≈ 3 h): con el cron diario de Vercel Hobby, en la
   práctica los reintentos los disparan las ventas y la persona; un cron más seguido es gasto/plan.

— Elaborado por GSG
