# Ronda 3 — 6 negocios nuevos (célula creativa + analítica + operadora)

> **Fecha:** 2026-07-06 · **Dólar oficial BNA:** $1.488,50 · **Todo LOCAL, sin publicar.**
> **Bajada de línea aplicada:** salir del sesgo del modelo (nada de chatbot/wrapper/dashboard/agencia
> genérica), mercado local argentino con capacidad real de pago, la **integración a entes públicos y
> privados es el MOAT**, resolver un problema real de la sociedad, construible con Claude Code en semanas.
> **Factibilidad honesta:** son negocios nuevos, sin construir → índice típico 30–55.

**No repetimos** ninguno de los 21 ya cubiertos (Kudos, Fantasma, Testigo, Plantillería, El Data
Semanal, Mapa del Barrio, Postora, Recepcionista IA, Directorio B2B, VetVoz, Vitrina, Back-office AFIP,
Comparador afiliados, Calificación leads WhatsApp, MediaKit, PrevenIA, GremioPro, y los 4 descartados).

**Descarte previo por competencia local (regla de la ronda 2):** la idea "informe de deuda de auto usado
antes de comprar" se cayó en la mesa — ya está ocupada por Patente.ar, Datacar y Opencars. Se reemplazó
por el "Semáforo de Flota" (compliance de vencimientos de transporte), mucho menos saturado.

---

## 1. Contra-Retención — recuperar la plata que el Estado te retiene de más

**Qué es (de cero):** un servicio que detecta y recupera el dinero que le retienen de más a una pyme o
monotributista por los regímenes de Ingresos Brutos sobre movimientos bancarios y billeteras (SIRCREB,
SIRTAC y el nuevo SIRCUPA de billeteras virtuales). Esas retenciones son "pago a cuenta": cuando superan
lo que realmente se debe, se acumulan como **saldo a favor** que casi nadie reclama. Es plata inmovilizada
del contribuyente. La Justicia ya falló contra el sistema por saldos a favor millonarios imposibles de
absorber.

**Integración (el MOAT):**
- **Pública:** ARCA (constancias/Mis Retenciones), rentas provinciales (ARBA, AGIP, API Santa Fe, Rentas
  Córdoba), régimen COMARB/SIRCREB. Cada jurisdicción tiene su propio circuito de devolución y de
  reducción de alícuota → armar el mapa unificado es lo difícil de copiar.
- **Privada:** bancos y billeteras (extractos y constancias de retención).

**Problema social que resuelve:** las pymes trabajan con caja ajustada y el fisco les inmoviliza dinero
propio; recuperarlo es liquidez real sin pedir un crédito. El monotributista que tributa IIBB unificado y
igual sufre retención de SIRCUPA está pagando dos veces.

**Cómo opera (ejemplo):** una distribuidora de bebidas conecta sus constancias. El sistema arma el saldo a
favor por jurisdicción ($680.000 acumulados), detecta que ARBA le aplica una alícuota más alta de la que
corresponde, genera la solicitud de devolución y el trámite de recategorización de alícuota. Recupera
$680.000 y deja de sobre-retener a futuro.

**Cómo se cobra:** **success fee 25%** de lo recuperado (fee promedio ~$120.000 / US$81) + **monitoreo
$18.000/mes** (US$12) para mantener la alícuota baja y frenar futura sobre-retención.

**SAM/SOM:** ~**1,8 millones** de MiPyMEs con certificado vigente en Argentina (fuente: Argentina.gob.ar /
RedCAME); el universo de retenidos por SIRCREB + billeteras es enorme y creciente (SIRCUPA arrancó
oct-2025 en PBA). **SOM año 1 conservador:** 300 clientes recuperados + cartera de monitoreo.

**Unit economics (ARS):** precio año 1 por cliente ≈ $336.000 (fee + 12 meses de monitoreo) · COGS
~$5.000/cliente/mes · margen **72%** (el reclamo tiene tramo semi-manual ante rentas) · build **3–4
semanas** · primer peso **4–6 semanas**.

**Riesgos:** varias rentas provinciales no tienen API uniforme → parte del reclamo es trámite manual;
requiere que el cliente ceda clave fiscal (barrera de confianza); la devolución efectiva puede tardar
meses (mitigado con el fee sobre lo aprobado, no lo cobrado).

**Desafío del operador:** la devolución en efectivo es lenta y burocrática por jurisdicción; el negocio se
sostiene si el 80% del valor se entrega vía **reducción de alícuota** (frena la sangría de inmediato) y el
success fee se ancla a lo aprobado, no a lo efectivamente cobrado.

---

## 2. Licita — el radar de compras públicas para la pyme que no se entera

**Qué es (de cero):** un radar que cruza el rubro y la zona de una pyme con **todas** las licitaciones y
contrataciones del Estado (nacional vía COMPR.AR, provinciales y municipales) y le avisa "el Estado está
por comprar lo que vos vendés", con fecha de apertura, pliego y un checklist para presentarse.

**Integración (el MOAT):**
- **Pública:** COMPR.AR (portal nacional), portales provinciales (Compras Córdoba, PBA, etc.), decenas de
  portales municipales dispersos, Boletín Oficial. La cobertura consolidada de lo **municipal** es lo que
  nadie hace bien.
- **Privada:** el canal del proveedor (WhatsApp/email) para la alerta.

**Problema social que resuelve:** el Estado es el mayor comprador del país pero las pymes chicas no se
enteran ni saben armar la oferta → la obra pública la ganan siempre los mismos jugadores grandes. Democratiza
el acceso a la contratación estatal.

**Cómo opera (ejemplo):** una metalúrgica de 12 empleados carga su rubro y CUIT. El radar le avisa que un
municipio bonaerense abre licitación de mobiliario urbano en 9 días, le arma el checklist de documentación
y la guía por ProveedorDelEstado. Se presenta por primera vez sin contratar un gestor caro.

**Cómo se cobra:** **suscripción $35.000/mes** (US$24) por rubro + **$30.000** (US$20) por oferta asistida.

**SAM/SOM:** ~**1,8 millones** de MiPyMEs (fuente: Argentina.gob.ar); miles de procesos de compra abiertos
por mes entre los tres niveles del Estado. **Competencia local:** LicitacionesArg ya existe → diferencial =
precio pyme + matching automático por rubro + cobertura municipal + asistencia de armado. **SOM año 1:** 120
suscriptores.

**Unit economics (ARS):** precio $35.000/mes · COGS ~$4.000/cliente · margen **85%** · build **3–4 semanas**
· primer peso **4–6 semanas**.

**Riesgos:** hay competidor establecido; presentarse a licitaciones tiene fricción real → churn si el
cliente no gana en 2–3 intentos; los portales son heterogéneos y cambian (scraping a mantener).

**Desafío del operador:** el valor no es "avisar" (eso se copia), es **subir el win-rate** de la pyme con la
asistencia de armado; sin eso, el cliente que no gana se va a los 90 días.

---

## 3. Paritaria al Día — la escala del convenio, liquidada sola, sin juicio laboral

**Qué es (de cero):** cada vez que se homologa una nueva escala de un convenio colectivo, recalcula
automáticamente los sueldos de esa empresa, avisa el **retroactivo por empleado** y evita el error de
liquidación que después termina en un juicio laboral.

**Integración (el MOAT):**
- **Pública:** Ministerio de Trabajo (buscador oficial de CCT, homologaciones y escalas desde 2005),
  Boletín Oficial.
- **Privada:** planillas de sindicatos/cámaras (FAECYS, UOCRA, gráficos, sanidad, etc.) y el sistema de
  sueldos del cliente. Mantener actualizada la biblioteca de cientos de convenios es el moat.

**Problema social que resuelve:** con inflación y paritarias que se actualizan cada 2–4 meses, la pyme
liquida mal por no seguir cada escala → acumula deuda laboral que estalla en un juicio, y el trabajador
cobra de menos. Ordena una relación laboral que hoy es un campo minado.

**Cómo opera (ejemplo):** un local de comercio (CCT 130/75) elige su convenio. Al homologarse la escala de
diciembre, el sistema recalcula básico + antigüedad + presentismo por categoría, informa "$47.000 de
retroactivo para 3 empleados" y emite la planilla lista para el recibo.

**Cómo se cobra:** **suscripción $28.000/mes** (US$19) por convenio/empresa + adicional por empleado sobre
cierto número.

**SAM/SOM:** cientos de convenios activos; CAME agrupa >**600.000 pymes** (fuente: RedCAME/CAME). **SOM año
1:** 125 empresas y estudios contables.

**Unit economics (ARS):** precio $28.000/mes · COGS ~$2.500 · margen **88%** · build **3–4 semanas** ·
primer peso **4–6 semanas**.

**Riesgos:** los estudios contables ya usan software de liquidación (Tango, Bejerman) → hay que ser
**complemento** (la capa de vigilancia de escalas), no reemplazo; responsabilidad legal si el cálculo falla
(mitigar: se entrega como asistencia, la firma valida).

**Desafío del operador:** vender a un estudio que "ya liquida" exige demostrar que la parte que se les
escapa es **cuándo cambió la escala y el retroactivo**, no el cálculo del recibo; el pitch es "seguro contra
juicio", no "otro liquidador".

---

## 4. Semáforo de Flota — que ningún camión salga con los papeles vencidos

**Qué es (de cero):** un tablero que vigila **todos** los papeles obligatorios de cada vehículo y chofer de
una flota (VTV/RTO, LiNTI, seguro, RUTA, habilitación CNRT, licencia profesional) y avisa antes de que
venzan, para no circular en infracción ni quedar parado en un control de ruta.

**Integración (el MOAT):**
- **Pública:** CNRT (datos abiertos + consulta de vehículos habilitados y equipos de carga), VTV/RTO
  provincial, LiNTI (licencia nacional de transporte interjurisdiccional).
- **Privada:** aseguradoras (póliza vigente). Consolidar el estado real de cada vehículo cruzando fuentes
  provinciales dispersas es lo difícil.

**Problema social que resuelve:** camiones y combis circulando con papeles vencidos = riesgo vial + multas
+ servicio parado; el chofer se juega la fuente de trabajo y terceros se juegan la vida. Baja la
siniestralidad y ordena al transporte pyme.

**Cómo opera (ejemplo):** una transportista de 15 camiones carga patentes y choferes. El sistema consulta
las habilitaciones, arma el calendario de vencimientos y avisa por WhatsApp "la VTV del chasis AB123CD vence
en 10 días" con el turno para renovar. Ningún camión sale sin papeles.

**Cómo se cobra:** **$4.500/vehículo/mes** (US$3); una flota de 10 = $45.000/mes (US$30); mínimo
$30.000/mes.

**SAM/SOM:** decenas de miles de vehículos de carga y pasajeros habilitados por CNRT (fuente: CNRT / Datos
Abiertos de Transporte); miles de pymes de transporte. **SOM año 1:** 90 flotas (~900 vehículos).

**Unit economics (ARS):** precio $4.500/vehículo · COGS ~$500/vehículo · margen **82%** · build **3–4
semanas** · primer peso **5–7 semanas**.

**Riesgos:** la VTV provincial no tiene API uniforme (scraping frágil por provincia); el software de gestión
de flota ya ofrece módulos de vencimientos → hay que ganar por foco y precio; hay que vencer al dueño que
"ya lo lleva en un Excel".

**Desafío del operador:** el diferencial no es el calendario (eso lo hace Excel), es la **verificación
automática contra la fuente oficial** (que el papel esté realmente vigente en CNRT/VTV, no solo anotado); sin
esa consulta a la fuente, es un recordatorio más.

---

## 5. Receta Clara — que a la farmacia de barrio no le descuenten mal

**Qué es (de cero):** revisa la liquidación quincenal que le pagan a la farmacia por las recetas de PAMI y
obras sociales, detecta los **débitos y rechazos indebidos** receta por receta y arma el reclamo, para que la
farmacia recupere lo que le descontaron mal.

**Integración (el MOAT):**
- **Pública/cuasi:** PAMI/INSSJP (liquidaciones y débitos por auditoría de recetas), COLFARMA/COFA online
  (validación), obras sociales.
- **Privada:** el sistema de la farmacia (ventas y troqueles). Cruzar troquel a troquel la liquidación contra
  lo dispensado y contra las reglas de cada plan es el trabajo que nadie tiene tiempo de hacer.

**Problema social que resuelve:** la farmacia de barrio trabaja con margen finito y cada débito mal puesto es
plata perdida que casi nunca reclama por falta de tiempo; su rentabilidad sostiene el acceso al medicamento
en el barrio.

**Cómo opera (ejemplo):** la farmacia sube la liquidación de PAMI y su detalle de dispensas. El sistema cruza
troquel por troquel, marca 14 débitos revisables (recetas rechazadas por "observación" corregible),
calcula $92.000 recuperables y genera el reclamo con la documentación para presentar.

**Cómo se cobra:** **suscripción $30.000/mes** (US$20) + **success fee 15%** sobre débitos recuperados.

**SAM/SOM:** ~**4.500 farmacias** solo en la provincia de Buenos Aires (fuente: Colegio de Farmacéuticos /
prensa); universo país mucho mayor. **SOM año 1:** 120 farmacias.

**Unit economics (ARS):** precio $30.000/mes + fee · COGS ~$3.000 · margen **78%** · build **4 semanas** ·
primer peso **5–7 semanas**.

**Riesgos:** el acceso a los archivos de liquidación depende de formato y permiso de la farmacia; COLFARMA ya
valida en el mostrador → parte del problema se mitiga antes; el ciclo de reclamo ante PAMI es lento.

**Desafío del operador:** el valor está en los débitos **post-liquidación** (los que aparecen después de la
auditoría, no los que frena la validación de mostrador); hay que demostrar rápido un recupero concreto o la
farmacia no renueva.

---

## 6. Quién Firma — verificación exprés de identidad y crédito para el mercado informal

**Qué es (de cero):** verificación instantánea y barata de una persona antes de alquilarle, contratarla o
cerrar un trato: confirma la identidad (RENAPER) y trae la situación crediticia (BCRA Central de Deudores,
cheques rechazados, concursos) en un reporte simple con semáforo verde/amarillo/rojo.

**Integración (el MOAT):**
- **Pública:** RENAPER (validación de identidad), **BCRA Central de Deudores (API pública y gratuita** en
  deudores.bcra.apidocs.ar), Boletín Oficial (concursos/quiebras).
- **Privada (opcional):** Nosis/Veraz para historial ampliado. Empaquetar lo público gratuito + la
  validación de identidad en un flujo de 30 segundos para no-técnicos es el diferencial.

**Problema social que resuelve:** con la Ley de Alquileres derogada explotó el alquiler directo sin
inmobiliaria (la oferta subió **+189,77%** desde dic-2023); dueños particulares, changas y servicio
doméstico se manejan a ciegas → más estafas y morosidad. Da información que hoy solo tienen las
inmobiliarias grandes.

**Cómo opera (ejemplo):** un dueño que alquila directo ingresa el DNI del candidato (con su consentimiento).
En 30 segundos recibe: identidad validada en RENAPER, sin deudas en situación 3–5 del BCRA, un cheque
rechazado hace 2 años. Semáforo amarillo, con PDF para archivar.

**Cómo se cobra:** **pago por verificación $6.000** (US$4) o pack; **suscripción $25.000/mes** (US$17) para
inmobiliarias chicas y empleadores frecuentes.

**SAM/SOM:** millones de contratos de alquiler vigentes + contrataciones informales por año (fuente:
Infobae/Ámbito sobre el mercado post-DNU). **SOM año 1:** 3.000 verificaciones/mes.

**Unit economics (ARS):** precio $6.000/verif. · COGS ~$800/verif. (BCRA gratis; costo = RENAPER por consulta
+ tokens) · margen **80%** · build **2–3 semanas** (el más rápido) · primer peso **3–5 semanas**.

**Riesgos:** el acceso a RENAPER requiere convenio/habilitación (cuello de botella y costo por consulta) —
si no se consigue, se degrada a solo-BCRA; privacidad y consentimiento (Ley 25.326 de datos personales);
Nosis/Veraz ya juegan fuerte en B2B.

**Desafío del operador:** conseguir el acceso a RENAPER es el make-or-break; mientras tanto, se puede lanzar
con la capa **BCRA + Boletín Oficial gratis** (que ya resuelve el 70% del miedo: "¿me va a pagar?") y sumar
identidad cuando se habilite el convenio.

---

## Cuadro resumen (ARS al dólar oficial $1.488,50)

| # | Negocio | Precio | Margen | Build | Idx | prod |
|---|---|---|---|---|---|---|
| 1 | Contra-Retención | fee 25% (~$120k) + $18k/mes | 72% | 3–4 sem | 44 | warn |
| 2 | Licita | $35k/mes + $30k/oferta | 85% | 3–4 sem | 46 | warn |
| 3 | Paritaria al Día | $28k/mes por convenio | 88% | 3–4 sem | 43 | warn |
| 4 | Semáforo de Flota | $4,5k/vehículo/mes | 82% | 3–4 sem | 40 | warn |
| 5 | Receta Clara | $30k/mes + fee 15% | 78% | 4 sem | 41 | warn |
| 6 | Quién Firma | $6k/verif. o $25k/mes | 80% | 2–3 sem | 47 | warn |

---

## Fuentes (URLs)

**1 · Contra-Retención (SIRCREB/SIRTAC/SIRCUPA):**
- https://www.infobae.com/economia/2025/09/09/como-se-aplicaran-las-retenciones-de-ingresos-brutos-en-las-billeteras-virtuales-en-la-provincia-de-buenos-aires/
- https://www.lanacion.com.ar/economia/ingresos-brutos-la-justicia-fallo-a-favor-de-una-empresa-que-tenia-un-saldo-a-favor-millonario-y-nid21042026/
- https://contablix.ar/blog/sircupa-retencion-ingresos-brutos-billetera
- https://tributosimple.com/retenciones-ingresos-brutos-sircreb-sirtac-sircupa/
- https://www.ca.gob.ar/sistemas/sircreb

**2 · Licita (compras públicas):**
- https://comprar.gob.ar/proveedor.aspx
- https://www.argentina.gob.ar/comprar/soy-proveedor/compras-electronicas/preguntas-frecuentes/registro-de-proveedores
- https://licitacionesarg.com/
- https://www.redcame.org.ar/novedades/13637/nuevos-montos-maximos-de-facturacion-para-las-mipymes

**3 · Paritaria al Día (convenios/escalas):**
- https://www.argentina.gob.ar/servicio/consultar-convenios-colectivos-de-trabajo-acuerdos-y-laudos
- https://documento.errepar.com/actualidad/paritarias-noviembre-2025-actividades-con-acuerdos-vigentes-y-nuevos-incrementos-20251104123856262
- https://www.faecys.org.ar/circular-escalas-salariales-diciembre-2025-abril-2026-cct-130-75-sec-de-as-laborales/

**4 · Semáforo de Flota (CNRT/transporte):**
- https://www.argentina.gob.ar/transporte/cnrt
- https://servicios.cnrt.gob.ar/equipos-carga
- https://consultapme.cnrt.gob.ar/vehiculos_habilitados
- https://datos.transporte.gob.ar/dataset
- https://cargascontrol.com.ar/blog/regulaciones-transporte-argentina-2026-cnrt

**5 · Receta Clara (farmacias/PAMI):**
- https://servicios.cofa.org.ar/ncr/Instructivo%20Operativo%20PAMI.pdf
- https://colfarma.org.ar/informacion-obras-sociales-no-50-2025/
- https://www.cfsf2.org.ar/dos/obras-sociales/
- https://www.infobae.com/economia/2023/11/07/farmacias-bonaerenses-limitan-la-venta-de-medicamentos-con-descuentos-a-afiliados-de-prepagas-y-obras-sociales/

**6 · Quién Firma (RENAPER/BCRA/alquileres):**
- https://www.bcra.gob.ar/en/central-accounts-receivable/
- https://deudores.bcra.apidocs.ar/
- https://www.infobae.com/economia/2025/01/01/sin-ley-de-alquileres-que-pasara-con-los-precios-en-2025-y-como-se-actualizaran-los-contratos/
- https://www.iprofesional.com/legales/437492-banco-central-y-veraz-como-consultar-si-tenes-deudas-y-situacion-crediticia-paso-a-paso
