---
name: ingenieria-reversa
description: Método de GSG para hacer ingeniería reversa de los mejores sistemas de un rubro (los referentes de un mercado maduro, por ejemplo Europa) y convertirlos en una reingeniería adaptada al negocio local argentino — modelo, reglas, matriz de eventualidades, backoffice por rol, motor testeado y demo a costo cero — en una sola pasada. Usalo cuando el pedido es "tomá lo mejor de cómo se gestiona X afuera y adaptalo a este cliente", cuando hay que rediseñar el backoffice de un rubro nuevo, o cuando una preventa necesita una demo que funcione de verdad y no sólo una vidriera. Caso de referencia vivo — Break Point Pádel (docs/tenants/breakpoint/REINGENIERIA.md).
---

# Ingeniería reversa → reingeniería local

Método probado en **Break Point Pádel** (14/10/2026): de "así se gestiona un club de pádel en Europa" a un
backoffice de club que la recepcionista puede usar con gente esperando en el mostrador, con la vista del dueño
(cámaras, stock, turnos) y un motor de reglas con 28 tests. Cada paso dice **qué se hace, por qué y qué entrega**.

> **Frontera de honestidad (no negociable).** Ingeniería reversa es leer **lo que el referente muestra en
> público** (centro de ayuda, documentación, sitio comercial, reseñas) e inferir el modelo. **No** se copia
> código, marca, textos ni diseño de terceros, **no** se entra a cuentas ajenas ni se esquiva un login. Lo que
> se toma es la **idea de producto** y la regla de negocio; la ejecución es nuestra.

## Paso 0 — Calibrar y encuadrar (ADR-052)

1. Leé el caso del cliente si existe (`docs/metodologia/registro-casos/<slug>.md`) y lo que ya hay construido
   (`grep -ri <cliente> docs src public`). Nunca arranques de cero si hay una preventa previa.
2. Confirmá la **etapa comercial**: antes de la venta, todo es **demo a costo cero** (sin datos reales, sin
   persistencia, sin dominio — ciclo DEMO → VENTA → INVERSIÓN). Eso decide el formato del entregable.
3. Si se va a usar la marca del cliente frente al cliente: **autorización registrada** (ADR-034). Si no consta,
   se construye igual, pero se marca como bloqueante **antes de mostrar**.
4. Escribí 3–5 principios de la pasada. La zona de de-sesgo es doble (ADR-046): **estándar** para el motor
   (reglas, plata, tests) y **humana/criolla** para los textos que lee la recepcionista y los mensajes de WhatsApp.

## Paso 1 — Elegir los referentes (3 a 5)

- **Líder de mercado** (el que define la categoría), **retador** (el que innova), **el de gestión pura**
  (caja, socios, BI) y **el de automatización física** (acceso, luces, sensores) si el rubro tiene local.
- Fuente primaria antes que secundaria: **centro de ayuda del producto** > documentación > sitio comercial >
  comparadores/reseñas. El centro de ayuda describe **reglas reales** ("se cancela hasta 24 h antes",
  "el reembolso al monedero es instantáneo"); el sitio comercial describe promesas.
- Registrá cada fuente con su URL. **Lo que no se pudo verificar se marca "inferido"**, nunca se presenta como
  hecho. Es preferible decir "no encontramos que X lo haga" a inventarlo.

*Por qué:* con 3–5 referentes aparece el **patrón del rubro** (lo que todos resuelven igual = esencia) y las
**diferencias** (donde está la oportunidad de innovar). Con uno solo se copia un producto, no un rubro.

## Paso 2 — Desarmar: el modelo detrás de las pantallas

Para cada referente, completá la misma ficha (la comparabilidad es el valor):

| Capa | Pregunta |
|---|---|
| **Objetos** | ¿Qué se crea una vez? (cancha, cliente, producto, tarifa) — ADR-055: objeto con su ABM |
| **Asignaciones** | ¿Qué relaciona objetos? (reserva = cancha × horario × cliente) — nunca "a todos con todo" |
| **Ciclo de vida** | ¿Qué estados atraviesa la entidad central y quién la mueve? |
| **Reglas** | Cancelación, seña, tolerancia, precio por franja, cupos, niveles, penalidades |
| **Roles** | ¿Quién ve qué? (recepción, dueño, profe, jugador) |
| **Plata** | Medios, monedero/saldo a favor, cobro dividido, devoluciones, caja |
| **Automatización** | Avisos, liberación automática, luces, acceso, integración con hardware |
| **Métricas** | ¿Qué mira el dueño? (ocupación por franja, ticket, no-show, stock) |

## Paso 3 — Separar esencia de accidente

- **Esencia** = lo que todos los referentes hacen igual → va al motor tal cual (no se reinventa).
- **Accidente de mercado** = lo que responde a su contexto (IVA europeo, SEPA, clubes 100 % techados, pago
  con tarjeta universal, cultura de app propia) → **se reemplaza** por el equivalente argentino.

**Checklist de argentinización (ADR-044)** — cada punto, con su respuesta explícita:
- ¿Cómo se señala/paga? → **transferencia y Mercado Pago (QR)** primero, efectivo siempre, tarjeta.
- ¿Por dónde se habla con el cliente? → **WhatsApp** (mensajes listos para mandar), no una app propia.
- ¿Qué pasa con la **lluvia** si hay canchas descubiertas? ¿Y con un **corte de luz**?
- ¿Cómo se vive la **inflación**? → precios editables por el dueño, sin redeploy.
- ¿Facturación? → plugin ARCA del ERP cuando haya venta real; en demo, N/A.
- ¿Quién usa la pantalla y con qué apuro? → la recepcionista con gente delante: **2 toques**, criollo claro.

## Paso 4 — Matriz de eventualidades (el entregable que más vale)

Una tabla con **todo lo que puede salir distinto de lo planeado** en un día real. Para cada fila:
`eventualidad · regla · quién decide · qué ve la recepcionista · función del motor · test`.

Cómo encontrarlas: recorré el ciclo de vida del Paso 2 y en cada transición preguntá **"¿y si no pasa?"**,
**"¿y si pasa tarde?"**, **"¿y si pasa dos veces?"**, **"¿y si pasa a medias?"**. Sumá las del entorno
(clima, luz, mantenimiento, stock, caja) y las de la gente (no vino, llegó tarde, se va sin pagar, quiere
extender, cancela a último momento, quiere dividir la cuenta).

*Regla:* **una eventualidad sin test no está resuelta.** Una fila que no se implementa se marca "fuera de
alcance" con el porqué.

## Paso 5 — Innovar donde el referente es débil

Buscá explícitamente:
1. **Lo que el referente deja "a criterio del club"** (ahí está el trabajo manual que se puede sistematizar).
   Ej. Break Point: la cancelación tardía → *seña en suspenso que se libera sola si el hueco se vuelve a vender*.
2. **Lo que el referente no tiene porque su mercado no lo necesita** (corte de luz, lluvia en descubierta).
3. **Lo que está en dos sistemas y debería estar en uno** (cámara ↔ turno ↔ saldo; consumos del bar ↔ cuenta
   de la cancha; luz ↔ turno en juego).
4. **Que el sistema avise en vez de que la persona descubra**: una bandeja de "para resolver ahora" ordenada
   por urgencia, con la acción en un toque.

Cada innovación lleva **1 línea de valor** ("cuánta plata o cuánto tiempo ahorra") y su test.

## Paso 6 — Construir en una pasada

Orden que funcionó (de adentro hacia afuera):
1. **Motor puro** (`motor.mjs`): sin DOM, sin red, sin disco. Cada operación devuelve `{ ok, motivo }` en
   criollo — la recepcionista lee qué pasó, no un error técnico. Datos de demo con **semilla** (la demo se ve
   igual cada vez) que **pongan cada eventualidad a la vista** al abrir.
2. **Tests** (`node:test`) de cada fila de la matriz + un invariante global (ej.: "ningún par de turnos activos
   se pisa"). Se corren con `node --experimental-strip-types --test` o `npm test`.
3. **Backoffice por rol** (`index.html` + `app.mjs`): la vista operativa (recepción) es una sola pantalla
   (grilla + bandeja + caja); la vista de control (dueño) es indicadores + lo que no se puede ver desde el
   mostrador. Marca del cliente adelante, **sello GSG** atrás (`meta generator` + crédito discreto en el pie).
4. **Hardware simulado con honestidad**: si el rubro tiene cámaras, luces o molinetes, la demo los **simula y
   lo dice** en pantalla ("Simulación de demo — en el club se conecta a la grabadora existente").
5. **QA de recorrido** con Playwright (Chromium en `/opt/pw-browsers`): clic por clic en escritorio y en
   390 px de ancho, claro y oscuro, cero errores de consola, **sin scroll horizontal de página**.

*Trampa conocida:* un `.sr` (texto para lector de pantalla, `position:absolute`) dentro de una tabla con
scroll horizontal se escapa del contenedor y ensancha la página en el celular. El contenedor con scroll
necesita `position:relative`.

## Paso 7 — Documentar y cerrar

- `docs/tenants/<slug>/REINGENIERIA.md`: referentes con fuentes, ficha del Paso 2, esencia vs. accidente,
  matriz, innovaciones, vistas, **camino a producción** (qué es reversible y qué es §C: migración = Gate 2,
  deploy = Gate 1, credenciales = las pega el dueño) y lista de **provisional a confirmar**.
- Sumá la sección al caso en `docs/metodologia/registro-casos/<slug>.md` y una heurística si apareció.
- **Gate de Excelencia** (4 bloques) antes de integrar a `main`. Lo que no aplica: N/A + por qué.

## Qué NO hacer

- Presentar como "así lo hace Playtomic" algo que no está en una fuente. Inferido se dice inferido.
- Persistir datos o pedir credenciales en la demo (ni de cámaras, ni de Mercado Pago).
- Abrir `wa.me/<número>` con teléfonos de ejemplo: pueden ser de alguien real. En demo, `wa.me/?text=`.
- Tocar el schema de producción para la demo. El modelo se **propone** en el documento; la migración es Gate 2.

— Elaborado por GSG
