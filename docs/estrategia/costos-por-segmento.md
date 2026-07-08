# 💵 Costos por segmento — micro / pyme / enterprise (sin IA, con confiabilidad)

> **Qué es:** el costo real de bolsillo de GSG para servir cada segmento, **con la confiabilidad
> incluida** ("no nos caemos") y **excluyendo el costo de IA** (va aparte). Salió del ciclo de análisis
> 2026-07-08 (Plataforma/SRE + Arquitecto + Analista de mercado local). **La implementación, consultoría y
> soporte los cubre el equipo del proyecto → NO entran como costo en pesos** (ver la ⚠️ advertencia de §4).
>
> **Autor:** PMO (síntesis del panel) · **Fecha:** 2026-07-08 · **Moneda:** pesos, dólar a ~$1.350 (a
> confirmar; mueve los pesos, no las conclusiones). Precios de proveedores 2026 — **reconfirmar antes de contratar**.

---

## 1. Qué se paga (de bolsillo) — en criollo

Son 3 gastos reales; el resto lo pone el equipo.

| Pieza (criollo) | Qué es | Costo/mes | En la jerga |
|---|---|---|---|
| 🏠 **El "local"** | Dónde vive el sistema en internet (uno solo sirve a TODA la flota) | **~$27.000** | hosting / Vercel Pro |
| 🗄️ **La "caja fuerte" de datos** | Dónde se guardan clientes/ventas/facturas/fiados | **$25.000** básica · **$93.000** con respaldo en vivo | base de datos / Neon |
| ↩️ **El "control-Z"** | Volver atrás si se borra algo (hasta 7 días) | incluido en la caja fuerte paga | PITR / backups |
| 🔁 **La "copia lista al lado"** | Segunda caja fuerte esperando; toma la posta si la principal falla | en la versión $93.000 | réplica / alta disponibilidad |
| 🧑‍🔧 **Atención / puesta en marcha / soporte** | Instalar, acompañar, estar cuando algo se traba | **$0 en plata — lo pone el equipo** | implementación / soporte / on-call |

**Gasto fijo para arrancar confiable (uno solo, toda la flota micro+pyme):**
- **Básico ($54.000/mes):** local + caja fuerte + control-Z → anda bien y no se pierden datos (uptime ~99,5%).
- **Con respaldo en vivo ($121.500/mes):** suma la copia al lado → "no se cae ni ahí" (uptime ~99,9%).

> El **90% de "que no se caiga" es código, cuesta $0** (cerrar los cuellos de fragilidad ya auditados). El
> único gasto que mueve la aguja es pasar de la **caja fuerte gratis (que se corta) a la paga**.

---

## 2. Cuánto se gana por segmento (ejemplos en pesos)

### Comercio chico (micro) — le cobrás $9.900/mes
| Si tenés… | Te cuesta | Cobrás | Ganás | Te queda |
|---|---|---|---|---|
| 6 comercios | $54.000 | $59.400 | $5.400 | empatás (piso) |
| 50 | $54.000 | $495.000 | $441.000 | 89% |
| 200 | $121.500 | $1.980.000 | $1.858.500 | 94% |
| 500 | $162.000 | $4.950.000 | $4.788.000 | 97% |
| 1.000 | ~$540.000 | $9.900.000 | ~$9.360.000 | 94% |

**Break-even con 6 comercios.** Condición dura: **self-serve** (que se instale y use solo lo más posible)
para que el tiempo del equipo rinda para muchos.

### Pyme (6–20 empleados) — le cobrás $25.000–$50.000/mes (promedio $37.000)
| Si tenés… | Te cuesta | Cobrás | Ganás | Te queda |
|---|---|---|---|---|
| 10 pymes | $121.500 | $370.000 | $248.500 | 67% |
| 50 | $270.000 | $1.850.000 | $1.580.000 | 85% |
| 100 | $540.000 | $3.700.000 | $3.160.000 | 85% |

**La plata buena:** paga 3–5× el micro, el costo apenas sube, y la prima por rubro (estética/gastro/retail)
se cobra 2–3×.

### Cliente grande (enterprise) — le cobrás $500.000–$2.000.000/mes
Como la atención/puesta en marcha las pone el equipo, al cliente grande le queda **solo el sistema dedicado**
(~$202.500/mes; $945.000 si quiere garantía firmable por contrato).
| Le cobrás | Te cuesta (sistema dedicado) | Ganás | Te queda |
|---|---|---|---|
| $500.000 | $202.500 | $297.500 | 60% |
| $1.000.000 | $202.500 | $797.500 | 80% |
| $2.000.000 (garantía firmable) | $945.000 | $1.055.000 | 53% |

**En plata cierra muy bien.** El límite ya no es el costo (ver §4).

---

## 3. En una frase
**En pesos, los tres segmentos cierran.** Gasto fijo para arrancar confiable: **$54.000/mes**. Micro =
motor de volumen (~90% margen, empatás con 6); pyme = motor de margen (~85%, la plata buena); cliente grande
= muy rentable en plata (50–80%) **porque la mano de obra la pone el equipo, no la caja**.

---

## 4. ⚠️ ADVERTENCIA — la mano de obra humana es el límite real (a vigilar SIEMPRE)

**Los números de arriba dan bien porque la implementación, el soporte y la guardia los cubre el equipo del
proyecto (no entran como costo en pesos). Esa decisión es correcta HOY, pero esconde el verdadero cuello de
botella: NO es la plata, es el TIEMPO del equipo (somos 3).**

- **Cada cliente grande come muchas horas** (puesta en marcha + soporte + estar disponible). Con 3 personas se
  atiende **de a poco (1–2 a la vez)**, no en masa. Sumar clientes grandes sin sumar gente = **quemar al equipo
  o bajar la calidad** (y en un incidente sin cubrir, se daña la reputación).
- **El micro solo rinde si es self-serve.** El día que un micro-cliente necesita atención humana dedicada,
  **deja de ser rentable** — no por el server (centavos), sino por el tiempo que consume.
- **La guardia 24/7 no existe hoy.** "No nos caemos" se sostiene con **código ($0) + Telegram + rollback en 1
  clic + runbook**, no con gente de guardia. Prometer un SLA firmable con tiempos de respuesta **exige**
  contratar esa guardia — y ahí sí reaparece el costo de ~$4.000.000/mes que hoy no contamos.

**Regla de gestión (norma):** la mano de obra se va **sumando según la demanda**, pero **cada vez que se
suma un cliente que exige atención humana significativa (todo enterprise; micro/pyme que dejan de ser
self-serve), se ADVIERTE y se decide explícitamente** si el equipo tiene capacidad o hay que contratar. La
capacidad humana se trata como un **recurso escaso con techo**, igual que la concurrencia de sesiones. **Ante
la duda: advertir antes de comprometer.** El costo oculto que hay que hacer visible en cada alta grande es
**cuántas horas/semana del equipo se compromete**, no cuántos pesos de server.

---

## 5. Supuestos y data que falta (para no vender humo)
- Dólar ~$1.350 (a confirmar). Precios de proveedores 2026 — reconfirmar.
- El costo a 500–1.000 comercios depende del **consumo real de Neon** (storage/compute), **todavía sin medir**
  en el panel — relevarlo antes de escalar.
- **Dato #1 que falta: CAC (cuánto sale conseguir cada cliente) y churn (cuántos se quedan)** — se mide con
  Magra / Break Point / CH antes de escalar el precio.
- La **carga de soporte por cliente** (horas/semana) es la variable que decide si el volumen absorbe el tiempo
  del equipo — medirla desde el primer cliente pago.

— Elaborado por GSG (PMO)
