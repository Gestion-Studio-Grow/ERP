# Caso: A Dos Manos Pádel

**Fecha:** 2026-07-06 (registro retroactivo, célula Productos por Rubro) · **Extraído por:** sesión de
alta original + auditoría de previews · **Rubro (texto libre):** tienda de equipamiento de pádel (retail)
**Fuentes consultadas:** referencia de mercado (padelcanning.com.ar, estructura/calidad de catálogo)

> Caso retroactivo: faltaba el registro (única de las 4 vidrieras sin su archivo en este ledger) y se
> completa junto con el fix del defecto que encontró. Artefacto: `docs/artefactos/adosmanos-preview.html`
> (+ `public/previews/adosmanos/`).

## 1. Qué se extrajo (resumen)

- **Identidad:** "A Dos Manos Pádel" — tienda minimalista, foco en producto y asesoramiento ("no vendemos
  de todo — vendemos lo que usaríamos nosotros"). Acento `verde pádel` (`#0b7a53`).
- **Modelo de negocio:** tienda de MOSTRADOR/online de equipamiento — **NO** reservas de cancha (eso es
  Break Point, prospecto aparte). Rubro retail `padel` (`src/blueprints/retail/rubros.ts`).
- **Catálogo:** dos líneas, palas y zapatillas de marcas líderes (Adidas, Bullpadel, Nox, Siux, Head,
  Asics) — catálogo deliberadamente acotado (tienda chica, no la amplitud de un club grande).
- **Servicios:** venta por unidad, precio lista/transferencia/cuotas, checkout por WhatsApp, envíos a
  todo el país.
- **Contacto:** **WhatsApp sin confirmar** — nunca se recibió el número real del negocio.
- **Incumbente:** no detectado.

## 2. Completitud (del `completenessScore`)

- `demo`: alta — catálogo, wording y checkout de la vidriera completos y funcionales.
- `prod`: <1.0 — WhatsApp real, dirección/horario reales, fotos reales: todo pendiente de confirmar.

## 3. Qué falló durante la extracción

| Muro / problema | Fuente | Cómo se resolvió | Provenance final |
|---|---|---|---|
| Número de WhatsApp real nunca llegó | — | placeholder `5491100000000` (formato válido, ver constante `WA` en el HTML) | `pedido-al-dueno` |

## 4. Qué se corrigió / se pidió al dueño

- **Defecto encontrado y corregido (2026-07-06, auditoría de la célula Productos por Rubro):** el
  placeholder de WhatsApp del preview era `5490000000000` — formato inválido, sin marcar como
  provisional en ningún lado (ni comentario, ni este registro). Un clic en "Escribinos por WhatsApp" o en
  "Finalizar por WhatsApp" durante una demo en vivo abría un número roto. Se corrigió a un placeholder de
  formato válido (`5491100000000`, consistente con el resto del repo), se extrajo a una constante `WA`
  única (un solo punto de cambio cuando llegue el real) y se marcó `provisional` en el código y acá.
- **Pendiente real del dueño:** número de WhatsApp real, dirección/horario a confirmar, fotos reales.

## 5. Heurística nueva (si la hubo)

- **Un placeholder de CTA (no solo un dato de catálogo) también tiene que ser honesto Y funcional.** Los
  otros 3 casos (magra, shinevelas, breakpoint) usan números con formato válido aunque de ejemplo; este
  caso rompía esa convención con un formato inválido y sin registro. **Regla nueva:** todo CTA de
  WhatsApp en un preview usa una constante `WA` de formato válido + se registra su procedencia acá,
  aunque el Gate ya haya pasado sin notarlo — se promueve a `heuristicas-aprendidas.md`.
