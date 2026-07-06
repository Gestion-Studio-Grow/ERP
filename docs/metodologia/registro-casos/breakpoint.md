# Caso: Break Point Pádel

**Fecha:** 2026-07-06 · **Extraído por:** sesión preventa Break Point · **Rubro (texto libre):** club de pádel / comunidad
**Fuentes consultadas:** Instagram (perfil del club) · referencias de mercado (clubes hospitality-led)

> Entrada semilla del registro. Artefacto de la demo: `docs/artefactos/breakpoint-preventa.html`
> (+ preview en `public/previews/breakpoint/`).

## 1. Qué se extrajo (resumen)

- **Identidad:** "Break Point Pádel" (Ezeiza, Bs. As.), posicionamiento **"Club de amigos y amigas"** —
  sobrio, cálido, cercano. Marca: azul royal `#0B5FB0` + naranja `#F07A0C`; logo = círculo azul con la
  pelota naranja como la "O" de POINT. Acento cercano del ERP: `celeste`/`petroleo` + `ambar` (a mapear).
- **Modelo de negocio:** club con **reservas de turnos** (con buffer, sin doble-reserva) + tienda/SHOP
  con carrito → WhatsApp + clases/escuelita + torneos (Circuito Padel Sur) + Delicias (bodegón propio).
- **Catálogo:** palas, indumentaria, accesorios (SHOP); clases; turnos de cancha; delicias.
- **Servicios:** reservas, tienda con salida a WhatsApp, escuelita, torneos, comunidad.
- **Contacto:** WhatsApp (canal de tienda) — datos operativos de ejemplo, a confirmar.
- **Incumbente:** no detectado (reservas hoy probablemente manuales/WhatsApp).

## 2. Completitud

- `demo`: alta — alcanzó para una vidriera de demo completa (un solo HTML, sin build).
- `prod`: <1.0 — logo oficial vectorial, hex confirmados, precios/stock/turnos reales, métricas de
  comunidad: todo marcado **de ejemplo, a confirmar**.

## 3. Qué falló durante la extracción

| Muro / problema | Fuente | Cómo se resolvió | Provenance final |
|---|---|---|---|
| Sólo Instagram como fuente (sin web propia) | IG | se leyó identidad visual y propuesta; datos operativos quedaron de ejemplo | `provisional` |
| Sin logo descargable | IG | **logo recreado fiel en CSS/SVG** (círculo + tipografía condensada + pelota naranja como "O") | recreación para demo; oficial `pedido-al-dueno` |
| Datos operativos (precios, stock, turnos) no públicos | — | placeholders de ejemplo, marcados "a confirmar" | `provisional` |

## 4. Qué se corrigió / se pidió al dueño

- Logo vectorial oficial + hex confirmados · precios/stock de la tienda · grilla real de turnos y clases ·
  calendario de torneos · fotos reales (los espacios de foto quedaron como placeholders `data-photo`/`.ph`).

## 5. Heurística nueva (si la hubo)

- Confirmó y reforzó **§3.3 de la checklist**: cuando no hay logo descargable, **recrearlo fielmente en
  CSS/SVG** es un fallback válido **para demo** (círculo/monograma + tipografía + un elemento de marca como
  glifo), dejando el asset oficial como bloqueante de prod. Promovido ✅.
- Aprendizaje: con **una sola fuente (Instagram)** igual se arma una demo creíble si se es **explícito**
  sobre qué es de ejemplo; el `completenessScore().prod` bajo es la señal honesta de cuánto falta.
