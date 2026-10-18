# Plan — Terminales de mostrador y recepción (lector · balanza · impresión · PWA · sin conexión · perfil de terminal · hardware) + Break Point al ERP React

**Fecha:** 2026-10-16 · **Autor:** Arquitecto de Solución (ADR-048) · **Estado:** plan para ejecutar por fases
**Fuente de verdad:** el código, con archivo y línea. Donde este doc y el código difieran, gana el código.
**Excepción pedida por el dueño el 2026-10-16:** este análisis y plan lo hizo el Arquitecto en **Fable 5.1**; la
ejecución la hace **Opus**. Es una excepción explícita del dueño a la norma "sólo Opus 5.5" de `CLAUDE.md`; no se
discute, se anota.

---

## 0. Calibración (ADR-052) — principios que guían este plan

- **Reversible se ejecuta, irreversible se eleva; ante la duda, es irreversible.** En este repo **push a `main` =
  deploy a prod en Vercel** (`CLAUDE.md` → Gate 1, dato verificado 2026-10-07), y `erp-ch` sirve en vivo a
  Break Point y a `circuito-wpe` (congelado). Por eso **toda fase "ahora" se integra en rama; el merge a `main` va a
  la sección "Para el OK del dueño"**. Nada de migraciones (Gate 2) en las fases "ahora".
- **El servidor es la única defensa de la plata.** La pantalla propone, el servidor decide (precios, stock, día
  cerrado, idempotencia). Nada que mueva plata se decide en el navegador. Esto es lo que ordena el punto 5.
- **Un solo Core, muchos negocios; el objeto se crea una vez y se ASIGNA (ADR-054/055).** El "perfil de terminal"
  es un objeto maestro; cada equipo se asigna a uno. Nunca "a todos con todo". Las features entran a un tenant por
  `Tenant.modules[]`, no por `if (slug === ...)`.
- **Aislamiento por tenant es sagrado (MT-1/3/5/6, SEC-2).** Un host = un tenant; `forcedTenantSlug` y `/demo`
  rompen esa equivalencia en el mismo origen, así que **ningún service worker que cachee HTML o respuestas
  autenticadas** (punto 4). Todo almacenamiento local se namespacea por tenant.
- **Demo → Venta → Inversión (ADR-030).** Break Point está en preventa y **hoy arranca un piloto con datos reales
  sobre la versión vanilla**: no se toca `public/previews/breakpoint/**`, `src/tenants/breakpoint/**` ni
  `src/lib/sitio-estatico.ts` mientras dure. Persistencia en Neon y schema nuevo son inversión post-venta.
- **Zona de de-sesgo (ADR-046):** la prosa de este doc y los textos de pantalla son humanos/criollos; lo técnico
  (rutas, firmas, riesgos, criterios de aceptación) es estándar y preciso.

---

## 1. Diagnóstico por punto (verificado contra el código, no contra los docs)

### 1.1 Lector de código de barras (HID = teclado)

| Qué hay | Dónde |
|---|---|
| Un solo campo recibe todo lo que "tipea" el lector (EAN, etiqueta de balanza, `3*código`, nombre) | `src/lib/supermercado/lectura.ts:33` `interpretarEntrada`, `:107` `resolverCodigo` |
| El foco se queda en el campo; si se fue, **un dígito tecleado fuera de un campo vuelve el foco al lector** | `src/app/admin/(dashboard)/caja-rapida/CajaRapida.tsx:80-92` (sólo `[0-9]`; si el lector manda un prefijo no numérico, el primer carácter se pierde y el código llega truncado) |
| Validación de verificador EAN/GTIN y limpieza de lo leído | `src/lib/supermercado/ean.ts:48` `esEan13Valido`, `:56` `limpiarCodigoLeido` |
| Catálogo indexado por `Product.codigo` en el navegador, sin ida al servidor por código | `src/lib/supermercado/caja-lectura.ts:37`, `lectura.ts:66` `indexarPorCodigo` |
| Feedback de OK/error: **sólo visual** (`setMensaje`), sin sonido ni vibración | `CajaRapida.tsx:130-157` `leer()`; el helper de vibración existe pero no se usa acá: `src/components/ui/tactil.ts:4` `vibrar` |
| Prefijos/sufijos del lector: **no configurables**. Se asume "dígitos + Enter" | `lectura.ts:33` (no hay campo en `ConfigCaja`, `src/lib/supermercado/config-repo.ts:108`) |
| `/vender` (mostrador de Magra y de los retail): **no tiene lector**. Su atajo global es `/` para enfocar la búsqueda y `Escape` para limpiar; busca por nombre | `src/app/admin/(dashboard)/vender/VenderForm.tsx:1413-1441` |
| Lo mismo en `/pedidos` (PosForm) y en la recepción de turnos (CH no escanea nada) | `src/app/admin/(dashboard)/pedidos/PosForm.tsx` |

**Veredicto:** la caja con lector (`caja-rapida`) está bien resuelta para "lector = teclado + Enter". Le falta:
(a) **prefijo/sufijo configurables** (muchos lectores vienen con STX/ETX, Tab o `*` de fábrica; con el
guardarraíl de "dígito fuera de campo" un prefijo no numérico pierde el foco y trunca); (b) **sonido/vibración**
de OK y de error (en mostrador con ruido no se mira la pantalla); (c) **lectura en `/vender`** (una ráfaga de
teclas que termina en Enter, fuera de un campo, debería resolver el código contra el catálogo y agregar la línea,
sin que el cajero tenga que tocar nada).

### 1.2 Balanza por etiqueta (EAN-13 de peso o importe)

| Qué hay | Dónde |
|---|---|
| Formato **configurable por tenant**: prefijos 20–29, dígitos del PLU (4/5/6), contenido `peso`/`importe`, decimales | `src/lib/supermercado/balanza.ts:40` `FormatoBalanza`, `:51` default, `:70` `problemaDelFormato`, `:106` `esCodigoDeBalanza`, `:123` `leerEtiquetaDeBalanza` |
| Guardado **sin migración**: fila más nueva de `AuditLog` (`entity: "ConfigBalanza"`), con versión optimista | `src/lib/supermercado/config-repo.ts:5-15`, `:121` `leerConfigCaja`, `:131` `guardarConfigCajaEnTx` |
| Pantalla de configuración (prefijos, dígitos, contenido, decimales, encargados) | `src/app/admin/(dashboard)/caja-rapida/configuracion/ConfigCaja.tsx:55-90,129` |
| Etiqueta con importe: se cobra exacto; el peso se deduce al gramo para el stock. Verificador EAN siempre | `balanza.ts:22-30,119-122` |
| El peso tipeado a mano (Magra: el celular y la etiqueta en la mano) | `src/components/ui/Teclado.tsx:1-10`, `src/lib/pos-peso.ts:83` `leerCantidad` |
| Marcado en el código: **"PROVISIONAL A CONFIRMAR con la balanza real del primer supermercado"** | `balanza.ts:28-30` |

**Veredicto:** la pieza pura está completa y probada (`balanza.test.ts`, `etiquetas-super.test.ts`). Lo que falta
para "cualquier balanza etiquetadora" es **operativo, no de motor**: (a) **presets de fabricante** (Systel, Kretz,
Moretti, Gama) como punto de partida en la pantalla —hoy el dueño tiene que saber cuántos dígitos usa su balanza—;
(b) un **probador de etiqueta** en la misma pantalla: pegás/escaneás un código de la balanza y ves cómo lo lee
(PLU, peso/importe, verificador) antes de guardar; (c) **verificador de precio dentro del código** (formatos
viejos): no se soporta y no conviene prometerlo. `/vender` no lee etiquetas de balanza: Magra pesa en el mostrador y
tipea; está bien así hasta que un tenant con balanza etiquetadora use `/vender` en vez de `caja-rapida`.

### 1.3 Impresión (ticket térmico, kiosco, tablet/Android)

| Qué hay | Dónde |
|---|---|
| **Sí se imprime el ticket de venta hoy**: documento HTML propio de **58 mm fijos**, en iframe invisible, `contentWindow.print()` | `src/app/admin/(dashboard)/vender/reglas-venta.ts:366` `htmlDelTicket`, `:377` `@page{size:58mm auto;margin:0}`, `:379` `body{width:58mm…}`; `TicketVenta.tsx:38-55` |
| Lo usan Vender, Ventas del día y la Caja con lector | `TicketVenta.tsx`, `ventas/FilaVenta.tsx`, `ventas/TablaDeVentas.tsx`, `caja-rapida/CajaRapida.tsx` |
| Compartir por WhatsApp con el mismo texto del ticket | `reglas-venta.ts:345` `textoDelTicket`; `TicketVenta.tsx:33-35` |
| "Sin probar en una impresora térmica real" (lo dice el código) | `reglas-venta.ts:363` |
| El ticket **siempre** lleva "No válido como factura"; no hay QR de CAE en el ticket | `reglas-venta.ts:153` `LEYENDA_NO_FACTURA`, `:340` (se agrega incondicionalmente) |
| El QR de ARCA existe, pero sólo en el **PDF A4** del comprobante (`pdf-lib` + `qrcode`) | `src/lib/comprobante-pdf.ts:16,26-27`; `src/plugins/arca/domain/qr-afip.ts:93` `urlQrAfip` |
| Otros documentos: remito A4, orden de taller A4, etiquetas de góndola 60×40 mm, recibo inmobiliaria | `src/lib/multilocal/traslado-core.ts:408`, `taller/orden/[id]/imprimir/page.tsx:31-35`, `src/lib/catalogo/etiquetas-core.ts:137,145`, `components/inmobiliaria/recibo.module.css:63` |
| Impresión directa en kiosco: **no documentada**. Depende de Chrome con `--kiosk-printing` (no es código) | — |

**Veredicto:** hay ticket y hay iframe; falta **ancho configurable (58/80) por equipo**, un **CSS de ticket
compartido** (hoy cada documento arma el suyo), el **QR de CAE cuando la venta está facturada**, la receta de
**kiosco** y la alternativa honesta para **tablet/Android** (compartir o "Guardar como PDF"; no prometer térmica
desde el navegador).

### 1.4 Backoffice instalable (PWA)

| Qué hay | Dónde |
|---|---|
| Un solo manifest, el del taller, por host (`getCurrentTenantId`), `display: standalone`, `start_url: /admin/taller` | `src/app/taller/app.webmanifest/route.ts:1-35` (`Cache-Control: public, max-age=3600`) |
| Se enlaza sólo desde Taller | `src/app/admin/(dashboard)/taller/page.tsx:10`, `src/app/taller/page.tsx:22` |
| **No hay service worker** en todo `src/` (grep `serviceWorker|sw.js`: 0 resultados) | — |
| El branding por tenant ya resuelve por host, puro y testeable | `src/lib/branding.ts:211` `brandForSlug`, `:255` `getTenantBrand`, `:279` `tenantFaviconDataUri` |
| El mismo origen puede servir **otro tenant** con `forcedTenantSlug` (dev/preview) y `/admin` sin cookie en el sandbox demo | `src/lib/tenant.ts:197,280`; `src/proxy.ts:83` |
| Sesión de 8 h en cookie `httpOnly` | `src/lib/auth-actions.ts:62` |

**Riesgo del service worker (análisis):** un SW cachea por **origen**, no por tenant ni por usuario. En prod cada
tenant es un host distinto (origen distinto) → entre tenants reales el SW no cruza. Pero: (1) en el mismo origen
conviven el sandbox `/demo`, el `forcedTenantSlug` de preview y, mañana, un `*.vercel.app` compartido; (2) **entre
usuarios del mismo tenant en un equipo compartido**, una respuesta HTML cacheada de `/admin/...` mostraría el panel
del cajero anterior sin sesión; (3) un SW desactualizado puede servir un bundle viejo contra server actions nuevas
(mismatch de IDs de action). **Lo mínimo seguro es: manifest sí, service worker no.** Chrome (escritorio y Android)
dejó de exigir service worker para "Instalar" (cambio de 2024; **a verificar en un dispositivo real en T-5**, es
criterio de aceptación): con manifest + HTTPS alcanza. Si alguna vez se agrega un SW, la regla es: cachear **sólo**
`/_next/static/**` (inmutable, con hash, sin datos), todo lo demás `network-only`, y nunca `navigate` requests.

### 1.5 Venta sin conexión

| Qué hay | Dónde |
|---|---|
| Sin señal **antes** de mandar: no se manda y se dice que NO salió | `cobro-sin-conexion.ts:105` `antesDeCobrar`; `VenderForm.tsx:316-322` (listeners `online/offline`), `:649` |
| Mandado y sin respuesta (25 s): queda "en duda", se reintenta con **la misma clave** | `cobro-sin-conexion.ts:52` `TIEMPO_MAXIMO_DEL_COBRO_MS`, `:180` `claveParaCobrar`, `:322` `recordarEnvioSinRespuesta` |
| La duda sobrevive al refresh en `sessionStorage` (por pestaña, por negocio), vence a las 12 h | `cobro-sin-conexion.ts:449` `VENCE_LA_DUDA_MS`, `:492` `almacenDeSesion`, `:503` `claveDelAlmacen`, `:507` |
| Servidor: idempotencia por `(tenantId, idempotencyKey)` única; si la clave existe y lo que llega **no coincide**, contesta `ya-grabada-distinta` y no graba | `prisma/schema.prisma:1315,1325`; `src/lib/order-actions.ts:240-242,318,385-386`; `src/lib/reintento-de-venta.ts:183` `compararConLoGrabado` |
| Caja con lector: misma clave, mismo `pedidoConClave`, frontera del día cerrado | `src/lib/supermercado/caja-actions.ts:72,125,135` |
| Día cerrado: lo decide el servidor (`lastClosedDay` desde `AuditLog` `CierreDiario`) | `src/lib/caja/frontera-cierre.ts:48`; `order-actions.ts:313` |
| Stock: puede quedar negativo sólo lo que se vende por peso (MAG-4) | `order-actions.ts:325-328`, `src/lib/stock/pos-stock-rules.ts` |
| Fecha de la venta: `Order.createdAt` = ahora del servidor; **no existe** "vendido el" que venga del cliente | `prisma/schema.prisma` → `Order.createdAt @default(now())` |

**Veredicto:** lo que hay es un **reintento idempotente del corte**, no una cola. Está bien diseñado y es la pieza
sobre la que cualquier cola se apoyaría. La cola, en sí, **no conviene ahora** (análisis y decisión firme en §2.5).

### 1.6 Perfil de terminal

No existe el concepto. Lo más cercano: la configuración de caja **por tenant** en `AuditLog` (`config-repo.ts`),
el `localStorage` que usa Break Point vanilla para su jornada (`bp-jornada-v1`) y el `sessionStorage` de la duda del
cobro. Ancho de ticket, sonido, impresión directa y pantalla de inicio hoy son constantes o no existen.

### 1.7 Guía de hardware

No existe un doc vendible. Hay pistas sueltas: `docs/tenants/breakpoint/REINGENIERIA.md` (cortes de luz, lluvia),
el comentario de Magra en `cobro-sin-conexion.ts:5-9` (celular + wifi que se corta) y `pos-peso.ts` (balanza con
teclado). Se escribe desde cero en §5 (fase T-7).

### 1.8 Tenants y superficies (para la matriz)

- **Backoffice React (`/admin`)**: `beauty-spa` (CH, **vivo en prod**), `magra`, `shinevelas`, `adosmanos`,
  `quebienoles` (`src/lib/tenant.ts:98` `HOSTS_PUBLICADOS`), más los rubros con módulo propio (taller, inmobiliaria,
  supermercado) — `docs/ESTADO-ACTUAL.md §3` está desactualizado (lista 4; hoy hay más).
- **Sitios estáticos servidos por el ERP** (`src/lib/sitio-estatico.ts:50-74`): `circuito-wpe` (**congelado**) y
  `breakpoint` (`/`, `/turnero`, `/club`). Break Point: la gestión del club es vanilla
  (`public/previews/breakpoint/club/{index.html,app.mjs,motor.mjs}` → `src/tenants/breakpoint/sitio/club.html`), y
  la **última versión está en `origin/ccr-63ed11dc-brcdpp` (603b45b6)**, todavía no en `main`: jornada real
  (`/club?modo=real`, `localStorage` `bp-jornada-v1`, respaldo JSON descargable/restaurable —
  `app.mjs:78-84,86-130`, `motor.mjs:160` `VERSION_ESTADO = 1`, `:174` `serializarEstado`, `:182`
  `hidratarEstado`), consola de configuración, cuenta del turno, crédito con código del dueño, tienda, difusión,
  Studio (`studio.mjs`). Tests: `src/tenants/breakpoint/motor-club.test.ts` (180+, con propiedades de plata) y el
  test de empaquetado al día (`motor-club.test.ts:380`).

---

## 2. Decisión por punto (hacer ahora / diferir / no hacer) y clasificación ADR-048

| # | Punto | Decisión | Clase | Por qué |
|---|---|---|---|---|
| 1 | Lector: prefijo/sufijo + sonido/vibración + ráfaga en `/vender` | **AHORA** (T-2) | Reversible (código en rama, lógica pura + UI, sin DB) | P1: es lo primero que se prueba en una demo de mostrador; costo chico sobre `lectura.ts` |
| 2 | Balanza: presets de fabricante + probador de etiqueta | **AHORA** (T-3) | Reversible (puro + pantalla existente; guarda en el mismo `AuditLog`) | P1 para carnicería/súper; el motor ya está, falta que el dueño lo configure sin técnico |
| 2b | Balanza: verificador de precio en el código / lectura por puerto serie | **NO HACER** | — | Formatos viejos y Web Serial sólo en Chrome escritorio; la etiqueta con lector cubre el 95 % |
| 3a | Ticket 58/80 configurable + CSS compartido + receta kiosco + Android honesto | **AHORA** (T-4) | Reversible | P1: "¿me imprime el ticket?" es pregunta de toda demo |
| 3b | QR de CAE en el ticket térmico cuando la venta está facturada | **DIFERIR** (T-8, misma rama cuando ARCA real esté encendido para un tenant) | Reversible, pero depende de I3 (ARCA real, OK del dueño) | Hoy ningún tenant factura en real; el QR sin CAE real es decorado. La URL ya existe (`urlQrAfip`) y `qrcode` ya es dependencia (`toDataURL` isomórfico): no hay dependencia nueva |
| 4 | PWA: manifest por tenant + ícono + `metadata.manifest` en `/admin`; **sin service worker** | **AHORA** (T-5) | Reversible | P1: "instalá la app" en la tablet de recepción vende; SW = riesgo cross-usuario/cross-tenant sin beneficio (no hay offline) |
| 5 | Cola de venta sin conexión | **DIFERIR con firmeza** (no en este ciclo; ver §2.5) | Irreversible en la práctica (necesita migración `vendidoEl`/origen + ADR + Advisory/Challenger) | El riesgo de plata (doble cobro, precio viejo, día cerrado, equipo compartido) supera el beneficio; el 4G de respaldo (§5) resuelve el 90 % por $0 de desarrollo |
| 6 | Perfil de terminal (objeto maestro + asignación por equipo, `localStorage` namespaced) | **AHORA** (T-1, es la base de T-2/T-4/T-5) | Reversible | Sin migración; ADR-055 aplicado: perfil = objeto, equipo → perfil = asignación |
| 7 | Guía de hardware vendible | **AHORA** (T-7) | Reversible (doc) | P1: la vende el comercial; cierra la conversación "¿qué compro?" |
| BP | Break Point al ERP React (portación) | **DESPUÉS del piloto** (fases BP-0..BP-5; BP-0 doc-only ahora) | BP-0..BP-3 reversibles en rama; BP-4 (schema) y la asignación del módulo al tenant real = **OK del dueño** | Piloto con datos reales corre hoy sobre vanilla: no se toca; portación coordinada con la sesión del club |

### 2.5 Venta sin conexión — análisis a fondo y recomendación

**Qué pediría una cola local de verdad:** guardar la venta completa en el equipo (`IndexedDB`/`localStorage`) con
su clave idempotente, la **hora real de venta**, el usuario y el tenant; reenviarla cuando vuelve la red; y que el
servidor la acepte **tal cual se cobró**. Riesgos, uno por uno:

| Riesgo | Qué pasa hoy | Qué haría falta | Gravedad |
|---|---|---|---|
| **Doble cobro** | El reintento usa la misma clave y el servidor compara (`compararConLoGrabado`) | Igual, pero con N ventas en cola y **dos pestañas o dos equipos** reenviando la misma cola (equipo compartido, respaldo restaurado) la clave protege sólo si la cola es **por equipo y única**; hay que bloquear la cola con `navigator.locks` y marcar cada ítem "en vuelo" | Alta |
| **Precios viejos** | El servidor decide con los precios de la base al cobrar | Cobrada en el mostrador a $X, reenviada 3 h después con precio $Y: hay que **congelar el precio en el cliente** y que el servidor **acepte un precio distinto al vigente** (hoy lo rechaza/recalcula). Eso abre la puerta a manipulación desde el navegador: requiere firma o tolerancia + auditoría | Alta |
| **Stock** | Sólo lo por peso puede quedar negativo | Varias ventas offline del mismo producto pasan todas; al reenviar, la 3.ª no tiene stock → ¿se rechaza una venta ya cobrada? Hay que **aceptar negativo para ventas offline** y avisar al dueño (política nueva) | Media |
| **Caja o día cerrado** | `fronteraDeVenta` rechaza | Vendida a las 23:50, reenviada a las 00:10 con la caja cerrada → rechazada. Hace falta `Order.vendidoEl` (fecha del cliente) + que la frontera mire **esa** fecha + que el cierre pueda **reabrirse por ventas offline tardías** → **migración (Gate 2)** y cambio de regla contable | Alta |
| **Sesión vencida** | Cookie de 8 h | El reenvío llega con 401; la cola queda huérfana en un equipo donde ahora está logueado **otro usuario**. Hay que atar la cola al `userId` y pedir re-login **sin perder la cola**; el actor del cobro sería el del momento de la venta, no el de la sesión actual (auditoría distinta) | Alta |
| **Equipo compartido / aislamiento** | La duda vive en `sessionStorage` por pestaña y por negocio | `localStorage` es por **origen**: en el sandbox `/demo` y en previews con `forcedTenantSlug` dos tenants comparten origen → la clave del almacén **debe** llevar `tenantId` **y** `userId`, y la cola debe purgarse al cerrar sesión | Media |
| **Tope de tiempo/monto** | — | Política: p. ej. máx. 2 h y $N por equipo, después "vender a mano". Hay que diseñarla con el dueño del negocio y auditarla | Media |
| **Idempotencia del alta** | `(tenantId, idempotencyKey)` única | Sirve igual; es el único pedazo que **ya está** | — |

**Recomendación (firme): NO construir la cola ahora. Diferir y reencuadrar.** Razones: (1) toca plata y fecha
contable, (2) requiere **migración** (`vendidoEl`, `origen`) = Gate 2, (3) requiere decisiones de política (precio
congelado, stock negativo, tope) que son del dueño del negocio y hoy no las pide ningún tenant pagante, (4) Magra —el
caso que originó el módulo— se resuelve mejor con **4G de respaldo** (router con SIM o el hotspot del celular, §5)
y con la mejora de T-2/T-4, y (5) la propia decisión de `cobro-sin-conexion.ts` ("sin señal no se manda") fue
deliberada y está bien. **Cuándo revisitar:** cuando un tenant con alto volumen lo pida con plata, se abre un ADR
propio con Advisory + Challenger (ADR-045) y se arranca por el modelo (`vendidoEl`, `origen`, tope) como migración
**aditiva** elevada al dueño. Lo que sí entra ahora, barato y reversible: (a) el perfil de terminal muestra el
estado de red en la barra (ya existe `enLinea` en `VenderForm`), y (b) la **duda** del cobro pasa a estar
namespaced también por usuario (hoy sólo por negocio: `claveDelAlmacen`, `cobro-sin-conexion.ts:503`) — un
hallazgo menor de equipo compartido que se corrige en T-1.

---

## 3. Matriz de rollout por tenant

Las features se **asignan** por `Tenant.modules[]` (ADR-054/055; `src/modules/descriptors/*`). El perfil de
terminal es por **equipo** (T-1), no por tenant. "Módulo `terminal`" = el descriptor nuevo que agrupa lector +
ticket + PWA (T-6); hasta que exista, las fases se enganchan a `pos`/`caja-rapida`.

| Tenant | Superficie | Perfil de terminal recomendado | Qué se asigna (módulos) | Cuidados |
|---|---|---|---|---|
| **CH Estética** (`beauty-spa`) | `/admin` **prod viva** | **Tablet de recepción** (turnos, cobro de turno, ticket por WhatsApp; impresión opcional por PDF) | `agenda`, `clients`, núcleo caja. PWA (T-5) sí: "instalá CH en la tablet". Lector/balanza: **no** (N/A, no escanea) | Es el único tenant en prod: todo lo de T-* debe ser **invisible** para CH salvo el manifest (que sólo agrega `metadata.manifest`). Verificar en QA que `/admin` de CH no cambia ni un píxel fuera del ícono de instalar |
| **Magra** (`magra`, carnicería) | `/admin/vender` | **Celular de mostrador** hoy (vibración de OK/error, ticket por WhatsApp, 58 mm si compra térmica) → **PC kiosco** cuando crezca | `pos`, `catalog`, `inventario`; T-2 (lector en `/vender`, por si etiqueta sus envasados), T-3 (balanza por etiqueta: la carnicería usa `Teclado`; la etiquetadora es upgrade de §5) | Wifi que se corta: 4G de respaldo (§5), **no** cola offline. Alta hecha en Neon, sitio sin deploy (I1) |
| **Shine Velas** (`shinevelas`, retail) | `/admin/vender` | **Celular/tablet de mostrador**; lector opcional si etiqueta sus productos | `pos`, `catalog`; T-2, T-4 (ticket 58), T-5 | Sin datos reales todavía (I7) |
| **A Dos Manos** (`adosmanos`, pádel retail) | `/admin/vender` o `caja-rapida` | **PC kiosco chica** (lector USB para palas/zapatillas con EAN del fabricante, térmica 80 mm) | `pos`, `catalog`, `caja-rapida` (sus productos vienen con EAN), T-2/T-4/T-5 | Material real pendiente (I7) |
| **Qué Bien Olés** (`quebienoles`, perfumería) | `/admin/vender` | **Tablet/PC de mostrador** con lector (perfumes con EAN) | `pos`, `catalog`, `caja-rapida`; T-2/T-4/T-5 | Host publicado en `HOSTS_PUBLICADOS` |
| **Supermercado / rubro súper** (blueprint) | `caja-rapida` | **PC kiosco** completa (lector, balanza etiquetadora, térmica 80, UPS, 4G) | `caja-rapida`, `ofertas`, `promociones`, T-2/T-3/T-4/T-5/T-6 | Es el tenant modelo de la guía §5 |
| **Taller / Inmobiliaria** | `/admin/taller`, `/admin/inmobiliaria` | Celular (taller) / PC (inmo) | Ya tienen su PWA (taller) y recibos A4; T-5 unifica el manifest sin romper el del taller | El manifest del taller sigue siendo el `start_url` del taller |
| **Break Point** (`breakpoint`, club de pádel) | **Hoy:** `/club` vanilla (piloto real, `?modo=real`). **Después:** `/admin/club` React | **PC/notebook de recepción** (ticket 80 mm del buffet, lector opcional para el buffet, PWA) + **celular del dueño** (aprobar crédito) | **Después del piloto:** módulo `club` (BP-1..) + T-2/T-4/T-5 por el backoffice React. Balanza: **N/A** (buffet por unidad) | **Piloto congelado:** no tocar `public/previews/breakpoint/**`, `src/tenants/breakpoint/**`, `src/lib/sitio-estatico.ts`. Todo lo BP se coordina con la sesión del club |
| **Circuito WPE** | estático | — | — | **Freeze**: nada |

---

## 4. Break Point al ERP React — plan de portación

### 4.1 Restricciones (de la sesión del club, 2026-10-16)

1. El **piloto con datos reales arranca hoy** sobre `/club?modo=real` (vanilla). Durante el piloto **no se tocan**
   `public/previews/breakpoint/**`, `src/tenants/breakpoint/**` ni `src/lib/sitio-estatico.ts`.
2. La portación a React es **posterior** al piloto y su ejecución se **coordina con esa sesión** (es dueña del
   código del club). Las fases marcadas **[BP · acordar]** tocan su terreno.
3. El dominio (`motor.mjs`, `turnero/dominio/*.mjs`) es puro, con 180+ tests y propiedades de plata (caja = cobrado,
   nada se cobra dos veces, el stock cuadra). Se porta **tal cual o a `src/lib/*-core.ts` con esos tests**.
4. Datos del piloto: `localStorage` `bp-jornada-v1`; respaldo v1 (`VERSION_ESTADO`) con sobre
   `{v, estado, secuencia, usuario, guardado}` (`docs/tenants/breakpoint/FORMATO-RESPALDO.md`, llega en el próximo
   commit de la rama). La migración al ERP **parte de ese formato**.
5. El UX validado con el dueño se porta con el **mismo comportamiento**: cuenta del turno en un solo lugar; cobrar
   la cancha y cerrarla mientras la mesa sigue; crédito con código del dueño; consola de configuración.
6. Push a `main` = deploy de `erp-ch` (sirve Break Point en vivo y `circuito-wpe` congelado). Las fases "ahora" de
   terminal **no tocan Break Point** y se integran por rama, **sin push a `main`**.

### 4.2 Mapeo de módulos del club → ERP (qué existe, qué es nuevo)

| Módulo del club (vanilla, `motor.mjs` en 603b45b6) | ERP existente | Encaje | Veredicto |
|---|---|---|---|
| **Canchas** (`CANCHAS_DEMO`, `configurarMantenimiento`, `bloquear`) | `Box` (sala/box de turnos, `schema.prisma` model `Box` con `BoxBlock`) | Una cancha ≈ un `Box` con bloqueos. Pero `Appointment` **exige** `professionalId` y `serviceId` | **Nuevo** (modelo `Cancha` del plugin) o migración que haga opcionales esos FK: ambas = Gate 2 |
| **Turnos de cancha** (`crearReserva`, `validarHueco`, `huecosLibres`, `mover`, `extender`, `interrumpir`, `planLluvia`, `checkIn`, `finalizar`, `marcarNoShow`, `cancelar`, `crearFijo`, `materializarFijos`, lista de espera) | `/admin/turnos` + `src/lib/turnos/*` (cobro, anulación, turno abierto), `WaitlistEntry`, `AppointmentStatus` (PENDING/CONFIRMED/CANCELLED/COMPLETED/NO_SHOW) | Los **estados** y la **lista de espera** calzan; las reglas (precio valle/pico por franja, fijos semanales, lluvia, interrupción con devolución proporcional) **no existen** en CH | **Nuevo** (`TurnoCancha` + `TurnoFijo` + `Bloqueo`), reutilizando patrón y pantallas de agenda como referencia visual |
| **Cuenta del turno por jugador con "a cargo de"** (`partesCancha`, `asignarCargoCancha`, `cobrarParte`, `cobrarJugador`, `cobrarTodoElTurno`, `cerrarCanchaYSeguir`) | `Collection` (cobros parciales con `idempotencyKey`, `originType`) + `src/lib/turnos/cobros.ts` | Los cobros parciales **sí** existen; "parte por jugador" y "a cargo de" **no** | **Nuevo** (`ParteTurno`), cobro vía `Collection` existente |
| **Buffet / mesas que siguen cargando** (`abrirCuenta`, `cargarEnCuenta`, `transferirCargo`, `cargoManual`, `cerrarCuenta`, `mesasAbiertas`, `ventaMostrador`) | `/admin/pedidos` (`Order` abierto con `OrderItem`, `paid=false`), `/admin/vender` (venta de mostrador), `Product.codigo` + lector | Una cuenta abierta ≈ un `Order` sin cobrar que crece; el cobro final ≈ `/vender` sobre ese pedido. Transferir cargos entre cuentas: no existe | **Existente con adaptación** (pedido-cuenta) — es la pieza más reutilizable. Lector/ticket térmico del buffet: T-2/T-4 |
| **Caja de 12 a 12** (`diaDeCaja`, `cerrarCaja`, `egresoCaja`, `resumenCaja`) | `CashSession`/`CashMovement`, `/admin/caja`, cierre diario (`frontera-cierre.ts`, `todayInBusinessTz`) | La caja del ERP cierra por **día calendario** en la zona del negocio; el club necesita **día de caja que arranca a las 12:00** | **Existente con un parámetro nuevo** (hora de corte del día de caja por tenant; hoy no existe → config en `AuditLog` como `ConfigCaja` o en `BusinessSettings` = migración). Se elige `AuditLog` (sin migración) |
| **Crédito / cuenta corriente con código del dueño** (`solicitarCredito`, `codigoAprobacion`, `aprobarPorCodigo`, `configurarCC`, `cobrarDeuda`) | `AccountReceivable` (fiado), `/admin/cuentas-a-cobrar`, `CarteraCliente` | El fiado existe; el **código de 6 letras derivado del PIN del dueño** (aprobación remota por WhatsApp) **no** | **Existente + nuevo**: la deuda va a `AccountReceivable`; la aprobación por código se porta pura (`codigoAprobacion`) y queda como regla del módulo `club` |
| **Usuarios con PIN** (`verificarPin`, `usuarioPorPin`, `regenerarPin`, `solicitarAcceso`/`otorgarAcceso`) | `User` (email + `passwordHash`, roles), `/admin/usuarios`, encargados por clave en `caja-actions.ts:183-231` | El ERP ya tiene "autoriza con mail + clave" para anular; el PIN de 2 dígitos **no** encaja con la seguridad del ERP (SEC-3) | **Adaptar**: login normal del ERP por equipo + **PIN de 4+ dígitos por usuario para acciones sensibles** (nuevo campo = migración, o PIN guardado como hash en `AuditLog` `entity: "PinUsuario"` sin migración). Lo de 2 dígitos del piloto **no se porta** |
| **Tienda / encargos** (`catalogoTienda`, `crearPedidoTienda`, `pedidoDesdeWhatsApp`, `entregarPedido`) | `/admin/pedidos` + tienda pública (`src/app/tienda`, `Order` con `idempotencyKey` de vidriera) | Calza casi 1:1 | **Existente** |
| **Proveedores y remitos** (`altaProveedor`, `registrarRemito`, `pagarProveedor`) | `Supplier`, `StockPurchase`, `/admin/proveedores`, `/admin/cuentas-a-pagar`, `recibir-mercaderia` | Calza 1:1 | **Existente** |
| **Stock / productos / platos** (`altaProducto`, `metricasPlatos`, `rentabilidad`) | `Product`, `/admin/inventario`, `/admin/catalogo`, `margen`, `resultado-del-mes` | Calza; "plato" = producto con receta (no existe `despiece` inverso para gastronomía) | **Existente** (platos como productos simples en v1) |
| **Difusión / contenido / Studio** (`crearDifusion`, `contenidoDelMes`, `studio.mjs`) | `/admin/campania`, `recordatorios`, `MessageTemplate` | Campañas existen; el Studio (canvas) es nuevo y **no es de terminal** | **Diferir** (P3); Studio queda en vanilla hasta que se venda |
| **Turnero público del jugador** (`turnero/dominio/{nucleo,conciliacion,identidad}.mjs`, señas por transferencia con conciliación de comprobante) | Reserva online de CH (`src/app/(site)/reserva/`), MP plugin, `ConversacionWhatsapp` | La conciliación de comprobantes por texto **no existe** en el ERP y es valiosa para todos los rubros | **Portar como core compartido** (`src/lib/conciliacion-comprobante-core.ts`) — fase BP-5, después |
| **Tablero del dueño con cámaras/luces simuladas** | `/admin/reportes` | Simulado y rotulado; no es producto | **No portar** (demo) |

### 4.3 Dominio: ¿se importa tal cual o se porta a `*-core.ts`?

**Decisión: copia controlada primero, tipado al borde, portación a TS por rebanadas después.**

- **BP-1 (después del piloto, [BP · acordar]):** mover el dominio a `src/lib/club/` **como `.mjs` sin cambios**:
  `src/lib/club/motor.mjs` (copia de `public/previews/breakpoint/club/motor.mjs`) y
  `src/lib/club/dominio/{nucleo,conciliacion,identidad}.mjs`. Un test de **equivalencia** (`src/lib/club/copia.test.ts`)
  compara byte a byte con la fuente del piloto mientras convivan (mismo patrón que `motor-club.test.ts:380`). Un
  `src/lib/club/motor.d.ts` **escrito a mano** tipa **sólo** las entradas que React consume (estado, `crearEstado`,
  `serializarEstado`, `hidratarEstado`, `crearReserva`, `cobrar*`, `cuentaDelTurno`, `abrirCuenta`,
  `cargarEnCuenta`, `cerrarCuenta`, `resumenCaja`, `cerrarCaja`, `codigoAprobacion`, `aprobarPorCodigo`). Los 180+
  tests se **mueven** a `src/lib/club/motor.test.ts` apuntando a la copia.
- **Por qué no reescribir a TS de entrada:** 2.600 líneas con propiedades de plata probadas; reescribir ahora es
  riesgo sin valor. **Por qué no importar desde `public/`:** `public/` no es código de app (no pasa por `tsc`, no se
  trata como módulo del bundle) y está congelado por el piloto.
- **BP-3+:** cada pantalla React que se porta lleva su rebanada del motor a `src/lib/club/<tema>-core.ts` (TS puro,
  mismos tests traducidos) y el `.mjs` va perdiendo exports hasta vaciarse. Cuando el piloto termina, `empaquetar.mjs`
  pasa a leer el motor desde `src/lib/club/` (un solo dominio, DX-3: no mantener dos).

### 4.4 Persistencia — sin migración vs Gate 2, respetando DEMO → VENTA → INVERSIÓN

| Capa | Sin migración (preventa, reversible) | Con schema nuevo (post-venta, **Gate 2**) |
|---|---|---|
| **Modo demo** en `/admin/club` | Estado en memoria (`generarDemo`) + `localStorage` namespaced (`gsg-club:<tenant>:<user>`) igual que hoy; nada va a Neon | — |
| **Modo real "foto"** (puente) | El estado del club es **un documento por tenant**: fila más nueva de `AuditLog` `entity: "ClubEstado"`, `entityId: <tenantId>`, `changes: {v:1, estado, secuencia}` con **versión optimista** (mismo patrón de `config-repo.ts:13-15`). Un solo escritor (la recepción); el celular del dueño sólo **lee** y aprueba por código (acción que escribe una novedad chica). Tamaño: una jornada de piloto pesa decenas de KB (`guardarJornada` recorta `log` a 60 cuando no entra en `localStorage`) → OK para `Json`. **Sólo se activa post-venta** (ADR-030): con el tenant real y su login, no en demo | — |
| **Modelo relacional** | — | Plugin `club` con migración **aditiva** (`prisma/migrations/<ts>_modulo_club`): `Cancha`, `TurnoCancha`, `TurnoFijo`, `BloqueoCancha`, `ParteTurno`, `CuentaBuffet` (o `Order` + campo `mesaDe`), `PinUsuario`; cobros por `Collection`, deuda por `AccountReceivable`, stock por `StockMovement`. Igual que `taller` (`src/modules/descriptors/taller.ts:34-36` declara su carpeta de migración). **Queda como carpeta SIN aplicar** hasta el OK del dueño |
| **Migración del respaldo del piloto** | `hidratarEstado(foto)` del motor ya valida el sobre v1 → "Restaurar respaldo" en `/admin/club/ajustes` carga el JSON en **modo foto** sin transformar nada | Un script versionado con **dry-run por defecto** y `--apply` (patrón DX-7, scope por `tenantId`) traduce `estado` → filas relacionales. Se escribe cuando exista el schema |

### 4.5 Transición y convivencia con el piloto

1. **Hoy → fin del piloto:** vanilla manda. `/club?modo=real` guarda en `localStorage` del equipo del club y el
   dueño descarga el respaldo al cerrar la caja. El ERP React **no** aparece para Break Point (módulo `club` no
   asignado al tenant; `requireApp("club")` falla cerrado como cualquier app no disponible,
   `src/lib/require-app.ts:48`).
2. **En paralelo, en rama:** BP-1..BP-3 se construyen y prueban con `generarDemo` y con **respaldos reales del
   piloto** (anonimizados) como fixtures de `hidratarEstado`.
3. **Día de corte (lo fija la sesión del club con el dueño):** se cierra la caja en vanilla → se descarga el
   respaldo → se asigna `club` al tenant `breakpoint` (**OK del dueño**, es exposición al cliente) → se restaura el
   respaldo en `/admin/club` (modo foto) → vanilla queda **sólo lectura** (`?modo=real` muestra "la gestión pasó a
   `/admin/club`" — cambio en `app.mjs`, **[BP · acordar]**, después del piloto).
4. **Post-venta:** Gate 2 (schema), script de migración foto → relacional, dominio propio, PWA/ticket/lector por
   los módulos de terminal.

---

## 5. Guía de hardware (resumen; el doc vendible completo es la fase T-7)

Precios y modelos **provisionales a confirmar** con proveedor local (no se compra nada antes de la venta, ADR-030).

| Perfil | Equipos | Por qué |
|---|---|---|
| **PC kiosco (alto volumen: súper, buffet, retail con EAN)** | Mini PC (Intel N100 / 8 GB / SSD) + monitor 15–22" (táctil opcional) · **impresora térmica 80 mm USB con corte** · lector 1D/2D USB (modo teclado, sufijo Enter) · cajón de dinero conectado a la impresora (RJ11) · **UPS 650 VA** · **router 4G con SIM** o hotspot como respaldo · Chrome con acceso directo `--kiosk-printing --app=<url>` | Chrome en PC imprime directo sin diálogo; el UPS cubre el corte de luz hasta cerrar el ticket; el 4G resuelve el wifi que se corta sin cola offline |
| **Tablet de recepción (turnos: CH, Break Point recepción)** | Tablet Android 10–11" o iPad + soporte · app instalada (PWA) · ticket por WhatsApp o PDF; térmica **sólo** si hay PC al lado | En tablet no hay impresión directa fiable desde el navegador; se promete WhatsApp/PDF, no térmica |
| **Celular de mostrador (Magra hoy, Shine)** | Celular Android con vibración + funda · plan de datos (no depender del wifi) · lector Bluetooth HID opcional | Ya es como trabaja Magra; vibración de OK/error (T-2) y ticket por WhatsApp (ya existe) |
| **Balanza etiquetadora (carnicería/súper)** | Systel/Kretz/Moretti con etiqueta EAN-13 prefijo 20–29 configurable; se configura en `/admin/caja-rapida/configuracion` con el preset (T-3) | El sistema no se conecta a la balanza: lee la etiqueta. Cualquier marca sirve |

---

## 6. Plan de ejecución en fases chicas (cada una ejecutable por un agente Opus sin contexto extra)

**Restricciones comunes a TODAS las fases:** sin dependencias nuevas · sin migraciones · sin tocar prod ni Neon ·
sin romper aislamiento por tenant (todo `localStorage` con prefijo `gsg-<area>:<tenantSlug>:<userId>`) · sello GSG
(`metadata.generator` ya está; docs con "— Elaborado por GSG"; commits con trailer GSG) · Gate de Excelencia
completo antes de integrar a la rama · **no tocar** `public/previews/breakpoint/**`, `src/tenants/breakpoint/**`,
`src/lib/sitio-estatico.ts` · **sin push a `main`** (merge a `main` = §7).
**Rama de trabajo:** `ccr-f8859297-5ru6oe` (todas las T-*, rama designada de la sesión); `ccr-club-react` (BP-*).
**Verificación base de toda fase:** `npx tsc --noEmit` · `npm test` · `npm run build` · `npm run gates`
(`scripts/verify-gates.mjs`: tsc + tests + rls-coverage + build).

### T-1 · Perfil de terminal (objeto maestro + asignación por equipo) — P1, reversible, base de T-2/T-4/T-5

- **Crear** `src/lib/terminal/perfil-core.ts` (puro): `type TipoDeTerminal = "kiosco-pc" | "tablet-recepcion" |
  "celular-mostrador"`; `type PerfilDeTerminal = { tipo; anchoTicket: 58 | 80; impresionDirecta: boolean; sonido:
  boolean; vibracion: boolean; lector: { prefijo: string; sufijo: "enter" | "tab" | "ninguno" }; pantallaInicio:
  "/admin" | "/admin/vender" | "/admin/caja-rapida" | "/admin/turnos" }`; `PERFILES_BASE: Record<TipoDeTerminal,
  PerfilDeTerminal>` (los tres objetos maestros); `perfilDesdeAfuera(unknown): PerfilDeTerminal | null`
  (validación como `formatoDesdeAfuera`, `balanza.ts:94`); `claveDelPerfil(tenantSlug, userId): string` →
  `gsg-terminal:<slug>:<userId>:v1`; `leerPerfil(almacen, clave): PerfilDeTerminal` (default `celular-mostrador` si
  no hay nada o es ilegible); `guardarPerfil(almacen, clave, perfil): boolean`.
- **Crear** `src/lib/terminal/perfil-core.test.ts`: defaults; `perfilDesdeAfuera` rechaza basura y versiones
  viejas; la clave lleva slug y usuario (dos usuarios en el mismo equipo no comparten perfil); round-trip con un
  almacén en memoria.
- **Crear** `src/lib/terminal/usar-perfil.ts` (`"use client"`, hook `usePerfilDeTerminal()` que lee/escribe
  `localStorage` con la clave; recibe slug y userId por props del server component).
- **Crear** `src/app/admin/(dashboard)/ajustes/terminal/page.tsx` + `PerfilTerminal.tsx` (elegir uno de los 3
  perfiles base y ajustar sus campos; texto criollo: "Este equipo es…"). Entrada en el menú de Ajustes.
- **Hallazgo menor a corregir acá:** `claveDelAlmacen(negocio)` de `cobro-sin-conexion.ts:503` pasa a incluir el
  `userId` (la duda del cobro en equipo compartido no debe aparecerle a otro cajero). Ajustar su test
  (`cobro-sin-conexion.test.ts`).
- **Aceptación:** con dos usuarios en el mismo navegador cada uno ve su perfil; CH no ve nada nuevo salvo el ítem
  de Ajustes; `npm test` verde; sin cambios en `prisma/`.

### T-2 · Lector: prefijo/sufijo, sonido/vibración y ráfaga en `/vender` — P1, reversible

- **Crear** `src/lib/terminal/lector-core.ts` (puro): `quitarPrefijoSufijo(raw, lector)`;
  `detectorDeRafaga({ umbralMs: 35, minLargo: 6 })` → máquina de estados que recibe `(tecla, timestamp)` y
  devuelve `{ tipo: "codigo", valor }` cuando una ráfaga rápida termina en Enter/Tab (lo que un lector hace y una
  persona no); `enCampoEditable(target)` (extraído de `CajaRapida.tsx:83-85` y `VenderForm.tsx:1416`, hoy
  duplicado).
- **Crear** `src/lib/terminal/lector-core.test.ts`: prefijo `*`/STX y sufijo Tab; ráfaga de 13 dígitos a 10 ms →
  código; tipeo humano a 150 ms → nada; ráfaga sin Enter con sufijo "ninguno" cierra por timeout.
- **Crear** `src/lib/terminal/senal.ts` (`"use client"`): `sonar("ok" | "error")` con `AudioContext` (oscilador
  corto, 2 tonos; sin archivos de audio, sin dependencias) y `vibrar` existente (`src/components/ui/tactil.ts:4`);
  respeta `perfil.sonido`/`perfil.vibracion` y `prefers-reduced-motion` para la vibración.
- **Modificar** `CajaRapida.tsx:80-92`: el guardarraíl "dígito fuera de campo" pasa a usar
  `quitarPrefijoSufijo` + el detector (un prefijo no numérico ya no trunca); `leer()` llama `sonar("ok")` al
  agregar y `sonar("error")` en cada `setMensaje({ tono: "error" })`.
- **Modificar** `VenderForm.tsx:1413-1441` (listener global): si el detector devuelve un código, resolverlo contra
  el catálogo que ya viaja a la pantalla (`Product.codigo`, mismo `indexarPorCodigo` de `lectura.ts:66`) y agregar
  la línea; si no está, aviso criollo ("No encontramos ese código. Buscalo por nombre") + `sonar("error")`. Sin
  cambiar el flujo de cobro.
- **Modificar** `ConfigCaja.tsx`: campos "Prefijo del lector" / "Sufijo" **por equipo** (viven en el perfil T-1,
  no en `ConfigBalanza`: el lector es del equipo, la balanza del negocio — ADR-055).
- **Aceptación:** ráfaga con prefijo `*` en `caja-rapida` agrega el producto; en `/vender` un EAN escaneado fuera
  de campo agrega la línea; sonido OK/error audible en Chrome; vibración en Android; sin regresión en
  `vender.test.ts`, `vender-pantalla.test.ts`, `lectura.test.ts`.

### T-3 · Balanza: presets de fabricante + probador de etiqueta — P1, reversible

- **Crear** `src/lib/supermercado/balanza-presets.ts` (puro): `PRESETS_BALANZA: { id, marca, descripcion,
  formato: FormatoBalanza }[]` (Systel: prefijo 20, PLU 5, peso 3 dec; Kretz: prefijo 20/21, PLU 5, importe 0 dec;
  Moretti: prefijo 2x, PLU 4; "Genérica GS1 peso"; "Genérica GS1 importe") — **valores provisionales a
  confirmar** con una etiqueta real de cada marca; `presetQueCalza(codigoEjemplo): id[]` (prueba cada preset con
  `leerEtiquetaDeBalanza`).
- **Crear** `src/lib/supermercado/balanza-presets.test.ts`: cada preset pasa `problemaDelFormato`; un código de
  ejemplo por preset se lee bien; `presetQueCalza` devuelve el correcto.
- **Modificar** `ConfigCaja.tsx`: selector "Mi balanza es…" que rellena el formulario; bloque "Probá una etiqueta":
  input donde se escanea/pega un código y muestra en vivo PLU, peso o importe y si el verificador cierra (usa
  `leerEtiquetaDeBalanza` en el cliente, es puro). Guardado: el mismo `guardarConfigCajaEnTx` (sin cambios en
  `config-repo.ts`).
- **Aceptación:** elegir preset + pegar etiqueta → lectura correcta antes de guardar; guardado sigue siendo una fila
  de `AuditLog` con versión; `balanza.test.ts` y `etiquetas-super.test.ts` verdes.

### T-4 · Impresión sin fricción: ticket 58/80, CSS compartido, kiosco, Android — P1, reversible

- **Crear** `src/lib/impresion/ticket-css-core.ts` (puro): `cssDeTicket(ancho: 58 | 80): string` (el `@page` y
  el `body` hoy fijos en `reglas-venta.ts:377-381`, parametrizados: 80 mm → fuente 12px, padding 3mm 4mm);
  `documentoImprimible({ titulo, ancho, cuerpoHtml })`.
- **Modificar** `reglas-venta.ts:366` `htmlDelTicket(renglones, { ancho = 58 })` para usar el core (misma
  salida con 58 → test de regresión exacto).
- **Modificar** `TicketVenta.tsx`: recibe `ancho` del perfil (T-1); botones: "Imprimir" (iframe, como hoy) ·
  "Compartir por WhatsApp" (ya está) · "Guardar PDF" (mismo `print()`; en Android/iOS el diálogo ofrece PDF — el
  texto del botón lo dice, no promete térmica). Si `perfil.impresionDirecta` está activo, imprimir automáticamente
  al cobrar (la receta de Chrome kiosco hace que salga sin diálogo).
- **Crear** `src/lib/impresion/ticket-css-core.test.ts`: 58 y 80 generan `@page{size:58mm auto}` / `80mm`; el
  HTML escapa texto (reutiliza el caso de `reglas-venta`); snapshot del documento 58 idéntico al actual.
- **Crear** `docs/producto/impresion-en-el-mostrador.md` (receta): acceso directo de Chrome
  `--kiosk-printing --app=https://<tenant>/admin/vender`, impresora térmica como predeterminada, tamaño de papel
  58/80 en el driver, prueba de corte; Android/iPad: "Compartir por WhatsApp" o "Guardar PDF"; qué **no** se
  promete (impresión térmica directa desde navegador móvil, Bluetooth). Firmado "— Elaborado por GSG".
- **Aceptación:** `caja-rapida` con perfil kiosco 80 mm imprime 80 mm; Vender con celular ofrece WhatsApp/PDF;
  tests de `reglas-venta` verdes y snapshot 58 sin cambios; remito/taller/etiquetas intactos (fuera de alcance).

### T-5 · PWA mínima segura: manifest por tenant, sin service worker — P1, reversible

- **Crear** `src/app/admin/app.webmanifest/route.ts` (`force-dynamic`): resuelve el tenant por host
  (`getCurrentTenantId`) y la marca (`getTenantBrand`, `branding.ts:255`): `name`, `short_name` (12 chars),
  `start_url: "/admin"`, `scope: "/admin"`, `display: "standalone"`, `lang: "es-AR"`, `theme_color`/
  `background_color` desde el acento (`resolveAccent`, `branding.ts:234`), `icons`: `/tenants/<slug>/icon-512.png`
  y `-192.png` si existen en `public/tenants/<slug>/` (PNG estáticos que agrega el preset de cada tenant;
  **provisional**: hasta tenerlos, un ícono genérico `public/gsg/icon-512.png` con monograma neutro — PNG
  estático, sin generar en runtime). Cabeceras: `Content-Type: application/manifest+json`, `Cache-Control:
  private, max-age=300` (no `public`: el contenido depende del host y el CDN no debe compartirlo).
- **Crear** `src/lib/terminal/manifest-core.ts` (puro): `manifestDe(brand, slug, iconos): Manifest` para testear
  sin request; `src/lib/terminal/manifest-core.test.ts` (CH → "CH Estética"; slug sin ficha → "Mi negocio" neutro,
  nunca la marca de CH — regresión MT-1; `scope` siempre `/admin`).
- **Modificar** `src/app/admin/(dashboard)/layout.tsx`: `metadata.manifest = "/admin/app.webmanifest"` (el
  taller conserva el suyo en su página: Next toma el más específico).
- **Explícitamente NO:** `serviceWorker`, `workbox`, `next-pwa`, `beforeinstallprompt` custom. Documentar el
  porqué en el header del route (riesgo cross-usuario/cross-tenant de §1.4).
- **Aceptación:** Chrome Android/escritorio ofrece "Instalar" en `/admin` de un tenant demo con su nombre y color;
  `curl -H "Host: <otro>"` devuelve otra marca; ningún archivo `sw.js` en el build; CH sin cambios visibles.

### T-6 · Módulo `terminal` en el catálogo (asignación por tenant, ADR-054/055) — P2, reversible

- **Crear** `src/modules/descriptors/terminal.ts` (`id: "terminal"`, `kind: "capability"`, `capability:
  "orders:manage"`, `rubros: "todos"`, `dependencias: [{ id: "pos", rango: "^1.0" }]`, `scopeItems`: lector,
  ticket térmico, app instalable, perfil del equipo); registrarlo en `src/modules/catalog.ts`; tests existentes del
  registro (`registry.test.ts`, `catalog.test.ts`, `nav-groups.test.ts`) + caso nuevo "terminal depende de pos".
- **Modificar** `ajustes/terminal/page.tsx` → `requireApp("terminal")`; CH (sin `pos`) no lo ve: coherente con la
  matriz §3.
- **Aceptación:** `MODULE_REGISTRY_ENABLED` ON/OFF no rompe nada; `gating.test.ts` verde; nunca "a todos con todo"
  (ningún tenant lo recibe por default; se asigna por `Tenant.modules[]` = dato, lo hace el dueño/operador).

### T-7 · Guía de hardware vendible — P1, reversible (doc)

- **Crear** `docs/producto/guia-hardware-mostrador.md`: los 4 perfiles de §5 con checklist de compra, qué
  conectar a qué, cómo probar en 10 minutos, qué **no** prometemos, y un cuadro "si se corta el wifi / la luz".
  Precios **provisionales a confirmar**, sin marcas obligatorias. Lenguaje criollo para el comercial y el cliente.
  Firmado "— Elaborado por GSG". Enlazarla desde `docs/METODOLOGIA-SPRINT.md → Playbooks` y desde el preset
  (`docs/metodologia/generador-preset-ia.md`, una línea).
- **Aceptación:** una persona no técnica puede armar la lista de compras de su perfil leyéndola.

### T-8 · QR de CAE en el ticket térmico — DIFERIDA (se ejecuta cuando I3/ARCA real esté encendido)

- `reglas-venta.ts`: si la venta tiene `Invoice` con CAE, reemplazar `LEYENDA_NO_FACTURA` por tipo/nº/CAE/vto y
  un `<img>` con `qrcode.toDataURL(urlQrAfip(...))` generado en el servidor (ya es dependencia;
  `comprobante-pdf.ts:26-27`). Test puro sobre los renglones. Sin dependencias nuevas, sin migración.

### BP-0 · Doc de portación (este §4) y acuerdo con la sesión del club — ahora, doc-only

- Este documento es el entregable. Acción: la sesión del club lee §4 y responde (a) fecha de fin del piloto, (b)
  si `FORMATO-RESPALDO.md` cambia algo del sobre v1, (c) OK al mapeo de §4.2. **[BP · acordar]**

### BP-1 · Copia controlada del dominio a `src/lib/club/` — después del piloto, [BP · acordar]

- Copiar `motor.mjs` y `turnero/dominio/*.mjs` a `src/lib/club/`; `copia.test.ts` de equivalencia con la fuente;
  `motor.d.ts` a mano para las entradas de §4.3; mover los tests a `src/lib/club/motor.test.ts`. Sin tocar la
  fuente del piloto. **Aceptación:** `npm test` corre los 180+ tests desde el nuevo lugar; `tsc` acepta los
  imports tipados; `node src/tenants/breakpoint/empaquetar.mjs` y `motor-club.test.ts` siguen verdes (no se
  tocaron).

### BP-2 · Módulo `club` en el catálogo + pantalla `/admin/club` en modo demo — después del piloto, reversible

- `src/modules/descriptors/club.ts` (`kind: "capability"`, `capability: "agenda:read"`, rubros `padel`/`club`,
  dependencias `clients`, `pos`; `migraciones: []` por ahora); `src/app/admin/(dashboard)/club/page.tsx` con
  `requireApp("club")`; componentes React de **Agenda de canchas** y **Cuenta del turno** (misma UX validada: un
  solo lugar, "cobrar la cancha y cerrarla · la mesa sigue", "a cargo de"), estado en memoria vía el motor copiado
  (`crearEstado`/`generarDemo`) + `localStorage` namespaced. Sin Neon. **Aceptación:** el demo del ERP muestra
  `/admin/club` en un tenant de prueba; Break Point real **no** lo tiene asignado.

### BP-3 · Modo foto (persistencia sin migración) + restaurar respaldo v1 — post-venta, reversible

- `src/lib/club/estado-repo.ts` sobre `AuditLog` (`entity: "ClubEstado"`, versión optimista, patrón
  `config-repo.ts`); `purgeAuditLogs` exenta (`audit-retention.ts`, `PURGE_EXEMPT_ENTITIES`); pantalla Ajustes →
  "Restaurar respaldo" (lee el sobre v1 con `hidratarEstado`); test de integración con la base efímera como
  `supermercado-postgres.test.ts`. **Aceptación:** restaurar un respaldo real del piloto reproduce la caja del día
  al centavo (propiedad "caja = cobrado" del motor).

### BP-4 · Schema del plugin `club` (carpeta de migración SIN aplicar) + script foto → relacional — post-venta, **Gate 2**

- `prisma/migrations/<ts>_modulo_club/` aditiva (tablas de §4.4) + descriptor con `migraciones`; script
  `scripts/club/migrar-foto.ts` con dry-run y `--apply` (DX-7). **No se aplica**: va a §7.

### BP-5 · Conciliación de comprobantes como core compartido + buffet sobre `Order` — post-venta, reversible

- `src/lib/conciliacion-comprobante-core.ts` portado desde `turnero/dominio/conciliacion.mjs` con sus tests; el
  buffet como `Order` abierto que crece (`/admin/pedidos`) con transferencia de cargos. Reusable por todos los
  rubros (seña por transferencia de CH, Magra).

---

## 7. Para el OK del dueño (irreversibles, ADR-048)

| # | Acción | Gate | Qué desbloquea |
|---|---|---|---|
| **O1** | **Merge de `ccr-terminales-mostrador` a `main`** (= deploy de `erp-ch` en Vercel, que sirve también Break Point y `circuito-wpe`) | Gate 1 | Perfil de terminal, lector, balanza con presets, ticket 58/80, PWA, guía — visibles en prod. Se pide **después** de que la sesión del club confirme que el piloto no se ve afectado (el merge no toca sus archivos, pero redeploya el host) |
| **O2** | **Asignar `terminal` (T-6) a tenants concretos** (`Tenant.modules[]` en Neon: Magra, ADM, Qué Bien Olés, súper) | dato en prod (DX-7: script con dry-run) | Que esos tenants vean Ajustes → Terminal |
| **O3** | **Íconos PNG por tenant** en `public/tenants/<slug>/icon-{192,512}.png` (marca del cliente, ADR-042: autorización registrada) | marca de cliente | PWA con el logo real en vez del genérico |
| **O4** | **Asignar `club` al tenant `breakpoint`** y fijar el día de corte vanilla → React (BP-2/BP-3) | exposición al cliente + Gate 1 | Break Point en el ERP React con el respaldo del piloto |
| **O5** | **Aplicar `modulo_club`** (BP-4) y correr `migrar-foto --apply` | Gate 2 | Modelo relacional del club (post-venta) |
| **O6** | ARCA real para un tenant (I3 existente) → habilita T-8 (QR en ticket) | Gate 4 | Ticket térmico con CAE |
| **O7** | **Cola de venta sin conexión**: decisión de **no** construirla en este ciclo (§2.5). Si el dueño quiere igual: ADR + Advisory/Challenger + migración `vendidoEl`/`origen` | decisión + Gate 2 | — |

Nada de esta tabla se corre solo. Los secretos los pega siempre el dueño (ADR-041).

---

## 8. Orden sugerido (valor/riesgo) y estimación de olas

1. **Ola 1 (P1, 1 célula):** T-1 → T-2 → T-4 → T-5 (en ese orden; T-2/T-4/T-5 consumen el perfil de T-1).
2. **Ola 2 (P1/P2):** T-3 · T-7 · T-6.
3. **BP-0** ahora (sólo acuerdo); **BP-1..BP-3** cuando la sesión del club cierre el piloto; **BP-4/BP-5** post-venta.
4. **T-8** cuando haya ARCA real.

Cada fase cierra con su retro (ADR-047): memoria al día + 1 caso + 1 mejora de brief. Lección candidata para el
registro cuando cierre la ola 1: *"el lector es del equipo y la balanza del negocio: dos objetos, dos
asignaciones"* (ADR-055 aplicado al mostrador).

— Elaborado por GSG
