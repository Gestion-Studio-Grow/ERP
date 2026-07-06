# ADR-027 — Analytics cross-tenant: benchmarking anónimo por rubro sobre el dato del ERP

**Estado:** Aceptado (decisión de diseño; **no implementa código**, no aplica migración) · **Fecha:**
2026-07-05 · **Origen:** sector Agencia Digital — palanca #1 del análisis de mercado
(`docs/sectores/agencia-digital/analisis-mercado/2026-07-05-servicios-automatizables-y-analytics.md` §3).

> **Marco:** este ADR es válido dentro de `docs/FUNDAMENTOS-Y-VISION.md` (aislamiento entre tenants =
> línea roja) y enmienda/precisa el alcance de **ADR-018** (RLS) y **ADR-021** (plano de plataforma /
> super-admin). Si algo choca, gana FUNDAMENTOS.

## Contexto

El análisis de mercado del sector Agencia identifica como **palanca #1** vender **analytics de negocio
como producto** sobre el dato que el ERP ya genera, y dentro de eso el mayor *moat* es el
**benchmarking anónimo por rubro**: decirle a cada tenant *"tu ticket promedio / no-show / rotación
está X% arriba o abajo del promedio de tu rubro y zona"*. Es un moat porque **requiere una cartera
multi-tenant del mismo rubro** — una agencia con un solo cliente no lo puede hacer nunca, y es el mismo
efecto de red del SaaS (cada tenant nuevo mejora el benchmark de todos).

**El problema:** el benchmarking necesita **leer y agregar datos de muchos tenants a la vez**, y eso
choca de frente con la línea roja del producto:

- **`FUNDAMENTOS §3`:** ningún dato, query o pantalla cruza tenants.
- **ADR-018 (RLS):** el aislamiento por fila es *fail-closed* — cada transacción corre con
  `SET LOCAL app.current_tenant_id` y el rol `app_user` **no** tiene `BYPASSRLS`. Por diseño, la
  sesión de un tenant **no puede** ver filas de otro.

Sin una decisión explícita, "hacer benchmarking" degenera en *"bypassear RLS para leer a los demás"* —
exactamente lo que ADR-018 existe para impedir. Este ADR fija **cómo** se obtiene el valor cross-tenant
**sin** romper el aislamiento.

## Decisión

**Se separan dos planos que nunca se tocan, y el dato cross-tenant solo existe ya anonimizado y
agregado.**

### 1. El plano del tenant NUNCA lee datos de otro tenant
La app del tenant y su sesión de DB (`app_user` + RLS, ADR-018) siguen **fail-closed e intactas**. El
benchmarking **no** se calcula en la request del usuario, **no** usa su sesión, y **no** bypassea RLS.
Esta regla es inviolable.

### 2. El cálculo cross-tenant vive en un PLANO DE PLATAFORMA separado (alineado con ADR-021)
Un **pipeline de agregación** corre **fuera de la request del usuario**, como trabajo de plataforma
(mismo plano lógico que el super-admin de ADR-021: cross-tenant, otra audiencia, otro plano de
autorización). Sus propiedades:

- **Rol de DB propio y acotado:** un rol de solo-lectura de agregación, **distinto** de `app_user`, que
  puede leer las columnas necesarias para computar métricas — **nunca** expuesto a la app del tenant.
- **Corre sobre una réplica / branch de Neon**, no sobre el pooler de producción, para respetar el
  plan free (sin escaneos pesados contra prod; ver `CLAUDE.md` — cuidado de Neon).
- **Salida = SOLO agregados anónimos por cohorte** (rubro × zona × período), materializados en una
  tabla nueva de benchmarks **sin `tenantId` de terceros**. La fila materializada es, por ejemplo:
  `(rubro=estetica, zona=canning, periodo=2026-07, metrica=ticket_promedio, p50=…, p25=…, p75=…, n_tenants=…)`.

### 3. Reglas de privacidad (k-anonymity como piso, con refuerzos)
El agregado solo se publica si respeta un umbral duro, para que **ningún negocio sea reidentificable**:

- **k-anonymity, k ≥ 5 tenants por cohorte.** La literatura de micro-agregación usa grupos de 3–5 como
  piso; adoptamos **k ≥ 5** por conservador. Si una cohorte tiene `n < k` → **se suprime** (no se
  publica esa celda). [1][2]
- **Anti-dominancia:** si un solo tenant concentra una fracción excesiva del volumen de la cohorte, la
  celda se suprime aunque `n ≥ k` (evita inferir al líder). Refuerzo con **l-diversity / t-closeness**
  sobre atributos sensibles. [3]
- **Solo estadísticos agregados** (percentiles/medianas/promedios por cohorte); nunca valores
  individuales ni rankings nominados. Opcional a futuro: **ruido diferencial** en los releases. [1][3]
- **Consentimiento opt-in por tenant** en los términos: participar del benchmarking es opcional; lo que
  el tenant recibe es *"vos vs. la cohorte"*, jamás *"vos vs. el negocio X"*.

### 4. Cómo lo consume el tenant (sin violar RLS)
El tenant lee la **tabla de benchmarks materializados**, que **ya es anónima y agregada** — no son filas
de otros tenants, así que servirla **no** viola el aislamiento de ADR-018 (no hay dato cruzado, hay un
promedio de rubro público-para-la-cohorte). El tenant ve su cohorte por su rubro/zona; su propio número
sale de su propio dato (RLS normal).

## Consecuencias

- ✅ Habilita la **palanca #1** (analytics-producto con moat) **sin** tocar la línea roja de aislamiento
  ni debilitar RLS. RLS queda igual de estricto; el valor cross-tenant se obtiene por un camino
  separado que solo produce anónimos.
- ✅ Se apoya en ADR-021 (plano de plataforma separado) y le da un segundo caso de uso concreto.
- 🚧 **Requiere una tabla nueva** (`BenchmarkCell` o similar) → **migración = Gate 2** (no se aplica
  sola; OK explícito + ensayo en branch de Neon). **Este ADR no crea la tabla ni escribe código.**
- 🚧 **Gate de producto — masa mínima:** el benchmarking **no tiene sentido hasta tener ≥ k (=5) tenants
  por cohorte**. Hoy hay 2 tenants (CH estética, magra) → **cero cohortes válidas**. Por eso: **se
  diseña ahora, se activa cuando haya masa** (y la Agencia, como go-to-market, es justamente el motor
  que trae esa masa — sinergia del `FUNDAMENTO.md` del sector).
- ✅ **Incremento no-gateado:** el analytics **single-tenant** ("Panel del Dueño" — insights del propio
  dato del tenant, sin comparación) **no** depende de este ADR y se puede construir ya. El benchmarking
  cross-tenant es la capa que este ADR habilita **para después**. (Ver la propuesta de producto #1 del
  PMO del sector.)

## Alternativas descartadas

- ❌ **Bypass de RLS en la request del tenant para leer a los demás** — viola `FUNDAMENTOS §3` y ADR-018;
  un solo query mal filtrado cruza datos. Inaceptable.
- ❌ **Exponer datos identificables de otros negocios** (rankings nominados, "el mejor de tu zona es
  X") — riesgo legal/comercial y traición de la confianza del tenant.
- ❌ **Calcular el benchmark on-the-fly en cada request** — costo contra Neon (plan free) + tentación de
  cruzar tenants en vivo. Se prefiere materializado, offline, anónimo.

## Fuentes

1. [K-Anonymous A/B Testing — arXiv:2501.14329](https://arxiv.org/html/2501.14329)
2. [How K-Anonymity Preserves Data Privacy — Satori](https://satoricyber.com/data-masking/how-k-anonymity-preserves-data-privacy/) · [Data anonymization techniques (micro-aggregation 3–5) — GoReplay](https://goreplay.org/blog/data-anonymization-techniques/)
3. [Healthcare Data Anonymization: k-Anonymity, l-diversity, t-closeness, Differential Privacy — Accountable](https://www.accountablehq.com/post/healthcare-data-anonymization-techniques-explained-k-anonymity-differential-privacy-and-more)

---

*Decisión de diseño. No implementa código, no crea tablas, no aplica migración, no toca prod ni Neon.
La implementación es una `/sesion-feature` posterior, atada al gate de masa (≥5 tenants/cohorte) y al
Gate 2 (migración).*
