// ============================================================================
// MOVIMIENTOS COMO LIBRO (diseño nuevo «Renglón») — la parte pura: agrupar por día.
// ============================================================================
//
// La pantalla trae hasta 200 movimientos, del más nuevo al más viejo. En el celular, de corrido,
// eran 26.000 px. Como libro, cada día es un tramo con su rótulo («Hoy», «Ayer», «martes 23 de
// septiembre») y la cuenta de movimientos; se abren los días de arriba hasta juntar unos 25
// renglones y el resto queda plegado con su cuenta a la vista. No se esconde nada: se pliega.
// Sin imports de servidor ni de Prisma: recibe los días ya calculados en la zona del negocio.

export type DiaDelLibro<T> = { dia: string; filas: T[] };

/** Agrupa en orden de llegada (ya vienen del más nuevo al más viejo) por el día que da `diaDe`. */
export function agruparPorDia<T>(filas: readonly T[], diaDe: (f: T) => string): DiaDelLibro<T>[] {
  const dias: DiaDelLibro<T>[] = [];
  for (const f of filas) {
    const d = diaDe(f);
    const ultimo = dias[dias.length - 1];
    if (ultimo && ultimo.dia === d) ultimo.filas.push(f);
    else dias.push({ dia: d, filas: [f] });
  }
  return dias;
}

/** Cuántos días arrancan abiertos: siempre el primero, y los siguientes mientras no se pase de `tope` renglones. */
export function diasAbiertos(dias: readonly { filas: readonly unknown[] }[], tope = 25): number {
  let abiertos = 0;
  let renglones = 0;
  for (const d of dias) {
    if (abiertos > 0 && renglones + d.filas.length > tope) break;
    abiertos += 1;
    renglones += d.filas.length;
  }
  return abiertos;
}

/** «Hoy», «Ayer» o null (el llamador pone la fecha larga). Días como AAAA-MM-DD. */
export function rotuloCercano(dia: string, hoy: string): "Hoy" | "Ayer" | null {
  if (dia === hoy) return "Hoy";
  const ayer = new Date(`${hoy}T12:00:00.000Z`);
  ayer.setUTCDate(ayer.getUTCDate() - 1);
  return ayer.toISOString().slice(0, 10) === dia ? "Ayer" : null;
}
