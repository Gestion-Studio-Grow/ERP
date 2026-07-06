# Plan Fase 0 — Motor de datos ficticios + toggle de persistencia (célula SANDBOX)

**Tipo:** plan de diseño (Fase 0, no-build) · **Dueño:** Célula SANDBOX (capa Sonnet, ejecución).
**Para qué:** definir CÓMO se entra al **backoffice real** (`/admin`, panel del dueño, caja, tienda,
facturación) **sin contraseña**, con **datos 100% ficticios**, de forma segura — y cómo se lo enciende a
datos reales con un **toggle de persistencia** — antes de construir, por pedido explícito del dueño.
Coordina con la Célula "Probador interactivo (motor)" (`docs/demo/plan-probador-interactivo.md`), pero es
**otro mecanismo**: esa célula renderiza escenas propias, 100% estáticas, sin importar nada de la app; esta
célula hace entrar al **backoffice de verdad** (las mismas pantallas `/admin`/`/operador` que usa un
tenant real), alimentado con datos falsos en vez de la base real.

---

## 1. Qué ya existe (no se re-descubre)

- **Auth de `/admin`:** portón grueso en `src/proxy.ts` (edge) — verifica firma HMAC de una cookie de
  sesión (`readSessionToken()`, `src/lib/auth.ts`) antes de dejar pasar cualquier `/admin/:path*` salvo
  `/admin/login`. El usuario real se resuelve después, en Node, con `getCurrentUser()`
  (`src/lib/session.ts`) — lookup de `User` en Prisma, roles `OWNER/RECEPTION/PROFESSIONAL`
  (`prisma/schema.prisma`), capacidades finas en `src/lib/capabilities.ts` + `src/lib/authz.ts`.
- **Auth de `/operador`:** portón separado (`src/proxy.ts`), cookie y secreto propios
  (`readOperatorToken()`, ADR-021) — es la **consola super-admin** entre tenants, no el backoffice de un
  negocio. **Fuera de alcance de esta célula** (ver §3).
- **Resolución de tenant:** `getCurrentTenantId()` (`src/lib/tenant.ts`) resuelve por, en orden: (0)
  `FORCE_TENANT_SLUG` (env, fail-closed) — el mecanismo que ya usa "un sitio Netlify por tenant" (p.ej.
  `magra-erp` con `FORCE_TENANT_SLUG=magra`); (1) subdominio del host; (2) fallback single-tenant si hay
  exactamente uno; (3) THROW. **Este mecanismo es reutilizable tal cual para un sitio-demo dedicado.**
- **Capa de datos:** `src/lib/db.ts` es un **conmutador** ya existente — hoy elige entre `basePrisma`
  (crudo) y `rlsPrisma` (con `SET LOCAL app.current_tenant_id`, ADR-018) según el flag
  `RLS_ENFORCEMENT`. Los ~20 importadores de la app usan siempre `@/lib/prisma`, nunca el cliente crudo
  directo — **es el único punto de entrada real a la base**, y por eso es el lugar natural para sumar un
  tercer modo.
- **`/demo` (Célula del Probador):** `src/app/demo/` es **force-static**, cero import de Prisma/acciones —
  reimplementa mini-escenas propias. Probó un patrón valioso que esta célula reutiliza (§4): "cobrar" no
  pega al servidor, es una máquina de estados de React que se resetea al recargar.
- **Seed ficticio:** `prisma/seed.ts` ya modela datos de ejemplo (profesionales, servicios, horarios,
  clientes) para un rubro Agenda&Servicios — buena semilla, hoy pensada para poblar una DB real de
  desarrollo, no para servir como fixture en memoria.
- **No existe hoy:** ningún flag `DEMO_MODE`/toggle de persistencia, ningún `/probar`, ningún
  `src/presets/contract.ts` (confirmado por exploración directa del código, 2026-07-06).

## 2. El gap que motiva esta célula

El dueño pide que en la reunión de venta se pueda **entrar a las pantallas reales** del ERP (no una
reconstrucción tipo Stories) sin pedirle una contraseña a nadie, viendo un negocio de mentira del rubro
del prospecto, pudiendo tocar "cobrar"/"agendar"/"facturar" y que **se sienta que funciona**, sin que
ningún dato real se toque ni se cree ninguna cuenta. Hoy eso no existe: `/admin` siempre exige login real
contra `User`+Prisma, y no hay ninguna noción de "tenant de mentira".

## 3. Arquitectura propuesta

### 3.1 Principio rector: el bypass debe ser un espacio MUERTO por defecto, no un `if` en caliente

En vez de un interruptor que corre en el mismo deploy que sirve a Carolina/Magra, el demo **es su propio
sitio Netlify** (mismo patrón que "un sitio por tenant" — `FORCE_TENANT_SLUG`). Un deploy de demo trae dos
env vars propias:

- `FORCE_TENANT_SLUG=demo-<rubro>` (p.ej. `demo-agenda`, `demo-retail`, `demo-gastronomia`,
  `demo-oficios`) — **namespace reservado**: ningún tenant real puede tener un slug que empiece con
  `demo-` (se agrega como validación en el alta de tenant).
- `DEMO_MODE_ENABLED=true` — **solo existe en ese deploy**. En Carolina/Magra/cualquier sitio real esta
  variable no está seteada; el código de bypass queda **inalcanzable**, no solo "apagado por config".

Esto acota el blast radius a un nivel estructural: aunque alguien deje `DEMO_MODE_ENABLED=true` puesto por
error, solo abre paso a un tenant `demo-*` que no existe con datos reales — nunca a Carolina o Magra.

### 3.2 Bypass de login (sin password, sin secretos)

- **`src/proxy.ts`** suma una rama **antes** del chequeo de `readSessionToken()`: si
  `process.env.DEMO_MODE_ENABLED === "true"`, deja pasar `/admin/:path*` sin pedir cookie de sesión. **No
  toca `/operador`** — la consola super-admin sigue siempre gateada (fuera de alcance, es control-plane
  entre tenants, no el backoffice de un negocio).
- **`src/lib/session.ts` (`getCurrentUser()`)** suma la misma condición: en demo mode, devuelve un
  `SessionUser` **sintético** (rol `OWNER` fijo, `tenantId` = el que resuelva `getCurrentTenantId()`, que
  con `FORCE_TENANT_SLUG=demo-*` siempre da el pseudo-tenant) **sin pegarle a `User`/Prisma en absoluto**.
  Cero `passwordHash`, cero `AUTH_SECRET`, cero cookie firmada — el mecanismo de auth real ni se ejecuta.
- Resultado: entrar a `/admin` en el sitio demo no pasa por ningún secreto porque **el código que los usa
  no corre** en esa rama.

### 3.3 Motor de datos ficticios (por qué no toca nunca la base real)

- **Punto único de intercepción: `src/lib/db.ts`**, que ya es el conmutador (RLS on/off). Se agrega un
  tercer modo: si `DEMO_MODE_ENABLED === "true"`, `@/lib/prisma` exporta un **fixture en memoria**
  (`demoPrisma`) en vez de `basePrisma`/`rlsPrisma` — un objeto que implementa solo la porción de la API
  de Prisma que el backoffice efectivamente usa, **sin importar `@prisma/client` real ni abrir conexión
  a Postgres**. Si algún día ese objeto intentara conectar, no compilaría (no tiene URL ni cliente real).
- **Lecturas:** cada modelo mockeado devuelve datos armados desde fixtures **parametrizadas por rubro**
  (`src/demo-data/<rubro>.ts`), reusando como semilla el contenido de `prisma/seed.ts` y la tabla de
  familias de rubro ya modelada en `src/blueprints/` (Agenda&Servicios / Retail-Mostrador / Gastronomía /
  Servicios&Oficios / Genérico) — mismo criterio que ya ratificó la Célula del Probador para sus escenas.
- **Escrituras ("cobrar", "agendar", "emitir factura"):** acá se reutiliza **el patrón ya probado por
  `/demo`**, aplicado a las pantallas reales en vez de a una reconstrucción: la acción del servidor en modo
  demo NO ejecuta ningún `create`/`update` contra Prisma — devuelve una respuesta "éxito" canned (ticket
  con CAE de mentira, turno confirmado) y **el cliente actualiza su propia vista con estado de React**
  (optimista), exactamente como hoy el ticket de `/demo` cuenta hacia arriba y se resetea al recargar. Es
  la única opción realista además: las funciones de Netlify son *stateless* entre invocaciones, así que
  "recordar" una escritura de un visitante a otro request del servidor no es gratis ni conviene — el
  "recuerdo" vive en el navegador de esa visita, no en el servidor.
- **Defensa en profundidad:** aun si algún flujo llamara por error a un método de escritura del fixture,
  éste debe **no-opear o tirar un error explícito** ("no soportado en demo"), nunca reenviar a un cliente
  real — nunca hay un cliente real detrás al que reenviar.
- **`/tienda`** (vidriera pública, ya sin gate de proxy hoy) queda cubierta gratis por el mismo switch:
  al vivir en el mismo deploy demo, sus lecturas también pasan por `@/lib/prisma` → mismo fixture.

### 3.4 Toggle de persistencia (cuándo entra el login real)

- El toggle **no es un botón dentro de la app** (un visitante de la demo no debe poder tocarlo). Es
  **una decisión de deploy**: la misma infraestructura de "un sitio por tenant" ya usada para Magra. Para
  pasar de datos ficticios a datos reales:
  1. Se crea el `Tenant` real (alta real, como cualquier cliente nuevo — `docs/runbooks/alta-*`).
  2. El sitio se redespliega (o se crea el sitio definitivo) con `FORCE_TENANT_SLUG=<slug-real>` y
     **sin** `DEMO_MODE_ENABLED` (ausente o `false`).
  3. En ese instante, `proxy.ts` y `getCurrentUser()` vuelven a su camino normal: login real exigido,
     `@/lib/prisma` vuelve a `basePrisma`/`rlsPrisma`. **Es la Fase de "datos reales" que carga el dueño**
     (crear el usuario OWNER real con su contraseña) — coherente con la instrucción explícita del dueño de
     que ahí recién entran credenciales.
- Ventaja de esto sobre un flag en DB o un botón in-app: activar persistencia requiere acceso de deploy
  (quien ya gestiona Netlify/env vars), no puede ser gatillado por un visitante ni por un bug de UI — es
  la misma disciplina que ya rige Gate 2 (nada que toque datos reales sin una acción deliberada fuera de
  la app).

## 4. Qué NO hace esta célula (fuera de alcance, explícito)

- No construye el generador de presets por IA ni el contrato `Preset` (eso es de la Célula "Generador de
  Preset", Opus) — el "por rubro" acá se resuelve con fixtures propias en código, no con presets
  generados; si el generador emite `Preset` reales más adelante, las fixtures de esta célula pueden pasar
  a leer de ahí, pero no es una dependencia dura para arrancar.
- No toca `/operador` (consola super-admin) ni el flujo de alta real de tenants.
- No implementa aún el fixture `demoPrisma` ni las pantallas — este documento es **solo el plan**, no
  hay código nuevo todavía.

## 5. Riesgos / preguntas abiertas para Fase 1 (antes de estimar el build)

1. **Censo de acceso a datos:** ¿todas las pantallas de `/admin` leen/escriben vía `@/lib/prisma` /
   `tenantTransaction`, o hay algún server action que instancia su propio cliente Prisma por fuera del
   conmutador? Si el 100% pasa por `@/lib/prisma`, un solo fixture alcanza; si hay excepciones, hay que
   ubicarlas antes de prometer "cero conexión real" como garantía estructural.
2. **Cobertura del fixture:** el fixture no necesita implementar el 100% de la superficie de Prisma —
   solo los modelos/métodos que las pantallas de agenda/caja/tienda/factura/panel-del-dueño tocan. Hace
   falta un inventario acotado de esos call sites para dimensionar el esfuerzo real (probablemente
   bastante menor a "toda la API de Prisma").
3. **Validación de namespace reservado:** agregar el chequeo "ningún tenant real puede tener slug que
   empiece con `demo-`" en el alta de tenant (una línea, bajo impacto, pero es la pieza que hace el
   aislamiento verificable por código y no solo por convención).
4. **Alcance de "por rubro" en v1:** ¿cuántos rubros de fixture se preparan para el primer build (uno por
   familia de blueprint, 5 en total) o alcanza con 1–2 para la primera reunión de venta y se amplía
   después? Recomendado: arrancar con **Agenda&Servicios** y **Retail/Mostrador** (los dos con tenants
   reales hoy — Carolina y Magra — así el fixture se valida contra un caso conocido) y sumar el resto
   incrementalmente.

## 6. Nota de gobernanza — por qué este plan debe pasar por el Gate antes de construir

Este mecanismo toca **autenticación y resolución de tenant** (`src/proxy.ts`, `src/lib/session.ts`,
`src/lib/tenant.ts`) — superficie de **alto juicio** según el modelo de trabajo de GSG
(`docs/organizacion/factory-reforzada.md` §1: Seguridad es capa Opus). Esta célula (Sonnet, ejecución)
entrega el diseño; **antes de construir en grande**, corresponde que la Auditoría GSG/Seguridad (Opus)
revise específicamente §3.1–3.3 (namespace reservado + bypass de proxy + aislamiento del fixture) — no
por burocracia, sino porque un error acá es exactamente el tipo de cosa cara/difícil de revertir que la
norma reserva para Opus. Sin build todavía — pendiente de esa revisión y de la aprobación del plan.

— Elaborado por **Gestión Studio Grow (GSG)**.
