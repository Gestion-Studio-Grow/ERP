# 💼 Documento Comercial Fundacional — onboarding de Mariano (Go-to-Market)

> **Qué es:** el documento comercial fundacional de GSG y el **onboarding de Mariano** como **socio a cargo del
> go-to-market**. Baja la fundación de producto (ADR-060: dos productos / ADR-069+072: Apple×SAP) a **cómo se
> vende**: posicionamiento, competidores, mercado, pricing, canal, ICP y economía.
>
> **Fecha:** 2026-07-10 · **Nivel:** fundacional (comercial) · **Autor:** GSG (PMO + Agencia Digital)
> **Ancla:** [`fundacional-DEFINITIVO-v2.md`](fundacional-DEFINITIVO-v2.md) (Frente 6) · material de terreno en
> `docs/sectores/agencia-digital/`
>
> **Método de honestidad:** los **números** (TAM/SAM/SOM, pricing, unit economics) se marcan **[SUPUESTO]** hasta
> que Mariano los valide con fuentes; los **puntos abiertos** que decide él, **[DECISIÓN DE MARIANO]**.

---

## 1. El rol de Mariano

Mariano entra como **socio responsable del Go-to-Market**: define y ejecuta el motor comercial (canal, pricing,
mensaje, pipeline) mientras GSG (IA + dueño) sostiene producto y entrega. **[DECISIÓN DE MARIANO]** — alcance
formal del rol, dedicación, y equity/comisión: a acordar con el dueño.

## 2. Qué vendemos — dos productos sobre un motor único

Un **Core** con **motor invisible compartido**; se comercializa como **dos productos** (ADR-060/061):

- **Comercio Micro (PRIMERO):** el comerciante/monotributista de barrio. Alto volumen, ticket bajo, **self-serve**.
  Es el producto con el que salimos primero (ver `resumen-ejecutivo-primer-cliente.md`).
- **PyME/Empresa (DESPUÉS):** empresa mediana. Pocos clientes, ticket alto, dato sensible, exige aislamiento/DR.

**Crecé sin migrar** (ADR-058): el micro que crece pasa a Empresa **aditivamente**, sin cambiar de sistema.

## 3. Posicionamiento — "Apple × SAP", AI-native, ARCA nativa

- **Apple × SAP:** *"un SAP que diseñó Apple"* — el rigor de un ERP enterprise con la piel simple y fresca de un
  producto de consumo (ADR-069/072). Diferencial contra el ERP feo/complejo y contra la app-linda-sin-fondo.
- **AI-native:** el alta y la adaptación se hacen por **IA** (preset por IA desde la red/web del cliente, ADR-034);
  no es un ERP con un chatbot pegado — la IA es el motor de onboarding y de operación.
- **ARCA nativa:** facturación electrónica argentina **integrada de raíz** (ADR-022/066), credencial fiscal por
  tenant. No un plugin externo: parte del núcleo.
- **Argentinizado (ADR-044):** criollo claro, Mercado Pago/transferencia, WhatsApp-first, bolsillo de la pyme AR.

## 4. Relevamiento de competidores (18)

**[SUPUESTO]** — la lista de los 18 competidores y su matriz (precio · rubro · fiscal · self-serve · UX) vive en
el PDF comercial; se vuelca acá a medida que Mariano la valida. Material de terreno ya en el repo:
- `docs/sectores/agencia-digital/analisis-mercado/2026-07-06-analisis-competitivo-tuturno.md` (TuTurno, agenda).
- `docs/tenants/magra/competencia-bistrosoft.md` (Bistrosoft, gastronomía/retail).
- Diferenciación vs. facturadores (ADR-025 §11): Facturitas (manual) / Facturante (posnet) / TusFacturasApp ·
  iFactura (cobro de facturas) → **nuestro diferencial: ingesta automática del feed MP + multi-cliente por el
  contador**.

**[DECISIÓN DE MARIANO]** — cerrar la matriz de los 18 con su lectura de mercado y priorizar los 3–5 competidores
directos por producto (Micro vs Empresa).

## 5. Mercado — TAM / SAM / SOM

**[SUPUESTO]** (a validar por Mariano con fuentes AFIP/ARCA/CAME):
- **TAM** — universo de monotributistas + PyMEs AR con necesidad de gestión+facturación. *[número provisional a confirmar]*
- **SAM** — los alcanzables por canal digital + contadores en las zonas objetivo. *[provisional]*
- **SOM** — captura realista a 12–24 meses dado el canal y la capacidad de onboarding self-serve. *[provisional]*

## 6. Pricing (con benchmarks)

**[SUPUESTO]** — estructura tentativa, a calibrar con `docs/estrategia/costos-por-segmento.md` (unit economics
reales) y benchmarks de los 18:
- **Comercio Micro:** suscripción mensual baja (SaaS), self-serve; posible free/demo a costo cero (ADR-030) →
  conversión post-venta. *[precio provisional a confirmar]*
- **PyME/Empresa:** ticket mayor por aislamiento/DR/soporte; puede incluir setup + mensual. *[provisional]*
- **Regla dura (ADR-030):** no se invierte hasta vender; demo gratis primero, inversión post-venta.

## 7. Go-to-Market — el canal de **contadores** es el de mayor apalancamiento

- **Canal principal:** **contadores/estudios contables** como distribuidores. Un contador administra la **cartera**
  de monotributistas (modelo "contador socio", ADR-025 §10): cada cliente = tenant aislado + el contador opera
  cross-tenant. **Un contador trae N clientes** → apalancamiento máximo del esfuerzo comercial.
- **Canales secundarios:** self-serve digital (SEO/directorios, contenido), referidos de tenants vivos, Agencia
  Digital como satélite (`docs/sectores/agencia-digital/`).
- Material GTM ya en el repo: `docs/sectores/agencia-digital/go-to-market/` (estrategia de lanzamiento, guiones,
  plan de video-story).

## 8. ICP (Ideal Customer Profile)

- **Micro:** comercio/monotributista de mostrador (retail, gastronomía de barrio, servicios simples), 1–3 personas,
  hoy con cuaderno/Excel/WhatsApp, con dolor fiscal (ARCA) y de cobro (MP). Break Point, Magra, Shine, A Dos Manos
  son arquetipos vivos.
- **Empresa:** PyME con varios empleados/sucursales, dato sensible, necesidad de reportes y control — el "crecé sin
  migrar" del micro que escaló.

## 9. Unit economics

**[SUPUESTO]** — se derivan de `docs/estrategia/costos-por-segmento.md` (costo por tenant a escala, ADR-007):
- **Micro:** margen depende de que el alta sea **self-serve** (costo de mano de obra ≈ 0 por cliente) → la fábrica
  de tenants + preset IA (ADR-065/034) es la palanca que hace cerrar la economía.
- **Empresa:** margen por ticket alto absorbe el costo de aislamiento/DR (ADR-067).
- **[DECISIÓN DE MARIANO]** — CAC objetivo por canal (contador vs self-serve), LTV, payback.

## 10. Roadmap comercial

1. **Primer cliente Micro en vivo** (ver `resumen-ejecutivo-primer-cliente.md`) — caso testigo.
2. **Piloto de canal de contadores** — 1–2 estudios con cartera → validar el apalancamiento.
3. **Self-serve Micro** — preset IA + demo a costo cero → embudo digital.
4. **Producto Empresa** — cuando la separación de bases (ADR-060) esté construida (Fase 4).

## 11. Qué necesitamos de Mariano

**[DECISIÓN DE MARIANO]:**
- Validar/cerrar la matriz de 18 competidores y los TAM/SAM/SOM.
- Definir pricing por producto con benchmarks.
- Diseñar y correr el **piloto de canal de contadores** (el de mayor apalancamiento).
- Fijar CAC/LTV objetivo y el pipeline comercial.
- Acordar su rol formal (dedicación + equity/comisión) con el dueño.

## 12. SGS Lab / Creative Grow

- **SGS Lab** (Célula de Negocios Digitales, `celula-negocios-digitales/`): laboratorio de líneas de negocio propias
  del grupo (Agencia Grow) — caza de oportunidades bajo capital, productos digitales. **[SUPUESTO]** su encuadre
  comercial exacto lo cierra Mariano.
- **Creative Grow:** unidad creativa/marketing **[SUPUESTO]** — a definir alcance (marca, contenido, campañas) y su
  relación con la Agencia Digital (satélite del ERP) vs. Agencia Grow (negocios propios).

---

> **En una línea:** *dos productos (Micro primero, Empresa después) sobre un motor único, posicionados como
> "un SAP que diseñó Apple" AI-native con ARCA nativa; el canal de contadores es el mayor apalancamiento; los
> números los cierra Mariano.*

— Elaborado por GSG (PMO + Agencia Digital) · onboarding comercial de Mariano, 2026-07-10
