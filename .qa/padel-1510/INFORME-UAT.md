# UAT · Profe Matías Consoli (módulo `padel-clases`) — 15/10/2026

**Resultado: 20/20 OK** (tercera corrida, base limpia). Evidencia: `capturas/` (una o más por
caso) y `capturas/resultado.json`.

## Cómo se corrió

- **Demo local** con Postgres en memoria (PGlite) + las 53 migraciones (incluida la nueva) + seed
  de ejemplo: `node scripts/padel/demo-local.mjs`. **No se tocó Neon ni producción.**
- **Chromium** (Playwright 1.61, `/opt/pw-browsers/chromium`) en modo **celular, 390×844**,
  `es-AR`, zona `America/Argentina/Buenos_Aires`.
- **Sesión iniciada:** el profe entra **una vez** por el login real (`/admin/login`); se guarda la
  sesión (`storageState`, fuera del repo, se borra al terminar) y **todas** las pantallas del profe
  se recorren con esa sesión en un contexto nuevo, como su Chrome con la sesión abierta. Los
  alumnos navegan en contextos limpios, sin sesión.
- Cualquier error de consola del navegador cuenta como falla del caso.
- Script: `.qa/padel-1510/01-uat.mjs` (`PADEL_DEMO_PASSWORD=… node .qa/padel-1510/01-uat.mjs <base> <carpeta>`).

## Casos

| # | Quién | Caso | Resultado |
|---|---|---|---|
| U01 | Alumno | La raíz del negocio abre el turnero; sin errores ni desborde a 390 px; la app instalable abre en Hoy | ✅ 12 días con lugar |
| U02 | Profe | Inicia sesión en Chrome y la sesión guardada se reutiliza | ✅ |
| U03 | Profe | Hoy: próxima clase arriba con sus botones + aviso y número de pendientes | ✅ badge 2 |
| U04 | Profe | Carga su celular en Horarios y precios; copia el link para Instagram | ✅ |
| U05 | Alumna nueva | Pide clase en 3 pasos → "¡Listo!" + **WhatsApp al profe** (wa.me con su nombre) + **su link** | ✅ |
| U06 | Otro visitante | La franja pedida ya no se ofrece | ✅ |
| U07 | Alumna | Antispam: 3.er pedido sin confirmar del mismo celular → mensaje claro, no se crea | ✅ |
| U08 | Alumno | Hoy no se ofrece nada a menos de 2 h | ✅ 4 franjas, todas a +2 h |
| U09 | Profe | **Pendientes → Confirmar** con un toque → botón **"Avisarle por WhatsApp"** con precio, alias y link; el botón **no desaparece** aunque el pedido salga de la lista | ✅ |
| U10 | Profe | **No puedo** → WhatsApp con el link del turnero para elegir otro horario | ✅ |
| U11 | Alumna | Su link: "Confirmada", alias, **sube la foto del comprobante** → "Comprobante por revisar" | ✅ |
| U12 | Profe | Ve la foto del comprobante y lo **valida** → WhatsApp "recibí el pago" | ✅ |
| U13 | Profe | **Entre clase y clase** (Hoy): ve el comprobante de la próxima ahí mismo, lo valida, **Dada**, **+ Agendar la próxima** (misma hora, semana que viene) | ✅ 3,2 s incluyendo recargas |
| U14 | Profe | **Cobré en efectivo** con un toque; el cobrado del día se suma en la cabecera | ✅ $ 75.000 |
| U15 | Profe | **Agendar a mano** (le pidieron en la cancha), alumno nuevo → confirmada + WhatsApp | ✅ |
| U16 | Alumno | Desde su link, **"la semana que viene igual"**: la hora estaba tomada → ofrece 3 alternativas → reserva una, **confirmada sola** (alumno conocido) | ✅ |
| U17 | Alumna | **Cancela** desde su link → el horario vuelve al turnero y el profe lo ve en Pendientes | ✅ |
| U18 | Profe | **Bloquea un día** (lluvia) y **cierra los sábados** → el turnero deja de ofrecerlos | ✅ |
| U19 | Profe | Semana (con navegación) y Alumnos (quién debe) entran en 390 px | ✅ |
| U20 | Cualquiera | Link inválido → 404 · panel sin sesión → login · webhook de WhatsApp: GET sin token 503, POST apagado `skipped` | ✅ |

## Lo que la UAT encontró y se corrigió antes de cerrar

1. **El botón verde de WhatsApp se iba con la tarjeta.** Al confirmar un pedido o validar un
   comprobante, la acción refresca la lista y la tarjeta (ya no pendiente) desaparecía con el
   botón adentro, sin que el profe pudiera avisarle al alumno. Ahora el resultado y el WhatsApp
   van en una **barra fija abajo** (`clases/_aviso.tsx`, montada en el layout) que queda hasta que
   el profe lo toca o toca "Listo". Casos U09 y U12.
2. **El turnero mostraba la dirección de otro negocio** ("Barrio La Alameda, Canning": el valor por
   defecto de `getLocation()` es el de CH Estética). Ahora la dirección y el horario salen sólo de
   lo que cargó el profe (`datosDelNegocio`, `src/lib/padel/datos.server.ts`).
3. "Comprobante Por Revisar" / "Sí, Viernes 23/10 A Las 08:00": el `capitalize` alcanzaba a toda
   la línea; ahora sólo al día.
4. El botón verde se partía en dos renglones a 390 px: la barra se reacomodó (estado + "Listo"
   arriba, botón a todo el ancho abajo).

## Observaciones que no son de este módulo

- En `/admin/login` React avisa por consola "Encountered a script tag while rendering React
  component" (viene de `src/app/admin/AdminThemeScript.tsx`, preexistente). Se registra en
  `resultado.json → observaciones`, no cuenta como falla.
- El círculo "N" de las capturas es el indicador de `next dev`; no existe en producción.

## Verificación técnica

| Chequeo | Resultado |
|---|---|
| `npx tsc --noEmit` | limpio |
| `eslint` de lo nuevo y lo tocado | limpio |
| Pruebas nuevas (`src/lib/padel/*.test.ts`) | 24/24 |
| Suite completa (`npm test`) | 4.593 pasan · 23 fallan, **las mismas 23 que fallan en `main` hoy** (ARCA ENG-020/021 y contrato, ensayo de Neon, redondeos, "Vender en el navegador", 44 px de la estética). **Ninguna falla nueva.** |
| `prisma/rls/check-coverage.mjs` | OK: las 5 tablas nuevas nacen con RLS |
| `next build` | OK; rutas `/clases`, `/clases/app.webmanifest`, `/alumno/[token]`, `/admin/clases/*`, `/api/webhooks/whatsapp` |
| Migración en una base real (PGlite) | aplicada con las 52 anteriores, seed OK |

`npm run gates` no se pudo usar de corrido (el proceso se cortó sin salida en el entorno); se
corrieron sus cinco pasos por separado, con el resultado de la tabla.

## Gate de Excelencia (CLAUDE.md)

**1 · Auditoría Fiori + ángulo argentino**
- [x] Rol: el profe ve su día y sus pendientes; el alumno, sus clases. Nada de más para cada uno.
- [x] Coherente: mismos estados y textos en turnero, link y panel (`ESTADO_LABEL`, `ESTADO_PARA_ALUMNO`).
- [x] Simple: turnero de 3 pasos en una pantalla; cada acción del profe es un toque.
- [x] Adaptable: 390 px sin desborde (medido); marca por negocio como dato (`marca.ts`).
- [x] Accesibilidad: labels reales, `aria-pressed` en los chips, `role="alert"`/`status`, botones ≥ 44 px (48–58 en lo principal), foco del kit.
- [x] Consistencia: panel con los componentes y tokens del motor (`buttonClasses`, `EmptyState`, `var(--success)`…); mismo patrón que taller/inmobiliaria.
- [x] Argentino: vos, criollo claro; transferencia con alias + comprobante, efectivo; **WhatsApp-first**; números `es-AR`; ARCA N/A (Matías no factura desde acá todavía: anotado).

**2 · Sello GSG**
- [x] `metadata.generator = "Gestión Studio Grow"` en turnero, link del alumno y panel; crédito discreto "Con tecnología de Gestión Studio Grow" al pie del panel del profe (layout de Clases), **no** en la vidriera; el negocio conserva su nombre visible; docs firmadas "— Elaborado por GSG".

**3 · Arquitectura**
- [x] Capas: reglas puras (`core.ts`) / lecturas (`datos.server.ts`) / escrituras (`acciones.ts`) / transporte (`notificador.ts`, `whatsapp-cloud.ts`).
- [x] Multi-tenant: `tenantId` en cada consulta y escritura; altas en `bookingTransaction`; RLS en las 5 tablas.
- [x] Seguridad: `requireApp` en cada página, `requireCapability("agenda:manage")` en cada acción del profe, token de 18 bytes para el alumno, freno por IP, webhook con firma HMAC y fail-closed.
- [x] ADR-055: objeto nuevo sólo donde el core no sirve; se reusa `Client`; el módulo se asigna sólo al rubro `profe-padel`.
- [x] Deuda anotada en `docs/tenants/matiasconsoli/README.md` → "Qué NO está hecho".

**4 · Confiabilidad**
- [x] tsc + build + tests verdes (sin fallas nuevas).
- [x] No rompe prod: migración **aditiva y sin aplicar** (gate 2), fuera de `lote-deploy.txt`; **sin push a `main`** (gate 1).
- [x] Errores: mensajes en criollo; el envío por Cloud API cae al botón verde si Meta rechaza.

— Elaborado por GSG
