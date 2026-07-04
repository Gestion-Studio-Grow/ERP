// Identidad fiscal argentina — validaciones puras del Core (sin I/O externo).
// CUIT/CUIL por dígito verificador y el código de condición IVA del receptor que
// ARCA exige (RG 5616/2024: obligatorio, y desde el 1/9/2026 su ausencia hace
// rechazar el comprobante). Todo cálculo/validación local: no consulta padrón
// (eso es la capacidad `consultar-padron`, Fase 2 de ADR-020).
import type { CondicionIva } from "@/generated/prisma/client";

const PESOS_CUIT = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

// Valida un CUIT/CUIL por su dígito verificador (algoritmo AFIP). Acepta con o
// sin guiones/espacios. No consulta ARCA — solo verifica que el número esté bien
// formado, que es la barrera barata antes de intentar emitir con un CUIT roto.
export function esCuitValido(cuit: string | null | undefined): boolean {
  const d = (cuit ?? "").replace(/\D/g, "");
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false; // 11 dígitos iguales -> inválido
  const suma = PESOS_CUIT.reduce((acc, peso, i) => acc + peso * Number(d[i]), 0);
  const resto = suma % 11;
  const verificador = resto === 0 ? 0 : 11 - resto;
  return verificador === Number(d[10]);
}

// Formatea un CUIT a "XX-XXXXXXXX-X". Devuelve el input tal cual si no tiene 11
// dígitos (para no ocultar un dato malo detrás de un formato lindo).
export function formatearCuit(cuit: string): string {
  const d = (cuit ?? "").replace(/\D/g, "");
  if (d.length !== 11) return cuit;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

// Mapea nuestra condición IVA al código de "Condición IVA Receptor" de ARCA
// (FEParamGetCondicionIvaReceptor, RG 5616). Switch exhaustivo: si se agrega un
// valor al enum, TypeScript obliga a mapearlo acá.
export function codigoCondicionIvaReceptor(cond: CondicionIva): number {
  switch (cond) {
    case "RESPONSABLE_INSCRIPTO":
      return 1;
    case "EXENTO":
      return 4;
    case "CONSUMIDOR_FINAL":
      return 5;
    case "MONOTRIBUTO":
      return 6;
    case "NO_CATEGORIZADO":
      return 7;
  }
}
