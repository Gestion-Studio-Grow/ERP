# Runbook — Incidentes del motor de facturación (ARCA)

**Para:** dueño / guardia de Plataforma. **Zona:** estándar, precisa (ADR-046).
**Primera mirada, siempre:** `GET https://<dominio>/api/ready` → bloque `arca`. No toca datos de nadie:
son conteos agregados, sin nombres de negocios.

```json
"arca": {
  "estado": "critico",            // apagado · ok · atencion · critico · sin-medicion
  "facturacion": true,            // ARCA_INVOICING_ENABLED
  "modo": "homologacion",         // stub · homologacion · real (ARCA_MODO)
  "alertas": ["cae-en-duda"],     // códigos de abajo
  "pendientes": 4, "enDuda": 1, "trabados": 0, "muertos": 0, "rechazos24h": 0,
  "pendienteMasViejoMin": 95, "ultimoExito": "2026-10-22T06:01:12.000Z",
  "negociosConAlerta": 1, "negociosSinMedir": 0, "medidoEn": "…"
}
```

La medición se guarda 2 minutos (no golpea Neon en cada consulta). `/api/health` (sin base) dice además
cómo quedó configurado el deploy: `arca.facturacion`, `arca.modo`, `arca.cronProtegido` y cuántos negocios
tienen cada flag (`arca.flags`).

**Para saber QUÉ negocio:** el semáforo no lo dice a propósito (es público). Se mira en:
- la **consola del operador** → ficha del negocio → estado de ARCA, o el **monitoreo de cartera** del
  producto Contador (`src/lib/monitor-core.ts`: señales por cliente, «outbox trabado», «cert por vencer»);
- los **logs de Vercel** (ver [monitoreo.md](monitoreo.md)): las líneas `scope:"arca"` y
  `scope:"health.arca"` traen `tenantId`.

## La palanca de emergencia (kill-switch)

Si la facturación está haciendo daño (emitiendo mal, duplicando, rechazando todo): **apagar la llave global**.

1. Vercel → `erp-ch` → Settings → Environment Variables → `ARCA_INVOICING_ENABLED` → valor `false`
   (o borrarla). Sólo Production.
2. **Redeploy** del deploy actual (Deployments → ⋯ → Redeploy, sin cambiar código). Es un deploy: lo
   decide el dueño.
3. Verificar: `/api/health` → `arca.facturacion: false`; `/api/ready` → `arca.estado: "apagado"`.

Con la llave abajo: el cron responde `skipped`, no se pide ningún CAE nuevo, y las ventas se siguen
cobrando (la facturación es best-effort: quedan pendientes y salen cuando se vuelve a prender). Apagar
un solo negocio sin tocar a los demás: [flags.md](flags.md).

---

## ARCA caído

**Síntoma:** `sin-exito-reciente` y/o `envios-trabados`; en los logs, `ArcaPasajeroError`, timeouts
(el llamado a ARCA se corta a los 15 s) o errores SOAP 5xx. Varios negocios a la vez = es ARCA, no nosotros.

1. **Confirmar que es ARCA:** estado público de los web services de ARCA (método `FEDummy` de WSFEv1:
   devuelve `AppServer`/`DbServer`/`AuthServer` = `OK`). Si alguno no da OK, es de ellos.
2. **No hacer nada en el código.** El outbox reintenta solo con espera creciente; los envíos quedan
   pendientes, nadie pierde una venta.
3. Si dura más de un día hábil: avisar a los clientes con el texto de [soporte.md §ARCA caído](soporte.md#arca-está-caído).
4. Cuando vuelve: esperar la corrida del cron (03:00 ART) o pedirle al negocio «Autorizar los pendientes»
   desde su panel (procesa sólo los suyos).
5. **Cierre:** `/api/ready` vuelve a `ok`, `ultimoExito` reciente.

## CAE en duda

**Síntoma:** alerta `cae-en-duda` (crítica). Un envío tiene un **número anotado** para ARCA
(`payload.intentoArca`), no está cerrado y ningún despacho lo tiene tomado: el pedido salió pero no
sabemos si ARCA llegó a autorizarlo (corte de red, proceso muerto a mitad).

**Lo que hace solo el sistema (ENG-020):** el próximo despacho **consulta** ese número a ARCA
(`FECompConsultar`) **antes** de pedir otro. Si ARCA lo tiene, registra ese CAE; si no, pide de nuevo con
el mismo número. Por eso **la regla es no reemitir a mano**: se duplicaría la factura.

1. Esperar una corrida (cron o «Autorizar los pendientes» del negocio). En la mayoría de los casos se
   resuelve sola.
2. Si sigue en duda después de una corrida con ARCA sano: mirar el log `scope:"arca"` de ese envío
   (`tenantId`) y el motivo.
3. Verificación manual (dueño o contador del negocio, con clave fiscal): ARCA → «Comprobantes en línea» /
   consulta de comprobantes del punto de venta → ¿existe ese número?
   - **Existe:** el siguiente despacho lo va a registrar. Si no lo hace, es un bug: abrir incidente para la
     célula de facturación con el `tenantId` y el número (sin pegar CUIT del receptor en el chat).
   - **No existe:** el siguiente despacho lo pide. Nada que hacer.
4. **Nunca** borrar filas del outbox ni marcar como procesado a mano en Neon (Gate 2 + riesgo fiscal).

## Rechazos masivos

**Síntoma:** `rechazos-masivos` (≥ 10 en 24 h, crítica) o `rechazos` (≥ 3, atención). ARCA **contestó**
y dijo que no: es casi siempre configuración nuestra o del negocio, no un problema de ARCA.

1. Ver el motivo en el panel del negocio (Facturación → comprobantes rechazados: `rechazoMotivo`).
2. Causas típicas y quién lo arregla:

| Motivo de ARCA (aprox.) | Causa | Quién |
|---|---|---|
| CUIT del emisor no coincide / no autorizado | El certificado es de otro CUIT, o no está delegado el servicio `wsfe` | Dueño del negocio en ARCA (delegación) + cargar cert correcto por consola |
| Punto de venta inválido / no habilitado para WS | El punto de venta es de factura en línea, no «Web Services» | Contador del negocio en ARCA: alta de punto de venta WS |
| Condición frente al IVA del receptor | Falta o no coincide la condición del receptor (RG 5616) | Corregir datos del cliente en el panel |
| Fecha fuera de rango | Se intentó con fecha de hace más de 5/10 días | Revisar el lote; no se fuerza la fecha |
| Monto / alícuota | Cálculo de IVA o redondeo | Célula de facturación (bug) |

3. Si es un **bug nuestro** (mismo motivo en varios negocios distintos después de un deploy):
   [rollback.md](rollback.md) y apagar la facturación automática de los negocios afectados ([flags.md](flags.md)).
4. Las rechazadas **no** se reintentan solas (ARCA ya contestó). Una vez corregida la causa, se reemiten
   desde el panel.

## Certificado vencido

**Síntoma:** errores de autenticación (`loginCms`) en `scope:"arca"` de **un** negocio; el monitoreo de
cartera avisa con `DIAS_AVISO_CERT` (30 días) de anticipación.

1. Prevención: revisar la alerta «cert por vencer» del monitoreo de cartera una vez por semana.
2. El dueño del negocio (o su contador) genera el certificado nuevo en ARCA («Administración de
   certificados digitales») con la misma clave o una nueva.
3. Se carga **por la consola del operador**, en la ficha del negocio (ADR-066: el certificado va por
   negocio, cifrado; nunca por variable de entorno ni por chat).
4. «Autorizar los pendientes» del negocio → salen los que quedaron esperando.
5. Si se expuso una clave privada en algún lado: **revocar** el certificado en ARCA y generar otro (SEC-1).

## Cron sin correr

**Síntoma:** `cron-sin-correr` (un envío abierto de hace más de 26 h). El cron de ARCA corre **una vez por
día** a las 06:00 UTC = 03:00 ART (`vercel.json`, plan Hobby: no admite más seguido — PD-3).

1. `/api/health` → `arca.cronProtegido`. Si es `false`, falta `CRON_SECRET` en Production: el cron
   responde 503 y no despacha. El dueño la carga (Vercel → Environment Variables) y redeploy.
2. Vercel → `erp-ch` → Settings → **Cron Jobs**: ¿figura `/api/cron/arca-outbox`? ¿Qué dice la última
   ejecución? (Los cron jobs **sólo corren en producción**.)
3. Logs de Vercel filtrando por la ruta `/api/cron/arca-outbox`: ¿401 (secreto mal), 503 (sin secreto),
   500 (error nuestro), `skipped` (llave global apagada)?
4. Para destrabar ya: en Cron Jobs → **Run** (lo corre Vercel con su secreto), o que cada negocio toque
   «Autorizar los pendientes».
5. Si hace falta que corra más seguido: **es gasto** (plan Pro). Se eleva al dueño, no se cambia el cron.

## Envíos trabados / muertos

- `envios-trabados` (atención): un envío con ≥ 3 intentos fallidos. Mirar `lastError` en los logs; si es
  ARCA caído, ver arriba; si es configuración (CUIT inválido en modo real), arreglar el dato del negocio.
- `envios-muertos` (crítica): un envío se rindió. Hoy el outbox de ARCA no marca `muertoEn` (lo usa la suite
  de integraciones); si aparece, es un cambio de comportamiento: incidente para la célula de facturación.

## Medición incompleta / sin medición

`/api/ready` no pudo medir uno o más negocios (o tardó más de 5 s). No es un problema de facturación en sí:
mirar el log `scope:"health.arca"` (trae el `tenantId` y el error). Si coincide con la base lenta, ver el
consumo de Neon (plan free) antes que nada.

---

## Después de cada incidente

- Una línea en `docs/lecciones-aprendidas/registro.md` (ADR-047) si hubo algo que aprender.
- Si el umbral de una alerta estuvo mal, se ajusta en `src/app/api/ready/motor-arca.ts` (están exportados).

— Elaborado por GSG (Plataforma, publicación y mantenimiento)
