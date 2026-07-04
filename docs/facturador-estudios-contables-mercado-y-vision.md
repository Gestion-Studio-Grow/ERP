# Facturador para estudios contables — mercado y visión de producto

**Uso interno** (founders/equipo), no para el cliente. Relevado el 2026-07-04 desde
la web pública de cada competidor (no de memoria — estándar de sesión de negocio).
Objetivo: evaluar el producto "facturador para estudios contables" — el contador
como comprador, sus clientes suben la info, el estudio la procesa — y **cómo** se
para frente a lo que ya existe. Complementa a
`docs/facturador-electronico-arca-mercado-y-vision.md`: **misma línea de producto
(facturación + ARCA), dos motores de go-to-market distintos.**

> **Diferencia clave con el doc anterior.** Ahí el comprador era el **negocio
> final** (la estética factura su turno). Acá el comprador es el **contador**, y
> sus clientes (los negocios) son quienes cargan la info. Eso cambia todo:
> el valor que se paga no es "facturar fácil", es **procesar N clientes con menos
> horas de data-entry**. El eje competitivo se corre de la UX de facturación a la
> **profundidad impositiva + automatización de carga**.

---

## 1. El mercado, en cuatro capas

El segmento contable argentino está más maduro y más defendido que el de
facturación PyME. Cuatro capas, de la más vieja a la más nueva:

### A. Suites impositivo-contables legacy (comprador = contador, incumbentes)

| Producto | Qué es | Señal |
|---|---|---|
| **Bejerman** (Thomson Reuters) | Suite contable/sueldos, 30+ años | ~$100k–150k ARS/mes contratado vía estudio; estándar de facto en estudios grandes |
| **Tango / Softland / Zeus / Flexus** | ERP/gestión con módulo contable | Desktop-first, pesados, instalados |

**Lectura:** dueñas del estudio grande por inercia y profundidad. No competimos acá
— es su terreno y su fortaleza (30 años de normativa embebida).

### B. Cloud contable multiempresa para contadores (el corazón del segmento)

| Producto | Modelo | Portal del cliente |
|---|---|---|
| **Xubio** (planes para contadores) | El cliente carga sus ventas/compras → **asientos automáticos**; el contador accede a la cuenta del cliente | Sí: el cliente factura en Xubio y el comprobante entra solo al libro IVA + asiento |
| **SOS-Contador** | Impositivo-contable, **no cobra por usuario adicional**; importa de "Comprobantes en Línea" del cliente | Parcial: baja la facturación del cliente desde ARCA, con alertas |
| **Colppy** | Multiempresa, conciliación bancaria, cobranzas | Sí, colaboración remota cliente↔contador |
| **Nubox / Contadigital** | Cloud contable regional | Variantes del mismo modelo |

**Lectura:** este es el modelo exacto que describe el pedido — "portal contador ↔
clientes que suben su info" — y **ya está resuelto** por incumbentes cloud con
profundidad impositiva (libro IVA, F.2002, proyección de ganancias, ajuste por
inflación, liquidación de sueldos). Entrar de frente como "otro Xubio" es pelear
donde ellos son fuertes y nosotros no tenemos nada (Tax Engine diferido, ADR-006).

Fuentes: [Xubio — Contadores](https://xubio.com/ar/contadores) ·
[Colppy — Software para estudios contables](https://colppy.com/software-para-estudios-contables) ·
[SOS-Contador](https://www.sos-contador.com/).

### C. Facturación multi-CUIT para contadores (la parte que sí sabemos hacer)

| Producto | Propuesta |
|---|---|
| **TusFacturasApp** | Multi-CUIT: gestionar la facturación de varias razones sociales desde un panel |
| **declar.ar** | Multi-cliente: cada empresa con su config, percepciones, operadores y puntos de venta |
| **FacturaGratis** | Opción **MULTI-CUIT para contadores, gratis** |

**Lectura:** esta capa es *facturación centralizada*, no contabilidad. Es la más
cercana a nuestro Core (Factura + Plugin ARCA) y la más commoditizada —
incluso hay una gratis. No es un diferencial por sí sola.

Fuentes: [declar.ar](https://declar.ar/) ·
[FacturaGratis](https://www.facturagratis.com.ar/) ·
[TusFacturas — facturación masiva/lote](https://www.tusfacturas.app/caracteristicas-de-tus-facturas-electronica-clientes.html/facturacion-afip-arca-masiva-lote.html).

### D. AI-first / captura inteligente (el frente activo, adonde va el mercado)

| Producto | Qué hace |
|---|---|
| **PortalContador.com.ar** | IA: sube PDF de extracto bancario / liquidación de tarjeta → movimientos identificados, débitos/créditos separados, **asientos automáticos**; clasifica comprobantes con IA |
| **Onvio** (Thomson Reuters) | Módulo de "Carga de Comprobantes Inteligente" con IA |
| **Dext** | Captura por **foto / WhatsApp / email** de recibos |
| **Alegra IA** | Mandás foto o PDF por **WhatsApp** → la IA extrae proveedor, montos, impuestos, fecha; confirmás en el chat |

**Lectura crítica:** el modelo "moderno" que uno imaginaría como diferencial —
*el cliente saca una foto y la IA la procesa para el contador* — **ya existe y es
un frente activo**, incluido Thomson Reuters (el dueño de Bejerman) moviéndose ahí
con Onvio. No es océano azul. Pero (ver §3) el **eslabón débil de todos** es la
experiencia del lado del cliente, no la del contador.

Fuentes: [PortalContador](https://portalcontador.com.ar/) ·
[Thomson Reuters — apps para contadores con IA](https://www.thomsonreuters.com.ar/es/soluciones-fiscales-contables-gestion/blog-contadores/apps-para-contadores-con-ia.html) ·
[iProUP — IA argentina que "habla" con facturas](https://www.iproup.com/startups/58656-argentinos-crean-inteligencia-artificial-que-habla-con-facturas-y-recibos-para-ahorrar-costos).

---

## 2. Encaje arquitectónico (por qué esto nos calza mejor de lo que parece)

Hay una coincidencia fuerte entre este modelo y nuestra arquitectura, que **no**
tienen los incumbentes (ellos lo bolt-on-ean):

- **Un contador = una organización; cada cliente del contador = un tenant.** Eso es
  literalmente ADR-001 (multi-tenant con aislamiento) + jerarquía de tenants. Los
  incumbentes cloud simulan "multiempresa" sobre un modelo mono-cuenta; nosotros ya
  estamos hechos así.
- **Provisioning de tenants deja de ser diferido y pasa a ser la feature central.**
  Hoy "alta de tenant nuevo (provisioning)" está listado como no-existe en el INDEX.
  En este producto, dar de alta clientes en lote es el corazón del valor → sube de
  prioridad.
- **El Plugin ARCA es el mismo**, solo que multi-CUIT: `InvoiceCreated` →
  `RegisterFiscalDocument` con el certificado del tenant-cliente correspondiente.
- **AI como capa delgada (ADR-006)** encaja con la captura inteligente de §1.D —
  construida hacia ese estándar, no retrofit sobre legacy.

---

## 3. Dónde ganamos (el único wedge defendible)

No competimos en profundidad impositiva (ahí perdemos, §4). El hueco real:

- **La experiencia del *lado del cliente* es el eslabón débil de todo el segmento.**
  Xubio/SOS/Colppy están construidos **para el contador**; el cliente "sube" pero su
  UX es un accesorio. Nuestro ADN es exactamente lo contrario — diseñamos para el
  operador no-técnico (ADR-009, "para la recepcionista, no para el ERP"). El wedge es
  ser **la mejor capa de cara al cliente** (facturar + capturar gastos por foto/
  WhatsApp con cero fricción) que le entrega al contador la info **ya limpia**.
- **Integrar, no reemplazar la suite del contador.** El contador no cambia de Xubio/
  SOS de un día para otro. Si en vez de competir con su impositivo le **empujamos**
  la info prolija a la suite que ya usa, bajamos su fricción de adopción a casi cero.
  Buy-primero también acá: el impositivo lo pone el incumbente, la captura y la
  facturación las ponemos nosotros.
- **B2B2B: el contador como canal.** El contador es sticky y tiene N clientes. Si le
  damos un facturador de marca-propia para ofrecer a su cartera, cada estudio nos
  trae 20–200 negocios. Es distribución que un facturador horizontal no tiene.
- **Multi-tenant nativo + provisioning en lote** (ver §2): dar de alta la cartera
  del estudio es barato para nosotros, caro de simular para ellos.

---

## 4. Dónde perdemos (honesto — no llevar al cliente)

- **Cero profundidad impositiva.** Libro IVA, F.2002, retenciones/percepciones,
  Convenio Multilateral, proyección de ganancias, ajuste por inflación, liquidación
  de sueldos: es *el* valor que paga un contador, y es exactamente nuestro Tax Engine
  diferido (ADR-006). Sin eso no somos "software contable", somos un front-end.
- **El comprador es conservador y ya casado.** El contador cambia de herramienta cada
  10 años, no cada trimestre. Bejerman lleva 30. Desalojar es lento y caro.
- **El frente AI ya está poblado**, incluido Thomson Reuters (Onvio) — el mismo dueño
  de Bejerman. No llegamos primeros a "IA que lee la foto".
- **Sin respaldo/figura contable** que los estudios exigen como garantía.
- **Riesgo de foco.** Este es un segundo modelo de negocio (B2B2B, comprador
  distinto) sobre un piloto (estética, B2B directo) que todavía no cerró Fase 2. Es
  la apuesta más grande y más defendida de las tres analizadas — validar con 2–3
  contadores reales **antes** de construir, no después.

---

## 5. Recomendación de negocio

1. **No** construir "otro Xubio/SOS-Contador". Es el peor de los tres océanos rojos
   analizados: incumbentes maduros, comprador casado, y el valor central (impositivo)
   es justo lo que no tenemos.
2. **Sí** hay un wedge coherente y reutilizable: ser **la capa de cara al cliente**
   (facturación multi-CUIT + captura de gastos moderna) que alimenta la suite que el
   contador ya usa — *integrar, no reemplazar* — con el **contador como canal (B2B2B)**.
   Reutiliza el Core + Plugin ARCA + provisioning multi-tenant sin construir impositivo.
3. **Secuencia:** primero cerrar el Plugin ARCA (Fase 2) que sirve a *los dos*
   productos; recién con eso vivo, validar el wedge de contadores con 2–3 estudios
   reales (¿pagarían por "mis clientes me mandan la info ya limpia"? ¿a qué suite
   quieren que lo exportemos?). No abrir el desarrollo de este producto antes de esa
   validación — el riesgo de foco (§4) es real.
4. **Priorizar provisioning de tenants**: es el habilitador común. Hoy figura como
   inexistente; para el modelo contador es el corazón.

---

## 6. Handoff a arquitectura / negocio (no se decide en esta sesión)

- **Reutiliza el handoff ya en cola:** `/sesion-arquitectura Plugin ARCA` sirve a los
  dos productos — con la salvedad de que acá es **multi-CUIT** (certificado por
  tenant-cliente). Anotar esa dimensión en esa sesión.
- **`/sesion-arquitectura jerarquía de tenants (organización de contador → N tenants de clientes) + provisioning en lote`**
  — es la decisión estructural que este producto dispara y que hoy no existe.
- **Validación comercial previa (negocio, no arquitectura):** entrevistar 2–3
  contadores reales sobre el wedge del §3 y a qué suite impositiva querrían la
  exportación. **Gate:** no construir hasta tener esto. Origen de este ítem: acá.

---

## 7. Uso de este documento

Insumo para la decisión de founders sobre si abrimos la línea de contadores, y para
la sesión de arquitectura de jerarquía de tenants si se abre. Par del doc de
facturador horizontal — leerlos juntos: **misma tecnología (Core + ARCA), dos
mercados, y la recomendación en ambos es Buy-primero + integración, no competir de
frente.** Actualizar si cambia la oferta pública relevada o tras la validación con
contadores.
