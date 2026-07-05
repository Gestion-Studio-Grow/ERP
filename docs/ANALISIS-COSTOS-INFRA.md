# Análisis de costos e infraestructura (FinOps)

> **Alcance:** este documento analiza **LÍMITES de plan** y **PROYECCIÓN de capacidad**, no consumo medido. Los límites son valores oficiales (con fuente y fecha abajo); todo número de *consumo* es un **envelope ilustrativo con supuestos explícitos**, no una medición. **El consumo REAL se completa cuando accedamos a los paneles de Netlify y Neon** (§6). No se inventan cifras reales.
>
> **Fecha del relevamiento de límites:** 2026-07-05. **Verificar contra el plan vigente** antes de decidir un upgrade — Netlify y Neon revisan planes seguido (Netlify pasó a modelo de créditos; la tarifa de bandwidth se duplicó el 2026-04-14).

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

### 2.a Netlify — Free (modelo de **créditos**, 2026)

Netlify **ya no cobra build minutes**. Todo sale de un **pool único de 300 créditos/mes**, con **límite duro**: cuando se agotan, el sitio **deja de servir tráfico** (no hay auto-recharge; hay que subir de plan). Deploy previews, branch deploys y builds fallidos **no** consumen créditos.

| Recurso | Tarifa | 300 créditos equivalen a… |
|---|---|---|
| **Web Bandwidth** | 20 créditos / GB | ~15 GB |
| **Web Requests** | 2 créditos / 10.000 requests | ~1,5 M requests |
| **Functions & Agents Compute** | 10 créditos / GB-hora | ~30 GB-hora |
| **Production Deployments** | **15 créditos / deploy** | ~20 deploys |
| **Database Bandwidth / Compute** | 20 cr/GB · 10 cr/GB-h | *N/A para nosotros* (es la DB propia de Netlify; **nosotros usamos Neon** — nuestro costo de DB está del lado de Neon, no en estos créditos) |
| **Form Submissions** | gratis | — |
| Timeout de función (Free) | ~10 s síncrono | *verificar contra plan vigente* |

> Los recursos **comparten** el mismo pool de 300: 1 deploy (15 cr) = 5% del mes; 1 GB de tráfico = 6,7%.

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

**Descartado como "primero":** *build minutes de Netlify* — **ya no existen** en el modelo de créditos. El equivalente (deploys a 15 cr) está **controlado** porque el auto-publish está apagado.

**Orden probable de saturación** (piloto → crecimiento):
1. 🥇 **Neon storage 0,5 GB** (calendario, ratchet, corta la app).
2. 🥈 **Neon compute 100 CU-h** y **Netlify 300 créditos** (suben con tenants + tráfico + frecuencia de deploys/cron).
3. 🥉 **Neon egress 5 GB** / **Netlify bandwidth ~15 GB** (improbable primero, salvo reportes que traen datasets enteros — ADR-023 F3).

### Cuántos tenants/tráfico entran antes de pagar (envelope)

- **Netlify 300 créditos:** con deploys gateados (~4/mes = 60 cr) quedan ~240 cr para tráfico. A ~0,005 cr por page view *(supuesto: página ~200-300 KB, función ~300 ms @ 1 GB)* → **~40-50k page views/mes**. Para 1 salón de bajo tráfico, **sobra**; entran **varios tenants** antes de que Netlify sea el problema.
- **Neon compute 100 CU-h:** a 0,25-0,5 CU activos, son **200-400 horas activas/mes** *(supuesto)*. El cron + tráfico de horario comercial de **1 tenant** cabe con holgura; el margen se come al **sumar tenants**.
- **Neon storage 0,5 GB:** *(supuesto: fila de audit ~1-2 KB con el `changes` JSON + overhead de índices)* → orden de **cientos de miles de filas**. Un salón que genera unos miles de mutaciones/mes tiene, en teoría, **~1-3 años** de headroom **como tenant único** — pero **esto DEBE calibrarse con el tamaño real de la DB del panel de Neon**, que todavía no medimos. Con más tenants, el horizonte se **acorta proporcionalmente**.

> ⚠️ Estos rangos son **método, no medición**. El número que importa —a qué % de 0,5 GB estamos hoy y a qué ritmo sube— sale del panel (§6).

### Costo del primer upgrade

| Plataforma | Salto | Costo | Qué destraba |
|---|---|---|---|
| **Neon** | Free → **Launch** (pay-as-you-go, sin mínimo mensual*) | **$0,35/GB-mes** storage · **$0,106/CU-hora** compute · 500 GB egress incluidos | Saca el techo de 0,5 GB y de 100 CU-h. A escala de piloto (1-2 GB, compute bajo) la primera factura sería de **pocos dólares/mes** *(estimación, ~$5-15)*. *(*verificar si aplica algún fee base) |
| **Netlify** | Free (300 cr) → **Personal** | **$9/mes** = 1.000 créditos (3,3× headroom) | Más tráfico/deploys; sube el timeout de función |
| **Netlify** | → **Pro** | **$20/mes** = 3.000 créditos | Escala mayor / equipo |

**Lectura FinOps:** el **primer gasto real** va a ser **Neon** (por storage), y es **barato de cruzar** (pay-as-you-go, centavos por GB). Netlify probablemente aguante en Free bastante más. Ninguno de los dos "explota" en costo: el salto inicial combinado es del orden de **$10-25/mes**.

---

## 5. Cómo se relaciona con decisiones ya tomadas

- **ADR-023 F8** (retención de `AuditLog`): es la palanca directa del límite que se toca primero. Sin política de retención/archivado, el storage de Neon es una cuenta regresiva.
- **ADR-023 F3** (reportes que agregan en JS trayendo todo): infla egress y compute de Neon.
- **ADR-007** (análisis financiero): este documento le agrega el **eje storage** y traduce los planes al **modelo de créditos nuevo** de Netlify (ADR-007 es anterior a ese cambio — conviene enmendarlo).
- **`FUNDAMENTOS-Y-VISION.md` §8** (restricciones de plataforma): coherente — storage 0,5 GB como primer techo.

---

## 6. Métricas exactas a pulsar del panel (para completar con números reales)

### Netlify (el modelo cambió a créditos — mirar por crédito, no por minutos)

1. **Team → Billing → Usage** (o "Usage & credits"): **consumo del mes en curso sobre los 300 créditos**, con **desglose por recurso** (Bandwidth, Web Requests, Functions Compute, Production Deployments). Es la métrica madre.
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
1. **Sacar `force-dynamic` de las páginas PÚBLICAS que no lo necesitan** (home/marketing `(site)/page.tsx` + layout, y el listado de la vidriera `/tienda` con `revalidate` corto). Hoy cada visita anónima despierta Neon y corre una función. Es el ahorro más grande y toca las tres métricas (funciones Netlify, compute Neon, wakes). La reserva (disponibilidad en vivo) y el `/admin` **sí** siguen dinámicos.
2. **Retención de `AuditLog`** (ADR-023 F8): ventana holgada (~12-18 meses) + archivado futuro a R2. Ataca directo el límite que se toca primero.
3. **Revisar la frecuencia del cron de recordatorios:** cada wake mantiene Neon despierto ≥5 min. Correrlo con cadencia sensata (p.ej. cada 15-30 min u horario, no cada minuto) y en lo posible en **horario comercial**, para dejar que Neon caiga a scale-to-zero de noche → ahorra CU-horas.

**Sostenido:**
4. **Mantener el auto-publish apagado y batchear deploys** (ya es política): cada deploy son 15 créditos; agrupar cambios de una sesión en **un** deploy en vez de varios.
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
