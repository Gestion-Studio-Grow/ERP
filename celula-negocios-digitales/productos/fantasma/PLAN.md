# Fantasma — Plan hasta el primer cliente pagando

> Objetivo: **caja en 2–3 semanas** reusando el stack WhatsApp + IA + Mercado Pago. El de time-to-cash
> más corto de la ronda. Break-even del producto: ~25 clientes a ~US$200 = US$5.000/mes.

---

## A quién venderle primero (segmento faro)

Negocios de **servicio con turno y ticket medio-alto**, donde perder un lead de noche/finde duele en
plata concreta y el dueño ya vive respondiendo WhatsApp tarde:

1. **Barberías / peluquerías / estética** (turno + seña, mucho WhatsApp nocturno). ← faro inicial
2. **Talleres / gomerías / mecánica** (consultas de urgencia fuera de hora).
3. **Gastronomía con reservas / catering** (pedidos y reservas de noche y finde).
4. **Consultorios (odonto, kinesio, estética médica)** (turnos, alto valor por cliente).

Criterio de corte: (a) reciben mensajes fuera de horario, (b) el lead tiene valor > US$20, (c) el dueño
hoy pierde o contesta tarde. Empezar por **1 rubro** (barbería) para pulir guion + catálogo + agenda.

---

## Cómo demostrar los leads rescatados (el pitch que cierra)

El gancho no es "un chatbot", es **"la plata que se te escapa de noche"**. Demo en 3 pasos:

1. **Espejo en vivo:** con el guion del prospecto cargado, simulamos 3–4 conversaciones típicas de su
   rubro fuera de hora (la demo de `src/demo.ts` hace exactamente esto). El dueño ve a Fantasma
   responder, cotizar y agendar con la voz de su marca.
2. **Prueba de 2 semanas (piloto):** conectamos su WhatsApp solo en la franja noche/finde. No tocamos su
   horario comercial. Riesgo cero para él.
3. **Reporte del lunes:** al cierre del piloto le mostramos el reporte de "plata rescatada" — leads
   atendidos, cotizaciones enviadas, turnos agendados, señas cobradas. **Ese número cierra la venta y
   retiene.**

---

## Milestones

### M0 — Kickoff (hecho) · día 0
- [x] SPEC, ARQUITECTURA, pricing por uso (tope + excedente), scaffold del corazón con COGS medido.
- [x] Demo ejecutable input→output con cálculo de COGS y proyección de margen.

### M1 — Corazón productivo · días 1–5
- [ ] Cablear `LLMClaude` (Claude Sonnet real) con prompt caching del guion y salida estructurada.
- [ ] Validar COGS real medido vs supuesto conservador (0,18/0,30) en 20 conversaciones sintéticas.
- [ ] Persistencia (Postgres/SQLite): conversaciones, tickets, `UsoMensual`, eventos de COGS.
- [ ] Contador de conversaciones off-hours vs tope del plan + cálculo de excedente.

### M2 — Canal + pagos + agenda · días 5–10
- [ ] Integrar **WhatsApp Cloud API** (webhook entrada + envío; corte de franja horaria).
- [ ] Integrar **Mercado Pago** (link de seña + webhook de confirmación de pago).
- [ ] Agenda simple (Google Calendar o Sheet): leer slots + crear turno.
- [ ] Panel mínimo de tickets calientes para la mañana.

### M3 — Reporte del lunes + onboarding · días 10–14
- [ ] Generador del **reporte del lunes** (cron) → WhatsApp + email al dueño.
- [ ] Flujo de onboarding: relevar guion + catálogo + agenda de 1 cliente en < 1 hora (kit de setup).
- [ ] Guion pulido del rubro faro (barbería).

### M4 — Primer piloto pago · días 14–21
- [ ] Conseguir **2–3 barberías** conocidas para piloto pago (setup US$100–150 + primer mes).
- [ ] Conectar su WhatsApp en franja noche/finde. Monitorear COGS real y calidad de respuestas.
- [ ] Entregar el primer **reporte del lunes** → cerrar continuidad mensual.

### M5 — Repetible · días 21–45
- [ ] Convertir 2–3 pilotos en pagos recurrentes.
- [ ] Empaquetar el onboarding para vender sin fricción (checklist + plantilla de guion por rubro).
- [ ] Escalar a 10–15 clientes del mismo rubro (venta atomizada pero CAC bajo).

---

## Riesgos y mitigaciones

| Riesgo | Mitigación (ya en el diseño) |
|---|---|
| **Trampa de margen (COGS variable)** | Pricing por uso desde día 1: tope + excedente > COGS máx. Kill-switch por conversación. Prompt caching. |
| **Dependencia de Meta/WhatsApp** (baneos, política) | Solo inbound reactivo (nada de outbound masivo). Ventana 24h. Guion sin promos agresivas. |
| **Alucinación de precios** | El agente no inventa: si no está en catálogo → deja ticket. Salida estructurada + reglas. |
| **Comoditización (AI receptionist global)** | Moat local: español rioplatense + nicho franja noche + relación. Reporte del lunes como retención. |
| **Onboarding lento** | Kit de setup < 1h; arrancar por UN rubro para reusar guion. |

---

## Definición de "primer cliente pagando"
Una barbería con su WhatsApp conectado en franja noche/finde, pagando **Guardia Pro (US$249/mes)** +
setup, que recibió al menos **un reporte del lunes** con leads rescatados reales. Meta: **día 21**.
