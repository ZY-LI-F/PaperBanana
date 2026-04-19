import type { InputHTMLAttributes } from 'react';
import { Button } from './Button';
import { controlClass, cn } from './shared';

type NumberFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'size' | 'value'> & {
  onChangeValue?: (value: number) => void;
  value?: number;
};

function clampValue(value: number, min?: number, max?: number) {
  if (typeof min === 'number' && value < min) return min;
  if (typeof max === 'number' && value > max) return max;
  return value;
}

export function NumberField({ className, max, min, onChange, onChangeValue, step = 1, value, ...props }: NumberFieldProps) {
  const numericStep = typeof step === 'number' ? step : Number(step) || 1;

  const adjustValue = (direction: 1 | -1) => {
    const base = typeof value === 'number' ? value : typeof min === 'number' ? min : 0;
    onChangeValue?.(clampValue(base + numericStep * direction, min, max));
  };

  return (
    <div className="flex items-center gap-2">
      <Button aria-label="Decrease value" size="sm" variant="secondary" onClick={() => adjustValue(-1)}>
        −
      </Button>
      <input
        className={cn(controlClass, 'text-center', className)}
        max={max}
        min={min}
        step={step}
        type="number"
        value={value}
        onChange={(event) => {
          onChange?.(event);
          onChangeValue?.(clampValue(Number(event.currentTarget.value), min, max));
        }}
        {...props}
      />
      <Button aria-label="Increase value" size="sm" variant="secondary" onClick={() => adjustValue(1)}>
        +
      </Button>
    </div>
  );
}
