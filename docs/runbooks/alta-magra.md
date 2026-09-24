# Runbook — Abrir un local de MAGRA (alta de tenant, paso a paso)

> **Para qué sirve:** abrir los **5 locales de Magra**. Cada local es **un tenant propio**
> (decisión de arquitectura vigente: no hay modelo de sucursal y no se construye ahora),
> así que este runbook se corre **5 veces**, una por local, más **un** paso final de ruteo
> que se hace **una sola vez con las 5 entradas juntas** (Paso 8 — leelo antes de empezar).
>
> **Dos configuraciones, el mismo alta.** **A — locales sueltos:** cada local es un negocio y
> nada más (lo que describe este runbook del Paso 1 al 9). **B — la casa con sus locales:** los
> mismos negocios, más una **casa** que ve las ventas, las cajas y el stock de todos ("Mis
> locales"). Pasar de A a B es **vincular** desde la consola; volver es **dar de baja** el
> vínculo. No se mueve ningún dato. B se arma DESPUÉS del alta: ver
> [Configuración B](#configuración-b--la-casa-con-sus-locales-mis-locales).
>
> **Tiempo:** ~10 min por local en la consola + ~10 min el paso de ruteo + 1 deploy
> (+ ~5 min la configuración B, sin deploy).

---

## Lo primero: cuál es el camino REAL (y cuál ya no existe)

Hasta esta revisión, este runbook y otros cuatro documentos mandaban usar
**`provisionFromConsole`**. Eso ya no es el alta: es un Server Action **sin un solo
llamador**, y lo dice su propio código —

`src/lib/operator-actions.ts:74` (la función) y `src/lib/operator-actions.ts:139-142`:

> *"Esta acción es LEGACY y ya no tiene llamadores: la superó el wizard, que entrega la
> clave fuera de la URL."*

Verificalo vos antes de confiar en este documento:

```bash
grep -rn "provisionFromConsole" --include=*.ts --include=*.tsx src/ scripts/
# única aparición en código: su propia definición en src/lib/operator-actions.ts:74
```

**La cadena que SÍ corre hoy**, verificada eslabón por eslabón:

| # | Pieza | Archivo:línea |
|---|---|---|
| 1 | Pantalla `/operador/alta` (server component: arma el catálogo) | `src/app/operador/(console)/alta/page.tsx:15` |
| 2 | `AltaWizard` (5 pasos, cliente) llama al commit | `src/app/operador/(console)/alta/WizardClient.tsx:128` |
| 3 | `commitTenantAction` (Server Action, `requireOperator` + auditoría) | `src/lib/operator-provisioning-actions.ts:49` |
| 4 | `runTenantProvisioning` (la saga: DB → host → invitación) | `src/lib/provisioning/provision.ts:33` |
| 5 | `adr019Committer` → `provisionTenant` (el único paso transaccional) | `src/lib/provisioning/adapters.ts:88` → `scripts/provision-tenant.ts` |

```bash
grep -rn "commitTenantAction\|runTenantProvisioning" --include=*.ts --include=*.tsx src/ | grep -v test
```

---

## Lo que el alta NO hace (y por eso hay pasos manuales acá)

Dos de los cinco estados de la saga son **no-ops**. `runtime.ts:46-47` inyecta
`NoopHostBinder` y `NoopInviter` (`src/lib/provisioning/stubs.ts:46-69`): registran la
llamada en un array y devuelven ok.

- **El link NO queda ligado.** Escribir el subdominio en el wizard guarda
  `Tenant.subdomain` en la base, pero **no toca Vercel ni el DNS**. El ruteo se hace a
  mano en el **Paso 8**.
- **Al dueño NO le llega ningún mail.** La contraseña de bootstrap se muestra **una vez
  en pantalla** al terminar el alta (`BootstrapReveal`, fuera de la URL) y se la entregás
  vos por un canal seguro (**Paso 7**).

El stepper del wizard ya los rotula *"pendiente — manual"*
(`WizardClient.tsx:37-55`); antes los pintaba en verde y el operador se iba convencido de
que el dominio estaba apuntado y el mail enviado. No pasaba ninguna de las dos.

---

## Antes de empezar (una sola vez, para los 5 locales)

- [ ] **Acceso a `/operador`** — es una consola aparte, con su propia cookie: **no** es
  `/admin`. Login con `OPERATOR_PASSWORD` (`src/lib/operator-actions.ts:39-63`, con
  rate-limit de 5 fallos / 15 min por IP).
- [ ] **RLS activo.** Es la condición dura: `provisionTenant` aborta el alta de cualquier
  tenant nuevo si ya hay ≥1 tenant y RLS no está encendido
  (`scripts/provision-tenant.ts:191-202`, gate ADR-018). Hoy está enforced en producción
  (rol `app_rls` NOBYPASSRLS, `RLS_ENFORCEMENT=on`), así que el gate pasa. Se comprueba:
  ```bash
  RLS_AUDIT_DATABASE_URL="$PROD_URL" node prisma/rls/check-rls-live.mjs
  ```
- [ ] **Los 5 emails reales de los dueños/encargados.** Uno por local; el email es la
  identidad del OWNER y **no se puede repetir dentro del mismo tenant**, pero sí puede
  repetirse entre tenants distintos (la unicidad es `(tenantId, email)`).
- [ ] **Los 5 slugs decididos de antemano**, en el formato de familia. Ver el cuadro de
  abajo — es la decisión que más cara sale si se improvisa.
- [ ] **No hace falta ninguna migración de schema** para dar de alta un local. El alta
  usa columnas que ya existen.

### Los slugs: elegilos con el prefijo `magra-`

`getCurrentTenantRubro()` (`src/lib/carniceria/rubro.ts:26-37`) resuelve el rubro así:
**primero `Tenant.blueprintId`**, y sólo si ahí no hay nada útil cae al mapa por slug.
Ese mapa de respaldo entiende **familias**: `tenantFamilySlug` parte el slug por el primer
guion, así que `magra-lomas` → familia `magra` → rubro `carniceria`
(`src/blueprints/retail/rubros.ts:466-482, 496-516`).

O sea: si en el Paso 3 elegís bien el rubro, el slug no decide nada. Pero si algún día un
local queda sin `blueprintId` (re-provisioning, script, import), el prefijo `magra-` es la
red que evita que ese local abra el sistema y vea la **agenda de un spa**. Cuesta cero
ponerlo.

| Local | slug sugerido | subdomain sugerido | host sugerido |
|---|---|---|---|
| 1 | `magra` *(el que ya existe)* | `magra` | `magra-erp.vercel.app` |
| 2 | `magra-<localidad>` | `magra-<localidad>` | `magra-<localidad>-erp.vercel.app` |
| 3 | `magra-<localidad>` | … | … |
| 4 | `magra-<localidad>` | … | … |
| 5 | `magra-<localidad>` | … | … |

*Las localidades concretas son dato de negocio — **provisional a confirmar** con el dueño
antes de la primera alta. Lo que no es provisional es el formato.*

---

# El alta, paso por paso (repetir del 1 al 7 por cada local)

## Paso 1 — Entrar a la consola de operador

`https://<host-de-producción>/operador` → login → **"+ Alta de tenant"**
(`/operador/alta`).

La pantalla avisa **antes** de crear si el que viene es el 2º tenant y el gate de RLS lo
frenaría (`alta/page.tsx:37-39`) — no te enterás por un error después del submit.

## Paso 2 — Wizard, pantalla 1 de 5: **Negocio**

Campos: `name`, `slug`, `ownerName`, `ownerEmail` (`WizardClient.tsx:35`, paso `Negocio`).

- El **slug se auto-sugiere** desde el nombre (`suggestSlug`,
  `src/lib/provisioning/slug.ts:35`) pero **no se auto-corrige en silencio**: si escribís
  algo que no es kebab-case, el plan lo marca como colisión `slug-invalid` y no te deja
  avanzar. Es a propósito (ADR-019): mejor frenar que terminar con dos slugs casi iguales.
- Cada tecla dispara el **dry-run** (`planTenantAction`,
  `src/lib/operator-provisioning-actions.ts:32`): **no escribe nada** y te devuelve en vivo
  si el slug o el email ya están tomados (`src/lib/provisioning/dry-run.ts:35-57`).

## Paso 3 — Pantalla 2 de 5: **Rubro** ← el paso que decide todo

**Elegí `carniceria`** (familia Retail / Mostrador, `src/blueprints/retail/rubros.ts:64`).

Este paso es **obligatorio**: el wizard no deja avanzar sin rubro ni blueprint explícito
(`WizardClient.tsx:118-121`), justamente para que ningún local caiga al blueprint genérico.

Lo que se juega acá:

- `Tenant.blueprintId = "carniceria"` → `isRetail = true` → el local ve el **home de
  mostrador**, el catálogo de **cortes**, Lotes y Despiece, y la vidriera `/tienda` en vez
  de la landing de estética.
- **El rubro es el eje de gating que se usa en este sistema.** No hay que prender ningún
  flag para que esto funcione. En particular **NO prendas `MODULE_REGISTRY_ENABLED`**: con
  ese flag en on, el menú del backoffice se arma sólo con `Tenant.modules[]`, y `beauty-spa`
  —el único tenant vivo en producción— tiene `modules = {}`, así que **se quedaría sin
  menú**. El flag es global, no por tenant.

La **Edición** queda fija en "Comercio" y sin selector a propósito: el alta la acepta pero
no la persiste (`WizardClient.tsx:58-62`, `adapters.ts:110-115`), y ofrecer "Empresa" en
pantalla para entregar un "Comercio" es mentirle al operador.

## Paso 4 — Pantalla 3 de 5: **Módulos** (mirar, no tocar)

Es un **preview de sólo lectura**: los módulos los deriva el motor del rubro elegido
(`modulosBaseParaAlta`, `src/lib/provisioning/adapters.ts:65-69`), no hay checkboxes.
Revisá que la lista tenga sentido para una carnicería y seguí.

Si después hace falta cambiar los módulos de un local, **no es en el alta**: se hace desde
la **consola de operador**, no desde el panel del dueño. Ver "Después del alta".

## Paso 5 — Pantalla 4 de 5: **Marca + link + datos del local**

- **`subdomain`** → escribí el del cuadro de slugs. Se guarda en `Tenant.subdomain` (único
  en toda la base) y el dry-run te avisa en vivo si choca (`host-taken`). **Guardalo
  anotado: lo vas a necesitar en el Paso 8.** Repito lo de arriba: escribirlo acá **no liga
  el dominio**.
- **Acento y tema**: si los dejás vacíos, caen al sugerido del rubro.
- **Datos del local** (dirección, ciudad, WhatsApp, horarios, Instagram, Maps): van a
  `BusinessSettings`. Para 5 locales de la misma marca, **lo único que cambia de verdad es
  dirección + WhatsApp + horarios**; el resto se repite.

## Paso 6 — Pantalla 5 de 5: **Revisar** → Confirmar

El botón de commit **sólo se habilita con el plan sin colisiones**
(`WizardClient.tsx:123`). Al confirmar corre `commitTenantAction`, que:

1. Re-mapea y **re-valida el input del lado servidor** (no se confía en el cliente) y
   vuelve a correr el dry-run dentro del commit.
2. Crea, en **una transacción**: `Tenant` + usuario **OWNER** (password scrypt) +
   `BusinessSettings` + el catálogo mínimo del blueprint.
3. Escribe una fila en `AuditLog` colgada del tenant nuevo
   (`operator-provisioning-actions.ts:81-107`), consultable desde su ficha.

**Es idempotente por partida doble.** Si hacés doble clic o reintentás tras un timeout:
la clave `console:<slug>` devuelve el outcome cacheado sin re-ejecutar
(`src/lib/provisioning/console-input.ts:69`), y aunque se pierda esa caché, el core es
idempotente por slug y **no crea una segunda fila**. No vas a duplicar un local por
insistir.

⚠️ **Límite conocido de la idempotencia:** el store es **en memoria, por proceso**
(`src/lib/provisioning/runtime.ts:9-29`). Sobrevive entre requests del mismo server y se
pierde al reiniciar. Alcanza para el doble-submit; **no** sirve para reanudar un alta a
medias entre dos procesos. La persistencia real es una tabla nueva = migración = decisión
del dueño.

**Si el commit falla:** el mensaje se muestra tal cual, no se esconde. El fallo más común
a esta altura es el **gate de RLS**; el texto empieza con `GATE ADR-018 — ALTA ABORTADA` y
termina con *"Este tenant NO fue creado"*.

## Paso 7 — Entregar la contraseña de bootstrap (manual, **ahora o nunca**)

La pantalla final muestra la contraseña del OWNER **una sola vez**. No viaja por la URL (lo
hacía: quedaba en el historial del navegador, en los access-logs y en cualquier proxy) y
**no se le envía al dueño por mail**, porque el inviter es un no-op.

- Copiala y entregala por un canal seguro.
- Si se perdió: no se recupera. Se resetea desde la ficha del tenant en `/operador`.

## Paso 7-bis — Repetir del 1 al 7 para el local siguiente

Cuando tengas **los 5 creados y los 5 subdominios anotados**, recién ahí va el Paso 8.

---

## Paso 8 — Ruteo: las 5 entradas de `TENANT_HOST_MAP`, **en UNA sola edición**

> **Este es el paso que puede dejar locales caídos, incluida `beauty-spa`.** Leelo entero
> antes de abrir Vercel.

`TENANT_HOST_MAP` **no** es una variable por tenant: es **UNA sola variable de texto**
concatenada con `;`, mapeando `hostname=subdomain`
(`.env.vercel.template:37-41`, parser en `src/lib/tenant.ts:73-85`).

**Por qué importa el "una sola edición":** el parser **descarta en silencio** cualquier
entrada malformada (`src/lib/tenant.ts:80` — `if (eq <= 0) continue;`). No hay error de
arranque, no hay warning. La entrada simplemente no existe, y el tenant afectado se cae
**recién cuando alguien entra**, con uno de estos dos throws:

| Qué pasó | Dónde revienta | Mensaje |
|---|---|---|
| **Se perdió** una entrada (o quedó malformada) | `src/lib/tenant.ts:150-154` | *"hay más de un tenant y el request no trae subdominio para resolver"* |
| La entrada está, pero apunta a un `subdomain` que ningún tenant tiene | `src/lib/tenant.ts:130-135` | *"no hay tenant para el subdominio «X» (vía TENANT_HOST_MAP)"* |

Los dos son **fail-closed a propósito** (ADR-015): antes de servirle a un local el dato de
otro, la app se niega a responder. Eso está bien y no se "arregla" aflojando el throw.

### Procedimiento

1. **Agregar los 5 dominios en Vercel → Settings → Domains** (Hobby permite hasta 50
   `.vercel.app` gratis). Uno por local.
2. **Copiar el valor ACTUAL de `TENANT_HOST_MAP`** a un editor de texto. No lo edites
   dentro del cuadrito de Vercel.
3. **Pegar las 5 entradas nuevas al final, separadas por `;`**, sin tocar las que ya
   estaban. El valor queda de la forma:
   ```
   chestetica-erp.vercel.app=chestetica;magra-erp.vercel.app=magra;shinevelas-erp.vercel.app=shinevelas;adosmanos-erp.vercel.app=adosmanos;magra-<loc2>-erp.vercel.app=magra-<loc2>;…
   ```
4. **Contar antes de guardar.** El valor nuevo tiene que tener **exactamente las entradas
   viejas + 5**:
   ```bash
   # pegá el valor entre comillas: tiene que imprimir el total esperado
   echo "<valor nuevo>" | tr ';' '\n' | grep -c '='
   ```
   Y que **ninguna** de las viejas se haya caído:
   ```bash
   echo "<valor nuevo>" | tr ';' '\n' | grep -c 'chestetica-erp.vercel.app=chestetica'   # → 1
   ```
5. **Guardar y redeployar.** La variable se lee en runtime, pero Vercel necesita un deploy
   para propagarla al ambiente.
6. **Verificar los 5 locales + `beauty-spa`**, uno por uno, abriendo cada host y entrando
   a `/admin`. Que cargue la home no alcanza: confirmá que el **nombre del negocio** en
   pantalla es el del local correcto.

> **El lado izquierdo es el hostname; el derecho es el `Tenant.subdomain`, no el slug.**
> Suelen coincidir porque los elegimos iguales, pero la columna que el código consulta es
> `subdomain` (`src/lib/tenant.ts:125-129`). Si no coinciden, gana `subdomain`.

> **`APP_BASE_DOMAIN` sigue vacío.** Es la otra vía de ruteo (subdominio de un dominio
> propio) y es **excluyente en la práctica** mientras estemos en `.vercel.app`: ponerle
> `vercel.app` haría que `magra-erp` se trate como subdominio y rompería todo
> (`.env.vercel.template:43-46`). El día que haya dominio de marca, se migra a esa vía y
> `TENANT_HOST_MAP` puede vaciarse.

---

## Paso 9 — Prender "Trabaja por apps" en la ficha del negocio (antes: `APPS_INICIO`)

> **Cambió en la tanda 2b (2026-09-24).** La variable de deploy `APPS_INICIO` se retiró: el código
> ya no la lee (`src/modules/flags.ts` deja la nota). El Inicio por apps se prende **negocio por
> negocio desde la consola, sin deploy**, con el interruptor "Trabaja por apps". No hay que tocar
> Vercel para esto.

Vale para **cualquier** negocio que entre al Inicio por apps: `magra`, cada local nuevo y la
casa de la configuración B. Con el interruptor prendido, el negocio ve **sólo las apps de los
módulos que tiene asignados**, no su menú de siempre.

1. `/operador` → ficha del negocio → tarjeta **"Apps del negocio"** → **"Fijar asignación
   actual"**. La vista previa dice qué apps ganaría o perdería; confirmar cuando diga que **no
   pierde ninguna** app de su menú de siempre.
2. Misma ficha, tarjeta **"Trabaja por apps"** → **Prender**. El botón sólo se habilita con
   **0 apps perdidas**, y el servidor lo vuelve a verificar con la base fresca: si perdería
   alguna, rechaza aunque el botón se haya salteado.
3. La próxima vez que entren a su panel ven el Inicio por apps. Queda en el historial de la
   tarjeta con el nombre del operador y la hora, y en la Auditoría del negocio como
   «GSG activó el Inicio por apps».

**Por qué "Fijar" va primero (medido en la vista previa de la consola, ola 1):** con la
asignación que tenía, `magra` con el Inicio por apps **perdía "Campañas" y "Facturación
automática"** (y las de stock si le falta `inventario`). "Fijar" suma los módulos mínimos para
que vea exactamente su menú de siempre.

**Vuelta atrás:** **Apagar** en la misma tarjeta lo devuelve a su menú de siempre en la
próxima carga, sin tocar datos ni hacer deploy. Mientras está prendido, la consola **no deja
apagar un módulo que le saque apps que ve**: primero se apaga "Trabaja por apps".

**CH (`beauty-spa`)**: sólo lo puede prender o apagar el operador dueño de GSG, escribiendo el
slug. Nadie más, aunque tenga acceso a la consola.

---

## Después del alta: lo que NO se toca desde el panel del dueño

- **`status` y `plan`.** El wizard **no los pide** y el committer **no los manda**
  (`adapters.ts:110-115`): todo local nace `status = TRIAL` y `plan = null` (defaults del
  schema, `prisma/schema.prisma:222-223`). Se cambian desde la **ficha del tenant** en
  `/operador` (`setTenantStatus` / `setTenantPlan`, `src/lib/operator-actions.ts`).
- **Los módulos.** `modules:manage` **no es una capacidad del dueño**, y no es un olvido:
  está excluida en el tipo, con el motivo escrito
  (`src/lib/capabilities.ts:71-82`) — aprovisionar módulos es decidir qué producto compró
  el cliente, y eso vive del lado del proveedor. La pantalla `/admin/modulos` y su ítem de
  menú, que nadie podía abrir, se borraron en la tanda 2b: los módulos se asignan sólo desde
  la ficha del negocio en `/operador`.
- **El subdominio** se puede corregir desde la ficha (`setTenantSubdomain`), pero **acordate
  de actualizar también `TENANT_HOST_MAP`**: son dos lugares, y el código no los sincroniza.

---

# Configuración B — la casa con sus locales ("Mis locales")

La dueña de MAGRA ve en **un tablero** lo cobrado hoy en cada local, qué caja quedó sin cerrar,
el stock de cada corte en cada local y las ventas por local con el archivo para la contadora
(`/admin/locales`, `/admin/locales/ventas`, `/admin/locales/cajas`, `/admin/locales/stock`).
Cada local sigue siendo su propio negocio, con su caja, su stock y sus usuarios. Lo único nuevo
es el **vínculo** casa → local, que sólo escribe GSG desde la consola.

**Cómo está hecho (para saber qué se toca):** el vínculo es una fila de `CarteraCliente`
(la misma tabla de la cartera del contador; los dos módulos se excluyen entre sí) con
`tenantId` = casa y `clienteTenantId` = local, escrita por `vincularLocalAction`
(`src/lib/operador/red-locales-actions.ts` → `vincularEnTx`, `src/lib/multilocal/multilocal-core.ts`).
La casa lee cada local en **su propia transacción, con el GUC del local**, y los ids salen
**sólo** de sus filas (`recorrerLocales`). Las pantallas exigen el módulo `multilocal` leído de
la base en cada página y en cada action (`exigirCasa`, `src/lib/multilocal/casa.server.ts`).

## B0 — Precondición: RLS de `CarteraCliente` en Neon (lo corre el operador)

```bash
npm run medir:neon      # la sección "CarteraCliente" tiene que decir rls_activa = t
```

Si dice `f` (o la tabla no está), **B no se arma en producción**: el vínculo quedaría
protegido por una sola capa. Volver a aplicar RLS (`prisma/rls/0001_enable_rls.sql`) es una
ventana con **autorización del dueño**. Sin la migración, la tarjeta "Red de locales" de la
ficha lo dice y no deja vincular.

## B1 — Qué negocio es la casa *(provisional a confirmar por el dueño con el cliente)*

- Si `magra` **todavía no vendió** como local: `magra` es la casa y el obrador (ya tiene el
  catálogo) y los locales son `magra-<localidad>`.
- Si `magra` **ya vendió** como local: se da de alta `magra-casa` (Pasos 1 a 7) y ésa es la casa.

La casa **no puede** ser un estudio contable (módulo Cartera) ni local de otra red; un local no
puede estar en dos redes ni ser casa de otra. La consola lo rechaza con el motivo.

## B2 — Fijar la asignación de la casa ANTES de sumarla al Inicio por apps (obligatorio)

Es el [Paso 9](#paso-9--prender-trabaja-por-apps-en-la-ficha-del-negocio-antes-apps_inicio)
aplicado a la casa: en su ficha (`/operador/tenants/<id>`), tarjeta **"Apps del negocio"** →
**"Fijar asignación actual"**. Recién después se prende **"Trabaja por apps"** en la misma ficha.

La casa **tiene que trabajar por apps**: las apps de Mis locales se ofrecen en el Inicio
por apps (sección "Mis locales") y en el buscador (Ctrl/⌘K). La barra lateral sigue siendo la de
siempre y no las lista; con el interruptor apagado sólo se llega tecleando `/admin/locales`.

**Por qué es obligatorio (medido en la vista previa de la consola, ola 1):** con la asignación
que tenía, `magra` con el Inicio por apps **perdía "Campañas" y "Facturación
automática"** (y las de stock si le falta `inventario`). "Fijar" suma los módulos mínimos para
que vea exactamente su menú de siempre. La tarjeta muestra, antes de confirmar, qué apps ganaría
o perdería.

## B3 — Activar "Mis locales" en la casa

Misma tarjeta → módulo **"Mis locales"** → vista previa (suma Mis locales, Ventas por local,
Cajas de los locales y, en un mostrador, Stock por local) → confirmar. Queda en la auditoría de
la casa (`module.activate`).

- Estas cuatro apps exigen el módulo **siempre**, aun con "Trabaja por apps" apagado: un negocio sin
  `multilocal` (CH, cualquier local suelto) no las abre ni tecleando la URL ("App no disponible").
- **No se apaga "Mis locales" con locales vinculados**: primero se dan de baja (B6). Y no se
  prende en un negocio que tenga vínculos de una cartera del contador. La vista previa lo
  rechaza con el motivo y no ofrece confirmar, y el confirmar del servidor
  (`toggleTenantModule`, src/lib/operator-actions.ts) vuelve a leer los vínculos con la base
  fresca y toma el candado de las apps del negocio (el mismo que "Trabaja por apps"): dos
  operadores sobre la misma casa se esperan en vez de pisarse.

## B4 — Vincular cada local

Ficha de la casa → tarjeta **"Red de locales"** → elegir el local → alias opcional ("Canning")
→ **Vincular local**. Repetir por cada local. Cada vínculo deja auditoría en **la casa**
(`multilocal.vincular`) y en **el local** (`multilocal.vinculado`), en la misma transacción que
la fila: o quedan las tres cosas o ninguna. Si el local tiene otro CUIT que la casa, avisa (las
ventas se ven igual; los traslados, cuando lleguen, van sólo entre locales del mismo CUIT).

Cada local sigue con **su punto de venta propio**: el candado de la consola rechaza repetir
CUIT + punto de venta entre negocios (Paso de ARCA de la ficha).

## B5 — Verificar (recorrido, no "carga la pantalla")

1. Entrar al host de la casa con el OWNER → Inicio → sección **"Mis locales"** con sus números
   ("3 locales · 1 con la caja sin cerrar", "$X cobrado hoy"). Es lo **cobrado**, no lo vendido:
   los cobros que entraron hoy a la caja menos lo anulado hoy (una anulación de hoy de una venta
   de ayer resta hoy, igual que en la caja del local).
2. `/admin/locales`: una tarjeta por local. **"Su caja, como la ve el local"** tiene que dar
   las mismas cifras que `/admin/caja` de ese local (entrando con el usuario del local, en su
   host). Si no coinciden, parar: uno de los dos miente.
3. `/admin/locales/ventas` → **Descargar para la contadora**: el CSV trae el resumen por local,
   el consolidado por CUIT (si comparten) y el detalle por día y medio.
4. `/admin/locales/ventas?local=<id de un negocio que NO es de la red>` → "Ese local no es de tu
   red" y nada de ese negocio.
5. En CH (o cualquier negocio sin el módulo), `/admin/locales` → "App no disponible".

## B6 — Dar de baja un local

Ficha de la casa → "Red de locales" → **Dar de baja** en ese local. La casa deja de verlo en el
acto; no se borra nada (la fila queda en `baja` con su historia) y queda auditado en los dos.
Se puede volver a vincular cuando se quiera.

## Lo que se le dice al cliente de B (límites de esta versión)

- **Un login por local:** los usuarios son por negocio. La dueña entra a la casa con su usuario
  y a cada local con el del local (el botón "Abrir su caja" lleva al host del local).
- Un OWNER de local puede cambiar sus precios; la lista única de la marca y el empuje a los
  locales llegan en la ola 3 (y ahí se ve como divergencia, no se bloquea).
- Los productos se cruzan **por nombre** (sin acentos ni mayúsculas) y unidad de venta: un
  renombre en un local aparece como otra fila en Stock por local.
- Todavía no hay traslados entre locales (ola 3), ni recepción con diferencia, ni remito.
  COT / remito cárnico: **provisional, a confirmar con la contadora de MAGRA**.
- Rendimiento: cada pantalla lee los locales uno por uno. Medido en Postgres local: ~17 ms por
  local. Contra Neon **no está medido**; con ~5 a 9 locales es razonable, con 30 o más hace falta
  otra cosa.

## Qué NO está medido (y con qué comando se cierra)

Honestidad sobre los límites de este documento:

- **El valor real de `TENANT_HOST_MAP` en producción.** Este runbook usa el ejemplo de
  `.env.vercel.template:40`. Antes del Paso 8, leé el valor real:
  `vercel env pull` (o Vercel → Settings → Environment Variables → Production).
- **Qué migraciones están aplicadas en Neon.** El alta no necesita ninguna, pero el árbol
  tiene migraciones escritas y sin aplicar. Se cierra con
  `npx prisma migrate status` contra la base de producción (solo lectura).
  Aplicarlas es `prisma migrate deploy` —**nunca `migrate dev`**, falla contra el pooler—
  y requiere autorización explícita del dueño.
- **Qué flags están seteados en producción.** Todo el análisis de esta tanda asume el
  **default OFF** de los parsers (`src/modules/flags.ts`). Documentados en
  `.env.vercel.template`; el valor real se confirma con el mismo `vercel env pull`.

---

## Historia (por qué este runbook cambió tanto)

La versión anterior era el plan de **activación de RLS + alta del 2º tenant** (julio 2026),
escrita cuando producción tenía **un** tenant, la app estaba en **Netlify** y RLS todavía no
estaba aplicado. Todo eso ya pasó: RLS está enforced con `app_rls`, el deploy es Vercel, y
el ruteo se resolvió con `TENANT_HOST_MAP` en vez de dominio propio + wildcard.

Lo que sigue vivo de aquel plan y **no** se repite acá porque no es parte de un alta:

- El procedimiento de RLS: `prisma/rls/README.md` (`0001_enable_rls.sql`,
  `0002_app_role.sql`, `check-rls-live.mjs`, `verify-rls.mjs`).
- El gate ADR-018, que sigue vivo en `scripts/provision-tenant.ts:191-202` y es lo que hace
  **imposible** crear un tenant nuevo sin aislamiento.

`FORCE_TENANT_SLUG` (la "Opción A" de aquel plan, un sitio por tenant) **no se usa y no se
debe usar**: hoy es la única variable que colapsa el aislamiento, tiene un portero que tira
si aparece en un deploy productivo con más de un tenant (`src/lib/tenant.ts:170-199`), y
`.env.vercel.template:72-74` la marca como **NO SETEAR**.
