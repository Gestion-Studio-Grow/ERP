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
- Quién lo escribe (vuelta 3 de la certificación):
  - el link de un pedido (bandeja de Pedidos, `generarLinkDePagoDePedido`) → `gsg:<slug>:pedido:<id>`
    (`referenciaDelLinkDePedido`);
  - el link manual («Cobrar con link», `generarCobro`, `referenciaDelLinkManual`): un id de turno →
    `gsg:<slug>:turno:<id>`; `pedido:<id>` → `gsg:<slug>:pedido:<id>`; vacía → sin referencia (venta suelta);
    otro texto → tal cual (no nombra pedido ni turno). **Una referencia que empieza con `gsg:` se rechaza**:
    escrita a mano, un negocio podría hacer que el aviso cobre un pedido de otro.
  - En las dos, el AuditLog del link guarda `referenciaMP` (lo que viajó a Mercado Pago).
- Con dos o más negocios **no se atribuyen** (200 sin efecto + log; AuditLog sólo si la URL nombra un negocio):
  - los links generados ANTES del push de S1 (`pedido:<id>`, id de turno pelado): el pedido pagado se marca a
    mano con «Cobrar». Para encontrarlos: log `mercadopago.webhook` «aviso rechazado sin efecto» con
    `motivo: referencia-ilegible` (trae `paymentId` y `externalReference`);
  - los pagos sin referencia (link manual sin referencia, QR, transferencias a la cuenta): con una sola cuenta
    de Mercado Pago por despliegue no hay de dónde sacar el negocio. Lo resuelve la cuenta por negocio de P5
    (P5-C2/P5-C3); hasta entonces los procesa la sincronización manual del negocio (Facturación → Bancos,
    `sincronizarMercadoPagoAction`), como hoy.

Otros: 60 POST/min por IP (429 con `Retry-After`) antes de verificar nada. Un pago que la cuenta no tiene
(404/400 de MP) → 200 sin efecto; token rechazado (401/403) → 503 + alerta
`monitor`; 429/408/409/5xx o red → 500. MP caído o error de base → 500 (MP reintenta con espera).

## WhatsApp

### `WHATSAPP_PHONE_NUMBERS` (nueva) — JSON, `phone_number_id` de Meta → slug

```json
{"100000000000001":"breakpoint","100000000000002":"magra"}
```

- Clave: el «Identificador del número de teléfono» de WhatsApp Manager (no el número en sí). Valor: `Tenant.slug`.
- JSON roto (o una entrada que no es texto) → **503 a todo** con alerta `monitor` (`aviso: wa-mapa-ilegible`), aun
  con un solo negocio: Meta reintenta y los mensajes llegan cuando se corrige. Vacía o `{}` = sin cargar.
- **Requisito previo al push con dos o más negocios:** cargar la variable en Vercel. Sin ella:
  - base con UN solo negocio → el mensaje va a ese negocio (compatibilidad, como Mercado Pago) con aviso al
    monitor (`aviso: wa-sin-mapa-negocio-unico`);
  - base con dos o más → **200 sin efecto** (`aviso: wa-numero-sin-negocio`) y Meta no reintenta.
- Con la variable cargada, un número que no está en el mapa → **200 sin efecto** y aviso en el log (`aviso: wa-numero-sin-negocio`). Meta no reintenta.
- Negocio `SUSPENDED` (por el mapa o por el negocio único) → **200 sin efecto** (`aviso: wa-negocio-suspendido`).
- La base no contesta al buscar el negocio → **500** (Meta reintenta).
- Sigue valiendo todo lo anterior: `PADEL_WHATSAPP=cloud`, `WHATSAPP_APP_SECRET` (503 sin él, 401 firma mala),
  60 POST/min por IP.

## Antes del push (lo hace el dueño; sólo lecturas)

1. `MP_WEBHOOK_SECRETS` en Vercel (D-10) o, como mínimo, `MP_WEBHOOK_SECRET`.
2. Si `PADEL_WHATSAPP=cloud` y producción tiene dos o más `Tenant` (contando demos y suspendidos):
   `WHATSAPP_PHONE_NUMBERS` cargada. Sin ella, los mensajes entrantes se descartan.
3. Todo negocio que hoy cobra con Mercado Pago tiene `mercadopago` en `Tenant.modules`; si no, sus avisos se
   rechazan (`negocio-sin-mercadopago`) y se pierde el cobro o la factura automática del turno. Consulta de
   sólo lectura en Neon:

   ```sql
   SELECT t.slug, t.status, 'mercadopago' = ANY (t.modules) AS con_modulo,
          count(a.id) FILTER (WHERE a."createdAt" > now() - interval '90 days') AS links_90_dias
   FROM "Tenant" t
   LEFT JOIN "AuditLog" a ON a."tenantId" = t.id
    AND ((a.entity = 'PaymentLink' AND a.action = 'create') OR (a.entity = 'Order' AND a.action = 'link-de-pago'))
   GROUP BY t.id, t.slug, t.status, t.modules
   ORDER BY links_90_dias DESC, t.slug;
   ```

   Una fila con `links_90_dias > 0` y `con_modulo = false` hay que corregirla (consola de operador) antes del push.

## Con RLS (`app_rls`)

La resolución del negocio de S1 lee **sólo** `Tenant` (`basePrisma`: por slug, por subdominio y los dos
primeros), que está fuera de RLS a propósito (`prisma/rls/0001_enable_rls.sql`, «EXCLUIDA a propósito») y que
`app_rls` puede leer (`0002_app_role.sql`). No necesita funciones `SECURITY DEFINER`. Todo lo demás (cobro,
auditoría, WhatsApp) corre con el negocio ya resuelto: `tenantTransaction({ tenantId })` o
`runInTenantContext`. Lo prueba `webhooks-por-negocio-postgres.test.ts` («RLS: como app_rls…»).

## QA clic por clic (local, dos negocios)

1. Con `MP_SIMULAR_AVISOS` y dos tenants locales, generar el link de un pedido de `magra` y simular el aviso →
   el pedido queda cobrado y `breakpoint` no cambia.
2. Reenviar el mismo aviso → sin doble cobro (un solo asiento).
3. Aviso con `external_reference` de `breakpoint` llegando al host de `magra` → rechazado y auditado.
4. Aviso con `ts` viejo → 401.
5. 100 POST forjados → 429 a partir del 61.

El punto 1 (con el link generado por la acción real) y los puntos 2 a 5 los cubren
`src/lib/webhooks/webhooks-por-negocio-postgres.test.ts` y `src/lib/webhooks/aviso-mp.test.ts`.
