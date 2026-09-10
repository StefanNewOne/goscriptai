// PersonCard — an actor in the brain (Design Brief §8). Shows role, spoken
// languages (an actor is never put on a concept in a language they don't speak
// — CLAUDE.md inv. 8), style, and can/cannot-do. Placeholder portrait until an
// image is attached.
import type { Actor } from '../lib/types';
import { mk } from '../i18n/mk';

export function PersonCard({ actor }: { actor: Actor }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-4 rounded-sheet border border-rule bg-sheet p-4">
      <div className="min-h-[160px] rounded-control bg-[repeating-linear-gradient(45deg,#ECEEEB,#ECEEEB_8px,#F5F6F4_8px,#F5F6F4_16px)]" />
      <div>
        <div className="text-20 font-semibold">{actor.name}</div>
        <div className="mb-2 text-13 text-ink-2">
          {actor.role} · {actor.languages.map((l) => mk.lang[l]).join(', ')}
        </div>
        {actor.style && (
          <div className="text-13">
            <span className="text-ink-2">Стил: </span>
            {actor.style}
          </div>
        )}
        {actor.canDo.length > 0 && (
          <div className="text-13">
            <span className="text-ink-2">Може: </span>
            {actor.canDo.join(', ')}
          </div>
        )}
        {actor.cannotDo.length > 0 && (
          <div className="text-13">
            <span className="text-ink-2">Не може: </span>
            {actor.cannotDo.join(', ')}
          </div>
        )}
      </div>
    </div>
  );
}
