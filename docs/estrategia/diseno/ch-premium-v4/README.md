# CH Estética — Front premium v4 · "El barro y el bisturí"

> Upgrade de diseño del front público de **CH Estética** (La Alameda, Canning).
> Encargo: *superador, máxima calidad, que desafíe lo que hay*. Objetivo: **producto listo para
> entregar al cliente**, que transmita **exclusividad y servicio premium** — lujo silencioso, no "lindo".
> Mantiene el estilo tierra editorial existente y **el logo tal cual** (teal), subiéndolo un escalón.
>
> **Rama:** `diseno/ch-premium-v4` · **Estado:** propuesta para aprobación del dueño. No integrado a `main`, no deployado.
> Entregable autocontenido: [`ch-estetica-premium-v4.html`](./ch-estetica-premium-v4.html) (1 archivo, imágenes embebidas).

---

## 1 · Crítica honesta del front en vivo (`chestetica-erp.vercel.app`)

El front actual **no es malo** — tiene narrativa real ("tu lugar para desconectar", el ritual
Antes/Durante/Después), catálogo real con precios, paleta tierra y una lista de servicios editorial.
Está por encima del promedio. Pero para el estándar **premium / exclusivo** que pide el encargo, todavía
tiene *tells* que lo delatan como plantilla generada:

1. **No hay una sola fotografía. Cero.** Cada "imagen" es un degradé CSS con grano y un `data-cap`
   que *describe la foto que no está* ("Manos acomodando lino sobre camilla…"). Es **el tell número uno**:
   el lujo es fotográfico — piel, luz, manos, textura, un rostro que afloja. Rectángulos-con-caption son
   el gesto más "hecho por un modelo que no puede tomar fotos". **Un spa premium se vende con la piel.**
2. **La grilla de 3 columnas (Tiempo · Cercanía · Cuidado).** El patrón de confianza de 3-íconos-3-columnas
   que tiene *toda* landing generada. Correcto e invisible: el promedio del buen gusto.
3. **El hero sigue con forma de hero:** eyebrow + título + párrafo + 2 botones + imagen al lado, split 55/45.
   El "CH" fantasma es lindo, pero el esqueleto es el default.
4. **Todo es simétrico y seguro.** `max-w`, filas prolijas, padding parejo. El editorial premium usa
   **asimetría, tensión, saltos de escala**: un titular de verdad grande, una foto que se va del borde,
   el aire como gesto deliberado y no como margen parejo.
5. **La carta es un ledger plano.** 18 faciales como filas idénticas, +60 ítems sin jerarquía. Funciona,
   pero para un primer visitante es un muro. Es un problema de UX disfrazado de "completitud".
6. **El teal — el color propio de la marca — está tímido.** El logo es teal y la paleta lo enterró como
   detalle de subrayados y una barra de progreso. O se compromete la tensión teal-clínico, o se
   desperdicia el capital del logo.
7. **La reserva es un trámite** de 5 pasos con barra de progreso y fieldsets: se siente software, no
   recepción.
8. **La tipografía (Fraunces + Hanken)** es el pairing "por defecto del diseñador 2024". Prolijo, pero no
   es una huella.

**Mandato que tomé:** matar el molde, meter fotografía protagonista, darle **postura** al layout, hacer
**convivir tierra + teal con intención**, y convertir la carta y la reserva en actos premium.

---

## 2 · La tesis de diseño — **"El barro y el bisturí"**

CH es donde la **dermatocosmiatría clínica** (Carolina — precisión, frío, instrumento) se encuentra con
el **ritual de spa** (calidez, tierra, desconectar). La tensión que pide el encargo —dueño quiere **tierra**,
logo es **teal**— *es* la marca: **el teal es el acento preciso y frío (el gesto clínico); la tierra es la
base cálida y envolvente (el spa).** No se pelean; conviven con intención.

Se ata a **ADR-072** (Apple×SAP): Apple en la piel (aire, jerarquía tranquila, foto-first, claro/oscuro),
SAP en la profundidad (números **tabulares monoespaciados** para precios y duraciones — la voz del
instrumento). La huella anti-plantilla: un **riel de índice tipo dossier clínico** (numeración mono en los
márgenes, coordenadas de La Alameda, "N.º 01 · Est. 2016") que ningún modelo genera por promedio.

---

## 3 · Paleta TIERRA definitiva (teal integrado) — toda AA verificada

Base cálida envolvente + teal frío clínico. **Todos los pares de texto verificados ≥ WCAG AA** por el gate
automático (ver §5). Contrastes sobre el fondo base `--bg`:

| Rol | Token | HEX | Uso | Contraste |
|---|---|---|---|---|
| Hueso / Alabastro | `--bg` | `#F4EEE4` | fondo cálido base | — |
| Arena | `--surface` | `#EAE0D2` | superficie alterna (carta) | — |
| Lino | `--paper` | `#E2D5C3` | tarjetas / cards | — |
| Cacao (tinta) | `--ink` | `#241A12` | texto principal | 14.8:1 |
| Tostado | `--ink-soft` | `#5A4A3A` | texto secundario | 7.4:1 |
| **Terracota (acento cálido)** | `--terra` | `#B05A34` | **CTA, énfasis** | blanco encima 4.8:1 |
| Terracota profundo | `--terra-deep` | `#8F4526` | texto acento / hover CTA | 6.0:1 |
| **Teal CH (marca — del logo)** | `--teal` | `#1E93A6` | acento frío, rótulos on-dark | — |
| **Teal profundo (clínico)** | `--teal-ink` | `#0A5F6A` | rótulos/links de texto sobre claro | 6.4:1 |
| Teal brillante | `--teal-bright` | `#3FB6C8` | teal sobre fondos oscuros | — |
| Umbra (near-black cálido) | `--umbra` | `#241C16` | secciones oscuras (reserva, prueba) | bone 13.7:1 |
| Bone | `--bone` | `#F1E7D9` | texto sobre oscuro | — |

**Tipografía:** **Fraunces** (display, el ritual/calidez) · **Hanken Grotesk** (cuerpo, continuidad con lo
existente) · **IBM Plex Mono** (precios, duraciones, índices — la voz clínica/tabular). Serif cálida para
el ritual, mono para la precisión: la tesis hecha tipografía.

**Modo claro y oscuro** como estándar (ADR-072 §2): la vidriera nace en las dos variantes; el oscuro es un
umbra cálido "a la luz de las velas". Toggle en el header + `prefers-color-scheme`.

---

## 4 · Mejoras de UX concretas

- **Rituales insignia (el fix del muro de servicios).** Antes del catálogo completo, **3 rituales curados
  por Carolina** — fotografiados, nombrados, con precio y duración — para el primer visitante. *"¿Primera
  vez? Empezá por acá."* Resuelve el problema de enfrentar +60 ítems sin guía. Datos reales del catálogo.
- **La carta como carta de restaurante premium.** Índice de familias (mono numerado, con conteos:
  Faciales 18, Corporal 14, Depilación 16…) que filtra el panel de servicios. Precios **mono tabulares**
  alineados a la derecha, marca **★ elegido** en los más pedidos, nota editorial por familia. El muro se
  vuelve navegable sin perder completitud (los 74 servicios reales están).
- **La reserva como acto, no trámite.** Reencuadre "Reservá tu ritual": ritual numerado (01·02·03),
  tarjeta de "tu próximo turno" con tildes teal, y un modal-concierge — título en Fraunces
  ("¿Qué te gustaría hacerte?"), rótulos cálidos, hilo teal→terra de progreso, y la confirmación como
  **tarjeta de turno impresa** con N.º de reserva. Copy criollo, WhatsApp-first, política de cancelación,
  "te recibimos con un té". Preselección: reservar un ritual insignia entra directo al paso 2.
- **Autoridad / prueba social elevada.** Carolina **dermatocosmiatra** al frente; equipo con especialidades
  reales (Carolina, Macarena, Romina); banda de prueba social con **+8 años · +1200 turnos · 74 servicios**
  y los sellos (material esterilizado · turnos espaciados · trazabilidad).
- **El camino a reservar, siempre a mano.** CTA terracota persistente en header, hero, cada ritual, cada
  ítem de la carta, la banda concierge y contacto. Nunca estás a más de un scroll de reservar.
- **Accesibilidad real:** foco visible teal, `aria-selected`/`role=tab` en la carta, `aria-pressed` en las
  opciones del modal, `aria-live` en el progreso, labels reales, targets ≥ 44px, respeta
  `prefers-reduced-motion`.

---

## 5 · Gate visual (render real) — resultado

Gate automático propio (Chromium headless vía CDP) que renderiza el archivo real en **1280px (desktop) y
390px (mobile)** y verifica contra estándar:

| | Overflow horizontal | Contraste (fallos AA) | Touch targets < 44px |
|---|---|---|---|
| **Desktop** | 0 | 0 | 0 |
| **Mobile** | 0 | 0 | 0 |

*(El texto sobre fotografía — hero, banda de prueba, tarjetas de equipo — se verificó visualmente en los
screenshots; lleva scrim oscuro garantizado y es legible. Ver `tools/gate-results.json`.)*

Reproducir (requiere el Chromium de Playwright cacheado):
```
node tools/harness.mjs gate  ./ch-estetica-premium-v4.html      # AA + touch + overflow, desktop y mobile
node tools/harness.mjs shots ./ch-estetica-premium-v4.html out desktop  # screenshots full-page
node tools/build.mjs src.html ch-premium-assets ch-estetica-premium-v4.html  # rebuild self-contained
```

---

## 6 · Archivos

- **`ch-estetica-premium-v4.html`** — entregable autocontenido (1 archivo, 8 imágenes embebidas). *Este es
  el que se le muestra al dueño / cliente.*
- `src.html` — fuente editable (referencia imágenes en `ch-premium-assets/`).
- `ch-premium-assets/` — imaginería generada (Pollinations/flux, gratis, sin key), art-dirigida a la paleta.
- `screenshots/` — capturas reales (desktop, mobile, hero, rituales, equipo, reserva, booking, dark).
- `tools/` — el gate visual + build reproducibles (`harness.mjs`, `build.mjs`, `images.json`).

---

> **En una línea:** *el barro envuelve, el bisturí precisa; fotografía protagonista, tierra + teal con
> intención, la carta y la reserva como actos premium — lujo silencioso, listo para el cliente.*

— Elaborado por GSG (Diseño & Marca · Maestro Fable)
