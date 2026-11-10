# Estética en calidad de venta · 5 rondas — relevo (1 página)

Orden del dueño (10/11/2026, 22:31 UTC): el ERP de estética «tiene que ser perfecto», en no menos de 5 rondas.
Rama `claude/fable-estetica-5-rondas` · PR en borrador · nada a `main`, sin migraciones, sin dependencias nuevas.
Sigue ESTETICA-002 (**Opus 5.5**) en el próximo sprint: rondas 2 a 5, una ronda por agente fresco. No releer el producto: usar esto.

## La herramienta de cada ronda (medir → arreglar → volver a medir)
`node --import tsx src/tenants/ch/e2e/ronda-estetica.mjs <carpeta FUERA del repo>` → 38 pantallas (vidriera,
reserva, modal, login y 14 del backoffice con la dueña) a **390 y 1440**, sobre base Postgres LOCAL efímera con la
semilla de CH (`semilla-ch.ts`), nunca Neon. Deja capturas y `medidas.json` (desborde, toques < 44 px, controles
sin nombre, imágenes sin alt, letra < 12 px, errores de consola, ms). Tarda ~70 s. Corre con `next dev`
(`entorno-ch-dev.mjs`) porque **`npm run build` falla en la nube**: no baja las fuentes de Google (decisión D1).
Falso positivo conocido: «Saltar al contenido» 1×1 (enlace de salto, está bien).
Los flujos con build: `npm run test:ch-uat`, `agenda-interaccion.e2e.mjs`, `venta-agenda.e2e.mjs` (necesitan D1).

## Ronda 0 — diagnóstico (hecho)
38/38 pantallas responden; 0 desbordes, 0 controles sin nombre, 0 imágenes sin alt, 0 errores de página.
Referente: `docs/resumen-ejecutivo-vs-tuturno.md` y `docs/hitos-pendientes-vs-tuturno.md` (faltan: seña MP online,
cupones en la reserva, multi-sucursal). **Límite honesto:** la ronda 0 cargó pantallas; no recorrió flujos completos.

| Sev. | Defecto | Dónde | Estado |
|---|---|---|---|
| Media | `next build` no compila en la nube (fuentes de Google) → sin UAT de producción ni Lighthouse | entorno | D1 |
| Media | Aviso de `pg`: `client.query()` con otra consulta en curso al abrir Inicio (rompe en pg 9) | `/admin` (capa de datos) | ronda 4 |
| — | `/admin/vender` manda a «no disponible»: **no es defecto**, CH no tiene prendida la app de Vender (confirmado por ERP-001 y por el recorrido). El cobro de estética pasa por turnos, caja y vouchers | — | cerrado |
| Media | Letra 11,5 px en la barra inferior del celular y en encabezados de tabla | kit `public/diseno/renglon.css` (lo toca ERP-001) | D2 |
| Media | Encabezado de Agenda a 390: «·» colgado después de «Sin cerrar» y «Laura con 2» partido | `turnos/page.tsx` | ronda 3 |
| Media | Reserva a 390: «60 min · $15.000» se parte en dos renglones; «Otros servicios» como único título | `(site)/_ch/BookingModal.tsx:1150-1170` | ronda 2 |
| Baja | «Requiere seña» a 11 px en la reserva | `BookingModal.tsx:1166` | **ronda 1** |
| Baja | Hora de la raya «ahora» a 11 px | `turnos/_agenda/PorProfesional.tsx:592,606` | **ronda 1** |
| Baja | Pestaña «Lista» de 39 px de ancho en el celular | `turnos/page.tsx:193-196`, `turnos/lista/page.tsx:218-221` | **ronda 1** |
| Baja | Atajos de teclado explicados en el celular | `PorProfesional.tsx:924` | **ronda 1** |

## Ronda 1 — legibilidad y toque en el celular (hecha)
Los 4 defectos bajos, con `turnos/ronda1-legibilidad.test.ts` (4 tests). Verificación: tests del área 56/56;
`tsc` con 2 errores previos y ajenos (`src/lib/operador/db-de-scripts.ts:132-133`, módulos de Neon sin instalar);
recorrido antes/después: modal de reserva 1 → 0 textos chicos, pestaña «Lista» 39 → 44 px. Build: no corre (D1).

## Rondas 2 a 5 — criterios de aceptación (Fiori 7 ángulos + ángulo argentino)
- **Ronda 2 · La clienta reserva (WhatsApp-first).** Reserva web de punta a punta a 390 en ≤ 12 toques y ≤ 60 s;
  seña explicada con MP o transferencia (alias/CBU copiables); confirmación con botón de WhatsApp con mensaje armado;
  cancelar desde el link; criollo sin tecnicismos; 0 errores de consola; cierra los dos defectos del modal.
- **Ronda 3 · La recepción (agenda, clientas, recordatorios).** Dar turno por teléfono en ≤ 30 s; mover, cancelar y
  «no vino» sin callejones; «Mañana: confirmar» abre WhatsApp con el texto listo; la agenda del celular abre en la
  hora actual; ficha de clienta con historial y botón de WhatsApp; 0 toques < 44 px a 390; encabezado de Agenda.
- **Ronda 4 · La plata (caja, cobro, vouchers) — Opus alto + `gsg-certificador` sobre el diff.** Después de que entre
  `claude/fable-ciclos-estetica-perf` (no pisarla). Seña, parcial, saldo y cierre que no cuadra con test por caso;
  vouchers: lote, conciliación y baja de impago; aviso de `pg` resuelto con test de concurrencia; aislamiento por tenant.
- **Ronda 5 · Vidriera, a11y AA y performance.** Sobre build de producción (necesita D1): Lighthouse móvil
  performance ≥ 90 y accesibilidad ≥ 95, LCP < 2,5 s, CLS 0; contraste AA medido; teclado completo y foco visible;
  `prefers-reduced-motion`; `npm run test:ch-uat` verde entero; Gate de Excelencia completo y acta final.

## Línea «Shop de productos estética» (orden del dueño, 22:44 UTC: «un buen shop moderno de productos»)
Mejorar lo que hay, no rehacer: `src/app/tienda/Storefront.tsx`, `pedido-online.tsx`, `EntregaDeLaTienda.tsx`,
`reglas-tienda.ts` y la caché por negocio del PR #125. Mapa: `node .claude/scripts/mapa-codigo.mjs src/app/tienda`.
Referentes a superar (provisional a confirmar con `gsg-investigador`): Tiendanube, Empretienda y Mercado Shops en
tienda; la venta de productos de Fresha/Booksy y TuTurno en estética. Entra así en las rondas:
- **Ronda 2 · catálogo y bolsa.** Sumar `/tienda` de CH a `ronda-estetica.mjs`. Catálogo con foto, precio y variantes
  (tono, tamaño), buscador que responde en < 200 ms, bolsa que no se pierde al recargar; agregar un producto en
  ≤ 3 toques a 390; 0 desbordes y 0 toques < 44 px. Fotos fuera de Git (Drive o almacenamiento de archivos).
- **Ronda 3 · pedido y aviso.** Retiro en el local o envío con costo a la vista antes de pagar; el pedido entra al
  backoffice (`/admin/pedidos`) y avisa por WhatsApp a la clienta y al negocio con el texto armado; se puede sumar
  un producto al reservar un turno.
- **Ronda 4 · pago (plata: Opus alto + certificador).** MP o transferencia (alias/CBU copiables, comprobante);
  stock que se descuenta una sola vez con dos compras a la vez (test de concurrencia); el pedido pago entra a caja;
  aislamiento por tenant. Sin gasto antes de la venta: MP en sandbox, credenciales reales las eleva el dueño.
- **Ronda 5 · vidriera del shop.** Lighthouse móvil ≥ 90 / ≥ 95, LCP < 2,5 s, CLS 0, imágenes con dimensiones y
  `alt`; compra completa clic por clic a 390 y 1440 en el acta final.

Cada ronda: correr la herramienta → lista priorizada → arreglo → `tsc` + tests del área (n/n) → correrla otra vez →
agregar su acta acá (5 renglones) → commit por pathspec con trailer GSG → push a esta rama.

## Límites vigentes
No tocar: pie del PDF de comprobantes (decisión E1). ERP-001 terminó (PR #126, `claude/fable-ciclos-estetica-perf`):
si hace falta `Modal`/`Confirmar`/`Dialogo`, catálogo, recuento o `renglon.css`, partir de su rama o esperar el merge.
Pendiente de ERP-001 que cae acá: revisar `Dialogo` a 390 px (ronda 3). Trinquete del kit
(`scripts/trinquete-kit.mjs`): no subir `button`/`input`/`table`/hex/`style={` por encima del piso. Marca de agua GSG nunca en pantallas del tenant. Capturas fuera de Git.

## Decisiones para el dueño
- **D1 · Build en la nube.** (a) *Recomendada:* permitir `fonts.googleapis.com` y `fonts.gstatic.com` en el entorno
  Default; (b) seguir midiendo en `next dev` y dejar UAT y Lighthouse para una máquina con red.
- **D2 · Piso de 12 px en el kit** (barra inferior y encabezados a 11,5 px). *Recomendada:* sí, lo aplica quien tiene
  `renglon.css` abierto (ERP-001) para no chocar.
- **D3 · Shop de CH: ¿se prende la app de Vender/tienda para CH?** Hoy CH no la tiene. *Recomendada:* prenderla
  sólo en demo local hasta cerrar la ronda 4 (plata certificada); en producción la decide el dueño.
- **D4 · Fotos de productos.** *Recomendada:* las pasa la clienta y van a almacenamiento de archivos, no a Git.
