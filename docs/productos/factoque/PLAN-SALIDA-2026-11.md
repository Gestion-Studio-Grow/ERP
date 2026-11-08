# Factoque · Plan de salida — noviembre 2026

**Fecha:** 08/11/2026 · **Autora:** planificadora GSG (juicio corto) · **Para:** el dueño y la orquestadora.
**Pedido del dueño:** «revisá de punta a punta que esté el producto ok para ya hacerlo funcionar y venderlo;
el plan Comerciante (el upgrade) ok, o planes de Factoque; paso a paso para la prueba real con un CUIT».
**Regla:** este documento NO modifica código. Todo lo marcado 🔒 lo hace el dueño; 🖥 lo hace una sesión/constructora
Opus; 👤 lo hace el cliente (o el dueño actuando como cliente). Precios: **provisionales a confirmar**.
Lo que no pude verificar en vivo (Vercel sólo por nombres de variables, Neon sin tocar) está marcado «a confirmar».

---

## 0. Veredicto en tres líneas

1. **Emitir, ver, descargar PDF y anular con nota de crédito funciona** y está bien cuidado (idempotencia, tope en
   transacción con lock, estado real tras ARCA). El camino técnico a la **primera factura real** existe entero en
   `main` (asistente «Conectar con ARCA», pase a real por negocio, segunda llave `ARCA_REAL_TENANTS`).
2. **No es vendible hoy como SaaS self-serve:** el alta termina en un WhatsApp (no crea negocio), el upgrade es un
   **texto sin botón**, **no existe cobro del plan** (ni MP ni nada), y el tope «159» del plan pago no está implementado.
3. **Recomendación:** vender **planes Factoque** (Gratis / Plus / Pro) dentro de la misma app, cobrados con Checkout de
   Mercado Pago a la cuenta de GSG; «Comerciante» queda como producto A, más adelante. Son 3 tandas Opus (≈ 1 día) +
   la prueba real del dueño (§4), que puede empezar **hoy** porque no depende de las tandas.

---

## 1. Recorrido punta a punta (qué está OK, qué falta, dónde)

Convención: ✅ OK · 🟡 funciona con rodeo · ❌ falta.

| # | Paso | Estado | Qué hay / qué falta | Dónde |
|---|---|---|---|---|
| 1 | **Link de venta** `factoque.gsgapp.com.ar` → vidriera | ✅ | Rewrite de la raíz a `/facturita`; host → negocio `facturita` en código; comodín `*.gsgapp.com.ar` verificado el 05/11. `facturita-gsg.vercel.app` sigue (link viejo). | `src/lib/producto-host.ts:17-22`, `src/lib/tenant.ts:100-105` |
| 2 | **Alta** `/facturita/alta` | 🟡 | El asistente valida CUIT (dígito verificador), condición IVA y punto de venta, explica la delegación en ARCA y **arma un WhatsApp a GSG**. No crea negocio ni guarda nada (decisión ADR-074/ADR-030). Sin `WHATSAPP_GSG` en Vercel el alta termina en «Copiar el resumen» sin destino: **la variable NO está cargada** (verificado por nombre, 08/11). | `src/lib/facturita-onboarding.ts:1-14`, `src/app/facturita/contacto.ts:10-21` |
| 3 | **Creación del negocio** | 🟡 manual | La hace un operador en `/operador` (fábrica de tenants): blueprint `facturita`, módulo ARCA, CUIT, punto de venta, condición IVA, usuario con `billing:manage`. Cada cliente = un negocio con su subdominio `<slug>.gsgapp.com.ar` (`APP_BASE_DOMAIN`, cargada en Production; valor a confirmar = `gsgapp.com.ar`). Alta asistida «en el día» es vendible; self-serve es Tanda 4. | `src/lib/operator-actions.ts:197` (CUIT), `setTenantArcaPuntoVenta`, `docs/runbooks/arca/PRUEBA-CLIENTE-NUEVO.md §0` |
| 4 | **Login y app instalable** `/facturita/app` | ✅ | Portón de sesión en el proxy; barrera de producto (capability + blueprint); PWA con manifest, SW y página sin conexión. Tests puros 66/66 (08/11). | `src/lib/facturita-actions.ts:57-70`, `src/lib/facturita-pwa.ts`, `public/facturita/sw.js` |
| 5 | **Datos del emisor para el PDF** | ✅ | «Datos para tus facturas» en Mi cuenta graba razón social, domicilio, inicio de actividades, IIBB en los mismos campos que lee el PDF. Si faltan, la emisión avisa sin bloquear. | `src/lib/facturita-actions.ts:146`, `src/app/facturita/app/cuenta/DatosParaFacturas.tsx` |
| 6 | **Conectar con ARCA** (certificado propio del cliente) | 🟡 | El asistente de 4 pasos (CSR en servidor, clave cifrada con `FISCAL_MASTER_KEY`, subir `.crt`, «Probar con ARCA», pedido de pase a real) **existe y está en `main`**, pero vive en `/admin/facturacion?vista=arca`. **La app Factoque no lo enlaza** (0 referencias en `src/app/facturita/**`): el cliente no tiene cómo llegar. | `src/lib/fiscal/asistente-arca.server.ts`, `src/components/fiscal/AsistenteArca.tsx`, `src/lib/fiscal/verificar-con-arca.ts` |
| 7 | **Primera factura** (Emitir) | ✅ | Validación en criollo (RG 5616 condición del receptor, RG 5700 umbral consumidor final, fechas de servicio), clave de emisión idempotente (doble toque = misma factura), tope contado **dentro** de la transacción con `pg_advisory_xact_lock`, despacho a ARCA en el mismo pedido y respuesta con el estado real (autorizada / pendiente con ventana 5-10 días / rechazada con origen). | `src/lib/facturita-core.ts:178-290`, `src/lib/facturacion/emision-manual.server.ts:136-170`, `src/lib/facturita-actions.ts:181` |
| 7b | …en producción **sin certificado** | 🟡 | Guarda ENG-123: en producción con facturación encendida el despacho **no arma el cliente simulado**: la factura queda «pendiente» para siempre. Correcto fiscalmente, pero el mensaje de hoy dice «la conexión con ARCA todavía no está activa en tu cuenta» sin link para activarla (ver #6). | `src/lib/fiscal/guarda-simulado.ts`, `src/lib/facturita-core.ts:335-350` |
| 8 | **PDF con QR** | ✅ | Ruta por factura; 409 con página amable si faltan datos del emisor. | `src/app/facturita/app/facturas/[id]/pdf/route.ts` |
| 9 | **Tope** 5/mes y aviso desde la 4.ª | ✅ | Regla pura testeada; el tope es del **blueprint** `facturita`, no de la persona. | `src/lib/facturita-core.ts:13-37`, `emision-manual.server.ts:16-17,48-60` |
| 9b | La **nota de crédito consume cupo** | 🟡 decisión | Hoy una anulación ocupa 1 de los 5. Con 5 facturas y una equivocada, el cliente no puede corregirla en la app (lo manda a ARCA o al upgrade). Recomiendo **no contar las NC** en el cupo: es un gancho que irrita, no que convierte. | `src/lib/facturita-core.ts:385-394`, `src/lib/facturita-actions.ts:306` |
| 10 | **Upgrade** | ❌ | Sólo texto: «pasás a Comerciante en el mismo lugar». No hay botón, ni pantalla, ni cambio de plan en el negocio. `Tenant.plan` (String?, ya en Neon) está libre para usarlo **sin migración**. | `src/app/facturita/app/cuenta/page.tsx:74`, `src/app/facturita/page.tsx:179`, `prisma/schema.prisma` (Tenant.plan) |
| 11 | **Pago con Mercado Pago** del plan | ❌ | No existe. Lo que hay en Factoque es «Conectá tu Mercado Pago» (OAuth del **cliente**, para facturar sus cobros: producto A), no el cobro de GSG. GSG ya tiene `MP_ACCES_TOKEN` y `MP_WEBHOOK_SECRET` en Vercel (los usa CH). | `src/lib/facturita-mp.server.ts:1-16`, `src/app/facturita/app/cuenta/mercadopago/**` |
| 12 | **Factura siguiente** con plan pago (tope 159) | ❌ | `facturasPorMes` de los planes es sólo texto de la vidriera; el motor sólo conoce «con tope de 5» o «sin tope». | `src/lib/facturita-planes.ts`, `emision-manual.server.ts:48-60` |
| 13 | **Anular** con nota de crédito | ✅ | NC creada en transacción, copia de la ficha del receptor para el PDF, despacho sincrónico y mensaje según ARCA (autorizada / pendiente / rechazada → «la factura sigue vigente»). | `src/lib/facturita-actions.ts:299-385`, `src/lib/facturita-core.ts:370-400` |
| 14 | **Legales** términos y privacidad | 🟡 | Publicados como BORRADOR `noindex`; el responsable y los pendientes salen de `legales.ts`. Para vender hace falta el texto final aprobado por el dueño (y «Factoque» como marca). | `src/app/facturita/legales.ts`, `terminos/page.tsx`, `privacidad/page.tsx` |
| 15 | **Marca visible** | 🟡 | Mezcla: «Factoque» en planes, title de iOS y vidriera; «Facturita» en mensajes, legales, layout y 22 archivos de la app. Ver §3. | `src/app/facturita/**` |
| 16 | **Migraciones** 20261022* | 🟡 a confirmar | Están en el repo y **no** en `prisma/lote-deploy.txt`. El build de producción exige que lo pendiente coincida exactamente con el lote y los merges del 07/11 (#23, #36) construyeron bien → evidencia **indirecta** de que ya están aplicadas. 🔒 Confirmar con `prisma migrate status` (una sola consulta). | `scripts/vercel-build.mjs:215-225`, `prisma/lote-deploy.txt` |
| 17 | **Variables en Vercel** (sólo nombres, 08/11) | 🟡 | Están: `ARCA_MODO`, `ARCA_CERT_PEM`, `ARCA_KEY_PEM`, `ARCA_INVOICING_ENABLED`, `FISCAL_MASTER_KEY`, `CRON_SECRET`, `TENANT_HOST_MAP`, `APP_BASE_DOMAIN`, `MIGRATE_DATABASE_URL` (⚠ sigue en Production: **cada push a `main` migra**, Gate 2). **Faltan:** `ARCA_REAL_TENANTS`, `WHATSAPP_GSG` (Production y Preview), `FISCAL_MASTER_KEY_ID` (si el cifrado la exige: `src/lib/fiscal/cert-crypto.ts`). Valores no leídos. | Vercel → `erp-ch` → Environment Variables |

**Nota de norma:** `src/app/facturita/` tiene PNG (íconos PWA y OG). La norma dice «nada binario en Git»; para íconos de
manifest es la excepción práctica (los sirve el deploy). Anotado, no bloquea.

---

## 2. Planes: «Comerciante» como upgrade vs planes Factoque

**Hoy en código** (`src/lib/facturita-planes.ts`, ADR-078): Factoque gratis (5/mes) y la escalera **Comerciante**
Solo $14.900 (159/mes, «facturas que se arman solas desde el extracto y MP», contador que mira) · Comercio $39.900 ·
Pyme $89.900 · Multiprovincia $149.900. Todo con leyenda «provisional a confirmar».

**Problema:** Comerciante es **otro producto** (A: conciliación bancaria, consola del contador, multiusuario). Prometerlo
como «pasás en el mismo lugar» desde una app de una pantalla es vender algo que el cliente de Factoque no va a saber
usar y que hoy no está empaquetado para self-serve. Además $14.900 como primer escalón desde $0 es un salto de 100 %
de fricción para alguien que necesita la factura n.º 6.

**Recomendación: planes Factoque (misma app, misma pantalla, lo único que cambia es el tope).**

| Plan | Tope/mes | Precio ARS/mes (provisional a confirmar) | Para quién | Qué cambia en código |
|---|---|---|---|---|
| **Factoque Gratis** | 5 | $0, sin tarjeta | el que factura poco | nada (es el actual) |
| **Factoque Plus** | 40 | **$5.900** | monotributista con clientela fija | `Tenant.plan="factoque-plus"` → tope 40 |
| **Factoque Pro** | 159 | **$9.900** | comercio chico que factura todos los días | `Tenant.plan="factoque-pro"` → tope 159 |
| Comerciante Solo (producto A) | 159 + conciliación | $14.900 (ADR-078) | cuando pide banco/MP/contador | **no se vende desde Factoque hoy**; la vidriera lo menciona como «lo que sigue», sin botón |

Criterios: escalera por **cantidad de facturas**, nunca por usuario (ADR-078 principio 2); el 159 ya está prometido en
textos, se mantiene en Pro; Plus es el escalón que convierte (precio de «un café por semana», bajo el umbral de pensarlo);
las notas de crédito **no** consumen cupo en ningún plan; sin prueba gratis extra (el gratis ya es la prueba).
**Anclas a validar** antes de confirmar precio (brief para `gsg-investigador`, Opus, 20 min): «Comprobantes en línea» de
ARCA es gratis (el competidor es el esfuerzo, no la plata); Tusfacturas, Facturante, Alegra, Xubio, Contabilium en
noviembre 2026. Si el investigador trae un piso más bajo, Plus baja a $4.900 antes que subir.

**Cobro:** Checkout Pro de Mercado Pago **a la cuenta de GSG** (token ya en Vercel), un pago por 30 días, webhook →
`Tenant.plan` + fecha de vencimiento en `BusinessSettings`; aviso 5 días antes; sin cobro automático con tarjeta
guardada en la primera versión (preapproval se suma cuando haya 20 clientes pagos). Transferencia como alternativa
manual (operador marca el plan desde la ficha). **DEMO → VENTA → INVERSIÓN:** nada de esto gasta un peso.

---

## 3. Renombre visible Facturita → Factoque: alcance

**Decisión ya tomada (05/11):** Factoque es el nombre comercial; `facturita` sigue siendo el id técnico.

**Se renombra (visible):** textos de las 22 pantallas/archivos de `src/app/facturita/**` (vidriera, alta, planes,
Mi cuenta, Emitir, Mis facturas, términos, privacidad, BarraFija, InstalarApp), `layout.tsx` (metadata, title,
`appleWebApp` ya dice Factoque), manifest (`name`/`short_name` en `src/lib/facturita-pwa.ts`), `legales.ts`, los mensajes
de `facturita-core.ts` («pasate a Comerciante» → al plan Factoque que corresponda), OG image (`og.png/route.tsx`,
se genera), mensaje de WhatsApp del alta, y `docs/` donde el cliente lo lee (27 archivos: sólo los de cara al
cliente; los internos llevan una línea «Facturita = nombre técnico de Factoque»).

**NO se renombra:** blueprint `facturita`, subdominio `facturita`, rutas `/facturita/**` (scope del manifest, SW,
start_url: renombrarlas rompe la app instalada en los celulares y los links compartidos), nombres de archivos y
funciones `facturita-*`, tablas, tests. Una constante `MARCA = "Factoque"` en `src/app/facturita/piel.ts` y un test que
falle si aparece «Facturita» en un texto visible de la app (`grep` de los `.tsx` por string literal) cierran el tema.

Costo: 1 tanda liviana Opus, QA clic por clic, revisión de `sello-marca-gsg`.

---

## 4. Paso a paso: la prueba REAL con el CUIT del dueño

Base: `docs/runbooks/arca/PRUEBA-CLIENTE-NUEVO.md` (ya en `main`), ajustado a Factoque. Modelo del dueño (05/11):
**certificado propio del emisor, GSG no entra a ARCA de nadie, nunca se pide la clave fiscal.** Acá el emisor es el
propio dueño, así que hace las dos partes (👤 cliente y 🔒 dueño).

**Negocio de la prueba:** crear uno nuevo, slug `factoque-gsg` (no usar el negocio `facturita`, que es la vidriera/demo
detrás de `factoque.gsgapp.com.ar`). Así se prueba el camino real del cliente: `https://factoque-gsg.gsgapp.com.ar/facturita/app`.

### 4.0 Antes de empezar (10 min)
| # | Quién | Qué |
|---|---|---|
| 0.1 | 🔒 | Clave fiscal **nivel 3** del dueño; CUIT; condición frente al IVA; domicilio fiscal; inicio de actividades; IIBB. |
| 0.2 | 🔒 | Vercel `erp-ch` → Production: confirmar `FISCAL_MASTER_KEY` (está), `ARCA_INVOICING_ENABLED=true` (está, valor a confirmar), `CRON_SECRET` (está). Cargar `WHATSAPP_GSG` (Production **y** Preview). **Todavía NO** tocar `ARCA_MODO` ni `ARCA_REAL_TENANTS`. |
| 0.3 | 🔒 | Neon → Branches → crear branch `backup-pre-factoque-real` (red de rollback). Una consulta: `prisma migrate status` para confirmar que 20261022* están aplicadas (ver §1 #16). |
| 0.4 | 🔒 | Si `/operador` muestra algún negocio **ya marcado real** (`arcaHomologacion=false`), anotarlo: al poner `ARCA_MODO=real` deja de facturar hasta estar en `ARCA_REAL_TENANTS`. |

### 4.1 Crear el negocio (operador, 10 min) — 🔒 dueño desde `/operador` (una sesión no entra a prod)
1. `/operador` → nuevo negocio: nombre «Factoque GSG», slug `factoque-gsg`, blueprint **facturita**, módulos: **ARCA**.
2. Ficha → pestaña **fiscal**: Paso 1 CUIT → Guardar. Paso 2 punto de venta: elegir un número **nuevo** (p. ej. `3`),
   distinto del de «Comprobantes en línea»; **el mismo** que se va a crear en ARCA en 4.3. Condición frente al IVA → Guardar.
3. Usuario del negocio con `billing:manage` (rol OWNER). Guardar la contraseña en el gestor del dueño.
4. Entrar a `https://factoque-gsg.gsgapp.com.ar/facturita/app` → Mi cuenta → **Datos para tus facturas** → completar.

### 4.2 Homologación (recomendado, 20 min; se puede saltear si el dueño quiere ir directo a producción)
| # | Quién | Dónde | Qué |
|---|---|---|---|
| 1 | 👤 | ERP `/admin/facturacion?vista=arca` (en `factoque-gsg.gsgapp.com.ar`) | Paso 2 → **Generar pedido de certificado** → **Bajar el .csr** (o Copiar). |
| 2 | 👤 | arca.gob.ar | Administrador de Relaciones de Clave Fiscal → Adherir servicio → ARCA → Servicios interactivos → **WSASS – Autogestión Certificados Homologación**. |
| 3 | 👤 | WSASS | Nuevo certificado → nombre `gsg-erp` → pegar el .csr → Crear → copiar el certificado. **Crear autorización a servicio** → `gsg-erp` → **wsfe**. |
| 4 | 👤 | ERP paso 3 | Pegar/subir el certificado → **Guardar** → **Probar con ARCA**. Verde esperado: «ARCA (homologación) reconoce el certificado y el punto de venta 3; … Factura C de prueba n.º N con CAE… No quedó guardada». |

Nada de esto escribe facturas en el negocio (la prueba no toca el outbox) → **no bloquea el pase a real**.

### 4.3 Producción: certificado real y punto de venta (👤, 20 min, con clave fiscal nivel 3)
1. ERP paso 2 → **Generar otro pedido** (el de homologación ya se usó) → bajar el `.csr`.
2. arca.gob.ar → **Administración de Certificados Digitales** (adherir si no aparece) → **Agregar alias** `gsg-erp` →
   subir el `.csr` → Agregar → «Ver» → **Descargar** el `.crt`.
3. **Administrador de Relaciones de Clave Fiscal** → Nueva relación → Buscar → ARCA → **WebServices** →
   **Facturación Electrónica** → Representante: Buscar → computador fiscal `gsg-erp` → Confirmar.
4. **Administración de puntos de venta y domicilios** → Agregar → número **3** → sistema
   **«Factura Electrónica – Monotributo – Web Services»** (monotributo) o **«RECE para aplicativo y web services»**
   (inscripto) → domicilio → Aceptar. Un punto de «Factura en línea» **no sirve**.
5. ERP paso 3 → subir el `.crt` de producción → **Guardar** (reemplaza al de prueba, queda en AuditLog) → **Probar con
   ARCA**. Verde esperado: «ARCA (**producción**) reconoce el certificado y el punto de venta 3; último … autorizada: **0**»
   y aclara que **no emitió nada**. Si dice «No sabemos de qué ambiente»: copiar el emisor que muestra y **frenar**
   (regla provisional `entornoDelEmisor`, `src/lib/fiscal/modo-del-negocio.ts:30-37`; lo corrige una sesión).
6. ERP paso 4 → escribir `PRODUCCIÓN` (pedido de pase, queda en AuditLog).

### 4.4 Encender real sólo para este negocio (🔒, 10 min)
`ARCA_MODO` es el **techo de la plataforma**, pero **no le cambia el modo a nadie**: los negocios en pruebas siguen en
homologación (con certificado) o simulado (sin). Sólo pasa a real el que está **marcado real + listado + con certificado
de producción** (`modoDelNegocio`, `src/lib/fiscal/modo-del-negocio.ts:75-108`). Falla cerrada: si falta una llave,
ese negocio **no emite nada** y dice qué falta.

1. Vercel → `erp-ch` → Production: `ARCA_MODO=real` · `ARCA_REAL_TENANTS=factoque-gsg` · `ARCA_INVOICING_ENABLED=true`.
2. **Redeploy** del deployment vigente (Deployments → ⋯ → Redeploy). ⚠ `MIGRATE_DATABASE_URL` está en Production: el
   build corre el chequeo del lote; con nada pendiente no toca la base. Si frena por «no coincide», **no insistir**: avisar.
3. `/operador/tenants/<id>?pestana=fiscal` → tarjeta **«Facturación real»**: las 6 condiciones en verde → escribir el slug →
   confirmar. Exige **cero comprobantes de prueba**: si en 4.1–4.3 se emitió algo simulado, antes «Limpiar datos de prueba».
4. `/api/ready` → `arca.estado` ≠ `critico`; `/api/health` → `arca.facturacion: true`, `arca.cronProtegido: true`.

### 4.5 Emitir la Factura C mínima (👤, 5 min)
1. `https://factoque-gsg.gsgapp.com.ar/facturita/app` → **Emitir**: descripción «Prueba de sistema Factoque», total
   **$100**, concepto **Productos** (ventana ARCA 5 días, sin fechas de servicio), receptor vacío (**consumidor final**;
   $100 está bajo el umbral RG 5700).
2. Respuesta esperada: «Factura N.º 00003-00000001 autorizada por ARCA (CAE 7…)» (`mensajeDeEmision`). Si dice «de
   prueba», el negocio quedó en homologación: revisar 4.4.3. Si «pendiente»: `ARCA_INVOICING_ENABLED` o guarda; mirar
   `/api/health`.
3. Mis facturas → **PDF**: letra C, CAE, vencimiento del CAE, QR.

### 4.6 Verificar en ARCA (👤)
- Escanear el **QR del PDF** con el celular: abre la constatación de ARCA con el comprobante.
- arca.gob.ar → **Mis Comprobantes** → Emitidos → filtrar por fecha: aparece la C 00003-00000001 (puede tardar hasta
  un día en listarse). Alternativa inmediata: **Comprobantes en línea** → Consultas → punto de venta 3.
- Volver a **Probar con ARCA** en el ERP: «último Factura C autorizada: **1**».

### 4.7 Anular con nota de crédito (👤, 2 min)
Mis facturas → la factura → **Anular** → motivo «Prueba de sistema» → la NC C sale en el mismo pedido: «Listo: ARCA
autorizó la nota de crédito y la factura quedó anulada». En ARCA aparece la **Nota de Crédito C 00003-00000001**.
Ojo (§1 #9b): hoy la NC consume 1 de los 5 del mes del negocio de prueba. Es correcto fiscalmente: la factura y su
NC quedan ambas en los libros; **nada se borra**.

### 4.8 Cerrar la prueba
- 🔒 Decidir si `factoque-gsg` queda real (sirve como emisor de las facturas de GSG a sus clientes) o vuelve a pruebas
  desde la ficha. Sacar de `ARCA_REAL_TENANTS` si vuelve.
- 🖥 Una sesión anota en `docs/lecciones-aprendidas/registro.md` lo que no coincidió con el runbook (textos reales de
  ARCA, emisor del certificado productivo, tiempos). Esa lección calibra la venta.

**Certificación adversarial (plata/ARCA) obligatoria antes de vender:** `modoDelNegocio` + `elegirFirmante` +
`pase-a-real.ts` (que ningún camino caiga a simulado o a homologación en silencio, que el certificado de otro CUIT nunca
firme), guarda ENG-123 en producción, numeración tras limpiar datos de prueba (`crearClientePara`,
`src/lib/arca-dispatch.ts:340-410`), y el cupo bajo concurrencia (`emision-manual.server.ts:157-168`). Lo demás (UI,
textos) va con revisión liviana.

---

## 5. Tandas para dejarlo vendible (constructora Opus 5.5, esfuerzo alto, en este orden)

Cada tanda: 1 constructora + certificación sólo donde se marca; brief ≤ 2 KB con `archivo:línea` de este documento;
informe ≤ 300 palabras; tsc + tests verdes; push a su rama; **sin merge a `main` hasta el «deployá»** (Gate 1).

| Tanda | Qué entrega | Riesgo / certificación | Tamaño |
|---|---|---|---|
| **T1 · Marca y puerta a ARCA** | §3 renombre visible con constante `MARCA` y test anti-«Facturita»; tarjeta **«Conectar con ARCA»** en Mi cuenta de Factoque que lleva a `/admin/facturacion?vista=arca` y muestra el estado del modo del negocio (reusa `leerFichaDelPase`); el mensaje «pendiente/apagada» (`facturita-core.ts:347`) con el link; **NC no consume cupo** (quitar `anulacionSegunCupo` del camino, ajustar test y texto); legales con el texto final del dueño (placeholder «provisional a confirmar» si aún no está) y sin `noindex`. | Visual: revisión liviana + QA clic por clic + `sello-marca-gsg`. | ½ día |
| **T2 · Planes Factoque en el motor** | `facturita-planes.ts`: Gratis/Plus/Pro con topes 5/40/159 y precios provisionales; `Tenant.plan` como fuente del tope (`emision-manual.server.ts:48-60` deja de ser «5 o sin tope»); mensajes de aviso/tope por plan; vidriera y `/facturita/planes` desde la misma fuente; acción de operador «Cambiar plan» en la ficha (con AuditLog) para venta por transferencia. **Sin migración** (`Tenant.plan` existe). | **Certificación adversarial**: tope por plan bajo concurrencia, plan vencido vuelve a 5 sin perder facturas, downgrade con más de 5 emitidas en el mes. | ½ día |
| **T3 · Cobro del plan con Mercado Pago** | Botón «Pasar a Plus/Pro» en Mi cuenta y en el aviso del tope → preferencia de Checkout Pro (cuenta GSG, `MP_ACCES_TOKEN`), `external_reference = tenantId:plan:periodo`; webhook (reusa el verificador de `MP_WEBHOOK_SECRET`) idempotente → `Tenant.plan` + `vigenciaHasta` en `BusinessSettings`; página de vuelta; aviso 5 días antes del vencimiento; registro del pago para la factura **de GSG al cliente** (la emite `factoque-gsg`, §4.8). | **Certificación adversarial** (plata): monto manipulado, pago de otro tenant, doble webhook, pago aprobado tardío, reembolso. | 1 día |
| **T4 · Alta self-serve** (después de las primeras ventas) | Portón público de la fábrica de tenants para blueprint `facturita`: valida con `facturita-onboarding.ts`, crea negocio + usuario, manda el link del subdominio por WhatsApp/mail; anti-abuso (1 CUIT = 1 negocio, captcha/limite por IP). | **Certificación adversarial** (datos/seguridad): CUIT ajeno, enumeración, RLS del negocio nuevo. | 1 día |
| **T5 · Publicación** | Sumar al lote lo que falte (confirmado con `migrate status`), PR único con T1–T3, Auditoría GSG (Gate de Excelencia), checklist `docs/runbooks/facturacion/publicacion.md` §3–5, smoke sobre `factoque.gsgapp.com.ar`. | Lo corre la orquestadora con scripts; el «deployá» es del dueño. | ½ día |

**Secuencia mínima para vender HOY (sin esperar T3):** §4 (prueba real) + T1 + T2 + «Cambiar plan» por operador con cobro
por **transferencia** (alias de GSG en la pantalla de planes, «provisional a confirmar»). T3 automatiza el cobro; T4 el alta.

---

## 6. Decisiones que necesita el dueño (en orden)
1. Planes **Factoque Gratis/Plus/Pro** y precios ($0 / $5.900 / $9.900 provisionales) o mantener «Comerciante Solo» como único salto.
2. Las **notas de crédito no consumen cupo** (recomendado).
3. Texto final de **términos y privacidad** (hoy BORRADOR) y el número de **`WHATSAPP_GSG`**.
4. Cobro: **Checkout Pro a la cuenta de GSG** primero, suscripción automática después.
5. Fecha para la **prueba real** (§4): 1 hora del dueño con clave fiscal nivel 3; puede ser hoy.

— Elaborado por GSG · metadata.generator = "Gestión Studio Grow"
