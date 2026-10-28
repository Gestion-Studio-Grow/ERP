# Dictamen S1 — webhooks por conexión (a48c3f0..14a9f5a, n2/s1-webhooks-por-conexion)

Veredicto: NO CERTIFICA (2 fallas media, 0 alta). Criterios S1-C1..C8 cumplidos; las fallas están en ramas vecinas.

Verificación: suites webhooks + plugin MP 80/80 (Postgres efímero corrió, 0 skipped); tsc 0 errores;
adversarial 2/6 pasan (4 rojos = F1 x3, F2). Test: `adversarial-s1.test.ts` en esta carpeta
(correr desde /tmp/wt/plataforma-tS1: `node --import tsx --test <ruta>`).

## F1 (media, plata) — 401/403/429 de MP al leer el pago se acusan con 200: aviso perdido
- Dónde: src/lib/mercadopago-dispatch.ts, `atenderAvisoMP`, rama `err.status >= 400 && err.status < 500`.
- Qué: token vencido/rotado (401/403) o rate limit de MP (429) se tratan como «pago que la cuenta no tiene» →
  200 `pago-no-encontrado`, sólo `logger.warn`. MP no reintenta: un pago acreditado de un pedido queda sin
  cobrar y sin alerta. Antes de S1 esto era 500 (MP reintentaba).
- Reproducción: subtests «F1 · MP responde 401/403/429 …».
- Arreglo: 200 sólo con 404 (y 400 de id inválido); 401/403 → 503 + `logger.error("monitor", …)`; 429/5xx → 500.

## F2 (media, despliegue) — WhatsApp sin `WHATSAPP_PHONE_NUMBERS` descarta TODO mensaje entrante
- Dónde: src/app/api/webhooks/whatsapp/route.ts (bloque `slugDelMensajeWA` → `numero-sin-negocio`).
- Qué: antes el negocio salía del host; ahora sin la variable cargada cada mensaje es 200 sin efecto y Meta no
  reintenta. MP tiene compatibilidad de negocio único; WA no. Push a main sin la variable = bandeja de pádel muda.
- Reproducción: subtest «F2 · WhatsApp en despliegue de UN negocio …».
- Arreglo: mismo fallback que MP (base con un solo negocio → ese negocio, con aviso al monitor) o gate de deploy
  que exija la variable; anotarlo en el runbook como requisito previo al push.

## Observaciones
- El emisor del link sigue escribiendo `pedido:<id>` (cobros-actions.ts:186,267): con >=2 negocios ningún pago
  real se atribuye (declarado PENDIENTE en el runbook). Lo mismo para turnos que antes resolvía el host.
- Nuevo requisito `modules` incluye "mercadopago" también con un solo negocio: si el negocio de prod no lo tiene,
  se corta la auto-facturación de turnos. Verificar antes del push.
- Comentario obsoleto en order-core.ts (`cobrarPedidoPorAvisoDePago`: «el webhook todavía no…»): el diff conecta
  el cobro público de pedidos, que ese comentario marcaba como decisión del dueño. Confirmar autorización.
- Sin negocio nombrable (>=2 negocios, sin host) no hay fila de AuditLog, sólo log (S1-C2 parcial, inevitable).
- `firma-de-otro-negocio` → 401: MP reintenta y cada reintento audita (acotado).
- Rate limit 60/min por IP compartido por todos los negocios (MP/Meta salen de pocas IPs): con escala, 429 a avisos
  legítimos. XFF primer elemento (en Vercel lo fija la plataforma).
- WA no mira `status`/módulo del negocio resuelto.
- El worktree tiene `.qa/facturacion-escala/rendimiento*.txt` modificados sin commitear (previo a esta certificación).

---

# Vuelta 2 — corrección 4c9c3a1 (sólo F1/F2 y ramas vecinas)

Veredicto: CON OBSERVACIONES (0 fallas alta/media/baja). F1 y F2 corregidas.

Verificación: suites webhooks + plugin MP 86/86; tsc 0 errores; adversarial v2 `adversarial-s1-v2.test.ts` 22/22.
El subtest F2 de la vuelta 1 (`adversarial-s1.test.ts`) sigue rojo porque prueba `slugDelMensajeWA`, que ya
no es el punto de decisión: lo reemplaza `negocioDelMensajeWA` (cubierto en v2). Obsoleto, no es falla.

## F1 corregida (src/lib/mercadopago-dispatch.ts:274-293)
- 401/403 → 503 + logger.error("monitor"); 429, 408, 409, 5xx, error de red → 500; sólo 400/404 → 200.
- Ninguna rama ejecuta `manejar`. Reintento 401 → luego OK: se cobra una vez, en magra.

## F2 corregida (resolver-negocio.ts:206-236, whatsapp/route.ts:73-96)
- Sin variable + un negocio → ese negocio con aviso `wa-sin-mapa-negocio-unico`; dos negocios → sin negocio.
- Con la variable cargada no hay fallback (número fuera del mapa o slug inexistente → sin negocio y sin consultar
  la lista de negocios). Dos números → dos negocios, cero cruces.

## Observaciones (no bloquean)
- `WHATSAPP_PHONE_NUMBERS` con JSON roto se trata como no cargada: con un negocio cae al fallback en silencio;
  con dos, cada mensaje se descarta (con warn por mensaje). Sugerido: aviso propio «variable ilegible».
- El fallback cuenta TODOS los `Tenant` (incluye demos o suspendidos): con un demo en la base de prod el fallback
  no se aplica. Verificar cuántos tenants tiene prod antes del push; el runbook ya exige la variable con >=2.
- Un error de la base al resolver el negocio en WA → 200 `numero-sin-negocio` (igual que antes de S1, sin regresión).
- Siguen vigentes las observaciones de la vuelta 1 (el emisor escribe `pedido:<id>`, `modules` con "mercadopago").
