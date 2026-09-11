import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WhatsNewList } from './WhatsNewList';
import type { BrainChange } from '../lib/types';

describe('WhatsNewList', () => {
  it('shows the empty text when there are no changes', () => {
    render(<WhatsNewList changes={[]} emptyText="Нема промени." />);
    expect(screen.getByText('Нема промени.')).toBeInTheDocument();
  });

  it('renders each change with a localized kind label and DD.MM.YYYY date', () => {
    const changes: BrainChange[] = [
      { id: '1', kind: 'AVATAR', summary: 'Предложени 4 аватари', createdAt: '2026-09-11T10:00:00.000Z' },
      { id: '2', kind: 'PROFILE', summary: 'Профил v2', createdAt: '2026-01-05T10:00:00.000Z' },
    ];
    render(<WhatsNewList changes={changes} emptyText="—" />);
    expect(screen.getByText('Аватар')).toBeInTheDocument();
    expect(screen.getByText('Профил')).toBeInTheDocument();
    expect(screen.getByText('Предложени 4 аватари')).toBeInTheDocument();
    expect(screen.getByText('11.09.2026')).toBeInTheDocument();
    expect(screen.getByText('05.01.2026')).toBeInTheDocument();
  });
});
