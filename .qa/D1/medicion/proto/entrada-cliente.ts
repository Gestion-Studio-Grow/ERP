import { Prisma } from "../copia/src/generated/prisma/browser";
const D = Prisma.Decimal;
export function sumar(a: string, b: string) { return new D(a).plus(b).toDecimalPlaces(2, D.ROUND_HALF_UP).toFixed(2); }
