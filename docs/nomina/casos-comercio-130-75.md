# Casos calculados a mano — Comercio CCT 130/75 (fase 1: recibo mensual, mensualizado)

> Fecha: 2026-11-06. Período liquidado: **noviembre 2026** (mes de 30 días, jornada completa 48 h).
> Cifras recalculadas con aritmética decimal exacta (script de verificación fuera del repo); listas para pasar a fixtures de test.

## Parámetros del período

| Parámetro | Valor | Estado / fuente |
|---|---:|---|
| Acuerdo | FAECYS–CAC/CAME/UDECA, trimestre oct–dic 2026: +5,7 % en 3 tramos de 1,9 % sobre escala sep-2026; suma fija no rem. $ 120.000; bono extraordinario $ 50.000 en 2 cuotas (oct y nov) | **provisional a confirmar** (homologación no verificada; fuentes secundarias contradictorias: calcularsueldo.com.ar/?p=16350 lo da por confirmado, /?p=16329 dice «en negociación») |
| Básico Maestranza A (nov-26) | 1.233.448,00 | provisional a confirmar — calcularsueldo.com.ar/?p=16350 |
| Básico Administrativo A (nov-26) | 1.246.664,00 | provisional a confirmar — íd.; total 1.391.664 coincide con iProfesional |
| Básico Vendedor B (nov-26) | 1.277.511,00 | provisional a confirmar — íd.; total 1.422.511 coincide con Infobae/Canal 26 |
| Suma fija no remunerativa acuerdo | 120.000,00 | provisional a confirmar |
| Bono extraordinario (cuota 2/2) | 25.000,00 | provisional a confirmar |
| Tope base aportes (máx.) | 4.861.685,38 | Res. ANSES 304/2026 vía blogdelcontador/contadoresenred — a verificar en B.O. |
| Contribución dto. 814/01 | 18,00 % (alternativa 20,40 % gran empresa comercio/servicios) | parámetro por empleador |
| Detracción ley 27.430/27.541 | 0,00 (no aplicada) | parámetro — decisión del contador |
| ART | variable 2,00 % + fija $ 1.200 | **EJEMPLO**, no real |
| Seguro de vida obligatorio (dto. 1567/74) | $ 300 | **EJEMPLO**, no real |
| INACAP / Seguro La Estrella (CCT) | 0,00 (no incluidos) | parámetro — a verificar monto y si es aporte o contribución |

Columnas: `tipo` R = remunerativo, N = no remunerativo, A = aporte/descuento (negativo), C = contribución patronal (no afecta neto).
Formato numérico: punto de miles, coma decimal.

## Caso 1 — Normal

| tipo | concepto | base | % / fórmula | importe |
|---|---|---:|---|---:|
| R | Sueldo básico Administrativo A | 1.246.664,00 |  | 1.246.664,00 |
| R | Presentismo | 1.246.664,00 | 8,33 % | 103.847,11 |
| N | Suma fija no rem. acuerdo |  |  | 120.000,00 |
| N | Bono extraordinario cuota 2/2 |  |  | 25.000,00 |
| A | Jubilación SIPA | 1.350.511,11 | 11,00 % | -148.556,22 |
| A | Ley 19.032 (PAMI) | 1.350.511,11 | 3,00 % | -40.515,33 |
| A | Obra social (rem.) | 1.350.511,11 | 3,00 % | -40.515,33 |
| A | Obra social (no rem.) | 145.000,00 | 3,00 % | -4.350,00 |
| A | Cuota sindical afiliado | 1.495.511,11 | 2,00 % | -29.910,22 |
| A | Aporte solidario FAECYS | 1.495.511,11 | 0,50 % | -7.477,56 |
| C | Contrib. SIPA/INSSJP/FNE/AAFF dto. 814/01 | 1.350.511,11 | 18,00 % | 243.092,00 |
| C | Contrib. obra social (rem.) | 1.350.511,11 | 6,00 % | 81.030,67 |
| C | Contrib. obra social (no rem.) | 145.000,00 | 6,00 % | 8.700,00 |
| C | ART variable (EJEMPLO) | 1.350.511,11 | 2,00 % | 27.010,22 |
| C | ART fija (EJEMPLO) |  | fijo | 1.200,00 |
| C | Seguro de vida obligatorio (EJEMPLO) |  | fijo | 300,00 |

| total | importe |
|---|---:|
| Remunerativo | 1.350.511,11 |
| No remunerativo | 145.000,00 |
| Base aportes SIPA/OS (con tope) | 1.350.511,11 |
| Aportes | 271.324,66 |
| **Neto** | **1.224.186,45** |
| Contribuciones (incl. ejemplos ART/SVO) | 361.332,89 |
| Contribuciones sin ART/SVO | 332.822,67 |

## Caso 2 — Antigüedad 7 años (no afiliado)

| tipo | concepto | base | % / fórmula | importe |
|---|---|---:|---|---:|
| R | Sueldo básico Vendedor B | 1.277.511,00 |  | 1.277.511,00 |
| R | Antigüedad 7 años | 1.277.511,00 | 7,00 % | 89.425,77 |
| R | Presentismo | 1.366.936,77 | 8,33 % | 113.865,83 |
| N | Suma fija no rem. acuerdo |  |  | 120.000,00 |
| N | Bono extraordinario cuota 2/2 |  |  | 25.000,00 |
| A | Jubilación SIPA | 1.480.802,60 | 11,00 % | -162.888,29 |
| A | Ley 19.032 (PAMI) | 1.480.802,60 | 3,00 % | -44.424,08 |
| A | Obra social (rem.) | 1.480.802,60 | 3,00 % | -44.424,08 |
| A | Obra social (no rem.) | 145.000,00 | 3,00 % | -4.350,00 |
| A | Aporte solidario FAECYS | 1.625.802,60 | 0,50 % | -8.129,01 |
| C | Contrib. SIPA/INSSJP/FNE/AAFF dto. 814/01 | 1.480.802,60 | 18,00 % | 266.544,47 |
| C | Contrib. obra social (rem.) | 1.480.802,60 | 6,00 % | 88.848,16 |
| C | Contrib. obra social (no rem.) | 145.000,00 | 6,00 % | 8.700,00 |
| C | ART variable (EJEMPLO) | 1.480.802,60 | 2,00 % | 29.616,05 |
| C | ART fija (EJEMPLO) |  | fijo | 1.200,00 |
| C | Seguro de vida obligatorio (EJEMPLO) |  | fijo | 300,00 |

| total | importe |
|---|---:|
| Remunerativo | 1.480.802,60 |
| No remunerativo | 145.000,00 |
| Base aportes SIPA/OS (con tope) | 1.480.802,60 |
| Aportes | 264.215,46 |
| **Neto** | **1.361.587,14** |
| Contribuciones (incl. ejemplos ART/SVO) | 395.208,68 |
| Contribuciones sin ART/SVO | 364.092,63 |

## Caso 3 — 6 h extra 50 % y 2 h al 100 %

| tipo | concepto | base | % / fórmula | importe |
|---|---|---:|---|---:|
| R | Sueldo básico Maestranza A | 1.233.448,00 |  | 1.233.448,00 |
| R | Antigüedad 3 años | 1.233.448,00 | 3,00 % | 37.003,44 |
| R | Presentismo | 1.270.451,44 | 8,33 % | 105.828,60 |
| R | Horas extra 50 % (6 h) | 1.376.280,04 | 6×1,5/200 | 61.932,60 |
| R | Horas extra 100 % (2 h) | 1.376.280,04 | 2×2/200 | 27.525,60 |
| N | Suma fija no rem. acuerdo |  |  | 120.000,00 |
| N | Bono extraordinario cuota 2/2 |  |  | 25.000,00 |
| A | Jubilación SIPA | 1.465.738,24 | 11,00 % | -161.231,21 |
| A | Ley 19.032 (PAMI) | 1.465.738,24 | 3,00 % | -43.972,15 |
| A | Obra social (rem.) | 1.465.738,24 | 3,00 % | -43.972,15 |
| A | Obra social (no rem.) | 145.000,00 | 3,00 % | -4.350,00 |
| A | Cuota sindical afiliado | 1.610.738,24 | 2,00 % | -32.214,76 |
| A | Aporte solidario FAECYS | 1.610.738,24 | 0,50 % | -8.053,69 |
| C | Contrib. SIPA/INSSJP/FNE/AAFF dto. 814/01 | 1.465.738,24 | 18,00 % | 263.832,88 |
| C | Contrib. obra social (rem.) | 1.465.738,24 | 6,00 % | 87.944,29 |
| C | Contrib. obra social (no rem.) | 145.000,00 | 6,00 % | 8.700,00 |
| C | ART variable (EJEMPLO) | 1.465.738,24 | 2,00 % | 29.314,76 |
| C | ART fija (EJEMPLO) |  | fijo | 1.200,00 |
| C | Seguro de vida obligatorio (EJEMPLO) |  | fijo | 300,00 |

| total | importe |
|---|---:|
| Remunerativo | 1.465.738,24 |
| No remunerativo | 145.000,00 |
| Base aportes SIPA/OS (con tope) | 1.465.738,24 |
| Aportes | 293.793,96 |
| **Neto** | **1.316.944,28** |
| Contribuciones (incl. ejemplos ART/SVO) | 391.291,93 |
| Contribuciones sin ART/SVO | 360.477,17 |

## Caso 4 — 2 ausencias injustificadas

| tipo | concepto | base | % / fórmula | importe |
|---|---|---:|---|---:|
| R | Sueldo básico Administrativo A | 1.246.664,00 |  | 1.246.664,00 |
| R | Antigüedad 2 años | 1.246.664,00 | 2,00 % | 24.933,28 |
| R | Ausencias injustificadas (2 días, /30) | 1.271.597,28 | 2/30 | -84.773,15 |
| R | Presentismo (perdido) | 1.271.597,28 | 0 % | 0,00 |
| N | Suma fija no rem. acuerdo |  |  | 120.000,00 |
| N | Bono extraordinario cuota 2/2 |  |  | 25.000,00 |
| A | Jubilación SIPA | 1.186.824,13 | 11,00 % | -130.550,65 |
| A | Ley 19.032 (PAMI) | 1.186.824,13 | 3,00 % | -35.604,72 |
| A | Obra social (rem.) | 1.186.824,13 | 3,00 % | -35.604,72 |
| A | Obra social (no rem.) | 145.000,00 | 3,00 % | -4.350,00 |
| A | Cuota sindical afiliado | 1.331.824,13 | 2,00 % | -26.636,48 |
| A | Aporte solidario FAECYS | 1.331.824,13 | 0,50 % | -6.659,12 |
| C | Contrib. SIPA/INSSJP/FNE/AAFF dto. 814/01 | 1.186.824,13 | 18,00 % | 213.628,34 |
| C | Contrib. obra social (rem.) | 1.186.824,13 | 6,00 % | 71.209,45 |
| C | Contrib. obra social (no rem.) | 145.000,00 | 6,00 % | 8.700,00 |
| C | ART variable (EJEMPLO) | 1.186.824,13 | 2,00 % | 23.736,48 |
| C | ART fija (EJEMPLO) |  | fijo | 1.200,00 |
| C | Seguro de vida obligatorio (EJEMPLO) |  | fijo | 300,00 |

| total | importe |
|---|---:|
| Remunerativo | 1.186.824,13 |
| No remunerativo | 145.000,00 |
| Base aportes SIPA/OS (con tope) | 1.186.824,13 |
| Aportes | 239.405,69 |
| **Neto** | **1.092.418,44** |
| Contribuciones (incl. ejemplos ART/SVO) | 318.774,27 |
| Contribuciones sin ART/SVO | 293.537,79 |

## Caso 5 — Supera tope (sueldo convenido sobre escala)

| tipo | concepto | base | % / fórmula | importe |
|---|---|---:|---|---:|
| R | Sueldo básico Administrativo A (sobre escala) | 5.000.000,00 |  | 5.000.000,00 |
| R | Antigüedad 10 años | 5.000.000,00 | 10,00 % | 500.000,00 |
| R | Presentismo | 5.500.000,00 | 8,33 % | 458.150,00 |
| N | Suma fija no rem. acuerdo |  |  | 120.000,00 |
| N | Bono extraordinario cuota 2/2 |  |  | 25.000,00 |
| A | Jubilación SIPA | 4.861.685,38 | 11,00 % | -534.785,39 |
| A | Ley 19.032 (PAMI) | 4.861.685,38 | 3,00 % | -145.850,56 |
| A | Obra social (rem.) | 4.861.685,38 | 3,00 % | -145.850,56 |
| A | Obra social (no rem.) | 145.000,00 | 3,00 % | -4.350,00 |
| A | Cuota sindical afiliado | 6.103.150,00 | 2,00 % | -122.063,00 |
| A | Aporte solidario FAECYS | 6.103.150,00 | 0,50 % | -30.515,75 |
| C | Contrib. SIPA/INSSJP/FNE/AAFF dto. 814/01 | 5.958.150,00 | 18,00 % | 1.072.467,00 |
| C | Contrib. obra social (rem.) | 5.958.150,00 | 6,00 % | 357.489,00 |
| C | Contrib. obra social (no rem.) | 145.000,00 | 6,00 % | 8.700,00 |
| C | ART variable (EJEMPLO) | 5.958.150,00 | 2,00 % | 119.163,00 |
| C | ART fija (EJEMPLO) |  | fijo | 1.200,00 |
| C | Seguro de vida obligatorio (EJEMPLO) |  | fijo | 300,00 |

| total | importe |
|---|---:|
| Remunerativo | 5.958.150,00 |
| No remunerativo | 145.000,00 |
| Base aportes SIPA/OS (con tope) | 4.861.685,38 |
| Aportes | 983.415,26 |
| **Neto** | **5.119.734,74** |
| Contribuciones (incl. ejemplos ART/SVO) | 1.559.319,00 |
| Contribuciones sin ART/SVO | 1.438.656,00 |

## Resumen para tests

| caso | remunerativo | no rem. | base tope | aportes | neto | contribuciones (c/ejemplos) | contribuciones (s/ART ni SVO) |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1 Normal (Adm. A, 0 años, afiliado) | 1.350.511,11 | 145.000,00 | 1.350.511,11 | 271.324,66 | 1.224.186,45 | 361.332,89 | 332.822,67 |
| 2 Antigüedad 7 (Vend. B, no afiliado) | 1.480.802,60 | 145.000,00 | 1.480.802,60 | 264.215,46 | 1.361.587,14 | 395.208,68 | 364.092,63 |
| 3 HE 6×50 % + 2×100 % (Maest. A, 3 años) | 1.465.738,24 | 145.000,00 | 1.465.738,24 | 293.793,96 | 1.316.944,28 | 391.291,93 | 360.477,17 |
| 4 2 ausencias injust. (Adm. A, 2 años) | 1.186.824,13 | 145.000,00 | 1.186.824,13 | 239.405,69 | 1.092.418,44 | 318.774,27 | 293.537,79 |
| 5 Supera tope (sobre escala $5M, 10 años) | 5.958.150,00 | 145.000,00 | 4.861.685,38 | 983.415,26 | 5.119.734,74 | 1.559.319,00 | 1.438.656,00 |

Neto = remunerativo + no remunerativo − aportes. El caso 5 quedaría además alcanzado por retención de Ganancias 4.ª categoría (fuera de fase 1; no se calcula).

## Reglas fijadas

1. Escala: básico mensual por categoría según tabla del período (vigencia por fecha; nov-2026 provisional).
2. Antigüedad = básico × 1 % × años cumplidos a la fecha de liquidación (años enteros).
3. Presentismo = 8,33 % × (básico + antigüedad − descuento por ausencias); se pierde entero con ≥ 1 ausencia injustificada en el mes (texto exacto art. 40 CCT/acuerdo 2000: a verificar; el caso 4 con 2 ausencias lo pierde con cualquier lectura).
4. Ausencia injustificada: descuento por día = (básico + antigüedad) / 30, línea negativa remunerativa.
5. Horas extra (art. 201 LCT): valor hora = (básico + antigüedad + presentismo) / 200; importe = valor hora × horas × 1,5 (50 %) o × 2 (100 %); el valor hora no se redondea por separado.
6. El presentismo no se calcula sobre horas extra ni sobre sumas no remunerativas.
7. Suma fija de acuerdo y bono: no remunerativos, montos llenos para jornada completa, sin antigüedad ni presentismo encima y sin prorrateo por ausencias (a verificar contra el texto del acuerdo; ver decisiones).
8. Aportes con tope (base = min(Σ rem., tope)): jubilación 11 %, ley 19.032 3 %, obra social 3 %.
9. Obra social sobre no remunerativos: aporte 3 % y contribución 6 % sobre Σ no rem., sin tope, línea separada.
10. Cuota sindical 2 % (sólo afiliados) y aporte solidario FAECYS 0,5 % (todos los comprendidos) sobre rem. + no rem., sin tope.
11. Contribuciones dto. 814/01 (18 % por defecto) y OS 6 % sobre Σ rem. sin tope; ART variable sobre Σ rem. + fija por trabajador.
12. Redondeo: cada línea a centavos, half-up (ROUND_HALF_UP), sobre base exacta; totales = suma de líneas ya redondeadas.
13. Mes comercial de 30 días para descuentos; divisor 200 para horas.
14. Orden de cálculo: básico → antigüedad → ausencias → presentismo → horas extra → no rem. → bases → aportes → contribuciones → neto.

## Decisiones del dueño / contador

1. **Escala definitiva** y homologación del acuerdo oct–dic 2026 (y si la suma de $ 120.000 sigue no remunerativa o se incorporó al básico).
2. Si las sumas no remunerativas llevan **antigüedad y presentismo** y si se **prorratean** por ausencias o jornada parcial (varios acuerdos FAECYS lo establecen: leer el texto).
3. Si las sumas no remunerativas aportan a **OS (aporte y contribución)**, cuota sindical y FAECYS 0,5 %, y si el aporte OS sobre no rem. comparte el tope.
4. **Alícuota dto. 814/01**: 18 % o 20,4 % según condición del empleador (PyME o no) y si se aplica **detracción**.
5. **ART**: aseguradora, alícuota variable y cuota fija reales.
6. **Seguro de vida obligatorio** (prima real) y **Seguro La Estrella / INACAP** (montos, si son aporte o contribución, numeración de artículos del CCT).
7. **Afiliación sindical** de cada empleado (2 % sí/no) y sindicato local que la percibe.
8. Política de presentismo: qué cuenta como ausencia injustificada y si hay pérdida parcial (llegadas tarde).
9. Si el valor hora para horas extra incluye presentismo (regla 5) o sólo básico + antigüedad.
10. Encuadre del caso 5 (sobre escala): si sigue dentro del CCT (FAECYS/sindical) o es fuera de convenio.
