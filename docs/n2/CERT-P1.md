Veredicto final: **CON OBSERVACIONES** — sin fallas alta/media; 1 falla baja abierta.

# Certificación · Tanda P1 — Conexiones y secretos por negocio

- **Rama:** `n2/p1-conexiones` · **base del diff:** `06b3a0f` (= `origin/main` 90297d9 + merge de `origin/n2/s1-webhooks-por-conexion`).
- **Commits:** `ad7cc9e` núcleo E3 · `430eae8` cobros y webhooks S1 por conexión · `1b2545d` correcciones de certificación.
- **Riesgos certificados:** seguridad, plata. Workflow `tanda-gsg` (Opus), 1 vuelta de corrección, **escaladoAFable: no**.
- **Migraciones:** ninguna. Las tablas E3 (`IntegracionConexion`, `IntegracionCredencial`, `EventoIntegracion`) ya están en
  `20260925120000_lanzamiento_base`.

## Criterios
| ID | Resultado |
|---|---|
| P1-C1 `crearConexion` cifra con `cerrarSecreto`; sin `INTEGRACIONES_MASTER_KEY` → error y nada escrito | cumple |
| P1-C2 `POST /api/integraciones/c/{token}`: fail-closed, `normalizar`, dedupe, `runInTenantContext`, 404 sin pista | cumple |
| P1-C3 MP, WhatsApp y ARCA en `CONECTORES` con simulador y en `src/modules/catalog.ts` | cumple |
| P1-C4 `pagos-dispatch` usa el token de la conexión; env global sólo con `MP_MODO_LEGADO=1`, auditado | cumple |
| P1-C5 webhooks de S1 delegan resolviendo la conexión por firma (tope 20, tiempo constante) | cumple |
| P1-C6 dos negocios, dos conexiones MP, cero cruce; `cuentaExterna` repetida entre negocios rechazada | cumple |
| P1-C7 `rotarCredencial` cambia DEK y `ultimos4`; la vieja deja de verificar | cumple |

## Verificación
- `tsc --noEmit`: limpio. Suites de la zona (integraciones, webhooks, pagos/cobros-dispatch, plugins MP/WA/ARCA, Postgres
  efímero con dos negocios y doble envío): 310/311.
- Suite completa: 6865/6871. Las 6 fallas **ya fallan en la base `06b3a0f`** (verificado corriéndolas ahí) y están fuera
  del diff: `redondeos-locales`, `pie-pegado-zona-segura`, `reminder-sweep-postgres` (sin canal de envío en el arnés) y 3
  subtests de `club/cuenta-y-buffet-pantalla` (selector ambiguo en Playwright).
- Adversariales del certificador, vuelta 2: 8/9. El que falla es la falla baja de abajo.

## Vuelta 1 → corregido en `1b2545d`
1. `/c/{token}` sin handler de MP en producción → ahora acredita con el token de su conexión; sin doble asiento.
2. Links de cobro con token global → token de cada negocio; sin conexión ni flag, `CobrosSinConexionError`.
3. Eventos «recibido» trabados → lease de 5 min, un solo reclamo con reenvíos en paralelo.
4. Tope de 20 mal contado → cuenta conexiones, no negocios; con más de 20, rechazo sin leer pagos.
5. Reconexión sin `cuentaExterna` dejaba dos activas → una sola activa; el token viejo da 404.

## Falla abierta
- **BAJA** · Reconectar la MISMA cuenta de MP (misma `cuentaExterna`) en el mismo negocio da `cuenta_en_uso`
  (`src/integraciones/conexiones.server.ts:255`). Falla cerrada, sin riesgo de plata; `rotarCredencial` sirve de
  alternativa. La va a necesitar el alta por OAuth (P5/P7). Arreglo: reactivar y rotar la conexión del mismo negocio, o
  liberar `cuentaExterna` al desconectar.

## Observaciones (deuda anotada)
- Resolver por firma o cuenta abre una transacción por negocio con el módulo activo. Escala mal y amplifica un DoS
  (lo mitiga el rate limit). Para ir más allá del tope de 20 hace falta una función `SECURITY DEFINER` por `rutaHash` o
  cuenta: es una migración, va al paquete S2 (Gate 2).
- `estadoIntegracionMP` (`mercadopago-auto.ts:357`) mira sólo el token global.
- La propiedad de la `cuentaExterna` de WhatsApp (`phone_number_id`) no se verifica al crear la conexión. Todavía no
  hay pantalla de alta (P7).
- El lease de 5 min puede coincidir con un `maxDuration` de ~300 s. El handler es idempotente por `payment_id`, así que no
  hay doble asiento.

## Lo que carga el dueño (nada de esto lo hizo la tanda)
- `INTEGRACIONES_MASTER_KEY` (y `INTEGRACIONES_MASTER_KEY_ID`) en Vercel.
- `MP_MODO_LEGADO=1` en Vercel **antes** de desplegar P1: sin conexión creada, cobros, links y «Sincronizar MP» fallan
  cerrados. Se saca cuando cada negocio tenga su conexión MP.
- QA por CLI del arnés con `magra` y `breakpoint` (crear conexión, disparar simulador, dos filas de `EventoIntegracion`,
  reenvío → dedupe): queda pendiente para el entorno con base.
