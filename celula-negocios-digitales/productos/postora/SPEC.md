# Postora — SPEC del MVP

> **Postora = el community manager con IA del comercio de barrio.** Arma el **plan de contenido del
> mes** (calendario de posteos) **en la voz y la estética de la marca**, y **ata cada posteo a una
> acción medible** (link de WhatsApp taggeado o código de promo). A fin de mes entrega el **Reporte de
> Resultados**: *"estos posteos te trajeron N conversaciones y $X en ventas"*. Cobro por **suscripción
> Mercado Pago en pesos, US$29–59/mes**, self-serve.
>
> **Reglas de oro del negocio (no negociables):**
> 1. **El diseño/curaduría del estudio ES el producto** — sin eso, competís contra Canva/Meta gratis y perdés.
> 2. **Unit economics blindados desde el día 1** — jamás flat sobre un agente sin límite: tope de posteos
>    por tier, model routing (Haiku/Sonnet), prompt caching del Kit de Marca, imagen IA por crédito.
> 3. **Ata el contenido a una métrica de negocio** — sin ROI medible, el comercio de barrio churnea a los 60 días.

Estado: **kickoff de desarrollo** · Fecha: 2026-07-07 · Owner: Célula de Negocios Digitales (Studio Grow)
Reúso de stack: **contenido IA + WhatsApp + Mercado Pago** (mismo bolsillo que Kudos y Fantasma).

— Elaborado por GSG.

---

## 1. Qué resuelve (el dolor y el framing)

El comercio de barrio sabe que "hay que estar en las redes", pero **no tiene tiempo ni gusto** para
hacerlo bien: postea salteado, feo, sin constancia, y no ve que sirva. Las opciones que tiene hoy son
malas: un freelance junior a $150–250k ARS/mes que le hace "12 posteos con ChatGPT + Canva", o hacerlo
él mismo (no lo hace). **Postora es el CM que sí tiene el gusto del estudio y la constancia de una
máquina, a precio de suscripción.**

- **Framing de venta:** *"tu community manager, sin contratar a nadie"* — no "una app de posteos". Se
  vende como un **servicio gestionado** con la marca del estudio detrás (el gusto es el diferencial).
- **Prueba de valor:** el **Reporte de Resultados** mensual con conversaciones y ventas atribuidas. Es el
  gancho de retención — lo que hace que no den de baja (§3).

### Por qué Postora y no "otro generador de posteos"

El red-team fue durísimo con esta categoría, y con razón. Postora **solo existe si desactiva los tres
tiros letales** — y todo el MVP está diseñado alrededor de eso:

| Desafío letal (red-team) | Antídoto que trae el MVP |
|---|---|
| **1. Contenido IA comoditizado a cero** (ChatGPT+Canva, Meta lo regala) | El **Kit de Marca** (paleta, tipografía, tono, do/don't, plantillas) **manda cada posteo** → sale en la marca, consistente, curado. El *gusto del estudio* es el producto y el moat, no la generación cruda. |
| **2. Baja disposición de pago + churn brutal** (corta a los 60 días) | Suscripción **MP en pesos sin fricción** + **servicio gestionado** (el dueño no hace nada) + el reporte de ROI que retiene. |
| **3. No hay ROI medible** ("posteos lindos" ≠ plata) | **Cada posteo lleva una CTA rastreable** (WhatsApp taggeado / código de promo) → el **Reporte de Resultados** ata contenido a **conversaciones y ventas atribuidas**. Misma jugada que Kudos (estrellas→ventas) y Fantasma (plata rescatada). |

---

## 2. El flujo (el corazón del MVP)

```
   [Kit de Marca del comercio]  ──(autorización del cliente, ADR generador-preset)
             │  (paleta, tipografía, tono, do/don't, WhatsApp, oferta)
             ▼
   1. IDEACIÓN (Haiku, Kit cacheado)  ── ángulos del mes por rubro + temas del dueño
             │
             ▼
   2. Por cada idea:
        ├─ COPY final en voz de marca  (Sonnet, Kit cacheado)
        ├─ PLANTILLA brandeada         (se rellena con foto del comercio → COGS imagen ~0)
        └─ CTA RASTREABLE              (wa.me taggeado / código de promo)  ◀── ata a plata
             │
             ▼
   3. PLAN MENSUAL calendarizado + COGS medido  →  el dueño revisa y publica
             │
   ...durante el mes: eventos de atribución (WhatsApp / mostrador) por tag...
             ▼
   4. REPORTE DE RESULTADOS  ── alcance → clics → conversaciones → ventas atribuidas
```

**Detalle por paso (ver `src/generador.ts`):**

1. **Ideación.** Con el Kit de Marca cargado, propone los ángulos del mes según el **rubro** (gastronomía,
   estética, indumentaria, almacén, servicios) y los **temas** que sugiera el dueño. Barato: lo hace Haiku.
2. **Copy final.** Redacta el caption **en la voz de la marca** (criollo, cálido, local — no jerga de
   modelo) + hashtags. Lo hace Sonnet, con el Kit **cacheado** (0,1×).
3. **Plantilla + CTA.** Elige la plantilla visual brandeada que matchea el objetivo y construye la **CTA
   rastreable** con un `tag` único de campaña.
4. **Plan + reporte.** Calendariza los posteos en el mes y mide el COGS real. Durante el mes, los eventos
   (clic al WhatsApp, conversación, venta) se atribuyen por `tag` y alimentan el **Reporte de Resultados**.

**Salida obligatoria:** todo posteo cierra con **copy + plantilla + hashtags + CTA rastreable**. Ningún
posteo sale sin su acción medible — es lo que hace defendible el valor.

---

## 3. El Reporte de Resultados ("no son posteos lindos, es plata")

Se genera a fin de mes y se manda al dueño por WhatsApp + email. Es **el producto emocional** — lo que
frena el churn. Contenido (ver `src/metricas.ts`):

- **Posteos publicados** en el mes.
- **Clics al WhatsApp** (desde los links taggeados).
- **Conversaciones abiertas** — total y **por posteo** (la métrica que el dueño entiende: *"cuántos me
  escribieron"*).
- **Ventas atribuidas** — declaradas por el vecino (código de promo / *"¿cómo nos conociste?"*), marcadas
  como **atribuidas** sin sobre-prometer causalidad (evita la fricción de atribución).
- **Top posteos del mes** — los que más movieron, para repetir la fórmula el mes que viene.

---

## 4. Pricing — flat con TOPE DE POSTEOS + excedente + créditos de imagen (blindaje)

El **COGS de texto por posteo es de centavos** (ideación Haiku + copy Sonnet, Kit cacheado — medido en
`src/routing.ts`), así que el flat **no** se funde por el copy. El riesgo real es **(a)** posteos
ilimitados y **(b)** generación de imagen IA ilimitada. Por eso el pricing es **flat con tope duro**:

| Tier | Precio/mes | Posteos incluidos* | Excedente/posteo | Imágenes IA incl. | Crédito imagen extra |
|---|---|---|---|---|---|
| **Barrio** | **US$29** | 12 | US$1,50 | 0 | US$0,50 |
| **Activo** | **US$45** | 20 | US$1,20 | 4 | US$0,40 |
| **Marca** | **US$59** | 30 | US$1,00 | 10 | US$0,35 |

\* Tope duro. Se cobra en **USD** (facturable como export de servicios); al comercio de barrio se le cobra
el **equivalente en pesos por Mercado Pago**.

### Por qué estos números protegen el margen (ver `src/planes.ts` + tests)

1. **Excedente por posteo >> COGS de texto por posteo.** US$1,00–1,50 de excedente vs ~US$0,006 de COGS =
   **markup >150×**. Un cliente que se pasa del tope **nunca** te deja en rojo.
2. **Imagen IA por crédito, nunca bundle ilimitado.** La generación de imagen es el driver de COGS más
   peligroso (~US$0,05/imagen). En el MVP el default es **plantilla brandeada** (COGS ~0); la imagen IA es
   un **add-on medido** que se cobra **por encima de su costo**.
3. **Model routing.** Haiku hace la ideación/hashtags (barato, volumen); Sonnet solo el copy final
   (calidad donde se ve). Opus **nunca** en el loop de producción.
4. **Prompt caching del Kit de Marca** → el bloque grande y estable se paga a 0,1× en cada generación.
5. **Kill-switch por generación** (tope de tokens de salida) → cota superior dura al COGS por posteo.

### Break-even

~**110–170 comercios** a ticket ~US$40/mes = **US$4.400–6.800/mes**. Time-to-cash: semanas (self-serve MP).

### Setup opcional

Kit de arranque (relevar marca + cargar Kit + primer plan): **US$50–100 one-time**. Baja el CAC percibido.

---

## 5. Qué NO entra en el MVP (alcance cerrado)

- ❌ **Publicación automática en Meta/Instagram.** El MVP **entrega el plan** (copy + arte + CTA) para que
  el dueño publique. Auto-publicar mete API de Meta, riesgo de baneo y soporte → fase 2.
- ❌ **Generación de imagen IA por default.** Default = plantilla brandeada (COGS ~0). Imagen IA = add-on
  medido por crédito. Nunca ilimitada.
- ❌ **Video / reels.** Multiplica el COGS y la complejidad → otro producto.
- ❌ **Multi-idioma.** Español rioplatense nativo (es el wedge). Sin i18n.
- ❌ **Gestión de comentarios / DMs.** Eso es Fantasma (turno noche de WhatsApp). Postora **produce**, no
  atiende. Se venden juntos, no se mezclan.
- ❌ **Pauta / ads management.** Contenido orgánico. La pauta es otra venta.
- ❌ **Pagos que no sean Mercado Pago.** MP nativo AR, nada de Stripe en el MVP.

---

## 6. Criterios de aceptación del MVP

- [x] Genera un **plan mensual** de N posteos (N = tope del tier) en la **voz de marca** del Kit.
- [x] Cada posteo tiene **copy + plantilla brandeada + hashtags + CTA rastreable** con `tag` único.
- [x] El **model routing** (Haiku ideación / Sonnet copy) y el **prompt caching** del Kit funcionan.
- [x] El **motor de COGS** reporta el costo real por plan y **por modelo** (base del pricing por uso).
- [x] El **tope de posteos + excedente + créditos de imagen** calcula factura y margen sin dejar rojo.
- [x] El **Reporte de Resultados** atribuye eventos por `tag` y agrega conversaciones/ventas.
- [ ] Cablear `LLMClaude` (Haiku + Sonnet reales) — **§C** (gasto de tokens en prod, se eleva).
