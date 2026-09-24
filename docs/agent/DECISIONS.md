# DECISIONS: presupuestos y decisiones de ingeniería

Primera versión: 2026-09-24, cierre de la auditoría de línea base sobre `3a96b52`.
Acá viven los presupuestos concretos del §5 del estándar para este stack, las definiciones que
hacen comparables los números de `HEALTH.md` y las decisiones que tomó el Principal Engineer
(§7.1). Lo que decide el dueño figura al final como pendiente, sin decidir.

`$AUD` = `/tmp/claude-0/-home-user-Factory-GSG/12bc8dd5-60d3-5e22-95c1-3816d17ad0a9/scratchpad/auditoria-ingenieria`
(carpeta temporal de la auditoría; `$AUD/../perf/` tiene las mediciones de performance). ENG-203
trae al repo los scripts que hacen falta para volver a medir.

---

## 1. El stack que fija los números

- **Dónde corre.** Funciones de Vercel en `gru1` (São Paulo, `vercel.json:3-5`, código). Base
  Neon en `sa-east-1` (São Paulo) **según la documentación, no medida**: lo dicen
  `docs/runbooks/deploy-vercel.md:175` y el host de `docs/seguridad/RUNBOOK-ROTACION-SECRETOS.md:48`;
  `prisma/schema.prisma:35-37` sólo declara `provider = "postgresql"`. Si la documentación está al
  día, es la misma región. El tiempo de ida y vuelta función↔base **no está medido**; se supone de
  1 a 5 ms hasta que ENG-204 mida la región y la latencia. Los usuarios
  están en AMBA (Canning, CABA): de 30 a 50 ms hasta São Paulo (supuesto de la documentación).
- **Costo fijo del aislamiento.** Con RLS encendido, cada lectura suelta son 4 sentencias
  (`BEGIN`, `set_config` del negocio, la consulta y `COMMIT`: `src/lib/rls.ts:84-88`).
  `tenantTransaction` (`rls.ts:117-159`) agrupa varias en una. Hoy una pantalla hace 45 sentencias
  de mediana y 269 como máximo (`$AUD/../perf/res-caliente.json`).
- **Pool.** `DB_CONNECTION_LIMIT` vale 5 por defecto (`src/lib/prisma-base.ts:33`); el valor en
  Vercel no está medido.
- **Lo medido hasta hoy** es `next dev` sobre `erp_lab` con 60 días de datos: sirve de referencia,
  no es la línea base oficial de performance (ver DEC-005).

## 2. Presupuestos (§5)

Todos se miden con `next build` + `next start`, sobre el seed de P7, con 5 ms inyectados por
viaje a la base (el caso de la misma región) y además a 30 ms (el caso degradado, sólo informado).
Excepción: P4 se mide a 30 ms, que es la condición del criterio de R6-F2 (DEC-008).
p95 sobre 20 repeticiones por pantalla y por negocio. Superar un presupuesto después de haberlo
cumplido es un defecto ALTA (§5).

| # | Tipo de operación | Presupuesto |
|---|---|---|
| P1 | Lectura común: pantallas de trabajo (Vender, Turnos, Pedidos, Caja, Clientes, Stock) y acciones de lectura | p95 < 300 ms en el servidor; ≤ 30 sentencias por pedido |
| P2 | Escritura común: venta de hasta 10 líneas, cobro, turno, movimiento de caja | p95 < 300 ms; ≤ 20 sentencias por venta de 10 líneas |
| P3 | Reportes y cierres: Reportes, Cierre diario, Cierre de mes, Libro IVA, Resultado, exportaciones | p95 < 1 s con un año de datos |
| P4 | Inicio por apps (el tablero que se ve después del login) | p95 < 1 s **a 30 ms por viaje**; ≤ 60 sentencias |
| P5 | Emisión fiscal | acción del usuario p95 < 300 ms (encola, no llama a ARCA); llamada a ARCA con timeout de 15 s; un comprobante pendiente se reintenta en ≤ 15 min |
| P6a | Bundle inicial (JS del primer render) por ruta del backoffice | ≤ 200 KB gzip |
| P6b | LCP de las pantallas más usadas (`/admin` y `/admin/vender`) | < 2,5 s p75 a 390 px, perfil 4G y CPU ×4 |
| P6c | Tablas | más de 200 filas: paginadas en el servidor o virtualizadas |
| P7 | Seed realista para medir | por negocio: 50.000 comprobantes (pedidos y facturas), 120.000 movimientos de stock, 60.000 turnos, 12.000 clientes, 50.000 movimientos de caja, 120.000 filas de auditoría; 2 negocios en la misma base |

### Justificación (cinco líneas cada una)

**P1 · Lectura común < 300 ms.**
1. Es el valor de referencia del estándar y no hay razón para aflojarlo: son pantallas que se usan con el cliente adelante.
2. Con la base en la misma región (1 a 5 ms por viaje, supuesto), 300 ms alcanzan para 60 a 300 viajes en serie sólo de base, sin contar el render; hoy la mediana es 45 sentencias por pantalla y el máximo 269.
3. Es alcanzable: en `next dev` sin demora, Vender da p95 229 ms, Caja 349 y Pedidos 391 (`$AUD/../perf/res-caliente.json`).
4. A 30 ms por viaje, las 49 pantallas medidas pasan los 300 ms: el presupuesto obliga a bajar viajes, no a comprar más máquina.
5. El tope de 30 sentencias se mide en local sin depender de la red, con el contador del arnés (ENG-000).

**P2 · Escritura común < 300 ms y ≤ 20 sentencias por venta de 10 líneas.**
1. Valor de referencia del estándar para operaciones comunes.
2. Hoy una venta de 10 líneas cuesta 62 sentencias en 4 transacciones (`$AUD/consultas-por-venta.out`): a 5 ms por viaje son 310 ms sólo de base.
3. Las escrituras Serializable reintentan ante conflicto: cada viaje de más agranda la ventana en que dos cajas chocan.
4. El timeout de una transacción interactiva de Prisma es 5 s y `tenantTransaction` no lo cambia (300 ms deja un margen de más de 15 veces); en el mismo `rls.ts`, `trasladoTransaction` lo sube a 15 s (`rls.ts:282`) porque un traslado son unas diez sentencias por línea.
5. 20 sentencias es el objetivo que la auditoría de ventas y la de stock midieron como posible con escrituras en lote.

**P3 · Reportes y cierres < 1 s.**
1. Valor de referencia del estándar para reportes.
2. Son lecturas agregadas que se abren pocas veces por día, no en cada venta.
3. Hoy el cierre diario de un negocio que nunca cerró lee 50.000 movimientos con p95 581 ms en local sin red; en Neon, sin medir (ENG-204).
4. Obliga a acotar el período o a guardar saldos, no a paginar un reporte.
5. Se mide con el mismo seed y el mismo arnés que P1.

**P4 · Inicio por apps < 1 s a 30 ms por viaje y ≤ 60 sentencias.**
1. Suma números de varios contextos: se lo trata como reporte y no como pantalla de trabajo.
2. Es lo primero que ve todo usuario, y hoy es lo peor: mediana 2,3 s a 30 ms por viaje y 4,4 s en MAGRA con 269 sentencias.
3. Es el objetivo que ya fijó R6-F2 en el backlog de lanzamiento, con su condición: "menos de 60 consultas y menos de 1 s con RTT 30" (`Factory-GSG/30-LANZAMIENTO/realize/backlog.json`). Medirlo a 5 ms lo aflojaría; se mide a 30 ms (DEC-008).
4. Los números que pasan su tope de 1,5 s se muestran como "no se pudo calcular"; el presupuesto evita que eso sea lo normal.
5. Se mide con el mismo arnés que P1, a 30 ms por viaje, con el negocio de más movimiento del seed.

**P5 · Emisión fiscal: encolar en < 300 ms, ARCA con 15 s de timeout, reintento en ≤ 15 min.**
1. El estándar exige integraciones asíncronas: ARCA es externo y a veces lento.
2. Hoy el envío a ARCA corre dentro del pedido del usuario (`facturita-actions.ts:103`, `invoice-from-order.ts:91`) y sin timeout (`soap.ts:491-508`).
3. 15 s queda por debajo de la duración máxima de una función y permite separar "ARCA no contestó" de "ARCA rechazó".
4. 15 minutos: un comprobante no puede quedar un día entero pendiente, que es lo que pasa hoy con el cron diario (`vercel.json:13-16`).
5. Si el plan de Vercel no permite un cron cada 15 minutos, cambiarlo es un costo recurrente y lo decide el dueño (§10).

**P6a · Bundle inicial ≤ 200 KB gzip por ruta.**
1. React 19 más Next 16 ocupan alrededor de 100 KB gzip de base (supuesto a confirmar con `next build`, ENG-202).
2. El componente propio más grande es VenderForm con 19,3 KB gzip (`$AUD/../perf/bundle.json`): 200 KB deja margen sin dejar pasar librerías pesadas.
3. En un celular con 4G lento (≈ 1,6 Mbps), 200 KB son alrededor de 1 s de descarga.
4. Una librería que empuje una ruta por encima necesita un ADR (§1: nada nuevo sin ADR).
5. Se mide con la salida de rutas de `next build` en verify.

**P6b · LCP < 2,5 s en `/admin` y `/admin/vender`.**
1. Es el valor del estándar.
2. `/admin` es la primera pantalla de todos después del login; `/admin/vender` es la de más uso en los mostradores. Sin analítica de uso real, son las dos "más usadas" (a confirmar).
3. Las cajeras usan el celular: 390 px con 4G y CPU ×4 representa el peor caso habitual.
4. Hoy, en `next dev` y sin limitar red ni CPU, el primer pintado del Inicio tiene mediana 904 ms y p95 2.452 ms: el LCP real será mayor.
5. Se mide con Playwright sobre `next start`, 10 cargas por pantalla, con `PerformanceObserver` de `largest-contentful-paint`.

**P7 · Seed de 50.000 comprobantes por negocio.**
1. El estándar pide 50.000 comprobantes o más.
2. Un mostrador con 150 ventas por día llega a 55.000 en un año: es un año de un negocio activo.
3. Dos negocios en la misma base miden también lo que cuesta el aislamiento (RLS descarta las filas del otro).
4. La auditoría ya armó partes (`$AUD/seed-perf.sql`, `$AUD/stock-compras/seed-volumen.sql`, `$AUD/clientes-agenda-admin/seed.sql`); ENG-201 las junta.
5. Datos sintéticos: nunca una copia de producción, porque tiene datos personales.

## 3. Definiciones que hacen comparables los números

- **Cobertura de dominio.** Se mide por **funciones y ramas**, no por líneas: el coverage de Node
  cuenta comentarios como líneas cubiertas. "Dominio" es la lista que genera
  `node $AUD/correccion/lista-dominio.mjs` desde la raíz del repo (304 archivos en `3a96b52`): todo
  `.ts` de `src` que no sea test, `.d.ts`, `src/generated/` ni `"use server"`, que no lea
  `process.env` y que no importe directamente `@prisma/*`, `generated/prisma`, los clientes de la
  base (`@/lib/prisma`, `db`, `prisma-base`, `operator-db`, `rls`, `tenant-context`), `next`,
  `react`, `react-dom`, `pg` ni `server-only`. Mira sólo imports directos. ENG-130 versiona el
  script en el repo (DEC-009). Umbral: funciones ≥ 90 %.
- **Endpoint con test de aislamiento.** Un test dentro de `npm test` que ejecuta la acción o la
  ruta real con la sesión del negocio A contra datos del negocio B, en la base efímera con
  `app_rls` y `RLS_ENFORCEMENT=on`, y verifica que no lee, no escribe y responde igual que ante un
  id inexistente. Nombrar la acción en un test, o leer su código como texto, no cuenta.
- **Flujo E2E cubierto.** Un test de Playwright contra `next start` que recorre el flujo a 1440 y
  a 390 px y falla ante un error de consola o una excepción de la página.
- **Flujos críticos** (10, lista provisional a confirmar por el dueño): 1. entrar al panel;
  2. vender y cobrar en el mostrador; 3. anular una venta; 4. abrir y cerrar la caja; 5. reservar
  un turno y cobrar seña y saldo; 6. pedido online hasta la entrega; 7. facturar y obtener CAE
  (contra el simulador); 8. recibir una compra de proveedor; 9. vender a cuenta corriente y
  cobrarla; 10. dar de alta un negocio desde la consola.
- **Test de integración.** Contra Postgres real y efímero (ENG-000). Un doble de la base es un
  test unitario, aunque se llame "integración".
- **Severidad.** ALTA: puede perder o alterar datos, cruzar negocios, emitir mal ante ARCA o romper
  la plata. MEDIA: degrada seguridad, performance o mantenibilidad con impacto medible. BAJA: el resto.

## 4. Decisiones tomadas en esta auditoría

- **DEC-001 · El arnés de integración (ENG-000) va antes que las ALTA.** Todo criterio de
  aceptación de las ALTA pide un test contra Postgres real (§3 y §11 prohíben los dobles de la
  base en integración), y hoy CI no tiene base. Hacerlo primero es lo más simple y reversible.
  Mientras tanto, la única mitigación de ENG-001 es operativa: no correr `npm run seed`.
- **DEC-002 · Viewports.** La suite E2E corre a 1440 y 390 px, como pide el estándar. Los tests
  existentes a 412 px (convención del backlog de lanzamiento) se mantienen.
- **DEC-003 · Numeración.** `ENG-000` habilitante, `ENG-0xx` ALTA, `ENG-1xx` MEDIA, `ENG-2xx`
  habilitan mediciones, `ENG-3xx` BAJA.
- **DEC-004 · Backlogs.** Si un slice ya está planificado en
  `Factory-GSG/30-LANZAMIENTO/realize/`, `BACKLOG.md` lo referencia y sólo agrega los criterios del
  estándar que le faltan. No se duplica el trabajo.
- **DEC-005 · Performance de referencia.** Las cifras de `next dev` sobre `erp_lab` (60 días)
  quedan como referencia. La línea base oficial del §8 es la que produzca ENG-201; hasta entonces,
  una regresión se juzga contra la referencia.
- **DEC-006 · Migraciones.** Toda migración que pidan los slices es aditiva, trae su reversa
  probada (ENG-101) y se aplica a Neon sólo con la autorización del dueño.
- **DEC-007 · Cifras que difieren entre auditores.** Server Actions: 205 exports en 47 archivos
  `"use server"` (203 contando sólo `export async function`). Migraciones: 45 (`migration_lock.toml`
  no es una migración). Se usan esas.
- **DEC-008 · P4 se mide a 30 ms por viaje.** Es la condición del criterio de R6-F2 ("< 60
  consultas y < 1 s con RTT 30"). Medirlo a 5 ms, como el resto, lo volvía más laxo que el
  objetivo ya planificado. Los demás presupuestos siguen a 5 ms.
- **DEC-009 · La lista de dominio sale de un script.** La primera lista (303 archivos) no tenía
  comando que la generara y no se podía reproducir. Se reemplaza por la que genera
  `lista-dominio.mjs` (304 archivos, criterio en §3). La cobertura de funciones pasa de 81,7 % a
  81,9 % por el cambio de lista, no por un cambio en los tests.
- **DEC-010 · ENG-203 va inmediatamente después de ENG-000.** Toda la evidencia de `HEALTH.md` y
  `BACKLOG.md` vive en `$AUD`, dentro de `/tmp`: si la carpeta se limpia, ningún número se puede
  volver a verificar. Traer los scripts al repo antes de cualquier otro slice es lo más barato y
  reversible.

## 5. Pendiente de decisión del dueño (no se decide acá)

Cada decisión con sus opciones y la recomendación del Principal Engineer en una línea. El
reporte de cierre del §9 (semáforo, riesgos y pendientes) lo devuelve la sesión de auditoría;
lo que el dueño tiene que decidir queda acá para que no dependa de esa respuesta.

- **D1 · Dinero en Float (lo aceptó ADR-057) o en decimal (lo exige el estándar).** Bloquea ENG-011.
  A: pasar los importes a `Decimal(14,2)` con moneda (L, Gate 2, toca la base de los cuatro
  negocios). B: excepción escrita al estándar que mantiene Float. Recomendación: A, después de
  ENG-109 (redondeo) y con el arnés de ENG-000.
- **D2 · Mediciones de sólo lectura contra Neon y Vercel (ENG-204).** A: autorizar. B: no; esas
  cifras siguen "sin medir". Recomendación: A; dice si hoy está activo ENG-027 (sin
  `OPERATOR_DATABASE_URL` no se autoriza ninguna factura) o ENG-012 (con el rol dueño, un negocio
  procesa envíos de otros), y si RLS está encendido.
- **D3 · Las 5 vulnerabilidades altas de producción.** El §4 dice que bloquean el cierre de
  cualquier slice. Cuatro vienen de la herramienta de Prisma (`prisma`, `@prisma/config`,
  `deepmerge-ts`, `mysql2`) y ningún archivo de `src` las importa; `fast-uri` tiene arreglo sin
  cambio mayor. A: bajar a `prisma@6.19.3` (cambio mayor). B: excepción escrita por paquete, con
  fecha de revisión, y actualizar `fast-uri` ya. Recomendación: B.
- **D4 · Tocar el circuito fiscal de CH (ENG-019 a ENG-022, R7-F1).** A: autorizar, probando contra
  el simulador de ARCA y homologación, sin cambiar la configuración de producción. B: esperar.
  Recomendación: A.
- **D5 · Migraciones de ingeniería en Neon.** A: autorizarlas de a una, cada una después de pasar
  el arnés y con su reversa probada. B: decidir cada una cuando llegue. Recomendación: A.
- **D6 · Qué backlog manda en la próxima sesión.** A: este, completo. B: el de lanzamiento.
  C: ENG-000, ENG-203 y las ALTA de tamaño S que tocan plata o facturas (ENG-001, ENG-002,
  ENG-012, ENG-027); después, alternar una tanda de lanzamiento y una de ingeniería.
  Recomendación: C.
- **D7 · Contradicciones entre el estándar y `Factory-GSG/CLAUDE.md`.** No se editó `CLAUDE.md`
  (§0.6). Son seis:
  1. **Datos faltantes.** `CLAUDE.md:39`: "No frenar por un dato faltante. Poné un placeholder
     coherente marcado 'provisional a confirmar' y seguí." Estándar §10 (`engineering.md:177`):
     se escala "cualquier atajo en fiscal o seguridad, aunque sea temporal"; §6 (`:130`): sin TODO
     sin ticket en BACKLOG. Hoy hay 7 líneas con "provisional a confirmar" en 6 archivos de
     producción (`grep -rn "provisional a confirmar" src --include=*.ts --include=*.tsx | grep -v "\.test\.ts"`),
     uno fiscal (`src/plugins/bancos/domain/reglas.ts:44`) y dos de plata (`src/lib/actions.ts:734`,
     `src/app/admin/(dashboard)/turnos/NewAppointmentForm.tsx:112`). A: la regla de `CLAUDE.md`
     vale en todo. B: vale salvo en fiscal, seguridad y plata, donde se frena y se escala; cada
     provisional va al BACKLOG. Recomendación: B.
  2. **Qué se escala.** `CLAUDE.md:53`: sólo gasto, exposición a cliente, migraciones de
     producción y decisiones comerciales. Estándar §10 (`engineering.md:173-178`) agrega: lo que
     pueda perder o alterar datos de clientes, eliminar funcionalidad no marcada DELETE, atajos en
     fiscal o seguridad y estas contradicciones. A: la lista de `CLAUDE.md`. B: la del estándar.
     Recomendación: B; lo que agrega son las ALTA de pérdida de datos y fiscales de este backlog.
  3. **Dónde rige la vara alta.** `CLAUDE.md:52`: "Calidad no negociable en arquitectura,
     seguridad y fiscal. Evitar desperdicio y sobre-ingeniería en el resto." El estándar pone
     umbrales en todo: cobertura de dominio ≥ 90 % (`engineering.md:81`), test de aislamiento por
     endpoint, "toda regresión de presupuesto es un defecto de severidad alta" (`:120`). A: los
     umbrales del estándar en todo. B: en todo lo que escribe en la base; lo que sólo muestra
     contenido (landing, textos de vidriera) sin E2E obligatorio. Recomendación: B.
  4. **Qué backlog manda.** Estándar §0.7 (`engineering.md:39-40`): toda sesión siguiente arranca
     por el primer slice del BACKLOG. `CLAUDE.md:7` pone el lanzamiento (fases de SAP Activate)
     como método de proyecto y `:54` dice que ante incongruencia "gana la de productos nuevos". Es
     D6.
  5. **Reset de datos.** `CLAUDE.md:30`: "Un reset futuro puede tocar datos transaccionales, nunca
     maestros ni servicios." Estándar §1 (`engineering.md:55-57`): los documentos fiscales emitidos
     no se editan ni se borran y lo contable se borra sólo lógicamente; §10 (`:173`): lo que pueda
     perder datos de clientes se escala. A: reset permitido de ventas, turnos y caja de prueba,
     nunca de facturas con CAE ni de días cerrados, con respaldo previo y autorización del dueño
     cada vez. B: sin resets; lo de prueba se anula por el circuito normal. Recomendación: A.
  6. **Afirmación sin evidencia.** `CLAUDE.md:28`: "RLS está vivo y enforced en producción (rol
     `app_rls` NOBYPASSRLS, `RLS_ENFORCEMENT=on`)". El estándar prohíbe afirmar sin evidencia (§9,
     `engineering.md:169`) y la auditoría no lo pudo verificar (HEALTH §3.1: sin medir). A:
     autorizar D2 y reemplazar la línea por la salida de `check-rls-live.mjs`. B: dejarla.
     Recomendación: A.
  No son contradicciones: "commits chicos" (§7.3) y "un push por sesión" (`CLAUDE.md:37`) conviven
  con varios commits en un push; el QA clic por clic (`CLAUDE.md:40`) y la suite E2E del §3 se
  complementan.
- **D8 · La lista de 10 flujos críticos (§3 de este archivo).** A: confirmarla. B: cambiarla.
  Recomendación: A; si Mercado Pago está prendido en producción (se sabe con D2), sumar "cobrar
  con Mercado Pago".
