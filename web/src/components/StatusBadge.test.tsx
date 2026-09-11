import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge, WaitingPill } from './StatusBadge';

describe('StatusBadge', () => {
  it('renders the label with the tone colour class', () => {
    render(<StatusBadge label="Одобрено" tone="ok" />);
    const el = screen.getByText('Одобрено');
    expect(el).toHaveClass('text-ok');
  });

  it('defaults to the neutral tone', () => {
    render(<StatusBadge label="Нацрт" />);
    expect(screen.getByText('Нацрт')).toHaveClass('text-ink-2');
  });
});

describe('WaitingPill', () => {
  it('shows the count when positive', () => {
    render(<WaitingPill count={3} />);
    expect(screen.getByText(/Чека тебе 3/)).toBeInTheDocument();
  });

  it('renders nothing when the count is zero', () => {
    const { container } = render(<WaitingPill count={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});
