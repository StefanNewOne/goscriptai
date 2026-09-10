// PlaceCard — a shooting location in the brain (Design Brief §8). Shows the
// usable elements and any constraints the writer/critic must respect.
import type { Location } from '../lib/types';

export function PlaceCard({ location }: { location: Location }) {
  return (
    <div className="rounded-sheet border border-rule bg-sheet p-4">
      <div className="text-16 font-semibold">{location.name}</div>
      {location.description && <p className="mt-1 text-13 text-ink-2">{location.description}</p>}
      {location.usableElements.length > 0 && (
        <p className="mt-2 text-13">
          <span className="text-ink-2">Употребливо: </span>
          {location.usableElements.join(', ')}
        </p>
      )}
      {location.constraints && (
        <p className="mt-1 text-13">
          <span className="text-ink-2">Ограничувања: </span>
          {location.constraints}
        </p>
      )}
    </div>
  );
}
