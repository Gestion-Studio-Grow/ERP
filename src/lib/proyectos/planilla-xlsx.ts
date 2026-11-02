// La planilla de venta como libro de Excel, con importes numéricos para poder sumarlos. Sin costos, como el papel.
// Los textos cargados por personas van como texto: un «=algo» no se ejecuta como fórmula al abrir el archivo.

import * as XLSX from "xlsx";

export interface PlanillaParaExcel {
  proyecto: { nombre: string; client: { name: string } };
  codigo: string;
  moneda: string;
  version: number;
  grupos: { rubro: string; subtotal: number; lineas: { descripcion: string; cantidad: number | null; importe: number }[] }[];
  neto: number;
  ivaPct: number;
  iva: number;
  total: number;
}

const FORMATO_PLATA = "#,##0.00";

export function libroDePlanilla(d: PlanillaParaExcel): Buffer {
  const filas: (string | number | null)[][] = [
    [d.proyecto.nombre, d.proyecto.client.name, d.codigo, `Versión ${d.version}`, `Importes en ${d.moneda}`],
    [],
    ["Rubro", "Detalle", "Cantidad", "Importe"],
    ...d.grupos.flatMap((g) => [...g.lineas.map((l) => [g.rubro, l.descripcion, l.cantidad, l.importe]), [g.rubro, "Subtotal", null, g.subtotal]]),
    [null, "Neto", null, d.neto],
    [null, `IVA ${d.ivaPct}%`, null, d.iva],
    [null, "Total", null, d.total],
  ];
  const hoja = XLSX.utils.aoa_to_sheet(filas);
  hoja["!cols"] = [{ wch: 28 }, { wch: 44 }, { wch: 10 }, { wch: 16 }];
  for (let f = 3; f < filas.length; f++) {
    const celda = hoja[XLSX.utils.encode_cell({ r: f, c: 3 })];
    if (celda?.t === "n") celda.z = FORMATO_PLATA;
  }
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Planilla de venta");
  return XLSX.write(libro, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
