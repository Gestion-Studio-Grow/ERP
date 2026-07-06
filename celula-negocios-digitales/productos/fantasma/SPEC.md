# Fantasma — SPEC del MVP

> **Fantasma = "el turno noche de WhatsApp".** Un empleado IA que atiende el WhatsApp del negocio
> **fuera de horario** (20–8h y fines de semana): responde, cotiza, agenda y deja **tickets calientes**
> para la mañana. El lunes entrega el reporte de *"la plata que se hubiera escapado"*.
>
> **Regla de oro del negocio (no negociable):** el COGS es **conversacional y lineal**
> (US$0,15–0,30 por conversación). En alto volumen trepa a US$60–120/cliente/mes. Por eso el pricing
> es **flat con tope de conversaciones + excedente por uso**, nunca flat puro. Diseñado desde el día 1
> (ver §4).

Estado: **kickoff de desarrollo** · Fecha: 2026-07-06 · Owner: célula Studio Grow
Reúso de stack: WhatsApp + agente IA + Mercado Pago (el de caja más rápida de la ronda).

---

## 1. Qué resuelve (el dolor y el framing)

La pyme argentina vende por WhatsApp. Cuando cierra (noche/finde), los mensajes entran igual: consultas,
pedidos de precio, gente lista para comprar. Sin nadie del otro lado, **esos leads se enfrían o se van a
la competencia que sí contestó**. Fantasma cubre esa franja.

- **Framing de venta:** "contratá un turno noche", **no** "un chatbot". Se vende como un empleado que
  cubre las horas que el dueño no puede.
- **Prueba de valor:** el **reporte del lunes** con la plata rescatada (leads atendidos, cotizaciones
  enviadas, turnos agendados fuera de hora). Es el gancho de retención.

### Franja horaria (configurable por cliente)
- Default: **L–V 20:00–08:00** + **sábado y domingo completos** (zona horaria del cliente).
- En horario comercial el agente está **apagado** (o en modo "derivar a humano"): el cliente atiende él.
  Fantasma solo trabaja el turno contratado — esto **acota el COGS** y hace la venta más barata.

---

## 2. El flujo de atención (el corazón del MVP)

Máquina de estados de una conversación off-hours. El agente (Claude Sonnet con guion por cliente)
recorre estas etapas y **siempre** termina en una de dos salidas: resuelto o ticket caliente.

```
  [entra mensaje fuera de horario]
             │
             ▼
      1. SALUDO / IDENTIFICAR  ── ¿qué necesita? (intención)
             │
   ┌─────────┼───────────────┬────────────────┐
   ▼         ▼               ▼                ▼
2.CONSULTA  3.COTIZACIÓN   4.AGENDAR        (fuera de alcance /
(responde   (precio desde  (propone slot,   pedido sensible /
 con guion  catálogo +     toma seña por    enojo / humano)
 y catálogo)reglas)        MP si aplica)         │
   │         │               │                  ▼
   └─────────┴───────┬───────┘            5. ESCALAR + TICKET
                     ▼                         (deja ticket
              ¿resuelto?  ── sí ──▶ cierre      caliente para
                     │                          la mañana)
                     no ─────────────────────────┘
```

**Detalle por etapa:**

1. **Saludo / identificar.** Detecta que es fuera de horario, saluda con la voz de marca, entiende la
   intención (consulta, precio, turno, reclamo). Si es cliente conocido (teléfono en historial), lo
   reconoce.
2. **Consulta.** Responde preguntas frecuentes desde el **guion del cliente** (horarios, ubicación,
   formas de pago, stock, políticas). Si no sabe → no inventa: deja ticket.
3. **Cotización simple.** Arma precio desde el **catálogo + reglas** del cliente (ítem, cantidad,
   variantes, envío). Da un rango o precio cerrado según config. **Nunca** promete lo que no está en
   catálogo → deriva.
4. **Agendar.** Propone slot disponible (agenda del cliente), confirma, y si el cliente pide **seña**,
   genera link de Mercado Pago y confirma al pago. Deja el turno cargado para la mañana.
5. **Escalar / dejar ticket.** Cualquier caso fuera de alcance, sensible, con enojo, o que el cliente
   explícitamente pida un humano → **corta con gracia** ("mañana a primera hora te contesta el equipo")
   y **deja un ticket caliente** con: contacto, resumen, intención, urgencia, y qué se prometió.

**Salidas obligatorias:** toda conversación cierra como `RESUELTA` (respondida/cotizada/agendada) o
`TICKET` (escalada). Nunca queda en el aire.

---

## 3. El reporte del lunes ("la plata que se hubiera escapado")

Se genera automático el lunes a la mañana (o configurable) y se manda al dueño por WhatsApp + email.
Es **el producto emocional** — lo que hace que no den de baja.

Contenido:
- **Conversaciones atendidas fuera de hora** (total y por franja).
- **Leads rescatados**: contactos nuevos que dejaron intención de compra.
- **Cotizaciones enviadas** y monto total cotizado.
- **Turnos agendados** fuera de hora (y señas cobradas por MP).
- **Tickets calientes pendientes** para arrancar la semana.
- **Estimación de "plata rescatada"**: monto cotizado + valor de turnos agendados + señas cobradas.
  (Métrica declarada como *estimada*, sin sobre-prometer — evita fricción de atribución.)
- **Consumo del plan**: conversaciones usadas vs tope, y excedente proyectado (transparencia de billing).

---

## 4. Pricing — flat con TOPE + EXCEDENTE (blindaje de margen)

**El COGS por conversación off-hours es el número a vigilar.** Supuesto de costeo (medido por el
motor de COGS, ver ARQUITECTURA.md §5):

- **COGS típico:** ~US$0,18 / conversación (12 turnos, con prompt caching del guion de marca).
- **COGS peor caso:** ~US$0,30 / conversación (conversación larga, catálogo grande, sin cache).

### Planes (cobro en USD — liberado desde AR en 2025)

| Plan | Precio/mes | Conversaciones incluidas* | Excedente/conv | Fee lead calificado** |
|---|---|---|---|---|
| **Guardia Básica** | **US$120** | 100 | US$1,00 | opcional US$2 |
| **Guardia Pro** | **US$249** | 250 | US$0,80 | opcional US$2 |
| **Guardia Full** | **US$399** | 500 | US$0,65 | opcional US$1,50 |

\* Solo cuentan las **conversaciones off-hours** (el turno contratado). Las de horario comercial no,
porque el agente está apagado.
\** Fee por lead **opcional / a la carta** (no default). Se activa por cliente si quiere modelo mixto.

### Por qué estos números protegen el margen

Margen bruto (antes de plataforma fija ~US$50–150/mes prorrateada entre todos los clientes):

| Plan | COGS al tope (peor US$0,30) | Margen al tope | COGS típico (US$0,18) | Margen típico |
|---|---|---|---|---|
| Básica (100) | US$30 | **75%** | US$18 | **85%** |
| Pro (250) | US$75 | **70%** | US$45 | **82%** |
| Full (500) | US$150 | **62%** | US$90 | **77%** |

**El tope protege la base flat; el excedente protege el volumen.** Claves de diseño:

1. **Excedente > COGS máximo siempre.** US$0,65–1,00 de excedente vs US$0,30 de COGS peor caso =
   **markup 2,2×–3,3×**. Un cliente que se pasa del tope **nunca** te deja en rojo; cada conversación
   extra es rentable.
2. **Kill-switch de margen por conversación.** Tope de **turnos por conversación** (default 25). Si una
   charla se pasa (troll, loop, cliente eterno), el agente **escala y deja ticket** en vez de quemar
   tokens. Acota el COGS peor caso por conversación.
3. **Prompt caching del guion de marca** (0,1× en lecturas) → baja el COGS típico ~30–40%.
4. **WhatsApp casi gratis inbound:** los *service messages* dentro de la ventana de 24h que abre el
   cliente son gratis; el COGS de WhatsApp solo pesa si hacemos outbound marketing (no en el MVP).

### Break-even
~**25 clientes** a ticket promedio ~US$200 = **US$5.000/mes**. Time-to-cash 2–3 semanas por reúso de stack.

### Setup opcional
Kit de arranque (relevar guion + catálogo + agenda + voz de marca): **US$100–150 one-time**. Baja el CAC
percibido y acelera el onboarding.

---

## 5. Qué NO entra en el MVP (alcance cerrado)

- ❌ **Voz / llamadas.** Solo WhatsApp texto. La voz multiplica el COGS 15–30× → otro producto.
- ❌ **Atención 24/7 completa.** Solo el turno contratado (noche/finde). Vender "reemplazá tu recepción"
  es más caro y más lento; el wedge es la franja.
- ❌ **Campañas outbound de marketing.** Nada de mandar plantillas masivas (dispara COGS de WhatsApp y
  riesgo de baneo Meta). Fantasma es **reactivo** (el cliente inicia).
- ❌ **Integraciones profundas** (ERP, e-commerce, CRM del cliente). Catálogo y agenda se cargan en
  formato simple (Sheet/JSON). Integraciones = fase 2.
- ❌ **Multi-idioma.** Español rioplatense nativo (es el wedge). Sin i18n.
- ❌ **Cobro total del pedido.** Solo **seña** por MP para reservar turno. La venta completa la cierra
  el humano en la mañana.
- ❌ **Pagos que no sean Mercado Pago.** MP nativo AR, nada de Stripe en el MVP.

---

## 6. Criterios de aceptación del MVP

- [ ] El agente responde, cotiza y agenda dentro del guion de **1 cliente faro** sin alucinar precios.
- [ ] Toda conversación cierra en `RESUELTA` o `TICKET` (nunca en el aire).
- [ ] El tope de turnos por conversación corta y escala (kill-switch de margen).
- [ ] El contador de conversaciones off-hours vs tope funciona y calcula excedente.
- [ ] El motor de COGS reporta el costo real por conversación (base del billing por uso).
- [ ] El reporte del lunes se genera con las métricas de §3.
- [ ] Seña por MP: genera link y confirma al pago.
