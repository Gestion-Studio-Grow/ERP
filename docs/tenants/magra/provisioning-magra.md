# Recipe de alta del tenant MAGRA Meat Market

**Tipo:** recipe de provisioning (config del tenant real) · **Fecha:** 2026-07-05
**Basado en:** `docs/preventa/analisis-redes-magra.md` (datos reales verificados en sus redes/web).
**Distinción clave:** el **rubro** `carniceria` es el template reusable (catálogo/ wording genéricos
premium); la **identidad real de magra** (nombre, dirección, WhatsApp, IG, tagline) es config del
**tenant**, y entra por los flags de branding del alta (pisan los defaults del rubro).

---

## 1. Comando de alta (con datos REALES de magra)

> Correr contra una **DB local** (branch de Neon o Postgres local, NUNCA prod) con la migración POS
> aplicada y RLS activo si ya hay otro tenant. No aplica a Neon sin OK (Gate 2).

```bash
npm run provision -- \
  --name "MAGRA Meat Market" \
  --slug magra \
  --owner-email hola@magrameatmarket.com.ar \
  --blueprint carniceria \
  --short-label "MAGRA · Canning" \
  --city "Canning, Buenos Aires" \
  --address "José Champagnat 4351, Local 1 – Sotavento Point, Canning" \
  --whatsapp 5491161354042 \
  --instagram @tiendamagra \
  --hours-label "Lun a Sáb 10–20h · Dom 9–13h" \
  --contact-email hola@magrameatmarket.com.ar \
  --contact-note "Esto no es una carnicería. Carnes premium envasadas al vacío. Delivery gratis en Canning, San Vicente, Guernica, Ezeiza y Monte Grande."
```

Con esto la vidriera `/tienda` muestra: el **acento de marca de magra** (oxblood, ya mapeado en
`src/lib/branding.ts`), su **tagline real** en el hero (contactNote), su WhatsApp real en el CTA
"Pedir por WhatsApp", y el **catálogo premium** del rubro carnicería.

## 2. Catálogo real de magra (más allá del rubro genérico)

El rubro `carniceria` siembra los **cortes premium** (vacuno Angus, cerdo magro, pollo orgánico,
preparados). magra además vende **gourmet/almacén** — esto es **específico del tenant**, se carga
en su Catálogo (o se agrega a un seed de magra). Productos reales verificados (precios **provisionales**
hasta recibir su lista real — §3):

| Categoría | Productos reales (de sus redes) | Venta | Estado precio |
|---|---|---|---|
| Vacuno | Cortes Angus (**Estancia Don Ramón**, distribuidor oficial) envasados al vacío | kg | provisional |
| Cerdo | Cortes magros, bajos en grasa | kg | provisional |
| Pollo | Pollo orgánico | kg/u | provisional |
| Gourmet | **Pasta italiana** (Lamberti), **conservas importadas**, **pescado congelado**, ensaladas/vegetales envasados | u | provisional |
| Marcas | Paladini, Formagge, Tinos, Breaders, Pizzazen, Maderasa | — | — |

*(El gourmet no está en el seed del rubro `carniceria` a propósito: no toda carnicería lo vende. Se
agrega como catálogo del tenant magra cuando el dueño confirme SKUs/precios reales.)*

## 3. Pendiente del dueño para pasar a producción

- **Lista de precios real + SKUs** (hoy su tienda corre en Bistrosoft y carga por JS; ver
  `competencia-bistrosoft.md` §"magra usa Bistrosoft"). Reemplaza los precios provisionales.
- **Paleta de marca exacta** (hex) + logo/tipografía → refinar el acento/theming (hoy oxblood aprox.).
- **Fotos de producto** con permiso de uso para la vidriera.
- Confirmar **modelo de venta** (pack a precio fijo vs. por kg pesado). Hoy: cortes por kg + packs/gourmet por unidad.

## 4. Notas de fidelidad al negocio real

- Tagline **"Esto no es una carnicería"** → va en el hero (contactNote), es su posicionamiento.
- Tono **descontracturado** ("buen gusto y hambre") → el copy de la vidriera acompaña, no es acartonado.
- **Delivery gratis** en 5 zonas y **WhatsApp** como canal → reflejado en el contactNote y el CTA de WhatsApp.
- **Envasado al vacío** → presente en el wording del rubro ("envasados al vacío").
