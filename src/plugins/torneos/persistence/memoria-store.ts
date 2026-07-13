// ============================================================================
// STORE EN MEMORIA — fake de `TorneoStore` para tests (ADR-097, FASE 2).
// ============================================================================
//
// Espeja fielmente al adaptador real: guarda el snapshot SERIALIZADO (string, como el
// JSONB de Neon) y lo deserializa al leer. Así el round-trip serializar/deserializar del
// motor se ejercita en cada guardar/cargar — un bug de serialización se cae en los tests,
// no en prod. Scopeado por un `Map` (equivalente al aislamiento por tenant del real).

import motor, { type Torneo } from "../engine";
import type { TorneoStore } from "./store";

export class MemoriaTorneoStore implements TorneoStore {
  /** id → snapshot serializado (string), igual que la columna JSONB del real. */
  private readonly filas = new Map<string, string>();

  async cargar(torneoId: string): Promise<Torneo | null> {
    const snap = this.filas.get(torneoId);
    return snap == null ? null : motor.deserializar(snap);
  }

  async guardar(torneoId: string, torneo: Torneo): Promise<void> {
    this.filas.set(torneoId, motor.serializar(torneo));
  }

  /** Ayuda de test: cuántos torneos hay guardados. */
  get tamano(): number {
    return this.filas.size;
  }

  /** Ayuda de test: el snapshot serializado crudo (para asertar que NO cambió). */
  snapshotCrudo(torneoId: string): string | undefined {
    return this.filas.get(torneoId);
  }
}
