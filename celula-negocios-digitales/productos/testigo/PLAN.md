# Testigo — Plan hasta el primer contratista pagando

> Rubro faro: **control de plagas** (ver `SPEC.md` §1). Objetivo del plan: llevar el prototipo del núcleo
> a **un contratista de control de plagas con 3-5 operarios pagando la suscripción mensual**.
> Referencia de tiempos del analítico: MVP 3-4 semanas, primer peso 4-6 semanas.

---

## Milestones

### M0 — Núcleo funcionando (HECHO en este kickoff)
- ✅ Esquema del parte de control de plagas (`src/esquema-parte.ts`).
- ✅ Prompt + structured outputs con Claude Sonnet (`src/prompt.ts`, `src/estructurar.ts`).
- ✅ Política "nunca inventar datos regulatorios" con repregunta automática.
- ✅ Render HTML de la plantilla (`src/plantilla-pdf.ts`) + ejemplo input→output.
- **Salida:** el pipeline core convierte transcripción+fotos en un parte válido.

### M1 — Pipeline conectado extremo a extremo (semana 1-2)
- Ingesta WhatsApp (Cloud API de Meta): webhook + descarga de media + whitelist de operarios.
- STT real (Whisper) para las notas de voz.
- Visión real (Claude Sonnet) para captions + clasificación antes/después.
- `htmlAPDF()` con Playwright en un worker; despacho del PDF por WhatsApp.
- Persistencia mínima (Postgres + storage).
- **Salida:** un operario manda foto+audio de verdad y recibe el PDF.

### M2 — Plantilla pulida con un experto del rubro (semana 2-3)
- Sentarse con **1 técnico/dueño de control de plagas** a revisar 15-20 partes reales.
- Ajustar campos, checklist estándar, texto legal, plazos de reingreso por tipo de producto.
- Afinar el árbol de repreguntas (producto/registro/dosis/reingreso).
- **Salida:** un parte que un inspector de bromatología aceptaría sin objeciones.

### M3 — Piloto con el contratista faro (semana 3-5)
- Onboarding del contratista: alta de operarios (números), logo, matrícula, clientes precargados.
- Los operarios usan Testigo en su ruta diaria durante 2 semanas, gratis.
- Métrica de éxito: **% de servicios documentados con Testigo** > 70% y **tiempo por parte** < 2 min.
- **Salida:** evidencia de uso real y sticky.

### M4 — Cobro (semana 5-6)
- Suscripción por operario (Mercado Pago), US$15-30/operario/mes.
- Convertir el piloto en cuenta paga.
- **Salida:** **primer contratista pagando** = primer peso.

### M5 — Segundo rubro / expansión (post primer peso)
- Nueva plantilla (mismo pipeline, distinto `esquema-parte` + `prompt`): candidato = **desinfección/limpieza
  técnica** o **service de equipos**, rubros con documentación exigida. Obra/jardinería más adelante.

---

## Cómo conseguir el primer cliente (control de plagas)

El cuello del producto es la **evangelización**, pero en control de plagas está mitigado: **ya necesitan el
papel**. El pitch no es "documentá mejor", es "**dejá de perder media hora por servicio armando el
certificado a mano; el operario manda la foto y el audio, y el parte sale solo, en regla**".

1. **Lista de caza:** empresas chicas de control de plagas registradas (cámaras del rubro, avisos, Google
   Maps "control de plagas + barrio"). Buscar las de 3-8 operarios (ni el unipersonal ni la grande con FSM).
2. **Gancho:** ofrecer armar **gratis 5 partes reales** de esa empresa a partir de sus fotos/audios actuales,
   y mostrar el PDF al lado del que entregan hoy. La diferencia visual vende sola.
3. **Faro:** convertir a UNO en piloto, pulir con él (M2-M3), y usar sus partes como caso testimonial para
   los siguientes (el documento circula con su marca → prueba social).
4. **Precio de entrada:** US$15/operario/mes el primero (undercut agresivo), subiendo a US$25-30 con la
   plantilla ya probada.

## Onboarding del contratista (checklist)

- [ ] Alta de la empresa: nombre, matrícula, logo, texto legal al pie.
- [ ] Alta de operarios por número de WhatsApp (whitelist).
- [ ] Precarga de clientes frecuentes (nombre, dirección, tipo de establecimiento) — acelera el parte.
- [ ] Configurar el número de WhatsApp de Testigo (BSP) y probar un parte de punta a punta.
- [ ] Capacitación de 10 min al operario: "sacá las fotos antes/después y mandá una nota de voz contando qué
      hiciste, qué producto y qué le dijiste al cliente". Nada más.
- [ ] Definir a dónde se despacha el PDF (grupo del contratista + e-mail al cliente final).

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Onboarding alto-touch al inicio | Arrancar con UN rubro y UN contratista faro; estandarizar el alta. |
| Adopción del operario | El input es igual de simple que hoy (foto + audio); no se le agrega fricción. |
| Dato regulatorio inventado = riesgo legal | Política dura: `PENDIENTE_REVISION` + repregunta; nunca se emite un registro inventado. |
| Dependencia de WhatsApp/Meta | El operario inicia (ventana 24 h, gratis); evaluar BSP alterno si hay fricción de números. |
