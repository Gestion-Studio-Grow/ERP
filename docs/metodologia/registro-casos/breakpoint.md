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

## 6. Reingeniería del backoffice (2026-10-14)

- **Qué se hizo:** ingeniería reversa de Playtomic Manager, MATCHi, Doinsport y la automatización de clubes
  europea → backoffice del club en demo del flujo: `public/previews/breakpoint/club/` (Recepción + Dueño con
  cámaras, stock y turnos). Motor puro con 28 tests (`src/tenants/breakpoint/motor-club.test.ts`).
  Detalle completo, matriz de 26 eventualidades y camino a producción: `docs/tenants/breakpoint/REINGENIERIA.md`.
- **Método:** nace la skill `ingenieria-reversa` (`.claude/skills/ingenieria-reversa/SKILL.md`, copia en Factory-GSG).
- **Sigue provisional:** logo vectorial oficial (el club lo tiene, falta que lo pase), autorización registrada
  de marca (ADR-034) antes de mostrar, techadas vs. descubiertas, precios, horarios y cámaras reales.

### Heurística nueva
- **La matriz de eventualidades es el entregable que más vale** de una ingeniería reversa: recorrer el ciclo
  de vida preguntando "¿y si no pasa / pasa tarde / pasa dos veces / pasa a medias?" encontró 23 casos (26 tras el Gate), y los
  que los referentes dejan "a criterio del club" fueron justo donde apareció la innovación (seña en suspenso).
- **Trampa de maquetado:** un texto para lector de pantalla (`position:absolute`) dentro de una tabla con
  scroll horizontal se escapa del contenedor y ensancha la página en el celular → el contenedor con scroll
  lleva `position:relative`.

### Segunda vuelta (pedido del club, 14/10)
- El club pidió 20+ cambios después de recorrer la demo: el más profundo fue **separar la cuenta de la cancha
  de la del buffet** (en Europa el consumo va dentro de la reserva; acá el buffet es otro negocio dentro del
  club). Mapa pedido → implementación en `docs/tenants/breakpoint/REINGENIERIA.md` §10.
- **Heurística:** en la ingeniería reversa, la "cuenta" no es una sola: preguntar al cliente **cuántas cajas
  y cuántas cuentas distintas maneja** (cancha, buffet, shop, proveedores) antes de modelar el cobro.

### Tercera vuelta — 5 estilos premium (15/10)
- El dueño pidió 5 estilos "fuera del sesgo de los modelos". Plan en Fable (pedido explícito), ejecución en Opus:
  Chapa, Marcador, Césped, Bodegón y Galpón — `docs/tenants/breakpoint/ESTILOS.md`.
- **Heurística:** para salir del look genérico, cada estilo se ancla en un **material o pieza real del lugar**
  (cartel esmaltado, gráfica de TV del torneo, la cancha, la comanda del bodegón, el galpón) y no en un "mood".
  Y se calcula el contraste de cada hex: el naranja de marca no alcanza como trazo fino sobre claro (2.5:1) → `--orange-ui`.
- **Muro:** el Instagram no abre desde el entorno cloud (política de red). Se trabajó con la extracción de julio;
  validar con el club antes de mostrar.

### Autorización de marca y marca real (15/10)
- **Autorización registrada (ADR-034):** el dueño de GSG confirmó el 15/10/2026 a las 14:06 UTC, en la sesión local
  «Integraciones de productos backoffice ERP», que **el club autorizó el uso de su marca** («ya esta autorizada la marca»).
  Verificado en el registro de esa sesión (mensaje humano, no de otro agente). Desde ahora la demo se puede mostrar al club.
- **Marca relevada del Instagram** (`docs/tenants/breakpoint/MARCA-INSTAGRAM.md`): azul **#035BA8** y naranja de la pelota
  **#DC6E22** (medidos en píxeles; reemplazan a #0B5FB0 / #F07A0C de julio). El logo real **no** era el círculo con letra
  condensada que se recreó en julio: es «BREAK / POINT / PADEL» en sans geométrica, barra vertical a la izquierda y la «O»
  como aro naranja, blanco sobre cuadrado azul. Rehecho en SVG en el backoffice; el vectorial oficial lo pasa el club.
- **Heurística:** recrear un logo "de memoria" o desde una descripción falla en lo esencial (forma y tipografía). Antes de
  recrear, **mirar el píxel** (aunque sea la foto de perfil de 150 px) y comparar lado a lado.

### Cuarta vuelta — 8 pedidos del club sobre cargos, precios y bloqueo (15/10)
- **Qué se hizo:**
  - la parte de cancha de un jugador queda a cargo de otro;
  - un panel confirma antes de usar créditos (y avisa si cubre la seña);
  - «consumo» pasó a «cargo»;
  - para la mesa compleja: pasar cargos entre cuentas y cargo manual (el descuento lo autoriza el dueño con su PIN);
  - cada cargo tiene − / +;
  - se suma el código de fábrica al lado del interno;
  - en Stock, una vista editable de precios y rentabilidad;
  - bloqueo con PIN propio por inactividad o al apagar la pantalla.
- **Funcionó:** toda regla de plata vive en el motor con tests antes que la pantalla (7 tests nuevos). El invariante
  «una cuenta nunca queda por debajo de lo ya pagado» quedó en las tres operaciones que mueven cargos.
- **Falló:**
  - El descuento pedía el PIN del dueño, pero lo validaba contra el usuario logueado (recepción), así que nunca pasaba.
    Lo detectó el QA clic por clic, no los tests del motor: la regla estaba bien, el cableado no.
  - Un E2E dependía de la hora real: elegía las 16:00 y fallaba corrido después de esa hora.
- **Heurística:**
  - cuando la UI pide «el PIN de OTRA persona», el cableado tiene que resolver a quién pertenece ese PIN, no usar el usuario activo;
  - un E2E que elige horarios los elige entre los que la otra punta muestra en ese momento, nunca fijos.
