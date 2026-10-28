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


---

# Respuesta del ingeniero — vuelta 3 (217f1d5, 3ad8f75, d70ae61)

Objetivo: cerrar cada observación de las vueltas 1 y 2: corregida con su test si es de S1; si no, traspasada a un
ID del plan (`PLAN-REINGENIERIA-N2.md`, Factory-GSG `da9b8f8`) o dejada como pregunta para la PMO.
No me autocertifico: queda para la vuelta 3 del certificador.

Verificación:
- `tsc --noEmit`: 399 errores, todos preexistentes. Son TS2307 (faltan playwright, three, pdf-lib) y TS7006/7031
  derivados. Hay 0 en `src/lib/webhooks`, `src/app/api/webhooks`, `cobros-actions`, `order-core`, `link-de-pago`
  y `mercadopago*`.
- Suites sin base:
  - webhooks + plugin MP + pedidos + facturación + dinero: 237 tests, 224 pass, 0 fail, 13 skip (los de Postgres);
  - cobros: 24 tests, 23 pass, 1 skip.
- `webhooks-por-negocio-postgres.test.ts` sobre PGlite en memoria (`ERP_TEST_PG_URL` a un socket local; nunca
  Neon): 7/7, 0 skip, con migraciones + `0002` + `0001` aplicadas.

## Observaciones: destino de cada una

| # | Observación | Destino | Evidencia |
|---|---|---|---|
| V1-a | El emisor escribe `pedido:<id>` (cobros-actions.ts:186,267) | **(a) S1, corregida** | Ver nota 1 |
| V1-b | Turnos que antes resolvía el host | **(a) S1, corregida** para el link con id de turno; el resto en nota 1 | `referenciaDelLinkManual` (resolver-negocio.ts) |
| — | **Nuevo**, encontrado al corregir V1-b: en el link manual, A podía escribir `gsg:<B>:pedido:<id>` y el aviso cobraba el pedido de B | **(a) S1, corregida** | `generarCobro` rechaza `gsg:` (cobros-actions.ts:75); test de Postgres «link manual: A no puede…» |
| V1-c | `modules` con "mercadopago" | El código queda como está: S1-C2 lo exige. El dato de producción va como **pregunta PMO-1** | Runbook «Antes del push», paso 3, con la consulta de sólo lectura |
| V1-d | Comentario obsoleto en order-core y autorización del cobro público de pedidos | **Cerrada.** La autorización es el plan aprobado: S1-C5, QA S1 paso 1, fila §3.2.5 «S1 → P5 → M2». Comentarios corregidos en order-core, link-de-pago y cobros-actions | 217f1d5 |
| V1-e | Sin negocio nombrable no hay AuditLog (S1-C2 parcial) | **Traspaso a P1-C2 / P5-C3.** Con la ruta por conexión el negocio siempre se conoce y el rechazo queda en `EventoIntegracion`. En S1 es inevitable: `AuditLog.tenantId` es obligatorio; queda el log estructurado | — |
| V1-f | `firma-de-otro-negocio` → 401: cada reintento audita | **Cerrada sin cambio.** Es lo que pide el principio 4 del plan («firma mala → 401»), y los reintentos de MP son finitos. La deduplicación de esas filas llega con `EventoIntegracion` (P1-C2) | — |
| V1-g | Rate limit 60/min por IP compartido entre negocios; XFF | **Traspaso a P7-C6** (store compartido, D-06). `src/lib/rate-limit.ts` es archivo propio de P7. Un 429 no pierde el aviso: MP reintenta todo lo que no es 2xx | — |
| V1-h | WhatsApp no mira `status` ni módulo | `status`: **(a) S1, corregida**: SUSPENDED → 200 sin efecto, igual que MP. Módulo: **traspaso a P6-C1**, porque la conexión de WhatsApp por negocio reemplaza el mapa y define qué atiende. Hoy el handler sólo toca filas de pádel del propio negocio | 3ad8f75; test «negocio suspendido» |
| V1-i | `.qa/…` modificados sin commitear | **Cerrada**: el worktree estaba limpio al empezar | `git status` vacío |
| V2-a | `WHATSAPP_PHONE_NUMBERS` roto se trata como no cargada | **(a) S1, corregida**: 503 a todo, alerta `monitor` `wa-mapa-ilegible`, sin fallback aun con un solo negocio (como `MP_WEBHOOK_SECRETS`). Vacía o `{}` siguen siendo «sin cargar» | Tests de la ruta (503) y del resolver |
| V2-b | El fallback cuenta todos los `Tenant` (demos, suspendidos) | **Cerrada sin cambio.** Es fail-closed: con un demo no hay fallback y se exige la variable. Contar sólo los activos ampliaría el adivinar. La carga va como **pregunta PMO-2** | Runbook «Antes del push», paso 2 |
| V2-c | Error de base al resolver en WhatsApp → 200 | **(a) S1, corregida**: 500, Meta reintenta | Test «la base no contesta» |
| V2-d | Siguen V1-a y V1-c | Ver arriba | — |

### Nota 1: V1-a y V1-b, emisor y turnos

**Por qué es de S1:**
- S1-C1 define el formato transitorio `gsg:<slug>:<tipo>:<id>`.
- El QA de S1, en el paso 1, pide «generar un link para un pedido de `magra` … queda cobrado».
- R-1 y §9 suponen que, con S1 publicada, MP puede activarse en un segundo negocio.

Sin emisor, con dos o más `Tenant`, ningún pago se atribuye.

**Qué se tocó:**
- `src/lib/cobros-actions.ts`. No figura en «Archivos propios» de S1, pero tampoco en «No tocar»; lo dejo dicho
  para la PMO.
- El link de pedido emite `gsg:<slug>:pedido:<id>` (cobros-actions.ts:192).
- El link manual, con un id de turno, emite `gsg:<slug>:turno:<id>`, y con `pedido:<id>` emite
  `gsg:<slug>:pedido:<id>`.
- El AuditLog guarda `referenciaMP`.

**Test:** «QA S1 paso 1» genera el link con la acción real (`ejecutarAccion`, dueña de A). La referencia sale del
AuditLog, el aviso por la URL genérica cobra el pedido en A con un asiento, y B no cambia.

**Lo que no se atribuye con dos o más negocios** (documentado en el runbook):
- **Links emitidos antes del push** (`pedido:<id>` viejo). Es un efecto de una sola vez. Se ubican por el log
  `referencia-ilegible`, que trae `paymentId` y la referencia, y se marcan con «Cobrar».
- **Pagos sin referencia** (link manual sin referencia, QR, transferencias). Con una cuenta MP por despliegue no
  hay de dónde sacar el negocio. **Traspaso a P5-C2/P5-C3** (cuenta y `notification_url` por conexión). Hasta
  entonces se procesan con la sincronización manual del negocio (`sincronizarMercadoPagoAction`), como hoy.

### Preguntas para la PMO
- **PMO-1:** ¿algún negocio de producción cobra hoy con MP sin `mercadopago` en `Tenant.modules`?
  - La consulta está en el runbook, «Antes del push», paso 3. Es de sólo lectura y la corre el dueño en Neon.
  - Encaja como ampliación de P-2, que hoy sólo mira Vercel, o como una P nueva.
  - Bloquea el push de S1.
- **PMO-2:** D-10 sólo nombra `MP_WEBHOOK_SECRETS`.
  - Con `PADEL_WHATSAPP=cloud` y dos o más `Tenant` en producción, también hace falta cargar
    `WHATSAPP_PHONE_NUMBERS` antes del push; si no, los mensajes entrantes se descartan.
  - ¿Se amplía D-10?
- **PMO-3:** ¿quién es dueño de las funciones de ruteo bajo RLS (ver abajo)? Hoy el traspaso de P1 apunta a S2,
  que está cerrada, y nadie lo cierra. Las candidatas son reabrir S2, o P5/P6 con su propio Gate. S1 no las
  necesita.

## Ruteo bajo RLS: qué necesita S1

**Con qué rol corre:**
- `basePrisma` usa `DATABASE_URL` tal cual (prisma-base.ts:7-17).
- Con RLS encendido en producción, eso es `app_rls`, sin GUC de negocio en el momento de resolver.
- [A VALIDAR] Que producción ya corra como `app_rls` sale de la memoria del go-live; acá no hay `.env` ni acceso a
  Neon. Se cierra con P-1/P-2.

**Qué lee:**
- Sólo `"Tenant"`: mercadopago-dispatch.ts:186-188 y whatsapp/route.ts:80-81.
- `Tenant` está fuera de RLS a propósito (0001_enable_rls.sql:41).
- `app_rls` tiene `SELECT` (0002_app_role.sql:58).
- `0003` (FORCE) sólo alcanza a tablas con `tenantId`, así que tampoco lo toca.
- Lo que viene después de resolver corre con el negocio puesto: `tenantTransaction({ tenantId })`
  (mercadopago-dispatch.ts:74,101) o `runInTenantContext` (:330; whatsapp/route.ts:115).
- **Conclusión: la encuentra, y S1 no depende de funciones `SECURITY DEFINER`.**

**Prueba:** test «RLS: como app_rls y SIN negocio en el GUC…» (d70ae61), con `SET LOCAL ROLE app_rls`:
- las tres lecturas de S1 devuelven el negocio;
- la misma conexión no ve `IntegracionConexion` sin GUC (0 filas), y con el GUC del dueño ve 1.

Eso muestra que la búsqueda por conexión de P1 sí lo necesita. En el Postgres real con `app_rls`, la vuelta 1 ya
había corrido el cobro con la app como `app_rls` (`apuntarLaAppA`).

**Lo que haría falta para el ruteo por conexión** (P1-C5, P5-C3, P6-C1; no para S1). **No escribí el SQL.**
- `gsg_conexion_por_cuenta(p_conector text, p_cuenta text) RETURNS TABLE("tenantId" text, id text)`:
  - devuelve 0 o 1 fila, porque hay un único `(conector, cuentaExterna)`;
  - filtra con `conector = p_conector AND "cuentaExterna" = p_cuenta`;
  - además, `estado IN ('conectada','con_problemas','requiere_reconectar')` y `p_conector = ANY(t.modules)`
    con un join a `Tenant`.
- `gsg_conexiones_activas(p_conector text, p_tope int) RETURNS TABLE("tenantId" text, id text)`:
  - aplica el mismo filtro;
  - ordena con `ORDER BY "updatedAt" DESC, id DESC LIMIT p_tope + 1`, y el `+1` sirve para detectar que se
    superó el tope.
- **Cómo se escriben las dos:**
  - `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public`;
  - dueño `neondb_owner`;
  - `REVOKE ALL … FROM PUBLIC` y `GRANT EXECUTE … TO app_rls`;
  - reversa: `DROP FUNCTION IF EXISTS` de las dos.
- **Qué no deben filtrar (no deben dejar salir):**
  - nada de `IntegracionCredencial`: ni secretos ni `ultimos4`;
  - ni `config`, ni `rutaHash`, ni `etiqueta`, ni `cuentaExterna`;
  - ni filas en estado `pausada` o `desconectada`.
  - Sólo `tenantId` e `id`: el secreto de firma se sigue abriendo dentro de la transacción de cada negocio
    candidato.
- **Ojo con `0003_force_rls_optional.sql`:** si se aplica, el dueño de la función queda sujeto a RLS en
  `IntegracionConexion` y las dos funciones devolverían 0 filas. En ese caso hace falta un dueño con `BYPASSRLS`,
  o una policy propia para ese rol.

## Qué no se pudo verificar
- RLS y concurrencia contra un Postgres real:
  - PGlite corre como superusuario y serializa las conexiones;
  - el RLS se probó con `SET LOCAL ROLE`;
  - los envíos en paralelo del test 1 prueban el resultado de la deduplicación, no la carrera.
- Datos y variables de producción: cuántos `Tenant` hay, el rol de `DATABASE_URL`, `modules` y las variables de
  Vercel. Sin acceso; quedan en PMO-1, PMO-2 y P-1/P-2.
- QA en el navegador, clic por clic. El paso 1 se cubrió con la acción real en el arnés.
- Los `adversarial-s1*.test.ts` del certificador. No están en el repo, así que no los corrí.
