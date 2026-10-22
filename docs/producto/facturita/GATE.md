# Facturita como app — Gate de Excelencia (4 bloques)

Frente: «facturación automática» · célula Facturita como app · rama
`claude/facturacion-automatica-facturita` (desde `origin/claude/facturacion-automatica`).
Fecha: 2026-10-22. Sin deploy, sin migraciones, sin Neon, sin credenciales ARCA, sin datos reales.

## Qué entra

| Pieza | Archivos |
|---|---|
| PWA instalable | `src/app/facturita/layout.tsx` (manifest, íconos, theme color) · `src/app/facturita/manifest.webmanifest/route.ts` (estático) · `src/lib/facturita-pwa.ts` · `public/facturita/sw.js` · `public/facturita/sin-conexion.html` · `public/facturita/icon*.png`, `icon.svg`, `apple-touch-icon.png` · `RegistrarServiceWorker.tsx` · `InstalarApp.tsx` |
| Alta self-serve (modo alta operada, sin persistencia) | `src/app/facturita/alta/` · `src/lib/facturita-onboarding.ts` |
| Planes y precios (fuente única, provisionales) | `src/lib/facturita-planes.ts` · `src/app/facturita/planes/page.tsx` · `app/cuenta/page.tsx` (gancho con precio) |
| Vidriera | `src/app/facturita/page.tsx` · `VidrieraMarco.tsx` · `estilos.ts` |
| Tests | `src/lib/facturita-{onboarding,planes,pwa}.test.ts` (27 casos con los de core) |

## 1. Auditoría SAP Fiori (7 ángulos) + ángulo argentino

- [x] **Rol-based:** la vidriera habla al monotributista/comercio chico; la app instalada abre en «Emitir» (su tarea), no en un menú.
- [x] **Coherente:** misma piel Fable que `/facturita/app`, acento ámbar del producto (`producto-identidad.ts`), mismos tokens.
- [x] **Simple:** alta en 5 pasos, uno por pantalla; validación por paso; mensajes que dicen qué revisar.
- [x] **Adaptable:** mobile-first; probado en 360 / 768 / 1280 (capturas en `capturas/`). Branding: producto con marca propia (no por tenant); el layout de la app sigue con el acento del negocio.
- [x] **Delightful/enterprise:** ejemplo de factura en HTML (no imagen) arriba; sin animaciones salvo el «+» del FAQ (200 ms, `transform`, respeta reduced motion).
- [x] **Accesibilidad:** labels reales, `aria-invalid` + `aria-describedby`, `role="alert"` en errores, foco al título al cambiar de paso, «Saltar al contenido», foco visible en todo control, `<details>` nativo en FAQ, contraste AA con tokens Fable (`text-accent-ink` para texto en ámbar).
- [x] **Consistencia:** reusa `@/lib/cuit` (validador oficial), `whatsapp-cta` (helper único, DX-4), `resolveAccent`, `LIMITE_FACTURAS_FACTURITA`; no duplica lógica fiscal.
- [x] **🇦🇷 Argentino:** voseo criollo, ARCA (no AFIP), CUIT/CUIL/DNI, monotributo/RI/exento, punto de venta «Web Services», delegación por «Administrador de Relaciones de Clave Fiscal», WhatsApp-first, «sin tarjeta», «tu clave fiscal queda con vos». Mercado Pago aparece sólo como trigger de upgrade (frontera dura ADR-076).

## 2. Sello GSG

- [x] `metadata.generator = "Gestión Studio Grow"` en el layout de producto, la vidriera, alta, planes, y `<meta name="generator">` en la página sin conexión.
- [x] Crédito discreto: pie de la vidriera en `text-xs text-faint` («Un producto de Gestión Studio Grow» — Facturita es producto propio de GSG); el crédito del backoffice ya estaba en `app/layout.tsx`.
- [x] Commit con trailer del equipo GSG. Docs firmados.

## 3. Excelencia de Arquitectura

- [x] **Capas:** lógica pura en `src/lib/facturita-*.ts` (testeada sin red); UI en `src/app/facturita/`. El cliente no importa nada de servidor (`estilos.ts` separado de `VidrieraMarco` por eso — el build lo cazó).
- [x] **Multi-tenant:** el manifiesto es de PRODUCTO (estático, igual para todos) — no expone datos de ningún negocio (MT-1). Ninguna pantalla nueva lee tenant ni base.
- [x] **Seguridad:** el SW sólo precarga 3 archivos públicos; nunca `cache.put`, nunca navegaciones ni respuestas con sesión, ignora no-GET (server actions) y fuera de `/facturita/`. Lo vigila `facturita-pwa.test.ts`. El alta no pide clave fiscal ni guarda nada.
- [x] **Deuda anotada:** P-1..P-5 en `PEDIDOS-A-PLATAFORMA.md` (host→producto, portón de sesión de `/facturita/app`, headers del SW, alta real con la fábrica, `WHATSAPP_GSG` en build).

## 4. Confiabilidad de Producción

- [x] `npx tsc --noEmit` verde (exit 0). `eslint` de lo tocado: 0 problemas.
- [x] `npm test`: 5812 tests, 5802 pasan, 10 fallan — **ninguno de Facturita** y todos en áreas que este
  frente no toca (pruebas de navegador de /vender e ingreso, pie pegado del admin, fila de KPIs, escala de
  clientes/links de cobro, cron con RLS, búsqueda sin tildes, guardia de redondeos con archivos de `club/`).
  Los 27 tests de `src/lib/facturita-*.test.ts` + `guardia-bundle-cliente`, `site-gate` y
  `producto-identidad` pasan.
- [x] `npm run build` verde. El manifiesto sale estático (○). Las páginas declaran `force-static` y no
  leen base, pero el layout raíz (`src/app/layout.tsx`) exporta `force-dynamic` y se impone: salen ƒ,
  igual que `/demo` (pedido P-6).
- [x] QA clic por clic con Playwright (Chromium) en 360/768/1280: sin scroll horizontal; alta completa
  con error de campo vacío, CUIT con verificador mal y camino feliz; el SW se registra con alcance
  `/facturita/`, controla `/facturita/planes` y sin red muestra «Sin conexión · Facturita».
- [x] No rompe prod: sin schema, sin migraciones, sin cambios en `src/proxy.ts`, `next.config`, `/api/pwa/admin.webmanifest` intacto.
- [x] Errores: registro del SW con `catch` silencioso (la app anda sin él); portapapeles con `try/catch`; sin número de WhatsApp no aparece el botón (no se inventa).

---

## Vuelta 2 — revisión del contador (2026-10-22)

| # | Hallazgo | Qué se hizo | Dónde |
|---|---|---|---|
| C1 | Inscripto: toda factura rechazada (ENG-024) | El inscripto elige alícuota (21 % por defecto, 10,5 %, 27 %) y el IVA va **declarado en el renglón** con `montosDeRenglones` del motor → `ivaPorProducto: true`. Monotributo/exento siguen con `calcularImpuestos`. | `src/lib/facturita-montos.ts`, `EmitirForm.tsx` |
| C1b | «ARCA no autorizó» cuando lo frenó el sistema | `origenDelRechazo`: con código numérico es ARCA («ARCA rechazó…»), si no, «No la mandamos a ARCA porque le falta algo: …». | `facturita-core.ts` |
| C2 | Receptor fijo en consumidor final (RG 5616) | Con CUIT se pide la condición (RI / monotributo / exento) y viaja la real; CUIL, DNI o sin documento → consumidor final. Sin condición con CUIT no se emite. `src/lib/fiscal/**` sin tocar. | `validarEmision`, `EmitirForm.tsx` |
| C3 | Descripción no se guardaba | Se pasa `descripcion` a `createInvoice` (PDF y lista). | `facturita-actions.ts` |
| C4 | Concepto fijo en productos | Productos / Servicios / Ambos (`Segmented`). Con servicios: período desde/hasta y vencimiento del pago (hoy por defecto; se valida hasta ≥ desde y vencimiento ≥ hoy), que el motor manda como FchServDesde/Hasta/FchVtoPago. El placeholder del detalle sigue al concepto. | `facturita-core.ts`, `EmitirForm.tsx` |
| C5 | «Factura emitida» siempre | La acción lee la factura después del despacho y responde el estado real: autorizada (con N.º y CAE, o «de prueba»), pendiente («sale apenas ARCA responda» / «la conexión con ARCA todavía no está activa»), o rechazada con el motivo. | `facturita-actions.ts`, `mensajeDeEmision` |
| M | «sin límite» / «para siempre» | Fuera: el tope del aviso nombra 159 (plan Solo, lo vigila un test); Facturita dice «Sin tarjeta». | `facturita-core.ts`, `facturita-planes.ts`, `cuenta/page.tsx` |
| M | Stub mostraba «Autorizada» | `esDePrueba(modo, homologación)`: en stub u homologación, «Autorizada de prueba» + aviso de que no tiene validez fiscal; en Mi cuenta, «Simulado». | `facturas/page.tsx`, `cuenta/page.tsx` |
| M | Fecha de «Mis facturas» un día antes | `fechaFiscalLegible` formatea AAAAMMDD como texto, sin `Date`. | `facturas/page.tsx` |
| M | CUIT real en el placeholder y en tests | Placeholder genérico («11 números, con o sin guiones»; DNI «7 u 8 números»); tests con CUIT inventados (20-11111111-2, 30-11111111-8). | `EmitirForm.tsx`, `facturita-core.test.ts` |
| M | `CUIT_GSG_DELEGACION` | Sigue `null` con su texto («te lo pasamos por WhatsApp»), como se pidió. | `facturita-onboarding.ts` |

**Verificación vuelta 2:** `tsc` verde; eslint 0; 56 tests puros de Facturita verdes; nuevo
`src/lib/facturita-emision-postgres.test.ts` (4 casos, Server Action real contra base efímera con RLS
y ARCA en stub): monotributo → servicio a empresa RI (C, concepto 2, fechas, condición real en el
envío, descripción guardada); CUIT sin condición no crea factura; inscripto 10,5 % → B con desglose
código 4 e `ivaPorProducto`; inscripto → inscripto frenado por el sistema (régimen de Factura A sin
cargar, RG 1575) con el mensaje del sistema; facturación apagada → PENDIENTE y «todavía no está
activa». Suite completa (una corrida, con Postgres en :5434): 5934 tests, 5930 pasan, 4 fallan — los
3 de la base (pie pegado, cron de recordatorios con RLS, redondeos con archivos de `club/`) y
`cartera-abonos-postgres` (carrera de idempotencia de la consola bajo carga; corrido solo, pasa).
`npm run build` verde.

**Fuera de mi lista, tocado a sabiendas (1 línea):** `src/lib/umbral-en-los-seis-caminos-postgres.test.ts:209`
esperaba el texto viejo «ARCA no autorizó la factura:» para un rechazo que es del SISTEMA (el umbral de
la RG 5700). Con C1b el texto correcto es «No la mandamos a ARCA…»: se actualizó la aserción.

**Limitaciones que quedan (anotadas):**
- Inscripto → inscripto (Factura A) necesita la clase de Factura A que asignó ARCA (RG 1575); Facturita
  no la deja cargar: hoy la carga Soporte GSG. Sin ella, la A se frena con ese motivo, en criollo.
- Una alícuota por factura (la vidriera lo dice). Varias alícuotas en una venta → Comerciante.
- `descripcion` necesita la migración `20261022140000_invoice_abono_descripcion` (**Gate 2, sin
  aplicar**), igual que la consola: **no desplegar esta rama a una base sin esa migración**.

---

## Vuelta 3 — segunda revisión del contador (contra 5465d3dd, 2026-10-22)

| Nivel | Hallazgo | Qué se hizo | Dónde |
|---|---|---|---|
| CRÍTICO | El PDF no salía: faltaban razón social, domicilio, inicio de actividades e IIBB del emisor | «Datos para tus facturas» en Mi cuenta: graba en los MISMOS campos que lee el PDF (`arcaRazonSocial`, `arcaDomicilioFiscal`, `arcaInicioActividades` AAAAMMDD, `arcaIibb` con «Exento»/«Convenio Multilateral»), en `tenantTransaction` del propio negocio, con auditoría. Escritura propia y mínima: `multilocal-core.ts` no se tocó. | `facturita-emisor.ts`, `cuenta/DatosParaFacturas.tsx`, `guardarDatosParaFacturasAction` |
| CRÍTICO | El PDF pedía el nombre del comprador con documento | Emitir pide nombre (obligatorio con documento) y domicilio (opcional, con CUIT). Invoice no tiene columnas: se guarda una copia en `AuditLog` (`comprobante.receptor`, `entityId` = factura, misma transacción que la factura) y el lector del PDF la usa cuando no hay venta, turno ni movimiento. Mismo patrón que la clase de Factura A. | `facturita-actions.ts`, `comprobante-pdf-datos.ts` |
| CRÍTICO | El 409 mandaba a pantallas que Facturita no tiene | `respuestaPdfDeComprobante` acepta `volverA` como objeto (`texto`, `href`, `completarEmisor`, `reescribir`): página HTML con lo que falta, dicho para Facturita, y enlaces a «Mi cuenta» y «Mis facturas». El backoffice sigue con el texto de siempre (mismo `string`). | `comprobante-pdf-respuesta.ts`, ruta del PDF |
| CRÍTICO | El PDF no leía `descripcion` | El renglón usa `Invoice.descripcion` si existe; se lee en una consulta aparte que tolera P2021/P2022, así el PDF del backoffice sigue saliendo en una base sin la migración del motor. | `comprobante-pdf-datos.ts` |
| CRÍTICO | Facturas sin PDF sin aviso | En Emitir, aviso amable con lo que falta y enlace a Mi cuenta; no bloquea (ARCA no lo exige). | `app/page.tsx` |
| ALTO | Textos que prometían de más | Vidriera: la letra se explica (C, o B del inscripto a consumidor final/exento; la A desde ARCA); «Va a ARCA» con autorización si responde, pendiente si no; «Se autoriza en ARCA, con CAE»; ejemplo «Autorizada · CAE» y «PDF para tu cliente»; cierre «cinco pasos cortos… la activamos nosotros» (sin «en el día» ni «cinco minutos»). Planes, manifiesto, alta, Mis facturas y Mi cuenta alineados. | `page.tsx`, `facturita-planes.ts`, `facturita-pwa.ts`, `alta/*`, `facturas/page.tsx`, `cuenta/page.tsx`, `facturita-onboarding.ts` |
| MEDIO | Fechas de servicio precargadas con hoy | Vacías y obligatorias (las tres) con servicios; sin default en el núcleo ni en el formulario. | `facturita-core.ts`, `EmitirForm.tsx` |
| MEDIO | «Sale apenas se active» sin la ventana de ARCA | El pendiente avisa: ARCA acepta la factura hasta 5 días (productos) o 10 (servicios) después de su fecha; si no salió, se rechaza y hay que volver a emitirla. | `ventanaDeFechaArca`, `mensajeDeEmision` |
| MEDIO | «De prueba» con el estado de hoy | Mis facturas usa `ambienteDelComprobante` por factura (el mismo que el PDF): hora de autorización vs. último cambio de ambiente del negocio; si cambió después, «Autorizada (ambiente sin confirmar)». **Invoice no guarda el modo ni el ambiente: queda anotado** (columna con migración, junto con las del receptor). | `facturasFacturitaAction`, `facturas/page.tsx` |
| MEDIO | Sin notas de crédito | «Anular» en las autorizadas con saldo: pide el motivo y confirma; `crearNotaDeCredito` del motor (toma la factura con bloqueo, nunca anula más de lo facturado) y despacho. La lista muestra la nota y «Anulada con nota de crédito». | `anularFacturitaAction`, `facturas/AnularFactura.tsx` |
| MEDIO | CUIT 30/33/34 como monotributista | Se rechaza: una persona jurídica no puede ser monotributista (`claseDelPrefijo` del Core). | `validarEmision` |

**Verificación vuelta 3:** `tsc` verde; eslint 0; tests puros de Facturita + `comprobante-pdf.test.ts`
verdes (3 casos nuevos de Facturita en el del PDF: faltantes del emisor dichos sin pantallas del
backoffice, C con comprador y descripción impresos, comprador sin nombre guardado → ARCA).
`facturita-emision-postgres.test.ts`: 5 casos verdes, el nuevo hace el circuito entero (409 HTML con
enlace a Mi cuenta → guardar datos en los campos del PDF → 200 `application/pdf` con el comprador
de la copia y la descripción → anular con nota de crédito, sin saldo, y una segunda anulación
rechazada). Suite completa (una corrida, Postgres en :5434): 5946 tests, 5942 pasan, 4 fallan — los 3
de la base (pie pegado, cron de recordatorios con RLS, redondeos) y `club/guardado-enchufado` (corrido
solo, 7/7 verdes: carga). `npm run build` verde.

**Decisiones / pendientes para el dueño:**
- La nota de crédito ocupa un lugar del cupo de 5 del mes (el cupo cuenta todo lo no rechazado,
  `filtrosFacturacionMes` en bancos-glue). ¿Las notas tienen que quedar fuera del cupo? Es un cambio
  fuera de Facturita.
- Columnas en Invoice para la copia del receptor (nombre, condición, domicilio) y el ambiente de ARCA
  (migración, Gate 2): hoy viven en `AuditLog` y en la deducción del PDF.
- Las facturas emitidas antes de esta vuelta no guardaron el nombre del comprador: su PDF manda a
  «Mis Comprobantes» de ARCA.

---

## Vuelta 4 — observaciones de la Auditoría GSG (8b67f3b6) y restos del contador de lanzamiento

Base: 8b67f3b6 (la copia del comprador ya va con la entidad `ComprobanteReceptor`, SEC-5).

| # | Hallazgo | Qué se hizo |
|---|---|---|
| m-1 | «Anular»: foco perdido y `role="status"` recién montado | Patrón de la consola: al abrir, foco al motivo; al cancelar, vuelve a «Anular». `Avisos` (dos regiones vivas fijas) en un único árbol que no se remonta, montado en toda autorizada (`anulable` decide si se ofrece el botón), así el resultado se anuncia también cuando la lista se actualiza y la factura queda sin saldo. |
| m-2 | NC rechazada salía como `ok` en verde | `ok: false` con «ARCA rechazó la nota de crédito: … La factura sigue vigente.» (o «No mandamos la nota de crédito a ARCA…» si la frenó el sistema). |
| m-3 | A sin domicilio del comprador | Emisor inscripto + comprador inscripto o monotributista → domicilio obligatorio (núcleo y formulario). |
| m-4 | Bloqueo «jurídica monotributista» | Ahora es aviso («Ojo: un CUIT que empieza con 30, 33 o 34 casi nunca es monotributista…»), no bloqueo, hasta que lo confirme el contador. Umbral RG 5700 controlado en `validarEmision` (tabla de vigencias del Core): consumidor final sin identificar desde el umbral no crea factura. |
| m-7 | PDF sin control de blueprint | La ruta exige negocio `facturita` (404 si no). |
| m-8 | Legales indexables | `robots: { index: false, follow: false }` en términos y privacidad mientras digan «todavía no vigente». |
| m-9 | «Sin saber de letras ni alícuotas» para todos | Acotado a monotributistas; el inscripto elige alícuota y la condición del comprador. |
| 1 | «Mis facturas» se caía sin la migración 20261022140000 | La lista lee `descripcion` aparte y tolera P2021/P2022; la emisión reintenta sin `descripcion` si la columna no existe. |
| 2 | «dos minutos» | Fuera (vidriera y alta): «paso a paso» / «cinco pasos en ARCA». |
| 3 | PDF de la NC a comprador con documento | Al anular, en la MISMA transacción se copia a la nota la fila `ComprobanteReceptor` de la factura; además el lector del PDF cae a la copia del comprobante asociado (NCs viejas). El aviso de «falta el nombre» ya no inventa el motivo. |
| 4 | Modo simulado: «Avisá a soporte» | `comprobante-pdf.ts`: con CAE «STUB…», «En modo de prueba el PDF no sale porque la factura no tiene un CAE real…». Un CAE roto de verdad sigue pidiendo soporte. |
| 5 | «Anulada» con la NC pendiente | `estadoDeAnulacion`: «anulada» sólo con la nota autorizada; pendiente → «Anulación en curso». |
| 6 | Anular ocupa cupo sin avisar ni controlar | El formulario avisa que la nota cuenta como un comprobante del mes; sin cupo no se anula y se explica qué hacer (anularla desde ARCA o pasar a Comerciante). |
| 7 | «Ya podés descargar tus facturas» | Acotado a las autorizadas con el comprador guardado (las de consumidor final, siempre). |
| 8 | Punto de venta 4 cifras en la app, 5 en el PDF | 5 cifras en todo (formato del PDF de ARCA): `00002-00000015`. |

**Verificación vuelta 4:** `tsc` verde; eslint 0; 89 tests puros verdes (Facturita + `comprobante-pdf.test.ts`,
con los nuevos de domicilio de la A, umbral RG 5700, aviso de CUIT jurídico, estado de anulación, cupo,
NC rechazada, formato del número y CAE simulado). `facturita-emision-postgres.test.ts` 5/5: el circuito
del PDF ahora sigue con la NC (ficha copiada a la nota, PDF 200 de la nota, «en curso» → «anulada», número
`00002-…`) y el cupo agotado que no deja anular. Suite completa y build: ver la entrega.

**Nota de entorno (no afecta la rama):** el `npm install` del worktree no pudo bajar `xlsx` de
`cdn.sheetjs.com` (bloqueado por el proxy de la sesión). Para verificar se instaló localmente con
`xlsx@0.18.5` del registro y se restauraron `package.json`/`package-lock.json` sin cambios.

— Elaborado por GSG
