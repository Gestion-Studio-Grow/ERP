---
id: ADR-075
nivel: evolutiva
dominio: [Producto, Arquitectura]
depends_on: [ADR-022, ADR-024, ADR-025, ADR-054, ADR-055]
---
# ADR-075: Producto Facturación Bancaria — módulo `bancos` (extracto → clasificación → factura)

**Estado:** Aceptada — **en main (merge `6735716`) y deployado**. Decidido por el dueño (Maxi) en sesión 2026-07-11.
**Fecha:** 2026-07-11
**Depende de:** ADR-022 (plugin ARCA — convención y contrato fiscal), ADR-024/025 (disparadores de facturación + ingesta MP: este módulo es el hermano bancario de esa ingesta), ADR-054 (repositorio de módulos — el `bancos` entra al catálogo como módulo activable), ADR-055 (VARIANTE — activación por tenant, nunca "a todos con todo")
**Relacionado:** ADR-076 (suite: este módulo es la pieza diferencial de A y B, y la frontera dura de C), ADR-078 (unit economics que gobiernan el uso de IA acá), ADR-057 (dinero Decimal en el borde fiscal)
**Runbook operativo:** `docs/runbooks/facturacion-bancaria-golive.md`

---

## Contexto

ADR-025 resolvió "facturale solo TODO lo que entra por Mercado Pago". Pero al comerciante argentino también
le entra plata **por el banco** (transferencias, acreditaciones, POS de otros adquirentes), y hoy eso se
factura a mano o no se factura. El insumo existe y es universal: **el extracto bancario** (CSV/Excel que
todo home banking exporta). Faltaba el módulo que lo ingiera, entienda qué movimiento es un ingreso
facturable y lo empuje al mismo circuito fiscal del plugin ARCA (ADR-022).

Restricción de fondo (ADR-078): el costo técnico tiene que ser ~cero por extracto — si cada fila pasara por
IA, el margen del plan SOLO no cierra. Y restricción fiscal: el módulo no puede facturar de más (movimientos
que no son ventas) ni dejar al tenant pasado del régimen sin avisar.

## Decisión

Se construye el **módulo `bancos`** (producto Facturación Bancaria) con estas piezas y reglas:

1. **Importación de extractos con mapeo automático DETERMINISTA.** El parser reconoce el formato con
   **7 templates de bancos argentinos** + una **heurística por forma** (detección de columnas
   fecha/concepto/importe por estructura) para bancos no templateados. **El port de IA se invoca SOLO
   cuando la confianza del mapeo es <0.8** — regla de unit economics: el camino feliz es determinista y
   cuesta cero; la IA es el residuo, no el motor.
2. **Clasificador con aprendizaje por tenant.** Cada movimiento se clasifica
   (facturable / no facturable / a revisar, mismo espíritu que ADR-025 §clasificación); las correcciones
   del usuario **entrenan las reglas de SU tenant** — el clasificador mejora por negocio, no global.
3. **Umbral de identificación COMERCIAL: $600.000, configurable por tenant.** Por encima del umbral el
   movimiento exige identificar al receptor (no va como consumidor final). Ojo con la confusión que ya
   apareció en sesión: el **piso LEGAL de ARCA es $10M desde 05/2025** — el de $600.000 es una **política
   comercial del dueño** (conservadora, configurable). Regla dura: **siempre manda el más estricto** de los
   dos; si la norma baja del valor configurado, gana la norma.
4. **Tope de 159 facturas/mes por tenant** (techo operativo del régimen del cliente): **alerta al 90%**,
   **bloqueo al 100%**. El módulo nunca deja al tenant emitir de más en silencio.
5. **Dedup por hash + cruce banco↔MP.** Cada movimiento importado se identifica por hash (re-importar el
   mismo extracto no duplica) y se **cruza contra las operaciones de Mercado Pago** (ADR-025) para no
   facturar dos veces la misma venta que entró por MP y aparece acreditada en el banco.
6. **Convención de plugin ARCA (ADR-022):** el módulo tiene su **`core-contract` sin imports del Core** —
   habla con el circuito fiscal por el contrato, no por acceso directo. Entra al catálogo de módulos
   (ADR-054) y se activa por tenant (ADR-055).

## Consecuencias

- **(+)** Cierra el circuito "todo lo que entra se factura solo": MP (ADR-025) + banco (este ADR). Es el
  módulo diferencial que vende A·Comerciante y B·Contador (ADR-076) — y el que C·Facturita **jamás** incluye.
- **(+)** Unit economics protegidos por diseño: determinista primero, IA solo en el residuo <0.8 → el costo
  por extracto es centavos (ADR-078).
- **(+)** El aprendizaje por tenant convierte cada corrección en menos trabajo futuro — el clasificador es
  activo del tenant, coherente con el aislamiento (RLS, ADR-062).
- **(−) Deuda anotada:** los 7 templates cubren los bancos grandes; la cola larga de bancos/cooperativas cae
  en la heurística + IA → hay que nutrir templates con casos reales (mismo patrón que el registro de casos
  del preset). El cruce banco↔MP es por matching de monto/fecha — los casos borde (acreditaciones agrupadas)
  van a la cola de revisión, no se adivinan.
- **(−)** El umbral comercial configurable exige UI de settings por tenant y comunicación clara del "por
  qué me pide identificar" (ver guía de textos, ADR-080).

— Elaborado por GSG · 2026-07-11

> Numeración provisional — verificar colisión al mergear (regla de timestamps de CLAUDE.md aplicada a ADRs).
