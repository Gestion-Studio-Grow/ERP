"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { createReview } from "@/lib/client-actions";

function SendButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="rounded-full px-6 py-2.5 text-sm font-medium disabled:opacity-40"
      style={{ background: "var(--spa-mocha-dark)", color: "var(--spa-ivory)" }}
    >
      {pending ? "Enviando…" : "Enviar reseña"}
    </button>
  );
}

function Star({ filled, onClick, onHover }: { filled: boolean; onClick: () => void; onHover: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onHover}
      className="p-0.5 transition-transform hover:scale-110"
    >
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill={filled ? "var(--spa-gold)" : "none"}
        stroke="var(--spa-gold)"
        strokeWidth="1.5"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 2.5l2.9 6.2 6.6.7-5 4.7 1.4 6.6L12 17.5l-5.9 3.2 1.4-6.6-5-4.7 6.6-.7L12 2.5z"
        />
      </svg>
    </button>
  );
}

export default function ReviewForm({ appointmentId }: { appointmentId: string }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  if (sent) {
    return (
      <div
        className="rounded-lg p-5 text-sm text-center mb-6"
        style={{ background: "var(--spa-sage-light)", color: "var(--spa-mocha-dark)" }}
      >
        ¡Gracias por tu reseña! Nos ayuda muchísimo. 🌿
      </div>
    );
  }

  return (
    <div
      className="rounded-lg p-3 sm:p-5 mb-6"
      style={{ background: "var(--spa-sage-light)", color: "var(--spa-mocha-dark)" }}
    >
      <p className="font-serif text-base sm:text-lg mb-2 sm:mb-1">¿Cómo estuvo tu experiencia?</p>

      <form
        action={async (fd) => {
          setError("");
          try {
            await createReview(fd);
            setSent(true);
          } catch (err) {
            setError(err instanceof Error ? err.message : "No se pudo enviar la reseña.");
          }
        }}
      >
        <input type="hidden" name="appointmentId" value={appointmentId} />
        <input type="hidden" name="rating" value={rating} />

        <div className="flex items-center gap-2 mb-2 sm:mb-4">
          <div className="flex gap-0.5" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                filled={n <= (hover || rating)}
                onClick={() => setRating(n)}
                onHover={() => setHover(n)}
              />
            ))}
          </div>
        </div>

        <textarea
          name="comment"
          placeholder="Contanos qué te pareció (opcional)"
          rows={2}
          className="w-full rounded-md border px-3 py-1.5 text-sm mb-2"
          style={{ borderColor: "var(--spa-mocha)", background: "var(--spa-ivory)" }}
        />

        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

        <SendButton disabled={rating === 0} />
      </form>
    </div>
  );
}
