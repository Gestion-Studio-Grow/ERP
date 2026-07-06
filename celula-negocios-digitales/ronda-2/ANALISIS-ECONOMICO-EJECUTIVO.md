# Análisis económico ejecutivo — los 4 negocios costeables

> **PMO → Dueño · 2026-07-06.** Números reales tomados de los informes analíticos (A2/B2) y del
> red-team (R1/R2), con sus fuentes. Costeo solo los 4 que pasaron algún filtro; los 4 muertos no
> ameritan análisis de plata. Cifras en USD (el cobro USD desde AR se liberó en 2025). Todo local.

## Supuestos de costo comunes (para que los números sean honestos)
- **Build = tiempo, no cash.** Con Claude Code el estudio construye in-house: la **inversión cash
  directa** de un MVP es baja (**US$100–500** de infra + tokens de desarrollo). El costo real es
  **semanas de equipo**.
- **Costo de plataforma mensual** (hosting + DB + API WhatsApp base + ESP): **~US$50–150/mes** por
  producto, fijo, independiente de clientes.
- **COGS de IA** (Claude Sonnet US$3/US$15 por millón tok): respuesta de texto ≈ US$0,005;
  conversación de WhatsApp ≈ US$0,15–0,30; **voz ≈ US$0,07–0,15/min (15–30× el texto)**.
- **Fees de cobro:** Mercado Pago AR variable; Lemon Squeezy (MoR global, USD) ~5% + tarjeta;
  Hotmart 9,9%.
- **Churn pyme:** 3–7%/mes (43% de bajas en los primeros 90 días) → los LTV optimistas se ajustan.

---

## Tabla maestra

| Negocio | Tipo | Build MVP | Cash build | COGS por cliente/venta | Precio | Margen bruto | Para US$5.000/mes | 1er peso |
|---|---|---|---|---|---|---|---|---|
| **Kudos** | activo | 2–3 sem | US$100–500 | US$3–10/mes | US$99–149/mes + setup US$100–200 | **90–95%** | **~34–50 locales** | 3–5 sem |
| **Fantasma** | activo | 1–2 sem | US$100–300 | US$15–30/mes* | US$120–300/mes + fee/lead | 80–85% | **~25 clientes** | **2–3 sem** |
| **Testigo** | activo | 3–4 sem | US$100–500 | ~US$2/operario/mes | US$15–30/operario (5 op = US$75–150) | **~90%** | **~35–50 cuadrillas** | 4–6 sem |
| **Plantillería** | pasivo | 1–2 sem | US$100–300 | ~US$0 (solo fee de pasarela) | US$25–75 one-time | **90–95%** | ~185 ventas/mes** | semanas |

\* Fantasma: el COGS trepa a **US$60–120** en alto volumen (200–400 conversaciones) → **hay que cobrar
por uso (tope + excedente)** o el margen se hunde.
\** Plantillería a US$5.000/mes exige catálogo grande + audiencia; su meseta realista de arranque es
**US$1.000/mes ≈ 37 ventas a US$27 neto** (caso real citado: US$1.800 en un mes con 3 plantillas).

---

## 1. Kudos — reseñas en piloto automático  ·  el de mejor margen
- **Qué cuesta construirlo:** 2–3 semanas (webhook Google Business + WhatsApp + generador de respuestas
  + tablero). Cash directo US$100–500.
- **Qué cuesta operarlo:** US$3–10 por cliente/mes (30 reseñas × US$0,005 + campaña de pedido de
  reseña). COGS de IA **irrelevante** (texto).
- **Cuánto entra:** US$99–149/mes por local, undercutteando a **Birdeye (US$299–449/local/mes)** →
  techo de precio de **3×**. Setup opcional US$100–200. Mercado global de reputación **US$6,9–8,9 mil
  M, +13% anual**.
- **Break-even:** con **~35–50 locales** llegás a US$5.000/mes. A 90–95% de margen, casi todo es
  ganancia tras la plataforma fija.
- **Cuánto tarda:** primer peso en 3–5 semanas.
- **El pero:** venta atomizada (de a un local) y cuidar la política de Google (prohibido "gatear"
  reseñas). Moat acumulativo: cuanto más gestionás, mejor el ranking del cliente y más caro le sale
  irse.

## 2. Fantasma — el "turno noche" de WhatsApp  ·  el de caja más rápida
- **Qué cuesta construirlo:** 1–2 semanas (reúsa stack WhatsApp+IA+MP). Cash directo US$100–300.
- **Qué cuesta operarlo:** US$15–30/cliente/mes en tokens a volumen normal (100 conversaciones), pero
  **US$60–120 en alto volumen** → **este es el número a vigilar**. WhatsApp casi gratis si el cliente
  inicia.
- **Cuánto entra:** US$120–300/mes + fee por lead fuera de hora. Benchmark AI receptionist US$25–300/mes;
  un answering service humano cuesta US$200–7.000/mes.
- **Break-even:** ~25 clientes a US$200 = US$5.000/mes.
- **Cuánto tarda:** **2–3 semanas** (el más rápido a facturar, por reúso de stack).
- **El pero:** **margen NO gratis** — sin pricing por uso, un cliente pesado te deja en rojo.
  Dependencia de Meta/WhatsApp (baneos, cambios de política).

## 3. Testigo — parte de obra desde foto+audio  ·  el más pegajoso
- **Qué cuesta construirlo:** 3–4 semanas (ingesta WhatsApp foto+voz → STT + Sonnet → PDF). Cash
  US$100–500. La parte fina es la plantilla por rubro, no la tecnología.
- **Qué cuesta operarlo:** **~US$2/operario/mes** (110 partes × STT+Sonnet). Margen ~90%.
- **Cuánto entra:** US$15–30/operario (contratista de 5 = US$75–150/mes). Por debajo del FSM completo
  (**Jobber US$39, Housecall US$49–249/técnico**) porque vendemos solo "convertí el caos de WhatsApp en
  un parte cobrable", no un ERP.
- **Break-even:** ~35–50 cuadrillas chicas = US$5.000/mes.
- **Cuánto tarda:** 4–6 semanas (necesita 1 rubro pulido + 1 contratista faro).
- **El pero:** ciclo de venta medio (hay que evangelizar) y escala por rubro, no horizontal. Pero una
  vez adentro, **cambiar duele** (es su estándar de entrega al cliente) → retención altísima.

## 4. Plantillería — plantillas localizadas a normativa AR  ·  el único pasivo real
- **Qué cuesta construirlo:** 1–2 semanas (landing + checkout + 3–5 plantillas). Cash US$100–300. El
  valor está en el **diseño** (fortaleza del estudio) y el **know-how normativo AR**.
- **Qué cuesta operarlo:** **casi nada** — costo marginal cero por venta (solo fee de pasarela). Único
  "riego": actualizar 1–2 veces al año cuando cambia la normativa.
- **Cuánto entra:** US$25–75 one-time por plantilla. Benchmark: creadores con 3–5 plantillas facturan
  **US$500–3.000/mes**; caso real US$1.800 en un mes con 3 plantillas (~25–30 ventas).
- **Break-even:** **US$1.000/mes ≈ 37 ventas** a US$27 neto (o 15 a US$67). US$5.000/mes exige catálogo
  amplio + audiencia.
- **Cuánto tarda:** primeras ventas en **semanas**; meseta de US$1k+/mes a los 3–6 meses.
- **El pero:** el cuello **no es costo, es distribución** — sin audiencia, un catálogo no se vende
  solo. Acá es donde el músculo de marketing del estudio hace o rompe el negocio.

---

## Lectura de PMO (plata pura)
- **Menor costo + más rápido a facturar:** Fantasma (1–2 sem, primer peso en 2–3 sem) y Plantillería
  (cash casi cero, pasivo).
- **Mejor margen y moat:** Kudos (90–95%, ranking acumulativo) y Testigo (90%, retención alta).
- **La trampa a blindar:** todo lo conversacional/voz debe cobrarse **por uso**, no flat.
- **El costo oculto real no es el build (es barato con Claude Code): es la DISTRIBUCIÓN/venta.** Por eso
  el barbell tiene sentido: **Plantillería** para aceitar el motor de distribución barato, **Kudos o
  Testigo** para el margen recurrente.
