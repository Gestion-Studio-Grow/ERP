/**
 * Nómina · motor de cálculo del recibo mensual (fase 1: CCT 130/75, mensualizado, jornada completa).
 *
 * Puro: sin base, sin fecha del sistema, sin I/O. Entra el legajo + las novedades del período +
 * la configuración del empleador; sale el recibo con sus líneas, totales y los parámetros usados.
 * Orden de cálculo fijo (regla 14 de docs/nomina/casos-comercio-130-75.md):
 *   básico → antigüedad → ausencias → presentismo → horas extra → no rem. → bases → aportes →
 *   contribuciones → neto.
 * Redondeo: cada línea una vez al centavo (medio centavo hacia arriba) sobre la base exacta;
 * los totales son la suma de las líneas ya redondeadas (src/lib/dinero/redondeo.ts, R1/R3/R5).
 * Aportes y contribuciones se calculan sobre BASES ACUMULADAS, nunca línea por línea, para que
 * el F.931 cuadre con el recibo.
 */
import {
  admiteCentavos,
  centavosDe,
  porcentajeDe,
  proporcionAlCentavo,
  sumarAlCentavo,
} from "../dinero/redondeo";
import {
  CONVENIO_COMERCIO,
  ESCALAS_COMERCIO,
  NOMBRE_CATEGORIA,
  REGLAS_COMERCIO_V1,
  type CategoriaComercio,
} from "./convenios/comercio-130-75";
import { parametrosLeyDe, validarPeriodo, vigenteEn } from "./parametros-ley";
import type { LineaRecibo, Recibo, TipoConcepto } from "./tipos";

export interface EmpleadoComercio {
  categoria: CategoriaComercio;
  /**
   * Sueldo básico pactado por encima de la escala (opcional). Si es menor que el básico de
   * convenio se rechaza: el CCT es un piso.
   */
  basicoConvenido?: number;
  /** Años de antigüedad cumplidos a la fecha de liquidación (enteros). */
  antiguedadAnios: number;
  afiliadoSindical: boolean;
}

export interface NovedadesMes {
  /** Días de ausencia injustificada (enteros, 0..30). */
  ausenciasInjustificadas: number;
  /** Horas extra al 50 % y al 100 % (hasta dos decimales: 1,5 h = 1.5). */
  horasExtra50: number;
  horasExtra100: number;
}

export interface ConfigEmpleador {
  /** Contribución dto. 814/01: 18 % (general) o 20,4 % (grandes empresas de comercio y servicios). */
  alicuotaContribucion: number;
  /** ART: alícuota variable sobre remunerativo + cuota fija por trabajador. Ausente = no se liquida (advertencia). */
  art?: { variable: number; fija: number };
  /** Prima del seguro de vida obligatorio (dto. 1567/74). Ausente = no se liquida (advertencia). */
  seguroVidaObligatorio?: number;
}

export interface EntradaReciboComercio {
  periodo: string;
  empleado: EmpleadoComercio;
  novedades: NovedadesMes;
  empleador: ConfigEmpleador;
}

const ALICUOTAS_814 = [18, 20.4];
/** Ningún importe de un recibo de sueldo llega a $10.000 millones; arriba de eso es un error de carga. */
const IMPORTE_MAXIMO = 10_000_000_000;
/** Dto. 484/00: máximo 30 horas extra por mes (y 200 por año, que se controla con el acumulado en fase 2). */
const HORAS_EXTRA_MAXIMAS_MES = 30;

function exigirEnteroEnRango(valor: number, min: number, max: number, que: string): void {
  if (!Number.isInteger(valor) || valor < min || valor > max) {
    throw new RangeError(`${que} inválido: ${valor} (entero entre ${min} y ${max}).`);
  }
}

function exigirImporte(valor: number, que: string): void {
  if (
    !Number.isFinite(valor) ||
    valor < 0 ||
    valor > IMPORTE_MAXIMO ||
    !admiteCentavos(valor) ||
    centavosDe(valor) / 100 !== valor
  ) {
    throw new RangeError(`${que} inválido: ${valor} (importe entre 0 y ${IMPORTE_MAXIMO} con hasta dos decimales).`);
  }
}

/** Porcentaje con hasta dos decimales: porcentajeDe redondea el porcentaje, acá se rechaza en vez de redondear en silencio. */
function exigirPorcentaje(valor: number, que: string): void {
  if (!Number.isFinite(valor) || valor < 0 || valor > 100 || centavosDe(valor) / 100 !== valor) {
    throw new RangeError(`${que} inválido: ${valor} (porcentaje entre 0 y 100 con hasta dos decimales).`);
  }
}

/** Horas con hasta dos decimales, en centésimos de hora enteros. */
function centesimosDeHora(horas: number, que: string): number {
  if (!Number.isFinite(horas) || horas < 0 || horas > HORAS_EXTRA_MAXIMAS_MES) {
    throw new RangeError(`${que} inválidas: ${horas}.`);
  }
  const centesimos = Math.round(horas * 100);
  if (Math.abs(centesimos - horas * 100) > 1e-6) {
    throw new RangeError(`${que} inválidas: ${horas} (hasta dos decimales).`);
  }
  return centesimos;
}

function linea(
  tipo: TipoConcepto,
  codigo: string,
  descripcion: string,
  importe: number,
  extra: Partial<Pick<LineaRecibo, "base" | "porcentaje" | "cantidad">> = {},
): LineaRecibo {
  return {
    codigo,
    descripcion,
    tipo,
    base: extra.base ?? null,
    porcentaje: extra.porcentaje ?? null,
    cantidad: extra.cantidad ?? null,
    importe: importe === 0 ? 0 : importe, // nunca −0 en el snapshot
    conceptoArca: null,
  };
}

export function liquidarReciboComercio(entrada: EntradaReciboComercio): Recibo {
  const periodo = validarPeriodo(entrada.periodo);
  const escala = vigenteEn(ESCALAS_COMERCIO, periodo, "escalas de Comercio");
  const ley = parametrosLeyDe(periodo);
  const reglas = REGLAS_COMERCIO_V1;
  const { empleado, novedades, empleador } = entrada;
  const advertencias: string[] = [];

  // ── Validación de entrada ───────────────────────────────────────────────────────────────
  // hasOwn y no `in`: «toString», «constructor», etc. vienen del prototipo y darían plata inválida.
  if (typeof empleado.categoria !== "string" || !Object.hasOwn(escala.basicos, empleado.categoria)) {
    throw new RangeError(`Categoría desconocida en ${escala.id}: «${empleado.categoria}».`);
  }
  exigirEnteroEnRango(empleado.antiguedadAnios, 0, 60, "Antigüedad");
  if (typeof empleado.afiliadoSindical !== "boolean") {
    throw new RangeError(`Afiliación sindical inválida: ${String(empleado.afiliadoSindical)} (true o false).`);
  }
  exigirEnteroEnRango(novedades.ausenciasInjustificadas, 0, reglas.diasMes, "Días de ausencia");
  const he50 = centesimosDeHora(novedades.horasExtra50, "Horas extra al 50 %");
  const he100 = centesimosDeHora(novedades.horasExtra100, "Horas extra al 100 %");
  if (he50 + he100 > HORAS_EXTRA_MAXIMAS_MES * 100) {
    throw new RangeError(
      `Horas extra inválidas: ${novedades.horasExtra50} + ${novedades.horasExtra100} superan las ${HORAS_EXTRA_MAXIMAS_MES} h mensuales del dto. 484/00.`,
    );
  }
  if (!ALICUOTAS_814.includes(empleador.alicuotaContribucion)) {
    throw new RangeError(`Alícuota de contribución inválida: ${empleador.alicuotaContribucion} (18 o 20,4).`);
  }
  if (empleador.art) {
    exigirPorcentaje(empleador.art.variable, "ART variable");
    exigirImporte(empleador.art.fija, "ART fija");
  } else {
    advertencias.push("ART sin configurar: no se liquidó la contribución a la ART.");
  }
  if (empleador.seguroVidaObligatorio !== undefined) {
    exigirImporte(empleador.seguroVidaObligatorio, "Seguro de vida obligatorio");
  } else {
    advertencias.push("Seguro de vida obligatorio sin configurar: no se liquidó.");
  }

  const basicoEscala = escala.basicos[empleado.categoria];
  let basico = basicoEscala;
  if (empleado.basicoConvenido !== undefined) {
    exigirImporte(empleado.basicoConvenido, "Básico convenido");
    if (empleado.basicoConvenido < basicoEscala) {
      throw new RangeError(
        `Básico convenido ${empleado.basicoConvenido} menor que el de convenio ${basicoEscala}.`,
      );
    }
    basico = empleado.basicoConvenido;
  }
  if (escala.provisional) advertencias.push(`Escala ${escala.id} provisional a confirmar.`);
  if (ley.provisional) advertencias.push(`Parámetros de ley ${ley.id} provisionales a confirmar.`);

  const lineas: LineaRecibo[] = [];
  const nombreCategoria = NOMBRE_CATEGORIA[empleado.categoria];

  // ── Remunerativos ───────────────────────────────────────────────────────────────────────
  lineas.push(
    linea("R", "BASICO", `Sueldo básico ${nombreCategoria}${basico !== basicoEscala ? " (sobre escala)" : ""}`, basico),
  );

  const porcentajeAntiguedad = reglas.antiguedadPorAnio * empleado.antiguedadAnios;
  let antiguedad = 0;
  if (empleado.antiguedadAnios > 0) {
    antiguedad = porcentajeDe(basico, porcentajeAntiguedad, "centavo");
    lineas.push(
      linea("R", "ANTIGUEDAD", `Antigüedad ${empleado.antiguedadAnios} años`, antiguedad, {
        base: basico,
        porcentaje: porcentajeAntiguedad,
        cantidad: empleado.antiguedadAnios,
      }),
    );
  }

  const baseDiaria = sumarAlCentavo([basico, antiguedad]);
  let ausencias = 0;
  if (novedades.ausenciasInjustificadas > 0) {
    ausencias = -proporcionAlCentavo(baseDiaria, novedades.ausenciasInjustificadas, reglas.diasMes);
    lineas.push(
      linea(
        "R",
        "AUSENCIAS",
        `Ausencias injustificadas (${novedades.ausenciasInjustificadas} días, /${reglas.diasMes})`,
        ausencias,
        { base: baseDiaria, cantidad: novedades.ausenciasInjustificadas },
      ),
    );
  }

  const pierdePresentismo = novedades.ausenciasInjustificadas > 0;
  const basePresentismo = sumarAlCentavo([basico, antiguedad, ausencias]);
  const presentismo = pierdePresentismo ? 0 : porcentajeDe(basePresentismo, reglas.presentismo, "centavo");
  lineas.push(
    linea("R", "PRESENTISMO", pierdePresentismo ? "Presentismo (perdido)" : "Presentismo", presentismo, {
      base: basePresentismo,
      porcentaje: pierdePresentismo ? 0 : reglas.presentismo,
    }),
  );

  // Valor hora = (básico + antigüedad + presentismo) / 200; no se redondea por separado:
  // importe = base × horas × recargo / 200, en una sola proporción entera.
  const baseHora = sumarAlCentavo([basico, antiguedad, presentismo]);
  if (he50 > 0) {
    // horas × 1,5 / 200 = centésimos × 3 / 40.000
    const importe = proporcionAlCentavo(baseHora, he50 * 3, reglas.divisorHora * 2 * 100);
    lineas.push(
      linea("R", "HE50", `Horas extra 50 % (${novedades.horasExtra50} h)`, importe, {
        base: baseHora,
        cantidad: novedades.horasExtra50,
      }),
    );
  }
  if (he100 > 0) {
    // horas × 2 / 200 = centésimos × 2 / 20.000
    const importe = proporcionAlCentavo(baseHora, he100 * 2, reglas.divisorHora * 100);
    lineas.push(
      linea("R", "HE100", `Horas extra 100 % (${novedades.horasExtra100} h)`, importe, {
        base: baseHora,
        cantidad: novedades.horasExtra100,
      }),
    );
  }

  // ── No remunerativos ────────────────────────────────────────────────────────────────────
  for (const suma of escala.sumasNoRemunerativas) {
    lineas.push(linea("N", suma.codigo, suma.descripcion, suma.importe));
  }
  if (novedades.ausenciasInjustificadas > 0 && escala.sumasNoRemunerativas.length > 0) {
    advertencias.push(
      "Sumas no remunerativas liquidadas enteras pese a las ausencias: el prorrateo está pendiente de definir con el contador.",
    );
  }

  // ── Bases ───────────────────────────────────────────────────────────────────────────────
  const remunerativo = sumarAlCentavo(lineas.filter((l) => l.tipo === "R").map((l) => l.importe));
  const noRemunerativo = sumarAlCentavo(lineas.filter((l) => l.tipo === "N").map((l) => l.importe));
  const baseAportes = Math.min(remunerativo, ley.topeBaseAportes);
  const baseSindical = sumarAlCentavo([remunerativo, noRemunerativo]);

  // ── Aportes del empleado (positivos; se restan para el neto) ────────────────────────────
  const aporte = (codigo: string, descripcion: string, base: number, porcentaje: number) =>
    lineas.push(linea("A", codigo, descripcion, porcentajeDe(base, porcentaje, "centavo"), { base, porcentaje }));
  aporte("AP_JUBILACION", "Jubilación SIPA", baseAportes, ley.aporteJubilacion);
  aporte("AP_LEY19032", "Ley 19.032 (PAMI)", baseAportes, ley.aporteLey19032);
  aporte("AP_OS", "Obra social", baseAportes, ley.aporteObraSocial);
  if (noRemunerativo > 0) aporte("AP_OS_NR", "Obra social (no rem.)", noRemunerativo, ley.aporteObraSocial);
  if (empleado.afiliadoSindical) aporte("AP_SINDICAL", "Cuota sindical afiliado", baseSindical, reglas.cuotaSindical);
  aporte("AP_FAECYS", "Aporte solidario FAECYS", baseSindical, reglas.aporteSolidarioFaecys);

  // ── Contribuciones patronales (sin tope) ────────────────────────────────────────────────
  const contribucion = (codigo: string, descripcion: string, base: number, porcentaje: number) =>
    lineas.push(linea("C", codigo, descripcion, porcentajeDe(base, porcentaje, "centavo"), { base, porcentaje }));
  contribucion("CO_814", "Contrib. SIPA/INSSJP/FNE/AAFF dto. 814/01", remunerativo, empleador.alicuotaContribucion);
  contribucion("CO_OS", "Contrib. obra social", remunerativo, ley.contribucionObraSocial);
  if (noRemunerativo > 0) {
    contribucion("CO_OS_NR", "Contrib. obra social (no rem.)", noRemunerativo, ley.contribucionObraSocial);
  }
  if (empleador.art) {
    contribucion("CO_ART_VAR", "ART variable", remunerativo, empleador.art.variable);
    lineas.push(linea("C", "CO_ART_FIJA", "ART fija", empleador.art.fija));
  }
  if (empleador.seguroVidaObligatorio !== undefined) {
    lineas.push(linea("C", "CO_SVO", "Seguro de vida obligatorio", empleador.seguroVidaObligatorio));
  }

  // ── Totales ─────────────────────────────────────────────────────────────────────────────
  const aportes = sumarAlCentavo(lineas.filter((l) => l.tipo === "A").map((l) => l.importe));
  const contribuciones = sumarAlCentavo(lineas.filter((l) => l.tipo === "C").map((l) => l.importe));
  const neto = (centavosDe(remunerativo) + centavosDe(noRemunerativo) - centavosDe(aportes)) / 100;
  for (const l of lineas) {
    if (!Number.isFinite(l.importe)) throw new RangeError(`Importe inválido en ${l.codigo}: ${l.importe}.`);
  }
  if (!Number.isFinite(neto) || neto < 0) throw new RangeError(`Neto inválido (${neto}): revisar novedades.`);

  return {
    periodo,
    tipoLiquidacion: "mensual",
    convenio: CONVENIO_COMERCIO,
    versionReglas: reglas.version,
    versionParametros: `${escala.id}+${ley.id}`,
    novedades: {
      ausenciasInjustificadas: novedades.ausenciasInjustificadas,
      horasExtra50: novedades.horasExtra50,
      horasExtra100: novedades.horasExtra100,
      antiguedadAnios: empleado.antiguedadAnios,
      afiliadoSindical: empleado.afiliadoSindical,
    },
    parametros: {
      categoria: empleado.categoria,
      basicoEscala,
      basicoLiquidado: basico,
      // Prefijo «nr.» para que el código de una suma nunca pise otra clave del snapshot.
      ...Object.fromEntries(escala.sumasNoRemunerativas.map((s) => [`nr.${s.codigo}`, s.importe])),
      antiguedadPorAnio: reglas.antiguedadPorAnio,
      presentismo: reglas.presentismo,
      diasMes: reglas.diasMes,
      divisorHora: reglas.divisorHora,
      cuotaSindical: reglas.cuotaSindical,
      aporteSolidarioFaecys: reglas.aporteSolidarioFaecys,
      topeBaseAportes: ley.topeBaseAportes,
      aporteJubilacion: ley.aporteJubilacion,
      aporteLey19032: ley.aporteLey19032,
      aporteObraSocial: ley.aporteObraSocial,
      contribucionObraSocial: ley.contribucionObraSocial,
      alicuotaContribucion: empleador.alicuotaContribucion,
      artVariable: empleador.art?.variable ?? "sin configurar",
      artFija: empleador.art?.fija ?? "sin configurar",
      seguroVidaObligatorio: empleador.seguroVidaObligatorio ?? "sin configurar",
      escalaProvisional: escala.provisional,
      escalaFuente: escala.fuente,
      leyProvisional: ley.provisional,
      leyFuente: ley.fuente,
    },
    lineas,
    totales: { remunerativo, noRemunerativo, baseAportes, aportes, neto, contribuciones },
    advertencias,
  };
}
