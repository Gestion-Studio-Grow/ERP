# BLUEPRINT DE PRODUCTO — App de Facturación Automática GSG
**Informe PMO → Dueño · 2026-07-11 · Consolidación final de matriz de features, planes y marco regulatorio**

---

## 1) LA APP EN UNA LÍNEA

**"Tus cobros se facturan solos, y la app te avisa por WhatsApp antes de que ARCA te agarre."**

Facturación electrónica AFIP/ARCA automática para el comerciante argentino: subís el Excel del banco y conectás Mercado Pago, la app clasifica qué es facturable, emite con CAE sin que toques nada, y te cuida el monotributo con la foto REAL que ve ARCA (banco + MP + emitido). Escalera de 4 planes: del monotributista que trabaja solo ($14.900) hasta el cliente de Convenio Multilateral ($149.900), con nómina incluida desde el primer empleado — cosa que ningún facturador del mercado toca.

Todo centralizado en UNA app, dentro del ERP GSG como tenant/vertical propio, reusando el plugin ARCA real ya construido.

---

## 2) INVENTARIO REGULATORIO

Lista completa de conceptos levantados, con implicancia en la app y plan de entrada. **Regla transversal: NINGÚN monto va hardcodeado** — todo al motor de tablas con vigencias (ver sección 4).

### A. Monotributo (corazón del plan SOLO)

| Concepto | Implicancia en la app | Plan |
|---|---|---|
| Categorías A–K y topes (feb-2026: A ~$10,28M → K ~$108,35M; sube ~14,3% en jul/ago) | Calcular facturado 12 meses móviles con emitido + ingestado; alertas 80/90/100% del tope propio y del tope K | SOLO |
| Actualización semestral IPC | Motor de tablas parametrizadas con vigencia desde/hasta + job semestral verificado contra arca.gob.ar (nunca prensa: circula tabla ago-2025 rotulada "2026") | SOLO (infra) |
| Parámetros no monetarios (m², kWh, alquileres) | Pedirlos opcionales en onboarding; sugerencia de recategorización marcada "según facturación" si faltan | SOLO |
| Servicios vs bienes (cuotas distintas C+; feb-2026: A $37.085, K $1.208.890 serv / $525.732 bienes) | Capturar actividad en onboarding; muestra cuota correcta y habilita el chequeo de precio unitario | SOLO |
| Recategorización semestral (ventana vigente: 15/07–05/08/2026) | Countdown + categoría sugerida con datos propios; v1 NO recategoriza en ARCA, deep-link al portal | SOLO |
| Exclusión de pleno derecho (todas las causales) | EL diferencial: detectar ANTES que ARCA la incompatibilidad acreditaciones-vs-facturado; alerta roja en criollo | SOLO (causal compras/gastos 80/40 requiere egresos → add-on OCR, PYME) |
| Tope precio unitario bienes ($613.492,31 desde 02/2026) | Validación pre-CAE: bloquear/warning si un renglón lo supera. Chequeo barato que nadie hace | SOLO |
| Cuota mensual día 20 (integrado + SIPA + obra social) | "Costo fiscal del mes" en dashboard + recordatorio WhatsApp | SOLO |
| Empleados mínimos categorías I/J/K bienes (1/2/3) | Cruce nómina↔categoría, alerta "te falta un empleado declarado" — exclusivo nuestro | COMERCIO |
| Facturador ARCA gratis (tope $500k/operación) | Nada que validar (usamos WSFEv1, sin techo); TODO que comunicar en marketing/onboarding | Transversal |
| Puente monotributo→RI (transición paquete fiscal 2024) | Exclusión = evento de upgrade, no de churn: la app ya emite A/B; contenido + acompañamiento v1 | COMERCIO |
| Mono-Tech / monotributo social | Watchlist, no operativo | — |

### B. IVA y comprobantes (transversal a todos los planes)

| Concepto | Implicancia | Plan |
|---|---|---|
| Factura A/B/C con CAE (WSAA+WSFEv1) | Ya construido. Letra decidida sola emisor+receptor; el usuario NUNCA elige | SOLO |
| Monotributo→C forzado; NC/ND heredan C | Ya construido; validar que jamás se ofrezca A/B a un mono | SOLO |
| Condición IVA receptor RG 5616 (obligatoria hasta en C) | Ya soportado; autocompletar por padrón A5/A13; error acá rebota el CAE | SOLO |
| NC/ND RG 4540 (asociado, 15 días, NC ≤ original) | Ya construido; superar con "anular esta factura" un-clic + NC sugerida ante devolución MP | SOLO |
| QR fiscal RG 4892 + leyenda IVA contenido Ley 27.743 en B | Puro template, obligatorio; sin esto el PDF impreso no vale | SOLO |
| Umbral identificación comprador — legal $10M (RG 5700/2025, desde 29/05/2025) | Regla central del dueño: comercial $600k configurable por tenant + piso legal en tabla aparte; si el legal baja del comercial, manda el legal. Bajo umbral: CF genérico sin datos ni descripción; sobre: bloquear hasta CUIL+nombre+descripción | SOLO |
| Factura M RG 4132 | Consultar comprobantes autorizados al onboardear RI; emitir tipo correcto + explicación en criollo de la retención | SOLO (detección) |
| Factura E exportación (incluso mono por servicios al exterior) | MVP: detectar (cliente exterior/divisa) y derivar al contador; emitir es tier superior | Detección SOLO / emisión PYME |
| FCE MiPyME (mínimo $5.549.862 desde 04/2026, padrón, CBU) | MVP: detectar CUIT en padrón + monto → alertar "corresponde FCE"; emisión completa en PYME | Detección SOLO / emisión PYME |
| Libro IVA Digital / IVA Simple (RG 5705/5707, desde 11/2025) | Export Excel (y compatible Tango a evaluar) — el contador es el prescriptor: sin esto, veta | SOLO |

### C. IIBB / Convenio Multilateral (techo de valor)

| Concepto | Implicancia | Plan |
|---|---|---|
| Percepciones AGIP/ARBA en comprobantes | Necesarias cuando el tenant es agente de percepción; nuestro bot WhatsApp SIGUE andando ahí (tusfacturas lo apaga) | COMERCIO |
| CM: coeficientes unificados, IIBB por jurisdicción, datos fiscales del cliente CM | Cero competencia en el set; complejo y volátil → hacerlo bien y cobrarlo caro | CM |
| Percepciones/retenciones multi-jurisdicción (más allá de AGIP/ARBA) | Solo tier CM; requiere OCR de compras para la foto IIBB completa (incluido sin cargo en CM) | CM |

### D. Laboral / nómina (pedido del dueño, cero competencia)

| Concepto | Implicancia | Plan |
|---|---|---|
| Recibos de sueldo | Generación mensual; scope v1 sin liquidación por convenio (LCT/convenios = complejidad alta, fase 2) | COMERCIO |
| F.931 (aportes/contribuciones) | Cálculo cargas sociales; el trámite mensual que hoy paga aparte al estudio | COMERCIO |
| ART, SAC (aguinaldo), vacaciones | Incluidos en nómina simple v1 | COMERCIO |
| Costo laboral total como dato del dueño | En el MISMO dashboard que la facturación — la consolidación es la venta | COMERCIO |

### E. Otros transversales

- **Cola de emisión resiliente**: ARCA se cae seguido; los movimientos ingestados esperan en cola con retry, nunca fallan (queja #1 de Facturante → nuestra ventaja operativa). Plan: SOLO.
- **Perfil fiscal del emisor**: domicilio (obligatorio por regla del dueño + requisito de comprobante), razón social, PV, actividad, certificado WSAA asistido paso a paso en criollo — LA fricción de conversión del mercado. Plan: SOLO. **Gap del repo hoy.**

---

## 3) MATRIZ DE FEATURES

### CORE-MVP (sin esto no hay lanzamiento)

| Feature | Quién ya la tiene | Estado GSG |
|---|---|---|
| Emisión A/B/C con CAE + letra automática | Todos (commodity) | **CONSTRUIDO** |
| NC/ND + anulación un-clic + NC sugerida por devolución MP | Todos (como formulario); el cruce MP nadie | Construido base; cruce a rematar |
| PDF fiscal (QR 4892 + leyenda 27.743) | Todos | A construir (template) |
| Factura M / consulta autorización emisor | tusfacturas | A construir (barato) |
| Cola resiliente con retry ante caídas ARCA | tusfacturas | A construir |
| **Importador Excel bancario + clasificador facturable** | **NADIE** | Clasificador ADR-025 construido; importador A CONSTRUIR |
| Ingesta MP + facturación automática del cobro | Facturante (solo su pasarela) | Ingesta+conciliación construidas; emisión automática a rematar |
| Bot WhatsApp (emite + devuelve PDF + AVISA) | tusfacturas (solo emite) | Capas wa-intent/provider/dispatch construidas; falta handler HTTP |
| **Umbral identificación configurable ($600k comercial / $10M legal)** | **NADIE** | A construir |
| Motor de tablas regulatorias con vigencias + job semestral | Nadie lo expone | A construir (infra crítica) |
| Cap comercial 159 fact./mes (config comercial ≠ regulatoria) | Regla GSG | A construir |
| Perfil fiscal emisor + certificado asistido | Todos | A construir (gap del repo) |
| Libro IVA ventas exportable | Todos | A construir |
| Dashboard simple del dueño | Todos (parcial) | Reusar owner-insights/trends |

### DIFERENCIADORES (nadie los tiene, definen el producto)

| Feature | Por qué gana |
|---|---|
| Conciliación cobrado-vs-facturado con alerta de exclusión | ARCA ya cruza acreditaciones vs facturado para excluir; nosotros le avisamos al comerciante ANTES. Vemos banco+MP+emitido |
| Semáforo monotributo con la foto REAL | tusfacturas solo cuenta lo emitido en su app; nosotros sumamos lo ingestado = lo que ve ARCA |
| Paquete alertas monotributo por WhatsApp | Exclusión, recategorización con countdown, precio unitario pre-CAE, cuota día 20, anualización, cruce empleados I/J/K |

### PREMIUM (tiers superiores)

Factura E emitida · FCE emitida · Facturación recurrente · e-commerce ML/Tiendanube (territorio Facturante/tfactura, entrar después) · **Feed bancario directo (nadie lo tiene — ancla PYME)** · OCR/IA compras (add-on, margen IA real) · Percepciones AGIP/ARBA · **CM/IIBB multi-jurisdicción (nadie — techo de valor)** · Puente mono→RI · **Nómina (nadie — ancla COMERCIO)** · Multi-sucursal con conciliación POR LOCAL (PV múltiples tienen todos, conciliación por local nadie) · Multi-usuario con roles (nunca cobrar por usuario) · Cobranzas botón MP + recordatorios.

### DESCARTADOS (disciplina de producto)

- Documentos no fiscales (presupuestos/remitos) → desdibuja la promesa; quien lo necesita va al ERP GSG completo
- API pública → negocio enterprise, otro producto
- Facturación masiva por Excel de VENTAS → nuestro Excel BANCARIO lo supera conceptualmente; no duplicar flujos
- Planes multi-CUIT para estudios contables → canal potente pero otro producto; v1: rol contador read-only y listo
- Mini-ERP horizontal (stock/compras/caja/cheques) → el anti-patrón tusfacturas; upgrade natural = ERP GSG
- Micrositio autoservicio clientes del tenant → fricción, fuera de scope

---

## 4) GAPS NUESTROS (lo que NADIE cubre y nosotros sí)

1. **Ingesta de extractos bancarios + clasificación de facturables** — el "Excel" de todos los competidores es plantilla de ventas para emitir; nadie ingiere lo que el comerciante YA tiene. Es la identidad del producto.
2. **Alerta preventiva de exclusión** — convertir el cruce que ARCA usa para expulsar en un servicio que protege. "Contador de bolsillo."
3. **Umbral de identificación automatizado y configurable** — nadie automatiza la decisión CF genérico vs identificado.
4. **Nómina integrada al facturador** — ningún facturador argentino relevado toca lo laboral; el comerciante con 1 empleado hoy paga dos sistemas.
5. **Feed bancario directo** (tier PYME) — nadie del set; evaluar agregadores open banking AR vs scraping asistido (a definir, ver riesgos).
6. **Conciliación por local contra banco/MP** — PV múltiples venden todos; conciliar por local, nadie.
7. **Convenio Multilateral** — el techo del mercado son percepciones AGIP/ARBA; CM completo no lo ofrece nadie del set relevado.
8. **Bot WhatsApp que AVISA** (no solo emite) y que sigue vivo para agentes de percepción — exactamente donde tusfacturas castiga a su mejor cliente.
9. **Cruce nómina↔categorías I/J/K** — solo posible teniendo nómina + facturación en la misma app.

---

## 5) LOS PLANES

| Plan | Precio final (IVA inc.) | Cliente | Ancla competitiva | Incluye (esencia) | Límites |
|---|---|---|---|---|---|
| **SOLO** | $14.900/mes · trial 30 días sin tarjeta | Mono o RI chico sin empleados | tusfacturas LAVANDA $13.200/100 comp. — damos 159 + automático + alertas por ~10% más | Facturación automática banco(Excel)+MP · A/B/C+NC/ND un-clic · umbral $600k config · bot WhatsApp emite+avisa · semáforo foto real + alertas exclusión/recategorización/precio unitario/cuota · libro IVA + contador read-only · dashboard · onboarding certificado asistido · detección M/E/FCE | 159 fact./mes (aviso 80%) · 1 usuario+contador · 1 local/1 PV · sin nómina |
| **COMERCIO** | $39.900/mes | 1-5 empleados, un local (incluye e-commerce MP con volumen) | Hoy paga facturador $13-43k + estudio $15-30k por liquidación; consolidamos por menos que la suma; tfactura Pro $109k NI tiene nómina | Todo SOLO + 400 fact. (hueco 100→1.000 de tusfacturas) + **nómina hasta 5** (recibos, F.931, ART, SAC/vacaciones) + costo laboral en dashboard + cruce I/J/K + percepciones AGIP/ARBA con bot vivo + 3 usuarios con roles + 2 PV + cobranzas MP + puente mono→RI | 400 fact./mes · sin feed bancario · nómina 5 · 1 local/2 PV |
| **PYME MULTI-LOCAL** | $89.900/mes | 2+ locales, 5-10+ empleados, varias cuentas | tusfacturas PETUNIA $110k, tfactura Negocios $120k, Xubio ~$188k — más baratos que todos DANDO lo que ninguno tiene | Todo COMERCIO + 1.500 fact. + **feed bancario automático multi-cuenta** + **multi-sucursal con conciliación por local** + consolidado + usuarios ilimitados con roles + nómina 10 (+$4.900 c/u extra) + FCE y Factura E emitidas + add-on OCR compras $19.900 + soporte prioritario | 1.500 fact./mes · 5 locales/10 PV |
| **CM MULTI-PROVINCIA** | $149.900/mes | Inscripto en CM, multi-jurisdicción, agente de percepción | Sin competencia directa; benchmark = honorarios de estudio; debajo de Xubio PRO $375.900 que NO liquida CM | Todo PYME + 3.000 fact. + **CM completo** (coeficientes, IIBB por jurisdicción, datos cliente CM) + percepciones/retenciones multi-jurisdicción + bot WhatsApp PLENO para agentes + nómina 15 + OCR compras incluido | 3.000 fact./mes |

**Lógica de la escalera**: autoclasificación por dos preguntas (¿empleados? ¿cuántos locales/provincias?). Triggers de upsell automáticos detectados por la app: 80% del cap, primer empleado, segundo local, "¿puedo dejar de subir el Excel?", venta a otra provincia, exclusión inminente (puente a RI = retención, no churn). Nunca cobramos por usuario (lección tusfacturas). Cobro por Mercado Pago en pesos.

---

## 6) QUÉ REUSAMOS Y QUÉ SE CONSTRUYE

### Reuso directo (ya en main del repo estetica-erp)

| Pieza | Ubicación | Estado |
|---|---|---|
| Plugin ARCA real: WSAA+WSFEv1+PKCS#7, A/B/C, NC/ND, mono→C, condición IVA, alícuotas | `src/plugins/arca` (ADR-022, migrado a `src/modules/` por ADR-054/055) | Construido, apagado por default |
| Ingesta MP + conciliación + clasificador de facturables | ADR-025 | Construido |
| Capas WhatsApp (wa-intent/wa-provider/wa-dispatch) | Unidad Digital | Lógica lista; falta handler HTTP + adaptador + ADR proveedor |
| Core pagos (cobrarle al tenant por MP + botón de pago en factura) | `src/plugins/pagos` | Construido |
| RBAC multi-tenant + RLS enforced en prod | ERP core | Vivo en prod |
| Dashboard dueño (owner-insights/owner-trends) | `/admin/reportes` | Cableado |
| Sistema de módulos con activación por tenant y flag reversible | `src/modules/` | En main |
| Rate limiting, firma webhook MP, gates, runbook hardening | Célula 2 | En main |

### A construir nuevo (orden sugerido de ataque)

1. **Importador Excel bancario** (parsear formatos de bancos AR → alimentar clasificador ADR-025) — la identidad del producto.
2. **Motor de tablas regulatorias con vigencias + job semestral** — infra que sostiene todo; primera piedra técnica.
3. **Umbral de identificación** (comercial config + piso legal) + emisión automática end-to-end desde movimiento clasificado.
4. **Perfil fiscal del emisor** (domicilio, razón social, PV, certificado asistido) — gap del repo, bloquea onboarding.
5. **PDF fiscal** (QR + leyenda) + **cola resiliente con retry**.
6. **Handler HTTP WhatsApp + adaptador proveedor** (rematar capas existentes) + paquete de alertas.
7. Libro IVA export + semáforo + Factura M.
8. Fase 2 (COMERCIO): nómina simple, percepciones AGIP/ARBA, roles.
9. Fase 3 (PYME): feed bancario, multi-sucursal, FCE/E emitidas, OCR compras.
10. Fase 4 (CM): Convenio Multilateral — no existe nada de esto en el repo, es el desarrollo pesado nuevo.

---

## 7) RIESGOS Y GATES

| # | Riesgo/Gate | Mitigación |
|---|---|---|
| 1 | **Gate 2 del dueño — migraciones DB prod**: nuevo tenant/vertical va a requerir migraciones en Neon (hoy hay migraciones de inventario sin aplicar en la misma cola) | Diseñar schema completo, `migrate deploy` en batch con tu OK; nada se aplica sin tu orden |
| 2 | **Credenciales fiscales**: certificado ARCA + CUIT de cada tenant (y uno de prueba para homologación WSFE). Vos NO deberías cargar claves fiscales de terceros a mano | Flujo de delegación WSAA asistido donde el TENANT autoriza; homologación con CUIT propio de GSG. Requiere tu decisión de con qué CUIT probamos |
| 3 | **Volatilidad regulatoria** (riesgo #1 del producto): topes, cuotas, umbrales cambian cada 6 meses; circula prensa con tablas viejas rotuladas como nuevas | Motor de tablas con vigencias + job semestral + verificación SOLO contra arca.gob.ar + banner "valores actualizados". Cero montos en código |
| 4 | **Cambio del piso legal de identificación** ($10M hoy; ARCA lo mueve a saltos irregulares) | Piso legal como fila más del motor de tablas; regla "manda el más estricto" ya diseñada |
| 5 | **Feed bancario directo**: no hay open banking maduro en AR; agregadores vs scraping es decisión de riesgo (ToS bancarios, estabilidad) | **A confirmar**: spike de evaluación de agregadores antes de prometer fecha del tier PYME; el Excel subido es fallback digno mientras tanto |
| 6 | **Nómina**: LCT + convenios colectivos = pozo de complejidad | Scope v1 acotado (recibos + F.931 + ART + SAC/vacaciones + costo visible); liquidación por convenio explícitamente fase 2. No prometer "liquidación completa" en marketing |
| 7 | **CM**: complejo, volátil, sin referencia de mercado para copiar | Es fase 4; se construye con el primer cliente CM real de la mano de SU contador (design partner), no en el vacío |
| 8 | **Precios competidores**: los valores citados (LAVANDA $13.200, PETUNIA $110k, Facturante Pack 300 $43k, tfactura $109-120k, Xubio $188-375k) son del relevamiento y cambian con inflación — **aprox/a confirmar** antes de publicar pricing; misma advertencia para mínimo FCE $5.549.862 y proyección de escalas jul-2026 (~+14,3%, estimada) |
| 9 | **Rojos de seguridad pre-cobro** ya identificados: rotar NEON_API_KEY + password app_rls, PITR | Bloqueantes antes de cobrar a tenants de facturación (datos fiscales = sensibilidad máxima); ya están en el frente Seguridad |
| 10 | **Homologación WSFE**: el plugin está construido pero apagado; falta ciclo completo en homologación + producción con CUIT real | Primer hito verificable del roadmap: factura C real de punta a punta (Excel→clasificador→cola→CAE→PDF→WhatsApp) en homologación |

**Lo no verificado quedó marcado**: precios de competidores (riesgo 8), tabla de escalas jul-2026 (estimación IPC), viabilidad de agregadores bancarios (riesgo 5), y el detalle fino de qué cubre exactamente Xubio en sueldos (referencia de terceros, no relevada en profundidad).

**Recomendación PMO**: arrancar por el flujo SOLO completo (puntos 1-7 de la sección 6) hasta el hito de la factura automática end-to-end en homologación; los tiers superiores se venden con lista de espera mientras tanto. La ventana competitiva es real: el hueco central (ingesta bancaria + alertas preventivas + nómina) no lo tapa nadie del set relevado hoy.

— Elaborado por GSG (GSG Lab · célula mercado/regulaciones/planes) · 2026-07-11
