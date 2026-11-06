# Nómina — comportamiento de un liquidador de referencia (sólo fuentes públicas)

> Fecha: 2026-11-06. Ingeniería inversa de **comportamiento**, no de código: todo sale de normativa y diseños de registro públicos.
> **Aviso de acceso:** desde esta sesión no resolvieron `www.afip.gob.ar` (ARCA), `calcularsueldo.com.ar`, `www.iprofesional.com`, `www.econoblog.com.ar` (bloqueo de red del entorno). Lo que no se pudo leer en la fuente se escribe de conocimiento propio y va marcado **«a verificar»**. Para cerrar las marcas hay que habilitar esos hosts y releer los PDF de diseño de registro.

## 1. Flujo de un liquidador

| # | Etapa | Qué hace | Salida |
|---|---|---|---|
| 1 | **Legajo** | CUIL, fecha de ingreso (antigüedad), CCT + categoría, jornada (completa/parcial), modalidad de contratación, situación de revista, obra social (código RNOS), afiliado sindical sí/no, condición (SIPA), actividad, zona, ART, cónyuge/hijos (Ganancias / asignaciones). | Ficha versionada por fecha de vigencia |
| 2 | **Novedades** | Hechos del período: ausencias (justificadas/injustificadas), licencias, horas extra 50 %/100 %, vacaciones, adelantos, embargos, sumas de acuerdo. | Novedades por legajo y período |
| 3 | **Período** | Apertura de período (AAAAMM) y tipo de liquidación: mensual, quincenal, SAC, vacaciones, final. Fija escala vigente, tope, alícuotas. | Período abierto con parámetros congelados |
| 4 | **Conceptos** | Fórmulas ordenadas por dependencia: haberes → bases → aportes → contribuciones. Cada concepto propio se **asocia** a un concepto ARCA (código de 6 dígitos) que define si suma a cada base. | Líneas (concepto, base, %, importe) |
| 5 | **Recibo** | Recibo art. 140 LCT (doble ejemplar, firma). | PDF + registro |
| 6 | **LSD** | Archivo de liquidación del Libro de Sueldos Digital (ARCA), con conceptos propios asociados a conceptos ARCA. | TXT por período/liquidación |
| 7 | **F.931** | Declaración jurada SICOSS: bases y aportes/contribuciones por CUIL; en el esquema actual se genera desde el LSD. | DJ F.931 + VEP |

## 2. Tipos de concepto

| Tipo | Ejemplos | Aportes trabajador | Contribuciones | SAC | Recibo |
|---|---|---|---|---|---|
| **Remunerativo** (art. 103 LCT) | básico, antigüedad, presentismo, horas extra, vacaciones, SAC | sí (SIPA/PAMI/OS con tope; sindicales sin tope) | sí (sin tope) | integra la base | haberes c/aportes |
| **No remunerativo** (art. 103 bis LCT, o acuerdo homologado art. 223 bis/223 / acuerdos CCT) | suma fija de acuerdo, bono extraordinario, asignaciones familiares | sólo lo que el acuerdo diga (habitual en Comercio: OS y sindicales) | ídem (OS) | no (salvo que el acuerdo diga lo contrario) | haberes s/aportes |
| **Descuento** | jubilación 11 %, ley 19.032 3 %, OS 3 %, cuota sindical, embargo, anticipo, Ganancias | — | — | — | deducciones |
| **Contribución** (empleador, no va al neto) | dto. 814/01 (18 % / 20,4 %), OS 6 %, ART, seguro de vida obligatorio, INACAP/otros CCT | — | — | — | no se imprime (sí en LSD/F.931) |

## 3. Bases

- **Base aportes SIPA/PAMI/OS** = Σ remunerativos, **acotada** entre base mínima y **máxima** (ANSES, actualiza mensualmente por movilidad). Nov-2026: máx. **$ 4.861.685,38**, mín. $ 149.592,45 (Res. ANSES 304/2026 — reportado por blogdelcontador/contadoresenred, **a verificar en B.O.**).
- **Base contribuciones** = Σ remunerativos **sin tope** (menos detracción ley 27.430/27.541, si corresponde — parámetro).
- **Base OS sobre no remunerativos** = Σ no remunerativos que el acuerdo grava (sin tope en fase 1, **a verificar**).
- **Base sindical** (cuota afiliado / aporte solidario FAECYS) = rem. + no rem., sin tope.
- **Base SAC** (ley 23.041, art. 121 LCT) = mejor remuneración mensual normal y habitual del semestre (remunerativos), × días trabajados/180 si es proporcional.
- **Base ART** = remuneración imponible (rem.) + cuota fija por trabajador.

## 4. Campos mínimos que el motor debe producir

### 4.1 LSD — archivo de liquidación (a verificar contra el diseño de registro vigente de ARCA)
| Registro | Contenido mínimo |
|---|---|
| **01 – Datos de la liquidación** | CUIT empleador, identificación de envío (SJ/RE), período AAAAMM, tipo de liquidación (M mensual, Q quincenal, S semanal), número de liquidación, días base (30), cantidad de trabajadores. |
| **02 – Datos referenciales del trabajador** | CUIL, legajo, dependencia/área, CBU, días para tope proporcional, fecha de pago, fecha de rubricación, forma de pago. |
| **03 – Detalle de conceptos** | CUIL, **código de concepto propio** (asociado a concepto ARCA), cantidad, unidad (días/horas/%), importe, indicador débito/crédito (D/C), período de ajuste. |
| **04 – Datos para la DJ (SICOSS)** | CUIL, cónyuge, cantidad de hijos, CCT sí/no, SCVO, reducción, tipo de empresa, código de situación de revista (1 a 3, con día de inicio), condición, actividad, modalidad de contratación, siniestrado, localidad/zona, obra social (RNOS), adherentes, remuneraciones 1 a 11, aporte adicional OS, días trabajados, horas, SAC, horas extra (cantidad e importe), zona desfavorable, vacaciones, conceptos no remunerativos, maternidad, rectificación de remuneración, contribución tarea diferencial, incremento salarial, remuneración imponible 4/5/…, importe detracción. |
| Tabla de **asociación de conceptos** | Una vez por empleador: concepto propio ↔ código ARCA (6 dígitos) + marcas de a qué bases suma (SIPA, INSSJP, contrib. SIPA, OS, FSR, ART, LRT, seguro, sindical). |

### 4.2 F.931/SICOSS — por CUIL (a verificar contra diseño SICOSS vigente)
CUIL, apellido y nombre, cónyuge, hijos, situación de revista + días, condición, actividad, zona, modalidad, código OS, adherentes, **Remuneración total**, **Rem. 1** (base aportes SIPA, con tope), **Rem. 2** (base contribuciones SIPA), **Rem. 3** (contrib. FNE/AAFF), **Rem. 4** (base aportes OS/FSR, con tope), **Rem. 5** (INSSJP), Rem. 8 (contrib. OS), Rem. 9 (LRT/ART), Rem. 10 (detracción), importe SAC, horas extra, conceptos no remunerativos, vacaciones, días trabajados, aporte voluntario/adicional OS, seguro colectivo de vida obligatorio (sí/no), CCT (sí/no), y por empleador: alícuota/tipo de empleador (dto. 814/01), ART (CUIT, alícuota, cuota fija).

## 5. Fuentes

| Dato | URL | Estado |
|---|---|---|
| LCT 20.744 (arts. 103, 103 bis, 121, 140, 150, 201, 208, 223 bis) | https://servicios.infoleg.gob.ar/infolegInternet/anexos/25000-29999/25552/texact.htm | conocimiento propio, a verificar texto vigente post reformas 2024–2026 |
| Libro de Sueldos Digital – micrositio, diseño de registro, tabla de conceptos ARCA | https://www.afip.gob.ar/libro-sueldos-digital/ | **sitio no respondió** (bloqueo de red); campos a verificar |
| SICOSS / F.931 – diseño de registro | https://www.afip.gob.ar/sicoss/ | **sitio no respondió**; a verificar |
| Dto. 814/01, ley 27.430, ley 27.541 (alícuotas 18 %/20,4 %, detracción) | https://servicios.infoleg.gob.ar/infolegInternet/anexos/65000-69999/67502/texact.htm | a verificar (posibles cambios 2026) |
| Topes base imponible nov-2026 (Res. ANSES 304/2026) | https://blogdelcontador.com.ar/news-46527-sueldos-noviembre-2026-topes-aportes-sipa · https://contadoresenred.com/base-imponible-sipa-noviembre-2026-minima-y-maxima/ | vía buscador, a verificar en B.O. |
| CCT 130/75 y escalas FAECYS | https://www.faecys.org.ar/ · https://calcularsueldo.com.ar/?p=16350 · https://www.iprofesional.com/actualidad/468021-empleados-de-comercio-cuanto-cobraran-en-noviembre-con-el-aumento-y-el-bono-de-25000-pesos | escala nov-2026 vía buscador (fuentes secundarias contradictorias) — **provisional a confirmar** |
| Ley 19.032 (INSSJP), ley 23.660/23.661 (OS), ley 24.557 (ART), dto. 1567/74 (seguro vida oblig.) | https://servicios.infoleg.gob.ar/ | conocimiento propio |
