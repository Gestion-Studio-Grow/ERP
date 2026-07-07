# Kudos — Plan hasta el primer local pagando

> Objetivo del kickoff: llegar a **2–3 locales beta pagando** y demostrar el ROI (estrellas = ventas).
> Time-to-cash del análisis de la célula: **3–5 semanas**. Break-even a US$5.000/mes: ~34–50 locales.

---

## Milestones

### M0 — Kickoff (hecho en esta sesión)
- [x] SPEC del MVP (captación anti-gating, generador, tablero, kit de voz).
- [x] Arquitectura + modelo de datos + costos.
- [x] Corazón scaffoldeado y corriendo: ruteo 1★↔5★, escalado sensible, guardarraíles, lint de política.
- [x] Implementación de referencia con Claude Sonnet + prompt caching.

### M1 — Núcleo productivo (semana 1)
- [ ] Reemplazar `MockLLM` por `AnthropicLLM` real (instalar SDK, `ANTHROPIC_API_KEY`).
- [ ] Afinar prompts de voz de marca con 3–4 kits reales de rubros distintos (gastronomía, retail, servicios).
- [ ] Batería de reseñas de prueba (50+) por bucket + casos sensibles → medir precisión de ruteo y escalado.
- [ ] Persistencia: Postgres con el esquema de ARQUITECTURA (dedupe por `source_review_id`).

### M2 — Conectores + captación (semana 2)
- [ ] Conector Google Business Profile: leer reseñas (polling) + publicar respuestas. Detrás de `ReviewSource`.
- [ ] Landing de captación por QR (neutral, un botón, pasa `lintCopyCaptacion`).
- [ ] WhatsApp utility template de captación (dentro de ventana 24 h = gratis), con lint de política.
- [ ] Cola de moderación (estados `revisar_humano` / `escalar`) con aprobación en un click.

### M3 — Tablero + reporte (semana 3)
- [ ] Tablero: estrella promedio, evolución, cobertura %, cola de moderación.
- [ ] Reporte mensual automático (PDF/email) — herramienta de retención y de venta del ROI.
- [ ] Conector MercadoLibre (segundo `ReviewSource`, donde está la plata en AR).

### M4 — Beta pago (semanas 3–5)
- [ ] Onboarding asistido de los primeros 2–3 locales (armar su kit de voz a mano = setup pago).
- [ ] 30 días gestionados punta a punta por local.
- [ ] Medición de ROI (ver abajo) y ajuste de precio/pitch.

---

## Cómo conseguir los primeros 2–3 locales beta

Venta atomizada pero de CAC bajo y ciclo corto (ticket bajo, demo visual, decisión en días):

1. **Red caliente primero.** Locales de barrio conocidos (gastronomía, estética, veterinaria, retail)
   donde ya hay confianza. Oferta beta: **1 mes gratis o a mitad de precio** a cambio de testimonio +
   permiso para medir resultados. 3 "síes" de acá alcanzan para arrancar.
2. **Demo visual en 5 minutos.** Mostrar en vivo: pegamos una reseña real de su Google → sale la
   respuesta con su voz. El "wow" es inmediato y no requiere que entiendan tecnología.
3. **Canal físico / QR.** El propio producto se vende por donde vive la pyme: un QR "dejá tu reseña"
   ya es marketing. Pitch: *"respondemos el 100% de tus reseñas por menos de lo que sale un café por día"*.
4. **Pitch de undercutting.** Ancla de precio: Birdeye cobra US$299–449. Nosotros US$99–149, en
   español nativo, done-for-you. El dueño no compra software: compra sacarse el tema de encima.
5. **Foco por rubro.** Empezar con UN rubro (ej. gastronomía) para reusar el kit de voz y los casos
   sensibles; después replicar a otro.

## Cómo se demuestra el ROI (estrellas = ventas)

El moat es acumulativo y el argumento de renovación es el ROI medible:

- **Baseline al arrancar:** estrella promedio, cantidad de reseñas, % respondidas (casi siempre 0%),
  posición en el ranking del rubro. Foto del "antes".
- **Durante el beta:** cobertura de respuesta (meta 100%), reseñas nuevas capturadas por mes,
  evolución de la estrella promedio, movimiento en el ranking local.
- **Evidencia del vínculo estrellas→ventas** (para el pitch): +0,1 estrella y responder reseñas están
  correlacionados con más conversión/visitas en la ficha de Google. El reporte mensual traduce eso a
  lenguaje de dueño: *"este mes sumaste X reseñas, tu estrella pasó de A a B, y respondimos el 100%."*
- **Prueba social entre locales:** el testimonio del primer beta ("desde que respondemos todo,
  entran más consultas") es el mejor vendedor para el segundo y el tercero.

## Riesgos del plan y mitigación
- **Política de Google:** ya mitigada por diseño (captación uniforme + `lintCopyCaptacion`).
- **API de GBP:** aprobación puede demorar → arrancar el beta leyendo/publicando manual asistido si hace
  falta, mientras se habilita el conector. No frena la validación comercial.
- **Venta atomizada:** CAC bajo pero de a uno → foco por rubro + prueba social para acelerar.
