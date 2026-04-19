import { useState } from 'react';
import { Button, Card, Field, Label, Modal, Tag } from '../../components/ui';
import { controlClass, cn } from '../../components/ui/shared';
import { createEmptyProvider } from './drafts';
import { providerTypeOptions, type ProviderDraft } from './types';

type ProvidersTableProps = {
  error?: string | null;
  message?: string | null;
  onAddProvider: () => void;
  onRemoveProvider: (index: number) => void;
  onSave: () => void;
  onUpdateProvider: (index: number, provider: ProviderDraft) => void;
  providers: ProviderDraft[];
  saving: boolean;
};

type KeyEditorState = {
  index: number;
  value: string;
} | null;

export function ProvidersTable({
  error,
  message,
  onAddProvider,
  onRemoveProvider,
  onSave,
  onUpdateProvider,
  providers,
  saving,
}: ProvidersTableProps) {
  const [keyEditor, setKeyEditor] = useState<KeyEditorState>(null);

  return (
    <>
      <Card
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={onAddProvider}>
              Add provider
            </Button>
            <Button size="sm" onClick={onSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save providers'}
            </Button>
          </div>
        }
        subtitle="Provider ids, base URLs, masked credentials, and registry metadata."
        title="Providers"
      >
        <div className="space-y-4">
          {providers.length === 0 ? <EmptyProviders /> : null}
          {providers.map((provider, index) => (
            <ProviderRow
              index={index}
              key={`${provider.id || 'provider'}-${index}`}
              onEditKey={() => setKeyEditor({ index, value: '' })}
              onRemove={onRemoveProvider}
              onUpdate={onUpdateProvider}
              provider={provider}
            />
          ))}
          <SaveFeedback error={error} message={message} />
        </div>
      </Card>
      <ApiKeyModal
        keyEditor={keyEditor}
        onClose={() => setKeyEditor(null)}
        onConfirm={(editor) => {
          const current = providers[editor.index] ?? createEmptyProvider();
          onUpdateProvider(editor.index, { ...current, apiKey: editor.value });
          setKeyEditor(null);
        }}
        onChange={(value) => setKeyEditor((current) => (current ? { ...current, value } : current))}
      />
    </>
  );
}

type ProviderRowProps = {
  index: number;
  onEditKey: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, provider: ProviderDraft) => void;
  provider: ProviderDraft;
};

function ProviderRow({ index, onEditKey, onRemove, onUpdate, provider }: ProviderRowProps) {
  return (
    <div className="grid gap-4 rounded-lg border border-border bg-canvas px-4 py-4 lg:grid-cols-[minmax(0,1.2fr)_12rem_minmax(0,1fr)_auto]">
      <Field>
        <Label htmlFor={`provider-id-${index}`}>Provider ID</Label>
        <input
          className={controlClass}
          id={`provider-id-${index}`}
          placeholder="openai-official"
          value={provider.id}
          onChange={(event) => onUpdate(index, { ...provider, id: event.currentTarget.value, name: event.currentTarget.value })}
        />
      </Field>
      <Field>
        <Label htmlFor={`provider-type-${index}`}>Type</Label>
        <select
          className={cn(controlClass, 'appearance-none')}
          id={`provider-type-${index}`}
          value={provider.type}
          onChange={(event) => onUpdate(index, { ...provider, type: event.currentTarget.value })}
        >
          {providerTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      <Field>
        <Label htmlFor={`provider-url-${index}`}>Base URL</Label>
        <input
          className={controlClass}
          id={`provider-url-${index}`}
          placeholder="https://api.openai.com/v1"
          value={provider.baseUrl}
          onChange={(event) => onUpdate(index, { ...provider, baseUrl: event.currentTarget.value })}
        />
      </Field>
      <div className="flex items-end justify-end">
        <Button size="sm" variant="ghost" onClick={() => onRemove(index)}>
          Remove
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:col-span-4">
        <Tag tone={provider.apiKey || provider.apiKeyMasked ? 'ok' : 'warn'}>
          {provider.apiKey ? 'Key staged' : provider.apiKeyMasked ? 'Key configured' : 'Key missing'}
        </Tag>
        <span className="text-sm text-secondary">
          {provider.apiKey ? 'A new key is staged locally and will be persisted on save.' : provider.apiKeyMasked || 'No API key stored yet.'}
        </span>
        <Button size="sm" variant="secondary" onClick={onEditKey}>
          Set key
        </Button>
        <span className="text-sm text-muted">
          {provider.models.length} model{provider.models.length === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
}

type ApiKeyModalProps = {
  keyEditor: KeyEditorState;
  onChange: (value: string) => void;
  onClose: () => void;
  onConfirm: (editor: Exclude<KeyEditorState, null>) => void;
};

function ApiKeyModal({ keyEditor, onChange, onClose, onConfirm }: ApiKeyModalProps) {
  return (
    <Modal
      description="Enter a new key. The page only keeps this value in local component state until you save."
      footer={
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!keyEditor?.value.trim()}
            onClick={() => keyEditor && onConfirm({ ...keyEditor, value: keyEditor.value.trim() })}
          >
            Stage key
          </Button>
        </div>
      }
      onClose={onClose}
      open={Boolean(keyEditor)}
      size="sm"
      title="Set provider API key"
    >
      <Field>
        <Label htmlFor="provider-api-key">API key</Label>
        <input
          autoComplete="off"
          className={controlClass}
          id="provider-api-key"
          placeholder="sk-..."
          type="password"
          value={keyEditor?.value ?? ''}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </Field>
    </Modal>
  );
}

function EmptyProviders() {
  return (
    <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-secondary">
      No providers configured yet. Add one row, then attach models below.
    </div>
  );
}

type SaveFeedbackProps = {
  error?: string | null;
  message?: string | null;
};

function SaveFeedback({ error, message }: SaveFeedbackProps) {
  if (!error && !message) return null;
  return <p className={cn('m-0 text-sm', error ? 'text-danger' : 'text-secondary')}>{error ?? message}</p>;
}
