# Análisis de presencia digital — MAGRA Meat Market (prospecto → tenant)

**Tipo:** análisis de preventa (lectura del negocio real desde sus redes) · **Fecha:** 2026-07-05
**Objetivo:** entender el negocio REAL de magra desde su presencia digital pública y traducirlo
en un tenant a medida. Método reutilizable en `docs/preventa/playbook-lectura-redes-a-tenant.md`.

> **Rigor:** todo lo de §1–§4 es **verificado** en fuentes públicas (web oficial, linktree,
> reseñas indexadas). Lo que NO pude ver (Instagram/TikTok tras login, precios exactos) está en
> §6 como pedido explícito al dueño. Los precios del catálogo adaptado son **estimados provisionales**,
> marcados como tales — no inventados como reales.

---

## 1. Identidad y posicionamiento (verificado)

- **Nombre:** MAGRA Meat Market · **Rubro:** boutique de carnes premium · **Ubicación:** Canning, Bs. As.
- **Eslogan/posicionamiento (textual):** **"Esto no es una carnicería"** · *"Estilo, practicidad y
  sabor premium en un solo pack"*.
- **Modelo de negocio REAL (insight clave):** NO es una carnicería tradicional de mostrador con
  venta al corte por kg. Es una **boutique premium de carnes ENVASADAS AL VACÍO**, orientada a
  **delivery y pedidos por WhatsApp**. El producto se vende como **pack seleccionado**, con foco en
  presentación gourmet y practicidad ("no hace falta saber de cortes").
- **Tono de marca (textual):** descontracturado, cercano, sin pretensiones —
  *"No hace falta saber de cocina, ni de cortes. Solo tener buen gusto (y hambre!)"*.

## 2. Catálogo real (categorías verificadas; SKUs/precios pendientes §6)

- **Carne vacuna** — **distribuidor oficial de Estancia Don Ramón** (Angus premium), envasada al vacío.
- **Cerdo** — cortes magros, bajos en grasa.
- **Pollo orgánico.**
- **Gourmet (almacén premium):** ensaladas y vegetales envasados, pescado congelado envasado,
  **pasta italiana**, **conservas importadas**.
- **Marcas/proveedores mencionados:** Estancia Don Ramón, Paladini, Lamberti, Formagge, Tinos,
  Breaders, Pizzazen, Maderasa.
- *Precios: NO publicados en la web; su lista de precios vive en su tienda online (ver §5).*

## 3. Servicios (verificado)

- **Delivery GRATUITO** en: **Canning, San Vicente, Guernica, Ezeiza, Monte Grande**.
- **Envasado al vacío** garantizado (parte del valor).
- **Pedidos por WhatsApp** con atención personalizada (canal de venta principal).
- **Medios de pago:** efectivo, débito/crédito, transferencia, **Mercado Pago**.

## 4. Contacto, marca y reputación (verificado)

- **Dirección:** José Champagnat 4351, Local 1 – Sotavento Point, Canning.
- **WhatsApp pedidos:** +54 9 11 6135 4042 (`wa.me/5491161354042`) · **Tel:** +54 9 11 7609 5555.
- **Email:** hola@magrameatmarket.com.ar · **Horarios:** Lun–Sáb 10–20h · Dom 9–13h.
- **Redes:** Instagram [@tiendamagra](https://www.instagram.com/tiendamagra/), Facebook, TikTok.
- **Estética:** premium / boutique / minimalista, "pinta gourmet", presentación impecable
  (descripción textual; **paleta hex exacta pendiente** §6).
- **Reputación (reseñas indexadas):** elogian **calidad**, **presentación gourmet**, packs bien
  envasados y **atención que explica cada corte con paciencia**. Señal: el diferencial percibido es
  *calidad + presentación + asesoramiento*, no precio.

## 5. 🎯 Hallazgo de preventa decisivo: magra HOY corre sobre Bistrosoft

Su "Lista de precios" (linktree) redirige a **`borders.bistrosoft.com/menu?commerceId=11113834…`**:
la tienda online de magra **está montada sobre Bistrosoft**. Es decir, **Bistrosoft es el sistema
que hoy usa magra** — exactamente el incumbente que nuestro tenant debe igualar y superar. Esto
convierte el análisis competitivo en concreto: no competimos en abstracto, reemplazamos su stack
actual. (El menú carga por JavaScript, así que los precios exactos no se pudieron transcribir; §6.)

## 6. Lo que NO pude ver — pedido explícito al dueño

Para cerrar el tenant a nivel producción necesito del dueño:
1. **Lista de precios real + SKUs** (su tienda Bistrosoft carga por JS; no la pude transcribir).
   Ideal: export/planilla, o capturas de la lista. Hoy uso **precios estimados provisionales**.
2. **Acceso al contenido de Instagram** (@tiendamagra) — el dueño pasó el link
   (`instagram.com/tiendamagra`, 2026-07-05). **Intenté extraerlo con todas mis herramientas:**
   (a) fetch del perfil → sólo devuelve el nombre "MAGRA Meat Market · Canning", sin bio/posts/meta
   (login-gated, render por JS); (b) endpoint JSON público `?__a=1` → ya no responde sin auth;
   (c) navegador (Chrome MCP) → **no hay navegador conectado** (extensión no instalada). Conclusión:
   el link **confirma el handle real** (@tiendamagra, coincide con su web), pero **bio, posts y
   especialmente los reels del proceso NO son accesibles** por herramientas. **Necesito del dueño
   capturas o una descripción de 2-3 videos clave:** (i) el **proceso/envasado al vacío**, (ii) un
   recorrido de **cortes/catálogo**, (iii) el **local/experiencia de compra**. (Opcional: si conecta
   la extensión de Chrome e inicia sesión en IG, podría leer más — pero IG igual limita el scraping.)
3. **Paleta de marca exacta** (hex de su oxblood/negro/crema) y logo/tipografía, para el theming.
4. **Fotos de producto** con permiso de uso para la vidriera.
5. Confirmar el **modelo de venta**: ¿packs a precio fijo por unidad, o por kg pesado? (asumo mix:
   cortes por kg + gourmet/packs por unidad).

## Supuestos tomados (modo autónomo, marcados)

- **Modelo de catálogo:** cortes vacunos/cerdo/pollo por **kg** (muestra nuestro diferencial de venta
  por peso) + gourmet/preparados por **unidad**. *(Supuesto; confirmar §6.5.)*
- **Precios:** estimados de gama premium AR (mediados 2026), **por encima** de una carnicería estándar
  (es boutique). **Provisionales.**
- **Gourmet (pasta/conservas)** es específico de magra (no de toda carnicería): va como **catálogo del
  tenant**, no del rubro genérico (ver `docs/tenants/magra/provisioning-magra.md`).

## Fuentes

- [Web oficial — magrameatmarket.com.ar](https://magrameatmarket.com.ar/)
- [Linktree — linktr.ee/magrameatmarket](https://linktr.ee/magrameatmarket) (incl. "Lista de precios" → Bistrosoft)
- [Instagram @tiendamagra](https://www.instagram.com/tiendamagra/) · [@magracarniceria](https://www.instagram.com/magracarniceria/)
- Reseñas de clientes indexadas (búsqueda web, 2026).
