# Core Fiscal — spec de schema para el PMO (secuenciar, regla 5)

**Autor:** frente Core Fiscal · **Fecha:** 2026-07-05 · **Estado:** 🟢 spec lista, **schema NO aplicado** (lo secuencia el PMO).

**Por qué este doc:** el plugin ARCA es *types-only* y **no toca la DB** (`core-contract.ts`,
ADR-022). Encender ARCA de punta a punta necesita el **lado Core**: persistir la factura, el CAE y
la config del emisor. Eso vive en `prisma/schema.prisma` + migración = **archivo compartido**, así
que **no lo mergeo yo**: lo especifico acá y el PMO lo entra en serie (regla 5 de la metodología).

Lo que YA está hecho y en la rama `frente/fiscal` (independiente del schema):
- `Pkcs7TraSigner` (firma CMS/PKCS#7 real del TRA para WSAA) + tests offline.
- `crearAfipClient(config, env)` — elige stub vs SOAP real por `ARCA_MODO` + PEM del emisor.
- El adapter SOAP (`soap.ts`) ya estaba; con el signer inyectado, WSAA queda operativo.

## 1. Modelos nuevos (propuesta)

```prisma
enum FiscalDocStatus { PENDIENTE  AUTORIZADO  RECHAZADO  ERROR }

/// Factura fiscal del Core. El plugin ARCA la autoriza; el Core la persiste.
model Invoice {
  id             String           @id @default(cuid())
  tenantId       String
  tenant         Tenant           @relation(fields: [tenantId], references: [id])
  // Datos del comprobante (los montos los calcula el Core, ADR-006)
  concepto       Int
  fecha          String           // AAAAMMDD (formato ARCA)
  tipoComprobante Int
  puntoVenta     Int
  neto           Decimal          @db.Decimal(14,2)
  iva            Json             // SubtotalIvaCore[]
  total          Decimal          @db.Decimal(14,2)
  // Resultado de ARCA
  status         FiscalDocStatus  @default(PENDIENTE)
  numero         Int?
  cae            String?
  caeVencimiento String?          // AAAAMMDD
  observaciones  Json?            // ObservacionArca[] si rechazo
  createdAt      DateTime         @default(now())
  authorizedAt   DateTime?
  @@index([tenantId, status])
  @@unique([tenantId, puntoVenta, tipoComprobante, numero])
}

/// Outbox: el Core encola InvoiceCreated; el worker lo procesa contra ARCA.
/// (Reusar el patrón de outbox existente si ya hay uno — verificar.)
model FiscalOutbox {
  id          String   @id @default(cuid())
  tenantId    String
  invoiceId   String
  payload     Json     // InvoiceCreatedEvent
  processedAt DateTime?
  attempts    Int      @default(0)
  lastError   String?
  createdAt   DateTime @default(now())
  @@index([tenantId, processedAt])
}
```

## 2. Config del emisor por tenant (credenciales)

El `EmisorConfig` (CUIT, homologación) y el **certificado/clave** son **por tenant**. Dos opciones;
recomiendo **B** por seguridad:

- **A — en DB:** campos `arcaCuit Int?`, `arcaPuntoVenta Int?`, `arcaHomologacion Boolean @default(true)`
  en `Tenant`. El cert/clave **NO** en DB en claro.
- **B — secret store / env por tenant (recomendado):** el cert/clave viven fuera de la DB (secreto),
  y `crearAfipClient` los lee vía `credencialDesdeEnv` (ya implementado) o un resolver de secretos.
  En DB solo metadatos no sensibles (CUIT, punto de venta, modo). El `clientePara(tenantId)` del
  handler arma el `EmisorConfig` desde el `Tenant` y la credencial desde el secreto.

## 3. Wiring que queda (post-schema, ya sin bloqueo de credencial para el código)
- `clientePara(tenantId)` en el worker: `EmisorConfig` desde `Tenant` + `crearAfipClient(config, env)`.
- `RegisterFiscalDocument` (superficie II) → `Invoice.update` con el CAE (server action con capability Factura).
- Worker que drena `FiscalOutbox` → `procesarInvoiceCreated` → registra el CAE.

## 4. Gate del dueño (acción humana, NO nuestro)
1. `prisma migrate deploy` de la migración de estos modelos (Gate 2).
2. Certificado X.509 + clave del emisor por tenant (homologación primero, ADR-022 §6).
3. `ARCA_MODO=real` + `ARCA_CERT_PEM`/`ARCA_KEY_PEM` (o el secret store elegido).
4. Validar contra **homologación** antes de producción.

> Con esto, "encender ARCA" es: aplicar migración + cargar cert + flag. **Construir ya está.**
