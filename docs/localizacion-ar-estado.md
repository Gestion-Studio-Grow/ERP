# Localización fiscal AR — estado y punto de reanudación

**Qué es:** el mapa vivo del subsistema de localización fiscal argentina. Una sesión
que retoma esto lo lee primero y sabe al toque qué está construido, qué falta y con
qué comando seguir. Última actualización: 2026-07-04.

**Decisiones de fondo:** ADR-019 (contrato de emisión + conector) y ADR-020
(Localización AR como subsistema extensible). Toda decisión está ahí; esto es el
estado de implementación.

> **Estado en una línea:** el **motor de cálculo y armado de comprobantes está
> completo y testeado (37/37)**; falta la **conexión real con ARCA** (adaptador
> AfipSDK + homologación) y el **front**. Todo está **apagado por
> `LOCALIZACION_AR_ENABLED`** — inerte en producción, no toca nada del piloto.

---

## Lo que YA está construido (código en `src/lib/localizacion-ar/`)

| Módulo | Qué hace |
|---|---|
| `calculo-fiscal.ts` | **Motor de cálculo.** IVA multi-alícuota con desglose por alícuota (array `Iva[]` de WSFEv1), centavos enteros sin deriva de float, exento/no-gravado, **selección de letra A/B/C** según emisor+receptor, **notas de crédito** (`calcularNotaCredito`), validación fail-closed y auto-chequeo `assertConsistente`. |
| `identidad-fiscal.ts` | Validación de **CUIT** (dígito verificador), formateo, y **condición IVA receptor** (RG 5616, obligatorio desde 1/9/2026). |
| `comprobante-arca.ts` | Catálogo de códigos ARCA: `CbteTipo`, `DocTipo`, `Concepto`, moneda PES, formato de número `0001-00000123` y de fecha `YYYYMMDD` **en hora AR**. |
| `connector.ts` + `connectors/` | `FiscalConnector` **por capacidades** (ADR-020 D2) + registro. Hoy solo el **stub de homologación** (CAE ficticio) para ejercitar el pipeline. |
| `commands.ts` | Comandos idempotentes `registerFiscalAuthorization/Rejection` — única puerta por la que ARCA impacta el dominio. |
| `emit.ts` | `requestFiscalComprobante` (factura) y `requestNotaCredito` (NC): crean doc + outbox en una tx e intentan sincrónico best-effort (B3). |
| `outbox.ts` | `procesarEvento` + `drainOutbox`: arma el `EmisionInput` (solicitud ARCA completa) y aplica el resultado; red que garantiza que ningún comprobante quede sin CAE. |
| `types.ts` / `index.ts` | `EmisionInput` (contrato ARCA completo) y API pública del subsistema. |
| `__tests__/` | **37 casos**, `npm test` (`node:test` vía tsx, sin deps nuevas). |

**Datos (schema + migración):** `FiscalDocument`, `TenantFiscalConfig`,
`TenantJurisdiccion`, `OutboxEvent` (todos con `tenantId`). Migración
`prisma/migrations/20260704000000_add_localizacion_ar_fiscal` **generada pero NO
aplicada** (se aplica en un branch de Neon primero).

**Infra:** route `/api/localizacion-ar/drain` (patrón `CRON_SECRET`) para la
Scheduled Function. Enganche en `confirmPayment` detrás del flag.

---

## Lo que FALTA (el trabajo de reanudación)

Todo esto está detallado en la cola `docs/PROXIMOS-PASOS.md`. Resumen:

1. **Adaptador AfipSDK** que implemente `FiscalConnector.emitir` (WSAA + WSFEv1) y
   se registre en `connectors/index.ts` **en lugar del stub**. Mapea el
   `EmisionInput` (que ya trae `cbteTipo`, `conceptoId`, fechas, `Iva[]`,
   `CbtesAsoc`, condición IVA receptor) a la llamada SOAP. Validar Ids contra
   `FEParamGetTiposIva` / `FEParamGetCondicionIvaReceptor` en runtime.
2. **Aplicar la migración** en un branch de Neon, después en prod.
3. **Cargar `TenantFiscalConfig`** del tenant de estética (CUIT, punto de venta,
   `ambiente=HOMOLOGACION`) con la credencial **fuera del repo**.
4. **Ensayo obligatorio contra homologación de ARCA** antes de pasar a `PRODUCCION`.
5. **Activar `LOCALIZACION_AR_ENABLED`** + programar la Scheduled Function de Netlify
   que pega a `/api/localizacion-ar/drain`.
6. **Front:** mostrar CAE / nº de comprobante en el detalle del pago.

**Ideas en la misma línea (opcionales, no bloquean):** wire de la NC en la
cancelación de turnos; notas de débito; concepto productos (stock). El **eje
provincial (IIBB/Convenio Multilateral)** queda en Fase 4 de ADR-020 — se abre solo
cuando un cliente real lo pida (no se especula).

---

## Cómo reanudar

Cuando retomes, abrí:

```
/sesion-feature Plugin ARCA — puesta en producción (homologación + AfipSDK)
```

Esa sesión lee este documento + ADR-019/020 + el código de `src/lib/localizacion-ar/`
y arranca por el punto 1. **Verificá primero** que el motor sigue verde: `npm test`.
