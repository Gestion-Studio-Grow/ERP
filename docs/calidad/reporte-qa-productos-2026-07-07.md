# Reporte QA — Productos live (4 clientes) · pasada end-to-end 2026-07-07

**Equipo:** Calidad / QA (GSG) · ventana de afinado, ultra-ahorro.
**Método (ADR-052 + DX-5):** recorrido de usuario real con **navegador** (accessibility tree +
`innerText` de header/footer + consola + click), no `WebFetch` (no agarra header/footer). Calibrado
contra CLAUDE.md y `docs/lecciones-aprendidas/registro.md`. **Solo lectura, no se tocó prod/deploy/Neon.**
**Foco:** regresiones tras los últimos merges (C-1, J-2, OP-2/OP-3) + que el front refleje lo REAL (DX-5).

---

## Regresiones — verificadas OK ✅ (no romperlas)

- **C-1 (MT-2) RESUELTO:** `chestetica-erp.vercel.app` **ya sirve la vidriera pública** — hero real,
  catálogo enorme de servicios reales por categoría (Faciales/Cejas/Manos/Masajes/Corporal/Spa de
  pies/Depilación/Capacitaciones, con precio+duración), equipo, "cómo reservar", contacto. **No** cae
  a `/admin/login`.
- **Reserva CH + gate "vecino/a de La Alameda":** el botón **Reservar abre el modal** ("Paso 1 de 5 ·
  Servicio") con el toggle **"¿Sos vecino/a de La Alameda?"** funcionando. ✅
- **J-2 (MT-1) RESUELTO:** el login por tenant ya está brandeado — `magra-erp/admin/login` muestra
  **"Magra"** (antes mostraba "CH Estética / Beauty & Spa"). ✅
- **Consola limpia** (sin errores/exceptions) en CH, Magra, Shine.
- **Carrito + WhatsApp just-in-time:** sin cambios respecto de la pasada anterior (verificado end-to-end
  en adosmanos: carrito suma, prompt just-in-time sin placeholder). DX-4 sigue OK.

---

## Defectos priorizados (nuevos / persistentes)

### 🟠 ALTO

**A-1 · CH Estética — el EQUIPO muestra servicios idénticos y NO representativos por profesional.**
En la home de CH, las **tres** profesionales (Carolina Haponiuk, Macarena Arias, Romina Delpardo)
muestran **exactamente la misma lista** de servicios, y encima **solo de depilación**:
*"Zona chica (bozo, mentón…) · Axilas · Combo: bozo + axilas + piernas completas + cavado con tira de
cola · Combo: axilas + piernas completas"*. Carolina —la dueña, que hace faciales/estética— aparece
como si solo depilara. Es el negocio **faro**, muy visible, y **miente sobre quién hace qué**.
- **Causa probable:** las **asignaciones profesional↔servicio en Neon** están cargadas iguales para
  todas (seed/alta genérico) o faltan, y el render `p.services…slice(0,4)` cae en los primeros por id
  (los de depilación). Es capa de **DATO** (patrón DX-5 / DB-2), no del layout.
- **Archivo (síntoma):** `src/app/(site)/page.tsx` (sección EQUIPO, `p.services.map(...).slice(0,4)`).
  **Causa raíz:** asignación de servicios por profesional en la DB (alta/seed del tenant CH).

### 🟡 MEDIO

**M-1 · Magra — el footer se contradice con el hero (wording de rubro genérico). [CÓDIGO, reversible]**
El hero dice, como identidad de MAGRA, *"Esto no es una carnicería!"*, pero el **footer** dice
*"Carnicería premium — cortes seleccionados. Retiro y envío en Canning."* y la sección Comprá online
dice *"Cae directo a la **cocina/mostrador**"*. Wording del rubro `carniceria` que **choca con la
marca del cliente** en su propia vidriera.
- **Causa probable:** tagline/copy del **template del SiteReplica o default del rubro**, no del
  contenido real relevado. Reversible en código.
- **Archivo:** `src/app/tienda/SiteReplica.tsx` / `src/tenants/magra-replica.ts` (footer/tagline) o el
  default del rubro retail.

**M-2 · Magra — DATO de negocio genérico en Neon (Branding). [DATO — Gate 2, ELEVAR AL DUEÑO]**
Aunque el copy de marketing ya quedó fiel (2ª frase del hero, "envasada al vacío", ABOUT US, © 2025,
Facebook real, Tel real — merge `32924c4`), el **Branding del tenant sigue en placeholders del rubro**:
- Dirección **"Av. Provisional 1234, Canning"** — real: *José Champagnat 4351 – Local 1, Sotavento
  Point, Canning*.
- Instagram **@magra.carniceria** (`instagram.com/magra.carniceria`) — real relevado: **@tiendamagra**.
  Es un **link a una cuenta equivocada** en una vidriera de cliente en vivo (Facebook sí quedó real).
- Horario **"Mar a dom · 9 a 20 h"** — real: *Lun a sáb 10–20 · Dom 9–13*.
- **Causa:** es el **gap conocido de Branding en Neon** (DX-5 capa 2): el alta nunca actualizó
  `BusinessSettings` con los valores reales del runbook. **No es código** → se **eleva al dueño**
  (dato de prod, Gate 2). Verificar de paso cuál IG es el vigente (@tiendamagra vs @magra.carniceria).

**M-3 · Magra — el catálogo comprable no refleja el producto real. [DATO/seed]**
La vitrina se vende como *boutique de envasados al vacío premium*, pero el catálogo de "Comprá online"
son **cortes frescos por kg genéricos** (Asado de tira, Bife de chorizo, Entraña…), no los envasados
al vacío reales del negocio. Es seed/DATO de Neon (owner-pending), coherente con M-2.

### 🟢 MENOR

**m-1 · Shine — categorías anunciadas con góndola vacía (persiste).** "Decoración" (promete
portavelas, bandejas, floreros, espejos) tiene **1** producto; "Accesorios" (cortamechas, apagadores,
fósforos) tiene **0** comprables. Promesa > stock. Cargar productos o no anunciar la categoría.

---

## Cobertura / limitaciones de esta pasada
- **Mobile:** el hero de Shine reflowa bien a ancho de teléfono (columna única, CTAs apiladas, sin
  overflow horizontal). La verificación mobile amplia quedó **parcial**: la herramienta de resize del
  navegador se reseteó a desktop al navegar entre URLs. Los storefronts tienen breakpoints responsive
  en el código; se recomienda una pasada mobile dedicada.
- No se completaron los 5 pasos de la reserva CH ni el checkout real (ultra-ahorro); se validó apertura
  del modal + gate vecino/a + carrito/WhatsApp por continuidad con pasadas previas.

## Orden sugerido de corrección (fixes reversibles a coordinar; DATO se eleva)
1. **A-1** — corregir asignaciones profesional↔servicio del tenant CH (dato) — visible en el faro.
2. **M-1** — sacar el wording "carnicería/cocina" del footer de Magra (código, reversible).
3. **M-2 / M-3** — **elevar al dueño**: cargar Branding real (dirección/IG/horario) + catálogo real de
   Magra en Neon (Gate 2; el agente no toca prod).
4. **m-1** — stock o des-anunciar categorías de Shine.

— Elaborado por GSG (Equipo de Calidad)
