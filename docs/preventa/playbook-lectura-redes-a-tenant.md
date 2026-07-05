# Playbook de preventa — de las redes del prospecto a un tenant a medida

**Tipo:** guía de método reutilizable · **Dueño del proceso:** PO + preventa
**Para qué:** convertir la **presencia digital real** de un prospecto (Instagram, TikTok, web,
Google, Linktree) en un **tenant configurado a medida** del ERP, para que en la demo el cliente
sienta *"esto está hecho para mi negocio"*. Es una capacidad central de nuestra venta: no mostramos
un demo genérico, mostramos **su** negocio corriendo en nuestra plataforma.

> **Regla de oro — no inventar.** Todo dato va etiquetado como **verificado** (lo vi en una fuente
> pública), **provisional** (estimación razonable marcada como tal) o **pedido al dueño** (no accesible).
> Un tenant a medida con datos inventados es peor que uno honesto con huecos marcados.

---

## El método en 7 pasos

### 1. Mapear la presencia digital
Buscar y listar todo: **web propia**, Instagram/TikTok/Facebook, **Linktree/link-in-bio**, ficha de
Google, marketplaces. La web propia y el Linktree suelen ser **públicos y ricos** (la web fue la fuente
de oro en magra); Instagram/TikTok normalmente están **tras login** → se piden capturas al dueño.

### 2. Leer el MODELO de negocio (no solo qué vende, sino CÓMO)
La pregunta que más cambia el tenant: **¿cómo vende?**
- ¿Mostrador al corte (por kg) o **packs/producto envasado** (por unidad)?
- ¿Presencial, **delivery-first**, o mixto? ¿Retiro/envío?
- ¿Canal de pedido: local, web, **WhatsApp**, apps?
- *Ej. magra:* NO es carnicería de mostrador — es **boutique premium envasada al vacío, delivery + WhatsApp**.
  Ese insight reorienta el catálogo (packs) y el copy, no solo los nombres.

### 3. Extraer el catálogo real
Categorías, productos, **proveedores/marcas** (dan pistas de nivel: "distribuidor oficial de X" = premium).
Si hay lista de precios pública, transcribir; si no, **estimar y marcar provisional** + pedirla.

### 4. Extraer servicios y operación
Delivery (**zonas**), medios de pago (¿Mercado Pago?, transferencia, cuenta corriente/fiado), envasado,
horarios. Cada uno mapea a un módulo/flujo del tenant.

### 5. Extraer marca y tono
Colores, tipografía, **tagline/posicionamiento** (textual), voz (formal vs descontracturada), fotos del
proceso. El **tono** se refleja en el copy de la vidriera; el **color** en el acento por tenant.
- *Ej. magra:* tagline **"Esto no es una carnicería"**, tono cercano ("buen gusto y hambre").

### 6. 🎯 Detectar el sistema incumbente (a quién reemplazamos)
Seguir los links de "tienda"/"lista de precios": muchas veces revelan **qué software usa hoy** el
prospecto. Eso convierte el análisis competitivo en concreto y define la **paridad de reemplazo**.
- *Ej. magra:* su lista de precios redirige a **Bistrosoft** → sabemos exactamente qué igualar/superar.

### 7. Traducir a tenant (dónde va cada cosa)
| Lo que leíste | A dónde va en la plataforma |
|---|---|
| Rubro / modelo de venta | **Blueprint + rubro** (`--blueprint <rubro>`), o el comodín `generico` si no matchea |
| Catálogo genérico del rubro | **Rubro** (`src/blueprints/retail/rubros.ts`) — template reusable |
| Nombre, dirección, WhatsApp, IG, tagline, horarios | **Config del TENANT** — flags de branding del alta (`--whatsapp`, `--city`, `--contact-note`…) |
| Catálogo/productos ESPECÍFICOS del negocio | Catálogo del tenant (seed a medida / carga en panel), no el rubro |
| Color de marca | **Acento por tenant** (`src/lib/branding.ts`) |
| Tono/posicionamiento | Copy: hero (contactNote/tagline) + wording del rubro |
| Servicios (delivery, WhatsApp, pagos) | Fulfillment, CTA de WhatsApp, medios de pago; gaps → backlog |

> **Distinción que no se negocia:** *config por RUBRO* (reusable, sirve a todos los del rubro) ≠
> *config por TENANT* (la identidad de ESE negocio). Meter la dirección de un cliente en el rubro
> genérico ensucia el template; meterla en el tenant es correcto. (Ver el caso en
> `docs/tenants/magra/provisioning-magra.md`.)

---

## Entregable de preventa (checklist)

1. **Análisis de redes** (`docs/preventa/analisis-redes-<prospecto>.md`): identidad, modelo, catálogo,
   servicios, marca/tono, incumbente, fuentes, y **§ "pendiente del dueño"** con lo no accesible.
2. **Recipe de alta** del tenant (comando `provision` con flags reales) + catálogo específico.
3. **Paridad vs. incumbente**: tabla capacidad-por-capacidad, gaps críticos marcados.
4. **Demo a medida**: la vidriera del tenant con su marca, catálogo y copy — corriendo en local.

## Errores a evitar
- Inventar precios/productos como si fueran reales (usar "provisional" + pedirlos).
- Confundir "lo que vende" con "cómo vende" (el modelo define el tenant).
- Hardcodear la identidad de un cliente en el rubro reusable.
- No mirar el incumbente: perdés la referencia exacta de paridad.
- Prometer paridad sin cerrar los gaps críticos (ej. cobro online) — listarlos honesto.

## Caso trabajado
`docs/preventa/analisis-redes-magra.md` + `docs/tenants/magra/provisioning-magra.md` +
`docs/tenants/magra/competencia-bistrosoft.md §0`.
