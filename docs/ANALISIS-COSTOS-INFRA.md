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

- **Utilización real ~57-74% del pool pago.** El margen **no es holgado**: quedan **~26-43%** (§4).
- **`ch-estetica`: "Builds are stopped"** — auto-publish off, coherente con la política de deploy manual.
- El **desglose por recurso** (cuántos de esos ~575 son deploys vs compute de funciones vs bandwidth) **hay que sacarlo del panel** (§6) — es lo que dice cuánto pesa el `force-dynamic`.

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

**Pero atención — Netlify subió de prioridad con los datos reales.** *Build minutes* ya no existen, pero el **pool de 1.000 créditos se está consumiendo al 57-74%/mes** (dato real §2.a), y con **auto-recarga apagada** agotarlo también **corta el servicio**. No es el "primero" por calendario (eso es Neon storage), pero **ya no es el margen holgado** que sugería el envelope de Free: es un riesgo operativo **mensual y real**, sobre todo por picos (el del 2-jul se comió ~50% del pool en un día).

**Orden probable de saturación** (con datos reales):
1. 🥇 **Neon storage 0,5 GB** (calendario, ratchet, corta la app — sigue siendo el primero por fecha).
2. 🥈 **Netlify 1.000 créditos** (consumo real 57-74%/mes; un pico como el del 2-jul amenaza el corte antes de fin de ciclo) **y Neon compute 100 CU-h**.
3. 🥉 **Neon egress 5 GB** / **Netlify bandwidth (~50 GB)** (improbable primero, salvo reportes que traen datasets enteros — ADR-023 F3).

### Cuántos tenants/tráfico entran antes de pagar (envelope)

- **Netlify 1.000 créditos (dato REAL, no envelope):** consumo medido **~575-743 créditos/mes = 57-74% del pool**. Quedan **~257-425 créditos** de margen (26-43%). Es **ajustado, no holgado**: un solo día como el pico del 2-jul (~500 cr) equivale a **casi medio mes** de presupuesto. Con **1 tenant** ya estamos a más de la mitad del pool; **cada tenant y cada ráfaga de deploys lo aprieta**. Corrige el envelope anterior (que, asumiendo Free, decía "sobra"): **no sobra**. *(Cuánto de ese consumo es `force-dynamic` vs deploys vs bandwidth sale del desglose del panel, §6.)*
- **Neon compute 100 CU-h:** a 0,25-0,5 CU activos, son **200-400 horas activas/mes** *(supuesto)*. El cron + tráfico de horario comercial de **1 tenant** cabe con holgura; el margen se come al **sumar tenants**.
- **Neon storage 0,5 GB:** *(supuesto: fila de audit ~1-2 KB con el `changes` JSON + overhead de índices)* → orden de **cientos de miles de filas**. Un salón que genera unos miles de mutaciones/mes tiene, en teoría, **~1-3 años** de headroom **como tenant único** — pero **esto DEBE calibrarse con el tamaño real de la DB del panel de Neon**, que todavía no medimos. Con más tenants, el horizonte se **acorta proporcionalmente**.

> ⚠️ Estos rangos son **método, no medición**. El número que importa —a qué % de 0,5 GB estamos hoy y a qué ritmo sube— sale del panel (§6).

### Costo del primer upgrade

| Plataforma | Estado / Salto | Costo | Qué destraba |
|---|---|---|---|
| **Netlify** | **Ya estamos en Personal** (Free 300 → Personal 1.000, desde 3-jul) | **$9/mes** (gasto actual) | 3,3× el pool de Free; sube el timeout de función |
| **Netlify** | Personal → **Pro** (próximo salto) | **$20/mes** = 3.000 créditos | Si el consumo real sostenido pasa de ~800-900/mes, o los picos amenazan el corte con auto-recarga apagada |
| **Neon** | Free → **Launch** (pay-as-you-go, sin mínimo mensual*) | **$0,35/GB-mes** storage · **$0,106/CU-hora** compute · 500 GB egress incluidos | Saca el techo de 0,5 GB y de 100 CU-h. A escala de piloto (1-2 GB, compute bajo): **~$5-15/mes** *(estimación)*. *(*verificar si aplica algún fee base) |

**Lectura FinOps (corregida):** hoy ya pagamos **$9/mes de Netlify** (no estábamos en Free). El **próximo gasto real** será **Neon** (por storage, barato de cruzar), pero **Netlify Pro podría llegar antes de lo pensado**: con el consumo real en 57-74% del pool y creciendo con cada tenant, el salto a **$20/mes** es plausible en el mediano plazo — y **bajar el `force-dynamic` (§7) es lo que puede posponerlo**. Escalones de costo: **hoy $9/mes** → +Neon Launch (~$5-15) → eventualmente Netlify Pro (+$11). Nada "explota", pero el margen de Netlify es **más chico** de lo que creíamos.

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

**Alto impacto:**
1. **Sacar `force-dynamic` de las páginas PÚBLICAS que no lo necesitan** (home/marketing `(site)/page.tsx` + layout, y el listado de la vidriera `/tienda` con `revalidate` corto). Hoy cada visita anónima despierta Neon y corre una función. **Con el dato real, esto ya no es hipotético: el compute de funciones se paga del pool de 1.000 créditos que YA gastamos $9/mes** (10 cr/GB-hora) — cada page view pública dinámica consume crédito real. Es el ahorro más grande y toca las tres métricas (funciones Netlify, compute Neon, wakes), y es la palanca directa para **posponer el salto a Netlify Pro**. La reserva (disponibilidad en vivo) y el `/admin` **sí** siguen dinámicos.
2. **Retención de `AuditLog`** (ADR-023 F8): ventana holgada (~12-18 meses) + archivado futuro a R2. Ataca directo el límite que se toca primero.
3. **Revisar la frecuencia del cron de recordatorios:** cada wake mantiene Neon despierto ≥5 min. Correrlo con cadencia sensata (p.ej. cada 15-30 min u horario, no cada minuto) y en lo posible en **horario comercial**, para dejar que Neon caiga a scale-to-zero de noche → ahorra CU-horas.

**Sostenido:**
4. **Mantener el auto-publish apagado y batchear deploys** (ya es política): cada deploy son 15 créditos; agrupar cambios de una sesión en **un** deploy en vez de varios.
   - **Sobre el pico del 2-jul (~500 créditos en un día):** el patrón más probable es una **ráfaga de builds/deploys** — con auto-publish todavía **encendido** en ese momento, cada push a `main` disparaba un deploy (15 cr c/u; ~33 deploys ≈ 500 cr), o un rebuild en loop. **Cómo se evita (y ya está mitigado):** el auto-publish quedó **apagado** (`ch-estetica`: "Builds are stopped") justo el 3-jul, así que los pushes de trabajo ya **no** deployan solos; se publica solo a pedido y batcheado. Si vuelve a aparecer un pico, revisar en el panel si fue deploys (→ política de deploy) o compute/tráfico (→ `force-dynamic`, punto 1). *Causa exacta a confirmar con el desglose del panel (§6).*
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
