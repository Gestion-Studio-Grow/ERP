# 🧭 Decisiones del set Empresa — delegadas al criterio de S5 (2026-07-08)

> **Qué es:** el registro de las **2 decisiones abiertas del set Empresa** que el dueño **delegó** en S5
> (Juicio Crítico, Opus) al autorizar avanzar con el incremento Empresa base. Se dejan asentadas con su
> criterio para que sean **trazables en el repo** (ADR-008), no una decisión verbal (lección MP-15).
>
> **Decisor:** S5 por delegación del dueño · **Fecha:** 2026-07-08 · **Marco:** ADR-030 (no invertir hasta
> vender) · ADR-055 (definir ≠ construir) · ADR-059 D8 (demo anti-rechazo) · `mapa-cobertura-scope-items.md`.

---

## Decisión 1 · J59 (Cuentas a pagar con cheque diferido) — **NO construir ahora. DIFERIR con spec lista.**

**Confirmo la lectura del dueño, y la refuerzo con un segundo motivo independiente.**

J59 es la **única pantalla nueva** del set Empresa y hoy **no hay lead Empresa confirmado**. Se difiere por
**dos razones que apuntan igual**:

1. **ADR-030 (no construir hasta vender):** sin lead, construir J59 "al voleo" es invertir antes de vender.
   El costo de oportunidad va al self-serve/preset-IA (el cuello real, `costos §4`), no a una pantalla que
   nadie pidió.
2. **Es §C no autorizado (motivo que el dueño no mencionó pero pesa):** J59 requiere una **entidad de datos
   nueva** (tabla `cuentas-a-pagar` + campos de cheque diferido: fecha/banco/endoso) → una **migración
   propia = §C · Gate 2**, fuera de la única migración autorizada (`Tenant.profile`, aditiva). Construir J59
   ahora metería schema nuevo con riesgo en el mismo publish — exactamente lo que la regla de oro evita.

**Qué significa "diferida con spec lista" (definir ≠ construir, ADR-055):**
- El **descriptor queda DEFINIDO** en el backlog con su **grupo (Finanzas)** y **perfil (`enterprise`)** ya
  fijados (S4, `nav-groups.ts` → `BACKLOG_SCOPE_ITEM_NAV`/`ENTERPRISE_NAV_ITEMS` con `ready:false`).
- **No se renderiza como ítem de nav** hasta que su pantalla exista (`ready:false` → sin callejón sin
  salida, respeta MP-14 "cero click muerto"). ✅ S4 ya lo implementó así.
- **Se despierta** cuando aparezca el **primer lead Empresa**: se construye como su propia
  `/sesion-feature` con **su migración + su Gate**, no antes.

**Criterio de aceptación para el Gate del publish:** ningún ítem Empresa sin pantalla real (`ready:false`)
debe renderizarse en la nav. El set Empresa que publica hoy es **perfil encendible + home analítico +
persistencia**, **sin** pantallas CRUD nuevas.

---

## Decisión 2 · Tenant de demo Empresa para la vidriera de venta — **SÍ, en DESARROLLO. Confirmado.**

**Confirmo el camino del dueño.** Es la jugada correcta y de libro:

- **ADR-030 (demo costo cero):** la demo **ES** la herramienta de venta y **no cuesta nada** — no hay que
  vender primero para tenerla, habilita mostrar/vender el perfil Empresa ya.
- **ADR-059 D8 (anti-rechazo enterprise):** prescribe **exactamente** demostrar Empresa sobre "un tenant de
  **su** rubro/tamaño (**nunca la carnicería**) y con **su** marca/subdominio". Un demo Empresa con rubro y
  marca de ejemplo es la materialización de esa regla.

**Barandas del criterio (para que la demo no se convierta en riesgo):**
1. **DEV / demo únicamente — jamás prod.** No toca Neon prod, no ensucia el aislamiento RLS de los tenants
   reales. Vive en el deploy de demo / local. (Se mantiene el límite duro de no tocar prod.)
2. **Rubro y marca de EJEMPLO, no de un cliente real** (ni CH, ni Magra, ni Shine, ni A Dos Manos) y
   **nunca la carnicería** (anti-patrón explícito de D8). Elegir un ejemplo que cuente la historia Empresa
   (p. ej. una distribuidora/mayorista genérica).
3. **Sin datos reales** (catálogo/clientes ficticios), **sin fiscal real** (nada de ARCA homologado),
   **banda "modo demo" visible**.
4. **Mecanismo:** con la columna `Tenant.profile` ya disponible en dev, lo más completo es un **tenant real
   de dev con `profile = enterprise`** (ejercita el path real de persistencia para la verificación de S4);
   la alternativa cero-DB es el **override en memoria por `slug`** (`PROFILE_OVERRIDES` en
   `getActiveProfile`, ya scaffolded) si alcanza para la vidriera. Cualquiera de los dos es válido; para la
   **verificación visual de S4** conviene el tenant de dev real.

**Encargo ya en curso:** el dueño lo asignó a S3 (montar el tenant demo) para que **S4 verifique** el perfil
Empresa sobre él. Coherente con esta decisión.

---

## Cómo impacta el publish (resumen)

- El **set Empresa base** que se publica = **P0 perfil encendible + P1.c home analítico + persistencia
  `Tenant.profile`** (migración aditiva) + verificación de S4. **Sin pantallas nuevas** (J59/J58/BMK
  diferidas, `ready:false`, no renderizan).
- **§C que se ejecuta en el publish:** solo la migración **aditiva** de `Tenant.profile` (default Comercio).
- **§C que sigue elevado / no se toca:** entidades nuevas de Empresa (J59 y cía.), Neon plan pago, cert ARCA.

— Registrado por S5 (Juicio Crítico, Opus), por delegación del dueño · refs MP-15, ADR-030, ADR-055, ADR-059 D8.
