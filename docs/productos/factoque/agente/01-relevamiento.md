# 01 · Qué existe hoy (relevado sobre `main` @ `0cc6a10`, 14/11/2026)

> Sólo lectura del repo. No se consultó Neon. Las rutas son de `main` salvo donde dice otra rama.
> Conclusión corta: **el 70 % de la tubería ya existe**, pero vive en el producto A (Comerciante,
> `/admin/facturacion/bancos`) y no en Factoque, y la emisión automática tiene huecos de plata
> que hay que cerrar antes de que un agente la use (§6).

## 1. «Conceptos» en Factoque hoy

| Qué | Dónde | Qué es de verdad |
|---|---|---|
| `ConceptoFacturita` | `src/lib/facturita-core.ts:85` | Sólo el **concepto de ARCA** (`productos`/`servicios`/`ambos` → 1/2/3, `:87`). No es un concepto de negocio. |
| Fechas de servicio | `src/lib/facturita-core.ts:99` | Servicios y ambos exigen período; la ventana de fecha de ARCA es 5 días (productos) o 10 (servicios), `:107`. |
| «Mis productos» (atajos) | `src/lib/facturita-atajos.ts:32` (tipo `Atajo`), `:55` (validación), `:25` (`MAX_ATAJOS = 12`) | Lo más parecido a un concepto: **detalle + precio + concepto ARCA**, guardado como fila de `Product` (`src/lib/facturita-actions.ts:399` lee, `:426` guarda, `:470` quita). No tiene reglas para reconocer un cobro. |
| Abonos del estudio | `prisma/schema.prisma:2616` (`ReglaFacturacion`), `src/lib/cartera-abonos.ts:272-274` | Precedente de «se configura una vez y se factura solo» (abono mensual). Toma el candado `facturita-cupo:` después de `lote-abonos`. Es del producto B (Contador), no de Factoque. |

**No existe** un concepto con reglas de reconocimiento («todo lo que entra de X por alrededor de $Y es la cuota de Z»).

## 2. Subida y lectura de extractos

| Pieza | Dónde | Estado |
|---|---|---|
| Plugin `bancos` | `src/plugins/bancos/handler.ts:97` (`procesarExtracto`), `:87` (`detectarFormato`) | CSV y XLSX (`parser/csv.ts:77`, `parser/xlsx.ts:26`). Sin PDF. |
| Plantillas por banco | `src/plugins/bancos/domain/templates.ts:46-96` | Nación, Provincia, Galicia, Santander, BBVA, Macro y **Mercado Pago (CSV de actividad)**. Encabezados exactos, **sin verificar contra exportes reales** (provisional a confirmar). |
| Mapeo heurístico | `src/plugins/bancos/domain/mapeador.ts:158` (`mapearColumnas`), `:30` (`CONFIANZA_MINIMA`) | Por debajo de 0,8 pide confirmar el mapeo. |
| Lugar para la IA | `src/plugins/bancos/domain/mapeador.ts:384-389` | Puerto `MapeadorAsistido` con un stub: la IA se enchufa **sólo** cuando el heurístico no alcanza. |
| Clasificador | `src/plugins/bancos/domain/clasificador.ts:67` (`REGLAS_DEFAULT_BANCO`), `:189`, aprendizaje `:150` | Facturable / no facturable / revisar. **No** dice qué concepto es. |
| Aprendizaje por negocio | `prisma/schema.prisma:1538` (`ReglaClasificacionBancoTenant`) | Por contraparte o leyenda exacta. Solo clasifica, no asigna concepto. |
| Reglas de propuesta | `src/plugins/bancos/domain/reglas.ts:130` (`generarPropuestas`) | Umbral de identificación (`:31`), tope del mes (`:34`, `:63`), duplicados (`:147`, `:160`). |
| Persistencia | `prisma/schema.prisma:1460` (`ImportacionBancaria`), `:1485` (`MovimientoImportado`, único `[tenantId, hash]` `:1528`) | El archivo crudo se guarda **sin sellar** (`archivo Bytes`) y **sin huella del archivo**. |
| Pantallas | `src/app/admin/(dashboard)/facturacion/bancos/` (`ImportarExtracto.tsx`, `ColaRevision.tsx`, `EmitirFacturas.tsx`) | Backoffice del producto A. |
| Acciones | `src/lib/bancos-actions.ts:298` (procesar), `:326` (confirmar mapeo), `:445` (completar revisión), `:487` (emitir), `:507` (no facturable), `:582` (config) | Con capability de backoffice. |
| Extractos por WhatsApp | `prisma/schema.prisma:2518` (`ExtractoRecibido`) | Del producto B: contenido **sellado**, purga, único por `sha256` del archivo. Buen molde para Factoque. |

## 3. Mercado Pago

| Pieza | Dónde | Estado |
|---|---|---|
| Conexión OAuth desde Factoque | `src/app/facturita/app/cuenta/mercadopago/conectar/route.ts`, `vuelta/route.ts`; `src/lib/facturita-mp.server.ts:89` (guardar), `:131` (desconectar), `:142` (renovar) | Existe en la cuenta de Factoque. |
| Modo de facturación de MP | `src/lib/mercadopago-clasificacion.ts:18` (`apagado`/`proponer`/`automatico`), `:24-33` (`ConfigFacturacionMP`: concepto, mínimo, palabras excluidas) | Una sola configuración para todo MP: **un** concepto ARCA para todos los cobros. |
| Guardar la config | `src/lib/facturita-mp.server.ts:216`, `:238` | Con candado y auditoría. |
| Ingesta automática | `src/lib/mercadopago-auto.ts:210-240` (umbral + tope), `:255-268` (tope del plan), `:343`, `:357` | El tope se cuenta **una vez por corrida, fuera de candado** (`:284`). |
| Factura de un pago | `src/lib/invoice-from-mp.ts:79-130` | Concepto fijo «productos», consumidor final, clave `mp:<pago>`. |

## 4. Emisión por ARCA y cupo

| Pieza | Dónde |
|---|---|
| Emisión manual de Factoque | `src/lib/facturita-actions.ts:194` → `emitirComprobanteManual` (`src/lib/facturacion/emision-manual.server.ts:96`). Candado por clave de emisión (`:163`) y **candado del cupo `facturita-cupo:`** con el plan leído en la misma transacción (`:174-177`). |
| Plan y cupo | `src/lib/facturita-core.ts:13` (Gratis = 5), `src/lib/facturita-planes.ts:44-62` (Gratis), Plus 40, Pro 159; `src/lib/facturacion/plan-factoque.server.ts:43` (`planFactoqueEnTx`). |
| Libro «una factura por cobro» | `prisma/schema.prisma:2652` (`CobroFacturado`, único `[tenantId, clave]`); `src/lib/facturacion/cobros-facturados.ts:34-38` (claves `mp:`, `turno:`, `banco:`), `:102` (`tomarClaves`, candado por clave), `:141` (`facturarCobrosInTx`). Una factura rechazada no cuenta. |
| Emisión del extracto | `src/lib/bancos-glue.ts:672` (`emitirPropuestas`): claim `auto→emitida` (`:719`), libro de cobros, concepto fijo 1 (`:765`), despacho a ARCA. |
| Anular | `src/lib/facturita-actions.ts:311` → `crearNotaDeCreditoInTx` (`src/lib/invoice-core.ts:714`). La nota no ocupa cupo y toma el mismo candado. Test de inmutabilidad: `src/lib/comprobante-autorizado-inmutable-postgres.test.ts`. |

## 5. Frontera comercial vigente

- `docs/adr/ADR-076-suite-facturacion-un-motor-tres-productos.md:42`: **«C jamás incluye extracto ni conciliación»**.
- `src/lib/facturita-planes.ts:58-59`: el plan Gratis dice «Subir el extracto del banco ni conciliar» en *no incluye*.
- `src/app/facturita/page.tsx:70-71`: la landing responde que el extracto «es Comerciante, otro producto».
- Comerciante Solo (`src/lib/facturita-planes.ts:186-197`): $14.900, 159 facturas, «las facturas se arman solas desde el extracto». Factoque Pro: $15.000, 159 facturas, sin extracto.

**La orden del dueño del 14/11 cruza esta frontera.** Eso necesita una decisión registrada (ver `05-decisiones.md`, D0).

## 6. Huecos de plata encontrados (existen hoy, con o sin agente)

| # | Hueco | Dónde | Por qué importa |
|---|---|---|---|
| H1 | **Dos cobros legítimos iguales se pierden.** El hash es `fecha|monto|descripción` (`src/plugins/bancos/domain/valores.ts:143`), sin contraparte, cuenta ni orden. El segundo se descarta como «duplicado dentro del archivo» (`reglas.ts:147`) o «ya procesado» (`:160`). | `valores.ts:143`, `reglas.ts:147-168` | Dos clientes que transfieren $20.000 el mismo día con la leyenda «TRANSF RECIBIDA» dan **una** factura. Se factura de menos: riesgo fiscal. |
| H2 | **El tope de la emisión automática no toma el candado del cupo.** `emitirPropuestas` cuenta las facturas del mes una vez, fuera de transacción (`bancos-glue.ts:686`), y no toma `facturita-cupo:`. Lo mismo `mercadopago-auto.ts:284`. | `bancos-glue.ts:686-715`, `mercadopago-auto.ts:284` | Dos lotes a la vez, o un lote y una factura manual, pasan el tope del plan. En Factoque el tope es el producto (5/40/159). |
| H3 | **El mismo archivo dos veces no se reconoce como archivo.** `ImportacionBancaria` no guarda huella. Hoy lo salva el hash de movimiento, con el defecto de H1. | `schema.prisma:1460-1481` | Si se arregla H1 con un ordinal sin huella de archivo, subir dos veces el mismo archivo tiene que dar los mismos ordinales. |
| H4 | **Fecha del comprobante.** El extracto se usa con la fecha del movimiento (`bancos-glue.ts:766`). Un extracto mensual trae movimientos fuera de la ventana de ARCA (5/10 días, `facturita-core.ts:107`), y un lote ordenado por fecha puede quedar detrás de una factura manual de hoy. | `bancos-glue.ts:694`, `:766` | Rechazo de ARCA o factura con fecha que no corresponde. Regla a confirmar con la contadora (D4). |
| H5 | **Concepto fijo «productos»** en el extracto y en MP (`bancos-glue.ts:765`, `invoice-from-mp.ts:101`). | | Un monotributista de servicios factura mal el concepto. |
| H6 | **El archivo crudo no se sella ni se purga** (`ImportacionBancaria.archivo`). | `schema.prisma:1467` | Datos de terceros (nombres, CUIT, CBU) sin plazo: Ley 25.326. El molde sellado ya existe (`ExtractoRecibido`). |
| H7 | **Mercado Pago en modo `automatico` emite por su propio camino, con el tope equivocado para Factoque.** Decide `emitir` sin firma (`mercadopago-clasificacion.ts:142-143`) y el tope sale de `capFacturasMesDelNegocioEnTx` (`limites-del-negocio-en-tx.ts:33`), que para un negocio Factoque da 159 y no 5/40 (lo probó la certificación, `07-dictamen.md` B3). **Latente:** hoy nadie llama a `guardarConfigFacturacionMP` (`facturita-mp.server.ts:238`) y el modo queda `apagado`; el día que se cablee la pantalla, un Factoque Gratis podría emitir 159 facturas. El molde correcto es `cartera-abonos.ts:275-276` (`planFactoqueEnTx`). | `mercadopago-clasificacion.ts:142`, `limites-del-negocio-en-tx.ts:33` | Se pasa el cupo del plan y queda una vía de emisión fuera de la autorización. |
| H8 | **Una `referencia` cualquiera del banco se trata como pago de MP** (`mp:<ref>`). | `bancos-glue.ts:744` | Una referencia bancaria que coincida con un id de MP ata el cobro a otra factura. |
