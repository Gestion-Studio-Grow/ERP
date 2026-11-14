# Equipo de agentes de Administración · MIA — 10 · Plan de tandas v2 (el agente transacciona)

> **REEMPLAZADO el 15/11/2026 por `13-plan-de-tandas-v3.md` (GSG-MIA-019).** El dictamen de MIA-016 dio NO CUMPLE:
> la batería la escribía el constructor (H2), la tanda 4 no dependía de GSG-MIA-018 ni tenía briefs (H3, H23), 3A
> extraía la rama del vencimiento (H5), la enmienda del esquema no tenía brief (H12) y la certificación no cubría los
> 47 puntos (H18). Cada corrección, en `11-correcciones-mia019.md`. Este archivo queda sólo como historia: **no se
> construye con estos briefs.**

> Diseño del 14/11/2026 (noche). **Reemplaza las tandas 2 a 6 de `04`.** La tanda 1 sigue como está. Valen las «Reglas
> comunes a todos los briefs» de `04` (Paso 0, tres fases, vigencia, sin SQL crudo en el motor, un push por brief,
> verificar las citas al abrir). Construcción y certificación en Opus alto. Briefs de 2 KB como máximo.

## 1. Qué queda de las tandas 2 a 6 de `04`

| Tanda de `04` | Qué pasa |
|---|---|
| 2A · propuestas, aprobación y recordatorio | **Se rehace** como 2A y 2C de este plan. Las propuestas siguen, pero las decide una regla o una persona. El recordatorio se sigue preparando por plantilla; enviarlo queda con una persona |
| 2B · agenda, cuaderno y memoria | **Sigue**, como 3A. Cambia un punto: la promesa ya no espera un botón si la pidió la persona (`09` §10) |
| 3 · tarea diaria | **Sigue**, como 3B, y suma la rutina del puesto, las diferidas y el control de lo hecho |
| 4A · Cuentas a pagar | **Sigue**, como 4C (lectura, avisos y plan de pagos). Pagar sigue con una persona |
| 4B · Bancos | **Se rehace** como 4A: conciliar la coincidencia exacta la hace el agente, con vuelta atrás |
| — | **Nueva** 4B: registrar el cobro con respaldo del banco |
| 5 · medir, modelo y consola | **Sigue**, y suma los casos trampa de la ejecución y las métricas de lo hecho y lo deshecho |
| 6 · Comprobantes y base para Dirección | **Sigue** igual |

## 2. Orden nuevo: primero lo que se deshace, después la plata, operación por operación

| Tanda | Qué deja | Briefs | Certificación adversarial (sobre el diff) | Migración |
|---|---|---|---|---|
| 1 | Motor, buzón, panel, bandeja de GSG (en curso) | 1A a 1D | La de `04` | La única, con la enmienda del esquema unificado (`09` §2), certificada **antes** de aplicarla |
| **2 · Camino de ejecución y autorización** | El agente ya puede ejecutar, pero todavía sin operaciones de plata: motor de ejecución, llaves, topes, deshacer; firma y revocación; pedido que ejecuta y respuesta con lo hecho | 2A y 2B a la vez; después 2C | Seguridad (autofirma, permiso más chico, inyección), concurrencia (idempotencia, llaves en vuelo, topes) y datos (deshacer) | No (va en la única) |
| **3 · Operaciones sin plata y rutina** | Promesas, tareas, comentario y factura de la cuota, plan de pagos, cuaderno y memoria; rutina diaria y por evento, diferidas, control de lo hecho | 3A y 3B | Concurrencia y datos; inyección por nota y por concepto | No |
| **4 · Plata, de a una operación** | 4A conciliar exacta (B2) → certificación → 4B registrar cobro con respaldo (C4) → certificación. 4C Cuentas a pagar (lectura y plan) puede ir junto con 4A | 4A, 4B, 4C | **Una certificación por operación:** plata (doble envío, N a la vez, reintento, centavos, moneda), ida y vuelta, respaldo exacto, día cerrado | No |
| 5 · Medir, modelo y consola | Los 30 casos más los trampa de `09` §14 contra el modelo real; elección de modelo; tope de gasto en la consola; informe del mes con lo hecho y lo deshecho | 1 | Seguridad (consola) | No |
| 6 · Comprobantes y base para Dirección | Como `04` | 1 | Datos y permisos | A definir |

- **Cadena 1 → 2 → 3 → 4 → 5 → 6**, una tanda a la vez, con 1 o 2 constructores. Cada tanda abre su rama desde la
  anterior y se cierra con `tsc`, tests y build verdes, ningún rojo nuevo por nombre, certificación con hallazgos
  corregidos, medición y push.
- **Dentro de la 4 no se avanza a la operación siguiente sin el veredicto CUMPLE de la anterior.**
- **Liberación, paso obligatorio de las tandas 3 y 4 (decisión del dueño, 14/11 noche):** construir y certificar no
  alcanza para prender. Cada operación pasa su batería de ataque (`09` §17) y la libera el dueño, con el expediente a
  la vista, **antes** de habilitarla en un negocio. Orden: construir → certificación adversarial CUMPLE → batería (3
  corridas completas seguidas, 0 fallas críticas, 50 casos o más; umbral provisional a confirmar por el dueño) →
  expediente → liberación → recién ahí se prende. La cuarta llave y su lectura las construye 2A; cada brief de
  operación entrega sus 50 casos junto con el código.
- **Qué se puede prender y cuándo (siempre operación por operación, ya liberada):** con la tanda 3 cerrada, la ejecución de etapa 1 en MIA (no usa IA si los pedidos
  son de la lista). La etapa 2, operación por operación, al cerrar cada certificación de la 4. El texto libre que
  ejecuta, sólo después de la tanda 5.
- **Fuera de este plan:** enviar mensajes a clientes del negocio (espera el módulo de canales), el equipo de
  Dirección, el de GSG y el de mantenimiento (otros diseños).

**Lo que espera al dueño, sin frenar la construcción:** la clave de la API (gasto); el despertador por minuto (plan
de Vercel y cómputo de Neon, `09` §9); los topes (`08` §2); el umbral de excelencia y cada liberación (`09` §17); quién firma frente a la alternativa dura (`09` §2.3); si
quien pide puede aprobar; el texto legal de la autorización; Gate 2.

## 3. Briefs de la tanda 2

### Brief 2A · motor de ejecución

```
Rol: ingeniero del ERP (Opus alto; superficie: concurrencia, plata y seguridad).
Diseño: 09 §3, §4, §5, §6, §7 y §8 (sólo «Deshacer»). Esquema: desafio-mia016/esquema-unificado.md + 09 §2.2.
Construí en src/lib/agentes/: ejecucion-core.ts (puro: decidirEjecucion, en el orden de 09 §4),
ejecucion.server.ts (operar y revertir), y cambiá propuestas.server.ts para que decidirEnTx reciba quién
decide (REGLA o PERSONA). Sumá Operacion al contrato de tipos.ts y `llaves` a estado.server.ts.
- Candado con ESCRITURA REAL (09 §3): pausa con data { pausadoPor: null }, autorización con
  data { revocadaEl: null }. Nada de data: {}. Corregí también el candado de 03 §7.
- Alta con createMany skipDuplicates sobre `clave`; reclamo con updateMany PENDIENTE→EJECUTADA count===1;
  DESPUÉS los cupos (cantidad y monto por moneda), filas en orden fijo.
- origen, pedidoId y solicitadoPor los pone el servidor; el esquema de argumentos los rechaza.
- permisoVivo llega por parámetro desde src/lib/proyectos/agentes/actor-agente.server.ts
  (gestion.server.ts:33-42, gestion-core.ts:725-732). El motor no importa proyectos.
- Fuera de horario: DIFERIR. Quien pidió no aprueba. Revertir: clave REV:<id>, exigirEditar.
- Cuarta llave: operación liberada para el negocio en su huella actual (09 §17.1); sin eso, PERSONA.
- Operación de prueba sin plata (un compromiso) para los tests; las reales llegan en la tanda 3.
ESCRIBÍ PRIMERO: ejecucion-carrera-postgres, llaves-carrera-postgres, reversion-carrera-postgres y
permiso-minimo-postgres (09 §14). Además ejecucion-core.test.ts y guardia-ejecucion.test.ts.
No toques: src/lib/proyectos/acciones-*.ts. Verificación: tsc · tests · build. Informe ≤ 300 palabras.
```

### Brief 2B · autorización

```
Rol: ingeniero del ERP (Opus alto; superficie: seguridad y datos).
Diseño: 08 §4 y §5 (Ajustes, Sin autorización), 09 §2 y §2.3. Esquema: esquema-unificado.md (AgenteAutorizacion).
Construí src/lib/agentes/autorizacion-core.ts (puro: vigente, nombra la operación y su versión, tope
efectivo = mínimo con el techo) y autorizacion.server.ts (firmar, revocar, leer), la pantalla
«Mi equipo → Ajustes → Autorización» y el interruptor equipo-agentes-ejecuta al final de
src/cambios/interruptores.ts (cierra en :213; cambiaLasApps false).
- Firmar: SÓLO el usuario dueño de la cuenta (gestion-core.ts:612-613), con la contraseña vuelta a pedir.
  No es un permiso de ProyectoPermiso (acciones-gestion.ts:260 lo dejaría editar). firmanteUserId sale de
  la sesión. textoHash lo calcula el servidor sobre operaciones y topes canónicos. En la misma
  transacción, reemplazadaEl en la versión anterior. Aviso a Dirección y registro AUTORIZACION.
- El formulario sólo ofrece operaciones «sola» y no deja pasar el techo. Sin comodines.
- Revocar: Dirección, con motivo; irreversible. No toca lo ya hecho.
- Repetí los permisos de la tabla en prisma/rls/0002_app_role.sql antes de su COMMIT (:68).
- Trinquete estático: sólo autorizacion.server.ts crea o actualiza AgenteAutorizacion; el motor no lo
  importa (modelo: src/cambios/interruptores-escritura.test.ts).
ESCRIBÍ PRIMERO autorizacion-postgres.test.ts (09 §14) y autorizacion-core.test.ts.
QA: 08 §8, pasos 2, 4, 11 y 19. No toques ejecucion*.ts (es de 2A): acordá con 2A la firma de
autorizacionVigente(tx, …) en el commit de contratos. Verificación: tsc · tests · build. Informe ≤ 300 palabras.
```

### Brief 2C · pedido que ejecuta y respuesta con lo hecho

```
Rol: ingeniero del ERP (Opus alto; superficie: seguridad).
Diseño: 08 §5 y §6, 09 §10. Depende de 2A y 2B cerrados.
Construí: en motor.server.ts, el paso de un pedido que ejecuta (de la lista: argumentos de listas; escrito:
DOS llamadas, intención sin datos y respuesta sin herramientas de escritura); en el panel, «Lo que hice» en
la respuesta del buzón, «Deshacer» con su cartel, la pestaña «Necesita una persona» (antes «Para
aprobar») con el motivo, el bloque «Lo que hizo el equipo» en Hoy y las columnas nuevas del Registro.
- Invariante: ninguna llamada al proveedor con <datos> lleva herramientas que no sean de lectura.
- Los nombres se resuelven por código contra las listas del negocio: coincidencia única o nada.
  Identificadores e importes nunca salen del modelo.
- Etapa 2 no se dispara desde texto libre: se ofrece el pedido de la lista.
- Las confirmaciones las escribe el código después de escribir (03 §4.2); filtro de texto-seguro-core.
- Excepción: aviso interno (gestion.server.ts:170) a quienes pueden editar el módulo, menos quien pidió.
- Hasta 5 operaciones por pedido. Textos: los de 08 §5, sin cambiarlos.
ESCRIBÍ PRIMERO intencion.test.ts y los casos trampa de 09 §14 con el proveedor de guion.
QA clic por clic: 08 §8, pasos 3, 5, 6, 7, 15, 16, 17 y 18. Celular a 375 px.
Verificación: tsc · tests · build. Informe ≤ 300 palabras.
```

**Certificación de la tanda 2:** la lista de ataque de `desafio-mia016/lista-de-ataque-07-10.md`, puntos 3, 4, 7 a
12, 15, 17 a 19, 21, 26 a 29, 31 a 34 y 40, sobre el diff.

## 4. Briefs de la tanda 3

### Brief 3A · operaciones sin plata, cuaderno y memoria

```
Rol: ingeniero del ERP (Opus alto; superficie: datos y concurrencia).
Diseño: 08 §2 (K4, K5, C3, C5, P5, C2 preparar), 09 §7 (claves) y §8 (tabla), 03 §3 (AgenteCompromiso,
AgenteNota) y §8.1. Brief 2B de 04 para agenda, cuaderno y memoria.
Construí: agenda-core.ts y memoria.server.ts (04, brief 2B); las operaciones K4 y C3 (compromiso; deshacer
= CANCELADO condicional); C5 y P5 sobre guardarDatoCuotaEnTx, que extraés de
src/lib/proyectos/acciones-empresa.ts:157-180 (hoy escribe sin transacción, :176-177) y dejás la acción
manual llamándola dentro de tenantTransaction; C2 sólo prepara por plantilla (plantillas-core.ts, 03 §13).
- Deshacer C5/P5: vuelve al valor anterior sólo si el valor actual es el que puso el agente.
- La búsqueda automática de memoria corre DESPUÉS de la llamada de intención (09 §10).
- Sumá guardarDatoCuotaEnTx a la lista blanca de escrituras de negocio (03 §6.1, punto 3).
- Pestañas Agenda y Cuaderno (02 §2).
ESCRIBÍ PRIMERO: ida y vuelta de cada operación; misma promesa dos veces → una; nota del cuaderno y
concepto de cuota con una orden adentro → ninguna operación; no regresión de guardarDatoCuota.
QA: 08 §8, pasos 5 a 7. Verificación: tsc · tests · build. Informe ≤ 300 palabras.
```

### Brief 3B · rutina del puesto

```
Rol: ingeniero del ERP (Opus alto; superficie: concurrencia y plata por el gasto de IA).
Diseño: 03 §8, §10.1, §11 y §12.1; 09 §6 (diferidas) y §9; 08 §2 (K1, K2, K6, P3, R1). Brief 3 de 04.
Construí barrido.server.ts (04, brief 3: tres pasos por negocio, último en
src/app/api/cron/reminders/route.ts, con maxDuration) y rutina.server.ts: correrRutinas(tenantId, ahora)
en el paso B, sin IA: por cada rutina del catálogo una regla del código elige entidades con campos
tipados y llama a operar con origen RUTINA. Además:
- Diferidas por horario: las retoma y vuelven a pasar todo el control desde cero.
- Rescate de pedidos colgados con el recorte guardado (reemplaza «sólo lo propio» de 03 §4.3).
- K6: relee las operaciones EJECUTADAS de 7 días y avisa si algo dejó de cuadrar. Sólo código.
- Parte del día con «lo que hizo el equipo», lo que espera a una persona y lo deshecho.
- Rutina por evento: after() en importarExtracto (acciones-empresa.ts:206-225); en esta tanda sólo
  deja el gancho probado con una operación sin plata.
- NO agregues entradas a vercel.json: el despertador por minuto es decisión del dueño (09 §9). Dejá
  la función de rescate lista para que una ruta la llame.
ESCRIBÍ PRIMERO: dos barridos a la vez → una ejecución por clave; lo REVERTIDO no se rehace; apagar o
revocar entre dos operaciones → no sale otra; con app_rls el barrido de A lee lo propio y nada de B.
Verificación: tsc · tests · build. Informe ≤ 300 palabras.
```

**Certificación de la tanda 3:** que la rutina y el pedido pasen por la misma puerta; que ninguna regla lea texto
libre para decidir; idempotencia con dos corridas; que lo deshecho no se rehaga; que el barrido no toque pedidos
`EN_BANDEJA` (`03` §4.4); gasto de IA dentro del tope.

## 5. Tanda 4, en una línea por operación (los briefs se escriben al abrirla, contra el árbol real)

- **4A · B2 conciliar exacta:** `conciliarEnTx` y `desconciliarEnTx` desde `acciones-empresa.ts:228-255`, con
  candado (`03` §7.1), importe al centavo, clave `B2:cuota:<id>`. Certificación propia.
- **4B · C4 registrar cobro con respaldo:** `cobrarCuotaEnTx` y `anularCobroEnTx` desde
  `acciones-ficha.ts:748-830` y `:892-926` (`09` §8). Sólo cuotas de evento. Día cerrado, moneda, contraparte.
  Certificación propia, con test de ida y vuelta de cuota, cobro, caja y saldo.
- **4C · Cuentas a pagar:** brief 4A de `04` más P2 (plan de pagos como compromisos).

## 6. Medición

Al cierre de cada tanda, `medir-consumo.mjs` y la fila en `00-ESTADO/metricas/esfuerzo-alto.md`, como en `04`.
