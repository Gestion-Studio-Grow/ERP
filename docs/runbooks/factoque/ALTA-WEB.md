# Factoque · Alta web autoservicio

Orden del dueño (08/11/2026, «Alta de negocios automatizada»): un monotributista o comercio se da de alta
solo desde `/facturita/alta`, sin que nadie de GSG intervenga. El alta por script sigue existiendo
(`ALTA-AUTOMATIZADA.md`); las dos escriben con la misma transacción (`src/lib/factoque/alta-negocio.server.ts`).

## El flujo

1. **Pedido** (`/facturita/alta`, último paso, «Crear mi cuenta»): nombre, CUIT (dígito verificador),
   condición frente al IVA, punto de venta y mail. `pedirAlta` (`src/lib/factoque/alta-web.server.ts`)
   valida, descarta robots (campo trampa `sitio_web`), aplica límites y manda UN mail. **No escribe nada
   en la base.** La pantalla responde siempre lo mismo.
2. **Mail**: enlace `https://factoque.gsgapp.com.ar/facturita/alta/confirmar?t=…`. El alta pendiente viaja
   ahí, cifrada con AES-256-GCM (clave derivada de `AUTH_SECRET`). Vence a las 24 h. Si el CUIT ya tiene
   negocio, el mail no trae enlace y dice «no pudimos» (sin el motivo).
3. **Confirmar**: la página muestra los datos; el negocio se crea con el **POST** del botón (los lectores
   de enlaces del correo no crean negocios). Una transacción: candado del CUIT, CUIT libre, slug
   `nombre-xxxx`, blueprint `facturita`, módulos `arca`+`clients`, titular OWNER, auditoría `web:alta-factoque`.
4. **Clave**: redirige a `https://<slug>.gsgapp.com.ar/facturita/clave?t=…` (2 h). El enlace va atado al hash
   de contraseña vigente: al guardar la nueva, muere. Se abre la sesión y cae en
   `/facturita/app/cuenta#conectar-arca`, donde el titular saca el certificado con SU clave fiscal (PR #44).
5. **Retomar**: si cerró la pestaña antes de elegir la clave, el mismo enlace del mail (dentro de las 24 h)
   le da otro enlace de clave, mientras el titular nunca haya entrado (`lastLoginAt` nulo).

Sin punto de venta, el asistente sigue con el alta operada de siempre (resumen por WhatsApp o mail).

## Sin migración

Nada nuevo en la base: el pendiente vive en el enlace cifrado; «un solo uso» sale del CUIT tomado y del
hash de contraseña. Se usan columnas existentes (`Tenant.arcaCuit`, `User.passwordHash`, `User.lastLoginAt`).

## Variables

| Variable | Default | Para qué |
|---|---|---|
| `AUTH_SECRET` | (obligatoria) | Deriva las claves de los enlaces. Rotarla invalida los enlaces vivos. |
| `FACTOQUE_ORIGEN_PUBLICO` | `https://factoque.gsgapp.com.ar` | Origen FIJO del enlace del mail (nunca el Host del pedido). |
| `FACTOQUE_ORIGEN_NEGOCIO` | `https://{subdominio}.<APP_BASE_DOMAIN o gsgapp.com.ar>` | Dónde vive la clave y la sesión del negocio. |
| `RESEND_API_KEY` + `RESEND_FROM_EMAIL` | — | Sin ellas el mail no sale (y la pantalla responde igual). |
| `FACTOQUE_ALTA_BUZON_LOCAL` | — | Sólo fuera de producción: deja los mails en un archivo para QA. |

**Provisional a confirmar con plataforma:** que `*.gsgapp.com.ar` resuelva a la app en Vercel (comodín). Sin
eso, el paso 4 cae en una dirección que no abre.

## Límites (en memoria, por instancia)

Pedir: 20/h por IP, 3/h por mail, 3/h por CUIT. Confirmar y clave: 20/h por IP. Por instancia de Vercel: frena
al insistente, no a una red de máquinas (deuda: un almacén compartido cuando haya venta, ADR-030).

## CUIT sin verificar (aprobado por el dueño, 08/11: «Está ok la validación de la alta web»)

Nada en el alta web prueba que quien la pide sea el titular del CUIT. La prueba es conectar ARCA: el
certificado sólo lo saca el titular con su clave fiscal. Sin columna nueva:

- **Verificado** = ARCA aceptó el certificado en **producción**: auditoría `fiscal.arca.prueba-ok` con
  `entorno = produccion`, posterior a la última carga del certificado (`TenantFiscalCredential.updatedAt`).
  Un certificado cargado no alcanza (cualquiera arma uno con un CUIT ajeno firmado por su propia CA), y una
  prueba en homologación tampoco: no está comprobado que ARCA ate el certificado de prueba al CUIT de quien
  entra (provisional a confirmar con ARCA). Rotar el certificado obliga a probar de nuevo.
- **Alta web** = el negocio tiene la auditoría `factoque.alta` con actor `web:`. Los dados de alta por GSG
  (consola o script) no la tienen y **siempre** ocupan su CUIT: los revisó una persona.
- Un alta web **sin verificar no bloquea**. Si el titular real pide el alta con ese CUIT, recibe un mail con
  enlace para reclamarlo (la pantalla dice lo mismo de siempre). Pueden convivir varias altas sin verificar
  con el mismo CUIT; ninguna le reserva el punto de venta a las otras.
- **Gana el primero que verifica en producción.** `registrarPruebaArcaOk` y `guardarRegistroCredencial`
  (`src/lib/fiscal/tenant-cert.ts`) se ponen en fila por el CUIT y se niegan a un alta web si otro negocio ya lo
  verificó, aun a la vez. El asistente «Conectar con ARCA» muestra: «Ese CUIT ya está conectado con ARCA en otro negocio…».
- **Vence a los 15 días** (provisional a confirmar, `VENCE_ALTA_SIN_VERIFICAR_MS`): el alta sin verificar deja
  de ocupar el CUIT. No se borra nada; si después conecta ARCA, verifica igual (sólo puede el titular).
- El **mismo mail** no duplica negocio: retoma el suyo (enlace de clave nuevo si nunca entró).

**Residual aceptado:** quien controla una casilla puede saber si un CUIT ya está en GSG (mail con enlace,
de reclamo o «no pudimos»). La pantalla no lo revela.

## QA local

Base local con RLS (`app_rls`, `RLS_ENFORCEMENT=on`), `APP_BASE_DOMAIN=localhost`,
`TENANT_HOST_MAP=factoque.localhost=facturita`, buzón local. Recorrido a 390 px: alta → mail → confirmar →
clave débil → clave → Mi cuenta → enlaces usados. Nunca Neon ni Vercel de producción.

**Deuda anotada (certificación 08/11):** las altas web no pasan por el candado del punto de venta; una sin
verificar puede trabar el punto de venta que GSG le cargue desde la consola a un negocio propio con ese CUIT.
Se corrige en el candado de la consola cuando haga falta.
