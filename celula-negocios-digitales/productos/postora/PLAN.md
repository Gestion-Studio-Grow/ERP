# Postora — Plan hasta el primer cliente pagando

> Objetivo: **primeros 5–10 pagos recurrentes** en 4–6 semanas, reusando el stack contenido IA +
> WhatsApp + Mercado Pago. El experimento que pide el red-team: **medir la retención al mes 3, no el alta.**

— Elaborado por GSG.

---

## A quién venderle primero (segmento faro)

Comercios de barrio con **ticket y recurrencia**, que ya intentan estar en redes y **valoran el diseño**:

1. **Gastronomía de barrio** (rotisería, bar, café, delivery) — mucho posteo de promo/novedad. ← faro inicial
2. **Estética / peluquería / uñas** (turno + seña) — sinergia con CH y con Fantasma.
3. **Indumentaria / boutique de barrio** (temporadas, novedades).
4. **Almacén / dietética / vinoteca** (ofertas semanales, delivery).

Criterio de corte: (a) el dueño ya sabe que "hay que postear" y no le sale, (b) tiene ticket > US$8–10 por
venta (para que las ventas atribuidas muevan la aguja), (c) valora que se vea lindo. Empezar por **1 rubro**
(gastronomía) para pulir Kit de Marca + plantillas + ángulos.

---

## Cómo demostrar el valor (el pitch que cierra)

El gancho no es "te hago posteos", es **"tu CM con el gusto del estudio, y a fin de mes te muestro cuánta
gente te escribió por los posteos"**. Demo en 3 pasos:

1. **Espejo en vivo:** con el Kit de Marca del prospecto cargado, generamos **el plan de su mes** (copy en
   su voz + arte brandeado + CTA). El dueño ve **su marca**, no un template genérico. (La demo offline hace
   exactamente esto — ver `src/demo.ts` y el demo web navegable.)
2. **Prueba de 1 mes:** le entregamos el plan del mes con las CTAs rastreables. Riesgo bajo: publica él,
   nosotros producimos.
3. **Reporte de Resultados:** al cierre le mostramos **conversaciones y ventas atribuidas**. **Ese número
   cierra la venta y retiene** — es la diferencia con "posteos lindos".

---

## Milestones

### M0 — Kickoff (hecho) · día 0
- [x] SPEC, ARQUITECTURA, pricing (tope + excedente + créditos de imagen), scaffold del corazón.
- [x] **Model routing** (Haiku/Sonnet) + **prompt caching** del Kit + **motor de COGS por modelo**.
- [x] **Generador** de plan mensual en voz de marca con **CTA rastreable** por posteo.
- [x] **Reporte de Resultados** (atribución por tag) + demo offline ejecutable + **demo web navegable**.
- [x] Vallas verdes: `tsc --noEmit` + 28 tests (`node --test`) + build.

### M1 — Corazón productivo · días 1–7 (§C: gasto de tokens en prod)
- [ ] Cablear `LLMClaude` (Haiku + Sonnet reales) con prompt caching del Kit y salida estructurada.
- [ ] Validar COGS real medido vs supuesto en 20 planes sintéticos (confirmar centavos/posteo).
- [ ] Persistencia (Postgres/SQLite): Kits, planes, posteos, eventos de atribución, `UsoMensual`.
- [ ] Contador de posteos vs tope + créditos de imagen + cálculo de excedente.

### M2 — Cobro + atribución · días 7–14
- [ ] Integrar **Mercado Pago** (suscripción/preapproval en pesos + webhook de estado).
- [ ] Atribución: links `wa.me` taggeados + captura de eventos (WhatsApp / código de promo en mostrador).
- [ ] Generador del **Reporte de Resultados** (mensual) → WhatsApp + email al dueño.
- [ ] Onboarding self-serve: cargar Kit de Marca en < 30 min (o poblarlo desde la red del comercio con
      autorización, vía Generador de Preset por IA).

### M3 — Primeros pagos · días 14–30
- [ ] Conseguir **5–10 comercios** de gastronomía conocidos para el primer mes pago (US$39 promo de lanzamiento).
- [ ] Entregar el plan del mes + primer **Reporte de Resultados**.
- [ ] **Medir retención al mes 3** (la métrica que decide si el negocio existe), no el alta.

### M4 — Repetible · días 30–60
- [ ] Empaquetar el onboarding por rubro (Kit + plantillas + ángulos listos).
- [ ] Abrir el bundle **Postora + Fantasma** (producción + atención) al mismo nicho.
- [ ] Escalar a 20–30 comercios del rubro faro con CAC bajo (venta atomizada, mismo playbook).

---

## Riesgos y mitigaciones

| Riesgo | Mitigación (ya en el diseño) |
|---|---|
| **Comoditización del contenido IA** (Canva/Meta gratis) | El Kit de Marca + curaduría del estudio = el producto; se vende **el gusto**, no "posteos". Diseño demostrablemente superior. |
| **Trampa de margen (COGS variable)** | Model routing + prompt caching + tope de posteos + imagen por crédito + kill-switch. COGS de texto en centavos, medido. |
| **Churn del comercio de barrio (60 días)** | Reporte de Resultados que ata contenido a conversaciones/ventas → valor demostrable. Medir retención al mes 3. |
| **Baja disposición de pago** | Suscripción MP en pesos sin fricción; ticket US$29–59; promo de lanzamiento US$39. Servicio gestionado (el dueño no hace nada). |
| **Atribución imperfecta** | Ventas "declaradas/atribuidas" sin sobre-prometer causalidad; el foco medible fuerte son **conversaciones por posteo** (dato duro del link taggeado). |

---

## Gate de Excelencia (ADR-040) — checklist de este entregable

- **SAP Fiori (7 ángulos) + argentino:** N/A UI de app productiva (es scaffold + demo); **el demo web** sí:
  rol-based (dueño), coherente, simple, responsive, accesible (contraste/roles), consistente con tokens de
  marca, **criollo** (copy de barrio, WhatsApp-first, MP, pesos). ✔
- **Sello GSG:** demo web con `metadata.generator="Gestión Studio Grow"` + crédito discreto en el pie;
  docs firmados "— Elaborado por GSG"; commit con trailer del equipo. ✔
- **Arquitectura:** límites de dominio claros (tipos/routing/planes/generador/metricas), LLM detrás de
  interfaz (testable, offline), sin secretos en el repo, deuda anotada (§C). ✔
- **Confiabilidad:** `tsc` + 28 tests + build verdes; sin datos reales; imagen IA acotada; kill-switch. ✔

---

## Definición de "primer cliente pagando"

Un comercio de gastronomía de barrio con su **Kit de Marca** cargado, **pagando el tier Barrio/Activo por
Mercado Pago**, que recibió **el plan del mes** y **al menos un Reporte de Resultados** con conversaciones
atribuidas reales. Meta: **día 30**. La señal de éxito real: **3 de 5 renuevan al mes 3 sin que haya que
rogar.**
