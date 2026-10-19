# Profe Matías Consoli — módulo `padel-clases`

Rama `claude/beautiful-keller-5tykrg`, nacida de `origin/main` (`29d3e94`) el 15/10/2026. **Lista para integrar a `main`** (OK del dueño del 17/10, gate 1): se integra cuando esté cargada `MIGRATE_DATABASE_URL`, porque sin las tablas el build de producción frena. Migración declarada en
`prisma/lote-deploy.txt` con OK del dueño (gate 2): se aplica en el build de producción cuando está cargada
`MIGRATE_DATABASE_URL`, o a mano en Neon.

## Qué es

El primer **profe de pádel** del motor: un negocio más (no una app aparte), rubro `profe-padel`
dentro de la familia oficios + módulo `padel-clases` asignable sólo a ese rubro (ADR-055).
Pensado para una persona sola que da clases y tiene **menos de diez minutos entre clase y clase**
para agendar y cobrar.

El circuito, de punta a punta:

1. **Turnero público** (`/clases`, el link de la bio de Instagram). Tres pasos en una pantalla:
   día → hora → nombre y celular. Muestra sólo lo libre, calculado en el servidor (horarios del
   profe − clases vivas − bloqueos − anticipación mínima). Al terminar: botón **"Avisarle por
   WhatsApp"** (le manda el pedido a Matías desde el teléfono del alumno) y el **link del alumno**.
2. **Matías confirma o rechaza con un toque** desde **Pendientes** (con número en la barra y aviso
   en Hoy). Al confirmar, abajo aparece **"Avisarle a Juan por WhatsApp"** con el mensaje listo
   (precio, alias y el link del alumno).
3. **El alumno, solo**, desde su link (`/alumno/<token>`, sin login): ve su próxima clase, **sube
   la foto del comprobante** de la transferencia, **repite la clase la semana que viene a la
   misma hora** (si ya tomó clases queda confirmada sin esperar al profe; si la hora está tomada,
   le ofrece las tres más cercanas), o **cancela** con la anticipación que fijó el profe.
4. **Hoy** (lo que Matías abre entre clase y clase): arriba la **próxima clase** con sus botones —
   *Dada · No vino · Cobré en efectivo · Ver comprobante → Está bien / No es válido · + Agendar la
   próxima (misma hora)*—; después el resto del día y mañana (con "Recordarle").
5. **Semana**, **Alumnos** (quién debe, su link, su WhatsApp), **Agendar** (lo que le piden en la
   cancha) y **Horarios y precios** (tramos por día, bloquear un día por lluvia, precios, alias,
   su celular, anticipación, textos de WhatsApp y el link para Instagram).
6. **WhatsApp Business**: hoy botón verde (wa.me, costo cero). Listo para la Cloud API de Meta con
   `PADEL_WHATSAPP=cloud` + credenciales; el webhook aplica "sí / cancelo" del alumno. Paso a
   paso: [`whatsapp-business-paso-a-paso.md`](whatsapp-business-paso-a-paso.md).

La app del profe es **instalable** ("Agregar a pantalla de inicio"): abre directo en Hoy.

## Piezas

| Pieza | Dónde |
|---|---|
| Rubro (servicios de ejemplo, textos) | `src/blueprints/oficios/rubros.ts` (id `profe-padel`; `padel` a secas es la TIENDA, A Dos Manos) |
| Módulos por defecto del rubro | `src/blueprints/presets-meta.ts` (`"profe-padel": ["padel-clases", "clients"]`) |
| Descriptor del módulo | `src/modules/descriptors/padel-clases.ts` + `src/modules/catalog.ts` |
| App del panel | `src/apps/catalogo/comercial.ts` (id `padel-clases`, ruta `/admin/clases`) + `src/apps/espacios.ts` |
| Reglas puras + pruebas (18) | `src/lib/padel/core.ts`, `core.test.ts` |
| Lecturas / escrituras | `src/lib/padel/datos.server.ts`, `acciones.ts` |
| WhatsApp: puro + pruebas (6) / envío / webhook | `src/lib/padel/whatsapp-cloud.ts` (+`.test.ts`), `notificador.ts`, `src/app/api/webhooks/whatsapp/route.ts` |
| Marca por negocio | `src/lib/padel/marca.ts` (neutra hasta registrar la autorización) |
| Panel | `src/app/admin/(dashboard)/clases/` (Hoy, pendientes, semana, alumnos, agendar, config; `_aviso.tsx` = barra del resultado + WhatsApp) |
| Turnero público + app instalable | `src/app/clases/` (`page.tsx`, `Turnero.tsx`, `app.webmanifest/route.ts`) |
| Link del alumno (sin login) | `src/app/alumno/[token]/` |
| Portada `/` → turnero | `src/app/(site)/page.tsx` (+ fixture `__fixtures__/page-head.tsx.txt`) |
| Tablas + RLS | `prisma/migrations/20261015120000_modulo_padel_clases/` (5 tablas, aditiva) |
| Datos de ejemplo | `prisma/seed-padel-matias.ts` (sólo base local) |
| Demo en esta máquina | `node scripts/padel/demo-local.mjs` → `http://matiasconsoli.localhost:3219/clases` |
| UAT | `.qa/padel-1510/01-uat.mjs` + `.qa/padel-1510/INFORME-UAT.md` |

**Por qué tablas propias y no la agenda del motor:** `Appointment` exige box, profesional y
servicio, su máquina de estados no distingue "pedida por el alumno" de "confirmada por el profe"
ni el comprobante en revisión, y es la tabla viva de CH Estética en producción. Se reusa sólo
`Client` (el alumno es un cliente del negocio). Plata en `numeric(14,2)` (ADR-100).

## Seguridad

- Panel: cada pantalla con `requireApp("padel-clases")`; cada acción del profe con
  `requireCapability("agenda:manage")` y acotada por `tenantId`.
- Turnero y link del alumno: el negocio sale del dominio, el alumno del token (18 bytes al azar,
  base64url). Todo se vuelve a chequear en el servidor (la franja, el estado, la anticipación).
  Freno por IP (8 pedidos / 10 min) y tope de pedidos sin confirmar por celular (2, configurable).
- Altas de clase en transacción **Serializable** (`bookingTransaction`): dos alumnos que tocan la
  misma franja a la vez no quedan los dos adentro.
- Comprobante: sólo imagen (jpeg/png/webp) en data URL, achicada en el teléfono, tope 400.000
  caracteres. No hay almacenamiento de archivos (mismo criterio que las fotos del taller).
- Las 5 tablas nacen con RLS (`prisma/rls/check-coverage.mjs`: OK).
- Webhook de WhatsApp: GET sin token configurado → 503; POST apagado salvo `PADEL_WHATSAPP=cloud`,
  y prendido verifica la firma HMAC con el App Secret (sin secreto 503, firma mala 401), deduplica
  por wamid. Ningún secreto se escribe en el log.

## Marca — autorización REGISTRADA (ADR-034)

**Autorizada por el dueño de GSG el 17/10/2026**, con el OK de Matías para usar su marca en su negocio dentro
del ERP (turnero público, panel y link del alumno). Registrado por la sesión orquestadora
(session_014g4UwTGx6X6t4Zf5JvTby2).

Lo que falta para que la demo luzca su marca: sus archivos (logo, foto, paleta) todavía no están en el repo,
porque Instagram no fue accesible desde el entorno de trabajo. Cuando lleguen: sumar su fila en
`src/lib/padel/marca.ts` y los archivos en `public/tenants/matiasconsoli/marca/`. Hasta entonces sale con su
nombre en letras y la paleta neutra de cancha.

## Provisional a confirmar con Matías

| Dato | Valor de la demo |
|---|---|
| Precio clase individual / grupal por persona | $ 25.000 / $ 12.000 |
| Duración | 60 min |
| Horarios | lun a vie 08–12 y 16–21 · sáb 09–13 |
| Anticipación mínima / días que muestra el turnero | 2 h / 14 días |
| Alias / titular | `ALIAS-DE-EJEMPLO` / "A confirmar" |
| Celular de Matías | **vacío** a propósito (no se abre WhatsApp a un número que no es el suyo) |
| Dónde da clases | sin cargar |
| Slug / dominio | `matiasconsoli` · `matiasconsoli-erp.vercel.app` (demo) |
| Número para WhatsApp Business | a decidir (chip nuevo o migrar el suyo) |

## Cómo se da de alta (cuando se venda)

1. Consola de GSG → alta del negocio con rubro **Profe de pádel** (`profe-padel`): asigna los
   módulos `padel-clases` y `clients`.
2. **Gate 2:** aplicar `20261015120000_modulo_padel_clases` en Neon con OK del dueño
   (`prisma migrate deploy`) y sumarla a `prisma/lote-deploy.txt` en ese momento.
3. Matías entra a **Horarios y precios**: carga su celular, alias, precios y horarios, y copia el
   link para la bio de Instagram.
4. Si quiere avisos automáticos: el manual de WhatsApp Business.

Ciclo **demo → venta → inversión**: hasta que Matías compre, esto vive en la demo local (o en
una URL de demo con datos de ejemplo). Ni dominio propio, ni datos reales, ni WhatsApp Business.

## Qué NO está hecho (dicho de frente)

1. **Migración sin aplicar** en Neon y fuera de `lote-deploy.txt` (gate 2).
2. **Los cobros no entran al libro de Caja del motor** (el taller sí lo hace, `src/lib/taller/caja.ts`).
   Hoy el cobrado del día se ve en Hoy y la deuda por alumno en Alumnos. Paso siguiente si lo pide.
3. **Sin notificación push** al celular de Matías: se entera por el WhatsApp que le manda el
   alumno al pedir, por la bandeja con número y por la app instalada. Web Push pide service
   worker + claves VAPID: se dejó para una segunda tanda.
4. **Recordatorio del día anterior:** es un botón ("Recordarle") en las clases de mañana; no hay
   cron que lo mande solo (sí está la plantilla `recordatorio_clase` lista para cuando haya API).
5. **Grupales:** el turnero toma "somos 2, 3 o 4" y cobra por persona; no hay grupos abiertos con
   cupo a los que se sumen desconocidos.
6. **Mercado Pago:** el pago es transferencia + comprobante o efectivo. El plugin de MP del motor
   (`src/plugins/mercadopago`) se puede enganchar después.
7. **Factura electrónica:** no se emite desde acá (plugin ARCA, a futuro, si Matías factura).

## Verificación hecha (15/10/2026)

- `tsc` limpio. Pruebas nuevas: 24/24 (`core.test.ts` 18 + `whatsapp-cloud.test.ts` 6).
- Suite completa: sin fallas nuevas respecto de `main` (las preexistentes, en el informe UAT).
- `prisma/rls/check-coverage.mjs`: OK (las 5 tablas nacen con RLS).
- `next build`: ver informe UAT.
- UAT en Chromium a 390 px con la sesión del profe guardada y reutilizada: ver
  [`.qa/padel-1510/INFORME-UAT.md`](../../../.qa/padel-1510/INFORME-UAT.md).

— Elaborado por GSG
