import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CriticScore, type CriticReport } from './CriticScore';

const report: CriticReport = {
  totalPercent: 82,
  passed: true,
  scores: { avatar: 4, hook: 5, essence: 3, cta: 2 },
  findings: [
    { criterion: 'cta', text: 'ЦТА е слаба.', frame: 3 },
    { criterion: 'hook', text: 'Добар хук.' },
  ],
};

describe('CriticScore', () => {
  it('renders the total percent and criterion labels', () => {
    render(<CriticScore report={report} />);
    expect(screen.getByText('82%')).toBeInTheDocument();
    expect(screen.getByText('Аватар')).toBeInTheDocument();
    expect(screen.getByText('CTA')).toBeInTheDocument();
  });

  it('shows "поминува" when passed, "под прагот" otherwise', () => {
    const { rerender } = render(<CriticScore report={report} />);
    expect(screen.getByText('поминува')).toBeInTheDocument();
    rerender(<CriticScore report={{ ...report, passed: false }} />);
    expect(screen.getByText('под прагот')).toBeInTheDocument();
  });

  it('calls onJumpToFrame with the finding frame', async () => {
    const onJump = vi.fn();
    render(<CriticScore report={report} onJumpToFrame={onJump} />);
    await userEvent.click(screen.getByText('Скокни до кадар 3'));
    expect(onJump).toHaveBeenCalledWith(3);
  });

  it('renders a jump link only for findings that have a frame', () => {
    render(<CriticScore report={report} onJumpToFrame={() => {}} />);
    expect(screen.getAllByText(/Скокни до кадар/)).toHaveLength(1);
  });
});
