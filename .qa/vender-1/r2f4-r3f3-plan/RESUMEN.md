# r2f4-r3f3-plan — porción 1 (25/09)

Hecho (R2-F4, parte pura):
- src/modules/perfil-datos.ts (+ test): la valla "sin perder un dato". Un cambio de plan sólo escribe plan, modules y profile; cualquier otro campo tira antes de escribir. `diferenciasDeConteo` compara conteos por tabla (para el recorrido Micro → PyME → Micro del laboratorio).
- src/app/operador/(console)/tenants/[id]/plan-del-negocio.ts (+ test): `vistaPreviaDePlan` (apps que gana y pierde con la regla del Inicio, candado de CH, vínculos de red/cartera, agregados sumados por fuera del plan, excepciones de límites que se cierran), `motivoSiFaltaConfirmar`, `excepcionesVigentes`, `filasQueCierranExcepciones`.

Comandos y resultado:
- node --import tsx --test "src/app/operador/**/plan-del-negocio.test.ts" src/modules/perfil-datos.test.ts → 15 tests, 15 pass (tests-plan-y-valla.txt).
- Vecinos: node --import tsx --test "src/app/operador/**/*.test.ts" "src/planes/*.test.ts" "src/modules/*.test.ts" src/apps/paridad-menu.test.ts src/apps/registro.test.ts → ver tests-vecinos.txt.
- npx tsc --noEmit → 0 errores en todo el proyecto.
- npx eslint --max-warnings=0 (los 4 archivos) → 0 problemas.

Qué prueban (con la decisión ejecutada):
- magra Micro → PyME → Micro, con y sin «Trabaja por apps»: la vista previa es igual al Inicio posterior medido con `estadoDeApps` (la función de la ficha), hoy − pierde + gana = después, y la vuelta da las mismas pantallas y la misma asignación.
- CH (beauty-spa) bloqueado con "Requiere OK del dueño" en los 5 planes.
- Con 2 locales vinculados no baja a un plan sin «Mis locales»; con vínculos sin leer, tampoco.
- Una fila forjada desde /admin (actor y canal del panel) no sube el tope ni cuenta como excepción; al cambiar de plan se cierran las excepciones vigentes de todos los planes y ninguna vuelve a valer.

Falta: ver el traspaso (scratchpad vender1/r2f4-r3f3-plan-1.md). Sin probar contra Postgres todavía: la escritura en transacción no está escrita.
