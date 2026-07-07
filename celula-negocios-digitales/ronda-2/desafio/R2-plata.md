# 💀 R2 — RED-TEAM · Ataque de PLATA y EJECUCIÓN a los 10 sobrevivientes

> **Fecha: 2026-07-06.** Soy R2, el escéptico de plata del red-team. Mi hipótesis por defecto: **los
> números están inflados hasta que se demuestre lo contrario.** Ataco unit economics, CAC, tiempo al
> primer peso, capacidad real de un estudio chico de construir+vender+operar a la vez, y la realidad
> fiscal/cobro AR. Research web 2025-2026, fuentes al final. Todo lo que digo se puede verificar.

---

## Marco de ataque (los 5 cuchillos que aplico a cada negocio)

1. **COGS real vs. precio flat.** Tokens de texto son baratos; la **voz cuesta $0.13-0.31/min todo
   incluido** (Retell/Vapi con LLM+STT+TTS+telefonía), no los $0.07-0.15 que asume B2 — subestima 2×.
   Vender flat sobre un agente que quema tokens funde el margen en heavy users. [1]
2. **CAC y tiempo al primer peso.** Un estudio chico **no tiene fuerza comercial ni audiencia**. Sin
   audiencia, ni una plantilla ni una newsletter se venden solas. El CAC real está escondido.
3. **La trampa del "pasivo" y del "activo que no escala".** Pasivo = casi siempre trabajo disfrazado
   con lag de 12-24 meses. Activo done-for-you = **se come el tiempo del equipo** y no escala más allá
   de N clientes que un humano puede atender.
4. **Fiscal/cobro AR.** Buena noticia 2025: se liberó el cobro de export de servicios (factura E), **sin
   tope ni retención bancaria** — desaparece la fricción USD para lo global. [2] Mala: en cobro local,
   **Mercado Pago retiene IIBB sobre el bruto** en casi todas las jurisdicciones (monotributista se
   salva de IVA/Ganancias, RI paga 1-3%). [3][4] El neto no es el precio de lista.
5. **Churn SMB.** El benchmark 2025 es brutal: **3-7% mensual (31-58% anual)**, y **43% de las bajas
   ocurren en los primeros 90 días.** [5] Todo LTV que asuma retención larga en pyme está inflado.

---

# 🟦 LADO PASIVO (5)

## 1) Plantillería — plantillas Notion/Sheets localizadas AR

**El ataque.** El COGS es realmente cero (centavos de IA por plantilla) — eso es verdad y es lo mejor
del lote. El problema **no es el margen, es la distribución**, y A2 lo minimiza como "riesgo (a)".
El research es unánime y despiadado: Gumroad/Lemon **no te dan tráfico orgánico**; la enorme mayoría
de vendedores factura poco y "pensás en abandonar todos los días los primeros meses". El caso feliz de
"US$1.800 en un mes" viene con un activo invisible: **~4.000 seguidores ya construidos.** [6][7] Un
estudio sin audiencia arranca de cero: para vender 37 plantillas/mes a ~US$27 necesitás miles de
visitas calificadas, y eso o lo pagás (ads) o lo laburás (contenido orgánico durante meses). El
"pasivo" acá es real recién **después** de un trabajo de marketing muy no-pasivo.

**¿Cierra la plata?** Sí, si y solo si el estudio trata la distribución como el producto. COGS ~0,
cobro global sin fricción (Lemon Squeezy MoR liquida en USD, ~5%+tarjeta; el cambio fiscal 2025 hace
que traer esos USD ya no duela). [2] El techo por SKU es bajo pero **apila**: 8-10 plantillas AR ×
audiencia propia = negocio real. El riesgo de piratería es secundario frente al de "nadie te encuentra".

**Qué tendría que ser verdad:** que el estudio ya tenga (o construya en 3-6 meses) un canal orgánico
propio (IG/TikTok de nicho AR). Sin eso, es un catálogo muerto en una vitrina que nadie visita.

**Veredicto: 🟢 SOBREVIVE** (con la condición de que la distribución sea prioridad #1, no #6).

---

## 2) El Data Semanal — newsletter faceless de finanzas AR

**El ataque.** Acá el número inflado es **el tiempo/capital para llegar a los 20-25k subs** que hacen
falta para US$1k/mes. A2 dice "12-24 meses orgánico" y lo deja pasar. Hagamos la cuenta con paid,
porque el orgánico a esa escala es una lotería: **el costo de adquirir un suscriptor por Meta es
US$0.65-3.50** (y en finanzas, nicho competido, tirá a la banda alta). [8] 20.000 subs × ~US$2 =
**US$40.000 de pauta** para recién empezar a facturar ~US$600/envío. Eso es capital de riesgo, no
"ingreso pasivo". Y ojo: el CPM AR consumer real (US$20-45, no los US$70-180 B2B EEUU que A2 ya ajustó
bien) hace que el payback de esa pauta sea de **muchos meses**. Además **es semi-pasivo**: producción
semanal con humano en el loop → es un trabajo con sueldo diferido.

**¿Cierra la plata?** Como negocio standalone de corto plazo, **no**. El activo (lista propia, inmune
al AIO) es estratégicamente el mejor del lote, pero es el **más lento y más caro de arrancar**. El
tiempo al primer peso serio es 12-18 meses. Un estudio chico se descapitaliza esperando.

**Qué tendría que ser verdad:** que exista un feeder de subs a costo casi-cero (las calculadoras #3
como lead-magnet) **y** paciencia/colchón de 12+ meses. Sola y con pauta, los números no cierran a tiempo.

**Veredicto: 🟡 HERIDO** — activo premium, pero time-to-cash y CAC de lista lo vuelven apuesta de
mediano plazo, no motor de caja. Solo como sistema con #3.

---

## 3) Calculadoras que se citan solas — enjambre de mini-tools financieras AR

**El ataque.** A2 ya se sinceró: **sola no brilla.** Refuerzo el golpe. A RPM AR US$7 necesitás
~143k pageviews/mes para US$1k, y eso son 9-15 meses de SEO en un terreno donde el **AIO igual come el
tráfico informativo de alrededor** de la tool. El ad-arbitrage con tráfico AR Tier-3 es un negocio de
migajas. La única monetización que cierra es **usarla como lead-magnet de la #2** — o sea, no es un
negocio, es una **pieza de otro negocio**. Como isla, el LTV/CAC ni siquiera es la métrica correcta
porque no hay "cliente", hay pageviews que rinden centavos.

**¿Cierra la plata?** No como negocio propio. Sí como infraestructura de captación de la newsletter,
donde su costo de build (barato, repetible) se amortiza en emails capturados, no en ads.

**Qué tendría que ser verdad:** que se evalúe como CAC-reductor de la #2, no como P&L propio. En ese
rol, es de las mejores inversiones del lado pasivo.

**Veredicto: 🟡 HERIDO** — muere como isla de ads, vive como órgano de la #2. No la financiés sola.

---

## 4) Mapa del Barrio — micro-directorios hiper-locales UGC

**El ataque.** Este es el "pasivo" **más disfrazado de todos**: el activo SEO puede ser pasivo, pero la
plata sale de **vender listings destacados a 100-150 comercios**, y eso es **venta B2B recurrente
pura** — prospección, cierre y retención uno por uno. Con churn SMB de 3-7% mensual [5], mantener 150
comercios pagando significa **reponer 5-10 bajas todos los meses** para siempre: eso es un trabajo de
ventas full-time, no un ingreso dormido. Para un estudio chico sin fuerza comercial, conseguir Y
retener 150 cuentas de US$15-25 es una máquina de fricción que **consume el tiempo que debería ir a
construir los otros productos**. Además hay costo de moderación UGC (spam/fake).

**¿Cierra la plata?** El modelo (no depende de ads, cobra directo, resiste al AIO) es de los más sanos
en teoría. Pero el CAC real es **tiempo humano de venta**, el activo más escaso del estudio, y el
arranque frío del UGC + la venta atomizada empujan el break-even a 8-15 meses.

**Qué tendría que ser verdad:** que el estudio acepte que esto es "negocio local replicable con
vendedor dedicado", no pasivo. Si no hay alguien haciendo la venta B2B, no arranca.

**Veredicto: 🟡 HERIDO** — economía unitaria decente pero mal etiquetado: es activo comercial, no
pasivo. Compite por el mismo tiempo que los negocios activos, sin la caja rápida de ellos.

---

## 5) Cambió el Precio — historial de precios AR con moat de datos

**El ataque.** A2 ya le puso 5,5 y coincido: es el que **peor cierra en plata**. Triple problema: (a)
**build alto** (4-8 semanas, el más caro de construir y de mantener — antifraude, scraping que el
e-commerce AR puede bloquear); (b) **monetización probadamente floja** — la lección CamelCamelCamel es
literal: el afiliado no sostiene un price-tracker, y en AR el afiliado de ML es delgado; (c)
**cold-start del UGC** de 9-18 meses (pocos usuarios → poca data → poca utilidad → pocos usuarios).
Para US$1k/mes vía tier pro a US$3 necesitás 330 pagos, pero para tener 330 pagos necesitás una base
gratuita grande que tarda más de un año en formarse mientras pagás infra de scraping/almacenamiento.
Es **capex y tiempo altos contra ingreso incierto y lejano**: el peor perfil de riesgo del lote.

**¿Cierra la plata?** No en un horizonte razonable para un estudio chico. Gran relato de demanda,
pésimo perfil de caja.

**Qué tendría que ser verdad:** que alguien financie 12-18 meses de build+infra a pérdida apostando a
que la data histórica de precios AR se vuelva vendible. Es una apuesta de fondo VC, no de estudio.

**Veredicto: 🔴 MUERTO** (para un estudio chico, ahora). Build alto + monetización floja + cold-start
largo = tres formas de quemar plata antes del primer peso.

---

# 🟥 LADO ACTIVO (5)

## 1) Kudos — reseñas en piloto automático

**El ataque.** Busqué el agujero y casi no lo hay en COGS: responder ~30 reseñas/mes × US$0.005 =
centavos, **texto puro, sin trampa de voz.** El margen 90-95% es creíble. Entonces ataco por otro
lado: **CAC y churn.** El negocio es "venta atomizada" — sumás locales de a uno, y cada local paga
US$99-149. Con churn SMB 3-7%/mes y 43% de bajas en los primeros 90 días [5], el riesgo es que gastes
esfuerzo de venta y el local se vaya antes de amortizar el onboarding. **Mitigante fuerte y real:** el
moat es acumulativo (cuanto más gestionás su reputación, más caro le sale irse y mejor su ranking) →
esto **empuja el churn hacia abajo** con el tiempo, al revés que un SaaS commodity. Segundo cuidado:
la **política de Google prohíbe el "review gating"** (filtrar para pedir reseña solo a contentos) — hay
que pedir reseña sin sesgar o te penalizan; es una restricción de operación real, no fatal.

**¿Cierra la plata?** Sí, y es el que mejor cierra de los 10. COGS despreciable, cobro local por MP
(ojo: retención IIBB sobre bruto, pero con margen 90% se absorbe fácil [3][4]), benchmark de precio con
techo de 3× (Birdeye cobra US$299-449 [9]), ciclo de venta corto por ticket bajo y demo visual.

**Qué tendría que ser verdad:** que el estudio ejecute venta atomizada consistente (canal QR/físico,
referidos entre comercios). El CAC es bajo pero requiere ritmo comercial sostenido.

**Veredicto: 🟢 SOBREVIVE** — el más "aburrido-rentable". Margen real, no inflado. Es el ancla.

---

## 2) Fantasma — el "turno noche" de WhatsApp

**El ataque.** Acá está la trampa que el propio B2 confiesa, y la agrando. El COGS es
**conversacional y lineal**: US$0.15-0.30 por conversación cerrada. B2 dice "100 conversaciones/mes =
US$15-30", pero en un negocio de volumen real (una pyme que factura de noche: pizzería, turnos, e-comm)
son **200-400 conversaciones**, y ahí el COGS trepa a **US$60-120/cliente**. A US$200 flat, el margen
se desploma de 85% a ~40% o menos en el peor cliente — **y el peor cliente es justo el que más usa el
servicio y menos querés perder.** Vender flat sobre esto es suicida. La regla "tope + excedente por
uso" que propone B2 es correcta pero **hay que blindarla desde el día 1**, o el primer heavy user te
enseña la lección cobrándote a vos. Riesgo adicional: **dependencia de Meta/WhatsApp** (baneos,
política de plantillas) — riesgo de plataforma real, no cosmético.

**¿Cierra la plata?** Sí, **con pricing por uso obligatorio.** Reúsa el stack (MVP 1-2 semanas),
time-to-cash el más rápido (2-3 sem), demanda ultra-validada. El WhatsApp inbound es casi gratis
(ventana 24h). [10] Con tope de conversaciones + excedente, margen sano y escalable.

**Qué tendría que ser verdad:** que **nunca** se venda flat ilimitado. Con eso, cierra fácil.

**Veredicto: 🟢 SOBREVIVE** (condicionado a pricing por uso). Mejor caja temprana; la voz NO entra acá,
por eso el COGS es manejable.

---

## 3) Testigo — parte de trabajo pro desde foto+audio del operario

**El ataque.** Uso **audio de entrada (STT), no voz conversacional en tiempo real**, así que el COGS
es bajo y honesto (~US$2/operario/mes) — no cae en la trampa de la voz. El agujero real es de
**ejecución/tiempo**: el ciclo de venta es "medio" porque hay que **evangelizar y armar plantilla por
rubro** (construcción ≠ jardinería ≠ fumigación), y escala **vertical por vertical, no horizontal**.
Eso significa que cada nuevo rubro es un mini-lanzamiento con onboarding alto-touch → **consume tiempo
del equipo**, el recurso escaso. Para US$5k/mes hacen falta 35-50 cuadrillas, y llegar ahí lleva
tiempo de evangelización que compite con Kudos/Fantasma por las mismas horas del estudio.

**¿Cierra la plata?** Sí, y bien: COGS ~0, margen ~90%, y **stickiness altísima** (una vez que el parte
es el estándar de entrega del contratista a su cliente, cambiar duele → churn bajo, al revés que el SMB
promedio [5]). El problema no es el margen sino el **ramp**: 4-6 semanas al primer peso y crecimiento
por rubro.

**Qué tendría que ser verdad:** que se arranque con **un solo rubro pulido + un contratista faro**, y
que no se abran 5 verticales a la vez. Con foco, es un motor recurrente sólido.

**Veredicto: 🟢 SOBREVIVE** — segundo motor sticky. No es la caja más rápida, pero el margen y la
retención son de los mejores. Lo baja solo el ramp por rubro.

---

## 4) Mercader — gestor de MercadoLibre done-for-you

**El ataque.** Dos agujeros que el "margen IA 95%" tapa. **Primero: el COGS real es humano.** B2 lo
admite a media voz: la supervisión de pricing y la posventa delicada **no se automatizan**, y el margen
"real con labor" cae a 60-70%. Traducido: cada cliente **consume horas del estudio** que no escalan —
es consultoría con disfraz de SaaS. **Segundo, y peor: riesgo de plataforma existencial.** Todo el
negocio vive de la **API de MercadoLibre**, que puede cambiar términos, limitar la automatización de
respuestas, o lanzar su propia IA de respuestas y dejarte sin negocio de un día para el otro. Es
concentración de canal único: un tuit de producto de ML y estás muerto. **Tercero:** el cobro por
"lift vs. baseline" tiene **atribución disputable** (¿vendió más por vos o por la temporada?) →
fricción de cobro crónica. El vendedor de ML además es **desconfiado en ceder acceso a su cuenta** →
alarga el ciclo a 6-8 semanas.

**¿Cierra la plata?** A medias. Facturación alta por cliente (US$250+ y billing nativo MP), pero
margen real erosionado por labor y **riesgo de que la plataforma te borre el negocio.** No es un margen
90%, es un 60-70% con espada de Damocles.

**Qué tendría que ser verdad:** que ML no compita ni restrinja la API (fuera de tu control) **y** que
estandarices la supervisión para bajar la labor humana. Dos ifs grandes.

**Veredicto: 🟡 HERIDO** — plata real pero margen inflado por ignorar la labor, y concentración de
riesgo en una plataforma que no controlás. Alto techo, alta probabilidad de ruina de canal.

---

## 5) Confesionario — voz-del-cliente as-a-service

**El ataque.** Este es el que la premisa del brief clava: **la voz cuesta ~15-30× el texto y funde el
margen.** Y el research lo agrava: la voz real no cuesta US$0.07-0.15/min como asume B2, sino
**US$0.13-0.31/min todo incluido**. [1] Rehago la cuenta con el número real: 200 clientes/mes × 2 min ×
US$0.22 promedio = **US$88/cliente/mes solo de voz**, no los US$40-80 de B2. **Más** la labor humana de
la lectura mensual del insight (que B2 admite que "no escala infinito"). En modo voz, el margen cae por
debajo de 55%, y si el cliente es de alto volumen se hace **negativo**. Doble maldición: COGS variable
de voz **y** COGS humano de análisis. El modo texto (US$0.01/encuesta) sí tiene margen 90%, pero
entonces perdés el diferencial ("hablar da 5× más contenido") que justifica el precio premium.

**¿Cierra la plata?** Solo en **modo texto por default + voz como add-on cobrado por uso.** Vendido con
voz flat, es el más fácil de fundir de los 10. Y el insight humano pone un techo duro a la escala (no
podés atender infinitos clientes leyendo tableros a mano).

**Qué tendría que ser verdad:** que la voz sea **siempre** add-on por minuto (nunca incluida en flat)
y que el análisis humano se productice/automatice para escalar. Dos condiciones fuertes.

**Veredicto: 🟡 HERIDO** — evidencia de demanda genial, pero la voz + la labor humana lo vuelven
producto premium de nicho dentro de un bundle, no motor de volumen. Peligrosísimo si se vende flat.

---

## 📊 TABLA DE VEREDICTOS

| # | Negocio | Lado | Veredicto | Razón de plata/ejecución (1 línea) |
|---|---------|------|-----------|-------------------------------------|
| 1 | **Plantillería** | Pasivo | 🟢 SOBREVIVE | COGS ~0, cobro global sin fricción; el único costo real es distribución (audiencia) |
| 2 | El Data Semanal | Pasivo | 🟡 HERIDO | Activo premium pero CAC de lista (US$0.65-3.50/sub) + 12-18 meses al primer peso serio |
| 3 | Calculadoras | Pasivo | 🟡 HERIDO | Muere como isla de ads (RPM AR de migajas); solo vive como feeder de la #2 |
| 4 | Mapa del Barrio | Pasivo | 🟡 HERIDO | "Pasivo" disfrazado: es venta B2B recurrente con churn que come tiempo del equipo |
| 5 | Cambió el Precio | Pasivo | 🔴 MUERTO | Build alto + monetización floja (lección CCC) + cold-start 9-18 meses = quema plata |
| 6 | **Kudos** | Activo | 🟢 SOBREVIVE | Margen 90-95% real, COGS texto despreciable, moat acumulativo baja el churn, techo 3× |
| 7 | **Fantasma** | Activo | 🟢 SOBREVIVE* | *Solo con pricing por uso: el COGS conversacional lineal funde el flat en heavy users |
| 8 | **Testigo** | Activo | 🟢 SOBREVIVE | COGS ~0, stickiness altísima; lo baja el ramp por rubro, no el margen |
| 9 | Mercader | Activo | 🟡 HERIDO | Margen "95%" es mentira: labor humana lo baja a 60-70% + riesgo existencial de API ML |
| 10 | Confesionario | Activo | 🟡 HERIDO | La voz real (US$0.13-0.31/min) + labor humana funden el margen; solo texto+add-on cierra |

**Conteo:** 🟢 4 sobreviven · 🟡 5 heridos · 🔴 1 muerto.

---

## 🏆 Los 2 mejores unit economics/ejecución para un estudio chico

1. **Kudos (Activo).** El más limpio: COGS de IA **despreciable** (texto, no voz), margen 90-95%
   **real** (no inflado), MVP corto, ciclo de venta corto con ROI medible (estrellas = ventas), y un
   **moat que crece con el tiempo** (baja el churn en vez de sufrirlo). El benchmark de Birdeye
   (US$299-449) deja techo de precio de 3×. Es el negocio donde no encontré agujero de plata.
2. **Fantasma (Activo), con pricing por uso obligatorio.** Mejor time-to-cash de los 10 (2-3 semanas,
   reúsa stack), demanda ultra-validada, WhatsApp inbound casi gratis. La única bomba —el COGS
   conversacional lineal— se desactiva por completo con tope + excedente por uso. Con esa disciplina de
   pricing, es caja temprana con margen sano.

**Mención de honor pasivo:** **Plantillería** — COGS cero y cobro global sin fricción fiscal (2025
liberó el cobro USD [2]) lo hacen el mejor del lado pasivo, pero **depende de resolver distribución**,
que es un trabajo no-pasivo. Es 🟢 con asterisco grande.

**Observación transversal del red-team:** los 3 verdes activos (Kudos, Fantasma, Testigo) comparten
stack WhatsApp+IA+MP, usan **texto (no voz)** y cobran **en pesos por MP** evitando la fricción USD. Ese
es el bolsillo de defensa del estudio. Todo lo que mete **voz** (Confesionario) o **plataforma de
terceros como canal único** (Mercader, y en menor grado Mapa del Barrio) o **espera de tráfico/lista**
(Data Semanal, Calculadoras) tiene el margen o el time-to-cash comprometido.

---

## Fuentes

- [1] Retell AI — AI Voice Agent Pricing Full Breakdown 2026 (todo incluido US$0.13-0.31/min): https://www.retellai.com/blog/ai-voice-agent-pricing-full-cost-breakdown-platform-comparison-roi-analysis · Cekura — Retell pricing per minute 2026: https://www.cekura.ai/blogs/retell-ai-pricing-per-minute · Klariqo — AI Voice Agent Cost per Minute 2026: https://klariqo.com/blog/voice-ai-cost-per-minute/
- [2] Perfil (Canal E) — Freelancers pueden cobrar en dólares sin límites ni comisiones (2025): https://www.perfil.com/noticias/canal-e/alivio-fiscal-para-freelancers-ahora-pueden-cobrar-en-dolares-sin-limites-ni-comisiones.phtml · Maximiliano Firtman — Guía definitiva para cobrar dólares desde Argentina: https://maxifirtman.medium.com/gu%C3%ADa-definitiva-para-cobrar-d%C3%B3lares-por-trabajos-del-exterior-en-argentina-impuestos-y-1d8ad2683c85
- [3] Mercado Pago — Retenciones de impuestos en mis cobros: https://www.mercadopago.com.ar/ayuda/19244 · Impuestos vigentes en ML y MP (percepciones): https://www.mercadopago.com.ar/ayuda/percepciones-facturacion-ventas_302
- [4] YoFacturo — Ingresos Brutos MercadoPago: retenciones 2026: https://yo-facturo.com/blog/mercadopago-ingresos-brutos/ · Contablix — Impuestos Mercado Libre 2026 (IVA/Ganancias 1-3% RI; monotributo exento): https://contablix.ar/blog/impuestos-mercado-libre-2026-guia-definitiva
- [5] Optifai — B2B SaaS Churn Rate Benchmarks (SMB 3-7%/mes, 31-58% anual; 43% de bajas en primeros 90 días): https://optif.ai/learn/questions/b2b-saas-churn-rate-benchmark/ · HubiFi — SaaS Churn Rate Benchmarks 2025: https://www.hubifi.com/blog/calculate-saas-churn-rate
- [6] Poonam Sharma — 1 Year on Gumroad Selling Notion Templates (realidad: sin tráfico orgánico, pocas ventas al inicio): https://poonamsharmawriter.medium.com/1-year-on-gumroad-selling-notion-templates-what-ive-learned-20b59270e36d · Coachli — Sell Notion Templates 2026 Blueprint: https://www.coachli.co/blog/sell-notion-templates-your-2026-side-hustle-blueprint
- [7] SendOwl — How to sell Notion templates (necesitás llevar tu propio tráfico): https://www.sendowl.com/blog/tips-and-advice/how-to-sell-notion-templates
- [8] Inbox Collective — What I wish I'd known before spending $5000 promoting newsletters on Meta (CAC por sub): https://inboxcollective.com/what-i-wish-id-known-before-spending-5000-promoting-newsletters-through-meta/ · Adbloom — Grow newsletter with Meta ads (US$0.65-3.50/sub): https://adbloom.ai/guides/grow-newsletter-with-meta-ads
- [9] Birdeye — Pricing & Plans (Starter $299 / Growth $399 / Dominate $449 por local/mes): https://birdeye.com/pricing/
- [10] Meta for Developers — WhatsApp Business Platform Pricing (service/utility inbound gratis en ventana 24h): https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
