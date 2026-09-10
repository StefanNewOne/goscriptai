// CriticScore — the critic's verdict on a script (Design Brief §8, §7.8).
// Shows all 11 rubric criteria scored 1–5 with the pass threshold (each ≥ 3,
// total ≥ 80% — CLAUDE.md invariant 9) and findings that jump to the frame.
// No colour except where a criterion is under its minimum or the set waits.
import { StatusBadge } from './StatusBadge';

export interface CriticReport {
  totalPercent: number;
  passed: boolean;
  scores: Record<string, number>;
  findings: { criterion: string; text: string; frame?: number }[];
}

// Default rubric labels (mirror of seed critic_rubric). The rubric is editable
// in Settings, so unknown keys fall back to the raw key.
const CRITERION_LABEL: Record<string, string> = {
  avatar: 'Аватар',
  hook: 'Hook',
  essence: 'Суштина',
  actorFeasibility: 'Изводливост за актерот',
  location: 'Локација',
  structure: 'Структура',
  cta: 'CTA',
  antiGeneric: 'Анти-генеричност',
  language: 'Јазик',
  duration: 'Времетраење',
  accuracy: 'Точност',
};

const MIN = 3;
const MAX = 5;

export function CriticScore({
  report,
  onJumpToFrame,
}: {
  report: CriticReport;
  onJumpToFrame?: (frame: number) => void;
}) {
  const entries = Object.entries(report.scores);
  return (
    <div className="rounded-sheet border border-rule bg-sheet p-4">
      <div className="mb-3 flex items-baseline gap-2">
        <span className="text-28 font-semibold tabular-nums">{report.totalPercent}%</span>
        <StatusBadge
          label={report.passed ? 'поминува' : 'под прагот'}
          tone={report.passed ? 'ok' : 'hold'}
        />
      </div>

      <ul className="flex flex-col gap-1.5">
        {entries.map(([key, score]) => {
          const under = score < MIN;
          return (
            <li key={key} className="grid grid-cols-[1fr_auto] items-center gap-3 text-13">
              <span className={under ? 'text-hold' : 'text-ink'}>{CRITERION_LABEL[key] ?? key}</span>
              <span className="flex items-center gap-1" aria-label={`${score} од ${MAX}`}>
                {Array.from({ length: MAX }, (_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 w-3 rounded-[1px] ${
                      i < score ? (under ? 'bg-hold' : 'bg-ink') : 'bg-rule'
                    }`}
                    aria-hidden
                  />
                ))}
              </span>
            </li>
          );
        })}
      </ul>

      {report.findings.length > 0 && (
        <div className="mt-4 border-t border-rule pt-3">
          <div className="mb-2 text-13 text-ink-2">Наоди</div>
          <ul className="flex flex-col gap-2">
            {report.findings.map((f, i) => (
              <li key={i} className="text-13">
                <p>{f.text}</p>
                {typeof f.frame === 'number' && onJumpToFrame && (
                  <button
                    className="mt-0.5 text-13 text-ink-2 underline underline-offset-2 hover:text-ink"
                    onClick={() => onJumpToFrame(f.frame as number)}
                  >
                    Скокни до кадар {f.frame}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
