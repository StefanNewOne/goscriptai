import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CheckpointBar } from './CheckpointBar';

describe('CheckpointBar', () => {
  it('calls onPrimary when the primary (signal) action is clicked', async () => {
    const onPrimary = vi.fn();
    render(<CheckpointBar primaryLabel="Одобри" onPrimary={onPrimary} />);
    await userEvent.click(screen.getByText('Одобри'));
    expect(onPrimary).toHaveBeenCalledOnce();
  });

  it('calls onEdit when edit is provided and clicked', async () => {
    const onEdit = vi.fn();
    render(<CheckpointBar primaryLabel="Одобри" onPrimary={() => {}} onEdit={onEdit} />);
    await userEvent.click(screen.getByText('Доработи рачно'));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('requires a non-empty comment before "Врати со коментар" can send', async () => {
    const onReturn = vi.fn();
    render(<CheckpointBar primaryLabel="Одобри" onPrimary={() => {}} onReturn={onReturn} />);
    await userEvent.click(screen.getByText('Врати со коментар'));

    const send = screen.getByText('Испрати');
    expect(send).toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText('Коментар за писателот…'), 'Скрати го хукот.');
    expect(send).toBeEnabled();

    await userEvent.click(send);
    expect(onReturn).toHaveBeenCalledWith('Скрати го хукот.');
  });

  it('does not render return/edit buttons when their handlers are absent', () => {
    render(<CheckpointBar primaryLabel="Одобри" onPrimary={() => {}} />);
    expect(screen.queryByText('Врати со коментар')).not.toBeInTheDocument();
    expect(screen.queryByText('Доработи рачно')).not.toBeInTheDocument();
  });

  it('disables the primary action while busy', () => {
    render(<CheckpointBar primaryLabel="Одобри" onPrimary={() => {}} busy />);
    expect(screen.getByText('Одобри')).toBeDisabled();
  });
});
