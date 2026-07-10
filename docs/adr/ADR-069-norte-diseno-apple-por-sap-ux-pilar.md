---
id: ADR-069
nivel: fundacional
dominio: [UX, Producto]
depends_on: [ADR-009, ADR-044, ADR-059]
---
# ADR-069: Norte de diseño "un SAP que diseñó Apple" — Apple×SAP y la arquitectura UX/UI como pilar

**Estado:** Aceptado — **fundamento de producto/UX**. Fija el **norte de diseño** y eleva la **UX/UI a pilar**;
el **detalle** lo desarrolla la sesión de diseño (puntero a la §11 de arquitectura UX/UI).
**Fecha:** 2026-07-10
**Depende de:** ADR-009 (UX metadata-driven, diseñar para la recepcionista), ADR-044 (Argentinizar SAP),
ADR-059 (reingeniería de interfaz backoffice GROW-AR)
**Relacionado:** ADR-058 (GROW-AR), ADR-061 (toolkit UI compartido), ADR-043 (marca del tenant),
ADR-040 (Gate: SAP Fiori 7 ángulos) · **Detalle:** `docs/estrategia/addendum-arquitectura-ux-ui.md` (§11 UX/UI)

---

## Contexto

El producto toma de SAP el **rigor enterprise** (procesos, roles, Fiori) pero corre el riesgo de heredar también
su **pesadez** (interfaces densas, curva alta) — justo lo que aleja a la pyme argentina (ADR-044/059). Del otro
lado, "simple como una app de consumo" sin la profundidad de proceso sería un juguete (anti-rechazo enterprise,
ADR-059 D8). Falta declarar el **norte de diseño** que resuelve esa tensión y **elevar la UX/UI a pilar** de
arquitectura (no un barniz al final). El detalle fino (design system, densidades, patrones, primitivos) lo está
generando una **sesión de diseño** en la **§11 de arquitectura UX/UI**
(`addendum-arquitectura-ux-ui.md`); este ADR fija el marco y **apunta** a ese detalle.

## Decisión

El norte de diseño es **"un SAP que diseñó Apple"**: la **profundidad de proceso de SAP** con la **claridad,
foco y deleite de Apple**, argentinizado (ADR-044).

1. **Apple×SAP como criterio rector de UX** — cada pantalla tiene la **profundidad** que el proceso exige
   (SAP) pero la **simplicidad percibida** de una app de consumo (Apple): jerarquía clara, una tarea principal
   por vista, cero ruido, defaults inteligentes. "La recepcionista, no el ERP" (ADR-009) llevado a estándar de
   deleite enterprise.
2. **UX/UI es PILAR de arquitectura, no capa cosmética** — se diseña junto con el modelo de datos y el proceso,
   no después; el **toolkit UI compartido** (design system + primitivos + densidades, ADR-059 D4/D6/ADR-061)
   es infraestructura de producto, no decoración. La UX entra al Gate como ángulo de primera (ADR-040).
3. **Fidelidad de marca del tenant intacta** — el norte Apple×SAP aplica al **producto/backoffice**; la
   **marca visible del tenant** manda en su vidriera (ADR-043), y el tier/estándar nunca se expresa en color
   del acento (ADR-059 D5).
4. **El detalle vive en la §11** (`addendum-arquitectura-ux-ui.md`) — patrones, primitivos, densidades,
   tokens: este ADR **apunta** a esa sección (índice-puntero, ADR-008/H1), no la reescribe. Cuando la sesión
   de diseño la cierre, este ADR la referencia como fuente de verdad del detalle.

> **En una línea:** *toda la profundidad de SAP, sintiéndose tan simple como una app de Apple, hablando
> argentino — y la UX diseñada como pilar, no maquillada al final.*

## Consecuencias

- **(+)** Un norte **memorable y accionable** ("¿esto lo firmaría Apple *y* resuelve el proceso como SAP?") que
  el Gate puede evaluar (ADR-040, 7 ángulos Fiori + argentino).
- **(+)** Elevar la UX a pilar evita el "backoffice feo que funciona": la simplicidad percibida es diferencial
  de venta para la pyme (ADR-044/059).
- **(+)** El toolkit compartido (ADR-061) hace que el norte se aplique **una vez** y sirva a los dos productos
  (ADR-060) en dos densidades.
- **(−)** "Apple×SAP" es exigente: pide trabajo de diseño real por pantalla (jerarquía, defaults, foco), más
  caro que copiar una tabla densa. Asumido como el precio del diferencial.
- **(−)** Este ADR **no entrega el detalle**: depende de que la §11 (`addendum-arquitectura-ux-ui.md`) lo baje.
  Hasta entonces, es marco + puntero (definir ≠ construir).

## Alternativas descartadas

- **SAP a secas** (rigor sin rediseño). Completo pero pesado → aleja a la pyme. Rechazada por ADR-044/059.
- **App de consumo sin profundidad** (bonita pero superficial). Vende fácil pero no aguanta el proceso
  enterprise → juguete (anti-rechazo, ADR-059 D8). Rechazada.
- **UX como capa final/cosmética.** Barata al inicio pero produce interfaces que no se pueden simplificar sin
  rehacer el modelo → deuda estructural. Rechazada: UX como pilar desde el diseño.
- **Un norte de diseño por producto** (uno para micro, otro para empresa). Rechazada: un solo toolkit/norte,
  dos densidades (ADR-061/059 D4).

— Elaborado por GSG (Diseño & Marca / Arquitecto de Solución — fundamento + puntero a la §11; el detalle lo cierra la sesión de diseño)
