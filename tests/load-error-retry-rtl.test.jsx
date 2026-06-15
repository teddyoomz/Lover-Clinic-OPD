// Task 3 — LoadErrorRetry card (mobile-load reliability, 2026-06-16)
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LoadErrorRetry from '../src/components/LoadErrorRetry.jsx';

describe('LoadErrorRetry', () => {
  it('renders the default title + retry button + role=alert', () => {
    render(<LoadErrorRetry onRetry={() => {}} />);
    expect(screen.getByTestId('load-error-retry')).toBeInTheDocument();
    expect(screen.getByText('โหลดข้อมูลไม่สำเร็จ')).toBeInTheDocument();
    expect(screen.getByTestId('load-error-retry-btn')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('calls onRetry exactly once on click', () => {
    const onRetry = vi.fn();
    render(<LoadErrorRetry onRetry={onRetry} />);
    fireEvent.click(screen.getByTestId('load-error-retry-btn'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('honors custom title / retryLabel', () => {
    render(<LoadErrorRetry onRetry={() => {}} title="ลองใหม่หัวข้อ" retryLabel="กดเลย" />);
    expect(screen.getByText('ลองใหม่หัวข้อ')).toBeInTheDocument();
    expect(screen.getByText(/กดเลย/)).toBeInTheDocument();
  });

  it('inline variant (fullScreen=false) hides the long message', () => {
    render(<LoadErrorRetry onRetry={() => {}} fullScreen={false} message="SHOULD_BE_HIDDEN" />);
    expect(screen.queryByText('SHOULD_BE_HIDDEN')).not.toBeInTheDocument();
    expect(screen.getByTestId('load-error-retry')).toBeInTheDocument();
  });

  it('button carries an aria-label for a11y', () => {
    render(<LoadErrorRetry onRetry={() => {}} retryLabel="ลองใหม่" />);
    expect(screen.getByLabelText('ลองใหม่')).toBeInTheDocument();
  });
});
