# 🔎 Fundamento — Auditoría de filosofía SAP Fiori (OBLIGATORIA, todos los ángulos)

**Regla dura:** **ningún desarrollo se integra a `main` sin pasar la Auditoría SAP Fiori completa.** Sin
excepción, para todo frente/sector, desktop y móvil. Es un **paso obligatorio del Gate de Excelencia**
(`docs/METODOLOGIA-SPRINT.md`), no un "nice to have".

**Por qué:** SAP Fiori es nuestro estándar de fondo porque codifica lo que hace que un software se sienta
**producto serio, coherente y de nivel enterprise** en vez de una suma de pantallas sueltas. Auditar
*todos* los ángulos —no solo "se ve lindo"— es lo que evita que la calidad se degrade pantalla a pantalla
a medida que muchos frentes tocan la misma app. La marca **GSG** (ver `docs/metodologia/estandar-marca-gsg.md`)
se apoya sobre esta auditoría: sin excelencia SAP no hay sello GSG.

---

## ⚖️ Excepción — RÉPLICA EXACTA del front del cliente (la fidelidad manda sobre el estándar estético)

**Regla de alcance:** cuando el trabajo es una **RÉPLICA EXACTA del sitio de un cliente**, la Auditoría
SAP Fiori (y el sello GSG) **RESPETA EL DISEÑO DEL FRONT TAL CUAL — NO le impone nuestros principios de
diseño.** La vitrina copiada es una **réplica fiel de la marca/identidad del cliente**, y la **fidelidad
al original manda por encima de nuestro estándar estético** (colores, tipografía, layout, espaciados y
wording son los del cliente, aunque no coincidan con Fiori).

- **Alcance de la excepción — SOLO el FRONT** (la vitrina/vidriera pública copiada). En modo réplica, los
  7 ángulos se auditan como **fidelidad al original + calidad técnica** (responsive no roto, links/CTAs
  funcionando, imágenes/alt, accesibilidad básica, performance) — **NO** como conformidad con nuestros
  principios estéticos. "Coherente/simple/delightful" se leen contra **el sitio original**, no contra el
  design system de GSG.
- **El BACKOFFICE NO tiene excepción.** Nuestra interfaz de gestión (producto GSG: `/admin`, `/operador`)
  pasa **SIEMPRE el Gate COMPLETO**: SAP Fiori (5 principios) + **accesibilidad** + **consistencia** +
  **sello GSG**. Ahí la excelencia es obligatoria, sin excepción.
- **El porqué:** el **front copiado ES la identidad del cliente** — copiarlo exacto **es el valor** que
  entregamos; imponerle nuestro diseño rompería la réplica y traicionaría al cliente. El **backoffice es
  producto de GSG**, y ahí va la **excelencia obligatoria** (es donde vive nuestra "mano" y nuestro
  estándar). Regla mnemotécnica: **front replicado → fiel al cliente; backoffice → estándar GSG.**

> Esto **no** debilita el Gate: lo **enfoca**. En réplica exacta, "pasar la auditoría del front" significa
> *ser fiel y técnicamente sólido*, no *parecerse a GSG*. Todo lo que sea producto GSG (backoffice,
> demos/landings propias, generador de preset) sigue con el Gate completo.

---

## Los 7 ángulos (cada uno con su chequeo concreto)

Auditá el cambio contra **los 5 principios Fiori + accesibilidad + consistencia**. Marcá cada ítem; lo
que no aplica → **N/A + por qué**.

### 1. Role-based (basado en el rol)
- [ ] Cada rol (OWNER / RECEPTION / PROFESSIONAL / operador) ve **solo lo suyo**: nada de más (ruido,
      acciones que no puede ejecutar) ni de menos (le falta lo que su tarea necesita).
- [ ] Las acciones sensibles están gateadas por capability, no solo escondidas en la UI.
- [ ] La pantalla arranca en la tarea más probable de ese rol (no en un menú genérico).

### 2. Coherente (consistente con el sistema)
- [ ] Usa el **design system / tokens** y los primitivos UI existentes; no reinventa botones, inputs,
      tablas, modales, estados.
- [ ] Sigue los **patrones ya establecidos** para la misma clase de tarea (listado, alta, detalle, wizard).
- [ ] Wording y microcopy en el mismo tono/idioma que el resto (criollo claro, verbos de acción).

### 3. Simple (foco en lo esencial)
- [ ] El **camino feliz es obvio**: menos pasos, menos campos, menos decisiones para completar la tarea.
- [ ] Lo secundario está **progresivamente revelado** (no todo a la vista compitiendo por atención).
- [ ] Cero carga cognitiva innecesaria: defaults sensatos, nada que el usuario tenga que "adivinar".

### 4. Adaptable (responsive + multi-tenant)
- [ ] **Responsive real**: sirve en móvil y desktop sin romperse (el negocio opera desde el celular).
- [ ] **Branding por tenant** respetado (colores/acento/logo del tenant), sin fork de código.
- [ ] Se adapta a datos vacíos, largos, y a distintos rubros/blueprints sin quebrarse.

### 5. Delightful + enterprise (deleite con nivel)
- [ ] **Estados cuidados**: carga (skeleton/spinner), vacío (empty state con próxima acción), error
      (mensaje claro + salida), éxito (confirmación).
- [ ] Transiciones/feedback que hacen sentir el producto **pulido**, sin animación gratuita que moleste.
- [ ] Se siente **enterprise**: nada de "placeholder feo", texto sin terminar, o TODO visible al cliente.

### 6. Accesibilidad (a11y) — ángulo obligatorio, no opcional
- [ ] **Etiquetas reales** en todos los inputs (`<label>` asociado), no placeholder-como-label.
- [ ] **Roles/ARIA** donde corresponde (`role="alert"` en errores, `aria-*` en controles no nativos).
- [ ] **Teclado**: foco visible, orden lógico, todo operable sin mouse; nada atrapado.
- [ ] **Contraste** suficiente (texto/fondo) y tamaños táctiles razonables en móvil.
- [ ] Imágenes con `alt` significativo (o `alt=""` decorativo).

### 7. Consistencia (transversal, contra TODA la app)
- [ ] El cambio **no introduce una variante** de un patrón que ya existe (dos date-pickers, dos estilos
      de tabla) — si hay divergencia, se unifica o se anota como deuda con ADR.
- [ ] Navegación, layout y jerarquía visual **iguales** a pantallas equivalentes.
- [ ] Íconos, colores semánticos (éxito/alerta/peligro) y espaciados **del sistema**, no ad-hoc.

---

## Cómo se aplica en el Gate
En el handoff (`## Sprint activo`), el frente **declara la auditoría hecha** con estos 7 ángulos
tildados (o N/A + por qué). El PMO **reverifica** al integrar. **Un frente que no pasa la auditoría NO
se integra** — vuelve a su worktree. Para UI, complementá con `preview_*` (snapshot/inspect) como
evidencia. La versión corta del checklist vive en el Gate (`docs/METODOLOGIA-SPRINT.md`); este doc es el
fundamento con el detalle por ángulo.

— Elaborado por **Gestión Studio Grow (GSG)**.
