# AVANCE CONSOLIDADO — Sector Agencia Digital (2026-07-05)

> **Para pasarle al dueño esta noche.** Estado del sector Agencia: qué se construyó, qué plata puede
> generar y por dónde seguimos. Todo commiteado en GitHub (repo `estetica-erp`, rama `main`). Es
> documentación + prototipos de software; **no se tocó producción, ni la base (Neon), ni se publicó nada
> en la web.**

---

## Resumen en 30 segundos

En un día, el sector Agencia pasó de idea a **estructura + inteligencia de mercado + primer software
andando**. Ya hay **dos prototipos de producto construidos y testeados** (código real, 15 tests verdes),
una **decisión de arquitectura** para el producto de mayor valor, y un **mapa de dónde está la plata**
(local, CABA y online) con precios y márgenes. La tesis central: la compañía tiene algo que casi ningún
SaaS tiene —**una agencia adentro que sabe vender**— y algo que casi ninguna agencia tiene —**un ERP que
genera el dato real del negocio**—. Cruzar esas dos mitades es el diferencial.

---

## (a) Productos en desarrollo y su estado

| Producto | Qué es | Estado | Palanca |
|---|---|---|---|
| **Panel del Dueño** (insights automáticos) | El ERP le "habla" al dueño en lenguaje llano: *"tu no-show subió 12%", "tu hora-silla más rentable es la tarde"* | 🟢 **PROTOTIPO CONSTRUIDO** — motor de lógica en `src/lib/owner-insights.ts` + 8 tests verdes. Falta la pantalla y cablearlo a la Server Action. | #1 (analytics) |
| **Benchmarking anónimo por rubro** | *"Tu ticket vs. el promedio de tu rubro y zona"* — comparación cross-tenant que una agencia común no puede hacer | 🟢 **MECANISMO CONSTRUIDO** — algoritmo de anonimización (k-anonymity) en `src/lib/benchmark-aggregate.ts` + 7 tests verdes. **Gated:** se activa cuando haya ≥5 clientes por rubro (hoy 2). Decisión en **ADR-027**. | #1 (moat) |
| **Comercio conversacional WhatsApp** | Reservar / pedir / pagar / facturar dentro del chat, cableado al ERP | 🟡 **Especificado** — apalanca notificaciones + Mercado Pago + ARCA ya existentes. Prototipo pendiente (depende de proveedor WhatsApp). | #2 |
| **SEO local como captación de tenants** | Vender SEO local a comercios de la zona → esos comercios se vuelven clientes del ERP | 🟡 **Piloto diseñado** — 5–10 comercios de Canning, medir conversión a tenant en 90 días. | #3 |
| **Verticales "AI por rubro"** | "Recepcionista IA" (estética), "mostrador IA" (retail) sobre los Blueprints | ⚪ **Especificado** — pricing 2–3x; entra tras #1/#2. | #4 |
| **arca standalone** (facturación automática) | Ingesta de Mercado Pago + facturación sola para monotributistas | ⚪ **Diseño previo** (ADR-025) — producto online recurrente, canal = Agencia. | producto online |

**Los dos primeros ya son código real, verificado:** `tsc` limpio + **204 tests del repo en verde**
(15 nuevos míos). Sin tocar la base, sin migraciones, sin deps nuevas.

## (b) Oportunidades de ganancias y ventas concretas

**Dónde está la plata, por plano geográfico** (detalle en `analisis-mercado/`):

| Plano | A quién se le vende | Qué se le vende | Pricing | Margen |
|---|---|---|---|---|
| 🟢 **Local (Canning/sur)** | comercios de la zona (estética, retail, gastronomía) — **hueco: no hay agencia hiperlocal** | SEO local + GBP + **"agencia + ERP"** (te consigo clientes y te doy el sistema) | US$300–800/mes retainer | 60–80% (automatizable) |
| 🟡 **CABA** | PyMES/verticales donde el ERP diferencia — **NO de generalista** (mercado saturado) | oferta productizada (SEO/GEO paquete) + vertical con ERP | $500k–1,5M/mes · fee US$300–1.500 · GEO $200k–500k/mes | 60–75% |
| 🔵 **Online** | monotributistas y negocios de todo el país | **producto**: arca standalone, ERP SaaS, Panel del Dueño (tier premium) | suscripción recurrente | altísimo (dato ya existe) |

**Las 3 fuentes de ingreso más concretas y de mayor palanca:**
1. **ERP SaaS + tier premium "Panel del Dueño"** — suscripción recurrente; el Panel es el "wow" que la
   Agencia usa para vender el ERP online. Margen altísimo (el dato ya está). **La Agencia es el motor de
   venta del propio producto.**
2. **SEO local en Canning = doble monetización** — fee de servicio (US$300–800/mes) **+** el comercio se
   vuelve **tenant del ERP** (segunda suscripción). El canal se autofinancia.
3. **arca standalone** para 1,5 M+ monotributistas — facturación automática, recurrente, con diferencial
   ya analizado vs. la competencia (ADR-025).

**Por qué ahora:** dolor real y medido en el mercado — **54% de las PyMES argentinas no tienen ninguna
integración en sus cobros**, 68% usan caja híbrida fragmentada; hay **subsidio estatal** (KIT 4.0) que
baja la barrera de compra; y la inversión publicitaria digital creció **+113% interanual**.

## (c) Próximos pasos

**Inmediatos (esta semana):**
1. **Terminar el Panel del Dueño** — `/sesion-feature`: cablear el motor ya construido a la pantalla de
   `/admin/reportes` + preview. (Devs; vallas tsc/tests/build.)
2. **Relevamiento de campo Canning** — contar comercios reales por rubro + short-list de 10 prospectos
   para el piloto de SEO local. (Consultores.)
3. **Confirmar ubicación del tenant CH Estética** para cerrar el mapa "zonas donde operamos".

**Corto plazo:**
4. **Piloto SEO local** (5–10 comercios, medir conversión a tenant en 90 días).
5. **Prototipo WhatsApp conversacional** cuando se elija proveedor.
6. **Definir pricing** del tier premium y de los paquetes locales (cada uno con su ADR).

**Diferido (post-escala, con gate):**
7. **Activar benchmarking cross-tenant** cuando haya ≥5 tenants por rubro (el mecanismo ya está construido
   y testeado; falta la masa que trae la propia Agencia).
8. **Ratificar el sector como ADR** (gobierno formal).

---

## Anexo — mapa de todo lo entregado (repo `estetica-erp`, `main`)

**Fundamento y estrategia del sector**
- `docs/sectores/agencia-digital.md` — charter (estrategia, frentes, convivencia de sectores)
- `docs/sectores/agencia-digital/FUNDAMENTO.md` — doc raíz "leer primero" (equipos, método, **visión go-to-market**)

**Inteligencia de mercado (Consultores)**
- `.../analisis-mercado/2026-07-05-panorama-inicial.md` — #1: ads se comoditizan → diferencial de loop cerrado
- `.../analisis-mercado/2026-07-05-servicios-automatizables-y-analytics.md` — #2: servicios + analytics-producto + palancas
- `.../analisis-mercado/2026-07-05-segmento-local-canning.md` — #3: corredor Canning (SEO local = canal de tenants)
- `.../analisis-mercado/2026-07-05-geografia-caba-local-online.md` — #4: CABA + local + online (tamaño/pricing/foco)

**Producto y arquitectura**
- `docs/sectores/agencia-digital/2026-07-05-pmo-propuesta-producto-1.md` — PMO: producto #1 (Panel del Dueño)
- `docs/adr/ADR-027-analytics-cross-tenant-benchmarking.md` — privacidad del benchmarking vs. RLS

**Software construido (código + tests verdes)**
- `src/lib/owner-insights.ts` (+ `.test.ts`) — motor del Panel del Dueño
- `src/lib/benchmark-aggregate.ts` (+ `.test.ts`) — anonimización k-anonymity del benchmarking

*Todo con `tsc` limpio y 204 tests en verde. Sin tocar prod, Neon ni deploys.*
