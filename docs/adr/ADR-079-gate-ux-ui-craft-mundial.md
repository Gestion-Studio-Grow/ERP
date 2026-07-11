---
id: ADR-079
nivel: evolutiva
dominio: [UX/UI, Metodología]
depends_on: [ADR-040, ADR-069, ADR-072, ADR-044]
---
# ADR-079: Gate UX/UI de craft mundial — las 7 lentes (permanente, se suma al Gate de Excelencia)

**Estado:** Aceptada — vigente y permanente desde 2026-07-11; la primera corrida ya se ejecutó (veredicto
inaugural abajo). Decidido por el dueño (Maxi) en sesión.
**Fecha:** 2026-07-11
**Depende de:** ADR-040 (Gate de Excelencia — este gate se le SUMA, no lo reemplaza), ADR-069 (norte
Apple×SAP: UX como pilar), ADR-072 (enfoque de diseño — tokens, Inter, claro+oscuro), ADR-044
(argentinizar — la lente de TEXTOS conecta con ADR-080)
**Relacionado:** ADR-080 (guía de textos — es el detalle de la lente 7), ADR-043 (sello GSG — no pisa la
marca del tenant), ADR-059 D4/D5 (design system, dos densidades, tier en canal neutro)

---

## Contexto

El Gate de Excelencia (ADR-040) audita rol-based/coherencia/accesibilidad/ángulo argentino, pero la vara
de **craft visual fino** —lo que separa "pasa la auditoría" de "parece hecho por Stripe"— quedaba implícita
y dependía del ojo de cada sesión. La primera corrida seria sobre el producto de facturación lo mostró:
veredicto **5,5/10**, con defectos que ningún ángulo del Gate viejo nombraba explícitamente (fechas en TZ
del servidor, contraste AA roto en tema claro, scroll horizontal en pantallas de 13", ausencia de loading
states). Con la suite saliendo a venta (ADR-076), "corregir después" deja de ser aceptable.

## Decisión

Se instituye el **Gate UX/UI de craft mundial**, permanente, como bloque adicional del Gate de Excelencia
(ADR-040): **ningún producto se publica sin pasar las 7 lentes**.

### Las 7 lentes

1. **Tipografía y ritmo** — jerarquía real, line-heights consistentes, escala deliberada (base ADR-072).
2. **Espaciado / layout** — grilla y tokens de espacio, sin valores mágicos; sin scroll horizontal en 13".
3. **Color y estados AA** — contraste AA en AMBOS temas; todo estado (hover/focus/disabled/error) definido.
4. **Motion** — transiciones con propósito, nunca decorativas porque sí; respetar `prefers-reduced-motion`.
5. **Performance** — percepción de velocidad: skeletons, sin layout shift, respuesta inmediata al input.
6. **Craft de marca** — el acento del tenant vive en los tokens; el conjunto se siente UNA pieza (ADR-043).
7. **TEXTOS** — cada palabra en pantalla pasa la guía de estilo (ADR-080). El copy ES parte del craft.

### Estándar de referencia y fuente de verdad visual

- Vara: **Apple HIG / Stripe / Linear** — no "mejor que ayer", sino "al nivel de los mejores".
- **Fuente de verdad visual: los mockups del dueño** — **blacklight claro + grafito oscuro**. Ante la duda
  de cómo debe verse algo, ganan los mockups, no la memoria del modelo.
- **Los tokens son la ley: CERO hex en pantallas.** Todo color/espacio/tipografía sale del sistema de
  tokens (ADR-072); un hex hardcodeado en una pantalla es un bloqueante del gate.

### Principios permanentes (salieron de la primera corrida — ya son norma)

- **UN solo formatter de fecha**, con **TZ Argentina explícita** (nunca la TZ del servidor/runtime).
- **UN solo formatter de moneda** — `fmtMoneyARS`, **signo pegado** (`$1.234,56`).
- **`tabular-nums` en todo número** (tablas, totales, KPIs — que las columnas no bailen).
- **Skeletons de ruta obligatorios** (toda ruta tiene su loading state, no pantalla en blanco).
- **Estados completos en cada control** (default/hover/focus/disabled/error/empty — sin huecos).

### Veredicto inaugural (registro histórico)

Primera corrida 2026-07-11 sobre el producto de facturación: **5,5/10**, con **4 bloqueantes, todos
corregidos**: (1) fechas en TZ del servidor → formatter único con TZ Argentina; (2) contraste AA roto en
tema claro → tokens corregidos; (3) scroll horizontal en 13" → layout ajustado; (4) sin loading states →
skeletons de ruta. La distancia entre 5,5 y 10 es el backlog vivo de la lente que corresponda.

## Consecuencias

- **(+)** El craft deja de depender del ojo de la sesión: 7 lentes con nombre = 7 checks repetibles. Los
  4 bloqueantes del inaugural no pueden volver a entrar (ya son principios permanentes).
- **(+)** "Tokens son la ley" hace el re-theming por tenant (ADR-072/073) gratis y a prueba de drift.
- **(+)** La lente TEXTOS eleva el copy a ciudadano de primera del gate — conecta directo con ADR-080.
- **(−)** El gate encarece cada publicación (una corrida más, en Opus como toda auditoría GSG, ADR-032 §3).
  Es deliberado: con clientes reales mirando, el costo de publicar mediocre es mayor.
- **(−) Deuda anotada:** el inventario de pantallas viejas (pre-gate) no pasa las 7 lentes hoy — se
  auditan al tocarlas, no en big-bang (coherente con refactorizar-no-reconstruir, ADR-063).

— Elaborado por GSG · 2026-07-11

> Numeración provisional — verificar colisión al mergear (regla de timestamps de CLAUDE.md aplicada a ADRs).
