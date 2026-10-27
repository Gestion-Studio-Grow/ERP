# Webhooks por negocio (Mercado Pago y WhatsApp) — Tanda S1

El negocio de un aviso sale de la **conexión**, nunca del host. Código: `src/lib/webhooks/resolver-negocio.ts`,
`src/lib/mercadopago-dispatch.ts` (`atenderAvisoMP`), `src/app/api/webhooks/{mercadopago,whatsapp}/route.ts`.

Las variables las carga **el dueño** en Vercel (secretos: nunca en el repo ni en un chat). Los valores de abajo
son **falsos**.

## Mercado Pago

### `MP_WEBHOOK_SECRETS` (nueva, opcional) — JSON, un secreto por slug de negocio

```json
{"magra":"mp_whsec_FALSO_0000000000000000magra","breakpoint":"mp_whsec_FALSO_00000000000breakpoint"}
```

- Claves: el `Tenant.slug` exacto (minúsculas). Valores: la «clave secreta» del webhook en el panel de
  desarrolladores de Mercado Pago de ESA integración. Una sola línea, comillas dobles.
- JSON roto o un valor vacío → el webhook contesta **503** a todo (fail-closed) hasta corregirlo.

### `MP_WEBHOOK_SECRET` (la de siempre) — texto, el secreto global

```
mp_whsec_FALSO_global00000000000000
```

Reglas (`firmaDelNegocio`):

| Situación | Resultado |
|---|---|
| Ni `MP_WEBHOOK_SECRETS` ni `MP_WEBHOOK_SECRET` | 503 `webhook-secret-missing` |
| El negocio del pago tiene secreto en `MP_WEBHOOK_SECRETS` | vale sólo ese; firmado con otro → 401 + AuditLog |
| El negocio no tiene secreto propio, existe el global | vale el global, con aviso en el log `monitor` (`aviso: mp-webhook-secreto-global`) |
| `ts` de `x-signature` a más de ±5 min del reloj | 401 `ts-fuera-de-ventana` |

### `external_reference` del cobro

Formato: `gsg:<slug>:<tipo>:<id>` con `tipo` = `pedido` | `turno` (`referenciaDeNegocio()`).
Ejemplo: `gsg:magra:pedido:ped_FALSO123`.

- Con **dos o más** negocios en la base: sin ese formato, con un slug que no existe, con un negocio sin el módulo
  `mercadopago` (o suspendido), o llegando por la URL de OTRO negocio → **200 sin efecto** y fila en `AuditLog`
  (`channel: webhook`, `action: rechazado`, `entity: WebhookMercadoPago`) del negocio que se pueda nombrar.
- Con **un solo** negocio en la base: la referencia vieja (`pedido:<id>`, id de turno, o ninguna) sigue yendo a
  ese negocio (compatibilidad con el despliegue de un cliente).
- PENDIENTE (fuera de S1): que el link de pago (`src/lib/cobros-actions.ts`, `referenciaDePedido`) emita el
  formato nuevo. Hasta entonces, con dos negocios, un pedido pagado por link se marca a mano con «Cobrar».

Otros: 60 POST/min por IP (429 con `Retry-After`) antes de verificar nada. Un pago que la cuenta no tiene
(4xx de MP) → 200 sin efecto. MP caído o error de base → 500 (MP reintenta con espera).

## WhatsApp

### `WHATSAPP_PHONE_NUMBERS` (nueva) — JSON, `phone_number_id` de Meta → slug

```json
{"100000000000001":"breakpoint","100000000000002":"magra"}
```

- Clave: el «Identificador del número de teléfono» de WhatsApp Manager (no el número en sí). Valor: `Tenant.slug`.
- Sin mapeo (o JSON roto) → **200 sin efecto** y aviso en el log (`aviso: wa-numero-sin-negocio`). Meta no reintenta.
- Sigue valiendo todo lo anterior: `PADEL_WHATSAPP=cloud`, `WHATSAPP_APP_SECRET` (503 sin él, 401 firma mala),
  60 POST/min por IP.

## QA clic por clic (local, dos negocios)

1. Con `MP_SIMULAR_AVISOS` y dos tenants locales, generar el link de un pedido de `magra` y simular el aviso →
   el pedido queda cobrado y `breakpoint` no cambia.
2. Reenviar el mismo aviso → sin doble cobro (un solo asiento).
3. Aviso con `external_reference` de `breakpoint` llegando al host de `magra` → rechazado y auditado.
4. Aviso con `ts` viejo → 401.
5. 100 POST forjados → 429 a partir del 61.

Los puntos 2 a 5 los cubre `src/lib/webhooks/webhooks-por-negocio-postgres.test.ts` y
`src/lib/webhooks/aviso-mp.test.ts`.
