# 🔬 Estándar de QA — Preview real (Vercel, NO prod) + checklist click-por-click

> **Por qué existe:** el estándar de calidad GSG (equipo experto) NO se cumple con tsc+tests: exige QA
> **click-por-click en navegador** con los flags **ON**, sobre un entorno real. En el worktree eso no corre
> (Turbopack rechaza el `node_modules` symlinkeado). Este runbook deja **al borde** cómo montar un **Vercel
> Preview** (efímero, aislado de prod) con flags ON y el **checklist por pantalla** que se tilda antes de
> consolidar/encender. **El deploy del preview lo dispara el dueño**; acá queda todo listo.
>
> **Regla dura:** el preview **NUNCA** apunta a prod. Corre sobre una **Neon dev branch** aislada → se pueden
> aplicar migraciones y sembrar el tenant demo Empresa **sin tocar prod** (§C de prod intacto).
> **Autor:** S5 (Confiabilidad + Gate, Opus).

---

## PARTE A — Montar el PREVIEW real (aislado, $0, sin tocar prod)

### 🔘 EL BOTÓN — Magra lista en preview en 6 pasos (los ejecuta el DUEÑO; el agente NO toca DB/deploy)
> Todo contra una **Neon dev branch de QA** (NUNCA prod). Requiere la cuenta del dueño (secretos + Vercel).
```bash
# 1. Neon → crear dev branch "qa-empresa" desde main y copiar su connection string.
export QA_DB="postgres://…qa-empresa…"          # ← debe tener 'dev'/'qa'/'preview' en la URL (baranda del seed)

# 2. Aplicar TODA la cola de migraciones a la dev branch (incl. Supplier/Collection/AccountPayable/
#    AccountReceivable/DEVOLUCION_PROVEEDOR). Es dev → seguro.
DATABASE_URL="$QA_DB" npx prisma migrate deploy

# 3. Re-ejecutar RLS (data-driven) para que las TABLAS NUEVAS reciban su policy.
DATABASE_URL="$QA_DB" psql "$QA_DB" -f prisma/rls/0001_enable_rls.sql   # o el runner de RLS del repo

# 4. Sembrar Magra (idempotente; nace como Comercio).
DATABASE_URL="$QA_DB" npm run seed:magra

# 5. En Vercel (scope PREVIEW): setear las env vars de §A.2 (DATABASE_URL=$QA_DB, PROFILES_ENABLED=on,
#    NAV_GROUPING_ENABLED=on, TENANT_HOST_MAP=<host>=magra-demo, secretos de QA) y disparar el Preview
#    (push de la rama o `vercel` sin --prod). Abrir la Preview URL y entrar a magra-demo.

# 6. Para QA de Empresa (mismos datos): flipear el perfil y recargar.
DATABASE_URL="$QA_DB" MAGRA_PROFILE=enterprise npm run flip:magra   # ...y `MAGRA_PROFILE=lite` para volver
```
> **Nada de esto toca prod, ni gasta plan pago de Neon** (dev branch es gratis en Hobby). Al terminar: §A.4.

### A.0 Principio
Un **Vercel Preview** es un deploy efímero por rama/commit, con su **propio set de Environment Variables**
(scope *Preview*, separado de *Production*). Lo apuntamos a una **Neon dev branch** (copia aislada, gratis en
Hobby) donde SÍ podemos migrar y sembrar. Así el QA es real **y** prod queda congelado.

### A.1 Base de datos del preview — Neon dev branch (aislada)
1. En Neon → **crear una branch de dev** desde `main` (ej. `qa-empresa`). Es una copia aislada; **no** es prod.
2. Copiar su connection string (rol owner o app; para el preview de QA alcanza el rol owner de la branch).
3. **Aplicar migraciones a la dev branch** (seguro: es dev, no prod):
   ```
   DATABASE_URL="<dev-branch-url>" npx prisma migrate deploy
   ```
   Esto aplica toda la cola pendiente **en dev** (incluida `add_tenant_profile` y el Decimal de facturas) —
   sin riesgo, son datos de dev. *(En prod esa cola sigue FRENADA hasta la decisión A/B del dueño; acá no.)*
4. **Sembrar datos de QA** en la dev branch — **el ejemplo elegido por el dueño es MAGRA** (carnicería /
   mostrador), que sirve para QA de **AMBOS perfiles sobre los mismos datos**:
   ```
   DATABASE_URL="<dev-branch-url>" npm run seed:magra     # = tsx prisma/seed-magra.ts → tenant "magra-demo" (Comercio por default)
   ```
   Siembra idempotente (re-correr = resetear la demo, no toca otros tenants). Deja el tenant **`magra-demo`**
   con los datos del §A.1-bis. Nace como **Comercio** (`profile=lite`).
   > *(El `seed-demo-empresa.ts` genérico sigue disponible, pero para esta ola el tenant de recorrido es
   > **Magra**, por decisión del dueño.)*
5. **Flipear el perfil para QA de Empresa** (SIN perder los datos sembrados):
   ```
   DATABASE_URL="<dev-branch-url>" npm run flip:magra                         # alterna Comercio ⇄ Empresa
   DATABASE_URL="<dev-branch-url>" MAGRA_PROFILE=enterprise npm run flip:magra # fija Empresa
   DATABASE_URL="<dev-branch-url>" MAGRA_PROFILE=lite       npm run flip:magra # fija Comercio
   ```
   El flip solo cambia `Tenant.profile` (no re-siembra) → se alterna cuantas veces haga falta durante el QA.

### A.1-bis · Qué queda sembrado en `magra-demo` (datos ficticios, banda "DEMO")
- **8 productos** (cortes por kg, con precio Y costo → habilitan margen y valuación de inventario). **2 con
  STOCK BAJO** a propósito: **Vacío** (2 kg ≤ umbral 6) y **Carne picada especial** (3 kg ≤ umbral 10) →
  el inventario debe marcarlos como faltante.
- **2 proveedores:** *Frigorífico El Novillo SA* y *Distribuidora Sur SRL* (con CUIT).
- **2 compras** con ítems y costo (alimentan la valuación y las cuentas a pagar).
- **2 ventas:** un mostrador **pagado** (efectivo) y un pedido a *Rotisería La Esquina* con **cobro parcial**
  (seña de $50.000, saldo pendiente).
- **2 cuentas a pagar:** una de **$815.000 con un CHEQUE DIFERIDO** de $400.000 (banco Nación, vence en ~20
  días, estado *entregado/DELIVERED*, aún sin acreditar) y una **VENCIDA** de $319.500 (venció hace 3 días,
  con un pago parcial de $100.000 → saldo $219.500, aging **OVERDUE**).
- **2 fiados (cuentas a cobrar):** uno de *Rotisería La Esquina* ($115.000, con cobro parcial de $40.000, con
  vencimiento) y uno **light** de *Vecina — María G.* ($8.500, **sin vencimiento** → aging NO_DUE_DATE,
  perfil Comercio).

### A.2 Environment Variables del preview (Vercel → Settings → Env Vars → scope **Preview**)
Mismos nombres que prod (`.env.vercel.template`), con estos valores/diferencias para QA:

| Variable | Valor en el PREVIEW | Nota |
|---|---|---|
| `DATABASE_URL` | **dev branch** (A.1) | **NUNCA** la de prod |
| `OPERATOR_DATABASE_URL` | dev branch (rol owner) | operador cross-tenant en dev |
| `AUTH_SECRET` / `OPERATOR_SECRET` / `OPERATOR_PASSWORD` | valores de QA (no los de prod) | secretos los pega el dueño |
| `RLS_ENFORCEMENT` | `on` | QA con el mismo candado que prod |
| `TENANT_HOST_MAP` | `<preview-host>=magra-demo` | un solo tenant (Magra) sirve AMBOS perfiles vía flip (§A.1 paso 5) |
| **`PROFILES_ENABLED`** | **`on`** | 🔑 enciende el perfil (Comercio/Empresa) para QA |
| **`NAV_GROUPING_ENABLED`** | **`on`** | 🔑 enciende la nav agrupada de 5 grupos |
| `UPGRADE_TEASER_ENABLED` | **off** | D3: candados nunca por default, ni en QA salvo que se pruebe explícito |
| `CRON_SECRET` | un valor de QA | protege los crons |
| `ARCA_INVOICING_ENABLED` | `off` | ARCA real fuera del preview |
| `MP_WEBHOOK_SECRET` / `RESEND_*` | opcional | solo si se testea cobro/mail (modo simulado sin ellas) |

> `FORCE_TENANT_SLUG` **no** setear (rompería el multi-tenant salvo que quieras un preview de 1 solo tenant).

### A.3 Disparar el preview (acción del dueño)
- **Opción CLI:** `vercel` (sin `--prod`) sobre la rama `claude/sprint-startup-generic-rf6x0m` → genera una
  **URL de preview** (`<proyecto>-<hash>.vercel.app`). Requiere la cuenta del dueño (no hay CLI autenticado
  en la sesión del agente).
- **Opción dashboard:** push de la rama → Vercel crea el Preview Deployment automáticamente (si el proyecto
  tiene previews on) → abrir la Preview URL.
- Agregar los hosts del `TENANT_HOST_MAP` como dominios del preview, o usar la preview URL con el apex
  mapeado a un tenant.

### A.4 Rollback / limpieza
El preview es efímero: al terminar el QA, **borrar la Neon dev branch** (limpia los datos de QA) y el
deployment de preview. Cero costo, cero rastro en prod.

---

## PARTE B — Checklist de QA por pantalla (se tilda antes de consolidar/encender)

> **Cómo se corre:** entrar por el host del **tenant Comercio** y recorrer TODA la lista; repetir por el host
> del **tenant Empresa**; repetir cambiando de **rol** (OWNER · RECEPTION · PROFESSIONAL). Un ítem que no
> aplica → **N/A + por qué**. Cualquier ✗ bloquea la consolidación de esa pantalla.

### B.0 Transversal (aplica a CADA pantalla)
- [ ] **Funcional:** carga sin error (consola limpia); la **acción principal** funciona y **persiste** (recargar y sigue).
- [ ] **Sin callejón sin salida (MP-14):** ningún link/botón lleva a 404 o ruta protegida; los ítems Empresa `ready:false` (J59/J58/BMK) **NO se renderizan**.
- [ ] **Perfil Comercio vs Empresa:** en Comercio se ve el set base; en Empresa se ve el base **+** lo aditivo (nunca *menos* — invariante `enterprise ⊇ lite`).
- [ ] **Nav agrupada (flag ON):** los ítems caen en su grupo correcto (Operación · Clientes · Inventario y compras · Finanzas · Configuración); orden estable.
- [ ] **Tier neutro:** el badge de edición (Comercio/Empresa) es **neutro** (texto+forma), nunca con el color de acento del tenant.
- [ ] **Roles:** cada rol ve SOLO lo que su capability permite (un PROFESSIONAL no ve Usuarios/Auditoría/Módulos).
- [ ] **Estado vacío:** sin datos → se muestra el `EmptyState` (mensaje + acción), **no** una tabla rota ni un crash.
- [ ] **Visual/tokens:** sin hex sueltos; densidad correcta (Comercio espacioso / Empresa denso); **responsive** (mobile/desktop) y **dark/light** OK.
- [ ] **A11y + argentino:** labels/ARIA reales, foco visible, contraste AA; textos en **criollo claro** (no jerga), fiscal/pago/WhatsApp donde corresponde.

### B.1 Por pantalla (rutas reales del backoffice)
| Pantalla | Chequeo funcional específico | Perfil |
|---|---|---|
| **Dashboard `/admin`** (home analítico) | KPIs cargan con dato real; home **por rol**; Empresa ve el home analítico, Comercio el curado | ambos |
| **Agenda `/admin/turnos`** (+ `/lista`) | crear/mover/cancelar turno; vista lista | ambos |
| **Clientes `/admin/clientes`** (+ `/[id]`) | alta/edición; ficha del cliente | ambos |
| **Lista de espera `/admin/espera`** | agregar/quitar; estados | ambos |
| **Pedidos `/admin/pedidos`** | crear pedido; estados/canal | ambos |
| **Caja `/admin/caja`** | abrir/cerrar sesión; movimientos; venta en efectivo mueve caja | ambos |
| **Catálogo `/admin/catalogo`** | alta producto/servicio; precio; unidad de venta | ambos |
| **Compras `/admin/compras`** | **Empresa: orden formal (J45/18J)** — crear orden, proveedor, ítems; **Comercio: reposición simple** | Comercio + Empresa (profundiza) |
| **Ajustes y mermas `/admin/ajustes`** | ajuste de stock, merma; anti-oversell (no deja vender bajo cero) | ambos |
| **Reseñas `/admin/resenas`** | moderar/publicar | ambos |
| **Recordatorios `/admin/recordatorios`** | config por servicio; el cron dead-letter no rompe el lote | ambos |
| **Facturación `/admin/facturacion`** | estado por factura (pendiente/CAE/rechazada); **idempotencia:** un pago no genera factura duplicada | ambos |
| **Reportes `/admin/reportes`** | **Empresa: margen por producto (16T)**; Comercio: reportes base | Comercio + Empresa (profundiza) |
| **Auditoría `/admin/auditoria`** | log de acciones; solo roles con `audit:read` | ambos (gateado por rol) |
| **Usuarios `/admin/usuarios`** | alta/edición de usuarios; solo OWNER | ambos (gateado por rol) |
| **Localización `/admin/localizacion`** | datos del negocio; CBU/alias (BFA absorbido acá) | ambos |
| **Módulos `/admin/modulos`** | OWNER prende/apaga módulos; el cambio se refleja en la nav | ambos |

**Chequeos específicos con los datos de Magra (§A.1-bis):**
- **Reportes → margen (16T):** el margen se calcula sobre los 8 cortes (precio − costo); *Carne picada* y
  *Pollo* dejan menos margen % que *Lomo* — ordenar y verificar.
- **Compras:** las 2 compras aparecen con su proveedor (*Frigorífico El Novillo* / *Distribuidora Sur*).
- **Caja/Pedidos:** el pedido pagado en efectivo movió caja; el pedido de *Rotisería* quedó con saldo.

### B.1-bis · Módulos avanzados de Empresa — estado REAL (backend listo, pantalla pendiente)
> **Honestidad de alcance:** la **capa de datos y los loaders/servicios** de estos módulos están construidos
> y con datos sembrados en Magra, pero **sus pantallas `/admin/*` todavía NO existen** (otro carril) → sus
> ítems de nav están **`ready:false` y NO se renderizan** (regla anti-dead-end). Por eso, **en este preview
> el QA de Empresa NO puede navegarlos por la UI todavía**. Qué SÍ se puede verificar hoy:

| Módulo (D#) | Estado UI | Qué QA puede verificar hoy | Dato sembrado en Magra |
|---|---|---|---|
| **Cuentas a pagar `/admin/cuentas-a-pagar`** (D2) | 🔨 pantalla pendiente (`ready:false`) | datos + loaders (`listPayables`/`getPayableDetail`): saldo, **aging OVERDUE**, **cheque diferido** | 1 vencida ($219.500 saldo) + 1 con cheque diferido $400.000 |
| **Cuentas a cobrar `/admin/cuentas-a-cobrar`** (D3) | 🔨 pendiente | `listReceivables`/`getReceivableDetail`: saldo, aging, historial de cobros | fiado $75.000 saldo + fiado light $8.500 |
| **Libros / Exportar al contador `/admin/libros`** (D7) | 🔨 pendiente | (export deriva de facturas/ventas) | ventas + (facturación si se prueba) |
| **Devoluciones a proveedor `/admin/devoluciones-proveedor`** (D4) | 🔨 pendiente | `recordSupplierReturn` (stock + crédito en CxP), `listSupplierReturns` | — (se genera al probar el servicio) |
| **Inventario `/admin/inventario`** (D5) | 🔨 pendiente | `getInventoryValuation`: niveles + valuación + **stock bajo** | 8 productos, **2 en faltante** (Vacío, Carne picada) |

**Cuando esas pantallas landeen** (otra ola), se cambia su `ready:true` y este QA se completa por UI con
estos mismos datos. Hasta entonces, el QA de Empresa cubre: **flip de perfil** (badge "Empresa" + home
analítico), **profundización de Compras/Reportes** (que sí tienen pantalla), y la **verificación de datos**
de arriba (por los loaders / el Gate revisa el backend).

### B.2 Recorridos end-to-end (viaje de usuario, no solo "carga")
- [ ] **Comercio (lite):** entrar a `magra-demo` (perfil Comercio) → vender un corte en mostrador
  (`/pedidos`+`/caja`) → cobrar → facturar (Factura C) → ver en Facturación. Set lite de carnicería (pos,
  catálogo, clientes, reportes, arca, ajustes) **sin** pantallas de servicios (agenda/espera/comisiones).
- [ ] **Empresa (enterprise):** `npm run flip:magra` a Empresa → recargar → **badge "Empresa" + home
  analítico**; orden de compra formal a *Frigorífico El Novillo* (`/compras`) → recibir stock (`/ajustes`) →
  ver **margen** (`/reportes`) → **todo lo de Comercio sigue estando** (invariante `enterprise ⊇ lite`).
  *(Los módulos de deuda/inventario avanzados: ver B.1-bis — datos listos, pantalla pendiente.)*
- [ ] **Cambio de perfil sobre los MISMOS datos:** flipear Comercio ⇄ Empresa con `npm run flip:magra` y
  confirmar que Magra alterna la edición **sin perder ni cambiar** un dato (las ventas/fiados/compras siguen
  igual) — es la prueba viva de "crecé sin migrar".

---

## Salida del QA
- QA **verde** por pantalla × perfil × rol → insumo del **Gate de Excelencia (Opus)** de la ola.
- Cualquier ✗ → hallazgo con captura + pasos → vuelve a la célula dueña; **no se consolida** esa pantalla.
- El QA **no reemplaza** el Gate: lo alimenta (bloque 1 Auditoría SAP Fiori + bloque 4 Confiabilidad).

— Elaborado por GSG (S5 · Confiabilidad + Gate).
