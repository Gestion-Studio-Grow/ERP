---
id: ADR-090
nivel: fundacional
dominio: organizacion
depends_on: [ADR-045, ADR-046, ADR-047, ADR-051, ADR-052, ADR-053]
---

# ADR-090 — Mesa de Dinero: célula de INVESTIGACIÓN financiera, no de trading

**Estado:** Aceptada (pedido del dueño, 2026-09-09) · **Depende de:** ADR-045 (Advisory + Challenger), ADR-046 (de-sesgo por sector), ADR-047 (retroalimentación), ADR-051 (roster), ADR-052 (calibración universal), ADR-053 (pool compartido) · **Relacionado:** el ciclo DEMO → VENTA → INVERSIÓN y el Gate de Excelencia (ADR-040) de `CLAUDE.md`.

> Numeración provisional — verificar colisión al mergear: los números 081 a 088 estaban libres al momento de escribir, otras sesiones podrían haberlos tomado.

## Contexto

El dueño pidió una **mesa de dinero**: agentes que busquen rentabilidad por inversiones o arbitrajes, con
una consola de pruebas conectable a un exchange real y datos reales, **saliendo del sesgo de los modelos
típicos**, y con validación de que las estrategias sean **realmente factibles**.

El sesgo del modelo acá tiene nombre propio y es predecible: entregar un *arbitrage bot* entusiasta que
detecta un spread y promete que escala. Ese producto ya existe, es gratis y no funciona. La aritmética
verificada en 2026 lo desarma:

- Los spreads cross-exchange viven **200–800 ms** y los comprimen firmas con colocación y feeds directos
  (Jump, Cumberland). Un spread visible en una API REST pública **ya pasó**.
- El costo de ida y vuelta en spot es ~0,20% (taker 0,10% por lado) **más** retiro, tiempo de traslado y
  slippage por profundidad — típicamente **por encima** del spread observable entre venues grandes.
- El *rulo* argentino clásico murió: el premium USDT/ARS contra el oficial pasó de **>30% (2022) a ≈0%
  (2026)**, mientras los exchanges locales cobran 3,5–8% todo incluido.

Es decir: la respuesta honesta a "¿esto es factible?" es, para la mayoría de las estrategias, **no** — y
esa respuesta vale plata, porque es plata que no se pierde. Una célula que solo puede devolver "sí" es
una célula inútil.

## Decisión

1. **La Mesa de Dinero es una célula de investigación, NO una mesa de trading. No opera.** Su producto es
   un **veredicto con evidencia medida** (🟢 sobrevive / 🟡 marginal / 🔴 muere), no una orden.
2. **Regla fundacional:** *una estrategia no existe hasta que sobrevivió al modelo de costos completo con
   datos reales medidos, registrados y re-chequeados.* Antes de eso es una hipótesis, y **una hipótesis no
   recibe capital.**
3. **La herramienta central es una consola de FALSACIÓN, no un detector de oportunidades**
   (`productos/mesa-de-dinero/`, carpeta aislada, cero dependencias npm, solo lectura). Sus métricas
   titulares son **tasa de supervivencia**, **tasa de fantasma** y **spread ejecutable vs nocional** — no
   "ganancia encontrada". **Matar una estrategia con aritmética es producir valor**; un ciclo que concluye
   "ninguna sobrevive" es un ciclo exitoso.
4. **En esta mesa NO corre nada en Sonnet: todo en Opus y Fable** — bajada de línea del dueño (2026-09-09).
   Es una **excepción explícita y acotada** al default de `CLAUDE.md` §2 (Sonnet para toda la ejecución),
   y se sostiene con el criterio de la propia §2: *¿es caro de revertir, toca plata?* En esta célula la
   respuesta es **sí en toda la cadena**, así que el default de ahorro no aplica. El reparto es
   **Opus = juicio · Fable = generación**: `mesa-dinero-orquestador`, `mesa-costos`, `mesa-riesgo`,
   `mesa-falsacion` y `mesa-cuant` en **Opus**; `mesa-datos` en **Fable** (conectores y consola son
   generación de código). **`mesa-falsacion` no se degrada de modelo ni en modo `economia`**, por la misma
   lógica que el Gate (§3). **Alcance: solo esta mesa** — no deroga el default Sonnet del resto de la
   factory, que sigue vigente.
5. **Se prestan agentes del pool antes de crear** (ADR-053): `cobro-fiscal`, `seguridad`, `challenger`,
   `auditoria-gsg-gate`, `finops-costo-uso`. Los seis nuevos existen porque ningún rol del pool cubría el
   modelo de fricción de mercado ni la falsación cuantitativa.
6. **El capital real es INVERSIÓN POST-EVIDENCIA**, alineado con el ciclo DEMO → VENTA → INVERSIÓN: hasta
   que hay evidencia todo es papel y solo lectura. **Ningún peso sin OK escrito del dueño, por estrategia.**
   Las claves de trading nunca viven en el repo, van sin permiso de retiro, y las pega el dueño (FASE 2).
7. **Prioridad P3** en la regla de concurrencia de `CLAUDE.md`: la mesa **cede el lugar** ante P1 (demos
   que venden). Es investigación, no la caja del negocio.

## Consecuencias

**Habilita:** una respuesta con números a una pregunta cara ("¿hay plata en el arbitraje?") sin exponer
capital; una consola reutilizable que mide fricción real y sirve para cualquier hipótesis futura; y un
patrón replicable —**el entregable es la falsación, no la promesa**— que ya aplicaba el GSG Lab con su
red-team y que acá se lleva al terreno financiero.

**Acepta como costo:** la mesa puede consumir ciclos y devolver "no". Es el resultado esperado y por eso
va en P3, cediendo ante lo que vende.

**Riesgo principal y su mitigación:** que la mesa se vuelva una **distracción cara** frente al negocio real
de GSG (el ERP multi-tenant y las demos). Mitigación: prioridad P3, cero gasto hasta evidencia, y el
`challenger` prestado con mandato explícito de argumentar contra el proyecto entero.

**Deuda anotada:** el egress de las sesiones remotas bloquea las APIs de exchanges, así que la medición con
datos reales corre en la máquina del dueño; en sesión la consola corre con fixtures y **lo declara en
pantalla**. Sin ventana de medición real y N suficiente, ningún veredicto pasa de 🟡.

---

— Elaborado por GSG
