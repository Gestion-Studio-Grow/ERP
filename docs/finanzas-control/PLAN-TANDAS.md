# Plan de tandas — Finanzas y Control (MIA Producciones como primer cliente)

> Catálogo: `CATALOGO-FINANZAS-CONTROL.md`. Método: `METODO-SCOPE-ITEMS.md`. Fecha: 11/11/2026.
> **Este documento planifica; no construye.** Cada tanda es una sesión separada, fresca, con 1 o 2
> constructores (`gsg-ingeniero`, Opus esfuerzo alto) y, donde hay plata o impuestos, un `gsg-certificador`
> sobre el diff. Máximo 3 agentes pesados a la vez. Brief ≤ 2 KB que apunta a la ficha del catálogo y a
> `archivo:línea`.

## Reglas comunes a todas las tandas

- **Migraciones:** aditivas (tablas y columnas nuevas, opcionales), **escritas sin aplicar**; el código tolera
  su ausencia (`migracionContableAplicada`, `src/lib/contabilidad/modulo.server.ts:40`). Aplicarlas es **Gate 2
  del dueño**. Verificar colisión de timestamp antes de crear cada una.
- **Datos reales:** sólo en una **rama de prueba de Neon** creada por el dueño o la orquestadora (con la
  rotación de respaldos vigente). Los datos de MIA salen del Drive del dueño; **ni datos personales ni montos
  en Git**, tampoco en tests ni en informes. Los tests del repo usan datos sintéticos.
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

Sin 1 y 2 se puede construir (el código tolera la migración ausente) pero **no probar con datos reales**.
Sin 4, todo valor fiscal queda «provisional a confirmar» y no sale a producción.

## Orden y dependencias

```
T1 Fundación ──► T2 Motor y libro ──┬─► T4 Cobrar ───┐
                                    ├─► T5 Pagar ────┼─► T8 Impuestos del mes ─► T9 Cierre y salidas
T3 Indicadores de impuesto ─────────┘                │
                 T6 Bancos y tesorería ──────────────┘            T10 Control de gestión (tras T4, T5)
T7 Monitor de obligaciones (independiente; puede ir en paralelo desde T1)
```

Paralelos posibles (zonas de código distintas): **T2 ‖ T3 ‖ T7**; después **T4 ‖ T5**; después **T6 ‖ T8**.
Un frente a la vez hasta cerrarlo; el paralelo es opcional y nunca más de 3 agentes pesados.

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

### T2 · Motor de contabilización y libro (FC-02, FC-03 parte 1) — 1 constructor + certificador
- **Alcance:** motor puro `hecho → líneas` para A1 a A12 (uno por función, con motivo en criollo), clave única
  de origen, cola de «sin contabilizar»; conversión `Float` → centavos; libro diario, mayor por cuenta y sumas y
  saldos; asiento manual con pantalla.
- **Migración (aditiva, sin aplicar):** en la línea del asiento: moneda, importe de origen, tipo de cambio,
  proyecto, productor, rubro (todas opcionales); índice único de origen si no existe.
- **Aceptación:** cada asiento tipo cuadra y coincide con la tabla §1.3; contabilizar dos veces el mismo
  documento no duplica; anular genera contraasiento; sumas y saldos con Σ debe = Σ haber; invariante I4 en test;
  concurrencia: dos confirmaciones simultáneas no duplican.
- **Prueba real:** contabilizar un mes de MIA; sumas y saldos cuadradas; cola de pendientes explicada al 100 %.

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

### T5 · Cuentas a pagar, orden de pago, Echeq y retenciones practicadas (FC-05, FC-08) — 2 constructores + certificador
- **Alcance A (pagos):** agenda de pagos por vencimiento; orden de pago con aprobación; medios (transferencia,
  Echeq, cheque diferido); cheques de terceros; anticipo a proveedor.
- **Alcance B (retenciones):** tabla de regímenes versionada y provisional; cálculo en la orden de pago con
  acumulado mensual por proveedor, mínimos y exclusiones con vigencia; certificado numerado; archivo para el
  estudio.
- **Migración:** orden de pago y sus líneas; retención practicada; certificado; campos de Echeq en el cheque.
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
- **Prueba real:** cerrar un mes de MIA y entregar el paquete al estudio; el estudio lo da por bueno.

### T10 · Control de gestión (FC-13, FC-14) — 2 constructores
- **Alcance A:** productor como dimensión; rentabilidad por proyecto y por productor desde el libro; comisión
  de proyecto con condición de devengamiento (A9); reintegros (A10).
- **Alcance B:** presupuesto anual por cuenta y mes con versiones; comparación con el real; proyección.
- **Migración:** productor en el proyecto; regla de comisión; presupuesto por cuenta y período.
- **Aceptación:** Σ margen de proyectos + estructura = resultado del período; la comisión no se devenga si el
  proyecto no está cobrado entero y con el evento hecho; cada desvío abre su detalle.
- **Prueba real:** tablero por productor de MIA contra sus planillas; las diferencias se explican una por una.

## Riesgos del plan

| Riesgo | Mitigación |
|---|---|
| El estudio no valida a tiempo las tablas fiscales | T1, T2, T6 y T7 no dependen de eso; T5-B y T8 esperan |
| El `Float` de Proyectos descuadra por centavos | Regla única de redondeo y test de cuadre en T2; si falla, se eleva la migración a `Decimal` como decisión aparte |
| Alcance grande para un primer cliente | El orden entrega valor temprano: T4 y T5 reemplazan planillas antes de tener contabilidad completa |
| Gate 2 demorado | Todo el código tolera la migración ausente; sólo se frena la prueba real |
| Se construye para MIA lo que no es reusable | Cada diferencia se resuelve con parámetro; lo que pida extensión pasa por Challenger |

— Elaborado por GSG
