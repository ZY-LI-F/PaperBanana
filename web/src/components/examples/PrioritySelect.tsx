import { Select } from '../ui/Select';
import type { ExamplePriority } from '../../api/examples';

type PrioritySelectProps = {
  disabled?: boolean;
  id?: string;
  value: ExamplePriority;
  onChange: (value: ExamplePriority) => void;
};

const priorityOptions = [
  { label: '低 / Low', value: '1' },
  { label: '中 / Medium', value: '2' },
  { label: '高 / High', value: '3' },
];

export function PrioritySelect({ disabled, id, value, onChange }: PrioritySelectProps) {
  return (
    <Select
      disabled={disabled}
      id={id}
      options={priorityOptions}
      value={String(value)}
      onChange={(event) => onChange(Number(event.currentTarget.value) as ExamplePriority)}
    />
  );
}

export function priorityBadgeText(priority: ExamplePriority) {
  if (priority === 3) return '高优先级 · High priority';
  if (priority === 2) return '中优先级 · Medium priority';
  return '低优先级 · Low priority';
}
