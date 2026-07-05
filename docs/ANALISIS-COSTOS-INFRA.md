# Análisis de costos e infraestructura (FinOps)

> **Alcance:** este documento analiza **LÍMITES de plan** + **CONSUMO REAL de Netlify** (relevado en vivo del panel el 2026-07-05) + **PROYECCIÓN**. Los límites son valores oficiales (fuente abajo). El consumo de **Netlify ya es dato real medido** (§2.a); el de **Neon sigue pendiente** de relevar su panel (§6) — ahí los números son envelope con supuestos marcados. No se inventan cifras reales.
>
> **Corrección importante (2026-07-05):** una versión previa asumía que estábamos en **Netlify Free**. **Falso:** el equipo `erp` está en **Personal ($9/mes, 1.000 créditos)** desde el 3-jul. Todo el headroom de Netlify se recalculó con eso y con el consumo real.
>
> **Fecha del relevamiento:** 2026-07-05. **Verificar contra el plan vigente** antes de decidir un upgrade — Netlify y Neon revisan planes seguido (Netlify pasó a modelo de créditos; la tarifa de bandwidth se duplicó el 2026-04-14).

---

## 1. Nuestro setup real (verificado en el repo)

| Pieza | Qué es | Relevancia de costo |
|---|---|---|
| **Frontend/App** | Next.js **16.2.9** en Netlify vía `@netlify/plugin-nextjs` (`netlify.toml`: `next build`) | Deploys (créditos), funciones SSR (compute), bandwidth |
| **Render** | **Casi todo es `force-dynamic`** — sitio público (`(site)/layout.tsx`, `page.tsx`, `/reserva`), vidriera `/tienda`, y **todo** `/admin` | ⚠️ **driver #1**: cero cache de CDN → cada visita = 1 función Netlify + 1 hit a Neon |
| **DB** | Prisma **7.8** + `@prisma/adapter-pg` contra **Neon** (pooler, transaction mode) | Storage, compute-hours, egress de Neon |
| **Cron** | `src/app/api/cron/reminders` (recordatorios) | Despierta el compute de Neon periódicamente → gasta CU-hours e impide el ahorro por scale-to-zero |
| **Imágenes** | `next/image` con remotePatterns (unsplash, dicebear) | Transformación/bandwidth de imágenes |
| **Deploy** | Auto-publish de Netlify **apagado** (`stop_builds`); deploy solo con OK explícito | Controla el gasto de deploys (15 créditos c/u) |

**Consecuencia central:** el `force-dynamic` generalizado maximiza tres consumos a la vez (funciones Netlify, compute Neon, wakes que impiden scale-to-zero). Es el primer lugar donde mirar para ahorrar (§7).

---

## 2. Límites del plan gratuito (valores oficiales)

### 2.a Netlify — estamos en **Personal ($9/mes · 1.000 créditos)**

**Dato real (panel, 2026-07-05):** el equipo `erp` está en **plan Personal, $9/mes**, efectivo desde el **3-jul**, con **1.000 créditos/mes** y **auto-recarga de créditos DESACTIVADA**. Al agotarse el pool, el sitio **deja de servir tráfico hasta el próximo ciclo** (sin cargo sorpresa, pero con **corte** de servicio). Netlify **ya no cobra build minutes**: todo sale de ese pool único. Deploy previews, branch deploys y builds fallidos **no** consumen créditos. *(Free serían 300 cr; queda como referencia, pero nuestro presupuesto real es 1.000.)*

| Recurso | Tarifa | 1.000 créditos (Personal) equivalen a… |
|---|---|---|
| **Web Bandwidth** | 20 créditos / GB | ~50 GB |
| **Web Requests** | 2 créditos / 10.000 requests | ~5 M requests |
| **Functions & Agents Compute** | 10 créditos / GB-hora | ~100 GB-hora |
| **Production Deployments** | **15 créditos / deploy** | ~66 deploys |
| **Database Bandwidth / Compute** | 20 cr/GB · 10 cr/GB-h | *N/A para nosotros* (es la DB propia de Netlify; **nosotros usamos Neon** — nuestro costo de DB está del lado de Neon, no en estos créditos) |
| **Form Submissions** | gratis | — |
| Timeout de función | ~10 s síncrono | *verificar contra plan vigente* |

> Los recursos **comparten** el mismo pool de 1.000: 1 deploy (15 cr) = 1,5% del mes; 1 GB de tráfico = 2%.

#### Consumo REAL de Netlify (medido, no estimado)

| Período | Consumido | Restante | Nota |
|---|---|---|---|
| **Actual** (3-jul → 2-ago) | **~575 / 1.000** | **425** | mes en curso |
| **Anterior** (3-jun → 2-jul) | **743 / 1.000** | 257 | **pico de ~500 créditos en un solo día (2-jul)** — probable ráfaga de builds/deploys |

**Desglose real por recurso (panel, 2026-07-05) — el hallazgo que cambia la lectura:**

| Recurso | Medido | Créditos | Lectura |
|---|---|---|---|
| **Functions Compute** | 0,095 GB-Hrs (actual) · 0,78 GB-Hrs (anterior) | **~1 crédito** | el **tráfico consume casi nada** (10 cr/GB-h) |
| **Builds / Deploys** | 39 builds (actual), 52 s prom., 33 min total | **~la totalidad de los ~575** | **los créditos los queman los BUILDS**, no el tráfico |

- **El driver de costo NO es el tráfico — son los deploys.** Compute de funciones ≈ 1 crédito: el `force-dynamic` **hoy** casi no pesa en la factura de Netlify (sí pesa en Neon; ver §7). Los ~575 créditos son esencialmente **builds**.
- **Costo real por build:** ~575 créditos / 39 builds ≈ **~15 créditos/build** — que coincide con la tarifa oficial de Netlify (**15 cr/Production Deployment**). El pico de 743 del mes anterior (con ~500 en el 2-jul) fue una **ráfaga de deploys** con auto-publish todavía encendido.
  > ⚠️ *Reconciliación:* una estimación previa manejó "~3-4 cr/build → 250-300 builds/mes". **El panel no la sostiene**: 39 builds coinciden con ~575 créditos → **~15 cr/build**, o sea **~60-70 builds/mes** con 1.000 créditos, no 250-300. Se usa el número que respaldan los datos (confirmar con la línea "Production Deployments" del desglose, §6).
- **`ch-estetica`: "Builds are stopped"** — auto-publish off, coherente con la política de deploy manual. Es exactamente lo que corta la sangría de créditos.

### 2.b Neon — Free (por proyecto)

Compartimos **un solo proyecto Neon** para todos los tenants (multi-tenant shared-schema), así que estos límites se reparten entre **todos** los tenants juntos.

| Recurso | Límite Free | Nota |
|---|---|---|
| **Storage** | **0,5 GB / proyecto** | ⚠️ solo crece (ratchet); incluye datos + índices |
| **Compute** | **100 CU-horas / mes** | CU × horas activas; autoscale hasta 2 CU |
| **Egress (data transfer)** | **5 GB / mes** | |
| **Autosuspend** | a los **5 min** de inactividad (scale-to-zero siempre on) | genera cold starts |
| **Proyectos / ramas** | hasta 100 proyectos · **10 ramas**/proyecto | ramas útiles para ensayar RLS (ADR-018) sin tocar prod |
| Tarjeta de crédito | no requiere; Free permanente | |

> **Regla dura de Neon:** tocar **cualquiera** de los tres (100 CU-h · 0,5 GB · 5 GB egress) **suspende el compute hasta el próximo ciclo**. No degrada: **corta**.

---

## 3. Qué consume cada límite en NUESTRO setup

**Netlify (créditos):**
- **Deploys (15 cr c/u)** — el ítem más "grueso" y discreto. Con auto-publish apagado, se gasta solo cuando Maxi dice "deployá". 4 deploys/mes = 60 cr (20% del pool) antes de una sola visita.
- **Functions Compute** — por el `force-dynamic`, **cada page view del sitio, la vidriera y el admin ejecuta una función** (memoria × duración). Sin `force-dynamic` en las páginas públicas, esto bajaría fuerte (§7).
- **Web Requests + Bandwidth** — tráfico anónimo del sitio público y la vidriera; requests son baratísimos, bandwidth pesa según el tamaño de página/imágenes.

**Neon:**
- **Storage (el crítico)** — dominado por **`AuditLog`** (append-only, sin retención — ADR-023 F8) + `Payment`/`Appointment`. Crece monótono; **es el que más probablemente toque el techo por calendario**.
- **Compute (CU-h)** — cada request `force-dynamic` despierta y consulta Neon; **el cron de recordatorios** además lo despierta periódicamente e impide el scale-to-zero nocturno.
- **Egress** — respuestas de queries; el reporte que trae *todo* el histórico de pagos (ADR-023 F3) es el candidato a inflarlo.

---

## 4. Headroom, proyección y punto de quiebre

> Envelopes con **supuestos marcados**. Calibrar con los números reales del panel (§6) antes de tomarlos como ciertos.

### ¿Qué límite se toca PRIMERO?

**Casi con certeza: el STORAGE de Neon (0,5 GB).** Razones:
1. Es un **ratchet**: solo sube, nunca se resetea por ciclo (a diferencia de los créditos de Netlify y las CU-horas, que vuelven a cero cada mes).
2. Al tocarlo, Neon **suspende el compute** → **la app se cae**, no se degrada.
3. Su driver (`AuditLog`) crece **aunque el tráfico sea bajo**, y **se acelera con cada tenant nuevo** (proyecto Neon compartido).

**Matiz clave (con el desglose real): los créditos de Netlify NO los mueven los tenants — los mueven los DEPLOYS.** El compute de funciones es ~1 crédito (§2.a): el tráfico de comercios chicos casi no consume. El 57-74% del pool que gastamos fue **actividad de dev/deploys** (39 builds; el pico del 2-jul, una ráfaga). Entonces Netlify **no es un límite que escale con la cantidad de tenants**, es un límite que escala con **cuántas veces deployamos**. Con auto-recarga apagada, agotarlo igual corta el servicio — pero se controla con higiene de deploy (§7), no achicando el producto.

**Orden probable de saturación** (con datos reales):
1. 🥇 **Neon storage 0,5 GB** — el límite **por tenant/calendario** (ratchet, corta la app). Es el que manda cuando sumás tenants.
2. 🥈 **Netlify 1.000 créditos** — límite **por actividad de deploys**, no por tenants; riesgo real solo en días de deploys intensos (como el 2-jul). **Neon compute 100 CU-h** sí sube con tenants.
3. 🥉 **Neon egress 5 GB** / **Netlify bandwidth (~50 GB)** (improbable primero, salvo reportes que traen datasets enteros — ADR-023 F3).

### Alcance del plan $9/mes (1.000 créditos): dos lentes

El plan de Netlify se lee distinto según qué lo consume. **Los datos reales separan las dos cosas:**

**Lente 1 — TENANTS (tráfico de producción): Netlify NO es el cuello.**
El tráfico de comercios chicos consume **compute y bandwidth mínimos** (medido: ~1 crédito de compute en el mes). A ese ritmo, el pool de 1.000 créditos aguanta **decenas de tenants sin mover la aguja**. **El límite real por tenant es el storage de Neon (0,5 GB gratis), no Netlify.** Sumar clientes NO acerca el corte de Netlify; acerca el de Neon.

**Lente 2 — PRUEBAS / DEV (deploys): acá SÍ se van los créditos.**
Cada deploy = un build = créditos. Al ritmo real: **~15 créditos/build → ~60-70 builds/mes** con 1.000 créditos. Pero un **día de deploys intensos puede comerse la mitad del pool** (el 2-jul: ~500 créditos ≈ ~33 deploys en un día). El consumo del 57-74% de estos meses fue **esto**, no tenants. *(Si en el panel §6 la línea "Production Deployments" mostrara un costo por build menor, el techo de builds sube proporcionalmente — pero se planifica con ~15.)*

> **Síntesis del alcance $9:** **decenas de tenants** de producción, pero solo **~60-70 deploys/mes** (y un día de ráfaga puede quemar la mitad). El plan está limitado por **cómo trabajamos (deploys)**, no por **cuántos clientes tenemos**.

**Los otros límites (Neon), como envelope hasta relevar su panel:**
- **Neon compute 100 CU-h:** a 0,25-0,5 CU activos, son **200-400 horas activas/mes** *(supuesto)*. El cron + tráfico de horario comercial de **1 tenant** cabe con holgura; el margen se come al **sumar tenants**.
- **Neon storage 0,5 GB:** *(supuesto: fila de audit ~1-2 KB con el `changes` JSON + overhead de índices)* → orden de **cientos de miles de filas**. Un salón que genera unos miles de mutaciones/mes tiene, en teoría, **~1-3 años** de headroom **como tenant único** — pero **esto DEBE calibrarse con el tamaño real de la DB del panel de Neon**, que todavía no medimos. Con más tenants, el horizonte se **acorta proporcionalmente**.

> ⚠️ Estos rangos son **método, no medición**. El número que importa —a qué % de 0,5 GB estamos hoy y a qué ritmo sube— sale del panel (§6).

### Costo del primer upgrade

| Plataforma | Estado / Salto | Costo | Qué destraba |
|---|---|---|---|
| **Netlify** | **Ya estamos en Personal** (Free 300 → Personal 1.000, desde 3-jul) | **$9/mes** (gasto actual) | 3,3× el pool de Free; sube el timeout de función |
| **Netlify** | Personal → **Pro** (próximo salto) | **$20/mes** = 3.000 créditos | Si el consumo real sostenido pasa de ~800-900/mes, o los picos amenazan el corte con auto-recarga apagada |
| **Neon** | Free → **Launch** (pay-as-you-go, sin mínimo mensual*) | **$0,35/GB-mes** storage · **$0,106/CU-hora** compute · 500 GB egress incluidos | Saca el techo de 0,5 GB y de 100 CU-h. A escala de piloto (1-2 GB, compute bajo): **~$5-15/mes** *(estimación)*. *(*verificar si aplica algún fee base) |

**Lectura FinOps (corregida con el desglose real):** hoy ya pagamos **$9/mes de Netlify** (no estábamos en Free). El **próximo gasto real** será **Neon** (por storage, empujado por tenants — barato de cruzar). **Netlify Pro ($20) NO lo dispara la cantidad de tenants** (el tráfico casi no consume) sino la **cadencia de deploys**: se necesita solo si deployamos por encima de ~60-70 builds/mes de forma sostenida — se pospone con **disciplina de deploy** (probar en local), no achicando el producto. Escalones de costo: **hoy $9/mes** → +Neon Launch (~$5-15) cuando el storage lo pida → Netlify Pro (+$11) solo si el ritmo de deploys lo exige. Nada "explota".

---

## 5. Cómo se relaciona con decisiones ya tomadas

- **ADR-023 F8** (retención de `AuditLog`): es la palanca directa del límite que se toca primero. Sin política de retención/archivado, el storage de Neon es una cuenta regresiva.
- **ADR-023 F3** (reportes que agregan en JS trayendo todo): infla egress y compute de Neon.
- **ADR-007** (análisis financiero): este documento le agrega el **eje storage** y traduce los planes al **modelo de créditos nuevo** de Netlify (ADR-007 es anterior a ese cambio — conviene enmendarlo).
- **`FUNDAMENTOS-Y-VISION.md` §8** (restricciones de plataforma): coherente — storage 0,5 GB como primer techo.

---

## 6. Métricas exactas a pulsar del panel (para completar con números reales)

### Netlify (el modelo cambió a créditos — mirar por crédito, no por minutos)

1. **Team → Billing → Usage** (o "Usage & credits"): **consumo del mes en curso sobre los 1.000 créditos** (ya sabemos el total ~575; falta el **desglose por recurso** — Bandwidth, Web Requests, Functions Compute, Production Deployments). Ese desglose es lo que confirma cuánto pesa el `force-dynamic` y cuánto los deploys. Es la métrica madre.
2. **El desglose de créditos por recurso** en esa misma vista: cuántos créditos se van en **deploys** vs **compute de funciones** vs **bandwidth**. Confirma si el driver real es lo que predice §3.
3. **Deploys → lista de Production deploys** del mes: **cantidad de deploys** (× 15 cr). Cruzar con la política de "deploy solo a pedido".
4. **Functions** (pestaña de la app): **invocaciones y duración** de las funciones SSR — insumo del compute.
5. **Bandwidth / Web requests** en Usage: GB servidos y requests del mes.
6. **Histórico:** el gráfico de uso mes a mes en Billing → Usage (tendencia, para proyectar la fecha de quiebre).

> Nota: **Netlify Analytics** (por sitio) es un **add-on pago**; el consumo de créditos NO lo necesita — sale de Billing → Usage, que es gratis.

### Neon (el lado que se toca primero — mirar aunque no lo pidieron, es el crítico)

1. **Neon Console → proyecto → Monitoring / Usage:** **Storage usado vs 0,5 GB** (el número que decide todo), **Compute (CU-hours) vs 100**, **Data transfer / egress vs 5 GB**.
2. **Active time / compute** por día: cuánto tiempo el compute estuvo despierto (mide el impacto del cron + `force-dynamic`).
3. **Branches:** cuántas ramas (de 10) — para el ensayo de RLS.

---

## 7. Recomendaciones de ahorro (alineadas a "cuidar costos")

**Alto impacto — Netlify (créditos): probar en LOCAL, deployar solo releases.**
1. **El ahorro de créditos de Netlify es de deploys, no de tráfico** (el desglose real lo probó: compute ~1 crédito). Entonces:
   - **Desarrollar y probar en local con `npm run dev` (gratis)** — cada iteración local no cuesta un crédito; cada deploy sí (~15 cr).
   - **Deployar solo releases reales**, batcheadas: agrupar el trabajo de una sesión en **un** deploy, no varios. ~60-70 builds/mes es el techo; un día de ráfaga se come la mitad.
   - **Auto-publish OFF (ya está):** es lo que evita que cada push a `main` gaste un build. Mantenerlo así.

**Alto impacto — Neon (el límite que se toca primero):**
2. **Retención de `AuditLog`** (ADR-023 F8): ventana holgada (~12-18 meses) + archivado futuro a R2. Ataca directo el límite que se toca primero.
3. **Revisar la frecuencia del cron de recordatorios:** cada wake mantiene Neon despierto ≥5 min. Correrlo con cadencia sensata (p.ej. cada 15-30 min u horario, no cada minuto) y en lo posible en **horario comercial**, para dejar que Neon caiga a scale-to-zero de noche → ahorra CU-horas.

> **Reclasificación de `force-dynamic` (con el dato real):** una versión previa lo llamó "el ahorro más grande". **Los números lo corrigen:** el compute es hoy **~1 crédito en Netlify** y muy bajo en Neon, así que el ahorro **inmediato en $** de estatizar las páginas públicas es **chico**. Sigue valiendo la pena como **higiene y scale-readiness** (cuando haya muchos tenants con tráfico real, sí va a pesar en Neon), pero **no es la palanca de costo de hoy** — la palanca de hoy es la **disciplina de deploys** (punto 1). Prioridad realista: media, no alta.

**Sostenido:**
4. **Explicación del pico del 2-jul (~500 créditos en un día):** fue una **ráfaga de builds/deploys** — con auto-publish todavía **encendido**, cada push a `main` disparaba un deploy (15 cr c/u; ~33 deploys ≈ 500 cr). **Ya está mitigado:** el auto-publish quedó **apagado** (`ch-estetica`: "Builds are stopped") el 3-jul, así que los pushes de trabajo ya **no** deployan solos (es la contracara del punto 1). Si reaparece un pico, el desglose del panel (§6) dirá si fue deploys (→ higiene de deploy) o, ya con muchos tenants, compute.
5. **Reportes con agregación en DB y rango de fecha** (ADR-023 F3): baja egress y compute de Neon.
6. **Vigilar el % de storage de Neon como métrica de gate** (§6): es la señal anticipada del primer upgrade; permite planificar el salto a Launch sin sorpresa de corte.
7. **Cuidar el peso de imágenes** (`next/image`, remotePatterns): imágenes livianas = menos bandwidth (20 cr/GB en Netlify).

---

## Fuentes

- [Netlify — Pricing and Plans](https://www.netlify.com/pricing/) (Personal $9/mes = 1.000 cr; Pro $20/mes = 3.000 cr)
- [Netlify Docs — Credit-based pricing plans](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/) (Free 300 cr/mes, límite duro)
- [Netlify Docs — How credits work](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/) (tarifas: 20 cr/GB, 10 cr/GB-h, 15 cr/deploy, 2 cr/10k requests)
- [Neon — Pricing](https://neon.com/pricing) (Free: 0,5 GB, 100 CU-h, 5 GB egress, autosuspend 5 min; Launch pay-as-you-go: $0,35/GB-mes, $0,106/CU-h)

*Relevado 2026-07-05. Verificar contra el plan vigente antes de decidir upgrades.*
