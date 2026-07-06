# INFORME NOCTURNO — Sector Agencia Digital (2026-07-05)

> **Para el dueño, esta noche.** Consolidado de cierre del día del sector Agencia Digital (unidad hermana
> dentro de Gestión Studio Grow — **no es Grow ni es el ERP**; es el 2º sector de la compañía). Integra el
> **AVANCE de la mañana** (`2026-07-05-AVANCE-consolidado.md`) con el **research de cierre del día**
> (análisis de mercado **#5**, cuantificación por zona + verticales). Todo commiteado en GitHub (repo
> `estetica-erp`, `main`). **Es documentación + prototipos; no se tocó producción, ni la base (Neon), ni
> se publicó nada en la web.**

---

## Resumen en 30 segundos

El sector cerró el día con **la estrategia cuantificada**. A la mañana teníamos estructura + 2 prototipos
de software andando + un mapa cualitativo de dónde está la plata. Esta noche le pusimos **números frescos
2026 con fuentes**: el viento de cola es real (**inversión publicitaria +74% i.a., digital ya líder del
mercado**; **e-commerce +55%**; **42% de las PyMEs ya usan IA**), el TAM del facturador **crece por ley**
(nueva obligación de factura electrónica desde julio 2026 + 4,5 M monotributistas), y el pricing que
podemos cobrar **no es barato: la especialización vertical cobra 2–3x**, que es justo lo que nuestro
perfil (dueños del dato operativo) puede defender. **Tesis intacta y ahora medida:** somos la única
compañía con las dos mitades —una agencia que sabe vender **y** un ERP que genera el dato real del
negocio—. Cruzarlas es el diferencial.

---

## (a) Productos en desarrollo y su estado

| Producto | Qué es | Estado | Palanca |
|---|---|---|---|
| **Panel del Dueño** (insights automáticos) | El ERP le "habla" al dueño en lenguaje llano: *"tu no-show subió 12%", "tu hora-silla más rentable es la tarde"* | 🟢 **PROTOTIPO CONSTRUIDO** — motor en `src/lib/owner-insights.ts` + 8 tests verdes. Falta la pantalla y cablearlo a la Server Action. | #1 (analytics) |
| **Benchmarking anónimo por rubro** | *"Tu ticket vs. el promedio de tu rubro y zona"* — comparación cross-tenant que una agencia común no puede hacer | 🟢 **MECANISMO CONSTRUIDO** — anonimización k-anonymity en `src/lib/benchmark-aggregate.ts` + 7 tests verdes. **Gated:** ≥5 clientes por rubro (hoy 2). Decisión en **ADR-027**. | #1 (moat) |
| **arca standalone** (facturación automática) | Ingesta de todo el feed de Mercado Pago → factura sola para monotributistas (modelo "contador socio") | 🟡 **Diseño cerrado** (ADR-025) + plugin scaffolded (ADR-022). **TAM ahora crece por ley** (ver (b)). Falta build. | producto online |
| **Comercio conversacional WhatsApp** | Reservar / pedir / pagar / facturar dentro del chat, cableado al ERP | 🟡 **Especificado** — apalanca notif + MP + ARCA. Unit economics ya dimensionados (costo US$150–250/mes; conversión 25–35%). Prototipo pendiente (proveedor WA). | #2 |
| **SEO local = captación de tenants** | Vender SEO local a comercios de Canning → esos comercios se vuelven tenants del ERP | 🟡 **Piloto diseñado + modelado** — 10 cuentas, se autofinancia, deja ~2 tenants (escenario piso). | #3 |
| **Verticales "AI por rubro" (CABA)** | Pack productizado por vertical (estética / retail-gourmet) con el ERP como diferencial | ⚪ **Short-list cerrada** (análisis #5 §3): 5 verticales priorizados; arranque por estética y retail-gourmet. | #4 |

**Los dos primeros son código real, verificado:** `tsc` limpio + **204 tests del repo en verde** (15
nuevos). Sin tocar la base, sin migraciones, sin deps nuevas.

## (b) Oportunidades de ganancias y ventas concretas

**Dónde está la plata, por plano — ahora con números 2026** (detalle y fuentes en
`analisis-mercado/2026-07-05-cuantificacion-oportunidades-y-verticales.md`):

| Plano | A quién / qué se vende | Pricing de referencia | Margen |
|---|---|---|---|
| 🟢 **Local (Canning/sur)** | SEO local + GBP + "agencia + ERP" → comercios de la zona | US$300–800/mes + 2ª línea SaaS (tenant) | 60–80% |
| 🟡 **CABA** | Pack productizado por **vertical** (estética / retail-gourmet), nunca de generalista | prima vertical **2–3x**; GEO US$1.500–8.000/mes | 60–85% |
| 🔵 **Online** | **Producto**: arca standalone, ERP SaaS, Panel del Dueño (tier premium) | SaaS vertical **US$99–499/mes**; ACV US$12–40k/año | 70–85% |

**Las 4 fuentes de ingreso más concretas y de mayor palanca:**
1. **Panel del Dueño como tier premium del ERP** — el "wow" con el que la Agencia vende el ERP online. La
   prima vertical (2–3x sobre SaaS horizontal) es la que justifica el precio; el dato ya está → margen
   altísimo. **Prototipo ya construido; falta la pantalla.**
2. **SEO local en Canning = doble monetización** — fee de servicio (US$300–800/mes) **+** el comercio se
   vuelve **tenant del ERP**. Aun en escenario piso (10 cuentas, 20% de conversión) el canal **se
   autofinancia** y deja ~2 tenants. El canal se paga solo.
3. **arca standalone** — el TAM **crece por ley ahora**: **RG 5824/2026** obliga a directores de SA,
   socios de SRL y profesionales a factura electrónica desde **julio 2026**, sumándose a **+4,5 M
   monotributistas**. Diferencial: ingesta automática de todo el feed de Mercado Pago (nadie más lo hace).
4. **WhatsApp conversacional** — conversión **25–35% vs 2–5%** de tienda online, costo **US$150–250/mes**;
   solo nosotros lo cerramos de punta a punta (chat → operación → cobro MP → factura ARCA).

**Por qué ahora — tres forcing functions simultáneas, todas de terceros (no supuestos nuestros):**
- **Fiscal:** factura electrónica obligatoria se **expande** (RG 5824/2026) → empuja a comprar facturador.
- **Competitiva:** **42% de las PyMEs ya usan IA** (+50% de esos usos en marketing/ventas) → el que no se
  digitaliza queda atrás.
- **De subsidio:** **KIT 4.0** financia **hasta 50%** del costo de digitalización (plan para 80.000 PyMEs)
  → baja la barrera de compra del ERP con plata del Estado.

Y el mercado acompaña: inversión publicitaria **$1,69 billones (+74% i.a.), digital ya líder (46,6%,
superó a TV)**; e-commerce **+55%** en facturación ($34 billones ARS, 645 M unidades +28%).

## (c) Próximos pasos

**Inmediatos (esta semana):**
1. **Terminar el Panel del Dueño (P0)** — `/sesion-feature`: cablear el motor ya construido a la pantalla
   de `/admin/reportes` + preview. (Devs; vallas tsc/tests/build; brief = `2026-07-05-pmo-propuesta-producto-1.md`.)
2. **Relevamiento de campo Canning** — contar comercios reales por rubro + short-list de 10 prospectos para
   el piloto de SEO local (reemplaza las cifras *provisionales* del #3). (Consultores.)
3. **Confirmar ubicación del tenant CH Estética** para cerrar el mapa "zonas donde operamos".

**Corto plazo:**
4. **Piloto SEO local (P1)** — 10 comercios, medir conversión a tenant en 90 días (modelo en #5 §2).
5. **Kickoff de arca standalone (P2)** — apalancando ADR-022/ADR-025; el TAM lo empuja la ley ahora.
6. **Prototipo WhatsApp (P3)** cuando se elija proveedor (unit economics ya cerrados en #5 §4.c).
7. **Definir pricing** de cada línea (tier premium, packs locales, arca) — cada uno con su **ADR**.

**Diferido (post-escala, con gate):**
8. **Entrar a CABA por vertical (P4)** — arrancar por estética / retail-gourmet (short-list en #5 §3).
9. **Activar benchmarking cross-tenant** cuando la Agencia (go-to-market) traiga ≥5 tenants por rubro
   (mecanismo ya construido y testeado; falta la masa).
10. **GEO/AEO first-mover** y **loop cerrado CAPI** — capabilities a construir con su ADR.
11. **Ratificar el sector como ADR** (gobierno formal).

---

## Anexo — mapa de todo lo entregado (repo `estetica-erp`, `main`)

**Fundamento y estrategia**
- `docs/sectores/agencia-digital.md` — charter del sector
- `docs/sectores/agencia-digital/FUNDAMENTO.md` — doc raíz "leer primero" (equipos, método, visión go-to-market)

**Inteligencia de mercado (Consultores)**
- `.../analisis-mercado/2026-07-05-panorama-inicial.md` — #1: ads se comoditizan → diferencial de loop cerrado
- `.../analisis-mercado/2026-07-05-servicios-automatizables-y-analytics.md` — #2: servicios + analytics-producto + palancas
- `.../analisis-mercado/2026-07-05-segmento-local-canning.md` — #3: corredor Canning (SEO local = canal de tenants)
- `.../analisis-mercado/2026-07-05-geografia-caba-local-online.md` — #4: CABA + local + online (comparación tri-planar)
- `.../analisis-mercado/2026-07-05-cuantificacion-oportunidades-y-verticales.md` — **#5 (NUEVO): números 2026 por zona + verticales CABA + modelo de ingresos**

**Producto, arquitectura y reportes ejecutivos**
- `docs/sectores/agencia-digital/2026-07-05-pmo-propuesta-producto-1.md` — PMO: producto #1 (Panel del Dueño)
- `docs/sectores/agencia-digital/2026-07-05-AVANCE-consolidado.md` — consolidado de la mañana
- `docs/sectores/agencia-digital/2026-07-05-INFORME-NOCTURNO.md` — **este informe (cierre del día)**
- `docs/adr/ADR-027-analytics-cross-tenant-benchmarking.md` — privacidad del benchmarking vs. RLS

**Software construido (código + tests verdes)**
- `src/lib/owner-insights.ts` (+ `.test.ts`) — motor del Panel del Dueño
- `src/lib/benchmark-aggregate.ts` (+ `.test.ts`) — anonimización k-anonymity del benchmarking

*Todo con `tsc` limpio y 204 tests en verde. Sin tocar prod, Neon ni deploys. Cifras del plano Local
marcadas provisionales (relevamiento pendiente).*
