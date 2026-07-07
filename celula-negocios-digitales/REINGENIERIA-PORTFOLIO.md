# REINGENIERÍA DE PORTFOLIO — La cartera completa como UN negocio

> **Estratega de Portfolio → Dueño · 2026-07-06.** Primera mirada transversal sobre los **89 negocios
> del panel** (el resumen ejecutivo dice "83"; el panel tiene 89 entradas con los patches V2 — uso el
> panel como fuente de verdad). Cada ronda evaluó sus 6 negocios en aislamiento; nadie había mirado la
> cartera como cartera. Esto es esa mirada: **clusters por chasis técnico, la jugada de plataforma,
> bundles por canal, la cartera recomendada y los riesgos sistémicos.**
>
> Estado de la cartera: **81 vivos** (3 🟢 a producción + 4 en desarrollo con código + ~74 🟡 en pista)
> y **8 descartados**. Ejecutabilidad: 48 vivos 100% IA, 29 parcial, 4 con humano fijo.
>
> Todo local. No se tocó prod, git, ni el panel.

---

## 1. CLUSTERS POR CHASIS TÉCNICO

La hipótesis era que hay un chasis "vigilante regulatorio" repetido en 25-35 negocios. **Confirmada:
son 28.** Pero el hallazgo más útil es que **los 89 negocios se reducen a 7 chasis**, y 3 de esos 7
comparten la mayoría de las piezas entre sí. La cartera no son 89 productos: son ~7 arquitecturas
con 89 pieles.

### Chasis A — VIGILANTE REGULATORIO (28 negocios, el corazón de la cartera)

Arquitectura común: **conectar una fuente oficial → motor de reglas/plazos → alerta WhatsApp →
armar el trámite/legajo → abono mensual**. Ticket $8.000–35.000/mes, churn bajo (miedo > pereza),
casi todo 🌱. Cuatro sub-familias según qué se vigila:

**A1 · Vigía de buzón/boletín/norma** (9) — la fuente es una publicación oficial que cambia todos los días:
| Negocio | Fuente vigilada |
|---|---|
| Buzón ARCA (44) | Domicilio Fiscal Electrónico ARCA + rentas |
| Vigía de Marca (46) | Boletín diario INPI |
| Paritaria al Día (43) | Homologación de escalas de convenio |
| Reclamo Cero (43) | Ventanilla Única Federal + domicilio electrónico |
| Apuesta Legal (42) | Piezas publicitarias vs. Res. 446/2025 |
| Mediación Viva (45) | Plazos y notificaciones SIGIM |
| Arrepentimiento Blindado (47) | Norma del botón de arrepentimiento (cambió 2 veces en 10 meses) |
| Cuidador en Regla (45) | Escala salarial Casas Particulares Cat. 4 |
| Puente Concursal (37) | Señales de insolvencia (cheques rechazados, deuda AFIP) |

**A2 · Vigía de vencimientos de legajo** (7) — la fuente es el legajo de personas/vehículos/matrículas:
Semáforo de Flota (40), Frená a Tiempo (47), Chapa Vigente (45), Patente Viva (43), PAS al Día (43),
Vuelo en Regla (44), Reparto en Regla (39).

**A3 · Trazabilidad agro SENASA/ARCA** (4): Grano en Regla (46), Trazabovina (47), Colmena en Regla (42),
Añada Digital (42).

**A4 · Registro institucional vivo** (8) — mantener una entidad inscripta y al día en un registro estatal:
Club en Regla (46), Cooperativa al Día (45), Anfitrión en Regla (44), Registro en Regla (43),
Conocimiento Vivo (43), Geriátrico Legal (42), PrevenIA (47, humano fijo), Compliance UIF (43, humano fijo).

### Chasis B — RECUPERADOR DE PLATA / success fee (12)

Arquitectura: **auditar un flujo de dinero contra la norma → detectar la diferencia → armar el reclamo →
cobrar % de lo recuperado**. El cliente no paga por miedo sino por plata concreta; el fee de éxito mata
la objeción de venta. CAC más bajo de la cartera, pero ciclo de cobro más largo.

- Recuperadores puros: **Contra-Retención (44)**, **Receta Clara (41)**, **Cuota Justa (44)**,
  **Baremo Vivo (39)**, **Siniestro Claro (44)**, **Cobertura Fértil (38)**.
- Trámite que destraba plata del Estado/ANSES: **Reconoce (45)**, **PAMI al 100 (39)**, **Escudo CUD (41)**,
  **ObraLibre (45)**.
- Destrabador financiero (fee de originación): **FCEM Anticipo (42, humano fijo)**, **Aval Listo (40)**.

### Chasis C — VERIFICADOR INSTANTÁNEO (6)

Arquitectura: **consulta puntual a bases públicas → semáforo verde/amarillo/rojo → PDF con constancia
fechada → pago por uso o pack**. Es el chasis A sin la pata de monitoreo continuo: mismo conector de
fuentes, sin cron. **Quién Firma (47)**, **APOC Guard (46)**, **Título Verificado (40)**,
**Dominio Limpio (45)**, **Orden Válida (41)**, **Steel Compliance (40)**.

### Chasis D — GESTOR DE ALTA / trámite one-shot + abono residual (17)

Arquitectura: **armar un expediente/habilitación una vez (ticket alto) → abono chico de mantenimiento**.
Menos software y más gestoría asistida por IA; la recurrencia es débil salvo que la norma obligue a renovar.
Sello Alimento (39), Sol en Red (38), Aduana OEA Pyme (41), Sala en Regla (41), Cantera en Regla (38),
Puerto Limpio (40), Brote Legal (39), Billetera en Regla (41), Activo Prolijo (42), Búnker de Datos (36),
Amarra Lista (39), Garrafa Al Día (47), Vende al Mundo (40), Trae Nomás (41), Etiqueta Verde (38, humano),
Sello RIGI (36), Sangre en Regla (35).

### Chasis E — AGENTE CONVERSACIONAL / operador IA (11: 7 vivos + 4 muertos)

Arquitectura: **WhatsApp/voz + LLM con guion por rubro + acción (responder, agendar, cotizar, redactar)**.
Acá viven 3 de los 4 en desarrollo: **Kudos (86)**, **Testigo (84)**, **Fantasma (78)**; más
Recepcionista IA (62), Calificación de leads (57), Postora (54), Back-office AFIP (58).
Muertos: VetVoz, Mercader, Confesionario, GremioPro — *todos murieron por competidor local instalado,
no por el chasis*. Lección: este chasis solo gana con ángulo propio (Kudos = reputación, Testigo = parte
regulatorio), nunca como "asistente genérico".

### Chasis F — PRODUCTO DIGITAL PURO / audiencia (8: 4 vivos + 4 muertos)

Se construye una vez, se vende infinito, la distribución ES el negocio: **Plantillería (74, en dev)**,
El Data Semanal (52), Mapa del Barrio (46), Comparador con afiliados (50).
Muertos: Calculadoras fiscales, MediaKit.ar, Cambió el Precio, Vitrina.

### Chasis G — RADAR DE OPORTUNIDADES / datos propios / conector (7)

El inverso del vigilante: en vez de avisar amenazas, avisa **oportunidades** o vende **el dato que nadie
más tiene**: Licita (46), Martillo Digital (46), Arancel Libre (44), Autor Directo (40),
Textil Sin Fronteras (38), Cupo Social SUBE (36), Directorio B2B (44).
Técnicamente es el mismo scraper del chasis A con otro signo — pero el cliente paga por codicia, no por
miedo, y el churn es mayor (si no gana licitaciones en 3 intentos, se va).

**Verificación: 28 + 12 + 6 + 17 + 11 + 8 + 7 = 89.** ✔

---

## 2. LA JUGADA DE PLATAFORMA — veredicto: SÍ, pero como MOTOR INTERNO, no como producto

### El motor

Chasis A completo (28), chasis C entero (6), la pata de monitoreo del B y los radares del G comparten
**las mismas 6 piezas**:

1. **Conector de fuentes oficiales** (scraper/API por fuente: ARCA, INPI, SENASA, TAD, BCRA, boletines)
2. **Motor de reglas y plazos** (la única pieza realmente distinta por vertical: qué es "urgente", qué vence cuándo)
3. **Alertas WhatsApp** (ya construido para Fantasma/Kudos/Testigo)
4. **Generador de legajo/PDF** (ya construido para Testigo)
5. **Billing MP/suscripción** (ya construido para Fantasma)
6. **Panel multi-entidad** (multi-CUIT / multi-marca / multi-vehículo — es lo que convierte a un estudio
   o cámara en cliente de 30-50 unidades)

O sea: **~40 de los 81 negocios vivos corren sobre un solo motor**, y 3 de las 6 piezas ya existen en
los productos en desarrollo. El costo marginal de un vertical nuevo baja a "un conector + un set de
reglas + una landing": 1-2 semanas.

### Qué gana y qué pierde (evaluación honesta)

**Gana:**
- Costo marginal por vertical ≈ cero, y **aprendizaje compuesto**: cada scraper endurecido, cada patrón
  de alerta, cada flujo de billing sirve al siguiente.
- **Cobertura del riesgo individual**: si ARCA cierra una fuente, el motor vive de las otras.
- **Opcionalidad barata**: los ~55 negocios archivados quedan a 2 semanas de distancia si su ventana se abre.

**Pierde / peligros reales:**
- **El foco.** "Construir la plataforma" es la excusa perfecta para no vender nada durante 6 meses. Una
  plataforma con 0 clientes vale menos que un scraper feo con 10 clientes pagando.
- **La distribución NO se comparte.** El motor amortiza el código, no el CAC. Cada vertical necesita su
  canal propio — salvo que se agrupen por canal (ver §3, ahí sí se comparte).
- **Concentra el riesgo técnico**: un cambio de login/captcha en ARCA o un fallo sobre clave fiscal
  delegada rompe N verticales a la vez (ver §5).

### Las 2 reglas que hacen que la jugada funcione

1. **El motor se EXTRAE, no se diseña.** Se construyen los primeros 2 verticales como productos
   completos y feos; el motor es lo que queda al factorizar el segundo. Prohibido el green-field
   "plataforma primero".
2. **Un vertical nuevo solo se lanza con canal firmado.** Si no hay un estudio, cámara o federación
   comprometida a revenderlo, el vertical no se codea aunque cueste 2 semanas. El código barato hace
   que la disciplina tenga que estar en la distribución.

### La secuencia concreta

| Orden | Vertical | Por qué ese y ahí |
|---|---|---|
| **1** | **Vigía de Marca** | La fuente (Boletín INPI) es **pública, diaria y sin login** → valida el motor completo (scraper→reglas→alerta→billing) **sin tocar el riesgo de clave fiscal delegada**. 🌱 puro, idx 46, "realizable YA, costo BAJO". Es el *hello world* del motor. |
| **2** | **Buzón ARCA** | Agrega el módulo difícil (sesión con clave delegada) cuando el resto del motor ya está probado. Es el **ancla del canal estudios contables**: 1 venta = 30-50 CUIT, y abre la puerta al bundle contable (§3). Riesgo conocido: ARCA sin API oficial de buzón — se valida con 1 estudio amigo antes de escalar. |
| **3** | **"Tienda en Regla"** = Arrepentimiento Blindado (47) **fusionado con** Registro en Regla (43) | Mismo comprador (tienda online), mismo canal (agencias de e-commerce y estudios que arman tiendas), un solo pitch: "tu tienda cumple". El 47 más realizable de la ronda 11 + el complemento natural. |
| **4** | **"Flota en Regla"** = Frená a Tiempo (47) + Semáforo de Flota (40) fusionados | Vehículo + chofer en el mismo tablero, mismo comprador (flota), canal aseguradoras/cámaras. **Condición previa**: validar que las consultas ANSV/registros sigan automatizables — es su único riesgo declarado. |
| **5 (estacional)** | **Grano en Regla** o **Trazabovina** según calendario agro | Trazabovina tiene timing máximo (obligatoriedad plena desde 01/07/2026, ecosistema fragmentado); Grano pica en cosecha. Canal acopios/frigoríficos: 1 venta = 30-80 productores. Se lanza el que tenga el convenio de canal firmado primero. |

**Cuáles NUNCA sobre el motor** (aunque técnicamente podrían):
- Los de **humano fijo** — Compliance UIF, Etiqueta Verde, FCEM Anticipo, PrevenIA: el bloqueo legal no
  se amortiza con software.
- Los **B2G** — Cupo Social SUBE, Búnker de Datos: ciclo de venta estatal incompatible con una célula chica.
- La **fintech regulada** — Billetera en Regla, Activo Prolijo: vender compliance BCRA/CNV sin marca ni
  trayectoria es pedirle al cliente que apueste su licencia a un desconocido.

---

## 3. SINERGIAS DE CANAL — los bundles naturales

El costo real es vender (aprendizaje #3 de la célula). Un canal que ya te compró un producto compra el
segundo a CAC ≈ cero. La cartera, reagrupada por **quién revende**:

### Canal 1 — ESTUDIOS CONTABLES (el super-canal: ~14 negocios lo nombran)
Buzón ARCA · APOC Guard · Contra-Retención · Paritaria al Día · Cuota Justa · ObraLibre · Registro en
Regla · Conocimiento Vivo · Puente Concursal · Reconoce · Back-office AFIP · Arrepentimiento Blindado ·
Cuidador en Regla · FCEM Anticipo.
**Bundle natural: "Pack Estudio"** = Buzón ARCA (vigía, la puerta de entrada) + APOC Guard (verificador)
+ Contra-Retención (recuperador que le hace ganar plata visible a la cartera del estudio). Tres chasis
distintos, un solo comprador, un solo onboarding multi-CUIT. El estudio que revende 3 productos triplica
el LTV de la misma reunión de venta — y el recuperador financia la conversación (el estudio queda como
héroe ante su cliente).

### Canal 2 — CÁMARAS / FEDERACIONES / COLEGIOS (~16 negocios)
Licita · Club en Regla · Cooperativa al Día · Colmena en Regla · Cantera en Regla · Reclamo Cero · Chapa
Vigente · Frená a Tiempo · Geriátrico Legal · PAS al Día · Martillo Digital · Mediación Viva · Arancel
Libre · Vende al Mundo · Sello Alimento · Textil Sin Fronteras.
**Bundle natural: "Entidad al Día"** = Club en Regla + Cooperativa al Día (mismo chasis A4, mismo
trámite TAD, compradores hermanos — es una fusión, no un bundle). El patrón de venta es siempre el mismo:
convenio con la federación → precio por padrón completo → la cámara lo ofrece como beneficio de socio.

### Canal 3 — AGENCIAS WEB / E-COMMERCE (~5)
Arrepentimiento Blindado · Registro en Regla · Kudos · Postora · (Calificación de leads).
**Bundle: "Tienda en Regla" + Kudos** — la agencia que arma la tienda revende compliance + reputación en
el mismo alta. Sinergia directa con un negocio YA en desarrollo.

### Canal 4 — FARMACIAS / SALUD (~5)
Receta Clara · PAMI al 100 · Orden Válida · Cobertura Fértil · Sangre en Regla.
**Bundle farmacia**: Receta Clara (le recupera plata) + PAMI al 100 (le recupera clientes). El primero
paga el segundo.

### Canal 5 — AGRO (acopios, frigoríficos, salas de extracción, veterinarios rurales) (~6)
Grano en Regla · Trazabovina · Colmena en Regla · Añada Digital · Vuelo en Regla · Puerto Limpio.
**Bundle "Campo en Regla"**: Grano + Trazabovina + Colmena sobre el mismo motor SENASA/ARCA — el acopio
o frigorífico exige el legajo a sus proveedores y arrastra 30-80 productores por convenio.

### Canal 6 — ASEGURADORAS / PRODUCTORES DE SEGUROS (~6)
Frená a Tiempo · Chapa Vigente · Semáforo de Flota · Siniestro Claro · PAS al Día · Reparto en Regla.
A la aseguradora el vigilante le baja el siniestro: es el único canal donde el producto se puede regalar
(lo paga la póliza).

### Canal 7 — INMOBILIARIAS / ESCRIBANÍAS (~5)
Quién Firma · Anfitrión en Regla · Compliance UIF · Etiqueta Verde · Dominio Limpio (agencias de autos).

**Conclusión de canal:** los canales 1 y 2 concentran ~30 negocios. **Construir la relación con 3-5
estudios contables y 2-3 federaciones vale más que construir 10 productos.** El activo escaso de la
célula no es código: son convenios de reventa.

---

## 4. LA CARTERA EFICIENTE — recomendación despiadada

Criterio del dueño: realizable-YA + barato; valen 💥 y 🌱. Y una verdad incómoda: **83 opciones sin foco
= 0 negocios facturando.** La cartera activa no puede tener más de ~8 nombres.

### Núcleo — los 4 en desarrollo (se terminan, no se abandonan a mitad)
1. **Kudos (86)** — el ancla. Hasta primer cliente pagando.
2. **Testigo (84)** — un solo rubro faro (control de plagas) hasta primer cliente pagando.
3. **Plantillería (74)** — pasivo, ya scaffoldeado; su costo de continuar es ~cero. Es además el único
   negocio con pata USD (Lemon Squeezy) — vale también como hedge cambiario.
4. **Fantasma (78, warn)** — **congelado en mantenimiento**: es el único warn de los 4 y su stack
   WhatsApp+MP ya está amortizado por los otros. No se le suma inversión hasta que Kudos o Testigo
   cobren. Si en 90 días no tiene un piloto pago, se archiva sin culpa.

### Se suman (en este orden, uno por vez, con canal firmado antes de codear)
5. **Vigía de Marca** — primer vertical del motor (fuente pública, riesgo técnico mínimo, 🌱 puro).
6. **Buzón ARCA** — segundo vertical + apertura del canal estudios contables (el super-canal).
7. **"Tienda en Regla"** (fusión Arrepentimiento Blindado + Registro en Regla) — canal agencias,
   sinergia directa con Kudos.
8. **"Flota en Regla"** (fusión Frená a Tiempo + Semáforo de Flota) — solo tras validar el acceso
   automatizado a las consultas oficiales. Si la fuente no es automatizable, no entra.
9. *(Opción estacional, no compromiso)*: **Trazabovina** o **Grano en Regla** si aparece un convenio
   con acopio/frigorífico; **Garrafa Al Día** perdió su ventana si no se ejecuta ANTES de este invierno
   — es urgencia real pero de temporada: entra ya o no entra.

### Fusiones (mismo chasis + mismo comprador = un producto, no dos)
- **Arrepentimiento Blindado + Registro en Regla → "Tienda en Regla"**
- **Frená a Tiempo + Semáforo de Flota (+ Reparto en Regla como módulo) → "Flota en Regla"**
- **Club en Regla + Cooperativa al Día → "Entidad al Día"** (para cuando toque el canal federaciones)
- **Quién Firma + Título Verificado + Dominio Limpio → "Verificá"** (un solo verificador con 3 objetos:
  persona, profesional, auto) — para más adelante; hoy solo Quién Firma tendría prioridad si sobrara capacidad
- **Grano + Trazabovina + Colmena → "Campo en Regla"** (módulos del mismo motor SENASA)
- **Reconoce + PAMI al 100 + Escudo CUD → ventanilla "tercera edad"** (mismo público, canal
  geriátricos/farmacias) — archivada como fusión futura

### Se archivan AUNQUE estén "en pista" (~55 negocios) — con trigger de reactivación
- **B2G**: Cupo Social SUBE, Búnker de Datos. *Trigger: nunca con esta estructura.*
- **Humano fijo**: Compliance UIF, Etiqueta Verde, FCEM Anticipo, PrevenIA. *Trigger: aparece el socio
  matriculado/oficial de cumplimiento que ponga la firma.*
- **Fintech regulada**: Billetera en Regla, Activo Prolijo. *Trigger: 2 años de marca en compliance.*
- **Gestorías one-shot de nicho profundo**: Cantera, Brote Legal, Puerto Limpio, Sello RIGI, Sangre en
  Regla, Sala en Regla, Aduana OEA, Amarra Lista, Sol en Red, Steel Compliance, Sello Alimento, Vende al
  Mundo, Trae Nomás, Textil Sin Fronteras. *Trigger: un canal (cámara/despachante/instalador) que traiga
  10 clientes firmados.*
- **Recuperadores** (Contra-Retención, Cuota Justa, Receta Clara, Baremo Vivo, Siniestro Claro, Cobertura
  Fértil, ObraLibre, Aval Listo, Reconoce, PAMI al 100, Escudo CUD): buen chasis, pero exigen operación
  de reclamo caso a caso — se reabren cuando el Pack Estudio (canal 1) esté vendiendo y pida el tercer
  producto. Contra-Retención es el primero de la lista de espera.
- **Radares G** (Licita, Martillo Digital, Arancel Libre, Autor Directo, Directorio B2B): Licita tiene
  competidor local declarado; Martillo Digital es el mejor 💥 de la familia pero su volumen recién
  arranca — *trigger: >500 subastas/trimestre en el portal CSJN.*
- **Audiencia F** (El Data Semanal, Mapa del Barrio, Comparador): negocios de distribución pura que
  compiten por las mismas horas de marketing que necesitan Kudos y Plantillería. No ahora.
- **Agentes E restantes** (Recepcionista IA, Postora, Calificación de leads, Back-office AFIP): canibalizan
  el foco de los 3 agentes en desarrollo. Postora solo revive como upsell de Kudos vía agencias.

**La cartera activa queda en 8 nombres** (4 núcleo + 4 incorporaciones escalonadas). Todo lo demás es
inventario documentado a 2 semanas de distancia — eso es exactamente lo que vale el motor.

---

## 5. HUECOS Y RIESGOS SISTÉMICOS DE LA CARTERA COMO CONJUNTO

### Riesgo #1 — MONOCULTIVO REGULATORIO ARGENTINO (el que puede matar a la cartera entera)
~70 de los 81 vivos monetizan **una obligación estatal argentina**, en el momento político de mayor
desregulación en décadas. La misma motosierra que crea estas ventanas (SADAIC, INV, COPREC) puede borrar
mañana la obligación que sostiene el abono: si ARCA notifica nativamente por app, Buzón ARCA muere; si
se deroga el registro de alquiler temporario, Anfitrión en Regla muere. **La cartera está "long
compliance" en un ciclo "short regulación".** Mitigación: (a) preferir verticales donde el driver es
PLATA (recuperar/ahorrar) y no miedo a multa — la plata sobrevive a la derogación; (b) el motor convierte
la muerte de un vertical en un costo de 2 semanas, no de un negocio.

### Riesgo #2 — Fragilidad técnica correlacionada: scraping + clave fiscal delegada
Sin API oficial (ARCA no tiene API de buzón), media cartera depende de sesiones automatizadas con
credenciales del cliente. Es un riesgo **técnico** (un captcha rompe N verticales el mismo día), **legal**
(custodiar claves fiscales ajenas) y **de confianza** (la barrera de venta más citada en las fichas).
Por eso la secuencia empieza por Vigía de Marca (fuente pública) y no por Buzón ARCA.

### Riesgo #3 — Cero dólares, cero B2C real
La señal #5 del research ("cobrar en USD se liberó") no tiene NINGÚN negocio que la aproveche salvo
Plantillería. Todo lo demás es B2B pyme argentino en pesos, ticket $8-90k/mes, expuesto a inflación y a
la caja de la pyme. Hueco concreto: versión export de los chasis probados (¿vigilante regulatorio para
pymes que exportan a AR/LATAM, cobrado en USD?).

### Riesgo #4 — La distribución es el mismo cuello 89 veces, y hoy hay 0 canales construidos
Casi todos los negocios asumen "vía estudios contables / cámaras" — pero la célula no tiene HOY ni un
estudio ni una federación con convenio. El plan entero descansa en un activo que no existe. Primera
tarea comercial de la próxima sesión: **firmar 2 estudios contables y 1 federación**, antes que cualquier
línea de código nueva.

### Riesgo #5 — Sin efectos de red ni datos propios acumulativos
Los chasis A/B/C/D venden trabajo-sobre-fuentes-públicas: replicables por cualquier estudio con Claude
Code en 2027. Los únicos moats acumulativos de la cartera son los datos propios (Directorio B2B, Arancel
Libre, historial de Kudos) y la integración con entes (Testigo como "el formato que el inspector espera").
Mitigación barata: cada vertical del motor debe **guardar el histórico** (multas evitadas, plata
recuperada, precedentes) — ese archivo es el moat que el clon no puede scrapear.

### Huecos menores
- **Recurrencia dura no-regulatoria**: si se cae el riesgo #1, solo quedan los agentes E y Plantillería.
- **B2C**: los pocos B2C (Garrafa, PAMI al 100, Escudo CUD, Siniestro Claro) son de ticket bajo y CAC
  alto — correcto archivarlos, pero deja a la cartera 100% dependiente de la salud de la pyme argentina.
- **Nada compuesto**: no hay ningún negocio que mejore automáticamente porque otro crezca (salvo los
  bundles propuestos — razón de más para ejecutarlos como bundles y no como productos sueltos).

---

## Apéndice — Resumen de chasis (para el panel, si algún día se agrega el filtro)

| Chasis | Negocios | Vivos | Modelo | Piezas del motor que usa |
|---|---:|---:|---|---|
| A · Vigilante regulatorio | 28 | 28 | Abono mensual | 1-2-3-4-5-6 (todas) |
| B · Recuperador de plata | 12 | 12 | Success fee + abono | 1-2-4-5 |
| C · Verificador instantáneo | 6 | 6 | Pago por uso | 1-4-5 |
| D · Gestor de alta | 17 | 17 | One-shot + abono | 2-4-5 (poco motor) |
| E · Agente conversacional | 11 | 7 | Suscripción/uso | 3-5 (stack WhatsApp) |
| F · Producto digital puro | 8 | 4 | Pago único/ads | 5 |
| G · Radar / datos propios | 7 | 7 | Abono + comisión | 1-2-3-5-6 |
| **Total** | **89** | **81** | | |

*Fuente: array DATA de `panel/panel.html` (con patches V2 e IA) al 2026-07-06. Sin tocar prod, git ni panel.*
