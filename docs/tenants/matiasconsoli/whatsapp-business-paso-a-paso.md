# WhatsApp Business para el turnero de Matías — paso a paso

**Para quién:** el dueño de GSG (o quien conecte la cuenta junto con Matías).
**Cuánto lleva:** una tarde la primera vez (la aprobación de las plantillas puede tardar de minutos a un día).
**Qué cambia:** hoy los avisos al alumno salen con un **botón verde** que abre WhatsApp con el
mensaje listo y Matías lo manda con un toque. Con esto conectado, **salen solos** desde el número
del negocio y las respuestas cortas del alumno ("sí", "cancelo") vuelven al panel.

> **Regla de la casa:** los tokens y secretos los pega **siempre el dueño** en Vercel. Nunca se
> mandan por chat, ni se commitean, ni los pega un agente. (CLAUDE.md → fase 2 de credenciales.)
> Y recordá el ciclo **demo → venta → inversión**: esto se conecta **después** de que Matías compre.

---

## 1. Qué vas a tener al final

| Hoy (modo manual, costo cero) | Con la Cloud API conectada |
|---|---|
| Matías toca "Confirmar" → aparece "Avisarle a Juan por WhatsApp" → lo toca → WhatsApp abre con el texto → envía. | Matías toca "Confirmar" → el mensaje **ya le llegó** a Juan ("· le llegó el WhatsApp"). |
| El alumno, al pedir, le manda un WhatsApp a Matías desde su propio teléfono. | Igual (eso no cambia: es el alumno avisando). |
| Las respuestas del alumno las lee Matías en su WhatsApp. | "Sí" / "dale" / "confirmo" y "no puedo" / "cancelo" se aplican solas a la próxima clase y quedan en **Pendientes → Últimos movimientos**. |

Si algún día Meta rechaza un mensaje (plantilla no aprobada, token vencido), **el panel vuelve
solo al botón verde**: Matías nunca se queda sin forma de avisar.

**Costos (verificar en el momento, Meta los cambia):** las conversaciones de *servicio* (el
alumno escribe primero) son gratis; las de *utilidad* (confirmaciones, recordatorios) se cobran
por mensaje en Argentina a una tarifa baja. Página oficial: *WhatsApp Business Platform → Pricing*.
→ Gasto = **decisión del dueño** (gate de gasto).

## 2. Lo que hace falta antes de empezar

- Una cuenta de **Facebook** personal del que administra (no se publica nada en ella).
- Un **número de celular para el negocio** que **no esté usándose en WhatsApp** (ni personal ni la
  app WhatsApp Business). Opciones: un chip nuevo (lo más simple) o migrar el número que Matías
  usa hoy en la app WhatsApp Business (al migrarlo, deja de funcionar en la app del celular).
  ⚠️ **Decisión de Matías**, provisional a confirmar.
- Un email del negocio.
- Acceso al proyecto de Vercel del ERP (lo tiene el dueño de GSG).
- El dominio donde corre su turnero, por ejemplo `https://matiasconsoli-erp.vercel.app`
  (provisional a confirmar: es la URL de la demo hasta la venta).

## 3. Meta Business Manager (el "negocio" en Meta)

1. Entrá a **business.facebook.com** con la cuenta de Facebook.
2. **Crear cuenta** → nombre del negocio: `Profe Matías Consoli` (o el nombre legal si tiene), tu
   nombre y el email del negocio.
3. En **Configuración del negocio → Información del negocio**, completá dirección y CUIT si los
   tiene. La **verificación del negocio** no es obligatoria para arrancar (hay un límite de
   conversaciones por día sin verificar), pero conviene pedirla: sube los límites.

## 4. La app de Meta for Developers

1. Entrá a **developers.facebook.com** → **Mis apps → Crear app**.
2. Caso de uso: **"Otro"** → tipo **"Negocio" (Business)** → nombre `GSG Turnero Matias` → elegí
   el Business Manager del paso 3.
3. En el panel de la app, **Agregar producto → WhatsApp → Configurar**. Meta crea una **cuenta
   de WhatsApp Business (WABA)** de prueba con un número de prueba.

## 5. El número del negocio

1. En **WhatsApp → Configuración de la API (API Setup)** → **Agregar número de teléfono**.
2. Nombre visible: `Profe Matías` (Meta lo revisa; tiene que parecerse al nombre del negocio).
3. Categoría: **Educación** o **Deportes y recreación**.
4. Verificá el número con el **código por SMS o llamada**.
5. Anotá dos datos de esa pantalla (no son secretos, pero tampoco se publican):
   - **Phone number ID** (identificador del número) → va en `WHATSAPP_PHONE_NUMBER_ID`.
   - **WhatsApp Business Account ID** (WABA ID) → para el soporte, no lo usa el código.

## 6. El token permanente (usuario del sistema)

El token que muestra "API Setup" **vence a las 24 h**: sirve sólo para probar. Para producción:

1. **business.facebook.com → Configuración del negocio → Usuarios → Usuarios del sistema → Agregar**.
2. Nombre `gsg-turnero`, rol **Administrador**.
3. **Asignar activos** → la app del paso 4 (control total) y la cuenta de WhatsApp (control total).
4. **Generar token** → elegí la app → caducidad **Nunca** → permisos:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
5. Copiá el token **directo a Vercel** (paso 9). Meta no lo vuelve a mostrar.

## 7. El App Secret y el token de verificación

- **App Secret:** developers.facebook.com → tu app → **Configuración de la app → Básica → Clave
  secreta de la app → Mostrar**. Con él el ERP comprueba que cada aviso que llega es de Meta
  (firma `X-Hub-Signature-256`). Va en `WHATSAPP_APP_SECRET`.
- **Token de verificación:** lo inventás vos: una frase larga sin espacios, por ejemplo generada
  con un gestor de claves (sólo letras, números, `-` y `_`). Va en `WHATSAPP_VERIFY_TOKEN` y lo
  vas a pegar también en Meta en el paso 8.

## 8. El webhook (lo que el alumno contesta vuelve al panel)

1. **Antes**, cargá en Vercel `WHATSAPP_VERIFY_TOKEN` y redeployá (paso 9): si no, Meta recibe un
   503 y no deja guardar.
2. developers.facebook.com → tu app → **WhatsApp → Configuración → Webhook → Editar**.
3. **URL de devolución de llamada:** `https://<dominio-del-turnero>/api/webhooks/whatsapp`
   (ej.: `https://matiasconsoli-erp.vercel.app/api/webhooks/whatsapp`). El negocio sale del
   dominio: **tiene que ser el dominio de Matías**, no el de otro tenant.
4. **Token de verificación:** el mismo de `WHATSAPP_VERIFY_TOKEN`.
5. **Verificar y guardar.** Meta llama con un GET y el ERP le devuelve el código (si el token no
   coincide, 403).
6. En **Campos del webhook**, **Suscribirse** a `messages`.

## 9. Las variables en Vercel (las pega el dueño)

Proyecto del ERP → **Settings → Environment Variables** → entorno **Production** (y Preview si
querés probar ahí primero):

| Variable | Valor | Para qué |
|---|---|---|
| `PADEL_WHATSAPP` | `cloud` | Prende el envío automático. Sin esto (o con otro valor) sigue el botón verde. |
| `WHATSAPP_CLOUD_TOKEN` | el token permanente del paso 6 | Mandar mensajes. |
| `WHATSAPP_PHONE_NUMBER_ID` | el Phone number ID del paso 5 | Desde qué número. |
| `WHATSAPP_APP_SECRET` | el App Secret del paso 7 | Comprobar la firma de lo que llega. |
| `WHATSAPP_VERIFY_TOKEN` | la frase del paso 7 | La verificación del webhook. |

Después: **Redeploy** (es un deploy → gate 1, OK del dueño). Los nombres están en
`.env.vercel.template`, sin valores.

## 10. Las plantillas de mensaje (para escribir fuera de las 24 h)

WhatsApp sólo deja mandar texto libre dentro de las 24 h desde el último mensaje del alumno.
Fuera de esa ventana, sólo **plantillas aprobadas**. El ERP usa estas seis (los nombres tienen
que ser **exactamente** estos; el orden de las variables también):

**WhatsApp Manager → Administrar plantillas → Crear plantilla** → categoría **Utilidad** →
idioma **Español (ARG)** (`es_AR`).

| Nombre | Texto (copiar tal cual) | Variables, en orden |
|---|---|---|
| `clase_confirmada` | Hola {{1}}! Te confirmo la clase del {{2}} a las {{3}}. Desde tu link podés pagar y ver tus clases: {{4}} | nombre, día, hora, link |
| `clase_rechazada` | Hola {{1}}! El {{2}} a las {{3}} no puedo. Fijate otro horario acá: {{4}} | nombre, día, hora, turnero |
| `proxima_clase` | Hola {{1}}! Te agendé la próxima clase: {{2}} a las {{3}}. Si no podés, cancelala desde tu link: {{4}} | nombre, día, hora, link |
| `pago_recibido` | Gracias {{1}}! Recibí el pago de la clase del {{2}}. | nombre, día |
| `comprobante_no_valido` | Hola {{1}}! No pude validar el comprobante de la clase del {{2}}. ¿Me lo mandás de nuevo desde tu link? {{3}} | nombre, día, link |
| `recordatorio_clase` | Hola {{1}}! Te recuerdo la clase del {{2}} a las {{3}}. Si no llegás, respondé CANCELAR. | nombre, día, hora |
| `link_alumno` | Hola {{1}}! Este es tu link para ver tus clases, repetir la de la semana que viene y mandar el comprobante: {{2}} | nombre, link |

- En `proxima_clase` y `recordatorio_clase` podés sumar **botones de respuesta rápida** "Voy" y
  "Cancelar". El botón "Cancelar" tiene que llevar el **payload `CANCELAR`**: es lo único (junto
  con la palabra CANCELAR escrita sola) que cancela la clase. Un "no", "no puedo" o "no voy"
  escrito a mano **no cancela**: el ERP le pregunta "¿Cancelás…? Respondé CANCELAR" y deja el
  mensaje en la bandeja (Tanda 1 de la reingeniería, `interpretarRespuesta`).
- `link_alumno` lo usa «¿Ya sos alumno? Pedí tu link» del turnero: el link le llega al número
  registrado y nunca se muestra en pantalla.
- Meta pide un **ejemplo** de cada variable: `Juan`, `jueves 23/10`, `18:00`,
  `https://matiasconsoli-erp.vercel.app/alumno/ejemplo`.
- Fuente en el código: `PLANTILLAS_META` en `src/lib/padel/whatsapp-cloud.ts`. Si cambiás un
  nombre en Meta, cambialo ahí también.
- Los textos que Matías edita en **Horarios y precios → Los textos de WhatsApp** se usan para el
  botón verde y dentro de las 24 h; fuera de la ventana manda la plantilla aprobada.

## 11. La prueba

1. Desde el celular de Matías, mandale un WhatsApp cualquiera al número del negocio ("hola"):
   abre la ventana de 24 h y aparece en **Pendientes → Últimos movimientos** ("… escribió: hola").
2. Desde el turnero, pedí una clase con **otro** celular de prueba.
3. En el panel, **Confirmar**: tiene que aparecer "✓ Confirmada · le llegó el WhatsApp" y el
   mensaje en el celular de prueba.
4. Desde el celular de prueba, respondé **"no puedo"**: la clase pasa a cancelada (si falta más
   que la anticipación mínima) y aparece en Pendientes.
5. Si algo falla, el panel muestra el botón verde de siempre y el motivo queda guardado en el
   aviso (`PadelAviso.errorEnvio`). Revisá los logs de Vercel con el filtro `padel.whatsapp`.

## 12. Problemas típicos

| Síntoma | Causa probable | Arreglo |
|---|---|---|
| Meta no deja guardar el webhook | `WHATSAPP_VERIFY_TOKEN` no cargado o sin redeploy (503), o distinto (403) | Paso 8.1 y 9. |
| "Número ya registrado" al agregarlo | Está en WhatsApp común o en la app Business | Borrar la cuenta de WhatsApp de ese número o migrarlo. |
| Sigue saliendo el botón verde | Falta `PADEL_WHATSAPP=cloud` o alguna credencial | Las cinco variables + redeploy. |
| Sale el botón verde con error "(132001)" | Plantilla con otro nombre o sin aprobar | Paso 10; revisar el nombre exacto. |
| Error "(190)" | Token vencido (usaste el de 24 h) | Paso 6: token de usuario del sistema, caducidad "Nunca". |
| Lo que contesta el alumno no aparece | Webhook sin suscribir a `messages`, o firma inválida (App Secret mal copiado) | Paso 8.6 y 7. |
| El mensaje llegó a otro negocio | La URL del webhook es de otro dominio | Paso 8.3: el dominio de Matías. |

## 13. Perfil y buenas prácticas

- **Perfil del negocio** (WhatsApp Manager → Perfil): foto (la de Matías, **con su autorización
  registrada**, ADR-034), descripción corta, horario y el link del turnero.
- Mandá sólo lo que el alumno espera (confirmaciones, recordatorios, pagos). Nada de promociones
  por plantilla de utilidad: Meta baja la calidad del número y después limita.
- Si el número llega a calidad "baja" en el Manager, pausá los recordatorios hasta que suba.

---

**Lo que el código ya trae (no hay que programar nada para conectarlo):**
`src/lib/padel/whatsapp-cloud.ts` (firma, desafío, plantillas, lectura de respuestas — con tests),
`src/lib/padel/notificador.ts` (envío con caída al botón verde), `src/app/api/webhooks/whatsapp/route.ts`
(GET de verificación y POST firmado, apagado por defecto).

**Pendiente a futuro (no bloquea):** guardar las credenciales por negocio en
`IntegracionCredencial` (hoy van por variable de entorno porque hay un solo profe) y un
recordatorio automático del día anterior por cron.

— Elaborado por GSG
