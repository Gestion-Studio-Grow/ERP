# Caso: CH Estética

**Fecha:** 2026-07-06 (preview publicado, célula Productos por Rubro) · **Extraído por:** blueprint +
branding ya vigentes en el repo · **Rubro (texto libre):** estética / spa (agenda de turnos)
**Fuentes consultadas:** `src/lib/branding.ts` (marca real, tenant piloto en prod), rubro `estetica`
(`src/blueprints/agenda/rubros.ts`)

> Caso distinto a los otros 4: CH **no es un prospecto de preventa**, es el **tenant piloto real** ya
> vivo en prod (`beauty-spa`). El preview es la vidriera de venta/onboarding de OTROS clientes de
> estética, con la marca e identidad real de CH — no se tocó su base ni sus datos operativos reales.
> Artefacto: `docs/artefactos/chestetica-preview.html` (+ `public/previews/chestetica/`).

## 1. Qué se extrajo (resumen)

- **Identidad:** "CH Estética" (Carolina Haponiuk), acento real `petroleo` (`#2c6e77`), tema claro —
  datos ya vigentes en `src/lib/branding.ts`, no inventados.
- **Modelo de negocio:** agenda de turnos por profesional (blueprint `servicios`/agenda).
- **Catálogo:** el del rubro `estetica` (referencia/demo del blueprint, no la agenda/lista real de CH):
  Faciales, Corporales, Manos y pies.
- **Contacto:** **WhatsApp sin confirmar para este preview** — CH opera en prod con su propio número
  real (BusinessSettings), que no se consultó (no se toca la DB de prod para armar un preview estático).

## 2. Completitud (del `completenessScore`)

- `demo`: alta — catálogo, wording y CTA de reserva completos y funcionales.
- `prod`: N/A — CH ya está en producción; este artefacto es material de venta, no su alta.

## 3. Qué falló durante la extracción

| Muro / problema | Fuente | Cómo se resolvió | Provenance final |
|---|---|---|---|
| WhatsApp real de CH vive en BusinessSettings de prod, no se consulta la DB para un preview | — | placeholder `5491100000000` (mismo patrón que adosmanos, constante `WA` única) | `pedido-al-dueno` |
| Catálogo real de CH (agenda/precios vigentes) no está documentado fuera de la DB | — | se usó el catálogo de referencia del rubro `estetica` (blueprint), marcado como demo | `provisional` |

## 4. Qué se corrigió / se pidió al dueño

- Nada que corregir (caso nuevo, sin Gate previo). Pendiente real: confirmar si el WhatsApp de reserva
  de este preview debe ser el mismo de CH en prod o uno de captación separado.

## 5. Heurística nueva (si la hubo)

- Confirma **H7** (`heuristicas-aprendidas.md`): CTA de WhatsApp sin número real → placeholder de
  formato válido + constante única + registro acá, igual que adosmanos.
