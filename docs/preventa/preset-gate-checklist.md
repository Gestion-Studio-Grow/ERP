# 🛡️ Gate de Excelencia aplicado al PRESET — checklist verificable

**Tipo:** checklist operativo del Gate (entrenamiento de agentes) · **Dueño:** Célula "Generador de
Preset por IA" (Adaptación y Calidad).
**Para qué:** el Gate de `docs/metodologia/` está escrito para **un cambio de código/pantalla**. Un
**preset generado** es un entregable distinto (un sandbox de venta de cara al cliente, hecho de datos).
Este doc **traduce los 4 bloques del Gate a chequeos concretos sobre un preset**, para que el paso
BLOQUEANTE "generar → auditar → recién ahí mostrar" (`generador-preset-ia.md`) sea **objetivo y repetible**.

> **Regla no negociable (heredada):** un preset que no tilda los 4 bloques **NO se muestra al cliente** —
> vuelve al agente. La auditoría es parte del **acto de generar**, nunca "lo revisamos después". La
> auditoría **corre en Opus 4.8** (excepción dura de modelos, commit `06934cb`).

---

## 🚫 Precondiciones DURAS (si alguna falla, ni se audita: se frena)

- [ ] **🔒 AUTORIZACIÓN registrada.** `authorization.granted === true`, con `scope` y `recordPath`
      apuntando a `docs/tenants/<slug>/…`. **Sin esto no se generó ni se muestra nada** (precondición del
      flujo, no un chequeo posterior).
- [ ] **Alcance respetado.** Lo NO autorizado (p.ej. fotos) está **reemplazado por placeholder de marca
      GSG u omitido** — no aparece en el preset.
- [ ] **Sin secretos / sin datos reales.** Cero `DATABASE_URL`, passwords, tokens, ni clientes reales.
      Todo es dato de ejemplo. (FASE 1, `demo-publica-costo-cero.md`.)
- [ ] **Honestidad (regla de oro).** Cada dato no verificado está marcado `provisional` o
      `pedido-al-dueno`. **Cero inventado sin etiquetar.** `provenanceSummary` cuadra con los `Sourced`.

---

## Bloque 1 — 🔎 Auditoría SAP Fiori (7 ángulos, aplicados al probador del cliente)

`docs/metodologia/auditoria-sap-fiori.md`, reinterpretado para un preset:

1. **Role-based** —
   - [ ] El probador cuenta la historia desde la mirada del **dueño** (es una venta al dueño); las
         acciones que muestra son las que su negocio realmente haría.
   - [ ] Ninguna escena promete una acción que el rol no podría ejecutar (no se "dibuja" humo).
2. **Coherente** —
   - [ ] Usa el motor/estilo del probador (tokens, primitivos), **no** UI ad-hoc inventada por el preset.
   - [ ] Las escenas siguen el patrón del set de su **familia de rubro** (§reglas de adaptación).
   - [ ] Wording en criollo claro, verbos de acción, tono del negocio (`brand.voice`).
3. **Simple** —
   - [ ] El recorrido tiene un **camino feliz obvio**; cada escena, una idea.
   - [ ] Los datos provisionales **no ensucian** la lectura (marcados con sobriedad, no gritando "FALSO").
4. **Adaptable** —
   - [ ] **Responsive real** (mobile-first: el tour se ve en el teléfono, que es el pitch).
   - [ ] **Branding del cliente** aplicado (acento `accentPreset`, monograma, tema, wording) — sin fork.
   - [ ] El **set de escenas corresponde al rubro** (una carnicería NO muestra "reservá tu turno").
   - [ ] Aguanta catálogo corto/largo y nombres largos sin romperse.
5. **Delightful + enterprise** —
   - [ ] Estados cuidados (carga/vacío/error/éxito) donde el motor los tenga.
   - [ ] **Cero "placeholder feo"**, lorem ipsum, TODO, o texto sin terminar visible al cliente.
   - [ ] Se siente producto serio, no maqueta.
6. **Accesibilidad** —
   - [ ] Contraste suficiente del **acento elegido** sobre su fondo (par `on*` del preset).
   - [ ] Tour operable por teclado (flechas/espacio) y táctil; foco visible.
   - [ ] Imágenes/placeholders con `alt` significativo (o `alt=""` decorativo).
7. **Consistencia** —
   - [ ] El preset **no introduce una variante** de un patrón que ya existe en el motor.
   - [ ] Íconos y colores semánticos (éxito/alerta) del sistema, no ad-hoc.

## Bloque 2 — 🏷️ Sello de Marca GSG

`docs/metodologia/estandar-marca-gsg.md`:

- [ ] **Marca del cliente manda en lo visible** (logo/monograma, acento, wording del negocio).
- [ ] **Sello GSG presente donde corresponde**: `metadata.generator` y crédito en backoffice —
      **NO** en la superficie pública del tenant (principio de no-colisión).
- [ ] **Coherencia de identidad**: la "mano" GSG se reconoce por el uso de tokens/primitivos.

## Bloque 3 — 🏛️ Arquitectura

- [ ] **Preset = data pura**: JSON-serializable, sin DB/acciones/`process.env`. Aislamiento `force-static`
      intacto (`grep` de imports de `/demo` solo muestra `react`, `next`, `./`, type-only del contrato).
- [ ] **Blueprint = config, no fork.** Rubro nuevo se modeló como config (`src/blueprints/…`), nunca a medida.
- [ ] **Multi-tenant limpio**: nada del preset filtra datos de otro tenant; el `slug` es propio.
- [ ] Deuda anotada (assets pendientes, `ASSET_MANIFEST`, precios a confirmar).

## Bloque 4 — ✅ Confiabilidad

- [ ] **`tsc` + `build` + `test` verdes** con el preset integrado (el build de `/demo` prueba el aislamiento).
- [ ] **Procedencia completa**: todo `Sourced` tiene `prov`; `provenanceSummary` cuadra.
- [ ] **CTA correcto**: `cta.whatsappNumber` es el real del cliente/captación, o está marcado `provisional`.
- [ ] **No rompe prod**: el preset vive en FASE 1; el alta real (FASE 2, credenciales) la dispara el dueño.

---

## Veredicto

**El preset se muestra al cliente SOLO si:** las 4 precondiciones duras ✔ **y** los 4 bloques ✔ →
`quality.gatePassed = true`. Cualquier ítem que no aplique → **N/A + por qué**. Si algo falla, el preset
**vuelve al agente**; se registra el defecto en el **loop de entrenamiento**
(`docs/preventa/loop-entrenamiento-presets.md`) y se corrige antes de reintentar.

— Elaborado por **Gestión Studio Grow (GSG)**.
