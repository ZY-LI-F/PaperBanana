import { Button, Card, Field, Label } from '../../components/ui';
import { controlClass, cn } from '../../components/ui/shared';
import { capabilityOptions, invokeOptions, type ProviderDraft } from './types';

type ModelsTableProps = {
  onAddModel: (providerIndex: number) => void;
  onRemoveModel: (providerIndex: number, modelIndex: number) => void;
  onUpdateModel: (
    providerIndex: number,
    modelIndex: number,
    key: 'capability' | 'invoke' | 'name',
    value: string,
  ) => void;
  providers: ProviderDraft[];
};

export function ModelsTable({
  onAddModel,
  onRemoveModel,
  onUpdateModel,
  providers,
}: ModelsTableProps) {
  return (
    <Card subtitle="Per-provider model CRUD. Model ids are stored as provider_id::model_name." title="Models">
      <div className="space-y-4">
        {providers.length === 0 ? <EmptyModels /> : null}
        {providers.map((provider, providerIndex) => (
          <div className="rounded-lg border border-border bg-canvas px-4 py-4" key={`${provider.id || 'provider'}-models-${providerIndex}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="m-0 text-sm font-semibold text-primary">{provider.id || 'New provider'}</p>
                <p className="m-0 text-sm text-secondary">
                  {provider.id ? 'Models persist under this provider when you save providers.' : 'Set a provider ID above before saving models.'}
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => onAddModel(providerIndex)}>
                Add model
              </Button>
            </div>
            <div className="mt-4 space-y-3">
              {provider.models.length === 0 ? <EmptyProviderModels /> : null}
              {provider.models.map((model, modelIndex) => (
                <div className="grid gap-3 rounded-lg border border-border bg-surface px-3 py-3 lg:grid-cols-[minmax(0,1.5fr)_10rem_14rem_auto]" key={`${provider.id || 'provider'}-${model.name || 'model'}-${modelIndex}`}>
                  <Field>
                    <Label htmlFor={`model-name-${providerIndex}-${modelIndex}`}>Model name</Label>
                    <input
                      className={controlClass}
                      id={`model-name-${providerIndex}-${modelIndex}`}
                      placeholder="gpt-4.1"
                      value={model.name}
                      onChange={(event) => onUpdateModel(providerIndex, modelIndex, 'name', event.currentTarget.value)}
                    />
                  </Field>
                  <Field>
                    <Label htmlFor={`model-capability-${providerIndex}-${modelIndex}`}>Capability</Label>
                    <select
                      className={cn(controlClass, 'appearance-none')}
                      id={`model-capability-${providerIndex}-${modelIndex}`}
                      value={model.capability}
                      onChange={(event) => onUpdateModel(providerIndex, modelIndex, 'capability', event.currentTarget.value)}
                    >
                      {capabilityOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field>
                    <Label htmlFor={`model-invoke-${providerIndex}-${modelIndex}`}>Invoke override</Label>
                    <select
                      className={cn(controlClass, 'appearance-none')}
                      id={`model-invoke-${providerIndex}-${modelIndex}`}
                      value={model.invoke}
                      onChange={(event) => onUpdateModel(providerIndex, modelIndex, 'invoke', event.currentTarget.value)}
                    >
                      {invokeOptions.map((option) => (
                        <option key={option.value || 'auto'} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="flex items-end justify-end">
                    <Button size="sm" variant="ghost" onClick={() => onRemoveModel(providerIndex, modelIndex)}>
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function EmptyModels() {
  return (
    <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-secondary">
      Add a provider first, then define chat and image models here.
    </div>
  );
}

function EmptyProviderModels() {
  return <p className="m-0 text-sm text-secondary">No models configured for this provider yet.</p>;
}
