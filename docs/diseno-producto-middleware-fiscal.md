# Diseño de producto — Middleware fiscal (cliente del contador ↔ contador)

**Estado:** documento vivo (v1, 2026-07-04) — se completa a lo largo de la sesión y
con lo que vuelva de la reunión con el contador. **Uso interno.**
**Qué resuelve:** el hueco del mercado identificado en
`docs/decision-facturador-cual-construir.md` — nadie es dueño del camino completo
*el negocio opera → factura → el contador recibe la info ordenada*. Este documento
diseña esa pieza.

> **No es un sistema nuevo.** Es **una ventana y unos adaptadores** sobre el Core
> multi-tenant que ya tenemos. El "libro" es la misma tabla de comprobantes del
> Core, mostrada con dos lentes: operativa (cliente) y fiscal (contador).

---

## 1. Idea en una frase

Un **libro fiscal único, ordenado y validado** por cada cliente del contador, que
se llena solo (desde ARCA y desde la operación del negocio) y se entrega al contador
en el formato de **su** sistema. El middleware es lo que convierte la realidad
desordenada del cliente en un dato que el contador consume sin re-cargar nada.

## 2. Actores

| Actor | Qué hace | Qué gana |
|---|---|---|
| **Cliente del contador** (el negocio) | Opera y factura en nuestro sistema; carga lo que ARCA no tiene (foto/WhatsApp) | Facturación sin fricción + no le rebota el contador |
| **Contador / estudio** | Recibe todo ordenado y exportado a su sistema; revisa y confirma | Menos horas de carga; clientes más ordenados |
| **Nosotros** | Dueños del libro normalizado + los conectores (ARCA in/out) + los adaptadores de salida | Producto pegajoso + canal de distribución (el contador) |

## 3. Arquitectura funcional — tres planos

### Plano A — Ingesta (cómo entra la info), por orden de esfuerzo
1. **Facturas emitidas por el cliente** → ya salen de nuestro Core vía **Plugin ARCA**
   (emisión + CAE). Estructurado desde el origen, cero fricción.
2. **"Mis Comprobantes" de ARCA** → bajamos por API todo lo que el CUIT emitió y
   recibió (servicio Mis Comprobantes, vía AfipSDK/TusFacturas). **El cliente no sube
   nada.** Cubre ~70-80% del volumen. *Verificado: la API existe y filtra emitidos/
   recibidos por rango de fechas.*
3. **Última milla** (tickets, gastos sin factura electrónica) → el cliente saca foto /
   manda por WhatsApp → OCR + IA extrae los datos. Solo para lo que ARCA no tiene.

### Plano B — Normalización (el corazón, lo único difícil de verdad)
Todo lo que entra cae a **un modelo canónico único** y pasa por cuatro pasos:
- **Formato único** — ver §4 (el comprobante normalizado).
- **Deduplicación** — la foto del cliente y lo bajado de ARCA pueden ser el mismo
  comprobante → regla de identidad (ver §6, decisión abierta) para no contar doble.
- **Validación** — CAE válido, CUIT existente (contra padrón ARCA), totales
  consistentes.
- **Clasificación** — la IA sugiere categoría contable; el contador confirma/corrige.
  Estado de cada comprobante: `pendiente` → `validado` → `observado`.

### Plano C — Entrega (cómo lo recibe el contador)
- **Panel multi-cliente**: el contador ve todos sus clientes de un vistazo — quién
  está completo, a quién le falta, qué está observado.
- **Exportación a su sistema**: adaptador por destino (Xubio, SOS-Contador, Bejerman)
  o Excel/CSV del libro IVA. *Integrar, no reemplazar.*
- **Cierre de período**: el mes se marca cerrado y el contador lo baja/empuja.

```
  INGESTA                     NORMALIZACIÓN                 ENTREGA
  Emitidas (Core+ARCA) ─┐     ┌─────────────────┐          ┌─ Panel multi-cliente
  Mis Comprobantes ─────┼────▶│ Libro canónico  │─────────▶┼─ Export a SU sistema
  (ARCA, gratis)        │     │ dedup+valida+IA │          └─ Cierre de mes
  Foto/WhatsApp ────────┘     └─────────────────┘
```

## 4. El comprobante normalizado (modelo conceptual)

El dato que unifica todo. Campos mínimos:
- Identidad fiscal: tipo (A/B/C/M/E, NC/ND), punto de venta, número, fecha, CAE.
- Partes: CUIT emisor, CUIT receptor.
- Montos: neto gravado, IVA **discriminado por alícuota** (21/10,5/27…), percepciones,
  no gravado, total.
- Clasificación: categoría contable (sugerida por IA, confirmada por contador).
- Origen: `emitido-core` / `arca-mis-comprobantes` / `captura-cliente`.
- Estado: `pendiente` / `validado` / `observado`.

**Decisión de diseño:** esto **reusa la tabla de comprobantes del Core**, con un
read-model fiscal encima — no una base de datos nueva (ver §6).

## 5. Encaje con nuestra arquitectura (por qué nos calza)

- **Contador = organización; cada cliente = un tenant.** Es literalmente ADR-001
  (multi-tenant con aislamiento) + una jerarquía org→tenants. Sube la prioridad de
  **provisioning en lote** (hoy inexistente).
- **ARCA sirve en dos direcciones** con el mismo conector: destino (emitir → CAE,
  Plugin ARCA de Fase 2) y fuente (bajar Mis Comprobantes). Un solo proveedor
  (AfipSDK/TusFacturas) resuelve ambas.
- El middleware es **read-model + adaptadores** sobre el Core: no reescribimos nada.

## 6. Decisiones abiertas (van al ADR de la sesión de arquitectura)

1. **Conector ARCA:** alquilar AfipSDK/TusFacturas para MVP (recomendado) vs WS
   propios. Cierra también la Fase 2 del piloto.
2. **Formato de exportación #1:** lo define la reunión con el contador (su sistema).
3. **Libro canónico:** read-model sobre la tabla del Core (recomendado) vs tabla
   nueva.
4. **Regla de deduplicación:** identidad = ¿CUIT emisor + tipo + PDV + número? ¿+
   monto/fecha como respaldo? Es la regla más delicada — define que no se cuente doble.
5. **Jerarquía de tenants + provisioning en lote:** cómo se modela org-de-contador →
   N tenants-cliente y cómo se dan de alta en masa.

## 7. MVP (el slice más fino que prueba el valor)

1. Un contador, 3-4 clientes suyos (los del piloto de la reunión).
2. Conectar sus CUIT → **bajar Mis Comprobantes de ARCA** (emitidos + recibidos).
3. Normalizar → entregar **ordenado en el formato de su sistema** (Excel del libro IVA
   como piso).
4. Métrica de éxito: *"esto me ahorra X horas / lo pagaría"*.
5. **Sin OCR/foto todavía** — esa capa se agrega recién si el MVP valida.

## 8. Riesgos

- **Foco:** es un 2º modelo de negocio sobre un piloto que aún no cerró Fase 2 —
  gate de validación (reunión) antes de construir.
- **Confianza del contador:** si la info llega con errores, no la usa. La validación
  contra ARCA (§3.B) es lo que sostiene la confianza.
- **Dependencia del proveedor ARCA:** mitigable porque el conector es una pieza
  reemplazable detrás del contrato del Plugin.
- **Normativa cambiante:** por eso alquilamos el conector (el proveedor mantiene los
  cambios), no lo construimos al inicio.

## 9. Demo (prototipo visual para validar alineación)

Prototipo clickeable del panel del contador — **datos ficticios con formato fiscal
argentino**, sin backend ni ARCA real. Objetivo: mostrárselo al contador y ver si
"recibir la info de mis clientes ordenada y en mi sistema" es lo que necesita.

- **Fuente versionada:** `docs/demo/panel-contador-demo.html` (abre local, sin internet).
- **Publicado (abrir en notebook/celular):** https://claude.ai/code/artifact/d1f13e31-5a5d-4d1b-ad0a-fd39c4f48ce2
- **Qué muestra:** cartera de clientes con estado (al día / faltan datos / observado);
  al abrir un cliente, su libro fiscal ya armado (ventas y compras normalizadas, IVA
  discriminado, totales, saldo IVA); cada comprobante marcado según **cómo entró**
  (ARCA automático vs foto del cliente); botón **Exportar libro IVA** al sistema del
  estudio (Xubio / SOS-Contador / Bejerman según el cliente).
- **Mensaje central que transmite:** *nadie cargó nada a mano — vino de ARCA y se
  ordenó solo.*

## 10. El producto es de dos lados (y por eso es defendible)

La trampa es pensarlo como "software para contadores". El producto real tiene **dos
usuarios, cada uno con su propia razón para quedarse**, y una rueda que los conecta:

- **El negocio** (cliente del contador): factura sin fricción y carga gastos con una
  foto. Su motivo para quedarse: *deja de pelearse con el contador y no vuelve a
  cargar nada dos veces.*
- **El contador**: recibe todo limpio y cierra el mes en horas, no en semanas. Su
  motivo para quedarse: *atiende más clientes con la misma gente.*
- **La rueda (flywheel):** el contador nos **trae** clientes (distribución que un
  facturador suelto no tiene) → cada cliente que carga bien hace al contador más
  dependiente → cada vertical nuevo que soportamos (estética, y los que sigan) trae
  más negocios que necesitan contador. Cuantos más de un lado, más valioso el otro.

**Consecuencia de diseño:** la experiencia del negocio **no** es un accesorio del
panel del contador. Es la mitad del producto. Si el negocio no ama cargar por foto,
el contador no recibe nada y la rueda no gira.

## 11. El foso (por qué no nos comen los que ya hacen captura con IA)

PortalContador, Onvio y Alegra ya leen comprobantes con IA. La IA **no es** el foso —
es commodity. Lo que nos defiende es otra cosa:

1. **Somos el sistema donde nace la operación, no un lector pegado al final.**
   Ellos *digitalizan lo que ya pasó* (un PDF, un extracto). En nosotros, la factura
   y muchas veces el gasto **nacen estructurados** dentro del sistema con el que el
   negocio trabaja (agenda → orden → cobro → factura). Menos "adivinar con OCR", más
   dato de origen. Eso es **confianza** — que es justo el riesgo que mata a los
   lectores puros (§8): si el número no es confiable, el contador no lo usa.
2. **Lock-in de dos lados.** Sacarnos implica que *el negocio* cambie cómo opera **y**
   que *el contador* cambie de dónde recibe. Doble costo de cambio.
3. **Profundidad vertical.** Arrancamos desde un rubro donde ya ganamos operativamente
   (estética). Un horizontal no puede bajar a esa profundidad en cada rubro; nosotros
   subimos de lo vertical a lo fiscal, no al revés.

## 12. Funciones que nos diferencian (el "wow", no la paridad)

Paridad = leer comprobantes y exportar. Eso hay que tenerlo, pero no gana. Lo que
gana ataca el dolor #1 del contador —**perseguir a los clientes que mandan la info
tarde e incompleta**— algo que los lectores puros no resuelven:

- **Semáforo de cierre + recordatorio de un toque.** El contador ve por cliente qué
  falta para cerrar el mes y, con un toque, el negocio recibe por WhatsApp *"te falta
  subir el extracto de junio"*. Convierte la persecución mensual en auto-servicio.
  **Este es el diferenciador más fuerte y es demo-able.**
- **Trazabilidad total.** Cada número del libro linkea a su origen (el comprobante de
  ARCA o la foto). El contador confía porque puede auditar en un clic.
- **Nacido estructurado.** Lo que se factura en nuestro sistema entra al libro sin
  OCR ni revisión — cero margen de error en la mitad del volumen.
- **Cierre en un lugar.** "Cerrar junio de los 40 clientes" como una sola acción con
  su checklist, no 40 procesos sueltos.

## 13. Modelo de negocio y precios (hipótesis a validar)

Todavía es hipótesis — la reunión con el contador ayuda a fijarlo. La lógica:

- **Quién paga:** el **estudio**, por cada cliente activo (lo bundlea en su honorario
  o lo traslada). El facturador básico del negocio queda **barato o gratis** para
  empujar adopción del lado del cliente — que es lo que alimenta al contador.
- **Estructura sugerida:** abono por estudio + precio por cliente activo, en escalones
  por volumen. Margen de socio para el estudio que **trae** al cliente (alinea el
  canal: le conviene traernos su cartera).
- **Por qué no cobrar por comprobante:** nos ataría al costo del conector ARCA
  (TusFacturas/AfipSDK cobran por comprobante) y castigaría el volumen, que es
  justamente el valor. Cobrar por cliente activo desacopla precio de costo.
- **Referencia de mercado:** el segmento cloud contable ronda $3.500–$13.200/mes por
  empresa (ver `facturador-electronico-arca-mercado-y-vision.md`); nuestro precio por
  cliente vive **debajo** de eso porque no somos la suite completa, somos la capa que
  la alimenta.

## 14. Roadmap por fases (de lo que ya hay a la rueda completa)

- **Fase 0 — hoy:** Core multi-tenant + vertical estética + factura interna sin CAE.
- **Fase 1 — MVP contador (sin OCR):** conectar ARCA de N clientes de **un** estudio,
  bajar Mis Comprobantes, normalizar, panel del contador, export a su sistema
  (Excel/Xubio). Prueba el valor con el menor esfuerzo. *(gate: validación con el
  estudio real).*
- **Fase 2 — emisión + captura:** Plugin ARCA con CAE real (facturación propia del
  negocio) + captura de gastos por foto/WhatsApp con IA + semáforo de cierre.
- **Fase 3 — la rueda:** más verticales, conciliación bancaria, más adaptadores de
  export, y matching contador↔negocio como canal de dos vías.

## 15. Onboarding real de un estudio (y su fricción honesta)

El alta de un estudio es **provisioning en lote** (ADR pendiente, ver §6): el estudio
nos pasa su lista de CUITs (o la importamos de su sistema), y por cada uno hay un
paso **una sola vez**: la **delegación de servicios en ARCA** (el cliente autoriza al
estudio/a nosotros a leer sus comprobantes con clave fiscal).

- **Esta es la fricción real del onboarding**, no la tecnología. Bajar Mis
  Comprobantes es trivial; conseguir la delegación de 40 clientes es trabajo humano.
- **Mitigación:** el estudio ya suele tener esa delegación para su trabajo actual →
  en muchos casos es reutilizable. Confirmarlo en la reunión es clave (pregunta para
  agregar: *"¿ya tenés delegación de servicios de tus clientes en ARCA?"*).

## 16. Pendiente de completar (próximas iteraciones de este doc)

- [x] Bosquejo del panel del contador → hecho como demo clickeable (§9).
- [x] Flujo de la captura por foto → hecho en la demo v2 (vista "Del lado del cliente").
- [x] Modelo de precios / cómo se cobra → hipótesis en §13 (a validar con el estudio).
- [ ] Semáforo de cierre + recordatorio: llevarlo a la demo (§12) — el diferenciador fuerte.
- [ ] Formato exacto del libro IVA de exportación (tras saber el sistema del contador).
- [ ] Confirmar en la reunión: ¿el estudio ya tiene delegación de servicios en ARCA? (§15)
