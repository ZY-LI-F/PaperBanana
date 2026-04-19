import { Button, Card, Field, Label, Select } from '../../components/ui';
import { controlClass, cn } from '../../components/ui/shared';
import { modelOptionsForCapability, normalizeDefaults, otherDefaultKeys } from './drafts';
import {
  IMAGE_CAPABILITY,
  IMAGE_MODEL_KEY,
  MAIN_MODEL_KEY,
  type SettingsDefaults,
  type SettingsModelOption,
} from './types';

type DefaultsFormProps = {
  defaults: SettingsDefaults;
  error?: string | null;
  message?: string | null;
  models: SettingsModelOption[];
  onChange: (key: string, value: string) => void;
  onSave: () => void;
  saving: boolean;
};

export function DefaultsForm({
  defaults,
  error,
  message,
  models,
  onChange,
  onSave,
  saving,
}: DefaultsFormProps) {
  const normalized = normalizeDefaults(defaults);
  const chatOptions = modelOptionsForCapability(models, 'chat');
  const imageOptions = modelOptionsForCapability(models, IMAGE_CAPABILITY);
  const extraKeys = otherDefaultKeys(defaults);

  return (
    <Card
      actions={
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save defaults'}
        </Button>
      }
      subtitle="Saved defaults feed the shared settings store for model pickers."
      title="Defaults"
    >
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <Field>
            <Label htmlFor="default-main-model">Default main model</Label>
            <Select
              id="default-main-model"
              options={chatOptions}
              placeholder={chatOptions.length ? 'Select a chat model' : 'No chat models saved yet'}
              value={normalized[MAIN_MODEL_KEY] ?? ''}
              onChange={(event) => onChange(MAIN_MODEL_KEY, event.currentTarget.value)}
            />
          </Field>
          <Field>
            <Label htmlFor="default-image-model">Default image model</Label>
            <Select
              id="default-image-model"
              options={imageOptions}
              placeholder={imageOptions.length ? 'Select an image model' : 'No image models saved yet'}
              value={normalized[IMAGE_MODEL_KEY] ?? ''}
              onChange={(event) => onChange(IMAGE_MODEL_KEY, event.currentTarget.value)}
            />
          </Field>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {extraKeys.map((key) => (
            <Field key={key}>
              <Label htmlFor={`default-${key}`}>{key}</Label>
              <input
                className={controlClass}
                id={`default-${key}`}
                placeholder={key === 'exp_mode' ? 'demo_full' : 'Optional default value'}
                value={defaults[key] ?? ''}
                onChange={(event) => onChange(key, event.currentTarget.value)}
              />
            </Field>
          ))}
        </div>
        <p className="m-0 text-sm text-muted">
          Extra default keys stay editable here when they already exist in YAML; the advanced tab remains the escape hatch for arbitrary schema edits.
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
