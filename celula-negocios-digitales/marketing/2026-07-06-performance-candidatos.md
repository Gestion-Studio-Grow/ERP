# Análisis de Performance / Publicidad paga — 4 candidatos validados

> **Analista de Performance / Publicidad · Célula de Marketing y Publicidad — Gestión Studio Grow · 2026-07-06.**
> Pregunta única: **¿la publicidad paga PAGA** para Kudos, Testigo, Plantillería y Fantasma? Con CPL/CPC
> reales del rubro en Argentina/LATAM, modelados contra el LTV/ticket de cada negocio (unit economics de
> `ANALISIS-ECONOMICO-COMPLETO.md`). Sin sesgo del modelo, sin humo. Donde el paid es plata tirada, se dice.
> Tipo de cambio usado: **US$1 = $1.488,50 ARS (oficial)**. Todo LOCAL, no se tocó prod, git ni deploy.

---

## Cómo leer los números (metodología honesta)

- **CAC por canal = CPL ÷ tasa de conversión lead→cliente.** No confundir CPL (lo que sale traer un
  interesado) con CAC (lo que sale cerrar uno que paga). El CPL barato no sirve si no convierte.
- **Conversión lead→cliente (supuestos, con fuente):** B2B SaaS frío para pyme **5–10%**; búsqueda de
  alta intención **10–15%**; conversación por WhatsApp (lead ya "caliente", +40–80% de tasa lead→charla
  vs. formularios) **8–15%**; producto digital de compra directa se mide por **ROAS**, no por CAC de lead.
- **Regla de cierre:** un canal "paga" si **LTV ≥ 3× CAC** (estándar SaaS) o, en producto digital de pago
  único, si **ROAS ≥ break-even** (con 90–95% de margen, break-even ≈ **1,05–1,1×**).
- **Churn pyme 3–7%/mes** (43% de las bajas en los primeros 90 días) → los LTV largos se calculan con
  vida media conservadora, no optimista.

### Benchmarks base Argentina/LATAM 2025 (los que alimentan toda la tabla)

| Canal | Métrica AR/LATAM 2025 | Fuente |
|---|---|---|
| **Meta (Facebook/IG)** | CPC AR **US$0,23** prom. (rango 0,06–0,60) · CPM AR **US$3,74** · CPL lead-gen AR **~US$23** (>US$100 en rubros caros) · CPL FB global todas industrias **US$27,66** | superads.ai, WordStream |
| **Google Search** | CPC AR general **~US$2,10** · B2B/SaaS/servicios **~US$5,70** · home services **US$7,85** · **CPL Google prom. US$70,11** (+5,13% i.a.) | estudioantidoto, WordStream, LocaliQ |
| **Click-to-WhatsApp** | Abre ventana **72 h gratis** · lead click-to-chat en mercados emergentes **US$1–3** · formularios WhatsApp **−35% CPL** · **+40–80%** lead→conversación · CTR 15–80%, apertura 98% | Cliengo, Sendwo, business.whatsapp.com |
| **Mercado Libre Ads** | Modelo **CPC** (pagás por clic, depende de categoría) · presupuesto útil prueba **US$300–500/mes** · **ACOS = (1/ROAS)×100**, objetivo 15–20% si margen ~39% | oldfox.io, Nubimetrics, JaguarSheet |
| **Ecommerce ROAS Meta** | Prom. **2,87×** (−4% i.a.) · benchmark Meta 2,2× · low-ticket <US$75 funciona bien, apuntar **3,0×+** | Onramp, upcounting, Billo |
| **CAC B2B SaaS SMB** | **US$200–300** típico · B2B paid search CAC **US$802** (2025) · payback sano **12–18 meses** · LTV:CAC objetivo **3:1** | HelloMrLead, PoweredBySearch, FirstPageSage |

---

## 1) KUDOS — reseñas en piloto automático · ✅ el paid CIERRA (ajustado)

**Unit economics:** precio ~US$124/mes (prom. 99–149) + setup US$100–200 · margen **90–95%** →
GP ~US$114/mes · vida media a churn 5%/mes ≈ 20 meses → **LTV ≈ US$2.280** (≈ $3,39 M ARS). Aun a churn
7% (14 meses) → **LTV ≈ US$1.600**. Es el negocio de **mejor margen** del lote.

**El problema estructural del canal:** Kudos es un producto de **baja demanda de búsqueda**. El dueño de
un restaurante NO googlea "software para gestionar reseñas de Google" — no sabe que existe la categoría.
Eso **rompe Google Search como motor principal** (intención casi nula, y lo poco que hay compite con
CPC B2B de ~US$5,70 y CPL ~US$70 sobre un volumen ínfimo → no escala). El paid que sirve acá es de
**interrupción bien segmentada** (gastronomía, retail, estética, salud) que lleva a un **demo por WhatsApp**.

**Tabla CAC por canal (Kudos):**

| Canal | CPL AR | Conv. lead→cliente | **CAC** | LTV:CAC | ¿Cierra? |
|---|---|---|---|---|---|
| **Click-to-WhatsApp** (demo del bot que agenda) | ~US$15 | 8% | **~US$190** | ~12:1 | ✅ **ganador** |
| **Meta lead-gen** (interrupción segmentada) | ~US$25 | 7% | **~US$357** | ~6:1 | ✅ sí |
| **Google Search** (poca intención, no escala) | ~US$70 | 10% | **~US$500+** | ~4:1 pero techo bajo | ⚠️ marginal |
| **Mercado Libre Ads** | — | — | **N/A** | — | ❌ irrelevante (no es marketplace) |

**Canal ganador vs. perdedor:** gana **Click-to-WhatsApp + Meta** (interrupción → demo instantáneo).
Pierde **Google Search**: no hay a quién interrumpir buscando. **ML Ads no aplica.**

**Ángulos creativos que funcionan:** miedo a la reputación + prueba social. Ej.: *"3 reseñas de 1★ sin
responder te están costando clientes esta semana. Nosotros las respondemos por vos y te conseguimos las
de 5★."* Creativo de **antes/después del perfil de Google** (2,9★ → 4,6★). Métrica a mirar: **CAC vs.
payback** (con LTV US$2.000 el payback de un CAC US$300 es ~3 meses de suscripción: sanísimo) y **CPL del
demo agendado**, no impresiones.

**Qué NO hacer:** ❌ quemar plata en **Google Search de marca genérica** ("reseñas Google") esperando
demanda que no existe. ❌ campañas de **alcance/branding** (Kudos necesita leads, no likes). ❌ target
amplio sin filtro de rubro → traés curiosos que no tienen local. ❌ **ML Ads.**

**Veredicto: el paid CIERRA** (LTV:CAC 6–12:1 en los canales correctos), pero **el volumen lo pone el
outbound/WhatsApp, no la subasta de Google**. Empezar por Click-to-WhatsApp a gastronomía.

---

## 2) TESTIGO — parte de trabajo desde foto + audio · ❌ el paid NO CIERRA (plata tirada)

**Unit economics:** precio US$15–30/operario/mes; un contratista de 5 = US$75–150/mes · margen ~90%.
GP contratista (5 op) ~US$100/mes, vida media a churn 4% (es sticky) ≈ 25–28 meses → **LTV ≈ US$2.800**.
Pero el **operario solo** deja GP ~US$20/mes → **LTV ≈ US$550** (≈ $819 k ARS).

**El problema estructural del canal:** Testigo es un **nicho B2B chico, de bajo ARPU y difícil de
targetear**. Los fumigadores / plomeros / cuadrillas de control de plagas **no son una audiencia que Meta
o Google sepan segmentar con precisión** en AR → el targeting amplio infla el CPL 3–5×. Y aunque el CPL
fuera bueno, el ARPU del operario solo (US$22/mes) **no aguanta un CAC de adquisición pagada**. Ojo: el
CPC "home services" de US$7,85 es para **anuncios de plomeros que buscan clientes finales**, NO para
venderle software AL plomero — ese buscador casi no existe.

**Tabla CAC por canal (Testigo):**

| Canal | CPL AR (inflado por nicho) | Conv. | **CAC** | vs. LTV | ¿Cierra? |
|---|---|---|---|---|---|
| **Meta broad** (no sabe targetear fumigadores) | US$30–50 | 4% | **US$750–1.250** | Solo US$550 ❌ / Contratista US$2.800 apenas | ❌ no (solo) / ⚠️ inestable (contratista) |
| **Google Search hiper-nicho** ("software fumigación", "parte bromatología") | alto, volumen ínfimo | 8–10% | **US$400–800** | ⚠️ solo si cae contratista | ⚠️ el "menos malo" |
| **Click-to-WhatsApp** | mismo problema de targeting | 5% | **US$600+** | ❌ | ❌ |
| **Mercado Libre Ads** | — | — | **N/A** | — | ❌ irrelevante |

**Canal ganador vs. perdedor:** ninguno gana de verdad. El **menos malo** es **Google Search sobre
long-tail hiper-específico** (alta intención, pero volumen casi nulo → no mueve la aguja). **Meta amplio
es el perdedor claro: quema presupuesto contra una audiencia que no puede aislar.**

**Ángulos creativos (si se prueba igual):** gancho **regulatorio** (el ganchо real del negocio). Ej.:
*"¿Bromatología te pide el parte de fumigación? Sacalo con una foto y un audio, en PDF, en 2 minutos."*
Métrica: **CPL del contratista multi-operario** (no del solo) — si no baja de ~US$150, cortar.

**Qué NO hacer:** ❌ **Meta/Instagram de interrupción amplia** — es el caso más claro de **plata tirada**
del lote: audiencia no segmentable + ARPU que no la banca. ❌ pagar por leads de **operarios solos**
(LTV US$550 no soporta CAC pagado). ❌ competir en keywords de "plomero/fumigador" (esos buscan cliente
final, no software). El canal real de Testigo es **NO pagado**: cámaras del sector (CADIF/control de
plagas), gancho de bromatología, y venta directa a contratistas — ahí el CAC es ~0.

**Veredicto: el paid NO CIERRA.** El motor de Testigo es **regulatorio + cámaras + outbound vertical**,
no la publicidad. Reservar el presupuesto de ads para negocios con mejor economía de canal.

---

## 3) PLANTILLERÍA — plantillas normativa AR · ✅ el paid CIERRA (fino pero positivo)

**Unit economics:** pago **único** US$25–75 (prom. ~US$40) · COGS ~US$0 (solo fee pasarela ~5%) · margen
**90–95%**. Sin recurrencia real → **el "LTV" es casi el ticket**: ~US$40 × ~1,3 (recompra) ≈ **US$52**,
GP ~US$50. **Break-even ROAS ≈ 1,05–1,1×** (por el margen altísimo). Es el **único** de los cuatro donde
el paid puede vivir de compra directa, porque el margen perdona un ROAS bajo y el **CPC argentino es
baratísimo** (US$0,23 Meta / long-tail Google <US$1,50).

**Tabla CAC/ROAS por canal (Plantillería):**

| Canal | Costo tráfico AR | Conv. a compra | **CAC/venta** | ROAS a ticket US$40 | ¿Cierra? |
|---|---|---|---|---|---|
| **Google Search** long-tail ("plantilla monotributo excel") | CPC US$0,5–1,5 | 3–5% (alta intención) | **US$15–40** | ~1,0–2,7× | ✅ **ganador** (intención de compra pura) |
| **Meta** (creativo visual/demo de la planilla) | CPC US$0,23 | 1–2% (frío) | **US$15–30** | ~1,3–2,7× | ✅ sí (impulso, si el creativo muestra el producto) |
| **Mercado Libre Ads** (listar la plantilla como producto) | CPC categoría | compradores ya en modo compra | **variable** + fee ML ~13% | depende | ⚠️ secundario (fee ML come margen; entrega digital tosca) |
| **Click-to-WhatsApp** | bajo | — | — | — | ❌ no encaja (compra self-serve, no charla) |

**Canal ganador vs. perdedor:** gana **Google Search** — alguien que teclea *"plantilla control
monotributo"* **quiere comprar ahora**, y en AR ese long-tail es barato. **Meta** funciona como segundo
motor (impulso visual). **El perdedor es el ticket, no un canal:** a US$40 de pago único **no hay
recurrencia que amortice el CAC** → si el CAC se acerca a US$38 la venta deja centavos.

**Ángulos creativos:** **especificidad AR + ahorro de tiempo/miedo a AFIP.** Ej. Google: aviso exacto a
la keyword (*"Plantilla Monotributo 2026 — categorías, vencimientos y alertas. US$29, descarga
inmediata"*). Meta: video de 15" mostrando la planilla **auto-completando la recategorización**. Métrica:
**ROAS y AOV (ticket promedio)** — la palanca #1 es **subir el AOV con bundles** (pack de 3 plantillas
US$75) para agrandar el colchón sobre el break-even.

**Qué NO hacer:** ❌ vender **una sola plantilla de US$25 con Meta frío** sin bundle → el CAC se come el
margen aunque el ROAS parezca ≥1. ❌ campañas de **branding/alcance** (esto es respuesta directa pura).
❌ escalar presupuesto **antes** de tener AOV >US$50 y una landing que convierta ≥3% — si no, escalás
pérdidas. ❌ depender de ML Ads como canal primario (el ~13% de fee + la entrega digital le quitan la
gracia del margen 95%).

**Veredicto: el paid CIERRA, fino pero positivo** — el margen 95% + CPC argentino barato lo hacen
rentable **si y solo si** se sube el AOV con bundles/upsells. Google Search primero, Meta de apoyo.

---

## 4) FANTASMA — el "turno noche" de WhatsApp · ✅✅ el paid CIERRA (el mejor del lote para paid)

**Unit economics:** precio US$120–300/mes (prom. ~US$200) + fee/lead · margen **80–85%** (con pricing por
uso) → GP ~US$164/mes · vida media a churn 5% ≈ 18–20 meses → **LTV ≈ US$3.000** (≈ $4,47 M ARS). ARPU
alto + producto que se **auto-demuestra en el propio canal de venta** = el mejor encaje paid de los cuatro.

**La ventaja de canal única de Fantasma:** se **vende un producto de WhatsApp demostrándolo EN WhatsApp.**
El anuncio Click-to-WhatsApp abre chat con el **propio bot Fantasma**, que cotiza/agenda en vivo → el
prospecto *experimenta el producto* como demo, con la ventana de **72 h gratis** de Meta y fricción cero.
Ningún otro candidato tiene esta sinergia canal-producto.

**Tabla CAC por canal (Fantasma):**

| Canal | CPL AR | Conv. lead→cliente | **CAC** | LTV:CAC (LTV US$3.000) | ¿Cierra? |
|---|---|---|---|---|---|
| **Click-to-WhatsApp** (auto-demo del bot) | US$10–20 | 10% | **~US$100–200** | **15:1 a 30:1** | ✅ **ganador claro** |
| **Meta lead-gen** | ~US$23 | 8% | **~US$290** | ~10:1 | ✅ sí |
| **Google Search** ("chatbot whatsapp negocio", "atención automática") | ~US$70 | 12% (alta intención) | **~US$580** | ~5:1 | ✅ sí, pero más caro |
| **Mercado Libre Ads** | — | — | **N/A** | — | ❌ irrelevante |

**Canal ganador vs. perdedor:** gana **Click-to-WhatsApp** por goleada (encaje temático + auto-demo +
CAC bajísimo). **Meta lead-gen** segundo. **Google Search cierra igual** (hay intención real: Artics/Aoki
rankean por "chatbot IA empresas Argentina") pero es **el más caro** (CPC B2B ~US$5,70). **ML no aplica.**

**Ángulos creativos:** **plata que se escapa de noche.** Ej.: *"Anoche te escribieron 7 clientes por
WhatsApp y nadie respondió. Nuestro empleado de IA los atiende, cotiza y te los deja anotados para la
mañana."* Rematar con el **reporte del lunes** de "la plata que se hubiera escapado". El propio anuncio
que **inicia la charla con el bot** ES la mejor creatividad (probá el producto ahora). Métrica: **CAC vs.
payback** (payback de un CAC US$150 ≈ <1 mes de suscripción) y **% de leads del bot que agendan demo**.

**Qué NO hacer:** ❌ formularios estáticos de Meta cuando podés mandar el clic **directo al bot** (perdés
el auto-demo y la ventana gratis de 72 h). ❌ arrancar por **Google Search** (funciona, pero CAC 3–5×
más caro que WhatsApp — dejarlo para escalar, no para validar). ❌ tarifa **flat**: si el creativo promete
"ilimitado" atraés heavy users que funden el margen (el pricing por uso también debe estar en el mensaje).
❌ **ML Ads.**

**Veredicto: el paid CIERRA holgado — es el candidato con MEJOR economía de publicidad.** LTV:CAC de
15–30:1 vía Click-to-WhatsApp, con auto-demo y ventana gratis. Es donde primero pondría presupuesto.

---

## Tabla resumen — CAC del canal ganador vs. LTV/ticket

| Negocio | LTV / ticket | Canal ganador | CAC ganador | LTV:CAC / ROAS | ¿Paid cierra? |
|---|---|---|---|---|---|
| **Fantasma** | LTV ~US$3.000 | **Click-to-WhatsApp** | ~US$100–200 | **15–30:1** | ✅✅ **sí, el mejor** |
| **Kudos** | LTV ~US$2.000 | **Click-to-WhatsApp / Meta** | ~US$190–357 | **6–12:1** | ✅ **sí** (Google no, sin demanda de búsqueda) |
| **Plantillería** | ticket ~US$40 (único) | **Google Search + Meta** | ~US$15–40/venta | **ROAS 1,0–2,7×** | ✅ **sí, fino** (exige subir AOV con bundles) |
| **Testigo** | LTV US$550 (solo) / US$2.800 (contratista) | ninguno real; "menos malo" Google long-tail | US$400–1.250 | **<3:1** en el caso base | ❌ **no** (motor = regulatorio + cámaras) |

**Lectura del analista (plata pura):** el paid rinde **cuando el producto se auto-demuestra en su canal
de venta** (Fantasma en WhatsApp) o **cuando hay intención de búsqueda real** (Plantillería en Google).
Rinde **a medias** cuando hay que **crear la demanda** por interrupción segmentada pero el LTV la banca
(Kudos). Y **no rinde** cuando la audiencia es un **nicho B2B chico no segmentable con ARPU bajo**
(Testigo) — ahí la publicidad es plata tirada y el motor es regulatorio/cámaras/outbound. Argentina juega
a favor: **CPC/CPM de los más baratos del mundo** (CPC Meta US$0,23 vs. US$1,13 global), así que el que
tenga encaje de canal exprime el peso; el que no lo tenga no se salva por CPM barato.

---

## Fuentes (URLs)

**Meta / Facebook Ads — costos Argentina 2025**
- SuperAds — Facebook Ads CPC Benchmarks Argentina 2025 (CPC prom. US$0,23): https://www.superads.ai/facebook-ads-costs/cpc-cost-per-click/argentina
- SuperAds — Facebook Ads CPM Benchmarks Argentina 2025 (CPM prom. US$3,74): https://www.superads.ai/facebook-ads-costs/cpm-cost-per-mille/argentina
- WordStream — Facebook Ads Benchmarks 2025 (CPL lead-gen prom. US$27,66): https://www.wordstream.com/blog/facebook-ads-benchmarks-2025
- Argency — Facebook Ads: costos y tendencias en campañas (AR): https://argency.com/facebook-ads-costos-y-tendencias-globales-en-campanas-publicitarias/
- Arteria Creativa — Cuánto invertir en Facebook Ads 2026 (AR): https://arteriacreativa.com.ar/facebook-ads/cuanto-invertir-en-facebook-ads/

**Google Ads — costos Argentina / benchmarks**
- Estudio Antídoto — Google Ads en Argentina: cuánto cuesta y cuándo conviene: https://estudioantidoto.com.ar/google-ads-argentina-cuanto-cuesta/
- Codexia — Cuánto cuesta Google Ads para una PyME argentina 2026: https://codexia.com.ar/servicios/cuanto-cuesta-google-ads-argentina-2026/
- AdWorld — Costos de Google Ads para generar leads en Argentina: https://adworld.com.ar/google-ads-costos-leads
- WordStream — 2025 Google Ads Benchmarks (CPL prom. US$70,11, +5,13% i.a.): https://www.wordstream.com/blog/2025-google-ads-benchmarks
- LocaliQ — 2025 Search Ad Benchmarks for Home Services (CPC US$7,85; CTR pest control 5,54%): https://localiq.com/blog/home-services-search-advertising-benchmarks/
- Searchlight — Google LSA cost per lead by trade 2026: https://searchlightdigital.io/google-local-service-ads-cost-per-lead/

**Click-to-WhatsApp / WhatsApp Ads**
- Cliengo — Click-to-WhatsApp Ads: guía completa para generar leads 2026 (ventana 72 h gratis): https://guiawabusiness.cliengo.com/click-to-whatsapp
- Sendwo — WhatsApp Click-Through Rate Benchmarks 2025 (CTR 15–80%, apertura 98%): https://sendwo.com/blog/whatsapp-click-through-rate-benchmarks-report/
- business.whatsapp.com — Advertising metrics / Ads that click to WhatsApp: https://business.whatsapp.com/blog/advertising-metrics
- Chattigo — WhatsApp Business: cuánto cobra por mensaje 2026 (LATAM): https://blog.chattigo.com/whatsapp-business/cuanto-cobra-whatsapp-business-por-mensaje
- Simla — Precios WhatsApp Business API 2026 LATAM (msg marketing US$0,015–0,063): https://www.simla.com/blog/precios-whatsapp-business-api

**Mercado Libre Ads**
- Old Fox — Cuánto invertir en Mercado Ads 2025 (presupuesto prueba US$300–500/mes): https://www.oldfox.io/blog/cuanto-invertir-en-mercado-ads
- Jaguar Sheet — ACOS y ROAS en Product Ads de Mercado Libre (ACOS=(1/ROAS)×100): https://jaguarsheet.com/es/blog/acos-roas-product-ads-mercado-libre
- Nubimetrics — Mercado Ads: cómo funciona la publicidad en Mercado Libre: https://academia.nubimetrics.com/mercado-ads
- Mercado Libre Developers — Product Ads (modelo CPC): https://developers.mercadolibre.com.ar/pads-read

**ROAS ecommerce / low-ticket (Plantillería)**
- Onramp Funds — What is a good ROAS for eCommerce 2025 (low-ticket <US$75): https://www.onrampfunds.com/resources/good-roas-ecommerce-2025
- Upcounting — Average eCommerce ROAS dropped to 2.87 in 2025: https://www.upcounting.com/blog/average-ecommerce-roas
- Billo — What is a good ROAS (video ROAS 2,41×): https://billo.app/blog/what-is-a-good-roas/

**CAC / LTV B2B SaaS (Kudos, Fantasma, Testigo)**
- HelloMrLead — CAC in B2B SaaS 2025 Benchmarks (SMB US$200–300): https://www.hellomrlead.com/en/cac-in-b2b-saas-2025-benchmarks/
- Powered by Search — B2B SaaS CAC Benchmarks (paid search CAC US$802): https://www.poweredbysearch.com/learn/b2b-saas-cac-benchmarks/
- First Page Sage — B2B SaaS Customer Acquisition Cost 2025 Report (payback 12–18 m): https://firstpagesage.com/reports/b2b-saas-customer-acquisition-cost-2024-report/
- Flyweel — Cost Per Lead Benchmarks 2025 (20+ industrias): https://www.flyweel.co/blog/lead-gen-cpl-cac-benchmark-index-2025

*Nota: los costos publicitarios y el tipo de cambio AR cambian rápido (CPM Meta AR subió ~95% dentro de
2025). Validar CPL/CPC reales con una campaña piloto de US$300–500 antes de escalar presupuesto.
Documento local; no se tocó producción, git ni deploy.*
