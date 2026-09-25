# Plugin SAP — modo Archivo

Convierte el lote contable de Rendí (`LoteContable` del Core de rendiciones) en las planillas de carga masiva de **SAP S/4HANA Cloud Public Edition**. Es el modo "desde el día uno" del plan (§10.1): no hay integración, Tesorería importa los archivos. El modo API (acuerdos de comunicación 0057, 0002, 0303 y 0008) queda para después y traerá su manifiesto (ADR-006).

```ts
import { generarArchivosSap } from "@/plugins/sap";
const { facturas, asientos, cancelaciones, altas } = generarArchivosSap(lote); // cuatro CSV
```

| Archivo | Qué es |
|---|---|
| `facturas` | Facturas de proveedor del carril 1: una fila por posición, repitiendo la cabecera (`ID_FACTURA` las une) |
| `asientos` | Un bloque por rendición del carril 2: fila `Cabecera` y filas `Part.ind.` |
| `cancelaciones` | **Instrucción para Tesorería, no planilla de carga** (ver abajo) |
| `altas` | Propuesta de alta de proveedores para el dueño del maestro, uno por fila |

## ⚠ [A VALIDAR] antes de la primera carga

- **Los encabezados** son los nombres técnicos relevados en el frente SAP, no una copia de la plantilla oficial. Se validan contra **la plantilla real que se baja del arrendatario del cliente** y se prueba que el archivo suba sin error en el starter: en el frente SAP ya pasó que un archivo escrito por código diera error al subirlo.
- **Formato de fecha** (acá `AAAA-MM-DD`) y **largos de texto** (cabecera 25, posición 50: se cortan).
- **Indicador de IVA por alícuota:** el diccionario tiene un indicador computable por tipo de gasto; en SAP el indicador define la tasa, así que una factura con dos alícuotas necesitaría dos indicadores.
- **Indicador no computable en el asiento:** las posiciones del carril 2 lo llevan (el IVA ya está en el costo). Confirmar con FI que no dispare un cálculo de impuesto.

## Cancelaciones: instrucción, no planilla

La factura del carril 1 queda abierta a nombre del proveedor y se cancela contra la cuenta puente (o la de tarjeta, o reintegros a pagar) con la misma asignación. La carga masiva de asientos trabaja sólo con cuentas de mayor, así que **en modo Archivo esa cancelación la hace Tesorería a mano en SAP** siguiendo el CSV de cancelaciones. En modo API va por Journal Entry – Post con línea de acreedor y compensación.

## Reglas

- **ADR-002:** el plugin **no importa** `@/lib/rendiciones`. `core-contract.ts` redeclara las formas del lote y tiene que ser compatible por estructura con `tipos.ts`; la verificación está en `src/app/demo/rendiciones/escenario.test.ts`, que importa a los dos.
- **Puro:** sin red, sin fecha del sistema.
- **CSV:** BOM UTF-8, separador `;`, renglones con CRLF, comillas sólo si hacen falta, importes con punto decimal y dos decimales sin miles (`1234.56`). Los textos libres se limpian de caracteres de fórmula al principio (`=`, `+`, `-`, `@`): una razón social leída de una foto no tiene que poder ejecutar nada al abrirse en Excel.

## Tests

```
node --import tsx --test "src/plugins/sap/**/*.test.ts"
```
