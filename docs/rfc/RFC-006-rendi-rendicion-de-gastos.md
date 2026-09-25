# 📄 RFC-006 — Rendí: rendición de gastos argentina, integrada a SAP S/4HANA Cloud Public

> **Tipo:** RFC (propuesta, no decisión). **Estado: 🟡 PROPUESTO (2026-09-24).**
> **Disparador:** pedido del dueño — una app "como Rindegastos", sólida, para vendérsela a una consultora SAP o a su cliente. El canal comercial lo maneja el dueño.
> **Decisión asociada:** ADR-099.
> **Diseño completo:** `Factory-GSG/rendiciones/01-plan-y-diseno.md`, en el cerebro de la factoría. Este RFC es el resumen técnico que vive en el repo.
> **Regla:** aditivo. No toca pantallas, esquema ni tenants existentes.

---

## 1. El problema

En una empresa con SAP Public, el que gasta arma una planilla y Tesorería la transcribe comprobante por comprobante. El directorio quiere tres cosas: que cargue el que gastó, que alguien lo autorice y que Tesorería deje de tipear.

SAP Public no trae rendición sin Concur. Concur no está en el contrato, y además no resuelve la parte argentina (qué computa IVA, percepciones, Convenio Multilateral, convenio de camioneros).

## 2. La propuesta

**Un módulo del motor**, con tres partes (detalle en ADR-099):

| Parte | Dónde | Estado |
|---|---|---|
| Dominio puro: contrato, QR de ARCA, motor fiscal (12 reglas), cuadratura y estados, aprobación por legajo, lote contable, conciliación contra IVA Simple, archivo para Haberes | `src/lib/rendiciones/` | En construcción |
| Integración con SAP: modo Archivo (planillas de carga), después modo API | `src/plugins/sap/` | Modo Archivo en construcción |
| Demo a costo cero (cuatro roles: quien rinde, quien aprueba, Tesorería, contador) | `src/app/demo/rendiciones/` | En construcción |

### Las reglas fiscales que codifica
Verificadas contra fuente primaria el 2026-09-24:
- el tipo de gasto decide el IVA, y el comprobante puede degradar el tratamiento, nunca mejorarlo;
- sólo computa la factura A a la CUIT de la empresa; el IVA contenido de una factura B (RG 5614) va a cero;
- la factura A "sujeta a retención" o "pago en CBU informada", y la M, van a Cuentas a Pagar (RG 1575 art. 21, RG 5762);
- no se contabiliza sin constatación (WSCDC) ni con CUIT apócrifa (wsapoc);
- el pago en efectivo de más de $ 1.000 exige la prueba de veracidad (Ley 25.345, fallo "Mera");
- las percepciones van separadas;
- el proveedor habitual con importe alto se deriva a Cuentas a Pagar (RG 830);
- cada gasto lleva tres jurisdicciones (Convenio Multilateral);
- vehículo con dominio y tipo;
- no se reintegra comida ni pernocte que ya paga el convenio de camioneros (CCT 40/89);
- el gasto sin comprobante es remuneración (LCT arts. 105-106);
- la custodia es de 12 años.

### Qué no hace, a propósito
No paga, no retiene, no emite comprobantes y no reemplaza el libro de caja de SAP.

## 3. Por qué así

- **El hueco de mercado es la integración fiscal argentina con SAP Public, no la app con foto,** que ya es algo básico. Rindegastos opera en Argentina pero no integra con S/4HANA; Payhawk y Pleo integran pero no operan acá.
- **El motor ya da la base** (login, RLS, consola de alta, ARCA). Rendí suma el dominio y la integración sin reescribir nada (ADR-061, ADR-073).
- **Demo antes que inversión.** El dominio que mueve la demo es el mismo que va a producción: nada se tira.

## 4. Riesgos y cómo se cubren

| Riesgo | Cobertura |
|---|---|
| Crédito fiscal computado de más | Diccionario validado por el contador del cliente; el sistema no adivina; bloquea por defecto |
| Algo de SAP que no se comporte como dice la documentación | Modo Archivo primero; cinco pruebas en un arrendatario de prueba antes del modo API |
| La norma cambia (cambió varias veces entre 2024 y 2026) | Reglas y diccionario versionados; cada evaluación guarda la versión |
| Datos de empleados e imágenes fuera del país (la IA no tiene región en Sudamérica) | Contrato de encargado y transferencia (AAIP); minimización; pedido de retención cero |
| Plataforma sin recuperación a un punto en el tiempo | Gate del dueño antes del primer dato real (ADR-067) |

## 5. Lo que se le pide al Challenger (ADR-045)

1. ¿El corte de carriles por defecto (computa → factura; no computa → asiento) es el correcto frente a la precarga de IVA Simple?
2. ¿Modo Archivo primero, o conviene ir directo al modo API?
3. ¿Módulo del motor en una línea Empresa con base propia, o producto separado?
4. ¿La lectura con IA justifica construirla, frente a un OCR comprado?

## 6. Síntesis con el Challenger (ADR-045) — 2026-09-24

El Challenger desafió las cuatro preguntas de la §5 con fundamento y citas al código. Esta es la síntesis propuesta. **Decide el dueño.**

| Punto | Lo que dijo el Challenger | Qué se acepta / qué cambió |
|---|---|---|
| **Carriles frente a IVA Simple** | El corte salió de una limitación del modo Archivo, no de un criterio contable. La conciliación sólo cruzaba totales y no le decía al contador qué crédito ajustar. Las percepciones de IIBB en lo no computable se iban al costo | **Aceptado en lo que depende de nosotros.** En el código: la conciliación muestra por comprobante qué hacer en IVA Simple (validar el crédito, ajustar el IVA que no computa, ir por Cuentas a Pagar o no validar lo bloqueado). Las percepciones de IVA e IIBB se computan si el comprobante está a nombre de la empresa, aunque el IVA de la operación no compute [A VALIDAR con el contador]. El corte por defecto se mantiene hasta que un contador lo firme |
| **Modo Archivo primero** | "Sin integración" es falso: leer el saldo del empleado y dar un anticipo por entregado necesita SAP_COM_0303. La planilla no está validada. Tesorería igual compensa y da altas a mano | **Aceptado.** En modo Archivo, Tesorería confirma la entrega del anticipo a mano; la lectura automática es del modo API. **El modo API es el objetivo.** El modo Archivo queda como entrada sin depender de TI del cliente y como contingencia, y no se vende sin probar la planilla real en el starter |
| **Módulo del motor o producto separado** | La base que pone el motor es chica. La v1 toca piezas del Core que usan los comercios (caché del ticket de ARCA, outbox). Dos bases con el mismo esquema duplican cada migración | **Se mantiene el módulo, con condiciones escritas en ADR-099:** los cambios al Core son aditivos y llevan tests de no regresión sobre la facturación de los tenants vivos. Al pasar a inversión se presenta la lista de archivos del Core que toca la v1 |
| **IA propia o OCR comprado** | CUIT, letra y número salen del QR. La IA sólo aporta el desglose. La exactitud nunca se midió. Falta comparar con SAP Document AI (4N6) | **Aceptado.** Hasta medir la exactitud sobre comprobantes reales, se vende **"QR y persona que confirma"**, con la IA como opcional (línea aparte). Antes de invertir se compara contra Azure y SAP Document AI [A VALIDAR para Argentina] |
| **Mercado, tamaño y mantenimiento** | El hueco no está validado con compradores. El cliente ancla es chico. El mantenimiento normativo no tiene responsable. Custodia de 12 años, seguridad (sin MFA ni recuperación a un punto en el tiempo), Tickelia en Latinoamérica | **Aceptado como riesgo.** Se adoptan sus tres condiciones como vallas de inversión (abajo). El responsable del seguimiento normativo se nombra al firmar la venta |

### Vallas de inversión (propuestas por el Challenger, adoptadas)

Si alguna no se cumple, **no se pasa a la fase de inversión**:
1. El contador del cliente firma el tratamiento de las facturas A no computables y de las percepciones, con un cierre de mes de prueba que no le sume trabajo.
2. La integración pasa las cinco pruebas y la carga de la planilla real, en un arrendatario SAP al que GSG tenga acceso sostenido para probar cada versión nueva.
3. Hay volúmenes y precio firmados, un segundo cliente calificado, y un contrato que pone tope a la responsabilidad fiscal y resuelve custodia, salida y transferencia internacional de datos (AAIP).

## 7. Siguiente paso

Demo en la rama: Gate de Excelencia, QA de punta a punta y push. Después, Challenger sobre este RFC y el ADR-099. La venta la lleva el dueño. Con la venta concretada, la inversión: base propia, custodia, modo API y firmas de ADR-068.

— Elaborado por GSG
