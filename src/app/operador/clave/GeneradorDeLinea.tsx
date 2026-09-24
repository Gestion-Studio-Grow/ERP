"use client";

// Arma la línea de OPERADORES en el navegador. Usa la MISMA función que verifica el login
// (src/lib/operador/clave-operador.ts), así lo que se genera acá es exactamente lo que el servidor
// acepta. Nada de esto se envía: no hay action ni fetch.

import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { normalizarNombreOperador as normalizar, valorDeClave } from "@/lib/operador/clave-operador";

const LARGO_MINIMO = 12;

export function GeneradorDeLinea() {
  const [nombre, setNombre] = useState("");
  const [clave, setClave] = useState("");
  const [repetida, setRepetida] = useState("");
  const [linea, setLinea] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calculando, setCalculando] = useState(false);

  async function generar(e: React.FormEvent) {
    e.preventDefault();
    setLinea(null);
    const n = normalizar(nombre);
    if (!n) return setError("El nombre va con letras, números, guion o guion bajo (hasta 32).");
    if (clave.length < LARGO_MINIMO) return setError(`La clave tiene que tener al menos ${LARGO_MINIMO} caracteres.`);
    if (clave !== repetida) return setError("Las dos claves no coinciden.");
    setError(null);
    setCalculando(true);
    try {
      setLinea(`${n}=${await valorDeClave(clave)}`);
    } catch {
      setError("Este navegador no pudo calcular la línea. Probá con otro actualizado.");
    } finally {
      setCalculando(false);
    }
  }

  const n = normalizar(nombre);
  return (
    <form onSubmit={generar} className="space-y-3 rounded-lg border border-line bg-surface-raised p-4">
      <label className="block text-sm">
        <span className="text-muted">Tu nombre</span>
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoCapitalize="none" spellCheck={false} required />
        {nombre && n && n !== nombre && <span className="text-xs text-muted">Vas a entrar como «{n}».</span>}
      </label>
      <label className="block text-sm">
        <span className="text-muted">Clave (al menos {LARGO_MINIMO} caracteres)</span>
        <Input type="password" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="new-password" required />
      </label>
      <label className="block text-sm">
        <span className="text-muted">Repetí la clave</span>
        <Input type="password" value={repetida} onChange={(e) => setRepetida(e.target.value)} autoComplete="new-password" required />
      </label>
      {error && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" disabled={calculando} className="w-full">
        {calculando ? "Calculando…" : "Armar mi línea"}
      </Button>
      {linea && (
        <div role="status" className="space-y-1">
          <p className="text-sm">Tu línea (no contiene la clave). Pasásela al dueño de GSG:</p>
          <textarea
            readOnly
            value={linea}
            rows={3}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full break-all rounded-md border border-line bg-surface-sunken p-2 font-mono text-xs"
          />
        </div>
      )}
    </form>
  );
}
