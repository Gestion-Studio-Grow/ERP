# 🗺️ Roadmap — los dos modelos (micro *lite* + pyme *enterprise*) sobre un Core

> **Qué es:** el plan para bajar la filosofía **GROW-AR** (ADR-058) a producto vendible: **dos motores
> —micro `lite` y pyme `enterprise`— sobre el mismo Core**, con upgrade **aditivo** (crecé sin migrar). Con
> hitos, % de avance, criterio de terminado y qué es reversible vs. §C (se eleva al dueño).
>
> **Autor:** PMO · **Fecha:** 2026-07-08 · **Base:** ADR-058 (filosofía) · ADR-054/055 (módulos + variante) ·
> `docs/estrategia/costos-por-segmento.md` (economía) · `src/modules/` (fundación ya en repo).

---

## 0. Norte y reglas de juego

- **Objetivo:** que un comerciante entre en **`lite`** (mínimo que resuelve) y una pyme en **`enterprise`**
  (proceso completo), **sobre el mismo tenant y el mismo código**, y que subir de perfil sea **encender
  cosas, nunca migrar** (invariante **`enterprise ⊇ lite`**).
- **Reglas duras:** nada se integra sin **Gate** (ADR-040) · **no se invierte hasta vender** (ADR-030) · el
  motor de perfiles es **reingeniería** (definir ≠ construir) → se hace por hitos reversibles con su Gate ·
  migraciones/deploy/secretos/datos reales = **§C**, los aprueba/ejecuta el dueño · la **mano de obra humana
  es el límite** (`costos §4`): cada hito que sume atención humana se **advierte**.

## 1. Estado de partida (lo que YA existe — no se re-hace)

| Pieza | Estado | Dónde |
|---|---|---|
| Fundación de módulos (descriptor, registry, resolver variante, catálogo, gating nav) | ✅ en repo (detrás de flag) | `src/modules/` (ADR-054) |
| Vidriera de módulos por tenant (`/admin/modulos`, `modules:manage`) | ✅ en repo | `src/app/admin/(dashboard)/modulos/` |
| Blueprints `servicios` + `carniceria` | ✅ en `main` | `src/blueprints/` |
| Filosofía GROW-AR (dos perfiles + crecé sin migrar) | ✅ documentada | ADR-058 · `FUNDAMENTOS §10` |
| Costos por segmento + plan de confiabilidad | ✅ documentados | `docs/estrategia/costos-por-segmento.md` |

**Avance global del "motor de dos modelos": ~20%** (fundación de módulos lista; falta la capa de **perfiles**).

---

## 2. Hitos (milestones)

### 🟩 M0 · Fundamentos — **100%** (HECHO)
Filosofía GROW-AR (ADR-058), costos y confiabilidad escritos, fundación de módulos en repo, equipo
consolidado (7 charters). **Criterio de terminado:** ✅ ADR-058 + `FUNDAMENTOS §10` + roster al día.

### ⬜ M1 · Motor de perfiles `ScopeItem.{lite,enterprise}` — **0%** · *reversible (detrás de flag)*
El corazón. Extiende la fundación de módulos con la **dimensión perfil**.
- **Entregables:** tipo `ScopeItem` con `perfiles.{lite,enterprise}`; resolución del perfil **por tenant**
  (campo/flag, default `lite`); resolver que compone **módulo × rubro × perfil**; test del invariante
  **`enterprise ⊇ lite`** (un perfil enterprise nunca quita lo del lite).
- **Criterio de terminado:** dado un tenant en `lite`, la vista muestra el subconjunto; el mismo en
  `enterprise` muestra ese subconjunto **+** lo adicional; property-test del invariante en verde; todo
  **detrás de flag** (`PROFILES_ENABLED`), sin tocar prod.
- **Reversible/§C:** **reversible** (código + flag, cero datos). Si el flag del perfil se guarda en DB → esa
  columna es **§C · Gate 2** (migración aditiva, la eleva Data/DBA).
- **Dueño:** PO del Catálogo/Plugins + backoffice-ingeniería · **Gate** antes de integrar.

### ⬜ M2 · Set mínimo vendible **micro `lite`** — **0%** · *reversible*
El backoffice del comerciante: lo mínimo que resuelve, auto-servible, **hiper-personalizado por preset-IA**.
- **Entregables:** definir el **set `lite`** por rubro (arranque: `servicios` + `carniceria` + genérico):
  caja/cobros, catálogo, clientes, facturación básica (Factura C), un panel simple. Descriptores de módulo
  con su perfil `lite`. Maqueta → UI real gateada por perfil. **Alta vía preset-IA (ADR-034/ADR-058 P5):**
  cada micro arranca sintiéndose suyo (marca/catálogo por IA) — **la personalización vende el self-serve**.
- **Criterio de terminado:** un tenant `lite` opera de punta a punta (vender → cobrar → facturar) **sin
  pantallas que no usa**; pasa el Gate (SAP Fiori + ángulo argentino + sello GSG); es **self-serve** (condición
  de rentabilidad, `costos §2`).
- **Reversible/§C:** reversible (config + UI). Facturación real = §C (cert ARCA, lo enciende el dueño).
- **Dueño:** Producto por rubro + backoffice-ingeniería + Preset IA.

### ⬜ M3 · Set **pyme `enterprise`** (aditivo sobre `lite`) — **0%** · *reversible*
El backoffice de la empresa: el proceso completo, **encendido sobre** el lite, **estandarizado y con carácter**.
- **Entregables:** por cada proceso del `lite`, definir los **pasos/campos/controles adicionales** del
  `enterprise` (ej. cuentas a cobrar con vencimientos/recordatorios; roles/permisos más finos; reportes;
  aprobaciones). Todo **aditivo** — el invariante de M1 lo garantiza. **Estándar-con-carácter (ADR-058 P5):**
  a diferencia del micro, la pyme entra a un **producto opinado y consistente** (poca/nada de preset-IA) —
  baja mano de obra por cliente, da carácter de marca y refuerza el anti-rechazo enterprise (ADR-059 D8).
- **Criterio de terminado:** un tenant `enterprise` ve el proceso completo; **todo lo que hacía en `lite`
  sigue estando** (test del invariante en verde sobre los procesos reales); pasa el Gate.
- **Reversible/§C:** reversible (config + UI); cualquier tabla nueva = §C (Data/DBA).
- **Dueño:** PO del Catálogo/Plugins + backoffice-producto/ingeniería.

### ⬜ M4 · **Crecé sin migrar** — el upgrade `lite → enterprise` — **0%** · *reversible*
La promesa hecha función: subir de perfil = **un switch**, mismo tenant, cero migración de datos.
- **Entregables:** flujo de upgrade de perfil (cambiar el flag del tenant → se encienden los módulos
  adicionales); verificación de que **no se pierde ni se reescribe** ningún dato; registro/auditoría del cambio.
- **Criterio de terminado:** un tenant real de demo pasa de `lite` a `enterprise` **sin migración**, conserva
  todos sus datos, y la vista se expande; QA lo verifica como usuario real.
- **Reversible/§C:** reversible en demo; en un tenant con datos reales el switch es **§C** (lo dispara el dueño).
- **Dueño:** PO del Catálogo/Plugins + QA.

### ⬜ M5 · Confiabilidad + salida a vender — **0%** · *código reversible + 1 gasto §C*
"No nos caemos" + planes listos para la primera venta.
- **Entregables:** cerrar los **P0 de fragilidad** por código (connection_limit, idempotencia de webhook MP,
  cron con dead-letter, `/api/ready`) — el 90% a **$0** (`costos §1`); **tabla de planes** por perfil/segmento
  (Pricing & Packaging, pasa por Advisory+Challenger); demo pública de los dos modelos (costo cero, ADR-030).
- **Criterio de terminado:** hardening en verde con su Gate; tabla de planes aprobada por el dueño; demo
  navegable de `lite` y `enterprise`. **Advertencia activa:** la guardia 24/7 firmable **no** está incluida
  (reabre ~$4M/mes, `costos §4`) — se decide explícitamente si/cuándo.
- **Reversible/§C:** hardening reversible; el **plan pago de Neon** (caja fuerte con réplica) y el deploy son
  **§C** (los aprueba el dueño, disparados por la venta).
- **Dueño:** SRE on-call + Pricing & Packaging + Growth.

---

## 3. Secuencia y dependencias

```
M0 ✅ ── M1 (motor de perfiles) ── M2 (lite) ──┐
                                                ├── M4 (upgrade sin migrar) ── M5 (confiabilidad + venta)
                                    M3 (enterprise, aditivo) ─┘
```
- **M1 es el cuello:** sin el motor de perfiles, M2/M3 no tienen sobre qué gatear. Es lo primero.
- **M2 y M3 pueden solaparse** una vez M1 está firme (mismo motor, distinto set).
- **M4 depende de M2+M3** (necesita ambos perfiles para probar el salto).
- **M5 corre en paralelo** desde M2 (el hardening no espera al motor de perfiles).

## 4. Cómo se mide el avance
Cada hito tiene su **% propio** (arriba) y su **criterio de terminado** binario (cumple/no cumple). El **%
global del motor de dos modelos** es el promedio ponderado por esfuerzo: M1 pesa lo más (es el corazón). Hoy:
**~20%** (M0 hecho, fundación de módulos lista; M1–M5 por delante).

## 5. Riesgos y advertencias (a vigilar)
- **Disciplina del invariante:** si un perfil enterprise "quita" algo del lite, se rompe "crecé sin migrar".
  El property-test de M1 es la valla — no se saltea.
- **Mano de obra (costos §4):** cada cliente que exige atención humana significativa se **advierte** antes de
  comprometer; el micro solo rinde **self-serve**.
- **Datos que faltan:** CAC/churn y consumo real de Neon a escala — se miden con los primeros clientes pagos
  antes de escalar precio o infra.

— Elaborado por GSG (PMO)
