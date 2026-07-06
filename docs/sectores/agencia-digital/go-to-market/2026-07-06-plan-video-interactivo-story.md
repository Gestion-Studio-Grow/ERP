# Plan de video interactivo insignia — Story del ERP (destino: `/demo` → WhatsApp)

> **Sector:** Agencia Digital · **Célula 1** (Go-To-Market & Contenido) · **Fecha:** 2026-07-06
> **Estado:** guion de producción — **NO publicado**. Sin media real producida, sin número real de
> WhatsApp. Referencia competidora: tuturno.io.
> **Relación con lo anterior:** los 5 conceptos de la campaña están en
> `2026-07-06-guiones-campana-lanzamiento.md`; la estrategia/funnel/pauta en
> `2026-07-06-estrategia-lanzamiento-erp.md`. **Este doc** aterriza EL video insignia, atado 1:1 al
> tour real `/demo` (Célula 3), listo para producir cuando el dueño dé OK.

---

## 0. Por qué este video y cómo encaja

Es la **pieza de tope de embudo** de la campaña: un Story/Reel vertical de ~20 s que copia el **molde
de tuturno.io** (locución de "dueña de local" + demo de celular + CTA), pero cambia el fondo: donde
tuturno muestra *solo la agenda*, nosotros mostramos el **negocio entero** (agenda → cobro → factura →
panel) y cerramos a **WhatsApp**.

**Espejo 1:1 con el producto real:** el video reproduce, escena por escena, el tour que ya vive en
`/demo` (`src/app/demo/`). Esto no es casual — así el que hace click desde el ad **reconoce** lo que
vio y la promesa se cumple. Las 6 escenas del video = las 6 escenas del tour:
`agenda · reserva · caja · factura · dueño · cierre`.

**Doble camino del CTA (importante):**
- **En el video/ad** → el CTA lleva a la **demo interactiva `/demo`** ("echá un vistazo más de cerca").
- **Dentro de `/demo`** → el CTA final lleva a **WhatsApp** (`wa.me`, botón "Quiero esto para mi
  negocio"). Número **provisional** `5491100000000` en `demo-content.ts` → GTM lo reemplaza por el real
  **antes** de publicar (no se toca ahora).

> Variante alternativa (a decidir por PMO al pautar): si se quiere **acortar el funnel**, el ad puede ir
> directo a WhatsApp en vez de a `/demo`. Recomendación de Célula 1: **mantener `/demo` en el medio**
> (calienta y filtra); usar WhatsApp-directo solo en el conjunto de **retargeting**.

---

## 1. Ficha técnica

| Campo | Valor |
|---|---|
| Formato | Vertical **9:16**, 1080×1920 |
| Duración | **20 s** (tope Stories; cortar a 15 s para la variante Reels-hook) |
| Audio | Trend + **voz en off** femenina, Rioplatense, tono cercano ("vos") |
| Subtítulos | **Quemados** siempre (se mira sin audio), alto contraste |
| Safe zones | Respetar zona superior (perfil/tiempo) e inferior (CTA de IG) de Stories |
| Marca | Logo Gestión Studio Grow discreto arriba; paleta oscura del tour (`#101615` + acento agua) |
| Demo | Pantallas reales del tour `/demo` (grabación de pantalla del teléfono) |
| CTA | Sticker de link → `/demo?utm_source=ig&utm_campaign=lanzamiento&utm_content={rubro}` |

---

## 2. Guion shot-by-shot (versión estética, 20 s)

> Convención: **[VISUAL]** lo que se ve · **VOZ** locución · **SUB** texto en pantalla (quemado).

| t (s) | Escena | VISUAL | VOZ | SUB |
|---|---|---|---|---|
| 0.0–3.0 | **Hook** | Mano con celular; notificaciones de WhatsApp explotando en la pantalla | *"¿Seguís manejando tu negocio entre WhatsApp, una libreta y el sistema de AFIP aparte?"* | **Tu negocio no entra en una libreta.** |
| 3.0–6.0 | **Agenda** | Pantalla `agenda` del tour: un turno **entra solo** ("Reservado online ✓") sin pisar a nadie | *"Los turnos se agendan solos…"* | Agenda que no se pisa |
| 6.0–9.0 | **Reserva** | Pantalla `reserva`: el cliente elige horario y sale "Turno confirmado ✓ · recordatorio por WhatsApp" | *"…tus clientes reservan las 24 horas."* | Reservan 24/7, sin que contestes |
| 9.0–12.0 | **Caja** | Pantalla `caja`: ticket que suma, método de pago, "Cobrado ✓ — sumado a la caja del día" | *"Cobrás y queda en la caja del día."* | Cobrás y queda registrado |
| 12.0–15.0 | **Factura** | Pantalla `factura`: total + sello "Autorizada por ARCA" con CAE apareciendo | *"Facturás con ARCA en un toque, sin entrar a AFIP."* | Factura electrónica en un toque |
| 15.0–17.5 | **Dueño** | Pantalla `dueño`: insight en castellano ("Tu mejor semana del mes +18%") + sparkline creciendo | *"Y tu negocio te habla, en castellano."* | Tu negocio te habla |
| 17.5–20.0 | **Cierre / CTA** | Pantalla `cierre`: pills (Agenda·Caja·Factura·Panel) + logo; aparece el sticker de link | *"Más que una agenda: tu negocio entero. Echá un vistazo."* | **Más que una agenda. Echá un vistazo 👆** |

**Notas de dirección:**
- El **hook (0–3 s)** decide el costo por resultado. Grabar **3 variantes** del hook (ver §4) sobre el
  mismo cuerpo (3–20 s) para testear.
- Las escenas 3–15 s son **grabación de pantalla real** del tour `/demo` en un teléfono — no mockup.
  Ventaja: producción barata y 100% fiel al producto. Ritmo rápido (≤3 s por pantalla).
- El **CTA final** debe coincidir textualmente con el botón del tour ("echá un vistazo" → y adentro
  "Quiero esto para mi negocio") para continuidad de mensaje.

## 3. Variantes por rubro (misma estructura, distinto fondo)

El cuerpo del video se re-versiona cambiando las pantallas de demo y una palabra del hook — apalanca
que `/demo` y el producto son **multi-rubro** (Blueprints):

- **Estética** (base, arriba): hook "libreta + AFIP"; demo con agenda de estética.
- **Retail/mostrador**: hook *"¿4 apps que ni se hablan para un solo local?"*; demo con venta + stock +
  tienda. (Terreno que tuturno **no** cubre.)
- **Carnicería / venta x kg**: hook *"Una app de turnos no te sirve si vendés por kilo."*; demo con
  balanza/pesaje + factura. (Prueba del diferencial multi-rubro — el moat.)

> Los assets de rubro (fotos/precios) van con **datos de ejemplo marcados**; nada real de un tenant sin
> OK del dueño (ej. *magra* tiene gate de fotos/precios reales).

## 4. Variantes de hook (para el test de 3 segundos)

Sobre el cuerpo estética, grabar estos tres primeros planos (elige el algoritmo cuál rinde):
1. **Dolor-stack:** *"¿WhatsApp, libreta y AFIP por separado? Tu negocio no entra en una libreta."*
2. **Choque directo (vs tuturno):** *"Una agenda te ordena los turnos. ¿Y el resto de tu negocio?"*
3. **Aspiracional:** *"Así se ve tu negocio cuando todo pasa en un solo lugar."*

## 5. Especificación de captura del tour (para producción)

Para grabar las pantallas sin fricción:
- Abrir **`/demo`** en un teléfono (o emulador 1080×1920). Es `force-static`, no necesita login ni DB.
- El tour **auto-avanza**; para capturar cada escena limpia, usar el **botón de pausa** y las **zonas de
  tap** (izq = atrás, der = adelante) o las flechas del teclado en desktop.
- Grabar pantalla a 60 fps; recortar cada escena a su "momento wow" (cuando aparece el ✓ de éxito).
- Respetar `prefers-reduced-motion`: si el dispositivo lo tiene activo, el tour **arranca en pausa**
  (mejora de accesibilidad de esta misma sesión) — desactivarlo en el equipo de captura para que corran
  las animaciones.

## 6. Checklist previo a publicar (gate de GTM — NO hacer ahora)

- [ ] Reemplazar el **número de WhatsApp** provisional por el real en `src/app/demo/demo-content.ts`
      (`DEMO_CTA.whatsappNumber`, formato E.164 sin `+`).
- [x] **Instrumentar en `/demo` los eventos del funnel** (`demo_start`/`demo_step_completado`/
      `demo_complete`/`cta_whatsapp_click`/`cta_email_click`) — hecho 2026-07-06 (Célula Growth/Digital),
      `src/app/demo/analytics.ts` + `docs/demo/README.md`. Emite a `window.dataLayer`/`fbq`; no-op sin
      GTM/Pixel cargado.
- [ ] Confirmar UTMs y **agregar el snippet de GTM o el Pixel de Meta** a la página para que la
      instrumentación de arriba tenga a quién emitirle (hoy no hay tag cargado).
- [ ] OK del dueño para publicar y para el presupuesto de pauta (gate humano).
- [ ] Revisar derechos de audio/trend y de la voz en off.

---

## 7. Resumen

- **Un video insignia de 20 s**, espejo 1:1 del tour `/demo`, que cambia la categoría frente a tuturno:
  *"más que una agenda, tu negocio entero"*.
- **CTA del ad → `/demo`** ("echá un vistazo"); **CTA de `/demo` → WhatsApp** ("quiero esto"). Número
  provisional hasta OK.
- **Producción barata:** grabación de pantalla del tour real, 3 hooks × 3 rubros para testear.
- **Nada publicado, nada a prod.** Queda listo para producir a la orden.
