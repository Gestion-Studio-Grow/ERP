# Kudos — SPEC del MVP

> **Producto validado por la célula (Ronda 2, score 8/10 — el de mejor margen).**
> Gestión de reseñas en piloto automático para pymes hispanohablantes.
> Cobro US$99–149/mes/local · COGS US$3–10 · margen 90–95% · undercutteando a Birdeye (US$299–449).

Este documento define **qué construimos primero** (MVP), qué queda afuera, y cómo se configura
el "kit de voz de marca". El corazón técnico (generador de respuestas) está scaffoldeado en `src/`.

---

## 1. Propuesta de valor en una línea

> "Vos atendé tu negocio. Nosotros capturamos las reseñas de tus clientes contentos en el momento
> justo y **respondemos el 100%** — buenas y malas — con la voz de tu marca. Tu ranking sube, y eso
> se traduce en más ventas."

El **moat es acumulativo**: cuanto más tiempo gestionamos, mejor el ranking del local y más caro le
sale irse. No vendemos software, vendemos **un resultado gestionado (done-for-you)**.

---

## 2. Alcance del MVP (lo que SÍ entra)

El MVP tiene cuatro piezas. Todo lo demás es post-MVP.

### 2.1 Captación de reseña (cumpliendo la política de Google)

**El punto más delicado del producto.** La política de Google prohíbe el "review gating" (pedir reseña
sólo a los clientes contentos, o filtrar/desincentivar las malas). Violarla puede costar la baja del
perfil del cliente. Diseño para cumplir:

- **QR en ticket / mostrador / mesa:** lleva a una landing neutral con UN botón directo a "Dejá tu
  reseña en Google". **No hay pre-filtro de sentimiento, no hay encuesta previa que desvíe a los
  insatisfechos.** Todos los clientes ven el mismo camino. Esto es lo que Google permite.
- **WhatsApp post-venta (utility template, dentro de ventana o iniciado por el cliente):** mensaje
  único, amable, con el link directo a la reseña. Se envía a **todos** los clientes de una tanda, no a
  una lista curada de "contentos". Sin incentivos, sin sorteos, sin descuentos a cambio (Google prohíbe
  reseñas incentivadas).
- **Regla dura del sistema (`policy.ts`, ver ARQUITECTURA):** el copy de captación **nunca** incluye
  "si estás contento", "¿nos recomendarías?", ni condiciona el pedido al sentimiento. Un lint de copy
  bloquea esas frases antes de enviar.
- Lo que SÍ está permitido y hacemos: **facilitar** el proceso (link directo, recordatorio único,
  timing en el pico de satisfacción natural post-compra). Facilitar ≠ gatear.

**Frecuencia:** un pedido por cliente por visita. Nada de spam.

### 2.2 Generador de respuestas con voz de marca — EL CORAZÓN

Toma `(reseña + estrellas + perfil de marca)` y produce la respuesta apropiada. Ver `src/`.

- **Ruteo por estrellas:**
  - **1–2★ (negativa):** genera un borrador empático (disculpa + hacerse cargo + llevar la
    conversación a un canal privado), pero **NO se autopublica** — queda en estado `revisar_humano`.
    Playbook de crisis: nunca discutir en público, nunca negar sin datos, ofrecer solución concreta.
  - **3★ (neutra):** borrador que agradece y muestra voluntad de mejorar. Autopublicable (configurable).
  - **4–5★ (positiva):** agradecimiento cálido y personalizado con la voz de la marca.
    **Autopublicable** por defecto.
- **Escalado a humano (override sobre las estrellas):** si la reseña toca temas sensibles —amenaza
  legal, salud/seguridad/lesión, discriminación, acusación de fraude/robo, datos personales, menores,
  fallecimiento— pasa a estado `escalar`: **no se publica nada**, se alerta al equipo. Aplica incluso a
  reseñas de 5★ que mencionen algo delicado.
- **Guardarraíles de salida:** la respuesta nunca ofrece compensación/descuento salvo que el kit de
  marca lo habilite explícitamente; no admite responsabilidad legal; respeta un límite de longitud;
  incluye la firma configurada. Si falla un guardarraíl, cae a `revisar_humano`.
- **Idempotencia:** una reseña se responde una sola vez (dedupe por `reviewId`).

### 2.3 Tablero de estrellas / ranking

Vista simple, orientada al dueño del local (no a un analista):

- Estrella promedio actual + evolución mensual (línea).
- Volumen de reseñas nuevas / respondidas / % de cobertura (meta: 100%).
- Cola de moderación: reseñas en `revisar_humano` y `escalar` esperando acción.
- Ranking local vs. competidores del rubro (si hay datos públicos de GBP).
- **Reporte mensual automático** (PDF/email): "así movimos tu estrella y tu ranking este mes" — es la
  herramienta de retención y de demostración de ROI.

### 2.4 Kit de voz de marca (configuración por cliente)

Ver sección 4.

---

## 3. Lo que NO entra en el MVP (post-MVP explícito)

- **Multi-plataforma más allá de Google + MercadoLibre.** Nada de Facebook, Instagram, TripAdvisor,
  Booking en v1. (GBP primero; ML como segundo conector porque es donde está la plata en AR/LatAm.)
- **Agente conversacional de WhatsApp** (ida y vuelta con el cliente). El MVP hace envío de captación
  de una sola vía, no conversación. (Eso es territorio de "Fantasma", otro producto de la cartera.)
- **Respuesta por voz / audio.** Solo texto (por eso el COGS es despreciable).
- **Publicación 100% autónoma de reseñas negativas.** Siempre pasan por humano en el MVP; recién con
  historial de confianza se evalúa relajar.
- **Self-service / signup automático.** El onboarding es asistido (setup pago) — encaja con la venta
  atomizada de a un local y con el kit de voz de marca hecho a mano al inicio.
- **Detección de reseñas falsas / disputa de reseñas fraudulentas.** Post-MVP.
- **Multi-idioma más allá de español** (con detección de idioma de la reseña para responder en el
  idioma del cliente como único matiz — eso sí está en el corazón desde el día 1).

---

## 4. Kit de voz de marca (cómo se configura el tono por cliente)

Es el activo que hace que la respuesta suene a **la marca** y no a un bot genérico. Se arma en el
onboarding (setup pago US$100–200) y se guarda como un objeto `BrandVoice` (ver `src/types.ts`). Se
inyecta como **prompt de sistema cacheado** (prompt caching de Anthropic → COGS aún más bajo).

Campos del kit:

| Campo | Qué define | Ejemplo |
|---|---|---|
| `nombreMarca` | Cómo se nombra el negocio | "Pizzería Don Ciro" |
| `rubro` | Contexto del negocio | "pizzería de barrio" |
| `tono` | Registro de voz | `cercano-informal` \| `profesional-calido` \| `formal` \| `divertido` |
| `tuteoOVoseo` | Trato al cliente | `voseo` (rioplatense) \| `tuteo` \| `usted` |
| `firma` | Con qué firma cierra | "El equipo de Don Ciro 🍕" |
| `frasesMarca` | Muletillas / expresiones propias | ["¡Gracias totales!", "Te esperamos con la mesa lista"] |
| `prohibiciones` | Qué nunca decir | ["nunca prometer reembolso", "no mencionar competidores"] |
| `permiteCompensacion` | Si puede ofrecer algo a un cliente enojado | `false` por defecto |
| `emojis` | Nivel de emojis | `ninguno` \| `pocos` \| `abundantes` |
| `longitudMax` | Tope de caracteres de la respuesta | 500 |
| `datosContacto` | Canal privado para derivar quejas | "escribinos a hola@donciro.com" |
| `idiomaBase` | Idioma por defecto | "es" (responde en el idioma de la reseña si difiere) |

El kit se versiona: cambios de tono generan una nueva versión, y las respuestas guardan con qué
versión se generaron (trazabilidad + rollback).

---

## 5. Criterios de aceptación del MVP

- [ ] Captación por QR y por WhatsApp que pasa el lint de política de Google (cero frases de gating).
- [ ] El generador responde correctamente los 5 buckets (1–5★) + escala temas sensibles, con salida
      validada por guardarraíles. (Cubierto por `src/examples.ts`.)
- [ ] 100% de reseñas positivas/neutras respondidas en < 24 h de forma automática.
- [ ] 0% de reseñas negativas o sensibles publicadas sin ojo humano.
- [ ] Tablero con estrella, cobertura y cola de moderación.
- [ ] Reporte mensual automático generado y enviado.
- [ ] Un local beta real gestionado punta a punta durante 30 días.

---

## 6. Riesgos y mitigaciones (del análisis de la célula)

- **Política de Google (gating):** mitigado por diseño — captación uniforme sin pre-filtro + lint de copy.
- **Dependencia de la API de Google Business Profile:** estable, pero abstraemos el conector detrás de
  una interfaz (`ReviewSource`) para poder sumar ML y aislar cambios.
- **Comoditización:** baja — el moat es el historial acumulado de ranking + la relación + el kit de voz.
- **COGS de IA:** irrelevante (texto, ~US$0,005/respuesta, menos con caching). No hay "trampa del agente".
