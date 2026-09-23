// ============================================================================
// EL PAQUETE DEL MES para el contador — un solo archivo con todo. PURO.
// ============================================================================
//
// Lo que la contadora pide el día 3 y hoy se le manda por partes (o se le da el usuario de
// la dueña): libro de caja, ventas con y sin comprobante, compras, cobranzas y pagos de
// cuentas corrientes, saldos de clientes y proveedores y el stock valorizado. Un CSV con
// secciones numeradas, `;` y BOM (csv-ar.ts), que abre bien en Excel. Todo texto pasa por
// `filaCsv`, que le pone un apóstrofo adelante a lo que Excel tomaría como fórmula.
//
// Arriba de todo dice si es la versión final (mes congelado) o un BORRADOR: un paquete
// bajado con el mes abierto puede cambiar, y la contadora tiene que saberlo antes de cargar.
// Cada sección que no se pudo leer lo dice en vez de salir vacía: "no disponible" no es
// "no hubo movimientos".
//
// Recibe los datos ya leídos (paquete-lectura.ts) y devuelve el texto sin BOM.

import { filaCsv, lineaSinFormulas, pesosCsv } from "@/lib/libros/csv-ar";
import { bordesDelMes, diaLegible, etiquetaDelMes, type MesKey } from "@/lib/libros/fecha-fiscal";
import { lineasLibroIva } from "@/lib/libros/libro-iva-export";
import type { LibroIva } from "@/lib/libros/libro-iva";
import { fechaCorta, type EstadoCierreMes, type Paso } from "./cierre-mes";

/** Un cobro o un pago de cuenta corriente del mes. */
export interface MovimientoCuentaCorriente {
  fecha: string; // YYYY-MM-DD
  tipo: "Cobro de cuenta corriente" | "Pago a proveedor";
  contraparte: string;
  medio: string;
  monto: number;
  nota: string;
}

/** Lo que alguien debe (o se le debe) al cierre del mes. */
export interface SaldoCuenta {
  nombre: string;
  concepto: string;
  vence: string; // YYYY-MM-DD o ""
  saldo: number;
}

export interface FilaStock {
  nombre: string;
  unidad: string;
  stock: number;
  /** Costo vigente, o null si no se conoce. */
  costo: number | null;
  valor: number;
}

export interface DatosPaquete {
  mes: MesKey;
  negocio: string;
  generado: Date;
  estado: EstadoCierreMes;
  /** La lista de control. `null` cuando lo baja el contador (se muestra sólo el estado). */
  pasos: Paso[] | null;
  /** Las líneas del libro de caja del mes (las mismas del export del libro). */
  libroCaja: string[];
  libroIva: LibroIva;
  /** `null` = las tablas de cuentas corrientes no están en esta base. */
  cuentasCorrientes: {
    movimientos: MovimientoCuentaCorriente[];
    clientes: SaldoCuenta[];
    proveedores: SaldoCuenta[];
  } | null;
  stock: FilaStock[];
}

const ESTADO_PASO: Record<Paso["estado"], string> = {
  listo: "Listo",
  pendiente: "Pendiente",
  "no-aplica": "No aplica",
};

function fechaHora(d: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

/** "3,5" kg o "12" unidades: la cantidad sin ceros de más, con coma. */
function cantidad(n: number): string {
  return (Math.round(n * 1000) / 1000).toString().replace(".", ",");
}

/** La línea de estado de arriba: final o borrador. PURA. */
export function lineaDeEstado(estado: EstadoCierreMes): string {
  if (estado.congelado && estado.congeladoEl) {
    return `Versión final: mes congelado el ${fechaCorta(estado.congeladoEl)} por ${estado.congeladoPor ?? "el negocio"}`;
  }
  return "BORRADOR: el mes no está congelado y los números todavía pueden cambiar";
}

/** El paquete completo, sin BOM. PURA. */
export function armarPaquete(d: DatosPaquete): string {
  const b = bordesDelMes(d.mes);
  const L: string[] = [];
  const fin = diaLegible(b.ultimoDia);

  L.push(filaCsv("Paquete del mes para el contador", d.negocio, `${etiquetaDelMes(d.mes)} (del ${diaLegible(b.primerDia)} al ${fin})`));
  L.push(filaCsv("Estado", lineaDeEstado(d.estado)));
  if (d.estado.motivoReapertura && !d.estado.congelado) {
    L.push(filaCsv("Reabierto", `Por ${d.estado.reabiertoPor ?? "el negocio"}: ${d.estado.motivoReapertura}`));
  }
  L.push(filaCsv("Generado", fechaHora(d.generado)));
  L.push("");

  if (d.pasos) {
    L.push(filaCsv("LISTA DE CONTROL DEL CIERRE"));
    L.push(filaCsv("Paso", "Estado", "Detalle"));
    for (const p of d.pasos) L.push(filaCsv(p.titulo, ESTADO_PASO[p.estado], p.detalle));
    L.push("");
  }

  L.push(filaCsv("1. LIBRO DE CAJA"));
  // Las líneas las arma el export del libro de caja, que no neutraliza fórmulas: se vuelven a
  // pasar por `filaCsv` (el motivo de un gasto lo escribe cualquiera y el archivo sale del
  // negocio hacia la contadora).
  L.push(...d.libroCaja.map(lineaSinFormulas));
  L.push("");

  L.push(filaCsv("2. LIBRO IVA: ventas con comprobante, ventas sin comprobante y compras"));
  L.push(...lineasLibroIva(d.libroIva));
  L.push("");

  L.push(filaCsv("3. COBRANZAS Y PAGOS DE CUENTAS CORRIENTES"));
  if (!d.cuentasCorrientes) {
    L.push(filaCsv("No disponible", "Las cuentas corrientes todavía no están habilitadas en este negocio."));
  } else {
    const { movimientos } = d.cuentasCorrientes;
    L.push(filaCsv("Fecha", "Tipo", "Cliente o proveedor", "Medio", "Monto", "Nota"));
    for (const m of movimientos) L.push(filaCsv(m.fecha, m.tipo, m.contraparte, m.medio, pesosCsv(m.monto), m.nota));
    if (movimientos.length === 0) L.push(filaCsv("", "(sin cobranzas ni pagos en el mes)"));
    const cobrado = movimientos.filter((m) => m.tipo === "Cobro de cuenta corriente").reduce((s, m) => s + m.monto, 0);
    const pagado = movimientos.filter((m) => m.tipo === "Pago a proveedor").reduce((s, m) => s + m.monto, 0);
    L.push(filaCsv("Total cobrado", "", "", "", pesosCsv(cobrado)));
    L.push(filaCsv("Total pagado", "", "", "", pesosCsv(pagado)));
  }
  L.push("");

  L.push(filaCsv(`4. SALDOS AL ${fin}`));
  if (!d.cuentasCorrientes) {
    L.push(filaCsv("No disponible", "Las cuentas corrientes todavía no están habilitadas en este negocio."));
  } else {
    const seccion = (titulo: string, saldos: SaldoCuenta[]) => {
      L.push(filaCsv(titulo));
      L.push(filaCsv("Nombre", "Concepto", "Vence", "Saldo"));
      for (const s of saldos) L.push(filaCsv(s.nombre, s.concepto, s.vence, pesosCsv(s.saldo)));
      if (saldos.length === 0) L.push(filaCsv("(sin saldos)"));
      L.push(filaCsv("Total", "", "", pesosCsv(saldos.reduce((t, s) => t + s.saldo, 0))));
    };
    seccion("CLIENTES (lo que te deben)", d.cuentasCorrientes.clientes);
    seccion("PROVEEDORES (lo que debés)", d.cuentasCorrientes.proveedores);
  }
  L.push("");

  L.push(filaCsv("5. STOCK VALORIZADO (al momento de la descarga)"));
  L.push(filaCsv("Producto", "Unidad", "Stock", "Costo", "Valor"));
  for (const s of d.stock) {
    L.push(filaCsv(s.nombre, s.unidad, cantidad(s.stock), s.costo != null ? pesosCsv(s.costo) : "sin costo", pesosCsv(s.valor)));
  }
  if (d.stock.length === 0) L.push(filaCsv("(el negocio no controla stock)"));
  else {
    L.push(filaCsv("Total", "", "", "", pesosCsv(d.stock.reduce((t, s) => t + s.valor, 0))));
    const sinCosto = d.stock.filter((s) => s.costo == null && s.stock > 0).length;
    L.push(
      filaCsv(
        "Nota",
        `El sistema no guarda una foto del stock a fin de mes: son las cantidades al descargar. El costo es el de la última compra o ingreso con costo${sinCosto > 0 ? `; ${sinCosto} ${sinCosto === 1 ? "producto con stock no tiene costo y no suma" : "productos con stock no tienen costo y no suman"}` : ""}. El stock negativo no se valúa.`,
      ),
    );
  }

  return L.join("\r\n") + "\r\n";
}

/** El nombre del archivo: "paquete-2026-08-magra.csv". */
export function nombreDelPaquete(mes: MesKey, slug: string, borrador: boolean): string {
  const limpio = slug.toLowerCase().replace(/[^a-z0-9-]/g, "") || "negocio";
  return `paquete-${mes}-${limpio}${borrador ? "-borrador" : ""}.csv`;
}
