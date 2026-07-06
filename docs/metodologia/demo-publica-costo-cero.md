# 🎬 Playbook — Demo pública a COSTO CERO (una URL viva por negocio)

**Qué es:** el método probado para tener, en el día, **una demo pública y navegable de cada negocio**
—cada uno con **su propia URL**— **sin gastar un peso**: sin dominio propio, sin plan pago de base de
datos ni de hosting. Sale de ejecutarlo de verdad (CH, Magra, Shine Velas, A Dos Manos sobre un solo
proyecto de Vercel).

**Cuándo usarlo:** preventa, mostrarle a un cliente "así se ve TU negocio", validar un rubro nuevo,
compartir un link vivo por WhatsApp. **No** es el go-live productivo con dominio propio (eso es el
runbook `docs/runbooks/deploy-vercel.md`, del que este playbook es el "modo demo").

> **🔒 PASO OBLIGATORIO DEL SPRINT (no opcional).** Toda demo pública del ERP se **genera y publica
> siguiendo este método** — no se improvisa un deploy ni un ruteo por fuera. Si un frente necesita
> mostrar una demo pública, este es el camino. (Registrado en `docs/METODOLOGIA-SPRINT.md` y en
> `.claude/commands/sprint.md`.)

**Regla de oro transversal:** *el agente/operador nunca toca secretos ni la cuenta del dueño.* El
operador prepara todo lo del repo y las variables NO secretas; el dueño pega los secretos y hace los
clics en su cuenta. Ver el reparto en el paso 4.

---

## ⚠️ CONCEPTO CORREGIDO (reemplaza el de `/previews` estáticos)

**El entregable de un negocio es el PRODUCTO REAL (front + backoffice) servido en su URL con nombre de
cliente — NO una página estática.** Distinción dura, vigente:

- **CLIENTES CONSOLIDADOS** (reales: **A Dos Manos · CH Estética · Magra · Shine**) = **producto REAL**
  (front + backoffice, multi-tenant + RLS, **datos reales — FASE 2**) servido en `<cliente>-erp.vercel.app`.
  **NO llevan preview estático.** Son clientes, no maquetas.
- **DEMO / prospectos** (ej. **Break Point**) = **front + back que SALEN DEL FLUJO** (Generador de Preset /
  Adaptador), servidos en una **URL con nombre del cliente solo para la demo** (**sin datos reales —
  FASE 1**). El "demo" es **la app real en modo demo**, no una lámina.
- **`public/previews/*` estáticos → DEPRECADOS** para los consolidados. Fueron un *stopgap*; se **retiran**
  a medida que el producto real sirve la URL. Para prospectos pueden sobrevivir como **demo interina**
  hasta que exista el front+back del flujo. Plan de reconversión y estado por cliente:
  **`docs/PLAN-RECONVERSION-CLIENTES.md`**.

> **En una línea:** *consolidado = producto real en su URL (sin preview estático); demo = la app del flujo
> en modo demo, en una URL de cliente.* La lámina estática **deja de ser el entregable**; el resto de este
> playbook (multi-tenant, `TENANT_HOST_MAP`, dos fases de credenciales) sigue vigente tal cual.

---

## 🔑 FUNDAMENTO — credenciales en DOS FASES (la regla que ordena todo)

El secreto se introduce **lo más tarde posible**, y **solo cuando hay algo real que proteger**. Por eso
el flujo tiene dos fases nítidas, y **no se mezclan**:

### FASE 1 — DEMO / PÚBLICA (sin datos reales) → **CERO credenciales**
- **Qué se muestra:** el `/demo` (`force-static`, público) y/o vistas de catálogo de ejemplo. **No toca
  la base, no tiene login, no maneja datos de ningún cliente real.**
- **Credenciales:** **NINGUNA.** Ni `DATABASE_URL`, ni contraseñas de admin/operador, ni secretos.
- **Por qué:** **cero fricción, cero bloqueos.** El objetivo es tener el primer link vivo y mostrarlo al
  cliente **ya**, sin esperar a que nadie consiga o pegue una llave. Como no hay datos reales, no hay
  nada que proteger → pedir secretos acá solo trabaría el proceso sin ganar seguridad.

### FASE 2 — DATOS REALES (operación real de un tenant) → **recién ahí las credenciales**
- **Qué cambia:** el negocio va a **operar de verdad** (login real, cargar/leer datos de sus clientes,
  cobrar). Ahí sí entra en juego información sensible.
- **Credenciales:** **ahora** se cargan la **llave de la base (`DATABASE_URL`)** y las **contraseñas de
  admin/operador** (`OPERATOR_PASSWORD`, `AUTH_SECRET`, `OPERATOR_SECRET`, `OPERATOR_DATABASE_URL`…), con
  **RLS enforced** para aislar los datos reales entre tenants.
- **Quién las pega:** **SIEMPRE el dueño**, en su propia cuenta (Vercel/`.env`). **Nunca el agente.** El
  agente/operador solo carga lo **no secreto** (`RLS_ENFORCEMENT=on`, `TENANT_HOST_MAP`) y deja la
  **plantilla** (`.env.vercel.template`, nombres sin valores).
- **Por qué:** apenas hay **datos reales de clientes**, hay una **responsabilidad de custodia**. La llave
  de esos datos es del dueño y solo él la maneja — así el secreto nunca pasa por el chat, por el repo, ni
  por manos del agente. Menos manos que tocan el secreto = menos superficie de fuga.

> **En una línea:** *sin datos reales → sin secretos (para no trabar); con datos reales → secretos, y los
> pega el dueño (para proteger).* Nunca al revés: no se piden credenciales para una demo estática, ni se
> operan datos reales sin ellas.

---

## Por qué este método (los 3 principios)

1. **Una sola base, muchos negocios (multi-tenant + RLS).** Cada negocio es un *tenant* en la MISMA
   base. No levantamos una base ni una app por cliente → **no se multiplican los costos** ni el
   mantenimiento. El aislamiento entre negocios lo garantiza **RLS** (Row-Level Security) a nivel
   Postgres, no "la buena voluntad del código".
2. **Un solo deploy, muchas URLs gratis.** Un proyecto de Vercel sirve a TODOS los tenants. A cada uno
   le colgamos una URL `.vercel.app` gratis. **No fragmentamos** (un proyecto por cliente sería un
   quilombo de deploys y variables) ni pagamos dominios.
3. **Costo cero real.** Neon (base) en plan free + Vercel Hobby (hosting) + cron **diario** (no horario,
   que en Hobby rompe el deploy). El primer link vivo (`/demo`) es **estático y sin secretos**, así que
   se puede compartir aunque la base todavía no esté cableada.

---

## El flujo, paso a paso (QUÉ + POR QUÉ)

### 1. Base multi-tenant: cada negocio = un tenant con su `subdomain` + `blueprint` de rubro, RLS enforced
- **QUÉ:** dar de alta cada negocio como *tenant* (`scripts/provision-tenant.ts`), con:
  - un **`blueprint` por rubro** (`--blueprint <id>`): `servicios`/estética (turnos), `carniceria` u otro
    **retail** (tienda por unidad/peso), etc. El blueprint siembra un catálogo de ejemplo editable
    ("nunca vacío, sin ser los datos de nadie").
  - un **`subdomain`** propio (`scripts/set-tenant-subdomain.ts`), que es la llave de ruteo.
- **POR QUÉ:** el blueprint hace que la demo se vea como el rubro real (wording, catálogo, branding) sin
  escribir código a medida — sumar un rubro es **config** (`src/blueprints/retail/rubros.ts`), no un
  fork. El `subdomain` desacopla "cómo entro por la URL" de "cuál es el slug interno". **RLS enforced**
  (`RLS_ENFORCEMENT=on`, la app conecta como el rol `app_rls`) es lo que hace que **un negocio no vea los
  datos de otro** aunque compartan base — condición dura para mostrar demos a clientes reales.
- **Gate de datos:** el alta del 2º+ tenant **exige RLS activo** (el script se niega si no) → primero se
  activa RLS, después se dan de alta los tenants. Verificar aislamiento: `prisma/rls/verify-tenant-isolation.mjs`.

### 2. Ruteo por HOSTNAME (`TENANT_HOST_MAP`) → URLs `.vercel.app` gratis por tenant
- **QUÉ:** en vez de depender de subdominios de un dominio propio (`magra.midominio.com`), mapear
  **hostnames planos** a cada tenant con la env `TENANT_HOST_MAP="host1=sub1;host2=sub2;…"`.
  `getCurrentTenantId()` mira **primero** el mapa exacto de hostname; si no matchea, cae al método de
  subdominio de siempre (intacto, para el día del dominio propio).
- **POR QUÉ:** Vercel te regala URLs `chestetica-erp.vercel.app`, `magra-erp.vercel.app`, etc., pero
  **no son subdominios de un base común** → el ruteo por subdominio no las reconoce. El mapa por
  hostname le da **a cada negocio su URL de demo gratis** hoy, sin comprar dominio, y **sin romper** el
  camino real de mañana (cuando haya dominio propio, se setea `APP_BASE_DOMAIN` y el mapa se puede quitar).

### 3. UN solo proyecto Vercel + N dominios `.vercel.app` gratis
- **QUÉ:** un único proyecto (ej. `erp-ch`) para todo el ERP; en *Settings → Domains* se agregan las N
  URLs `.vercel.app` (Hobby permite **hasta 50 dominios por proyecto**), todas apuntando a ese proyecto.
- **POR QUÉ:** **no fragmentar.** Un proyecto por cliente multiplicaría deploys, variables de entorno y
  puntos de falla, por cero beneficio (es la misma app con distinto tenant). Un proyecto + N dominios =
  un solo build, una sola config, y cada negocio con su URL.

### 4. Variables: qué carga el operador y qué pega el DUEÑO (nunca secretos en manos del agente) — aplica la regla de DOS FASES
- **QUÉ:** el operador/agente carga las variables **NO secretas** y de routing: `RLS_ENFORCEMENT=on`,
  `TENANT_HOST_MAP=…`. El **dueño** pega los **secretos** en su cuenta de Vercel: `DATABASE_URL`
  (rol `app_rls`), `OPERATOR_DATABASE_URL` (rol owner), `AUTH_SECRET`, `OPERATOR_SECRET`,
  `OPERATOR_PASSWORD`, etc. Plantilla lista: **`.env.vercel.template`** (solo nombres + para qué, sin
  valores) para "Import .env".
- **POR QUÉ:** **el agente nunca debe ver ni escribir un secreto.** Las contraseñas y connection strings
  son del dueño y van SOLO a su panel de Vercel (o a su `.env`). El repo lleva la *plantilla* (nombres),
  no los valores. Ojo: el runtime usa **`OPERATOR_PASSWORD`** (no `ADMIN_PASSWORD`, que es legacy inerte)
  y **`OPERATOR_DATABASE_URL`** (rol owner; si falta, cae a `DATABASE_URL` y el operador queda bloqueado
  por RLS).

### 5. La GitHub App de Vercel se instala en la ORGANIZACIÓN dueña del repo (no en la cuenta personal)
- **QUÉ:** si el repo vive en una **organización** de GitHub (ej. `Gestion-Studio-Grow/ERP`), la app de
  Vercel hay que autorizarla **a nivel de esa org**: GitHub → Settings de la **org** → *Third-party
  access → GitHub Apps → Vercel → Configure* → darle acceso al repo. Desde Vercel, al importar, elegir el
  **scope de la org** (no la cuenta personal) y, si no aparece, *Adjust GitHub App Permissions*.
- **POR QUÉ:** **error típico que frena todo.** Si la instalación de Vercel está en tu cuenta personal
  pero el repo vive en la org, **Vercel no ve el repo** y el dueño "no encuentra dónde dar acceso". El
  permiso vive donde vive el repo: en la org.

### 6. Deploy a producción desde `main`; el `/demo` es `force-static` → primer link vivo SIN secretos (FASE 1)
- **QUÉ:** conectar el proyecto a `main` y deployar. La ruta **`/demo`** es `force-static`
  (`src/app/demo/page.tsx`): se pre-renderiza en el build, **sin base ni credenciales**.
- **POR QUÉ:** el `/demo` da un **primer link público navegable al instante**, que **no depende de la
  llave de la base** — sirve aunque `DATABASE_URL` todavía no esté cableada o falle. Es el "hola mundo"
  que se comparte mientras se terminan de cargar los secretos y de mapear los tenants.
  ⚠️ La **home pelada del proyecto** (`erp-ch.vercel.app`, sin entrada en el mapa) con >1 tenant cae al
  **fail-closed (500)** a propósito (no adivina a quién servir): usala solo para `/demo`, o mapeala.

### 7. Costo cero: Neon free + Vercel Hobby + cron DIARIO
- **QUÉ:** Neon plan free (base), Vercel Hobby (hosting). El cron del `vercel.json` es **diario**
  (`0 12 * * *`), no horario.
- **POR QUÉ:** **cuidar el bolsillo y no romper el deploy.** En Hobby, un cron que corre **más de una vez
  por día hace FALLAR el deploy** (`0 * * * *` → error). Diario pasa. Neon free alcanza para demos; evitar
  cargas pesadas, benchmarks y escaneos contra la base. **Si algo obligara a pagar** (cron horario real,
  PITR de verdad, más cómputo) → **PARAR y avisar al dueño**, no gastar.

### 8. Cierre: Gate de Excelencia + `ESTADO-ACTUAL.md` + backup
- **QUÉ:** antes de integrar a `main`, pasar el **Gate de Excelencia** (UX + Arquitectura +
  Confiabilidad; `docs/METODOLOGIA-SPRINT.md`). Al cerrar, actualizar **`docs/ESTADO-ACTUAL.md`** (tenants
  con subdomain+blueprint, hash, gates) y dejar el **backup** de la FASE FINAL (tag `snapshot/AAAA-MM-DD`).
- **POR QUÉ:** que la próxima sesión **retome sin re-descubrir** (el repo es la memoria) y que nada entre
  a `main` sin la valla de calidad. Commit **por pathspec**, sin `-A` (working tree compartido).

---

## ✅ Checklist reutilizable (copiá y tildá en cada demo)

**Repo (operador):**
- [ ] Tenant de cada negocio dado de alta con su **blueprint** de rubro (`provision-tenant.ts`).
- [ ] **`subdomain`** seteado por tenant (`set-tenant-subdomain.ts`).
- [ ] Aislamiento **RLS verificado** (`verify-tenant-isolation.mjs`: policy + rls on).
- [ ] `vercel.json` con **framework nextjs**, build `prisma generate && next build`, cron **diario**.
- [ ] `.env.vercel.template` al día (nombres, sin valores).
- [ ] **Gate de Excelencia** verde (`npm run gates`: tsc·lint·tests·RLS + build) · commit por pathspec.

**Vercel / cuenta — FASE 1 (demo pública, SIN secretos):**
- [ ] GitHub App de Vercel autorizada **en la ORG** dueña del repo → Vercel ve el repo.
- [ ] Un proyecto único; **N dominios `.vercel.app`** agregados (uno por tenant).
- [ ] No-secretos cargados: **`RLS_ENFORCEMENT=on`**, **`TENANT_HOST_MAP=…`**; **`APP_BASE_DOMAIN` VACÍO**;
      **`FORCE_TENANT_SLUG` NO seteada**.
- [ ] Deploy desde `main`. **Primer link ya compartible: `<proyecto>.vercel.app/demo`** (vivo, sin
      credenciales — no depende de la base).

**Vercel / cuenta — FASE 2 (datos reales, el DUEÑO pega los secretos):**
- [ ] Secretos pegados **por el dueño**: `DATABASE_URL` (app_rls), `OPERATOR_DATABASE_URL` (owner),
      `AUTH_SECRET`, `OPERATOR_SECRET`, `OPERATOR_PASSWORD`.
- [ ] Con eso, cada `<negocio>-erp.vercel.app` abre **su** tenant (login/tienda), con datos reales
      **aislados** por RLS.

**Cierre (operador):**
- [ ] `docs/ESTADO-ACTUAL.md` actualizado (tenants + subdomain + blueprint). Backup/tag de FASE FINAL.

---

## Errores típicos (los que ya nos mordieron)
- **`APP_BASE_DOMAIN=vercel.app`** → MAL: trata `chestetica-erp` como subdominio y no resuelve. En modo
  demo va **vacío**; el ruteo lo hace `TENANT_HOST_MAP`.
- **Cron horario en Hobby** → **falla el deploy**. Siempre diario.
- **GitHub App en la cuenta personal** cuando el repo está en la org → Vercel no ve el repo.
- **`FORCE_TENANT_SLUG` seteada** en el deploy compartido → pinea TODO a un solo tenant y rompe el
  multi-tenant. (Solo sirve para un preview de 1 tenant; ojo que usa el **slug**, no el subdomain.)
- **`migrate deploy` para "una" migración** → aplica **todas** las pendientes. Verificar antes con
  `predeploy-check`; aplicar solo con OK del dueño (Gate 2).
- **Secreto en el chat / en un campo** → nunca. Van al `.env`/Vercel del dueño.

## Referencias
- Runbook técnico completo del deploy: `docs/runbooks/deploy-vercel.md` (este playbook es su "modo demo").
- Alta de tenants: `scripts/provision-tenant.ts` · subdominios: `scripts/set-tenant-subdomain.ts`.
- Ruteo: `src/lib/tenant.ts` (`TENANT_HOST_MAP` / `APP_BASE_DOMAIN`). Plantilla env: `.env.vercel.template`.
- Gate de Excelencia y FASE 0/FINAL: `docs/METODOLOGIA-SPRINT.md`.
