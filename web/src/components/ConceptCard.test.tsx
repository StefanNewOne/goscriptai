import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConceptCard, type ConceptCardData } from './ConceptCard';

const base: ConceptCardData = {
  id: 'c1',
  type: 'PRODUCT_OFFER',
  decision: 'PENDING',
  card: { hook: 'Летото не чека', insight: 'Публиката сака брзо', why: 'Итност', estimateSec: 30, complexity: 'ниска' },
  avatar: { name: 'Марија' },
  actor: { name: 'Ајтов' },
  location: { name: 'Салон' },
};

describe('ConceptCard', () => {
  it('renders the hook, type label and people', () => {
    render(<ConceptCard concept={base} onSelect={() => {}} onReject={() => {}} />);
    expect(screen.getByText('Летото не чека')).toBeInTheDocument();
    expect(screen.getByText('Продажно')).toBeInTheDocument();
    expect(screen.getByText('Ајтов · Салон')).toBeInTheDocument();
  });

  it('fires onSelect / onReject', async () => {
    const onSelect = vi.fn();
    const onReject = vi.fn();
    render(<ConceptCard concept={base} onSelect={onSelect} onReject={onReject} />);
    await userEvent.click(screen.getByText('Избери'));
    await userEvent.click(screen.getByText('Отфрли'));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onReject).toHaveBeenCalledOnce();
  });

  it('reflects the SELECTED / REJECTED decision in the labels', () => {
    const { rerender } = render(<ConceptCard concept={{ ...base, decision: 'SELECTED' }} onSelect={() => {}} onReject={() => {}} />);
    expect(screen.getByText('Избрано')).toBeInTheDocument();
    rerender(<ConceptCard concept={{ ...base, decision: 'REJECTED' }} onSelect={() => {}} onReject={() => {}} />);
    expect(screen.getByText('Врати')).toBeInTheDocument();
  });
});
