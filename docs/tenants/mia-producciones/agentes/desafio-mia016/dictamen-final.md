# Dictamen final de MIA-016 sobre el paquete A (07 a 10, commit `46f5b52`) y §19 de canales (`a07f5ff`)

> Certificación en contra. Corrieron tres agentes Opus de esfuerzo alto, distintos de los autores. Las pruebas fueron en Postgres 16 local y en PGlite, en bases descartables. No se tocó Neon ni el código.
>
> Detalle de cada dictamen:
> - `dictamen-07-08-10.md` (24 hallazgos);
> - `dictamen-09.md` (X1 a X13);
> - `dictamen-p1-p12-canales.md`.
>
> Esquema: `esquema-final-enmienda.md`. Vara: `lista-de-ataque-07-10.md` (A a J, 47 puntos).

## Veredicto por documento

| Documento | Veredicto | Bloqueante o lo principal |
|---|---|---|
| 07 flujo de trabajo | **CUMPLE CON CAMBIOS** | Lo que digan 08, 09 y 10 una vez corregidos |
| 08 funcional | **NO CUMPLE** | C4 no ata el movimiento a la cuota: un depósito de $1.000 respalda dos cuotas. §9 de liberación no cumple la §J. El negocio se firma su propia autorización sin control de una segunda mano |
| 09 técnica | **NO CUMPLE** | X1: `reemplazadaEl` se pone en NULL y revive topes revocados (probado). X2: PEDIDO sin `solicitadoPor` pasa la FK MATCH SIMPLE (probado). X3: B2 y C4 corren sobre conciliar con carrera, antes de MIA-018 (probado) |
| 10 plan de tandas v2 | **NO CUMPLE** | Los casos de la batería los escribe el constructor, sin reservados. La tanda 4 no tiene briefs ni depende de MIA-018. La enmienda del esquema no tiene brief. Los 5 briefs miden ≤ 2 KB (1261 a 1734 bytes) |
| Canales 03 §19 (P1 a P12) | **CUMPLE CON CAMBIOS** | Entran P1, P2 sin la FK y P6. La FK a `CanalOferta` espera. Nada se rechaza. Altos: el link de MP sale con una clave por oferta (doble cobro, `link-de-pedido.server.ts:30-48`), el monto puede cambiar después de confirmado (P9) y en la web se pueden crear contactos sin límite |

Lo que sí quedó bien:
- H1, el candado de Prisma, está corregido en el 09: se probó con dos conexiones.
- D1 está bien: un REVOKE por columna no tiene efecto con permiso de tabla. Lo probamos y se adoptó.
- La toma de cupo es atómica.
- La plata que hace solo queda limitada a cobro y conciliación con respaldo exacto. Pagar, ARCA, CBU, anular y borrar quedan con una persona.

## Antes de construir (en orden)

1. **Brief de la enmienda del esquema** (`esquema-final-enmienda.md`), certificado antes del Gate 2. Hay que verificar qué rol aplica la migración en producción.
2. **GSG-MIA-018** arregla cobrar (`src/lib/proyectos/acciones.ts:192-238`) y conciliar (único de `cuotaId` y `FOR UPDATE`) **antes** de que B2 o C4 se puedan prender. Hasta entonces, B2 y C4 quedan con una persona.
3. **C4 consume el movimiento** en la misma transacción, con clave por movimiento y por cuota y un test. Deshacer C4 deja todo como estaba, `regenerar` incluido.
4. **Reescribir 08 §9 y 09 §17** contra §J.41-47:
   - lo del código es 100 % determinista;
   - la batería es de casos distintos, con reservados que guarda la certificación;
   - la lista completa de fallas críticas;
   - todos los disparadores para volver a pasar la batería;
   - expediente que no se purga.
5. **Rutina por evento:** quien sube un extracto no puede disparar C4 con el permiso del agente. Se hereda a quien lo subió, con el permiso más chico.
6. **3A:** `guardarDatoCuotaEnTx` sin la rama que mueve el vencimiento, para que el agente no pueda esconder la mora.
7. **Sin IA ni lectura de GSG** mientras no estén firmadas las partes 1 y 5 de la autorización.
8. **Canales:**
   - clave del link de MP por pedido;
   - el motor compara monto, moneda y contraparte contra la oferta leída en la transacción;
   - tareas que escriben sólo por WhatsApp y un cupo propio para visitantes de la web.

## Qué cambia en 1B, 1C y 1D

- **1A (cerrada):** suma un brief «enmienda del esquema». Es una sola: no se reabre 1A.
- **1B (herramientas y panel):**
  - Cada herramienta declara:
    - riesgo R0 a R4;
    - `origenes` (rutina, pedido o canal);
    - `modo`: `sola`, sólo con `deshacer` nombrado, o `persona`;
    - documento fuente (`fuenteTipo`/`fuenteId`).
  - Zod rechaza `pedidoId`, `solicitadoPor`, `canalOfertaId` y `origen` dentro de `argumentos`: esos campos los pone sólo el servidor.
  - El panel muestra la autorización vigente (versión y topes) y lo que el agente hizo solo.
  - «Deshacer» va con `exigirEditar(módulo)` y dentro de `revertibleHasta`.
- **1C (adaptador de la API y gasto):**
  - Devuelve sólo argumentos estructurados, que el motor vuelve a validar. Nunca devuelve una acción ejecutable armada a partir de texto.
  - Expone el modelo, su versión y el hash de las instrucciones: entran en la huella de liberación (§J.45).
  - No llama al proveedor si la autorización no tiene `proveedorIa` y las partes 1 y 5 firmadas.
  - El `recorte` es mínimo y no lleva datos de terceros que la tarea no necesite.
- **1D (bandeja de GSG):**
  - Deja de ser el camino del texto libre: el texto libre lo contesta el agente.
  - Queda para lo derivado (sobre el tope, irreversible o fuera del rol).
  - La lectura de GSG está cubierta por `lecturaOps`, con registro.
  - Nada de «copiar para Claude».

## Decisiones del dueño (opciones y recomendada)

1. **Quién firma la autorización.**
   - (a) El titular en la app.
   - (b) Alta por OPS de GSG con evidencia.
   - (c) **Recomendada:** el titular firma en la app con un segundo factor, y **ampliar** operaciones o topes pide una segunda confirmación por otro canal (mail al titular). Un operador de GSG no puede resetear la clave del titular sin un registro y un aviso.
   - Por qué: X5 mostró que, con (a) sola, ampliar topes queda en una sola mano.
2. **Expediente de liberación.**
   - (a) En `AuditLog`, con exención de la purga.
   - (b) **Recomendada:** una tabla propia que no se purga.
   - Por qué: es la prueba de la garantía de GSG y tiene que durar lo mismo que los registros contables, a confirmar con la contadora.
3. **Umbral de liberación.**
   - (a) 3 × 50 sobre los mismos casos.
   - (b) **Recomendada:** 150 casos distintos con 0 críticas y reservados, 300 para lo que mueva plata sin respaldo. Los controles del código van al 100 % determinista.
4. **El cliente final como solicitante, en canales.**
   - (a) Aceptarlo: confirma con un botón y la operación sale de la oferta, no de su texto.
   - (b) Prohibirlo.
   - **Recomendada:** (a), registrada como excepción explícita a «un texto de un tercero no dispara una transacción».
5. **Dónde corre el guion de prueba.**
   - (a) En MIA real, con el dueño de GSG firmando como titular.
   - (b) **Recomendada:** primero en un negocio de ensayo, y en MIA sólo con su titular real.
   - Por qué: MIA empieza el 18/11.
6. **Moneda.** **Recomendada:** sólo ARS hasta que haya topes en USD. El CHECK la limita.
7. **Clave de API del proveedor de IA.** Sigue abierta y es la que destraba al agente que trabaja solo. Es gasto: la decide el dueño.

## Riesgos

- Sin verificar qué rol aplica la migración en producción: si no es el dueño de las tablas, el REVOKE sale como WARNING. La aserción final de la enmienda lo convierte en error.
- La Ley 25.326 (datos de los clientes del cliente, transferencia al exterior) no se leyó en la fuente. Va al frente legal.
- La carrera de cobrar y conciliar está en el ERP de hoy, con o sin agentes (probada por MIA-017). Prioridad de MIA-018.
- La ventana de compactación de este entorno da 500000, no 400000: `.claude/settings.json` dice 400000, pero la variable del entorno la pisa.
