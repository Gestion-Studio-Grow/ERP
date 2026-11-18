# GSG-MIA-088 · la regla de permisos de Proyectos y Administración, escrita una vez (P1)

Fuente: `src/lib/proyectos/gestion-core.ts` (`PERMISOS_BASE`, `COLUMNAS_OCULTAS_BASE`, `cambiaLosPermisos`, `motivoSinRendiciones`,
`revisaRendiciones`, `pagaLiquidaciones`) en la rama `mia-088/permisos`. Es la matriz de fábrica: Dirección la cambia por negocio
en Equipo › Permisos, y lo guardado manda sobre la fábrica (`permisoDe`). E = ve y edita · V = sólo ve · N = no lo abre.

**A1 de DIR-007 (GSG-MIA-091): la matriz única está en el código.** Lo que tiene cada rol: `matrizDePermisos(guardados)`
(`gestion-core.ts`), fijado celda por celda por `gestion-core-matriz.test.ts`. Lo que pide cada una de las 32 páginas y las 128
acciones de servidor de Proyectos: `src/lib/proyectos/matriz-permisos.ts`. `matriz-permisos.test.ts` lee el código y la recorre
entera: una página o una acción sin anotar, una puerta distinta de la anotada o una `requireCapabilityFueraDeLaAgenda` fuera de
`exigirPlataDeDireccion` lo ponen rojo; después cruza rol × ruta × acción y fija cuántas abre cada rol.

## Qué ve y qué edita cada rol (fábrica)

| Módulo | Dirección | Administración | Comercial | Diseño | Producción |
|---|---|---|---|---|---|
| Proyectos y leads (`pipeline`) | E | V | E | V | E |
| Ficha del evento (`ficha`) | E | V | V | V | E |
| Costos y márgenes (`costos`) | E | V | N | N | E |
| Proveedores (`proveedores`) | E | E | N | N | E |
| Cotizaciones y planilla de venta (`cotizaciones`) | E | V | E | V | E |
| Diseño (`diseno`) | E | N | E | E | E |
| Pagos y cobros del evento (`pagos`) | E | E | N | N | E |
| Cuentas, cashflow y bancos (`empresa`) | E | E | N | N | N |
| Liquidaciones del equipo (`liquidaciones`) | E | E | N | N | N |
| Tablero, reportes, Rentabilidad y Configuración (`direccion`) | E | N | N | N | N |
| Equipo, roles y permisos (`equipo`) | E | N | N | N | N |
| Estudio IA y agentes (`ia`) | E | N | E | E | E |
| Rendiciones de gastos (`rendiciones`) | E | E | V | N | V |

Columnas de costo de la ficha (costo unitario, costo total, recargo y margen): ocultas para Comercial y Diseño; visibles para
Dirección, Administración y Producción. Sin ficha (y sin ser la dueña): nada.

## Quién cambia la regla

- **La matriz y las columnas: sólo Dirección** (`cambiaLosPermisos`, puerta en `guardarPermisos`). Quien tiene «Equipo» en
  editar carga y edita personas, no permisos. *Pregunta 1, opción A: confirmada por el dueño el 18/11.*
- Pasar a alguien a Dirección o sacarlo de Dirección: sólo Dirección. Nadie cambia su propio rol. Nadie que no sea Dirección
  desvincula su cuenta de su ficha ni la pasa a otra ficha.
- Dirección es fija: ve y edita todo; la dueña sin ficha cuenta como Dirección.

## Lo que el servidor exige además de la matriz

| Qué | Pide |
|---|---|
| Rentabilidad (`reporteProyectos`, `proveedoresConGastos`) | `direccion` en V. *Pregunta 2, opción A: confirmada por el dueño el 18/11* |
| Configuración (`guardarConfig`) | `direccion` en E (misma pregunta 2) |
| Parámetros del módulo | verlos: Dirección y Administración; cambiarlos: sólo Dirección (sin cambios en esta rama) |
| Rendir un gasto propio | `rendiciones` en V y un rol que rinde (Diseño no rinde) |
| Aprobar, devolver, rechazar, reintegrar, entregar y cerrar un anticipo | `rendiciones` en E y rol Dirección o Administración; nadie se aprueba ni se paga lo propio |
| Ver rendiciones, anticipos y comprobantes de otros | lo mismo que aprobar |
| Pagar una liquidación (y el botón) | `liquidaciones` en E y rol Dirección o Administración; nadie se paga la propia |
| Calendario por token | el rol de gestión de la ficha; sin ficha, nada (la dueña, Dirección) |

## Pregunta 3 (PRY-013)

Producción sigue viendo costo y margen, como hoy (*opción A: provisional a confirmar por el dueño*). Esta rama no lo toca.

## Agentes

Un agente con un rol tiene la fila de ese rol: ninguna puerta de esta rama pregunta si el actor es agente. Hoy #188 no deja que un
agente quede en Dirección en Proyectos (`accesos.ts:41-43`, en `87e8f1e9`); ese freno es P8 y va en otra sesión.

## Filas ya guardadas

Las celdas que alguien sin Dirección guardó antes de esta rama quedan como están: no se borran ni se revierten solas. Dirección
las ve en Equipo › Permisos y, con quién y cuándo, en Equipo › Registro de cambios; si una no corresponde, la cambia ahí.
