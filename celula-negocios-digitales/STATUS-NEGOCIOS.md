# STATUS DE NEGOCIOS — Tablero del dueño

> **Cómo leer esto:** este es el parte de situación de todos los negocios que inventó y analizó la
> célula. Está escrito para que **alguien que no sabe nada del proyecto lo entienda solo**. Cada negocio
> trae: qué es en criollo, en qué estado está, y los números clave (qué cuesta construirlo, cuánto sale
> operarlo, a cuánto se vende, qué margen deja y cuántos clientes hacen falta para facturar).
>
> **Actualizado:** 2026-07-06 · **Autor:** PMO · **Regla:** todo LOCAL, nada publicado.

## Qué es la célula (contexto de cero)
Un equipo de agentes de IA que funciona como una **consultora interna**: inventa negocios digitales que
se pueden construir rápido con IA (Claude Code), los analiza con números reales de mercado, los somete a
un "red-team" que intenta tumbarlos, y le entrega al dueño solo los que sobreviven — con un plan para
construirlos y venderlos. Funciona en **ciclos semanales** hasta que el dueño lo frene.

## Leyenda de estados
🛠️ **En desarrollo** · ✅ **Validado** (pasó el filtro, esperando luz verde) · ⚠️ **Herido** (viable con
condiciones) · ☠️ **Descartado** (el red-team lo mató, con motivo) · 💡 **Idea** (propuesto, sin red-team aún)

> **Nota sobre los números:** "para US$X/mes" = cuántos clientes o ventas mensuales hacen falta para
> llegar a esa facturación. "Build" = semanas de trabajo del equipo (con Claude Code el gasto en efectivo
> es bajo, US$100–500). "COGS" = lo que cuesta atender a un cliente por mes (sobre todo tokens de IA).
> Todo en dólares (cobrar en USD desde Argentina se liberó en 2025).

---

## A. EN DESARROLLO AHORA (4 negocios — arrancaron 2026-07-06)

### 🛠️ Kudos — reseñas en piloto automático
- **Qué es (de cero):** un servicio que le consigue reseñas de 5 estrellas a un comercio (con un QR en el
  ticket o un WhatsApp después de la compra) y **responde todas las reseñas** por él, con el tono de su
  marca. Más reseñas buenas = más ventas.
- **Números:** build **2–3 semanas** · COGS **US$3–10/local/mes** · precio **US$99–149/mes** por local
  (+ setup US$100–200) · margen **90–95%** · para **US$5.000/mes → 34–50 locales** · primer peso en **3–5
  semanas**.
- **Por qué gusta:** el líder (Birdeye) cobra US$299–449 → hay lugar para entrar a un tercio del precio.
  Es el de **mejor margen** de todos.
- **Estado dev:** kickoff en curso (spec + arquitectura + motor de respuestas + plan).

### 🛠️ Fantasma — el "turno noche" de WhatsApp
- **Qué es (de cero):** un empleado de IA que atiende el WhatsApp del negocio **fuera de horario** (noche
  y fin de semana): responde, cotiza, agenda y deja los clientes "calientes" anotados para la mañana. El
  lunes entrega un reporte de "la plata que se hubiera escapado".
- **Números:** build **1–2 semanas** · COGS **US$15–30/cliente/mes** (¡sube a US$60–120 si hay mucho
  volumen!) · precio **US$120–300/mes** + extra por cliente atendido · margen **80–85%** · para
  **US$5.000/mes → ~25 clientes** · primer peso en **2–3 semanas** (el más rápido).
- **Regla de oro:** se cobra **por uso** (con un tope de conversaciones incluidas + excedente), nunca una
  tarifa plana, o los tokens se comen la ganancia.
- **Estado dev:** kickoff en curso (incluye el modelo de pricing por uso).

### 🛠️ Testigo — parte de trabajo desde una foto y un audio
- **Qué es (de cero):** para plomeros, obras, jardineros, fumigadores. El operario manda una **foto + un
  audio** por WhatsApp y recibe un **informe de trabajo profesional** (foto antes/después, checklist,
  firma) en PDF para mostrarle al cliente. Hace que un laburo se vea prolijo y se cobre más caro.
- **Números:** build **3–4 semanas** · COGS **~US$2/operario/mes** (muy barato) · precio
  **US$15–30/operario/mes** (un contratista de 5 = US$75–150) · margen **~90%** · para **US$5.000/mes →
  35–50 cuadrillas** · primer peso en **4–6 semanas**.
- **Por qué gusta:** una vez que es su forma de entregar, **cambiarse duele** → los clientes no se van.
- **Estado dev:** kickoff en curso (arranca por 1 rubro).

### 🛠️ Plantillería — plantillas listas para Argentina
- **Qué es (de cero):** una tienda de **plantillas** (planillas de Excel / Notion) hechas para la realidad
  argentina: control de monotributo, sueldos, gastos, presupuestos por oficio. Se hacen una vez y se
  venden infinitas veces, sin costo de atención.
- **Números:** build **1–2 semanas** · COGS **~US$0** (solo la comisión de la pasarela de pago, ~5%) ·
  precio **US$25–75 por plantilla** (pago único) · margen **90–95%** · para **US$1.000/mes → ~37 ventas**
  (caso real citado: US$1.800 en un mes con 3 plantillas) · primeras ventas en **semanas**.
- **El desafío:** no es el costo, es la **distribución** — hay que hacer que la gente la encuentre.
- **Estado dev:** kickoff en curso (catálogo + landing + plan de distribución).

---

## B. VIABLES PERO NO EN DESARROLLO (heridos — esperan decisión)

### ⚠️ El Data Semanal — newsletter de finanzas AR con sponsors
- **Qué es (de cero):** un boletín por email, 1 dato + 1 gráfico por semana sobre la economía cotidiana
  argentina (dólar, plazo fijo, inflación). Se monetiza con **auspiciantes** (fintech, billeteras).
- **Números:** build **1 semana** · CPM (precio por mil lectores) realista AR **US$20–45** · con **20.000
  suscriptores → ~US$600 por envío** · primeros sponsors chicos con ~3–5k subs (US$100–200) a los **4–8
  meses** · ingreso serio recién a los **12–18 meses**.
- **Veredicto:** no como negocio solo (tarda mucho); sí como **pieza de otro producto** (una herramienta
  capta el email → la newsletter retiene → el sponsor paga).

### ⚠️ Mapa del Barrio — micro-directorios locales
- **Qué es (de cero):** guías online hiperlocales ("veterinarias 24h en tal barrio") que se llenan solas
  con reseñas de la gente. Se cobra a los comercios por aparecer destacados.
- **Números:** build **2–3 semanas** por zona · precio **US$15–25/mes** por comercio · para **US$2–3k/mes
  → 100–150 comercios** + US$500–800 de banners · primer peso a los **2–4 meses**.
- **Veredicto:** sobrevive a Google pero **la venta a comercios es trabajo activo** — es más "negocio
  local replicable" que ingreso pasivo.

---

## C. DESCARTADOS POR EL RED-TEAM (con motivo)

| Negocio | Qué era | Por qué murió |
|---|---|---|
| ☠️ **Calculadoras fiscales** | red de calculadoras (sueldo, aguinaldo) con publicidad | ya hay 8 sitios gratis buenos + la publicidad en AR paga muy poco |
| ☠️ **Cambió el Precio** | historial de precios para detectar falsas ofertas | MeliPrice/MercadoTrack ya existen + cuesta mucho construirlo y monetiza flojo |
| ☠️ **Mercader** | gestión automática de una cuenta de MercadoLibre | MercadoLibre ya responde con su propia IA gratis + depende 100% de su plataforma |
| ☠️ **Confesionario** | encuestas por voz a clientes | ya hay competidores (Vokalis/Burbuxa) + la voz cuesta 15–30× el texto y funde el margen |

---

## D. PORTFOLIO RONDA 1 (12 ideas — anteriores al red-team, sin filtrar aún)

> Estas salieron del primer ciclo y **todavía no pasaron por el red-team**, así que sus números son de
> referencia, no confirmados. Ordenadas por puntaje del analista.

| Negocio | Qué es (de cero) | Precio ref. | Puntaje |
|---|---|---|---|
| 💡 **Postora** | community manager con IA para comercios de barrio (les hace el contenido del mes) | US$29–59/mes | 9 |
| 💡 **Recepcionista IA vertical** | recepcionista de IA (voz + WhatsApp + agenda) para clínicas/estéticas | setup US$300–1k + US$150–500/mes | 9 |
| 💡 **Directorio B2B + lead-gen** | directorio de un rubro que vende contactos de clientes | leads US$30–50 + suscripción | 8.5 |
| 💡 **VetVoz** | dicta la historia clínica por voz para veterinarias | suscripción | 8 |
| 💡 **Vitrina** | fotos de producto + ficha listas para vender online | freemium + créditos | 8 |
| 💡 **Back-office AFIP** | concilia facturas/AFIP para pymes y contadores | retainer US$500–2k/mes | 8 |
| 💡 **Comparador con afiliados** | comparador de un nicho que cobra comisión | comisión recurrente | 8 |
| 💡 **Calificación de leads WhatsApp** | filtra y califica clientes por WhatsApp para rubros de ticket alto | retainer + fee por resultado | 8 |
| 💡 **Calculadoras fiscales AR** | herramientas fiscales con tier pro | ads + tier pro | 7.5 |
| 💡 **MediaKit.ar** | arma el "media kit" de micro-influencers en 60s | freemium/one-time | 7 |
| 💡 **PrevenIA** | compliance de Seguridad e Higiene para pymes | suscripción | 7 |
| 💡 **GremioPro** | presupuesto + agenda + cobro para oficios | suscripción + MP | 7 |

*(Cuando el ciclo semanal los pase por el red-team, se moverán a las secciones A/B/C con sus números
firmes.)*

---

## Cómo pedir el status
Decí **"status"** y el PMO te devuelve este tablero actualizado: la lista de negocios, su estado y los
números precisos. El **Reportero ejecutivo** de la célula lo refresca en cada ciclo semanal. El ciclo
**sigue corriendo hasta que digas "frená"**.
