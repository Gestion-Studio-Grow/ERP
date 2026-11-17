// ESQUELETO (commit de tests en rojo, GSG-MIA-056 · T04): sólo tipos y firmas. El código llega en el commit siguiente.
import type { Centavos, Precio } from "./precio-core";
export const PARTICIPANTES = ["mia", "productor1", "productor2", "comercial"] as const;
export type Participante = (typeof PARTICIPANTES)[number];
export type Persona = Exclude<Participante, "mia">;
export type PorPersona = Record<Persona, number>;
export interface MatrizReparto { defensa: PorPersona; redondeo: PorPersona; margenError: PorPersona }
export interface FilaRendicion { defensa: Centavos; redondeo: Centavos; comisiones: Centavos; margenError: Centavos; rentabilidad: Centavos; total: Centavos }
export interface EntradaRendicion { precio: Precio; costoReal: Centavos; matriz: MatrizReparto; defensaNegativa: "descuenta" | "pisoCero" }
export interface Rendicion { defensa: Centavos; defensaNegativa: boolean; filas: Record<Participante, FilaRendicion>; totales: FilaRendicion; control: { suma: Centavos; esperado: Centavos; cierra: boolean }; avisos: string[] }
export interface Diferencia { id: string; planilla: string; motor: string; fuente: string }
const SIN = (): never => { throw new Error("sin implementar"); };
export const MATRIZ_PLANTILLA = {} as MatrizReparto & { provisional: true };
export const DIFERENCIAS_CON_PLANILLA: readonly Diferencia[] = [];
export function calcularRendicion(_e: EntradaRendicion): Rendicion { return SIN(); }
export function cierraAlCentavo(_r: Rendicion): boolean { return SIN(); }
export function ajusteEntre(_a: Rendicion, _b: Rendicion): Record<Participante, Centavos> & { total: Centavos } { return SIN(); }
