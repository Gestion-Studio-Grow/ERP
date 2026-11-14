# Factoque con el agente como servicio: facturar desde extractos (GSG-FACT-010)

> Diseño (plata y fiscal) · 14/11/2026 · sólo documentos: sin código, sin Prisma aplicado, sin Neon, sin ARCA real.
> Orden del dueño: el usuario no le dice cada vez qué facturar; **configura conceptos una vez** y los extractos
> (banco, Mercado Pago o cualquier entidad) los identifican.

| Doc | Qué trae |
|---|---|
| [01-relevamiento.md](01-relevamiento.md) | Qué existe hoy con archivo:línea, y **6 huecos de plata** que existen hoy (H1-H6) |
| [02-diseno.md](02-diseno.md) | Conceptos con reglas, lectura de extractos, clave del movimiento, flujo, «Para revisar», modelo de datos |
| [03-encaje-motor.md](03-encaje-motor.md) | Puesto, tareas y niveles, autorización firmada, topes, qué decide el código y qué la IA, cómo emite |
| [04-plata-y-fiscal.md](04-plata-y-fiscal.md) | 13 invariantes, orden de candados, 16 tests de carrera, lo fiscal a confirmar |
| [05-decisiones.md](05-decisiones.md) | D0-D7 del dueño, con la recomendada y su riesgo |
| [06-plan-de-tandas.md](06-plan-de-tandas.md) | 6 tandas con briefs medidos (1.084 a 1.642 bytes, todos ≤ 2 KB) |
| [07-dictamen.md](07-dictamen.md) | El ataque de un agente distinto (Opus, esfuerzo alto) |

## Lo esencial

1. **El 70 % de la tubería ya existe**, en el producto A (Comerciante): plugin `bancos` (CSV/XLSX, 7 plantillas,
   clasificador), libro `CobroFacturado` («una factura por cobro»), conexión y modo automático de Mercado Pago.
   Lo que falta es el **concepto con reglas**, la clave correcta del movimiento y el camino de emisión con cupo.
2. **El código decide todo lo que mueve plata** (qué es venta, qué concepto, cuánto, a quién, qué fecha, si se
   emite). La IA sólo propone el mapeo de un archivo raro (que la prueba de saldos verifica) y sugiere en
   «Para revisar». Nunca escribe un importe.
3. **Un movimiento, a lo sumo una factura** por el índice único del libro y la clave con ordinal; el mismo
   extracto dos veces no duplica (huella del archivo + clave); lo emitido sólo se anula con nota de crédito.
4. **Hay que arreglar antes, con o sin agente:** H1 (dos cobros iguales el mismo día dan una sola factura) y
   H2 (la emisión automática no toma el candado del cupo).
5. **La frontera de ADR-076** («Factoque jamás incluye extracto») choca con la orden: es la decisión D0.

## Decisiones del dueño (resumen)

| | Recomendada |
|---|---|
| D0 frontera ADR-076 | ADR nuevo: Gratis sigue sin extracto; el extracto con agente entra en los planes pagos |
| D1 ¿emite solo? | Por etapas: confirma el lote el primer mes; después, por concepto sin correcciones, emite solo dentro de los topes firmados |
| D2 planes | Plus con agente que propone (nivel 1), Pro con agente que emite solo (nivel 2); precio provisional a confirmar |
| D3 formatos | MP por la conexión + CSV de MP → 6 bancos con plantilla verificada → genérico CSV/XLSX; PDF después |
| D4 fecha de cobros viejos | La más vieja que acepta ARCA, con confirmación (con la contadora) |
| D5 firma | La del dictamen 1506c9c0: titular con segundo factor; ampliar pide otra confirmación por otro canal |
| D6 retención | Sellado, purga a 30 días |
