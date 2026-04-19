import { useId, type InputHTMLAttributes } from 'react';
import { controlClass, cn, type Option } from './shared';

type ComboboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  options: Option[];
};

export function Combobox({ className, options, ...props }: ComboboxProps) {
  const listId = useId();

  return (
    <>
      <input className={cn(controlClass, className)} list={listId} {...props} />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.hint ?? option.label}
          </option>
        ))}
      </datalist>
    </>
  );
}
