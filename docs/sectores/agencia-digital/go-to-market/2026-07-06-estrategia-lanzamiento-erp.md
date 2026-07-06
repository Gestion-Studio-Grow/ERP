# Estrategia de lanzamiento online del ERP — vs. TuTurno

> **Sector:** Agencia Digital · **Célula 1** (Go-To-Market & Contenido) · **Fecha:** 2026-07-06
> **Basado en:** `../analisis-mercado/2026-07-06-analisis-competitivo-tuturno.md`
> **Objetivo (FUNDAMENTO §2):** la Agencia como motor de venta del propio ERP. Este doc define el
> **mensaje**, el **funnel** y el **plan de pauta piloto (USD 5–10/día)**. Los guiones están en
> `2026-07-06-guiones-campana-lanzamiento.md`. No toca prod ni Neon.

---

## 1. Diferencial (la tesis de la campaña)

TuTurno vende **la agenda**. Nosotros vendemos **el negocio entero**. No peleamos por ser "mejor
agenda" —cambiamos la unidad de comparación.

### Mensaje madre
> ## "Más que una agenda: tu negocio entero."

**Sub-mensaje / promesa:** *Turnos, caja, factura ARCA y tu tienda online — en un solo sistema. No
cuatro apps que no se hablan.*

### Los 4 pilares del diferencial (todos ya existen — ver FUNDAMENTO §4)
| # | Pilar | Qué le decimos al dueño | TuTurno |
|---|---|---|---|
| 1 | **Multi-rubro (Blueprints)** | "Sirve tu estética, tu local de mostrador o tu carnicería — el mismo sistema." | Mono-categoría por turno |
| 2 | **Facturación ARCA nativa** | "Facturás desde el mismo lugar donde cobrás. No un add-on." | Add-on de agenda |
| 3 | **Caja / POS / venta por kg** | "Controlás la plata de verdad, no solo la agenda." | Caja recién en tier Empresa |
| 4 | **Storefront + datos** | "Tu tienda online que vende + el sistema que te *habla* con tu dato real y te compara con tu rubro." | Analítica de agenda; sin tienda; sin benchmarking |

### Encuadre de precio (sin guerra de precios)
No competimos por ser más baratos en "turnos". Competimos por **valor por peso**: donde ellos cobran
**por profesional** y te dejan el cobro de señas y la caja en tiers altos, nosotros somos **un sistema
integrado**. El argumento no es "más barato", es *"¿cuántas apps estás pagando hoy? Nosotros somos
una."* — consolidación de stack. *(Pricing final del ERP: gate del dueño / a definir con el sector
Producto; en campaña se comunica valor integrado, no un número, hasta tener el pricing público
ratificado — provisional a confirmar.)*

---

## 2. El funnel (ad → demo → alta)

```
  [1] AD (Instagram Stories/Reels)         ← copiamos el molde de TuTurno en FORMA
        gancho: dolor de un rubro
        cuerpo: demo de celular (turno→caja→factura→tienda)
        CTA: "echá un vistazo más de cerca"
                 │
                 ▼
  [2] DEMO INTERACTIVA (Célula 3)           ← el destino del "vistazo". NO es prueba/alta todavía.
        experiencia guiada, sin registro:
        "reservá un turno → cobralo → facturalo → miralo en tu tienda"
        mide: % que completa el recorrido, tiempo, evento "quiero esto"
                 │
        ┌────────┴─────────┐
        ▼                  ▼
  [3a] ALTA / PRUEBA     [3b] LEAD (no listo)
     self-serve o          captura email/WhatsApp →
     "hablá con nosotros"   secuencia de nurture (contenido §5)
                 │
                 ▼
  [4] TENANT ACTIVO  → dato real → mejora analytics/benchmarking → mejor pauta (flywheel, FUNDAMENTO §2)
```

**Principio de fricción:** el ad NO manda a "creá tu cuenta" (fricción alta, como pedir matrimonio en
la primera cita). Manda a **ver** (fricción cero). La demo interactiva es la que **calienta** y recién
al final ofrece alta o dejar contacto. Esto copia la lógica de TuTurno ("echá un vistazo", no "comprá")
y la mejora con una demo que se *toca*.

**Eventos de medición mínimos (para pauta y optimización):**
- `ad_click` (desde Meta) · `demo_start` · `demo_step_completado` (turno/caja/factura/tienda) ·
  `demo_complete` · `cta_alta_click` · `lead_capturado` · `alta_iniciada`.
- KPI norte del piloto: **costo por `demo_complete`** y **costo por `lead_capturado`**. El alta se
  optimiza en una fase 2 con más presupuesto.

---

## 3. Plan de pauta piloto (USD 5–10/día)

**Presupuesto:** USD 5–10/día → **~USD 150–300/mes**. Objetivo del piloto **NO es vender**, es
**aprender barato**: qué rubro y qué gancho tienen mejor costo por resultado, para después escalar.

### Estructura de campaña (Meta Ads — Instagram Stories/Reels, igual que el competidor)
- **1 campaña** · objetivo **Tráfico** al arrancar (barato, llena rápido el pixel con `demo_start`);
  migrar a **Conversiones** sobre `demo_complete`/`lead` cuando haya ~30–50 eventos para optimizar.
- **Ubicaciones:** Instagram Stories + Reels (donde vive el formato de TuTurno). Sumar Feed como
  secundario. **Audience Network off** en piloto (tráfico basura).
- **Geo:** arrancar **hiperlocal** donde tenemos anclaje (corredor Canning/sur — ver
  `../analisis-mercado/2026-07-05-segmento-local-canning.md`) + CABA como test de escala. Radio y
  presupuesto chico para no diluir.
- **Segmentación:** intereses de gestión de comercio / dueños de PyME belleza-retail-gastronomía +
  **audiencia amplia** (dejar que el algoritmo encuentre con creativos fuertes — Advantage+ si el
  presupuesto lo permite). Edad 25–55.

### Presupuesto por conjunto (ejemplo a USD 8/día)
| Ad set | Gancho / rubro | Budget/día | Rol |
|---|---|---|---|
| A — Estética | "responder mensajes" (choque directo con TuTurno) | USD 3 | Cabeza a cabeza en su nicho |
| B — Retail/mostrador | "4 apps que no se hablan" | USD 3 | Terreno que ellos NO cubren |
| C — Carnicería/venta x kg | "vendés por kilo, facturás y cobrás en uno" | USD 2 | Prueba de multi-rubro (moat) |

> Con USD 5/día: correr solo A + B (USD 2,5 c/u) la primera semana. Con USD 10/día: A/B/C + un 4º set
> de retargeting a `demo_start` que no completó.

### Creativos por set
- **3 variantes de gancho** por rubro (mismo cuerpo/demo, distinto hook de los 3 primeros segundos) —
  es donde se gana o pierde el costo. Ver guiones.
- **1 versión con influencer** (voz de "dueña de local") por el set ganador, en fase 2 — TuTurno ya
  valida que el formato influencer funciona; no lo estrenamos hasta saber qué rubro/gancho rinde.

### Cadencia de optimización (regla simple, sin sobre-analizar)
- **Días 1–4:** no tocar nada (dejar salir del learning). Solo mirar que entreguen.
- **Día 5:** apagar el peor gancho de cada set; subir 20% el mejor ad set.
- **Día 10:** decidir rubro ganador (menor costo/`demo_complete`) → concentrar presupuesto ahí +
  encender retargeting.
- **Día 30:** informe de piloto → recomendación de escalar (o pivotear gancho/rubro) con número de
  costo por lead. **Escalar es decisión de PMO; presupuesto >piloto es gate del dueño.**

### Umbrales de éxito del piloto (provisionales, a calibrar con datos reales)
- 🟢 **Bueno:** costo por `demo_complete` ≤ USD 1,5 y ≥ 1 `lead_capturado`/día.
- 🟡 **Aceptable:** demo completa a ≤ USD 3; iterar ganchos.
- 🔴 **Revisar:** CTR de ad < 0,8% o casi nadie completa la demo → el problema es el creativo o la demo,
  no el presupuesto.

---

## 4. Contenido orgánico de soporte (nurture + prueba social)

La pauta sola no alcanza; TuTurno gana también por **máquina de contenido**. Mínimo viable para el
lanzamiento (Célula 1, sin costo de pauta):
- **Perfil de Instagram del ERP** con bio-gancho propia (equivalente a la de ellos, pero
  "sistema/negocio entero", no "turnos").
- **3 reels/semana** reciclando los ganchos de los ads (formato educativo: "las 4 apps que estás
  pagando de más").
- **Secuencia de nurture** para leads capturados que no dieron de alta: 3–4 mensajes
  (WhatsApp/email) mostrando un pilar del diferencial cada uno. Apalanca el comercio conversacional
  WhatsApp (`src/lib/wa-intent.ts`, palanca #2).

---

## 5. Handoff a Célula 3 — Demo interactiva (destino del "echá un vistazo")

**Estado actual (verificado en repo 2026-07-06):** **no existe todavía** un artefacto de "demo
interactiva" concreto. El charter menciona el **storefront como demo** y existen `/tienda`,
`/premium` (Tier Front Premium) y las vidrieras retail. Célula 1 **no construye** la demo (eso es
Célula 3 / Devs); define **el contrato de lo que la campaña necesita del otro lado del click**.

### Contrato de la demo (lo que Célula 1 le pide a Célula 3)
1. **Es el destino del CTA "echá un vistazo más de cerca".** URL única, estable, con parámetros UTM
   respetados (`?utm_source=ig&utm_campaign=lanzamiento&utm_content={rubro}`).
   - **Destino provisional a confirmar con Célula 3:** una ruta tipo `/demo` (o reutilizar `/premium`
     / `/tienda` como demo viva mientras `/demo` no exista). **Marcar como placeholder** hasta que
     Célula 3 confirme la ruta real.
2. **Recorrido guiado sin registro**, mobile-first (el 100% del tráfico viene de Stories en celular):
   **reservá un turno → cobralo (caja/MP) → facturalo (ARCA) → miralo en tu tienda**. Ese recorrido
   *es* la demostración del diferencial "negocio entero".
3. **Multi-rubro:** que la demo pueda mostrarse en clave estética / retail / carnicería según el
   `utm_content`, para que el que hizo click desde el ad de su rubro se vea reflejado.
4. **Instrumentación:** emitir los eventos del §2 (`demo_start`, `demo_step_completado`,
   `demo_complete`, `cta_alta_click`, `lead_capturado`) hacia el pixel de Meta + analítica propia.
   Sin esto, la pauta vuela a ciegas.
5. **Cierre de la demo:** al terminar el recorrido, ofrecer **(a)** alta/prueba y **(b)** "dejá tu
   WhatsApp y te lo mostramos" (captura de lead para nurture). Fricción baja: (b) siempre visible.
6. **Performance:** carga rápida en 4G (el usuario de Stories abandona en segundos). Reusar el trabajo
   de Lighthouse del Tier Front Premium (100, ver memoria de proyecto).

### Coordinación (por el repo, no por el chat — FUNDAMENTO §3)
- Este doc **es** el handoff. Cuando Célula 3 tome la demo, que deje su avance en
  `docs/sectores/agencia-digital/go-to-market/` (o donde el PMO indique) confirmando: **ruta real**,
  **eventos implementados** y **rubros soportados**. Célula 1 ajusta los CTA/UTM de los guiones a la
  ruta real una vez confirmada.
- **PMO:** secuenciar Célula 3 (demo) antes de poner plata en pauta — sin destino instrumentado, el
  piloto no mide. Si se quiere validar el creativo antes de que la demo exista, correr una semana
  mandando a `/premium` o `/tienda` como proxy y medir solo CTR/costo por click (no conversión).

---

## 6. Resumen ejecutivo (para el dueño)

- **Qué:** lanzar el ERP online copiando el molde de ads de TuTurno (Stories + influencer + demo de
  celular + "echá un vistazo"), pero con un mensaje que **cambia la categoría**: *"más que una agenda,
  tu negocio entero"*.
- **Por qué ganamos:** ellos son una agenda con periféricos; nosotros somos multi-rubro + ARCA + caja +
  tienda + datos, **todo ya construido**. No hay que inventar producto para la campaña.
- **Cómo:** funnel ad → **demo interactiva** (la construye Célula 3) → alta/lead. Pauta piloto **USD
  5–10/día** para aprender qué rubro/gancho rinde antes de escalar.
- **Qué falta antes de gastar:** que Célula 3 pare la **demo instrumentada** (destino del click). Es el
  cuello de botella del funnel.
- **Gates:** escalar presupuesto = decisión del dueño; pricing público del ERP = a ratificar con
  Producto. Nada de esto toca prod ni Neon.
