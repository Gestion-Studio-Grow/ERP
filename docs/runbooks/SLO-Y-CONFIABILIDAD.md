# SLO y confiabilidad — qué prometemos, cómo lo medimos y cómo crece

> Pedido del dueño (10/11/2026): «no tiene que caerse en ningún momento… disponibilidad, integridad… a futuro poder
> crecer y tener más de 10 clientes funcionando perfectamente».
>
> **Estado:** DISEÑO. Nada de esto tocó producción, Neon ni Vercel. Lo que es un número sin medir dice **NO MEDIDO**.
> Las decisiones que son del dueño están en **§C**, cada una con la opción recomendada.

## 0. La verdad incómoda primero

«Que no se caiga nunca» (100 %) no existe: dependemos de Vercel, de Neon, de Mercado Pago y de ARCA, y ninguno
promete 100 %. Lo que sí se puede prometer y cumplir:

1. **Que la plata no se pierda ni se duplique nunca** (integridad: objetivo 100 %, sin presupuesto de error).
2. **Que el sistema esté disponible casi siempre** (un número concreto por superficie, abajo).
3. **Que cuando algo falle nos enteremos antes que el cliente** y haya un paso a paso escrito.
4. **Que se pueda volver atrás**: copia diaria + restauración probada (hoy la restauración está **sin probar**).

## 1. SLO por superficie

Ventana: mes calendario. «Disponible» = la superficie responde bien (no 5xx, no timeout) a un pedido válido.

| Superficie | Qué incluye | Disponibilidad | Rapidez (p95) | Integridad |
|---|---|---|---|---|
| **Panel** | `/admin/*` (turnos, caja, pedidos, reportes) | 99,5 % → 99,9 % al pasar a planes pagos | Inicio < 2,5 s | lo que se guardó, está |
| **Cobro** | marcar cobrado, cobro de turno, webhook de Mercado Pago, libro de caja | 99,9 % | < 2 s | **100 %**: todo cobro tiene su asiento, una sola vez, en su negocio |
| **Vidriera** | sitio público, reserva y pedido online | 99,9 % | LCP < 2,5 s | una reserva confirmada nunca se pierde |
| **Factura ARCA** | emisión de comprobantes (cola `arca-outbox`) | la venta NUNCA espera a ARCA | 95 % con CAE en < 15 min si ARCA responde; 100 % en < 24 h | **100 %**: ni un comprobante perdido ni duplicado |

Por qué el panel arranca en 99,5 %: hoy la caída se detecta **una vez por hora** (`.github/workflows/monitor-caidas.yml`,
cron `23 * * * *`). Con esa resolución no se puede ni medir un 99,9 % (43 minutos al mes). Primero se mide bien, después se promete más.

ARCA es distinto a propósito: ARCA se cae seguido y no depende de nosotros. Por eso el objetivo no es «ARCA anda»
sino «la venta se concreta igual y la factura sale sola después». El semáforo ya existe: bloque `arca` de `GET /api/ready`
(`src/app/api/ready/route.ts`). Ojo: el cron de la cola corre **una vez por día** (`vercel.json`, `0 6 * * *`); con esa
frecuencia el «< 15 min» depende sólo del envío en el momento. Para sostenerlo hace falta un cron más seguido (§C-5).

## 2. Presupuesto de error

El presupuesto es cuánto podemos fallar en el mes sin romper la promesa.

| SLO | Presupuesto por mes | Equivale a |
|---|---|---|
| 99,5 % | 0,5 % | 3 h 39 min caídos |
| 99,9 % | 0,1 % | 43 min caídos |
| Integridad de plata 100 % | **cero** | una sola diferencia ya es incidente |

Reglas (las aplica el orquestador; no hace falta una persona de guardia):

- **Queda más del 50 %:** se trabaja normal.
- **Queda menos del 50 %:** todo cambio que toque cobro, caja, base o deploy va con certificación adversarial.
- **Se agotó:** se congela lo nuevo. Sólo entran arreglos de confiabilidad hasta que cierre el mes.
- **Integridad:** cualquier hallazgo del control de plata (§5) frena los cambios en caja y cobro hasta entender la causa.

## 3. Alertas

| Señal | De dónde sale | Umbral | Aviso | Estado |
|---|---|---|---|---|
| Producción no responde | `monitor-caidas.yml` → `/api/health` | 3 intentos fallidos | issue «🔴 Producción caída» | EXISTE (cada hora) |
| La base no responde | `/api/ready` devuelve 503 | 2 seguidos | issue | PROPUESTO: hoy nadie mira `/api/ready` en loop |
| Motor ARCA en rojo | bloque `arca` de `/api/ready` | trabados > 0 o CAE en duda > 0 | issue + `docs/runbooks/facturacion/incidentes.md` | PROPUESTO |
| Cobros ≠ caja | `control-integridad-plata.yml` (§5) | cualquier diferencia | issue «🔴 Integridad de plata» | **EN ESTE PR**, apagado hasta §C-1 |
| La copia diaria no corrió | `copia-diaria-base.yml` | 1 día sin artefacto | issue | PROPUESTO (hoy sólo deja un warning) |
| Conexiones al límite | Neon (`pg_stat_activity`) | > 80 % del tope del pooler | issue | PROPUESTO, necesita rol de lectura (§C-1) |
| Presupuesto de error | suma de las de arriba | < 50 % y agotado | issue mensual | PROPUESTO |

No se tocó `monitor-caidas.yml`, los timeouts ni `instrumentation.ts`: los está cambiando GSG-FABLE-ERP-001.

## 4. Guardia sin personas, a base de código

Acá no hay nadie despierto a las 3 de la mañana. La guardia es código, en tres escalones:

1. **Detectar (solo, siempre):** los workflows de §3. Cada uno abre UN issue (no duplica) y lo cierra solo cuando se arregla.
2. **Contener (solo, sólo lo reversible):** reintentos con espera, la cola de ARCA, timeouts, y que una falla de un tercero
   (MP, ARCA, WhatsApp) nunca tire abajo la venta. Esto vive en el código de la app, con tests.
3. **Reparar (nunca solo):** volver un deploy atrás, restaurar la base, tocar datos de plata. El código **arma** el
   diagnóstico y el paso a paso, y **espera al dueño**. Es la regla de siempre: lo irreversible se eleva.

Lo que la guardia de código **no** hace nunca: escribir en la base de producción, correr migraciones, borrar datos, ni
«arreglar» una diferencia de plata. Una diferencia se explica primero y se corrige después, con el dueño.

## 5. Control diario de integridad de plata (en este PR)

- **Qué es:** `scripts/sre/control-integridad-plata.mts` + `src/lib/sre/integridad-plata.ts`. Todo `SELECT`, dentro de
  una transacción `READ ONLY`. Mira los últimos 2 días, por negocio.
- **Qué compara:** cada cobro (`Collection`) contra su asiento `VENTA` en el libro de caja (`CashMovement`).
- **Los cinco controles:** cobro sin asiento · asiento con monto distinto · asiento duplicado · asiento que apunta a
  otro negocio · monto inválido (≤ 0 o no numérico).
- **Si la base va una migración atrás:** evalúa lo que puede y **dice** lo que no pudo. Un control sin evaluar nunca da OK.
- **Cron:** `.github/workflows/control-integridad-plata.yml`, todos los días 07:41 UTC. Sin el secret
  `INTEGRIDAD_DATABASE_URL` queda apagado y en verde: **mergear este PR no prende nada**.
- **Qué NO mira todavía:** cuentas corrientes (`RECEIVABLE`/`PAYABLE`), vouchers (no van al libro), cobros de taller, de
  inmobiliaria y de proyectos, ni Mercado Pago contra el banco. Son los próximos controles.
- **Límite conocido:** nunca corrió contra datos reales. La primera corrida puede mostrar diferencias históricas
  legítimas; se revisan una vez y se ajusta la regla, no los datos.

**Si salta el aviso:** 1) no tocar datos; 2) con los ids de muestra, mirar el cobro y su asiento; 3) si es un cobro sin
asiento, buscar en el log un `P2022` (columna que falta: migración pendiente en Neon); 4) informar al dueño con la causa.

## 6. Tamaño para 10, 25 y 50 clientes

**De dónde salen los números.** Cada instancia del servidor abre hasta `DB_CONNECTION_LIMIT` conexiones: **5** por
defecto, **10** propuesto y sin prender (`src/lib/db-pool.ts:44-48` y su cabecera). El pooler de Neon acepta hasta
10.000 clientes, pero atiende a la vez hasta 0,9 × `max_connections` de la compute: **~100** en la más chica
(0,25 CU) y **377** en 1 CU (dato de la documentación de Neon citado en `db-pool.ts`; **NO MEDIDO acá**).

Supuesto de carga (**estimación, NO MEDIDA**; se mide con `scripts/load-test.mjs`): en la hora pico, 2 pedidos
simultáneos por cliente, y una instancia cada 2 a 5 pedidos simultáneos.

| | 10 clientes | 25 clientes | 50 clientes |
|---|---|---|---|
| Pedidos simultáneos en el pico | ~20 | ~50 | ~100 |
| Instancias en el pico | 4 a 10 | 10 a 25 | 20 a 50 |
| Conexiones con límite 5 | 20 a 50 | 50 a 125 | 100 a 250 |
| Conexiones con límite 10 | 40 a 100 | 100 a 250 | 200 a 500 |
| Compute mínima de Neon | 0,25 a 1 CU (entra en ~100) | **1 CU fijo como piso** (377) | 1 a 4 CU con autoescalado |
| ¿Alcanza el pooler? | Sí | Sí con piso de 1 CU; **no** en 0,25 CU | Sí con límite 5; con límite 10 el pico roza el tope de 1 CU → piso 2 CU |
| Plan de Neon | Launch (pago por uso) | Launch | Scale (trae SLA y más días para volver atrás) |
| Plan de Vercel | Pro | Pro | Pro |
| Costo mensual estimado | **US$ 40 a 60** | **US$ 80 a 130** | **US$ 220 a 430** |

Cómo se arma el costo (**precios de lista de memoria, a confirmar en las páginas de precios antes de decidir**):
Vercel Pro ~US$ 20 por puesto por mes más consumo; Neon Launch ~US$ 0,11 por CU-hora y Scale ~US$ 0,22 por CU-hora,
más almacenamiento. Una compute de 0,25 CU prendida todo el mes son ~US$ 20; 1 CU, ~US$ 80 en Launch.

Tres cosas a tener claras antes de sumar clientes:

1. **Los planes gratuitos no sirven para vender.** El de Vercel no permite uso comercial y limita los cron a uno por
   día (los dos de `vercel.json` son diarios: indicio de que hoy estamos ahí — **NO MEDIDO**). El gratuito de Neon
   apaga la compute cuando no hay uso (el primer pedido tarda) y guarda muy poca historia para volver atrás.
2. **El cuello no es la cantidad de clientes, es el pico simultáneo.** Con RLS cada lectura es una transacción que
   ocupa una conexión; el Inicio pide unas 40 (`db-pool.ts`). Subir a 10 conexiones acelera el Inicio (940 → 575 ms,
   medido en laboratorio) pero duplica lo que cada instancia le pide a Neon. Por eso el piso de compute sube con los clientes.
3. **Ningún proveedor nos da SLA en los planes chicos.** Vercel lo da en Enterprise; Neon, desde Scale. Hasta ahí,
   nuestro SLO se sostiene con monitoreo, copia y restauración probada, no con un contrato.

## 7. Lo que falta para poder decir «confiable»

| Falta | Dónde está el plan |
|---|---|
| Probar que la copia se puede restaurar (RPO y RTO **NO MEDIDOS**) | `docs/runbooks/prueba-restauracion-rama-neon.md` |
| Verificar RLS en producción, en solo lectura | `docs/runbooks/verificar-rls-en-vivo.md` |
| Detectar caídas en minutos, no en una hora | §C-5 |
| Aclarar si RLS está aplicado en producción: `prisma/rls/0001_enable_rls.sql:49` dice «NO APLICADA A PRODUCCIÓN» y `prisma/rls/check-rls-live.mjs:8-10` la da por aplicada | lo cierra la verificación de RLS |
| Revisar la copia diaria: `pg_restore --no-privileges` (`copia-y-monitor.md`) no restaura los permisos de `app_rls`; y si el `pg_dump` corre con un rol sujeto a RLS, la copia puede salir vacía | lo cierra la prueba de restauración |

`docs/runbooks/prueba-recuperacion-manual.md` figuraba como existente, pero **no está en ninguna rama** del repo.

## §C. Decisiones del dueño

| # | Decisión | Opciones | Recomendada |
|---|---|---|---|
| C-1 | Prender el control diario de plata | (a) crear en Neon un rol sólo de lectura que vea todos los negocios y cargarlo como secret `INTEGRIDAD_DATABASE_URL`; (b) reusar la conexión de la copia diaria; (c) no prenderlo | **(a)**. Un rol que sólo puede leer no puede romper nada. Crear el rol es Gate: lo hace Operaciones con tu OK |
| C-2 | Correr la prueba de restauración | (a) ya, camino «punto en el tiempo» sobre rama temporal; (b) los dos caminos; (c) más adelante | **(b)**, en horario sin clientes. Sin esto la copia es una promesa, no un hecho |
| C-3 | Planes pagos | (a) Vercel Pro + Neon Launch ahora; (b) esperar a la venta 10; (c) seguir gratis | **(a) antes del próximo cliente que pague**, ~US$ 40 a 60 por mes. Primero confirmar en qué plan estamos hoy |
| C-4 | Subir `DB_CONNECTION_LIMIT` a 10 | (a) probar en un preview contra el pooler y prender; (b) dejar 5 | **(a)**, junto con C-3: con 0,25 CU y 10 clientes queda justo |
| C-5 | Detectar caídas más rápido y cron de ARCA más seguido | (a) monitor cada 5 min sobre `/api/ready` + cola de ARCA cada 10 min (necesita Vercel Pro); (b) dejar cada hora y diario | **(a)**, coordinado con GSG-FABLE-ERP-001 que está tocando el monitor |
| C-6 | Verificar RLS en vivo | (a) que Operaciones corra el plan una vez y después todos los meses; (b) sólo una vez | **(a)** |
| C-7 | Volver un deploy atrás sin persona | (a) automático si `/api/ready` falla después de un deploy; (b) sólo aviso | **(b) por ahora**; se revisa al llegar a 10 clientes |

— Elaborado por GSG
