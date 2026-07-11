---
id: ADR-078
nivel: evolutiva
dominio: [Producto, Negocio]
depends_on: [ADR-076, ADR-007, ADR-030]
---
# ADR-078: Pricing y unit economics de la suite de facturación (lista 2026-07-11, revisión trimestral)

**Estado:** Aceptada — lista de precios vigente decidida por el dueño (Maxi), 2026-07-11. **Revisión
trimestral de lista — próxima: octubre 2026.**
**Fecha:** 2026-07-11
**Depende de:** ADR-076 (los tres productos que se precian), ADR-007 (análisis financiero de plataforma —
acá se baja a unit economics por producto), ADR-030 (ciclo demo→venta→inversión — no se invierte antes de
vender; C gratis es coherente: cuesta centavos)
**Relacionado:** ADR-075 (la regla determinista-primero que hace posible este margen), ADR-077 (packs de
cartera), ADR-059 D8 (válvula de capacidad humana — el soporte es el recurso escaso)
**Fuente de los números:** `docs/producto/costos-pricing-suite.md` (cost-to-serve relevado, dólar oficial
$1.510 al 10-jul-2026) y `docs/producto/blueprint-facturacion-planes.md`

---

## Contexto

Con la suite definida (ADR-076) faltaba la lista de precios con base en costos reales, no en deseo. El
relevamiento de `costos-pricing-suite.md` dejó un hallazgo que ordena todo: **el costo técnico
(infra + IA + WhatsApp) es <1% del ticket en todos los tiers; el costo real es el SOPORTE** (97-98% del
cost-to-serve). O sea: el margen no se protege optimizando servidores — se protege con **disciplina de
horas de soporte y self-serve**.

## Decisión

### Producto A·Comerciante — escalera por tamaño de negocio (nunca por usuario)

| Plan | Precio ARS/mes | Nota |
|---|---|---|
| **SOLO** | **$14.900** | con **fair-use de soporte 0,3 h/mes** + **setup $49.900, bonificado con anual** |
| **COMERCIO** | **$39.900** | |
| **PYME** | **$89.900** | |
| **CM** | **$149.900** | |

Márgenes brutos reales (descontado cost-to-serve + MP + IIBB): **46-58%** según tier (detalle en
`costos-pricing-suite.md §1`). El fair-use de SOLO y el setup cobrado son la respuesta al hallazgo del
relevamiento: SOLO no cerraba por soporte/onboarding, no por precio.

### Producto B·Contador — packs de cartera

- **$249.000/mes** por pack de **10** clientes · **$449.000/mes** por **30** · **$990.000/mes** por **100**.
- **Mínimo: pack de 10.** Excedente sobre el pack: **$14.900 por cliente**.
- **Comisión de canal: 20% × 12 meses** por cada cliente que se **gradúa** a A·Comerciante (ADR-076 §5) —
  el contador cobra por hacer crecer a sus clientes dentro de la suite.

### Producto C·Facturita — gratis, es el CAC de A

- **$0.** Costo real relevado: **~$50/usuario/mes** — regalar C es más barato que cualquier campaña.
- **Límites duros:** 5 facturas/mes · **sin extracto ni conciliación** (frontera ADR-076 §3) · sin cobros MP.
- **Triggers de upgrade** cableados al producto: la **factura n°6**, querer **importar un extracto**,
  querer **cobrar** — cada uno muestra el camino a A (mismo tenant, sin migrar, ADR-076 §4).
- Soporte humano: **$0 por diseño** (self-serve + FAQ + bot); si un usuario free supera 0,05 h/mes, se
  arregla la UX, no se contrata gente.

### Principios rectores (los que no se negocian)

1. **El costo técnico es <1% del ticket; el costo real es soporte** → la disciplina de horas (fair-use,
   onboarding cobrado, KB/bot) y el self-serve **PROTEGEN el margen**. Toda decisión de producto que ahorre
   horas de soporte vale más que cualquier optimización de infra.
2. **Nunca cobrar por usuario.** Se cobra por tamaño de negocio (A) o por cartera (B). Regla de la casa.
3. **Revisión de lista TRIMESTRAL, no indexación.** Los precios se revisan como decisión (próxima:
   **octubre 2026**), no se atan a un índice automático.

## Consecuencias

- **(+)** Lista completa y defendible: cada precio tiene su cost-to-serve relevado atrás; los márgenes
  46-58% dejan lugar para el canal (20%) sin ir bajo agua.
- **(+)** C gratis con frontera dura crea el funnel sin canibalizar (ADR-076): miles de usuarios free
  cuestan lo que un cliente COMERCIO deja de margen.
- **(+)** B mejora con carteras grandes (el costo por cliente de cartera cae de ~$18.250 a ~$9.200 entre
  pack 10 y pack 30) → el escalonado de packs va a favor del costo, no en contra.
- **(−) Deuda anotada / riesgos:** el fair-use de soporte hay que **medirlo** (hoy no hay tracking de horas
  por tenant) y comunicarlo sin sonar tacaño (textos: ADR-080). La válvula de capacidad humana (ADR-059 D8)
  sigue siendo el techo real: >30 clientes A o 3-4 estudios B saturan las horas del dueño → KB/bot y
  contratación entran al roadmap antes de ese punto. Los números asumen dólar $1.510: la revisión
  trimestral es la que corrige, no un ajuste ad-hoc.

— Elaborado por GSG · 2026-07-11

> Numeración provisional — verificar colisión al mergear (regla de timestamps de CLAUDE.md aplicada a ADRs).
