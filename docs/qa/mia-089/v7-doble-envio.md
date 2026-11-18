# GSG-MIA-089 · V7: cada acción que crea plata y cómo frena el doble envío

Barrido de `src/lib/proyectos/acciones*.ts` buscando `create`/`createMany` de `ProyectoPago`, `ProyectoGasto`,
`ProyectoCuota`, `ProyectoMovBanco`, `ProyectoLiquidacion`, `ProyectoRendicion` y todo `asentarEnCajaTx` (libro de caja).
Clave de envío = `claveEnvio` del formulario (la misma hasta que el servidor contesta), guardada en `ProyectoCambio` con
campo «Envío»: sin migración.

| Acción | Crea | Cómo frena el doble envío | Test |
|---|---|---|---|
| `registrarCobro` (`acciones.ts`) | cobro + caja | clave de envío (O41) bajo `trabarCobranza`; sin clave, aviso «ya se registró un cobro igual» | cobranza-carrera, #170/#176 |
| `marcarCuota` (`acciones-ficha.ts`) | cobro o gasto + caja | clave de envío bajo `trabarCobranza` + `pagadoEl: null` en el `updateMany` | administracion-carrera |
| **`crearPagoEmpresa`** (`acciones-empresa.ts`) | cuota de empresa | **nuevo:** clave de envío con candado propio (`envioYaGrabado`, `cobranza.server.ts`) | mia089 V7 |
| **`crearMovimientoManual`** (`acciones-ficha.ts`) | cuota del proyecto | **nuevo:** la misma clave | mia089 V7 |
| **`registrarGasto`** (`acciones.ts`) | gasto (+ caja si «ya pagado») | **nuevo:** clave de envío con candado `envio-gasto:` | mia089 V7 (contraprueba roja `2 !== 1`) |
| `pagarGasto` (`acciones.ts`) | caja | `updateMany … pagadoEl: null` → el segundo no encuentra fila | mia089 V6 (1 egreso) |
| `marcarCuotaEmpresa` (`acciones-empresa.ts`) | caja | `updateMany … pagadoEl: null, anuladoEl: null` | administracion-carrera |
| `anularCuotaEmpresa`, `anularCobroFicha`, `anularGastoFicha` | contraasiento en caja | `updateMany … anuladoEl: null` (count 0 → nada) | administracion-carrera |
| `pagarLiquidacion` (`acciones-empresa.ts`) | caja | `updateMany … estado: "PUBLICADA"` | mia083-liquidacion-propia |
| `generarLiquidaciones` | liquidaciones | `createMany … skipDuplicates` (único persona+período) | — |
| `importarExtracto` | movimientos de banco | `lineasNuevas`: descarta las líneas ya importadas (cuenta, fecha, importe, descripción) | — |
| `rendirGasto` (`acciones-rendiciones.ts`) | gasto + rendición | id del gasto derivado de la clave del formulario (`idDelGastoRendido`): el segundo envío lo encuentra | — |
| `rechazarRendicion` | contraasiento | cambio de estado condicionado | — |

Deuda anotada (no bloquea V7): `generarLiquidaciones`, `importarExtracto` y `rendirGasto` no tienen test de doble envío
propio; se apoyan en la unicidad o el id derivado.
