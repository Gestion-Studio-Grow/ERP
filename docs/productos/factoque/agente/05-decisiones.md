# 05 · Decisiones del dueño (con la recomendada y su riesgo)

> Lo reversible se decidió y está en 02-04. Lo que sigue es irreversible o comercial: lo decide el dueño (ADR-048).

## D0 · La frontera de ADR-076 («C jamás incluye extracto ni conciliación»)

La orden del 14/11 la cruza (`ADR-076:42`, `facturita-planes.ts:58`, landing `page.tsx:70`).

| Opción | Qué es | Riesgo |
|---|---|---|
| (a) **Recomendada:** ADR nuevo que reemplaza ADR-076 §3. **Factoque Gratis sigue sin extracto** (el gancho no hace el trabajo pesado) y el extracto con agente entra en los **planes pagos** de Factoque. Comerciante queda para varios usuarios, puntos de venta y locales. | Respeta la orden y conserva lo bueno de la frontera: lo gratis no hace el trabajo pesado. | Choca con Comerciante Solo ($14.900, 159 facturas, extracto) contra Factoque Pro ($15.000, 159 facturas): hay que reordenar la escalera (D2). |
| (b) Factoque absorbe a Comerciante: una sola marca para el comerciante. | Más simple de vender. | Se rehace la landing y los planes de Comerciante; ADR-078 se revisa entero. |
| (c) Mantener la frontera: el agente sólo en Comerciante. | Nada que cambiar en precios. | Contradice la orden del dueño. |

## D1 · ¿Emite solo dentro de los topes, o el usuario confirma el lote?

| Opción | Qué es | Riesgo |
|---|---|---|
| (a) Siempre confirma el lote (un toque: «Facturar 30 por $412.300»). | Nivel 1 para siempre. Sin motor de agentes: sale antes. | Es casi la «facturación manual» que el dueño no quiere: hay que abrir la app. |
| (b) Emite solo desde el día 1 dentro de los topes firmados. | Nivel 2 desde el alta. | Un concepto mal configurado factura mal y **sólo se arregla con nota de crédito**. Un monotributista que factura de más se puede recategorizar. |
| (c) **Recomendada:** **por etapas.** Los primeros 30 días (o los 3 primeros lotes) confirma; después, cada concepto **con cero correcciones** en ese período puede pasar a «solo» con una firma, dentro de los topes. Lo de «Para revisar» nunca sale solo. | Nivel 1 → 2 por concepto, ganado con evidencia. | Algo más de pantalla (estado por concepto). El primer mes no es «sin tocar nada». |

## D2 · Planes

| Opción | Qué es | Riesgo |
|---|---|---|
| (a) **Recomendada (provisional a confirmar el precio):** Gratis (5, sin extracto) · Plus (40, **con** extracto y agente en nivel 1) · Pro (159, con agente que **emite solo**, D1-c). | Nivel 2 es lo que se paga más. La IA usa el plan de Claude en prueba (tema cerrado): no cambia el precio ahora. | Reordenar Comerciante Solo (D0). |
| (b) Un plan nuevo «Factoque con agente» aparte de Plus y Pro. | No toca los planes publicados. | Escalera de 4 escalones para un monotributista: confunde. |
| (c) El agente como suma mensual sobre cualquier plan pago. | Precio por valor. | Más difícil de explicar en criollo. |

## D3 · ¿Qué formatos primero?

| Opción | Qué es | Riesgo |
|---|---|---|
| (a) **Recomendada:** 1) **Mercado Pago por la conexión** (ya existe, es en vivo, trae el id de la operación) y CSV de actividad de MP; 2) **CSV/XLSX de los 6 bancos con plantilla** (Nación, Provincia, Galicia, Santander, BBVA, Macro), **verificadas contra exportes reales** antes de prometerlas; 3) genérico CSV/XLSX con mapeo confirmado una vez. **PDF después.** | Todo determinista; la IA sólo en el genérico y con prueba de saldos. | Hay quien sólo tiene PDF: se le ofrece el CSV del homebanking con una ayuda paso a paso. |
| (b) PDF desde el día 1 con IA. | Cubre a todos. | La IA pasa a ser la fuente de importes que se facturan: exige prueba de saldos perfecta y la batería de 300 casos antes de vender. |
| (c) Sólo Mercado Pago. | Lo más rápido. | No cumple «cualquier entidad bancaria». |

## D4 · Fecha de la factura de un cobro viejo (con la contadora)

(a) **Recomendada:** la más vieja que acepta ARCA, siempre con confirmación, y aviso para subir seguido. (b) Fecha de hoy.
(c) No facturar lo que está fuera de la ventana. Riesgo de (a) y (b): factura con fecha distinta a la del cobro; de
(c): ventas sin facturar.

## D5 · Quién firma la autorización

Se adopta la del dictamen (decisión 1, (c)): el titular en la app con segundo factor; **ampliar** pide una segunda
confirmación por otro canal. Riesgo si no: ampliar topes queda en una sola mano (X5).

## D6 · Retención del extracto

(a) **Recomendada:** sellado, se purga a los 30 días y queda la fila (molde `ExtractoRecibido`). (b) Guardarlo para
re-procesar siempre. Riesgo de (b): datos de terceros sin plazo (Ley 25.326, frente legal).

## D7 · Migración y gasto

La migración aditiva (`02-diseno.md` §7) es Gate 2. No hay gasto nuevo: sin dominio, sin API paga; la IA va por el
plan de Claude en prueba.
