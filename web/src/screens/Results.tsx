import { mk } from '../i18n/mk';

// Results (Ф2). Real metrics arrive with the Meta integration; until then this
// is a clean, informative screen (not a raw placeholder) that explains what
// will live here and that script code == Meta ad name makes the mapping automatic.
export function Results() {
  return (
    <div>
      <h1 className="mb-4 text-28 font-semibold">{mk.nav.results}</h1>
      <div className="max-w-read rounded-sheet border border-rule bg-sheet p-8">
        <p className="text-16">{mk.results.comingWithMeta}</p>
        <p className="mt-3 text-14 text-ink-2">{mk.results.body}</p>
        <p className="mt-3 text-14 text-ink-2">{mk.results.mapping}</p>
        <ul className="mt-4 flex flex-col gap-1 border-t border-rule pt-4 text-14 text-ink-2">
          <li>· {mk.results.b1}</li>
          <li>· {mk.results.b2}</li>
          <li>· {mk.results.b3}</li>
        </ul>
      </div>
    </div>
  );
}
