import { Decimal } from "@prisma/client-runtime-utils";
export function sumar(a: string, b: string) { return new Decimal(a).plus(b).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2); }
