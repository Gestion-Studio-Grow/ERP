# Prueba de facturación ARCA con un cliente nuevo: homologación y primera factura real

**Fecha:** 05/11/2026 · **Rama:** `claude/arca-prueba-cliente-nuevo` (sin mergear) · **Para:** el dueño de GSG.
Cada paso marcado **🔒 DUEÑO** lo hace sólo el dueño: secretos, variables de Vercel, deploy y facturas con validez fiscal.
El resto lo hace un operador desde la consola.

> **Lo primero:** este circuito usa dos botones nuevos de la ficha del operador («Condición frente al IVA» y
> «Verificar con ARCA»). Están en esta rama y **no en `main`**. Sin el merge, la prueba igual se puede hacer, pero
> con dos rodeos (ver §6). El merge **no lleva migraciones** (las columnas ya están en Neon).

---

## 0. Qué hay en `main` hoy (verificado contra el código)

| Pieza | Dónde | Estado |
|---|---|---|
| CUIT del negocio | ficha `/operador/tenants/<id>?pestana=fiscal` → «Paso 1» (`src/lib/operator-actions.ts:197`) | anda, queda auditado |
| Punto de venta | misma ficha → «Paso 2» (`setTenantArcaPuntoVenta`) | anda, con candado contra CUIT+PV repetido |
| Certificado + clave por negocio | misma ficha → «Paso 3», se pegan los PEM (`cargarCredencialFiscal`, `operator-actions.ts:342`) | anda: queda cifrado (`TenantFiscalCredential`, necesita `FISCAL_MASTER_KEY` en Vercel) y se rechaza si el CUIT del certificado no es el del negocio |
| Condición frente al IVA | **sólo** en el alta por el configurador (`solicitudes/configurador.server.ts:602`) | **faltaba** para un negocio ya creado → lo agrega esta rama |
| Probar el certificado **del cliente** sin ensuciar sus libros | — | **faltaba** → lo agrega esta rama («Verificar con ARCA») |
| Modo de la plataforma | variable `ARCA_MODO` de Vercel: `stub` (por defecto), `homologacion`, `real` (`src/plugins/arca/afip/factory.ts:61`) | lo cambia el dueño |
| Modo del negocio | `arcaHomologacion` (por defecto en pruebas); en `real`, cada negocio decide (`src/lib/arca-dispatch.ts:233`) | se cambia con «Pase a facturación real» de la ficha |
| Pase a real | tarjeta «Pase a facturación real» (`src/lib/operador/pase-a-real.ts:251`): exige CUIT, PV, certificado **de producción**, condición IVA, `ARCA_MODO=real` y **cero** comprobantes de prueba | anda |
| Delegación (el cliente autoriza a GSG en vez de darle su certificado) | `src/lib/fiscal/firmante.ts` la usa al firmar | **callejón**: no hay pantalla que la cargue ni la verifique. Hoy, sólo con certificado propio |

**Ramas viejas** (`claude/facturacion-automatica*`, `frente/facturacion-arca`, `integ/seg-contador`, `frente/producto-contador`):
no traen nada de ARCA que falte en `main`. `main` está por delante; lo que sólo vive en ellas es otra cosa (réplica Magra,
`/premium`) o versiones viejas de archivos que después se reescribieron. `frente/facturacion-arca` trae la migración
`20260707160000_fiscal_contribuyente_receptor_notas`, que fue reemplazada: **no hay que traerla**.

### Por qué hacía falta «Verificar con ARCA»
- El «banco de pruebas» de `/admin/facturacion` firma con el certificado de prueba **de la plataforma**
  (`ARCA_CERT_PEM`, `src/lib/arca-pruebas-actions.ts:118`), no con el del cliente: no prueba nada del cliente.
- La «factura de verificación» guardada sólo corre con `ARCA_MODO=stub` (`arca-pruebas-actions.ts:186`).
- Si se factura en homologación por el circuito normal, cada factura de prueba con CAE **bloquea para siempre el pase a
  real de ese negocio** (`pase-a-real.ts:233-240`: «este negocio no pasa a real desde acá»).

«Verificar con ARCA» (`src/lib/fiscal/verificar-con-arca.ts`) usa el certificado del cliente y se fija qué ambiente
de ARCA lo emitió: (1) pide el ticket a WSAA, (2) lee el último comprobante del punto de venta, (3) **sólo en homologación**
saca una factura de prueba de $100 (C o B según la condición) y muestra el CAE. **No guarda la factura** ni toca el outbox.
En producción sólo lee: nunca emite. No depende de `ARCA_MODO`. El ticket se guarda cifrado para que la emisión real lo reuse.

> **Modelo (decisión del dueño, 05/11/2026): certificado PROPIO del cliente.** GSG **no** hace trámites en ARCA por el
> cliente ni usa delegación a su CUIT, y **nunca** pide ni usa su clave fiscal. Todo lo que pasa dentro de arca.gob.ar lo
> hace **el cliente** (o un estudio contable que él elige, con la relación que ese estudio tiene con él en ARCA). El operador
> sólo carga datos en la ficha y mira el asistente. Base legal: RG 5048/2021 art. 4 — **a validar por legales**.

---

## 0.1 El recorrido del cliente solo (meta: ≤ 6 pasos, ≤ 10 minutos)

En `/admin/facturacion?vista=arca`, arriba del asistente: «lo hacés vos… GSG no entra a tu ARCA» y el aviso **antes de
empezar** de la clave fiscal **nivel 3** (cómo saber si la tiene y dónde subirla).

| # | Dónde | Qué hace | Toques |
|---|---|---|---|
| 1 | ERP, paso 2 | «Generar el pedido de certificado» | 1 |
| 2 | ERP, paso 2 | «Bajar el pedido (archivo .csr)» (y/o «Copiar el pedido», para WSASS desde el celular) | 1 |
| 3 | ARCA | Iniciar sesión (CUIT + clave fiscal) → «Administración de Certificados Digitales» → «Agregar alias»: `gsg-erp` + subir el archivo → «Agregar alias» | ~6 + 2 campos |
| 4 | ARCA | «Ver» al lado de `gsg-erp` → «Descargar» (baja el `.crt`) | 2 |
| 5 | ARCA | «Administrador de Relaciones de Clave Fiscal» → «Nueva relación» → «Buscar» → ARCA → «WebServices» → «Facturación Electrónica» → Representante: «Buscar» → computador fiscal `gsg-erp` → «Confirmar» | ~8 |
| 6 | ERP, paso 3 | Subir (o pegar) el certificado → «Guardar el certificado» → «Probar con ARCA» | 3 |

Lo que ve en ARCA: el portal con buscador de servicios; en Certificados Digitales, la lista de alias con «Agregar alias»;
en el alta del alias, un campo de texto y un selector de archivo; en Administrador de Relaciones, la lista de relaciones con
«Nueva relación» y un buscador de servicios por organismo. Revisión hecha leyendo el componente y los textos, **no** en ARCA
real ni con la app levantada (provisional a confirmar en la prueba con el cliente).

Dónde se traba alguien y qué hace la pantalla:
- **Clave nivel 2:** «Certificados Digitales» no aparece → el aviso de nivel 3 está ANTES del paso 1.
- **Confunde el pedido con el certificado:** al pegar un pedido (`CERTIFICATE REQUEST`), una clave privada o subir el `.csr`,
  la pantalla lo dice al instante (`src/lib/fiscal/certificado-pegado.ts`).
- **En el celular no puede subir archivos a WSASS:** «Copiar el pedido» con un toque.
- **Se olvida de asociar a «Facturación Electrónica»:** «Probar con ARCA» devuelve `notAuthorized` y el texto de `queHacer`
  (`src/lib/fiscal/verificar-con-arca.ts:88`) dice dónde.
- **No le sale:** «¿Te trabaste? Obtené asistencia» (ver 0.2).

## 0.2 «Obtené asistencia» (dos opciones, sin migración)

1. **Elegí tu contador:** listado de estudios con la consola del contador activa (módulo `cartera`, leído de `Tenant`; no se
   inventa ninguno). Sin estudios: «Todavía no hay contadores disponibles: contactate con GSG». Al elegir uno queda una fila
   `fiscal.contador-arca.pedido` en AuditLog del negocio (la última manda; «Elegir otro o hacerlo yo» deja
   `fiscal.contador-arca.cancelado`) y aparece «Avisale por WhatsApp» al número de la ficha del estudio (`BusinessSettings.whatsapp`),
   con un resumen **sin CUIT completo ni clave**. Estado: **pedido → en curso** (hay pedido de certificado o certificado sin
   prueba) **→ listo** (certificado cargado y «Probar con ARCA» en verde después de cargarlo: fila `fiscal.arca.prueba-ok`).
2. **Contactate con GSG:** WhatsApp de soporte (`WHATSAPP_GSG`) con un mensaje armado; sin la variable, «provisional a
   confirmar». Soporte guía; el trámite lo hace el cliente.

Pendiente: que el estudio vea el pedido en `/contador` (hoy sólo le llega por el WhatsApp que manda el cliente).

---

## 1. Antes de empezar (5 min)

1. 🔒 **DUEÑO:** confirmar que `FISCAL_MASTER_KEY` está en Vercel (Production). Sin ella, «Cargar el certificado» falla.
   Y `ARCA_INVOICING_ENABLED=true` (`src/lib/fiscal.ts:29`): sin ella las facturas quedan pendientes sin CAE (no afecta a «Verificar con ARCA»).
2. 🔒 **DUEÑO:** decidir si mergea esta rama (PR sin migraciones). El merge a `main` es deploy: Gate 1.
3. Tener el negocio del cliente creado en `/operador` con el módulo **ARCA** (pestaña Módulos).
4. Datos del cliente: CUIT, condición frente al IVA, razón social, domicilio fiscal, inicio de actividades, IIBB.

## 2. Homologación: el certificado de prueba del cliente

En homologación el CUIT es el del cliente, pero el certificado sale de otro lado (WSASS) y **no sirve para producción**.

**2.1 Clave y pedido de certificado (CSR) — con el asistente.** Ya no se usa openssl ni se pega ninguna clave. El
**asistente «Conectar con ARCA»** genera en el servidor la clave RSA 2048 y el pedido (`/C=AR/O=<razón social>/CN=gsg-erp/
serialNumber=CUIT <cuit>`); la clave queda **cifrada** (FISCAL_MASTER_KEY) y pendiente hasta que llegue el certificado, y nadie
la ve. Está en dos lugares, con los mismos 4 pasos:
- **El cliente:** `/admin/facturacion?vista=arca` (pestaña «Conectar con ARCA»; persona con `billing:manage` y módulo `arca`).
- **El operador:** `/operador/tenants/<id>?pestana=fiscal`, arriba de todo.

Paso 1 muestra CUIT, punto de venta y condición IVA (el cliente sólo los ve; si falta algo, «pedile a GSG»). Paso 2 →
**«Generar pedido de certificado»** → **«Bajar el archivo .csr»**. Generar otro pedido invalida el anterior.
(Rodeo manual, si el asistente no anda: openssl como antes y el formulario «Paso 3 · Certificado de ARCA» de la ficha, donde
🔒 **DUEÑO** pega cert + clave.)

**2.2 Certificado de homologación.** Lo hace **el cliente** con su clave fiscal, en arca.gob.ar (GSG no entra):
1. «Administrador de Relaciones de Clave Fiscal» → Adherir servicio → ARCA → Servicios interactivos → **WSASS - Autogestión
   Certificados Homologación**. (Una vez sola.)
2. Entrar a **WSASS** → «Nuevo certificado» → nombre `gsg-erp` → pegar el contenido del `.csr` del asistente → Crear.
   Copiar el certificado que aparece.
3. En WSASS → «Crear autorización a servicio» → elegir `gsg-erp`, servicio **wsfe** (Facturación Electrónica) → Crear.

**2.3 Datos y certificado en el ERP.** Los datos los carga el operador en `/operador/tenants/<id>?pestana=fiscal`:
1. CUIT → «Guardar». Punto de venta → en homologación vale cualquier número (por ejemplo 1); **usá el mismo que vas a crear
   en producción** así no hay que cambiarlo. Condición frente al IVA → «Guardar la condición».
2. Asistente, **paso 3** → pegar el certificado de WSASS (o subir el `.crt`) → «Guardar el certificado». Lo puede hacer el
   cliente o el operador: el sistema lo junta con la clave pendiente, exige que sea **del último pedido** y **del CUIT del
   negocio** (que el cliente no puede cambiar), lo guarda cifrado y borra el pedido. Errores en criollo: «no es del último
   pedido», «es de otro CUIT», «eso no parece un certificado».

**2.4 Cómo sabés que homologación anda.** Asistente, paso 3 → **«Probar con ARCA»** (en la ficha también sigue «Verificar con
ARCA»; es la misma prueba). Bien es una línea verde así:
> ARCA (homologación) reconoce el certificado y el punto de venta 1; último Factura C autorizada: N. Factura C de prueba n.º N+1 con CAE 7… (vence …). No quedó guardada en el negocio.

Si el número sube cada vez que tocás, ARCA está autorizando. Con eso el certificado, el CUIT, el servicio wsfe y la letra quedan probados.

## 3. Producción: el certificado real y el punto de venta

**3.1 Certificado de producción** (lo hace **el cliente** con su clave fiscal nivel 3; GSG no entra). El asistente queda en el paso 4 diciendo «el certificado
cargado es de pruebas»: volver al **paso 2 → «Generar otro pedido»** (el pedido de homologación ya se usó) y bajar el `.csr`.
1. «Administración de Certificados Digitales» (adherirlo si no está) → Agregar alias `gsg-erp` → subir ese `.csr` →
   descargar el `.crt`.
2. «Administrador de Relaciones de Clave Fiscal» → Nueva relación → Buscar → ARCA → WebServices → **Facturación
   Electrónica** → Representante: el computador fiscal `gsg-erp` → Confirmar.

**3.2 Punto de venta para web services.** «Administración de puntos de venta y domicilios» → Agregar → número (el mismo del
paso 2.3) → sistema **«Factura Electrónica - Monotributo - Web Services»** (monotributo) o **«RECE para aplicativo y web
services»** (inscripto) → domicilio → Aceptar. Un punto de venta de «Factura en línea» **no sirve** para el ERP.

**3.3 Rotar el certificado en el ERP.** Asistente, paso 3 → subir el `.crt` de producción → «Guardar el certificado» (reemplaza
al de homologación; queda en AuditLog como `fiscal.credential.rotate`). Después **«Probar con ARCA»** tiene que decir **«ARCA (producción) reconoce el certificado y el punto de venta
N; último … autorizada: 0»** y aclarar que no emitió nada. Si dice producción y 0, está listo.

**3.4 Encender.**
1. 🔒 **DUEÑO:** `ARCA_MODO=real` en Vercel y redeploy. **Ojo:** es para toda la plataforma. Los negocios que siguen «en pruebas»
   (el resto) pasan a hablar con la homologación de ARCA con **su** certificado: el que no tenga uno deja de sacar CAE
   simulado y sus facturas quedan esperando. Antes de cambiarlo, mirar en `/operador` qué negocios tienen el módulo ARCA.
   Si alguno se usa para demos con CAE simulado, decidir antes (provisional a confirmar: dejarlos sin el módulo ARCA mientras dure la prueba).
2. Asistente, **paso 4**: muestra las seis condiciones del pase. El **cliente** puede **pedir** el pase escribiendo
   `PRODUCCIÓN` (queda en AuditLog como `fiscal.pase-a-real.pedido`, uno solo; se habilita con CUIT, punto de venta, condición
   IVA y certificado de producción en verde). **Lo aplica un operador** (decisión anotada en `src/lib/fiscal/asistente-arca.ts`):
   el asistente de la ficha muestra «El negocio pidió pasar a producción el …» y la tarjeta **«Facturación real»**: todas las
   condiciones en verde → escribir el slug → confirmar. 🔒 **DUEÑO** (desde acá, cada comprobante tiene validez fiscal).
3. **Primera factura real:** que el cliente haga una venta chica real (o desde `/admin/facturacion`) a consumidor final. Revisar
   CAE, número 1 y el QR del PDF; se controla en ARCA → «Mis Comprobantes» → Emitidos (puede tardar un día).
4. Si algo salió mal: no se borra. Se anula con nota de crédito desde la factura (`AnularFactura`).

## 4. Si ARCA rechaza (lo que dice «Verificar con ARCA» y qué hacer)

| Mensaje de ARCA (contiene) | Qué pasa | Qué hacer |
|---|---|---|
| `cms.cert.untrusted` | certificado de un ambiente usado en el otro | homologación → WSASS; producción → Certificados Digitales |
| `cert.expired` / vencido | venció | nuevo CSR, nuevo certificado, «Rotar» |
| `coe.notAuthorized` / «no autorizado a acceder» | falta asociar el certificado a **wsfe** | 2.2 punto 3 (homo) o 3.1 punto 2 (prod) |
| `coe.alreadyAuthenticated` | ARCA ya dio ticket a ese certificado y no lo tenemos | esperar 10 minutos y volver a verificar |
| punto de venta / `PtoVta` | PV no habilitado para web services o de otro CUIT | 3.2 |
| `10016` número/fecha | numeración desfasada | volver a verificar (lee el último de nuevo) |
| `10013` / tipo de comprobante | la condición IVA cargada no es la de ARCA | corregir la condición |
| «El certificado es del CUIT X» | el certificado no es del CUIT del negocio | revisar Paso 1 o el CSR |
| «No sabemos de qué ambiente» | el emisor del certificado no es el de ARCA conocido | mandarme el texto del emisor; no seguir |

Textos de ARCA provisionales a confirmar con los rechazos reales de hoy: si aparece uno que no está, el botón lo muestra tal cual.

## 5. Lo que decide el dueño (resumen)
1. Mergear la rama (sin migraciones) — o hacer la prueba con los rodeos de §6.
2. Nada de claves: el certificado lo sube el cliente en el asistente (el rodeo manual con clave pegada queda sólo para emergencias).
3. `ARCA_MODO=real` en Vercel, sabiendo que es para toda la plataforma (§3.4.1).
4. Confirmar el pase a real del cliente y la primera factura.

## 6. Sin mergear la rama (rodeos)
- **Condición IVA:** sin el botón, se carga en Neon (`UPDATE "Tenant" SET "arcaCondicionIva"='MONOTRIBUTO' WHERE slug='…'`): 🔒 **DUEÑO**, Gate 2 de datos.
- **Probar homologación:** sin «Verificar con ARCA» sólo queda facturar por el circuito normal con `ARCA_MODO=homologacion`
  (toda la plataforma) — y eso **deja al cliente sin poder pasar a real** desde la consola. No recomendado.
