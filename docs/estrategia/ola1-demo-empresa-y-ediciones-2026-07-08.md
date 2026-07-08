# 🏢 Ola 1 — Spec del demo Empresa · Ediciones Comercio/Empresa · Criterios de aceptación

**Qué es:** los 3 entregables del carril docs de la **Ola 1** del plan del próximo tramo
(`plan-proximo-tramo-2026-07-08.md`): (1) el spec del **tenant demo Empresa** alineado al seed que dejó S5
(`prisma/seed-demo-empresa.ts`), (2) la **tabla de ediciones Comercio vs Empresa** (qué ve/qué puede cada
perfil, describiendo el comportamiento **real ya en la rama**), y (3) los **criterios de aceptación** de la
Ola 1.

**Autor:** Analista de mercado local (Consultores) · **Fecha:** 2026-07-08 · **Rama:**
`claude/sprint-startup-generic-rf6x0m` (sprint) · **Naming:** Comercio/Empresa (nunca lite/enterprise al
cliente) · **Sin Neon, sin merge a main, sin tocar código de otras sesiones.**

---

## 1. Spec del tenant demo Empresa

**Propósito:** la vidriera de venta del perfil Empresa (ADR-059 D8, ADR-030 demo costo cero) y el banco de
prueba de S4 sobre el path real de persistencia. **Rubro y marca de EJEMPLO** — jamás un cliente real ni la
carnicería (anti-patrón D8).

### 1.1 Identidad del tenant (autoritativo: `prisma/seed-demo-empresa.ts`)

| Campo | Valor | Por qué |
|---|---|---|
| `slug` | `demo-empresa` | Clave de upsert (idempotente) |
| `name` | **Distribuidora Demo — Empresa** | Una **distribuidora mayorista** cuenta la historia "Empresa" (proceso completo: compras, cuentas, reportes) sin parecerse a ningún tenant real |
| `profile` | `enterprise` (**edición "Empresa"**) | Ejercita el path real de persistencia `Tenant.profile` |
| `blueprintId` | `generico` | Rubro neutro; no colisiona con servicios/carnicería/velas/pádel reales |
| `accentPreset` | `indigo` | Acento de marca **del tenant** (el tier NO usa el acento — canal neutro, D5) |
| `frontTheme` | `light` | — |
| `status` | `TRIAL` | Es demo, no cliente pago |

**Marca de ejemplo (ficticia, para la vidriera):** "Distribuidora Demo" — mayorista genérica (rubro
`generico`). Paleta indigo. Sin logo real (monograma "D" sobre el acento, como cualquier tenant sin asset).
Todos los datos de negocio son **ficticios** y llevan **banda "modo demo" visible**; **sin fiscal real**
(nada de ARCA homologado).

### 1.2 Cómo recrearlo (en dev, manual — NO corre en el publish)

```
# 1. Migración de perfil aplicada en la DB de dev (aditiva, default Comercio):
DATABASE_URL="<dev>" npx prisma migrate deploy      # incluye add_tenant_profile

# 2. Seed idempotente del tenant demo Empresa:
DATABASE_URL="<dev>" npx tsx prisma/seed-demo-empresa.ts
#   → upsert por slug; re-fija profile/marca en cada corrida; no borra nada.
#   → baranda dura: aborta si DATABASE_URL parece prod (neon.tech|prod|production).

# 3. Encender el motor de perfiles para VER la edición Empresa en el shell:
#    PROFILES_ENABLED=1  (y NAV_GROUPING_ENABLED=1 si se quiere la nav agrupada)
#    Entrar por el slug/subdominio `demo-empresa` en dev con un usuario OWNER.
```

**Alternativa cero-DB (si solo se necesita la vidriera visual, sin persistencia real):** override en memoria
por `slug`/`tenantId` vía `PROFILE_OVERRIDES` en `src/lib/profile-gating.ts` (ya scaffolded, hoy vacío). Para
la **verificación visual de S4 conviene el tenant de dev real** (ejercita persistencia); el override es el
atajo si alcanza con mostrar.

> **⚠️ Provisional a confirmar (§C·C3, decisión del dueño):** el rubro (distribuidora/genérico) y la marca
> ("Distribuidora Demo") son de **ejemplo elegido por el equipo** para contar la historia Empresa. Si el
> dueño prefiere otro rubro/marca de vidriera (p. ej. uno más cercano al lead Empresa que aparezca), se
> cambia en **un solo lugar** (`DEMO_EMPRESA` en el seed). No bloquea la Ola 1.

### 1.3 Fixtures de negocio (estado actual y qué falta)

**Hoy el seed crea SOLO el tenant** (perfil + marca), **sin catálogo/clientes/ventas ficticios**. Para que
la demo Empresa **cuente la historia completa** (home analítico con cifras, Compras con órdenes, Reportes
con rentabilidad) hace falta un set de fixtures ficticios. **Propuesta de fixtures mínimos** (los materializa
quien monte el seed de datos — S3/S4 según carril, no este carril docs):

- **Catálogo:** ~8–12 productos mayoristas genéricos (ej. "Caja x12 unidades", con costo y precio → para que
  Reportes muestre **margen/rentabilidad** real).
- **Clientes:** ~5 clientes ficticios (comercios que le compran a la distribuidora).
- **Compras/stock:** ~3 movimientos de reposición (para que Compras → órdenes formales tenga qué mostrar y
  el stock no esté en cero).
- **Ventas:** ~10–15 pedidos/ventas de los últimos 7 días (para poblar "Ingresos 7 días" y "Confirmación
  hoy" del home analítico).

> Marcado **provisional**: los volúmenes son una guía de "suficiente para que ningún panel se vea vacío"
> (evita `EmptyState` en la demo de venta), no un requisito duro. Ajustar al armar el seed de datos.

---

## 2. Tabla de ediciones — Comercio vs Empresa

Describe el comportamiento **real ya en la rama** (P0 perfil + P1.c home analítico + badge de edición). El
invariante **`enterprise ⊇ lite`** manda: **Empresa nunca ve menos que Comercio** — solo *igual o más*.

### 2.1 Qué VE cada edición

| Superficie | **Comercio** (lite) | **Empresa** (enterprise) | Nota |
|---|---|---|---|
| **Badge de edición** (header) | "Comercio" en canal **neutro** (ProfileBadge, sin acento) | "Empresa" en canal **neutro** | Solo si el motor está ON; el acento sigue siendo del tenant (D5/D7). Con motor OFF, header legado sin badge |
| **Home / Dashboard** | Home **de una acción**: "Resumen del día" + botón sólido "+ Nuevo turno" (héroe). KPIs: Turnos hoy · Pendientes · Ingresos 7d *(si OWNER)* · Clientes | Home **analítico** (solo OWNER/visión financiera): "Vista analítica del negocio", la acción cede a **outline**. KPIs liderando lo financiero: **Ingresos 7d** (sub "ver rentabilidad") · **Confirmación hoy %** · Turnos hoy · Clientes | Re-layout sobre los **mismos datos** (`getDashboardData`), sin consulta nueva. Roles operativos (no-OWNER) ven el home de una acción **en ambas ediciones** |
| **Navegación** | Los ítems del piso que su rol/rubro habilita (OWNER servicios: hasta 17; RECEPTION: ~6) | **Los mismos ítems del piso** (OWNER Empresa = 17 en 5 grupos, RECEPTION = 6) **+ 0 ítems enterprise hoy** | Los ítems enterprise (cuentas-a-pagar/contabilidad/devoluciones) están `ready:false` → **no renderizan** hasta tener pantalla (regla de oro anti-dead-end). Por eso hoy la nav Empresa = Comercio |
| **Grupos de nav** | 5 grupos de negocio (Operación · Clientes · Inventario y compras · Finanzas · Configuración) | Idénticos | Solo con `NAV_GROUPING_ENABLED` ON; si OFF, nav plana legada |

### 2.2 Qué PODRÁ cada edición cuando la Ola 1 profundice pantallas (aditivo, mismo href)

| Capacidad | **Comercio** | **Empresa** | Estado |
|---|---|---|---|
| **Compras / reposición** | Reposición simple (sumar stock) | **+ órdenes formales a proveedor** (razón social, CUIT, N° de orden) | P1.a Ola 1 — profundiza `/admin/compras`, **sin ítem nuevo** |
| **Reportes** | Ingresos y métricas básicas | **+ rentabilidad/margen por producto** | P1.b Ola 1 — profundiza `/admin/reportes`, **sin ítem nuevo** |
| **Home** | De una acción | Analítico por rol | ✅ ya en la rama (P1.c) |

### 2.3 Qué NO cambia entre ediciones (para no vender humo)

- **Seguridad y datos:** el perfil **NO** es una barrera de seguridad (eso es el rol/capability, ADR-017).
  Empresa no "desbloquea" datos que el rol no permita. Un OWNER Comercio y un OWNER Empresa tienen el mismo
  poder sobre los datos; cambia la **presentación** y (en la Ola 1) la **profundidad** de Compras/Reportes.
- **Pantallas enterprise-only nuevas (J59 Cuentas a pagar, J58 Contabilidad, BMK Devoluciones):** **NO
  existen todavía** — diferidas (`ready:false`), no las ve ninguna edición. J59 espera lead real (§C).
- **Invariante:** subir de Comercio a Empresa es **aditivo** — nunca se quita ni se esconde lo que Comercio
  ya hacía.

---

## 3. Criterios de aceptación de la Ola 1

La Ola 1 se acepta cuando **todo** lo siguiente es verdad (recorrido clic-por-clic, no solo "carga"):

### 3.1 Demo Empresa mostrable
- [ ] El seed corre en dev de forma idempotente y deja `demo-empresa` con `profile="enterprise"`; con
      `PROFILES_ENABLED=1` el shell muestra el **badge "Empresa"** (canal neutro) y el **home analítico**.
- [ ] La demo tiene fixtures ficticios suficientes para que **ningún panel se vea vacío** (home con cifras,
      Compras con movimientos, Reportes con rentabilidad) — o, si quedan vacíos, muestran `EmptyState`
      intencional, no un panel roto.
- [ ] **Cero dato real, cero fiscal real, banda "modo demo" visible.** La baranda anti-prod del seed
      funciona (aborta si la URL parece prod).

### 3.2 Empresa vale demostrablemente más que Comercio, sin callejones sin salida
- [ ] **≥2 diferencias reales** operan de punta a punta: **Compras → órdenes formales** y **Reportes →
      rentabilidad** (ambas sobre su pantalla existente, mismo href), **+ home analítico** ya presente.
- [ ] **Ningún ítem de nav lleva a una ruta inexistente** (los enterprise `ready:false` no renderizan). QA
      recorre Comercio y Empresa clic por clic y **no encuentra ningún dead end**.
- [ ] **Invariante `enterprise ⊇ lite` en verde**: dump/property-test confirma que Empresa ve **⊇** lo de
      Comercio (OWNER Empresa = 17 ítems; RECEPTION = 6; 0 enterprise), idéntico a lite y a motor-OFF.

### 3.3 Comercio sigue vendible (los 4 tenants reales) + base confiable
- [ ] **Set lite por rubro** (S3): servicios/carnicería/genérico no muestran pantallas que el rubro no usa;
      los 4 tenants reales siguen operando igual o mejor.
- [ ] **Hardening $0** (S5): `/api/ready` responde; webhook MP idempotente (test); cron con dead-letter
      (test). El 90% de "no nos caemos" por código.

### 3.4 Reversibilidad y verdes
- [ ] Con `PROFILES_ENABLED` OFF (default), el shell y el home son **byte-idénticos** al legado
      (default-off-identical) — la Ola 1 es reversible de un flag.
- [ ] Verde: `tsc` + `build` + suite de tests + `gate:rls` 33/33 + lint. Cada sesión entrega su carril
      verde en sus propios archivos (working tree compartido → pathspec, nunca `-A`).

### 3.5 Punto de Gate
- [ ] **S5 corre el Gate de Excelencia en Opus** (ADR-040) al cierre de la Ola 1 sobre el conjunto
      integrado. Recién con el Gate pasado el PMO evalúa el merge (que sigue pasando por el Gate final del
      sprint, no se mergea a `main` en esta rama).

### 3.6 Lo que NO entra en la Ola 1 (para no confundir alcance)
- Pantallas enterprise-only nuevas (J59/J58/BMK) → diferidas (§C / lead).
- Persistencia `Tenant.profile` **real en prod**, deploy público, Neon pago, pricing aprobado → **§C**, se
  elevan, no se ejecutan en la ola.
- Upgrade Comercio→Empresa real sin migrar → **Ola 2** (demo) / §C (real).

---

— Elaborado por GSG (Analista de mercado local — célula Consultores), 2026-07-08 · Ola 1, carril docs.
