// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { SegmentedControl, segmentedOptionStyles } from './ui';

afterEach(cleanup);

function Harness() {
  const [value, setValue] = useState('day');
  return (
    <SegmentedControl role="radiogroup" aria-label="Shift type">
      {['day', 'night', 'custom'].map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          onClick={() => setValue(option)}
          className={segmentedOptionStyles(value === option)}
        >
          {option}
        </button>
      ))}
    </SegmentedControl>
  );
}

describe('SegmentedControl', () => {
  it('only the checked option is in the Tab order', () => {
    render(<Harness />);
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1]);
  });

  it('arrow keys move and select the next option', () => {
    render(<Harness />);
    const radios = screen.getAllByRole('radio');
    expect(radios[0]!.getAttribute('aria-checked')).toBe('true');

    radios[0]!.focus();
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });

    expect(radios[1]!.getAttribute('aria-checked')).toBe('true');
    expect(radios[0]!.getAttribute('aria-checked')).toBe('false');
  });

  it('arrow keys wrap around', () => {
    render(<Harness />);
    const radios = screen.getAllByRole('radio');
    radios[0]!.focus();
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowLeft' });
    expect(radios[2]!.getAttribute('aria-checked')).toBe('true');
  });
});
