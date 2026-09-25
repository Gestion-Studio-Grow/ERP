// LEER UN IMPORTE escrito a mano: plata en pesos, no cantidades (ENG-109, D1-PLAN §3.1).
//
// Un solo lector para la pantalla y para el servidor. Un `type="number"` no entiende cómo se
// escribe la plata acá: en un campo de plata "$1.234" son mil doscientos treinta y cuatro pesos,
// no un peso con veintitrés centavos, y "12.500" leído con `Number` era 12,5: un cobro de doce mil
// quinientos que entraba como doce pesos con cincuenta.
//
//   · UN separador seguido de EXACTAMENTE 3 dígitos es de MILES:  "12.500" y "12,500" → 12500
//   · UN separador seguido de 1 o 2 dígitos es el DECIMAL:        "12,5" y "12.50"   → 12,5
//   · DOS separadores distintos: el último es el decimal:         "1.234,56"          → 1234,56
//   · Separadores iguales repetidos: todos de miles:              "1.234.567"         → 1234567
//   · Precisión: CENTAVOS. Un tercer decimal no es plata, es un error: se rechaza.
//   · Se toleran el "$" y los espacios que se arrastran al copiar de un extracto.
//   · No hay signo: un importe escrito en un formulario nunca es negativo.
//
// Lo usan componentes del navegador: este módulo sólo importa la regla de redondeo.
import { redondearAlCentavo } from "./redondeo";

export type LecturaImporte =
  | { estado: "ok"; valor: number }
  | { estado: "vacio" }
  | { estado: "invalida" };

export function leerImporte(raw: string | null | undefined): LecturaImporte {
  const s = String(raw ?? "")
    .replace(/\s/g, "") // \s incluye el espacio duro (U+00A0) y el angosto (U+202F)
    .replace(/^\$/, "");
  if (s === "") return { estado: "vacio" };
  if (!/^[0-9.,]+$/.test(s)) return { estado: "invalida" };

  const corte = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  if (corte === -1) {
    const n = Number(s);
    return Number.isFinite(n) ? { estado: "ok", valor: n } : { estado: "invalida" };
  }

  const sep = s[corte];
  const cabeza = s.slice(0, corte);
  const cola = s.slice(corte + 1);
  // Grupos de miles: el primero no empieza con 0 ("0,555" no son quinientos cincuenta y cinco
  // pesos: es un tercer decimal, que en plata no existe, y rebota).
  const miles = /^(0|[1-9]\d{0,2})([.,]\d{3})*$/;
  const milesConGrupos = /^[1-9]\d{0,2}([.,]\d{3})+$/;

  // Separador colgando mientras se tipea ("12."): vale el entero, no se pinta de rojo.
  if (cola === "") {
    if (!(cabeza === "" || /^\d+$/.test(cabeza) || miles.test(cabeza))) return { estado: "invalida" };
    const n = Number(cabeza.replace(/[.,]/g, ""));
    return Number.isFinite(n) ? { estado: "ok", valor: n } : { estado: "invalida" };
  }
  if (!/^\d+$/.test(cola)) return { estado: "invalida" };

  const otro = sep === "." ? "," : ".";
  const hayOtroSeparador = cabeza.includes(otro);

  // Todo el número son grupos de miles: "12.500", "1.234.567". El separador final NO es decimal.
  if (!hayOtroSeparador && cola.length === 3 && milesConGrupos.test(s)) {
    return { estado: "ok", valor: Number(s.replace(/[.,]/g, "")) };
  }

  // El último separador es el decimal: la parte entera tiene que ser dígitos o miles con EL OTRO
  // separador ("1.234,56"). Mezclar ("1,234,56") o pasarse de centavos ("12,345,6") rebota.
  if (cola.length > 2) return { estado: "invalida" };
  const enteraOk = cabeza === "" || /^\d+$/.test(cabeza) || (hayOtroSeparador && !cabeza.includes(sep) && miles.test(cabeza));
  if (!enteraOk) return { estado: "invalida" };

  const n = Number(`${cabeza.replace(/[.,]/g, "") || "0"}.${cola}`);
  return Number.isFinite(n) ? { estado: "ok", valor: redondearAlCentavo(n) } : { estado: "invalida" };
}

/**
 * El importe de un campo de formulario, o NaN si vino vacío, no es plata o es un archivo. Para las
 * acciones de servidor que ya validan con `Number.isFinite(x) && x > 0`: esa validación rechaza el
 * NaN con su mensaje de siempre, y lo único que cambia es que "12.500" se lee 12500.
 */
export function importeONaN(raw: FormDataEntryValue | null | undefined): number {
  if (typeof raw !== "string") return Number.NaN;
  const l = leerImporte(raw);
  return l.estado === "ok" ? l.valor : Number.NaN;
}
