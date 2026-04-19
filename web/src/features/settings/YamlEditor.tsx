import { Button, Card, Textarea } from '../../components/ui';
import { cn } from '../../components/ui/shared';

type YamlEditorProps = {
  error?: string | null;
  message?: string | null;
  onChange: (value: string) => void;
  onReset: () => void;
  onSave: () => void;
  saving: boolean;
  value: string;
};

export function YamlEditor({
  error,
  message,
  onChange,
  onReset,
  onSave,
  saving,
  value,
}: YamlEditorProps) {
  return (
    <Card
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={onReset}>
            Reset
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save YAML'}
          </Button>
        </div>
      }
      subtitle="Direct access to the redacted config document. Saving reloads the backend registry once, then refreshes the shared store."
      title="Advanced YAML"
    >
      <div className="space-y-4">
        <Textarea
          className="font-mono text-xs leading-6"
          style={{ minHeight: '32rem' }}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        <p className="m-0 text-sm text-muted">
          Inline secrets remain masked in this view. Use the provider key dialog when you need to rotate a credential.
        </p>
        <Feedback error={error} message={message} />
      </div>
    </Card>
  );
}

type FeedbackProps = {
  error?: string | null;
  message?: string | null;
};

function Feedback({ error, message }: FeedbackProps) {
  if (!error && !message) return null;
  return <p className={cn('m-0 text-sm', error ? 'text-danger' : 'text-secondary')}>{error ?? message}</p>;
}
