# Plan de tandas — Finanzas y Control (MIA Producciones como primer cliente)

> Catálogo: `CATALOGO-FINANZAS-CONTROL.md`. Método: `METODO-SCOPE-ITEMS.md`. Fecha: 11/11/2026.
> **Este documento planifica; no construye.** Cada tanda es una sesión separada, fresca, con 1 o 2
> constructores (`gsg-ingeniero`, Opus esfuerzo alto) y, donde hay plata o impuestos, un `gsg-certificador`
> sobre el diff. Máximo 3 agentes pesados a la vez. Brief ≤ 2 KB que apunta a la ficha del catálogo y a
> `archivo:línea`.

## Reglas comunes a todas las tandas

- **Migraciones:** aditivas, **escritas sin aplicar**. Aplicarlas es **Gate 2 del dueño**. Hasta entonces:
  **sólo tablas nuevas** (los datos nuevos de un modelo existente van en una tabla lateral 1 a 1, no en una
  columna: una columna nueva sin aplicar rompe las pantallas que hoy andan), **una sonda por migración** al
  estilo de `migracionContableAplicada` (`src/lib/contabilidad/modulo.server.ts:40`), cambios de
  `prisma/schema.prisma` **en serie** (nunca dos tandas a la vez) y timestamp reservado por tanda.
- **Integración:** las tandas se integran a una **rama del arco** (`arco/finanzas-control`), no a `main`: un push
  a `main` con `MIGRATE_DATABASE_URL` cargada aplica las migraciones solo. El paso a `main` es un único PR, con
  orden del dueño.
- **Datos reales:** sólo en una **rama de prueba de Neon** creada por el dueño o la orquestadora, que no
  compita con la rotación de 4 respaldos y se **borre al cerrar la prueba**. La rama copia todos los negocios:
  antes de usarla se anonimizan o se vacían los otros tenants. Requiere el **consentimiento registrado del
  cliente** para tratar sus datos. La corrida con datos reales la hace la orquestadora o el dueño con un script
  que devuelve sólo `n/n` y diferencias en centavos **sin** nombres ni importes, para que no queden en el
  contexto de ningún agente. Los datos de MIA salen del Drive del dueño; **ni datos personales ni montos en
  Git**, tampoco en tests ni en informes. Los tests del repo usan datos sintéticos.
- **Criterio comprobable:** toda comparación con datos reales se aprueba con **diferencia de 0 centavos** o con
  cada diferencia listada y clasificada; cuando interviene el estudio, queda un **acta con fecha y firma**.
- **Plata:** centavos enteros en el libro; cada hecho contable lleva test de cuadre (debe = haber) y de
  idempotencia.
- **Aislamiento:** `tenantId` + `tenantTransaction` + RLS en toda tabla nueva; test de «otro negocio no ve».
- **Cierre de tanda:** `npx tsc --noEmit`, suites en resumen `n/n`, guion clic por clic del scope item, Gate de
  Excelencia, PR (sin push a `main`), informe ≤ 300 palabras y medición de consumo.
- **Guion de prueba:** cada tanda escribe `docs/finanzas-control/guiones/FC-nn.md` y lo corre dos veces: con
  datos sintéticos (en el repo) y con un mes real de MIA (en la rama de prueba; se registra sólo `n/n`).

## T0 · Precondiciones (dueño, orquestadora y estudio; sin constructor)

| # | Qué | Quién |
|---|---|---|
| 1 | Aplicar en la rama de prueba `contabilidad_ola1` y `ola2_roles`; confirmar si `ola2` está en producción | Dueño (Gate 2) |
| 2 | Crear la rama de prueba de Neon y cargar el tenant de MIA con padrones desde planillas | Dueño / orquestadora |
| 3 | Cerrar los pendientes del brief: 7 respuestas en amarillo, usuarios y roles, regla 70/30, quién cierra el mes | Dueño con el cliente |
| 4 | Con el estudio de MIA: plan de cuentas, momento del ingreso, tipo de cambio, regímenes de retención, coeficientes de IIBB, qué sistema usa y qué archivos quiere | Dueño con el estudio |
| 5 | Habilitar en la sesión los dominios públicos de SAP y releer las fuentes marcadas [E], [I] y [AV] | Dueño (red) + `gsg-investigador` |
| 6 | Corregir J59/J60 y 1W0 en `docs/estrategia/mapa-cobertura-scope-items.md` | Tanda de docs |
| 7 | **Venta registrada** (o decisión expresa del dueño de invertir antes) y **perfil de MIA por scope item** cerrado por escrito | Dueño |
| 8 | Consentimiento registrado de MIA para tratar sus datos en la prueba | Dueño con el cliente |

Sin 1 y 2 se puede construir (el código tolera la migración ausente) pero **no probar con datos reales**.
Sin 4, todo valor fiscal queda «provisional a confirmar» y no sale a producción.

## Etapas (DEMO → VENTA → INVERSIÓN)

El arco entero son 13 tandas. No se construye todo antes de vender:

- **Etapa 1 · mínimo vendible para MIA** (reemplaza las planillas y la agenda de pagos): **T1 → T2a → T4 →
  T5-A → T6 → T10-A → TS**. El libro corre en sombra (T2a): MIA no lo ve todavía; el balance lo sigue haciendo
  el estudio.
- **Etapa 2 · con la venta firmada y las tablas fiscales validadas por el estudio:** T3, T5-B, T7, T8, T2b,
  T9, T10-B.
- T7 (monitor) es barata e independiente: puede adelantarse a la etapa 1 si el dueño la quiere para la demo.

**Perfil de MIA (propuesta a cerrar en T0-7):** `enterprise` en cobrar, pagar, bancos, retenciones y control de
gestión (retiene como agente, opera en dos monedas, controla por proyecto); `lite` en contabilidad general
(FC-03: libro en sombra y salidas al estudio) y en presupuesto de empresa (FC-14).

## Orden y dependencias

```
T1 ─► T2a Motor ─► T4 Cobrar ─► T5-A Pagar ─► T6 Bancos ─► T10-A Rentabilidad ─► TS Salida     (etapa 1)
T3 Indicadores ─► T5-B Retenciones ─► T8 IIBB y posición ─► T2b Libro ─► T9 Cierre ─► T10-B     (etapa 2)
T7 Monitor (independiente)
```

Los cambios de schema van **en serie**: por eso el orden es una fila y no un árbol. Paralelo admitido sólo
entre una tanda con migración y otra sin ella (T7 con cualquiera; T2b con T8). Nunca más de 3 agentes pesados.
T3 va antes de contabilizar compras con detalle de impuestos: en la etapa 1 la compra se contabiliza con los
campos de IVA y percepciones que ya existen.

## Tandas

### T1 · Fundación: scope items, plan de cuentas y ejercicio (FC-01) — 1 constructor
- **Alcance:** ampliar el descriptor de scope item (código, referencia SAP, perfil, dependencias, guion) sin
  cambiar las guardias; módulo `finanzas-control` en el catálogo; pantallas de plan de cuentas (árbol, agregar
  hoja, activar, asignar rol) y de ejercicio; roles nuevos de §1.3 del catálogo; plan de rubro «servicios por
  proyecto».
- **Migración:** ninguna nueva (usa ola1 y ola2). Los roles nuevos son código.
- **Aceptación:** sembrar el plan en un tenant vacío deja todos los roles con cuenta o los lista como faltantes;
  no se puede imputar a una cuenta que agrupa; un tenant no ve el plan de otro; sin migración aplicada la
  pantalla muestra el aviso de `MENSAJE_MIGRACION_PENDIENTE` y no rompe.
- **Prueba real:** sembrar el plan validado por el estudio en la rama de prueba; roles 100 % asignados.

### T2a · Motor de contabilización en sombra (FC-02) — 1 constructor + certificador
- **Alcance:** motor puro `hecho → líneas` (una función por asiento tipo, con motivo en criollo); cola de «sin
  contabilizar»; conversión `Float` → centavos **redondeando cada documento** (nunca sumar y redondear después);
  la invariante I2 se recalcula con esa misma regla, línea por línea. Arranca con los hechos de la etapa 1
  (cobrar, pagar, banco, comisión, reintegro); los de impuestos del mes se suman en la etapa 2.
- **Migración (tablas nuevas, sin aplicar):** tabla lateral de la línea del asiento (moneda, importe de origen,
  tipo de cambio, proyecto, productor, rubro) y tabla de **clave de contabilización** con único
  `(tenantId, origenTipo, origenId, evento)`: hoy `Asiento` no tiene único por origen, y uno simple chocaría con
  el contraasiento del mismo documento. Numeración correlativa con bloqueo.
- **Aceptación:** cada asiento tipo cuadra y coincide con §1.3 del catálogo; contabilizar dos veces no duplica;
  anular genera contraasiento con su propia clave; dos confirmaciones simultáneas no duplican ni saltean número;
  invariante I4 en test; sin migración aplicada, nada de lo existente cambia.
- **Prueba real:** contabilizar un mes de MIA: Σ debe = Σ haber, y la cola de pendientes queda en cero o con
  cada pendiente clasificado por motivo.

### T2b · Libro: diario, mayor, sumas y saldos, asiento manual (FC-03 parte 1) — 1 constructor · etapa 2
- **Migración:** ninguna.
- **Aceptación:** sumas y saldos con Σ debe = Σ haber; el mayor de una cuenta de control coincide con su
  auxiliar (I2) con diferencia de 0 centavos; el asiento manual pasa por `validarAsiento`.

### T3 · Indicadores de impuesto en la carga (FC-07) — 1 constructor
- **Alcance:** catálogo de indicadores versionado; carga de factura de proveedor de servicios por línea con
  indicador, percepciones en el pie, imputación a proyecto; validaciones (CUIT, letra, duplicado); mismo
  catálogo para ventas registradas; libro IVA leyendo del indicador.
- **Migración:** tabla de factura de proveedor con líneas (o extensión aditiva de la existente: lo decide el
  constructor con `data-dba`), sin tocar `StockPurchase`.
- **Aceptación:** neto + impuestos = total al centavo para cada indicador; factura duplicada (CUIT + tipo +
  punto de venta + número) se rechaza; el libro IVA del mes coincide con la suma de facturas; factura B o C no
  da crédito fiscal.
- **Prueba real:** cargar las facturas de un mes de MIA; el libro IVA coincide con el del estudio.

### T4 · Cuentas a cobrar y anticipos (FC-04) — 1 constructor + certificador
- **Alcance:** padrón de clientes con datos fiscales; plan de cobro por proyecto con valor por defecto
  parametrizable; factura por cobro ligada a la cuota; aplicación de cobros (parcial, a varias facturas);
  retenciones sufridas en el cobro (se cargan, con certificado); cuenta corriente y antigüedad; notas de
  crédito; estado «Finalizado» que dispara A4.
- **Migración:** vínculos aditivos cuota ↔ factura ↔ cobro; tabla de aplicación.
- **Aceptación:** A1 a A4 generados solos; saldo del auxiliar = saldo del rol (I2); un cobro no se aplica por
  más que su importe; proyecto adicional queda ligado al original; cobro en USD guarda su tipo de cambio.
- **Prueba real:** proyectos de un mes de MIA: saldo por cliente igual al de la planilla de control corregida.

### T5 · Cuentas a pagar (T5-A) y retenciones practicadas (T5-B) — dos tandas en serie, 1 constructor + certificador cada una
T5-A es etapa 1; T5-B es etapa 2 y espera la tabla de regímenes validada por el estudio.
- **Alcance A (pagos):** agenda de pagos por vencimiento; orden de pago con aprobación; medios (transferencia,
  Echeq, cheque diferido); cheques de terceros; anticipo a proveedor.
- **Alcance B (retenciones):** tabla de regímenes versionada y provisional; cálculo en la orden de pago con
  acumulado mensual por proveedor, mínimos y exclusiones con vigencia; certificado numerado; archivo para el
  estudio.
- **Migración:** orden de pago y sus líneas; retención practicada; certificado; datos de Echeq en tabla
  lateral del cheque (no columna, ver reglas comunes).
- **Aceptación:** A5 a A7 solos; no se paga más que el saldo; la retención del segundo pago del mes considera el
  primero; numeración de certificados sin huecos ni repetidos bajo concurrencia; pago anulado revierte la
  retención.
- **Prueba real:** recalcular las retenciones de un mes de MIA y compararlas con las que hizo el estudio.

### T6 · Bancos y tesorería ARS/USD (FC-06) — 1 constructor + certificador
- **Alcance:** cuenta bancaria ligada a su cuenta contable (une las dos tesorerías sin modelo nuevo de cuenta);
  tipo de cambio con historia; conciliación banco ↔ libro; gastos e impuestos del extracto a sus roles;
  recaudaciones bancarias de IIBB; diferencia de cambio (A8); posición por moneda; Mercado Pago como cuenta.
- **Migración:** tipo de cambio por día; partida de conciliación; vínculo cuenta bancaria ↔ cuenta contable.
- **Aceptación:** saldo conciliado = saldo del extracto; un movimiento no se concilia dos veces; diferencia de
  cambio calculada al centavo con el tipo de cambio del día; importar dos veces el mismo extracto no duplica.
- **Prueba real:** conciliar un mes de las cuentas en ARS y en USD de MIA con cero partidas sin explicar.

### T7 · Monitor y calendario de obligaciones (FC-11) — 1 constructor
- **Alcance:** pantalla de monitor sobre lo que ya existe; obligaciones faltantes; responsables; avisos; acceso
  del estudio para marcar presentado y pagado.
- **Migración:** ninguna prevista (usa ola1).
- **Aceptación:** el calendario respeta terminación de CUIT, fines de semana y feriados; un vencido se ve como
  vencido sin que nadie lo marque; el estudio no ve nada más que lo suyo.
- **Prueba real:** calendario de MIA contra la agenda real del estudio (mismas fechas).

### T8 · IIBB Convenio Multilateral y posición fiscal (FC-09, FC-10) — 1 constructor + certificador
- **Alcance:** jurisdicciones, actividades, alícuotas y coeficientes por año; jurisdicción en ventas y gastos;
  papel mensual por jurisdicción; papel anual de coeficientes; tablero de posición del mes (IVA, IIBB,
  Ganancias) con A11 y A12.
- **Migración:** jurisdicción del contribuyente, coeficiente por año, jurisdicción en el documento.
- **Aceptación:** Σ base por jurisdicción = base total; los coeficientes suman 1; la posición de IVA coincide
  con el libro IVA; todo número del tablero abre su detalle.
- **Prueba real:** un mes de MIA contra lo presentado por el estudio (IVA e IIBB CABA y Buenos Aires).

### T9 · Cierre y salidas para el estudio (FC-03 parte 2, FC-12) — 1 constructor
- **Alcance:** período mensual con apertura y cierre; lista de control de cierre; cierre de ejercicio y
  apertura; estados de resultados y de situación; paquete mensual único para el estudio; rol de sólo lectura.
- **Migración:** período contable.
- **Aceptación:** un período cerrado rechaza asientos (I5); reabrir deja rastro; el paquete se regenera idéntico
  para un período cerrado; el resultado del estado coincide con el del libro.
- **Prueba real:** cerrar un mes de MIA y entregar el paquete al estudio; acta del estudio con fecha y firma,
  con cada observación listada.

### TS · Salida (método, etapa 6) — 1 constructor + certificador · cierra la etapa 1
- **Alcance:** importador de **saldos de apertura y partidas abiertas** a una fecha de corte (anticipos de
  eventos futuros, cheques en cartera, cuentas corrientes de clientes y proveedores, saldos de banco), por lote
  y con **reversa del lote entero**; reusa el patrón de `src/lib/caja/corte-inicial.ts`. Runbook de corte, mes en
  paralelo con las planillas, capacitación por rol, soporte y salida de datos.
- **Migración:** tabla de lote de apertura.
- **Aceptación:** el asiento de apertura cuadra; Σ partidas abiertas = saldo de cada cuenta de control;
  revertir el lote deja todo como antes; cargar dos veces el mismo lote no duplica.
- **Prueba real:** apertura de MIA al corte acordado con diferencia de 0 centavos contra los saldos que informa
  el estudio.

### T10 · Control de gestión (FC-13, FC-14) — T10-A (etapa 1) y T10-B (etapa 2), 1 constructor cada una
- **Alcance A:** productor como dimensión; rentabilidad por proyecto y por productor desde el libro; comisión
  de proyecto con condición de devengamiento (A9); reintegros (A10).
- **Alcance B:** presupuesto anual por cuenta y mes con versiones; comparación con el real; proyección.
- **Migración:** productor en el proyecto; regla de comisión; presupuesto por cuenta y período.
- **Aceptación:** Σ margen de proyectos + estructura = resultado del período; la comisión no se devenga si el
  proyecto no está cobrado entero y con el evento hecho; cada desvío abre su detalle.
- **Prueba real:** tablero por productor de MIA contra sus planillas; cada diferencia queda listada y
  clasificada (error de la planilla, dato faltante o error del sistema); cero de la última clase.

## Riesgos del plan

| Riesgo | Mitigación |
|---|---|
| El estudio no valida a tiempo las tablas fiscales | T1, T2, T6 y T7 no dependen de eso; T5-B y T8 esperan |
| El `Float` de Proyectos descuadra por centavos | Regla única de redondeo y test de cuadre en T2; si falla, se eleva la migración a `Decimal` como decisión aparte |
| Alcance grande para un primer cliente | El orden entrega valor temprano: T4 y T5 reemplazan planillas antes de tener contabilidad completa |
| Gate 2 demorado | Todo el código tolera la migración ausente; sólo se frena la prueba real |
| Se construye para MIA lo que no es reusable | Cada diferencia se resuelve con parámetro; lo que pida extensión pasa por Challenger |

— Elaborado por GSG
