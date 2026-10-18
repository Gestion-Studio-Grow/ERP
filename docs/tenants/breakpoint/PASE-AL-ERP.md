# Break Point — el pase al ERP (trial en el plan gratis)

**Decisión del dueño (18/10/2026):** «Pasamos al ERP el sistema, con el plan actual (gratis), todavía no le vamos a
cobrar; al venderlo se aumenta el plan; es un trial pero debe estar en el ERP.»

Qué quiere decir en la práctica: Break Point (negocio `breakpoint`) deja de trabajar con el club de hoy
(`https://breakpointpadel.gsgapp.com.ar/club`, con todo guardado en el navegador de la compu del mostrador) y pasa
al club del ERP (`/admin/club`), con la jornada guardada en la base del ERP. Es un **trial**: no se cobra, no se
compra nada y se usa la infraestructura que ya tenemos. Cuando se venda, se sube el plan (ver el final).

Este documento es para el dueño y para nosotros. Cada paso dice dónde está en el código, para que nadie tenga que
creerle a un documento.

---

## 1. Cómo entra la gente del club al ERP

### La dirección

**`https://breakpointpadel.gsgapp.com.ar/admin`** — y para el club: **`https://breakpointpadel.gsgapp.com.ar/admin/club`**.

- El ERP sabe de qué negocio se trata **por la dirección**: `breakpointpadel.gsgapp.com.ar` → busca el negocio con
  subdominio `breakpointpadel` (`src/lib/tenant.ts:16-19` y `:164-180`). Si no lo encuentra, no muestra nada
  (falla cerrado). El negocio ya está dado de alta con ese subdominio desde el 15/10
  (`docs/tenants/breakpoint/UAT-PRODUCCION-RESULTADO.md:23-27`).
- **No sirve `gsg-erp.vercel.app/admin`** ni otra dirección sin el nombre del club: con varios negocios en la misma
  base, sin subdominio el ERP no sabe a quién mostrar y corta (`src/lib/tenant.ts:182-198`).
- Para Break Point, `/admin/club` abre directamente la **jornada real** (está en `NEGOCIOS_CON_JORNADA_REAL`,
  `src/app/admin/(dashboard)/club/page.tsx`). La demo con datos de ejemplo queda en `/admin/club?demo=1`, como en el
  club de hoy. En el sandbox de preventa nunca se abre la jornada real.
- La portada, el turnero (`/turnero`) y el club de hoy (`/club`) siguen en la misma dirección como hasta ahora
  (`src/lib/sitio-estatico.ts:62-77`): el pase no los toca.

### El login (el puesto) y el PIN (la persona)

- Sin sesión, cualquier página de `/admin` manda a `/admin/login` (`src/proxy.ts:105-110`). Se entra con **email y
  contraseña** de un usuario de **ese** negocio (`src/lib/auth-actions.ts:15-36`). Si el usuario tiene que cambiar la
  contraseña, el ERP lo manda a cambiarla antes de seguir (`src/lib/auth-actions.ts:69-71`).
- **El login es el puesto** (la compu, una vez por día); **el PIN del club es la persona** (bloqueo, cambio de
  usuario, cobros delicados), igual que hoy. Los PIN viajan dentro del respaldo: Rober, Majo y recepción siguen con
  los mismos.

### Qué rol del ERP hace falta

| Puesto | Rol del ERP | Por qué |
|---|---|---|
| **Puesto del dueño** (la compu donde se hace el pase, y para restaurar, archivar o empezar en blanco) | **Dueño/a** (`OWNER`) | Lo delicado pide el puesto del dueño **y** el PIN de un dueño (decisión G8): `config-jornada.tsx:438-447`, `almacen.ts:1135-1143` |
| **Mostrador** (recepción, todos los días) | **Recepción** (`RECEPTION`) | El club pide `agenda:manage` (`src/modules/descriptors/club.ts:36`), que tienen dueño y recepción (`src/lib/capabilities.ts:160-163`). El profesional no entra |

El club, además, sólo abre si el negocio tiene asignado el módulo `club`: sin eso no entra nadie, ni tecleando la
dirección (`src/apps/registro.test.ts:183-190`, `src/lib/require-app.ts`).

### Cómo se crean los usuarios (los crea el dueño y pega él las claves — G7)

No hay script: se hace en la pantalla de Usuarios del ERP, con un usuario Dueño/a.

1. Entrá a **`https://breakpointpadel.gsgapp.com.ar/admin/login`** con el usuario dueño que se creó en el alta del
   15/10 (el «Soporte GSG», con la clave que te mostró la consola en ese momento; nadie más la tiene).
2. Andá a **`/admin/usuarios`** → «Nuevo usuario» (`src/app/admin/(dashboard)/usuarios/page.tsx:64-97`).
3. Cargá **Nombre**, **Email**, **Rol** y **Contraseña** (mínimo 8 caracteres,
   `src/app/admin/(dashboard)/usuarios/alta-usuario.ts:15`) → «Crear usuario». Lo mínimo para el trial:
   - **un usuario Dueño/a** para el puesto del dueño (puede ser uno por dueño: Rober y Majo);
   - **un usuario Recepción** para la compu del mostrador (uno por puesto alcanza: la persona la dice el PIN).
4. Las contraseñas las elegís y las pegás vos; no las mandes por un grupo. Si el plan del negocio tuviera tope de
   usuarios, la pantalla lo dice y lleva a «Tu plan» (`src/lib/usuarios-del-plan.ts:15-28`).
5. Cuando estén los usuarios de Rober y Majo, al «Soporte GSG» se lo puede dar de baja desde la misma pantalla.

---

## 2. Asignar el módulo `club` a Break Point

Es una línea en la base: suma `club` a los módulos del negocio. No toca otros campos ni otros negocios, y si ya lo
tiene no hace nada (`scripts/club/asignar-modulo-club.ts:1-12`). **Necesita `DATABASE_URL`** (la de producción):
lo corre el dueño en su máquina, o la carga él como secreto del entorno y nos avisa. **Nunca la pega un agente.**

```bash
# 1) Mirar sin escribir: muestra los módulos antes y después
DATABASE_URL="<la de producción>" npx tsx scripts/club/asignar-modulo-club.ts --slug breakpoint

# 2) Escribir (con tu OK, G1)
DATABASE_URL="<la de producción>" npx tsx scripts/club/asignar-modulo-club.ts --slug breakpoint --apply
```

Si el primer paso avisa **«Le faltan dependencias del módulo: clients, pos»**, el club depende de Clientes y del
punto de venta (`src/modules/descriptors/club.ts:38-41`) y el script no los asigna solo: avisanos antes del
`--apply` y lo resolvemos en el mismo paso.

---

## 3. Antes del día del pase (lo deja listo GSG)

- El guardado en la base enchufado en el club y `breakpoint` en `NEGOCIOS_CON_JORNADA_REAL` (sesión de terminales).
- El aprobador del celular sigue siendo el de hoy (decisión G4, ver §5): ya está hecho en esta rama.
- Todo eso publicado: merge a `main` + deploy, **con tu OK** («deployá»). Un push a `main` hoy construye producción
  en Vercel, así que también cuenta como deploy.
- Un **ensayo** con un respaldo de mentira (`npx tsx scripts/club/anonimizar-respaldo.ts <respaldo.json>`) en el
  puesto del dueño, antes de hacerlo con el de verdad. El restaurar sobre una jornada nueva del ERP está armado
  en el código (abajo) pero el UAT de paridad no lo recorre de punta a punta: el ensayo es eso.

---

## 4. El día del pase, paso a paso

Elegí un momento con el club tranquilo (a la mañana, antes del primer turno). Calculá 30 minutos.

**En el club de hoy (la compu del mostrador):**

1. **Cerrá la caja** con el PIN (Caja → cerrar). Que no quede ninguna caja sin cerrar.
2. **Configuración → «Descargar respaldo».** Baja `breakpoint-jornada-AAAA-MM-DD-HHMM.json`
   (`docs/tenants/breakpoint/FORMATO-RESPALDO.md:3-5`). **Tiene los PIN y los datos de los clientes**: guardalo en
   un lugar privado y no lo mandes a un grupo.
3. (Opcional, recomendado) Revisá que el archivo esté sano sin tocar ninguna base:
   `npx tsx scripts/club/restaurar-respaldo.ts breakpoint-jornada-….json` — muestra los conteos, la caja por día,
   «caja = cobrado» y las cajas sin cerrar (`scripts/club/restaurar-respaldo.ts:5-7`). Anotá el total de la caja.
4. **No cierres ni borres nada del club de hoy.** Queda como estaba: es el plan B.

**En el ERP, en el puesto del dueño** (puede ser la misma compu del mostrador, entrando con el usuario Dueño/a):

5. Entrá a `https://breakpointpadel.gsgapp.com.ar/admin/login` con el usuario **Dueño/a** y abrí
   **`/admin/club`**.
6. Como el club todavía no tiene nada, aparece **«Primera vez: armá el club»** (`config-arranque.tsx:8-15`):
   - **Paso 1:** un dueño arma un PIN de 4 números (puede ser provisorio: el respaldo trae los de siempre).
   - **Paso 2:** «Entrá como dueño» con ese PIN. **No hace falta el paso 3 ni «Abrir el club».**
7. **Configuración → «Jornada» → «Restaurar desde un archivo»** (`config-jornada.tsx:92`; la misma pantalla lo
   sugiere: «Si venís del sistema de hoy, restaurá su respaldo en «Jornada»», `ConfiguracionDelClub.tsx:62`).
   Elegí el archivo del paso 2: la pantalla muestra de cuándo es y qué trae. Confirmá con el PIN del paso 6.
   - Sólo funciona en el puesto del dueño y con el PIN de un dueño (`almacen.ts:1135-1143` y `:1269-1300`).
   - Antes de reemplazar, guarda una copia de lo que había (si no hay lugar, no toca nada).
8. Quedan los usuarios y los PIN del respaldo: la pantalla se bloquea y se entra con **el PIN de siempre**.
9. **Verificá:** Caja → que la caja sea igual a lo cobrado y al total del paso 3; Clientes → un par de cuentas
   corrientes y deudas conocidas; Configuración → usuarios y accesos (están todos y entran con su PIN).

**En la compu del mostrador:**

10. Salí del usuario Dueño/a (si usaste esa compu) y entrá con el usuario **Recepción**, en
    `/admin/club`. El club abre lo guardado en la base, bloqueado: **recepción entra con su PIN** de
    siempre.
11. Una sola compu trabaja la jornada a la vez: si se abre otra pestaña, avisa y deja «Usar acá».

### Si algo falla: volver al club de hoy

- **Se sigue en `https://breakpointpadel.gsgapp.com.ar/club`**, en la misma compu: la jornada sigue ahí, intacta.
  Si esa compu perdió los datos, Configuración → «Restaurar desde un archivo» con el respaldo del paso 2.
- Lo que se haya cobrado en el ERP en el medio se carga a mano en el club de hoy (por eso conviene hacer el pase
  antes del primer turno).
- **Nunca trabajar en los dos a la vez**: dos sistemas con la misma caja terminan en dos cajas distintas.
- Avisanos qué pasó (captura de pantalla del mensaje) y se reintenta otro día con un respaldo nuevo.

### Qué pasa con los clientes y el turnero

**Nada cambia para los clientes hasta nuevo aviso.** La portada y el turnero público siguen en
`https://breakpointpadel.gsgapp.com.ar/` y `/turnero`; el link para clientes (`/turnero?modo=pedido&wa=…`) sigue
pidiendo por WhatsApp y el club carga el turno o el encargo a mano, ahora en el club del ERP.

---

## 5. La aprobación desde el celular durante el trial (G4)

El dueño sigue aprobando con **el link del club de hoy**, sin login:

- «Avisar a Rober/Majo por WhatsApp» en el club del ERP manda el link
  `https://breakpointpadel.gsgapp.com.ar/club#aprobar&id=…&c=…&n=…&m=…&t=…&p=…&f=…` — el mismo que armaba el club de
  hoy, con los mismos datos y en el mismo orden (`src/app/admin/(dashboard)/club/aprobador-externo.ts`,
  `aprobar-core.ts` → `linkDelAprobador`).
- En el celular, sin jornada guardada, el club de hoy sólo calcula el código con el PIN del dueño y el monto
  (`codigoAprobacion`, la misma función en los dos motores). Recepción lo tipea en el ERP y lo acepta
  (`aprobarPorCodigo`). Lo prueban `aprobar-core.test.ts` y el UAT de paridad (`3.whatsapp`, `3.codigo`,
  `3.aprobado`).
- Abrir el link **en el celular**, no en la compu del club. «Mandar el código por WhatsApp» abre WhatsApp para
  elegir el chat (el celular no tiene el número del club guardado): elegí el de recepción.
- Para pasar al aprobador del ERP (cuando se deje el club de hoy) se borra la línea de `breakpoint` en
  `aprobador-externo.ts`, se suma el negocio a `NEGOCIOS_CON_APROBADOR_REAL` y el dueño entra logueado al ERP en el
  celular.

---

## 6. Límites del trial en el plan gratis

### Neon (la base) — plan Free

- Una sola base para **todos** los negocios: CH Estética (el único vivo en producción), Magra, Shine, A Dos Manos,
  Break Point. Los límites del plan gratis se reparten entre todos (`docs/ANALISIS-COSTOS-INFRA.md:62-76`, a
  verificar contra el plan vigente en neon.com/pricing): **0,5 GB** de almacenamiento, **100 horas de cómputo
  (CU-h) por mes** y 5 GB de transferencia.
- **Si se pasa cualquiera de los tres, Neon suspende la base hasta el mes siguiente: se cae el ERP de TODOS los
  negocios, CH incluida.** No avisa bajando la velocidad: corta.
- El club no consulta la base todo el tiempo: guarda 30 s después del último cambio, con un tope de 2 minutos
  (`guardado-en-la-base.ts:17-22`). Pero con movimiento la base queda despierta, y la cuenta de peor caso es
  **club abierto 14 h por día ≈ 105 CU-h por mes** (`docs/producto/MODO-SIN-INTERNET-CLUB.md:199-201`): **solo
  Break Point podría pasarse del plan gratis en un mes de mucho uso.**
- **Qué mirar:** Neon Console → el proyecto → **Usage / Monitoring**: «Compute (CU-hours)» contra 100 y
  «Storage» contra 0,5 GB. Mirarlo **todos los días la primera semana** y después una vez por semana.
- **Cuándo pasar a pago (decisión del dueño, es gasto):** si a los 7 días del mes el cómputo va por encima de
  **~23 CU-h** (100 ÷ 30 × 7), o si en cualquier momento pasa las **80 CU-h**, o el almacenamiento pasa los
  **0,4 GB**. El paso es a Launch (se paga por uso: ~US$ 0,106 por CU-h según el mismo análisis). Sin pasar a pago,
  la alternativa es volver al club de hoy hasta la venta (§4, «volver al club de hoy»).

### Vercel — plan Hobby

- El plan Hobby es **para uso no comercial**. Mientras a Break Point no se le cobra, el trial entra en esa regla.
- **Al cobrarle al primer cliente, el paso a Pro (US$ 20 por mes) es obligatorio por los términos de Vercel**, no
  por volumen (`docs/producto/costos-pricing-suite.md:8`).

### Al venderlo

Cuando Break Point compre (OK comercial del cliente), se sube el plan: **Vercel Pro** y **Neon pago** (Launch), y
recién ahí se habla de dominio propio (ciclo DEMO → VENTA → INVERSIÓN). Las credenciales de esa etapa las carga
siempre el dueño.

---

## 7. Lo que tiene que hacer el dueño (resumen)

1. Dar el OK al deploy de esta rama y la de terminales («deployá»).
2. Asignar el módulo: correr `asignar-modulo-club.ts --slug breakpoint` (mirar) y después con `--apply`, con su
   `DATABASE_URL` (o cargarla como secreto y avisarnos).
3. Crear los usuarios en `/admin/usuarios` (un Dueño/a, un Recepción como mínimo) y pegar él las contraseñas.
4. El día del pase: cerrar caja y bajar el respaldo en el club de hoy → restaurarlo en el ERP desde el puesto del
   dueño → verificar la caja → recepción entra con su PIN.
5. Mirar el consumo de Neon la primera semana y decidir el paso a pago si se acerca al límite.

— Elaborado por GSG
