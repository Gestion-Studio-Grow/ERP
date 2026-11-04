# Contenido — creador + agenda por negocio · PLAN

Pedido del dueño (04/11/2026): «integrar la agenda de contenido con el creador de contenidos, para las plantillas en base al texto».
Flujo: el negocio escribe el texto → el creador detecta el tipo (promo, horario, torneo/evento, novedad, servicio) y propone
3 plantillas con SU marca (post 1080×1350, historia 1080×1920) con título, bajada y llamado tomados del texto, más caption
para Instagram y WhatsApp → elige, ajusta y agenda (día, hora, canal, estado borrador/programado/publicado) → aviso el día
de publicar. Sin IA paga: plantillas deterministas; la IA (Workers AI gratis o Claude con clave) sólo sugiere texto y es
opcional. Publica una persona, sin API. Módulo activable por negocio (ADR-054/058). Plan hecho con Fable; ejecuta Opus.

## 1. Arquitectura en capas (motor puro, genérico, sin romper el club)
`src/lib/contenido/` — todo PURO, sin React ni Prisma, con tests al lado (`node --import tsx --test`):
- `tipos.ts`: `TipoDeContenido = "promo"|"horario"|"evento"|"novedad"|"servicio"`, `Canal = "instagram"|"historia"|"whatsapp"`,
  `EstadoPublicacion = "borrador"|"programado"|"publicado"`, `MarcaDeLaPlaca { nombre, monograma, colorPrimario, colorHondo,
  colorAcento, colorClaro, whatsapp?, instagram? }`, `FORMATOS` (`post` 1080×1350, `historia` 1080×1920).
- `detectar.ts`: `detectarTipo(texto): { tipo, confianza, pistas }` por palabras/patrones rioplatenses («2x1», «%», «$» →
  promo; «lunes a viernes», «de 9 a 18», «feriado» → horario; «torneo», «inscripción» → evento; «nuevo servicio», «ahora
  hacemos» → servicio; resto → novedad) y `extraer(texto): { titulo, bajada, cta, fecha?, hora?, precio? }`.
- `plantillas.ts`: `PLANTILLAS_POR_TIPO` (3 por tipo) y `proponerPiezas(texto, marca, tipo?)` → 3 `PiezaPropuesta`
  `{ plantilla, formato, campos: { rotulo, titulo, bajada, cta }, caption: { instagram, whatsapp } }`.
- `caption.ts`: `armarCaptionInstagram` / `armarCaptionWhatsApp` con marca y CTA parametrizados (generaliza el club).
- `calendario.ts`: `armarMes`, `armarSemana`, `mesVecino`, `semanaVecina`, `recordatoriosDelDia(pubs, hoy)`,
  `resumenDeEstados`. Se porta lo de `club/novedades-core.ts` sin tocar al club.
- `placa.ts`: `medidasDeLaPlaca(formato)` (zona segura de historia) y `dibujarPlaca(ctx, pieza, marca, foto?)` tomado de
  `club/studio-placa.ts` con colores y monograma de la marca; `partirLineas`/`ajustarLineas` se importan del club.
- `marca.ts`: `marcaDeLaPlaca(brand, settings)` sobre `src/lib/branding.ts` y `BusinessSettings.whatsapp/instagram`.
- `ia.ts` (opcional): arma el pedido; el server usa la IA gratis de `src/lib/proyectos/ia.server.ts`. Sin IA, no hay botón.

## 2. Persistencia (aditiva, tolerante a tabla ausente)
- Modelo `PublicacionAgendada { id, tenantId, fecha (YYYY-MM-DD), hora (HH:mm), canal, estado, tipo, plantilla, formato,
  titulo, texto, campos Json, caption Json, createdAt, updatedAt }`, índice `(tenantId, fecha)`, relación a `Tenant`.
- Migración `prisma/migrations/20261105120000_publicaciones_agendadas/` con RLS, molde `20261102120000_consultas`.
  NO se aplica (Gate 2, lo decide el dueño).
- `almacen.server.ts`: listar / guardar / cambiar estado / borrar. Si la tabla falta (P2021/P2022) la pantalla pasa a
  `almacen-local.ts` (localStorage por slug, `gsg:contenido:<slug>`) con aviso «Modo demo: lo agendado queda en este equipo».

## 3. Pantalla `/admin/contenido`
- `page.tsx` (server): marca, settings, mes actual, guardia de app/módulo.
- Creador: textarea + «Proponer» (+ «Sugerir con IA» opcional) → 3 placas en `<canvas>` → elegir, ajustar, formato
  post/historia, caption IG/WA con «Copiar», «Descargar PNG» (`canvas.toBlob`, en el navegador) → agendar.
- Calendario mes/semana, estado con símbolo además del color, teclado y foco visible; clic abre la publicación.
- App `contenido` en `src/apps/catalogo/comercial.ts` (espacio clientes, `clients:read`, módulo `contenido`);
  `contenidoModule` en `src/modules/descriptors/nativos.ts` + `src/modules/catalog.ts`. Activable como `campanias`.

## 4. Recordatorio
Aviso arriba de la pantalla con `recordatoriosDelDia`: las programadas de hoy, con «Marcar publicada» y enlace para
abrir WhatsApp. Sin push ni servicios pagos.

## 5. Tandas
- T1 — motor + tests: tipos por texto real, extracción, 3 propuestas, captions con el WhatsApp del negocio,
  recordatorios, y AISLAMIENTO con dos negocios (marcas y almacén local separados). El club sigue verde.
- T2 — pantalla + migración (sin aplicar) + app/módulo + almacén con fallback demo. `tsc`, tests, build.
- T3 — QA: `visual-verifier` sobre 2 negocios a 375 px y escritorio; recorrido texto → plantilla → agenda → aviso.

## 6. Criterios de aceptación
1. «2x1 en turnos de lunes a viernes de 10 a 16» → promo, 3 placas con mi marca, caption IG y WA listos.
2. Elijo una, cambio el título, la agendo jueves 19:00 en Instagram como programada → aparece en mes y semana.
3. Ese día el panel muestra el aviso y la marco publicada.
4. Un negocio no ve ni toca lo de otro (RLS + test de aislamiento + almacén por slug).
5. Sin tabla: modo demo avisado; sin IA configurada: no hay botón de IA.
6. El Studio y el calendario del club quedan igual (sus tests pasan sin cambios).

## Riesgos / §C
- Migración = Gate 2: no se aplica sin OK del dueño; hasta entonces, modo demo.
- La detección por reglas falla con textos ambiguos: el tipo se cambia a mano (selector visible).
- Canvas y fuentes: fuente del sistema con respaldo.
- IA gratis con cupo diario: mensaje claro y se sigue a mano.
