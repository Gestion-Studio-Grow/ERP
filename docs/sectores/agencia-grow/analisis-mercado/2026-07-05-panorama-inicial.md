# Análisis de mercado — Panorama inicial (2026-07-05)

**Equipo:** Consultores Expertos · **Método:** research web con fuentes citadas (ver §7) · **Estado:**
primer entregable del sector, base para las próximas iteraciones · **No toca prod ni Neon.**

> **TL;DR (para el dueño):** el mercado de publicidad digital se está **comoditizando por arriba** —Meta
> y Google están automatizando con IA todo lo que antes hacía un media buyer (Advantage+, AI Max), así
> que "saber tocar botones de ads" deja de ser diferencial—. Lo que **sí** paga es tener **dato
> propio de conversión real** para alimentar a esos algoritmos, y ahí nosotros tenemos una ventaja
> rara: **somos dueños del stack operativo del cliente** (ERP/POS + facturador ARCA + Mercado Pago +
> storefront). La hipótesis de diferencial (§5) es cerrar el **loop completo**: click de ad → tienda →
> venta en el POS → factura → cobro → **ese dato vuelve al algoritmo de ads**. Ninguna agencia genérica
> puede hacerlo porque no tiene el ERP debajo. Producto candidato #1 del sector: **"agencia + hub
> operativo con atribución de loop cerrado"**, no "otra herramienta de ads más".

---

## 1. Estado del arte de las plataformas de ads (lo que cambió)

### Meta Ads — hacia la automatización end-to-end
- **Advantage+ ya es el default de facto.** Meta reporta que **~65% de los anunciantes** escalan con
  Advantage+, y que consolidar campañas fragmentadas da hasta **-32% de CPA** y **+18% de ROAS** con
  señales enriquecidas. [1][2]
- **El anunciante define objetivo + creativos; la IA hace el resto** (targeting, pujas, ubicaciones,
  optimización). Meta apunta a **ads totalmente automatizados por IA** (URL + presupuesto → campaña
  entera). Ya hay **>4 millones** de anunciantes usando sus herramientas generativas (imagen-a-video,
  música IA, etc.). [1][3]
- **Consecuencia estratégica:** la ventaja competitiva se corre de "optimización manual" a **calidad
  del input** — profundidad de **first-party data**, calidad y diversidad de creativos, y qué tan bien
  "alimentás el algoritmo". [1]

### Google Ads — la misma dirección con AI Max / Performance Max
- **AI Max sale de beta** (sept. 2026) y absorbe Dynamic Search Ads, assets automáticos y broad match;
  se suma **AI Brief** (Gemini) para guiar a la IA "con tus palabras". Nuevos formatos conversacionales
  y **Shopping con IA**. [4][5]
- **Performance Max** sigue mejorando reporting/insights, pero necesita guardrails de search. Google
  empuja **ventanas de atribución más cortas** (1 día) para lectura casi en tiempo real. [5][6]

> **Lectura de los Consultores:** las dos plataformas convergen al mismo estado final —el humano pone
> objetivo + creativos + **datos**, la IA ejecuta—. **"Operar campañas" se comoditiza.** El valor
> defendible se muda a los **inputs** (datos y creativo) y a la **operación del negocio** detrás del
> click. Esto es exactamente donde tenemos activos.

## 2. Qué stack usa hoy el mercado (agencias y martech)

- **Stacks de 8–12 plataformas** en 4 capas: datos, automatización, analytics, y engagement. El
  desafío 2026 no es "qué herramienta", sino **integración y que realmente se use**. [7]
- **IA ya es transversal:** **90,3%** de las organizaciones de marketing usan **agentes de IA** en su
  stack; los más usados son de **producción de contenido (68,9%)** y **descubrimiento de audiencias
  (40,8%)** (research de Scott Brinker / MarTech). [7]
- **Herramientas dominantes:** CRM/automation (HubSpot, Salesforce), email (Mailchimp), reporting de
  agencia **white-label** (AgencyAnalytics, DashThis, Whatagraph, Reporting Ninja). [7][8]
- **Reporting white-label — precios de referencia:** AgencyAnalytics **US$79–439/mes**; DashThis
  **~US$49–399/mes** por cantidad de dashboards. Categoría **madura y saturada**, dominada por players
  US. [8]
- **Herramientas de creativo/gestión de ads con IA (nueva ola):** AdCreative.ai (**desde US$29/mes**),
  AdStellar (**US$49–499/mes**, URL→campaña Meta con creativos IA), Madgicx, AdAmigo.ai (media buyer
  conversacional). Mercado **nuevo, rápido y ya poblado**. [9]

> **Lectura:** dos categorías de "producto software para marketing" ya están **saturadas y son
> commodity** para nosotros: **(a) reporting white-label** y **(b) generadores de creativo/gestión de
> ads con IA**. Entrar de frente ahí es competir con players US financiados, en su terreno, sin
> diferencial. **NO recomendado como producto propio** (ver §4).

## 3. Tamaño y crecimiento del mercado (por qué el sector tiene sentido)

- **Publicidad digital LatAm:** ~**US$50,1 B en 2026**, creciendo **+10,8%** anual, hacia ~US$70,9 B en
  2029 (CAGR 12,3%). LatAm es la **2ª región de más rápido crecimiento** del mundo en ad spend. [10][11]
- **Argentina:** de los mercados digitales **más maduros** de la región (alta penetración de internet,
  fuerte uso mobile, inversión en ads en alza). Mercado Libre expande su **retail media** local. [10][11]
- **Cuánto invierte una PyME en ads:** promedio global **~US$3.500/mes** (≈45% search, 30% social, 25%
  otros). [11]
- **Vertical SaaS:** ~**US$143 B en 2026**, +35–60% de **retención** vs SaaS horizontal. La IA es un
  **multiplicador para quien ya tiene dato operativo propio**. El **playbook fintech embebido** (pagos
  → préstamos → seguros → payroll) **rinde mejor cuando el SaaS es también el POS/hub operativo**. [12]

> **Lectura:** el dinero está y crece. Pero el diferencial NO está en pelear la capa de ads (commodity)
> sino en la intersección **vertical SaaS + operación + dato propio**, que es literalmente nuestro
> perfil.

## 4. Oportunidades — qué aplica y qué NO a nuestro perfil

| Oportunidad | ¿Aplica? | Por qué |
|---|---|---|
| **Reporting white-label para agencias** (tipo AgencyAnalytics) | ❌ **NO** | Categoría madura, saturada, players US financiados; sin diferencial nuestro. Se **compra/revende**, no se construye. |
| **Generador de creativo / gestión de ads con IA** (tipo AdCreative/AdStellar) | ❌ **NO como producto propio** | Ola nueva pero ya poblada, y **Meta/Google la están absorbiendo** en sus plataformas (gratis). Como **herramienta interna** de la agencia, sí (se usa, no se vende). |
| **Atribución de loop cerrado ads↔operación** (nuestro ERP/POS + facturador + pagos como fuente de conversiones) | ✅ **SÍ — diferencial** | Nadie con solo "agencia" lo tiene; requiere ser dueño del stack operativo. Es nuestro multi-tenant aplicado a marketing (§5). |
| **Storefront brandeable que convierte + medido** (Tier Front Premium + tracking server-side) | ✅ **SÍ** | Ya construido; upsell directo desde Ads; genera el dato de conversión del loop. |
| **Facturación automática monotributistas** (arca standalone, ADR-025) | ✅ **SÍ** (producto de la compañía; canal = agencia) | Mercado enorme; la agencia es canal de venta. Compite en un mercado con players (Xubio/Alegra/Colppy ~ARS 2.600–6.000/mes) pero con **ingesta automática de MP** como diferencial. [13] |

## 5. Hipótesis de diferencial (el "multi-tenant del marketing")

**Tesis:** en un mercado donde operar ads se automatiza y se comoditiza, **el activo escaso es el dato
de conversión real de first-party**, porque es lo que alimenta —y hace ganar— a los algoritmos de Meta
y Google. Los que ganan en 2026 son los que **le devuelven al algoritmo dato de venta real, continuo y
server-side**: casos documentados muestran **2,1x ROAS**, **-2,8x costo por compra** con Conversions
API + conversiones offline. [14]

**Nuestra ventaja rara:** casi ninguna agencia es **dueña del sistema donde ocurre la venta**. Nosotros
sí: ERP/POS + facturador ARCA + Mercado Pago + storefront. Eso nos deja cerrar el **loop completo** que
una agencia genérica no puede:

```
Click de ad (Meta/Google)
   → Landing/Storefront brandeable (nuestro)          ← dato de sesión
   → Venta en el POS/ERP (nuestro)                     ← dato de conversión REAL (no pixel)
   → Factura ARCA + cobro Mercado Pago (nuestro)       ← ticket/valor real, offline incluido
   → Conversions API / offline conversions → vuelve a Meta/Google  ← alimenta el algoritmo
   → mejor ROAS, lookalikes sobre compradores reales, pujas a ingreso (no a clicks)
```

**Por qué es defendible (igual que el multi-tenant):** el diferencial no es una feature copiable, es
una **posición estructural** — hay que tener el stack operativo debajo para producir el dato. La
agencia sin ERP no puede; el ERP sin agencia no cierra el ciclo comercial. **La compañía tiene las dos
mitades.**

**Riesgos a validar (próxima iteración de Consultores):** (a) volumen offline real de las PyMES target
(si venden poco offline, el loop pesa menos); (b) fricción técnica de CAPI/offline por tenant; (c)
privacidad/consentimiento del dato de cliente; (d) tamaño del segmento que tiene ads **y** usa nuestro
ERP a la vez (¿lo creamos nosotros vía la agencia?).

## 6. Conclusiones + qué construir (para el PMO y los Desarrolladores)

1. **NO** construir reporting white-label ni un generador de creativos IA propio: son commodity y/o los
   está comiendo la plataforma. Si se necesitan, **se compran/revenden** o se usan como herramienta
   interna.
2. **SÍ** construir sobre el diferencial de **loop cerrado**: el primer bloque técnico es **conversiones
   server-side desde el ERP hacia Meta/Google** (Conversions API / offline conversions por tenant),
   naciendo del evento de venta/factura que ya existe en el Core. **Es un ADR nuevo** (candidato:
   "Puente de conversiones ERP→plataformas de ads").
3. **Producto-oferta de la agencia:** "**Te vendemos, medimos la venta REAL y con eso bajamos tu costo
   de ads**" — storefront + ads + atribución de loop cerrado, para clientes que además corren sobre
   nuestro ERP (o los migramos como tenant).
4. **Reforzar la prioridad de arca standalone (ADR-025)** como producto de ingreso recurrente: el
   análisis confirma mercado y competencia batible con el diferencial de ingesta automática de MP. [13]
5. **Próxima tarea de Consultores:** validar los 4 riesgos de §5 y dimensionar el segmento AR de
   PyMES con ads + operación digitalizable (con research de Meta CAPI adoption + retail media MELI).

## 7. Fuentes

1. [Meta Advantage+ Roadmap 2026 — Marketing Agent](https://marketingagent.blog/2026/05/06/the-complete-roadmap-to-using-meta-advantage-in-2026/)
2. [Meta Advantage+ AI Ads: What Businesses Must Do Now — Entrustech](https://entrustechinc.com/meta-advantage-plus-ai-ad-automation-2026/)
3. [Meta expects fully automated AI ads by 2026 — Marketing Dive](https://www.marketingdive.com/news/meta-plans-to-enable-fully-ai-automated-ads-by-2026/749613/)
4. [Google upgrades Dynamic Search Ads to AI Max — Google Blog](https://blog.google/products/ads-commerce/dsa-upgrade-to-ai-max-2026/)
5. [Google Ads Trends 2026: AI Max, Demand Gen, PMax — y77.ai](https://www.y77.ai/blogs/google-ads-trends-and-predictions-2026)
6. [Google Ads 2026 Updates: AI, Performance Max — Kleverish](https://www.kleverish.com/blog/google-ads-2026-updates-ai-performance-max/)
7. [FAQ on martech: AI agents & composable stacks 2026 — EMARKETER](https://www.emarketer.com/content/faq-on-martech--how-ai-agents-composable-stacks-reshaping-marketing-technology-2026) · [Best martech stack 2026 — Canto](https://www.canto.com/blog/marketing-stack/)
8. [21 Best White Label Marketing Software 2026 — Perspective](https://www.perspective.co/article/white-label-marketing-software) · [AgencyAnalytics pricing — Capterra](https://www.capterra.com/p/158746/Agency-Analytics/)
9. [Best AI Ad Creative Tools 2026 — Synter](https://syntermedia.ai/blog/ai-ad-creative-generation-tools) · [Automated Ad Platforms for Small Business — AdStellar](https://www.adstellar.ai/blog/automated-ad-platforms-for-small-business)
10. [Latin America 2nd fastest-growing region in digital ad spend 2026 — EMARKETER](https://www.emarketer.com/chart/c/355506/latin-america-will-worlds-second-fastest-growing-region-digital-ad-spending-2026-355506) · [Digital Marketing in Argentina 2026 — BYYD](https://www.byyd.me/en/blog/2026/04/digital-marketing-in-argentina-trends-2026-and-datareportal-statistics/)
11. [LatAm Digital Ad Spend Forecast — GlobeNewswire](https://www.globenewswire.com/news-release/2026/02/10/3235502/0/en/Latin-America-Digital-Ad-Spend-Market-Size-Forecast-by-Spend-Value-Across-100-KPIs-by-Type-of-Advertising-Channel-Form.html)
12. [Vertical SaaS Is Winning 2026 — SaaS Mag](https://www.saasmag.com/vertical-saas-niche-beats-horizontal-2026/) · [Rise of Vertical SaaS — Qubit Capital](https://qubit.capital/blog/rise-vertical-saas-sector-specific-opportunities)
13. [Cuánto cuesta un software de facturación en Argentina 2026 — rql.Ecosystem](https://ecosystem.rqlsistemas.com.ar/blog/cuanto-cuesta-software-facturacion-argentina-2026)
14. [Why offline conversions don't show up in Meta/Google & how to close the loop — EasyInsights](https://easyinsights.ai/blog/why-offline-conversions-dont-show-up-in-meta-or-google-and-how-to-close-the-data-loop/) · [Facebook CAPI in 2026 — Triple Whale](https://www.triplewhale.com/blog/facebook-capi)

---

*Trabajo de investigación/documentación. No se ejecutó nada sobre producción, Neon ni deploys. Próxima
iteración: validar los riesgos de §5 y dimensionar el segmento AR (ver §6.5).*
