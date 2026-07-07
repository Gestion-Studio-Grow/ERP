# Testigo — SPEC del MVP

> **Producto:** de foto + nota de voz por WhatsApp a un **parte de trabajo profesional en PDF**.
> **Estado:** kickoff de desarrollo (célula I+D Gestión Studio Grow). Prototipo aislado.
> **Fuente de números:** `ronda-2/activo/02-analitico.md` §Testigo y `ronda-2/ANALISIS-ECONOMICO-EJECUTIVO.md` §3.

---

## 1. Rubro de arranque elegido: CONTROL DE PLAGAS / FUMIGACIÓN

**Recomendación: arrancar por control de plagas (desinsectación / desratización / desinfección), NO por
plomería, obra ni jardinería.** Motivos, en orden de peso:

1. **El parte no es "lindo de tener", es obligatorio por normativa.** Una empresa de control de plagas que
   presta servicio a gastronómicos, consorcios, industria alimenticia o depósitos **debe entregar una
   constancia/certificado de servicio** con producto usado, principio activo, N° de registro (SENASA/ANMAT),
   dosis, áreas tratadas y plazo de reingreso. El cliente final (el restaurante) a su vez **se lo muestra al
   inspector de bromatología**. → La disposición-a-pagar es **estructural**, no estética: sin el papel, el
   contratista no puede facturar en regla. Esto rompe el principal cuello del producto ("evangelización"):
   acá no hay que convencer de que el parte *conviene*, ya *lo necesitan*.

2. **Servicio recurrente = muchos partes/operario/mes.** Los contratos con consorcios y gastronomía son
   **mensuales o quincenales**. Un operario hace 4-8 servicios/día. Eso maximiza el valor del COGS de
   ~US$2/operario/mes y **dispara la retención**: el parte pasa a ser el estándar de entrega mes a mes.

3. **Plantilla altamente estandarizable.** El parte de plagas tiene campos casi fijos (plaga objetivo,
   producto, registro, dosis, áreas, plazo de reingreso). Es **el rubro más fácil de pulir a fondo con UNA
   plantilla** —justo lo que el analítico marca como "la parte fina" del MVP. Obra/construcción, en cambio,
   tiene checklists que varían por obra: mala primera plantilla.

4. **El documento viaja y refuerza la marca.** B2B2B: contratista → restaurante → inspector. El parte
   circula con el logo del contratista puesto por Testigo. Marketing gratis + lock-in.

**Por qué no los otros (de arranque):**
- **Plomería:** el antes/después es fuerte, pero los trabajos son one-off y la documentación no es exigida →
  disposición-a-pagar sólo estética.
- **Jardinería:** baja necesidad regulatoria, ticket bajo por parte.
- **Obra/construcción:** partes de avance valiosos, pero trabajos largos, checklist variable por obra →
  difícil estandarizar la primera plantilla. Es el **segundo** rubro, una vez que el pipeline está probado.

> Los otros rubros entran como **plantillas nuevas** (mismo pipeline, distinto esquema+prompt) recién en la
> fase de expansión (ver `PLAN.md`). El MVP es **un solo rubro, pulido**.

---

## 2. Flujo exacto del MVP

```
  OPERARIO EN CAMPO                    TESTIGO (backend)                     ENTREGA
  ────────────────                     ─────────────────                    ───────
  1. Termina el servicio
  2. Abre el WhatsApp del             3. Webhook recibe:                   9. PDF al contratista
     contratista (número Testigo)        - fotos (antes/durante/después)      (grupo/DM WhatsApp)
  3. Manda por WhatsApp:                 - audio (nota de voz)            10. PDF al cliente final
       • 1-N fotos                       - texto opcional                     (WhatsApp / e-mail)
       • 1 nota de voz describiendo    4. STT: audio → transcripción      11. Copia archivada
         el trabajo                     5. Visión: cada foto → caption        (link permanente)
       • (opcional) texto                 + clasificación antes/después
  4. Manda "listo" / "cerrar"         6. NÚCLEO: (transcripción +
                                          captions + config del rubro)
                                          → Claude Sonnet → PARTE
                                          ESTRUCTURADO (JSON validado)
                                       7. Validación de campos críticos
                                          (producto, registro, dosis)
                                       8. Render → PDF con plantilla
                                          de control de plagas
```

**Ingesta zero-app:** el operario no instala nada. Usa el WhatsApp que ya tiene. El contratista da de alta a
sus operarios por número de teléfono (whitelist).

**Regla de oro del input:** el operario habla como habla ("terminé la desratización del subsuelo, puse
cebo en las cuatro estaciones del fondo, había caca de rata cerca del depósito, les dije que no bajen 24
horas"). El núcleo se encarga de estructurarlo. **Cero fricción para el operario** = adopción.

**Manejo de faltantes:** si el audio no menciona un campo crítico (p. ej. no dijo el producto), el parte se
genera con ese campo marcado `PENDIENTE_REVISION` y Testigo le repregunta **por WhatsApp** ("¿Qué producto
usaste? ¿Qué dosis?") antes de emitir el PDF final. Nunca inventa un dato regulatorio.

---

## 3. Plantilla del parte (control de plagas)

El PDF tiene estas secciones (esquema completo y tipado en `src/esquema-parte.ts`):

| Bloque | Campos |
|---|---|
| **Encabezado** | Logo/nombre del contratista, N° de parte, fecha y hora del servicio |
| **Prestador** | Empresa contratista, operario/técnico responsable, matrícula/registro de la empresa |
| **Cliente** | Nombre, dirección, tipo de establecimiento (gastronómico / consorcio / industria / domicilio) |
| **Servicio** | Tipo (desinsectación / desratización / desinfección / desinfestación), plaga(s) objetivo, modalidad (preventivo / correctivo) |
| **Diagnóstico (ANTES)** | Situación encontrada, nivel de infestación, evidencias (fotos antes) |
| **Tratamiento** | Productos aplicados: **nombre comercial · principio activo · N° registro · dosis · método de aplicación**; áreas tratadas |
| **Checklist** | Puntos verificados (estaciones de cebo, zócalos, desagües, cámaras, etc.) con estado |
| **Resultado (DESPUÉS)** | Trabajo realizado, fotos después, observaciones |
| **Seguridad** | Plazo de reingreso, advertencias, recomendaciones al cliente |
| **Próximo servicio** | Fecha sugerida del próximo control |
| **Fotos** | Galería antes/después con epígrafes generados |
| **Firma** | Firma del técnico (imagen o conformidad), aclaración, sello del contratista |

La plantilla es **configurable por contratista** (logo, colores, matrícula, texto legal al pie) sin tocar
código: un objeto `ConfigContratista` (ver `src/tipos.ts`).

---

## 4. Qué NO entra en el MVP (anti-scope)

- ❌ **Otros rubros** (plomería, obra, jardinería). Solo control de plagas.
- ❌ **App / portal web para el operario.** La ingesta es 100% WhatsApp.
- ❌ **Facturación / cobranza / gestión de turnos** (eso es el FSM completo; Testigo vende SOLO "el caos de
  WhatsApp → parte cobrable").
- ❌ **Firma digital con validez legal / biometría.** El MVP usa firma-imagen o conformidad por texto.
- ❌ **Multi-idioma.** Español rioplatense.
- ❌ **Dashboard analítico.** Reporte simple de partes emitidos, nada más.
- ❌ **Integración con SENASA/AFIP.** El parte cita el N° de registro que el contratista ya tiene; no valida
  contra padrones oficiales (fase futura).
- ❌ **Edición colaborativa del PDF.** Se regenera desde el JSON; no se edita el PDF a mano.

**Criterio de éxito del MVP:** un contratista de control de plagas con 3-5 operarios reemplaza su entrega
manual (foto suelta + WhatsApp) por partes Testigo y **paga la suscripción mensual**.
