# Fase 0 — Cierre del embudo de conversión (Growth/Agencia Digital)

> **Sector:** Agencia Digital · **Célula:** Growth/Agencia Digital (capa Sonnet 5, ejecución) ·
> **Fecha:** 2026-07-06 · **Frente:** `frente/growth-funnel` (worktree aislado).
> **Leído antes de escribir esto:** `FUNDAMENTO.md`, el charter (`docs/sectores/agencia-digital.md`),
> los 4 análisis de mercado, `2026-07-06-estrategia-lanzamiento-erp.md`,
> `2026-07-06-guiones-campana-lanzamiento.md`, `2026-07-06-plan-video-interactivo-story.md`,
> `docs/demo/README.md` + código de `src/app/demo/`, `docs/MODELO-ADAPTACION-PREVENTA.md`,
> `docs/metodologia/generador-preset-ia.md`.
> **Nada publicado, ningún mensaje enviado.** Solo instrumentación de código (aislada, no-op sin
> tag) + documentación. Ver §6 (Gate GSG) para qué de esto pasa el Gate y qué queda fuera de alcance.

---

## 0. Objetivo de esta Fase 0

Que la preventa **convierta**: publicidad → `/demo` → adaptador self-serve → WhatsApp. Esta sesión
(a) audita el estado real de cada tramo del embudo contra lo que ya construyeron Célula 1 (GTM) y
Célula 3/Probador (motor de la demo), (b) cierra el gap más barato y de mayor apalancamiento que
estaba bloqueando medir cualquier pauta (instrumentación de `/demo`), y (c) deja un plan secuenciado
con dueño y gate de cada paso restante — sin tocar nada que requiera OK del dueño o de otra célula.

---

## 1. Mapa del embudo — estado real por tramo (verificado en repo, no supuesto)

| # | Tramo | Estado | Dueño | Evidencia |
|---|---|---|---|---|
| 1 | **Ad** (Stories/Reels, 5 conceptos + video insignia) | 🟡 **Guionado, NO producido/publicado.** Sin media real, sin pauta corriendo. | Célula 1 (GTM) | `2026-07-06-guiones-campana-lanzamiento.md`, `2026-07-06-plan-video-interactivo-story.md` |
| 2 | **`/demo`** (product tour interactivo) | 🟢 **Construido y aislado** (`force-static`, sin DB/credenciales) · 6 escenas · CTA WhatsApp/mail. Antes de hoy: **sin instrumentación** (bloqueante para medir pauta, marcado explícito en la estrategia §2/§5). | Célula 3 (Probador) | `src/app/demo/`, `docs/demo/README.md` |
| 2b | **Instrumentación de `/demo`** | 🟢 **HECHO ESTA SESIÓN** — `demo_start`/`demo_step_completado`/`demo_complete`/`cta_whatsapp_click`/`cta_email_click` a `dataLayer`/`fbq`, no-op sin tag. Ver §2. | Growth/Digital (esta célula) | `src/app/demo/analytics.ts` + `.test.ts` |
| 3 | **Tag de analítica** (GTM/Meta Pixel real en la página) | 🔴 **No existe todavía.** La instrumentación de 2b no tiene a quién emitirle hasta que se agregue el snippet. | Growth/Digital (siguiente paso, sin gate — no es contenido ni publish) | — |
| 4 | **Multi-rubro real de la demo** (`utm_content` → catálogo/escenas de retail/carnicería, no solo estética) | 🟡 **Contrato definido, NO construido.** Hoy la demo es un único negocio genérico ("Estudio Aura") sin importar el rubro del ad. | Célula 3 (Probador) — cambio de **contenido**, no instrumentación | `demo-content.ts` (sin variantes por rubro) |
| 5a | **Camino WhatsApp** (cierre de la demo → `wa.me` con mensaje precargado) | 🟡 **Funciona técnicamente**, pero el número es **placeholder** (`5491100000000`). No se puede publicar así. | Dueño (número real) | `demo-content.ts` → `DEMO_CTA.whatsappNumber` |
| 5b | **Camino self-serve → Adaptador** (visitante que no quiere WhatsApp pero quiere ver SU negocio) | 🔴 **No existe como ruta pública.** Hoy "adaptador" = metodología ejecutada por un agente en sesión (`generador-preset-ia.md`), no un formulario/intake al que un prospecto llegue solo. | Propuesta nueva — ver §4 | `docs/metodologia/generador-preset-ia.md`, `docs/MODELO-ADAPTACION-PREVENTA.md` |
| 6 | **Preset del prospecto → probador a medida** | 🟡 **Metodología y contrato en código listos** (`src/preset/extraction/material-de-marca.ts`), **Gate de Excelencia bloqueante** definido, pero requiere **autorización del cliente + corrida de un agente** — no es self-serve todavía. | Adaptador (célula Sonnet) + Preset IA (Opus, ingesta/gate) | `docs/metodologia/generador-preset-ia.md` |
| 7 | **Alta / tenant activo** | ⚪ Fuera de alcance de esta Fase 0 — es el cierre de venta, no el embudo de demo. | Producto/Onboarding | `docs/ONBOARDING-TENANT.md` |

**Lectura del mapa:** el embudo tiene **dos tramos verdes** (demo construida + ahora instrumentada),
**tres amarillos con dueño y gate claros** (tag de analítica, multi-rubro, número real), y **un rojo
real** que no tenía dueño asignado: el camino self-serve hacia el Adaptador (5b). Ese es el hueco
que efectivamente "no cierra el embudo" — hoy todo el que no quiere hablar por WhatsApp simplemente
se pierde, porque no hay ningún otro camino de baja fricción.

---

## 2. Qué se cerró en esta sesión (código, verificado, sin publicar)

**Instrumentación de `/demo`** (`src/app/demo/analytics.ts` + `DemoTour.tsx` cableado):
- `trackDemoEvent(name, params)` empuja a `window.dataLayer` (estándar GTM → GA4 + Meta Pixel vía
  tag) y llama a `window.fbq` si existe. **Sin GTM/Pixel cargado es no-op — cero red**, por eso puede
  vivir en el código ya, antes de que la campaña exista.
- `demoRubroFromUrl()` lee `utm_content` (contrato de la campaña) y taggea cada evento con el rubro
  del ad de origen.
- Eventos emitidos: `demo_start` (mount) · `demo_step_completado` (por escena, una vez, con
  `escena`+`paso`+`rubro`) · `demo_complete` (al llegar a la última) · `cta_whatsapp_click` /
  `cta_email_click` (en los CTA, sin bloquear la navegación).
- **Mantiene el aislamiento de la ruta** (`docs/demo/README.md` §"Aislamiento"): solo importa
  `react`/`next` y archivos propios de `src/app/demo/`. Verificado con el grep de la propia doc.

**Verificación (vallas cumplidas):**
- `tsc --noEmit`: sin errores nuevos en `src/app/demo/` (los preexistentes en `src/lib/*` son de
  otros frentes, no tocados acá).
- `npm test`: **400/400** verdes (6 nuevos de `analytics.test.ts`).
- Recorrido en vivo (`npm run dev` + navegación real con `?utm_content=retail`): confirmado
  `demo_start` → 6× `demo_step_completado` → `demo_complete` → `cta_whatsapp_click` en
  `window.dataLayer`, con `rubro: "retail"` correcto en cada evento.
- Documentación actualizada: `docs/demo/README.md` (sección nueva "Instrumentación") y el checklist
  de `2026-07-06-plan-video-interactivo-story.md` §6 (ítem tildado + nota de qué falta).

---

## 3. Qué falta y quién lo gatea (secuenciado)

1. **Agregar el tag de GTM/Meta Pixel a la página** (siguiente paso técnico, sin gate del dueño — no
   es contenido ni publica nada; el pixel real recién *mide* cuando haya campaña). Puede hacerlo esta
   célula o Célula 3 cuando confirme el ID de cuenta a usar.
2. **Multi-rubro real en `/demo`** (Célula 3/Probador): parametrizar `demo-content.ts` por
   `utm_content` para que el ad de retail/carnicería muestre catálogo de ese rubro, no "Estudio Aura"
   fijo. Coordinar antes de correr los ad sets B/C del plan de pauta (hoy solo A-estética "calza" 1:1
   con la demo).
3. **Número real de WhatsApp** — 🔒 gate del dueño (dato de negocio, no técnico).
4. **Producción del creativo** (grabación de pantalla del tour, 3 hooks × 3 rubros) — 🔒 gate del
   dueño para arrancar producción + presupuesto de pauta.
5. **Camino self-serve hacia el Adaptador** — propuesta nueva, ver §4. Es el hueco real del embudo;
   no tiene un dueño de célula asignado todavía (a diferencia de 1-4).
6. **Gate GSG completo (Opus)** antes de: (a) mostrarle a un prospecto real cualquier preset generado
   a partir de su marca, (b) publicar la campaña. Nada de lo de este documento reemplaza ese Gate.

---

## 4. Propuesta — el camino self-serve hacia el Adaptador (el hueco real)

**El problema concreto:** el funnel documentado (`estrategia-lanzamiento-erp.md` §2) termina la demo
con dos salidas: **(a)** alta/prueba o **(b)** "dejá tu WhatsApp". No hay una tercera salida para el
visitante que **no quiere escribir por WhatsApp todavía** pero se engancharía con *"mostrame cómo
quedaría MI negocio"* — que es exactamente la jugada de cierre que ya probamos manual con Break Point
y Magra (`docs/MODELO-ADAPTACION-PREVENTA.md` §3, "el demo del front replicado"). Hoy ese camino
**no existe como autoservicio**: requiere que un humano/agente corra
`docs/metodologia/generador-preset-ia.md` de punta a punta.

**Propuesta (a validar con PMO/Adaptador antes de construir — esto es propuesta, no código):**
- Un tercer CTA en el cierre de `/demo`, de fricción **igual de baja** que "dejá tu WhatsApp":
  *"¿Querés ver TU negocio así? Pasanos tu Instagram o tu web."* — un campo de texto (link) +
  checkbox de autorización (la misma precondición dura de `generador-preset-ia.md` §"Paso de
  autorización", **no negociable**) + el mismo WhatsApp/mail como destino de entrega (no un backend
  nuevo: el envío puede ser el mismo `mailto:`/`wa.me` con el link adjunto en el texto pre-cargado,
  **cero infraestructura nueva** para la v0).
- **Puente manual mientras no haya automatización 1-clic** (estado honesto del generador,
  `generador-preset-ia.md` §"Estado honesto"): ese lead llega igual que uno de WhatsApp hoy, y el
  Adaptador lo toma como un caso más de la metodología manual (mismo patrón que Break Point/Magra).
  La propuesta **no** exige construir una cola/backend de generación automática — solo **explicita el
  camino** que hoy se pierde por no estar ofrecido.
- **Por qué es de bajo riesgo:** no toca `/demo` fuera de agregar un CTA más (mismo patrón, mismo
  aislamiento `force-static`), no agrega backend, no genera ni muestra ningún preset sin el Gate ni
  sin autorización — solo **abre la puerta de entrada** al proceso que ya existe y ya está probado.
- **Siguiente paso concreto (no hecho en esta sesión — a coordinar con Célula 3/Probador antes de
  tocar `/demo` de nuevo):** especificar el copy exacto del tercer CTA + el evento de instrumentación
  que le corresponde (`lead_capturado` con `origen: "self-serve"` vs `origen: "whatsapp"`, ya
  contemplado en la matriz de eventos de la estrategia §2) y coordinar con el Adaptador cómo recibe
  ese lead (hoy: bandeja de mail/WhatsApp del dueño, revisada por PMO).

---

## 5. Coordinación (por el repo, no por el chat)

- **A Célula 3 (Probador):** la instrumentación está lista y documentada en `docs/demo/README.md`;
  falta el tag real (paso técnico, no gatea nada) y el multi-rubro real (§3.2) antes de correr los ad
  sets B/C. El tercer CTA self-serve (§4) se coordina con ustedes antes de tocar `DemoTour.tsx` de
  nuevo — mismo patrón de aislamiento que ya rige la ruta.
- **Al Adaptador:** §4 propone un canal de entrada nuevo hacia la metodología que ya tienen
  documentada y probada (Break Point, Magra); no cambia el proceso de generación ni el Gate, solo
  agrega una fuente de leads. Autorización del cliente sigue siendo precondición dura antes de tocar
  su marca, sin excepción.
- **Al PMO:** el orden recomendado para no quemar presupuesto es 3→2→1 técnico (tag, multi-rubro,
  luego recién correr ad sets B/C) en paralelo con 3-4 (gates del dueño: número real, producción del
  creativo). El self-serve (§4) puede esperar a la v1 de pauta — no bloquea el piloto A-estética,
  que ya calza 1:1 con la demo actual.

---

## 6. Gate GSG / sello — qué aplica a este entregable y qué no

Este entregable es **instrumentación interna + documentación de coordinación**, no un preset ni una
pantalla nueva de cara al cliente. Contra el Gate de Excelencia (`docs/METODOLOGIA-SPRINT.md`):

1. **Auditoría SAP Fiori:** **N/A** — no hay UI nueva ni cambio visual (mismos CTA, mismo copy; solo
   se agregó un `onClick` que no altera la navegación existente, verificado en vivo).
2. **Sello GSG:** **N/A** — no es un entregable de marca/preset de cara a un cliente.
3. **Arquitectura:** ✅ mantiene el aislamiento duro de `/demo` (verificado con el grep de imports);
   lógica pura, sin dependencias nuevas, no toca `tenantId`/RLS/prisma.
4. **Confiabilidad:** ✅ `tsc` limpio en el código tocado, `npm test` 400/400, sin tocar prod/Neon,
   no-op sin tag (no puede romper nada en producción antes de que GTM lo active).

**Lo que sigue exigiendo el Gate completo (Opus, sin excepción):** cualquier preset generado para un
prospecto real antes de mostrárselo (§1 tramo 6) y la campaña/creativo antes de publicarse — nada de
esta Fase 0 se acerca a esos entregables.

---

## 7. Resumen ejecutivo (para el dueño)

- **Qué se hizo:** se auditó el embudo completo (ad → demo → adaptador → WhatsApp) contra lo que ya
  construyeron Célula 1 y Célula 3, y se cerró el gap que impedía medir cualquier pauta futura: la
  demo ahora **cuenta** quién entra, hasta dónde llega y si toca el CTA — sin publicar nada ni gastar
  un peso.
- **El hueco real que encontramos:** el embudo hoy solo ofrece "WhatsApp" como salida de baja
  fricción; el camino hacia "mostrame cómo quedaría MI negocio" (la jugada que ya cerró ventas con
  Break Point y Magra) **no está ofrecido como autoservicio**. Queda propuesto en detalle (§4) para
  decidir cuándo construirlo — no bloquea el piloto de pauta.
- **Qué falta antes de gastar en pauta:** el tag de analítica real (técnico, sin gate) y — del lado
  del dueño — el **número real de WhatsApp** y el **OK para producir el creativo**. Sin eso, el piloto
  A-estética (el único que calza 1:1 con la demo actual) puede arrancar apenas estén esos dos.
- **Nada tocó prod, Neon, ni se publicó/envió nada.** Todo en `frente/growth-funnel`, listo para que
  el PMO lo integre.

— Elaborado por **Gestión Studio Grow (GSG)**.
