# Monitoreo y alertas — suite de facturación

**Para:** dueño (las alertas las configura él: son cuentas y canales suyos). **Zona:** estándar.
Todo lo de acá es **costo $0** en los planes actuales (Vercel Hobby, Neon free), salvo donde se marca.

## Las tres señales

| Señal | Endpoint / fuente | Toca la base | Para qué |
|---|---|---|---|
| ¿Está vivo el deploy? | `GET /api/health` | **No** | Monitor de uptime cada 5 min. Dice qué commit corre y cómo quedó ARCA configurado. |
| ¿Puede atender? ¿Sale la facturación? | `GET /api/ready` | Sí (cacheado 2 min) | Smoke post-deploy y consulta a mano. Semáforo del motor ARCA. |
| Errores de runtime | Logs de Vercel (`logger` estructurado) | No | Diagnóstico con `tenantId`, `requestId`, `scope`. |

> **No apuntes un monitor cada pocos minutos a `/api/ready`.** Cada consulta (pasada la caché) despierta
> la base y mide cada negocio: en Neon free eso consume horas de cómputo y no deja que la base se duerma.
> Para el monitor: `/api/health`. `/api/ready`: después de cada deploy y a mano, o como mucho una vez por hora.

## Ver errores de runtime en Vercel

Cada `logger.error/warn/info` sale como **una línea JSON** con `ts`, `level`, `scope`, `msg`, y el
contexto del pedido (`requestId`, `tenantId` cuando hay). Los `scope` que importan acá:

| `scope` | Qué es |
|---|---|
| `arca` | El despacho a ARCA (dispatcher, reintentos, rechazos) |
| `health.arca` / `health.ready` | La medición del semáforo y la base de `/api/ready` |
| `global-error-boundary` | Una pantalla reventó en el navegador del usuario |

Dónde mirarlos:
1. Vercel → `erp-ch` → **Logs** (runtime logs). Filtrar por *Level: Error*, o buscar `"scope":"arca"`.
   En Hobby la retención es corta (del orden de una hora): para un incidente, mirar **en el momento**.
2. Vercel → `erp-ch` → **Observability** → errores por ruta (`/api/cron/arca-outbox`, `/admin/facturacion`, …).
3. Por línea de comandos (dueño, con su login de Vercel): `vercel logs <url-del-deploy>`.
4. El agente de Plataforma puede leerlos por el conector de Vercel (`get_runtime_errors` /
   `get_runtime_logs`) cuando el dueño lo pide: sólo lectura.

Los logs **no** llevan secretos ni el cuerpo de las facturas; sí llevan `tenantId` (interno). No pegues
líneas de log en canales con clientes.

## Alertas a configurar (acción del dueño)

En orden de prioridad. Las tres primeras cubren casi todo el riesgo, gratis.

1. **Uptime de la app (gratis):** UptimeRobot / Better Stack free → `GET https://<dominio>/api/health`
   cada 5 min, esperar 200 y la palabra `"status":"ok"`. Alerta a Telegram/WhatsApp/mail tras 2 fallas
   seguidas. **Uno por dominio de producto** (comerciante, contador, facturita) si están en hosts distintos.
2. **Smoke automático post-deploy (gratis, ya está):** el workflow `release` de GitHub corre
   `scripts/release/smoke.mjs` cada vez que Vercel avisa que terminó un deploy. Para enterarte si falla:
   GitHub → tu perfil → Settings → **Notifications** → Actions → «Notify me only on failed workflows»
   (mail). Requiere que la integración de Vercel con GitHub publique *deployments* (viene así por defecto).
3. **Semáforo de ARCA una vez por hora (gratis):** un monitor de palabra clave (UptimeRobot «keyword»)
   sobre `GET https://<dominio>/api/ready`, intervalo **60 min**, que alerte si aparece `"estado":"critico"`.
   Intervalo de 60 min a propósito: no mantener Neon despierto.
4. **Neon (gratis):** Neon Console → Settings → alertas de uso (horas de cómputo, almacenamiento) por mail.
   Evita el «se acabaron las horas y se cayó todo» silencioso.
5. **Alertas sobre logs (pago):** Vercel no alerta por contenido de logs en Hobby. Si hace falta («avisame
   cualquier `level:error` con `scope:arca`»): **Log Drain** de Vercel (plan Pro) hacia Better Stack /
   Axiom con una regla. Es gasto: decisión del dueño, después de la venta (ciclo demo → venta → inversión).

### Umbrales del semáforo (`src/app/api/ready/motor-arca.ts`)

| Código | Nivel | Regla |
|---|---|---|
| `cae-en-duda` | crítico | Envío con número anotado, sin despacho vivo y sin cerrar |
| `cron-sin-correr` | crítico | Envío abierto de hace más de 26 h (el cron es diario) |
| `envios-muertos` | crítico | Envío que se rindió sin cerrar |
| `rechazos-masivos` | crítico | ≥ 10 rechazos en 24 h en un negocio |
| `rechazos` | atención | ≥ 3 rechazos en 24 h en un negocio |
| `envios-trabados` | atención | Envío con ≥ 3 intentos fallidos |
| `sin-exito-reciente` | atención | Hay pendientes y el último CAE es de hace más de 26 h (o nunca) |
| `medicion-incompleta` | atención | No se pudo medir algún negocio |

Qué hacer con cada uno: [incidentes.md](incidentes.md).

## Smoke a mano

```bash
npm run release:smoke -- https://<dominio> --commit <sha>          # producción
npm run release:smoke -- https://<preview>.vercel.app --modo preview
```

O desde GitHub: Actions → **release** → Run workflow → `accion = smoke`, `url`, `commit`.

— Elaborado por GSG (Plataforma, publicación y mantenimiento)
