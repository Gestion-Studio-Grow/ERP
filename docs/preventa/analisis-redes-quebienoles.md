# Análisis de redes — Qué Bien Olés (perfumería, Ezeiza)

**Relevado:** 26/09/2026, desde el Instagram público `@quebienoles` (sin sesión), con el método de
`docs/preventa/playbook-lectura-redes-a-tenant.md`. **Tenant:** `quebienoles` · rubro `perfumeria`.

> Etiquetas: **[VERIFICADO]** = visto en la fuente citada · **[A VALIDAR]** = hay que confirmarlo con el
> dueño (se dice cómo) · **[CONTRADICTORIO]** = dos fuentes dicen cosas distintas.

## 1. Presencia digital

| Canal | Qué hay | Estado |
|---|---|---|
| Instagram `@quebienoles` | 146 seguidores · 3 publicaciones públicas (14, 15 y 17/09/2026) | [VERIFICADO] |
| Web / Linktree / tienda | No hay link en la bio | [VERIFICADO] (no existe) |
| WhatsApp | No publicado | [VERIFICADO] (no existe público) |
| Responsable | La bio menciona `@juanmariera_` | [VERIFICADO] (el usuario; el nombre completo no se infiere) |

## 2. Modelo de negocio — cómo vende

- **Qué:** perfumes árabes. Bio: "💎 Perfumes árabes al mejor precio". [VERIFICADO]
- **Cómo:** pedidos por mensaje directo. Bio: "💬 Escribinos y te enviamos catálogo"; posteo 15/09: "📩 Pedidos y consultas por MD". [VERIFICADO]
- **Entrega:** "📦 Entrega mediante envío o punto de encuentro" · "📍 Ezeiza". [VERIFICADO]
- **Pago:** "💳 Consultanos por medios de pago" → **no se publica ningún medio**. [VERIFICADO]
- **Momento:** relanzamiento. Posteo 14/09: "VOLVIMOS. Y esta vez, vinimos a hacerte oler muy bien." [VERIFICADO]
- **Incumbente:** ninguno (vende por MD, sin sistema). Paridad a superar: el catálogo como placa de imagen y el pedido por chat.

## 3. Catálogo real — carrusel del 15/09/2026 (`instagram.com/quebienoles/p/DdUdq_BlpYZ`)

Cinco placas: portada "Stock disponible — Encontrá tu perfume ideal" (Dulces de noche · Frescos día a día ·
Versátiles para todo · Femeninos ellas eligen) y una placa por familia. **25 perfumes con precio** [VERIFICADO],
transcriptos a `src/app/tienda/quebienoles/perfumes.ts` y cruzados por test (`quebienoles.test.ts`).

| Familia (placa) | Perfumes y precio |
|---|---|
| Más dulces — "Intensos, adictivos, de noche" | 9PM Night Out $47.000 · Khamrah $45.000 · Liquid Brun $49.000 · Yara Candy $32.000 · Give Me Gourmand $45.000 · Asad Bourbon $32.000 · Cocoa Morado $38.000 |
| Más frescos — "Energía, elegancia, todos los días" | Odyssey Limoni $37.000 · Club de Nuit Iconic $46.000 · Hawas Ice $34.000 · 9AM Dive $35.000 · Odyssey Mandarin Sky $37.000 · Hawas Tropical $34.000 |
| Versátiles — "Para cualquier ocasión" | 9PM $35.000 · Club de Nuit Intense Man $40.000 · Afnan Supremacy $44.000 · Bharara Bleu $59.000 · Bharara King (Gold Edition) $59.000 · Al Haramain Amber Oud Aqua Dubai $54.000 |
| Femeninos — "Elegancia en cada detalle" | Yara Pink $32.000 · La Vida es Bella $20.000 · Eclaire $39.000 · Kayali Vanilla Candy $25.000 · Sakeena $38.000 · Afeef $59.000 |

**Ficha olfativa** (casa, concentración, acordes, pirámide): Fragrantica, con la URL de cada perfume en
`perfumes.ts`. Es la ficha pública del perfume, no algo que haya dicho la marca: la vidriera la muestra con
la fuente a la vista.

- **[CONTRADICTORIO] Bharara Bleu:** la pirámide de Fragrantica (naranja, bayas, vainilla) no coincide con la
  del sitio oficial de Bharara (ron, tabaco). **No se publica ninguna** hasta que el dueño diga cuál vende.
- **[A VALIDAR] La Vida es Bella ($20.000) y Kayali Vanilla Candy ($25.000):** la placa muestra los frascos de
  Lancôme y Kayali a precios que no corresponden al original de 100 ml. Se publican con el nombre que usa la
  marca, **sin casa ni pirámide** y con aviso "Consultanos la presentación antes de pedirlo". Cierre: que el
  dueño diga qué presentación es (original, decant o alternativa) y cómo quiere publicarlo.
- **[A VALIDAR] Presentación (ml)** de cada perfume: no figura en las placas. Cierre: lista del dueño.
- **[A VALIDAR] Stock por perfume:** la marca dice "Stock disponible" sin cantidades. Los productos entran sin
  control de stock (`trackStock=false`); cuando el dueño cargue cantidades, la vidriera avisa "Últimas unidades"
  y "Sin stock" sola.

## 4. Marca y tono

- **Logo** (foto de perfil): círculo negro, "QUÉ / *Bien* / OLÉS" — didona en mayúsculas con "Bien" en
  caligrafía— y "PERFUMERÍA" en versales, con un frasquito sobre la É. [VERIFICADO]
- **Sistema visual de las placas:** negro laca, oro en degradé (crema → ámbar), didona blanca de alto
  contraste, rótulos en versales muy espaciadas, filetes dorados finos, íconos de trazo en círculos dorados
  (caramelo, limón, corbata, ♀), mármol negro de vetas doradas, caja negra con **Q y corona** doradas. [VERIFICADO]
- **Frases propias** (se usan textuales): "Perfumes que dejan huella" · "Fragancias que enamoran" · "Más que
  perfumes, experiencias" · "Encontrá el perfume que va con vos" · "¿No sabés cuál elegir? Escribinos y te
  ayudamos a encontrar el indicado" · "No sé qué regalarte… Nosotros tenemos algunas ideas" · "Mandale este
  reel al que necesite entender la indirecta 😬". [VERIFICADO]
- **Voz:** cercana, de vos, criolla, con humor liviano. Es la que usa la vidriera.

## 5. Traducción a tenant (dónde quedó cada cosa)

| Lo leído | Dónde vive |
|---|---|
| Rubro y modelo (unidad, familias, sin vencimientos) | Rubro reusable `perfumeria` — `src/blueprints/retail/rubros.ts` |
| Voz, frases, casas | Copy de la marca — `src/tenants/storefront.ts` (`quebienoles`) |
| Catálogo, familias, fichas | `src/app/tienda/quebienoles/perfumes.ts` (+ carga: `scripts/tenants/quebienoles-catalogo.ts`) |
| Fotos de los frascos | Recortadas de las placas: `docs/tenants/quebienoles/fotos/recortar-placas.py` → `public/tenants/quebienoles/perfumes/` |
| Identidad visual | Front propio `src/app/tienda/quebienoles/` (acento ámbar en `src/lib/branding.ts`) |
| Ezeiza, Instagram | `BusinessSettings` del alta (`--city`, `--instagram`) |

## 6. Pendiente del dueño (Qué Bien Olés)

1. Presentación de **La Vida es Bella** y **Kayali Vanilla Candy** (original, decant o alternativa).
2. Cuál **Bharara Bleu** vende (para publicar su pirámide).
3. **ml** de cada perfume y **stock** por perfume.
4. **Medios de pago** que acepta (hoy la vidriera dice "te los pasamos por mensaje").
5. **WhatsApp** si quiere que los pedidos lleguen también por ahí (se carga en el panel; la vidriera lo suma sola).
6. **Fotos originales en alta** de los frascos (las de hoy salen de Instagram, 1254 px por placa).
7. **Mail real** del dueño para el usuario del panel (hoy provisional).

— Elaborado por GSG
