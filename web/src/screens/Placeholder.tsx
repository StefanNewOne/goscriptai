import { EmptyState } from '../components/EmptyState';

// Screens scheduled later in the Backlog render an honest placeholder rather
// than a fake UI.
export function Placeholder({ title, ticket }: { title: string; ticket: string }) {
  return (
    <div>
      <h1 className="mb-6 text-28 font-semibold">{title}</h1>
      <EmptyState text={`Овој екран доаѓа според Backlog (${ticket}).`} />
    </div>
  );
}
