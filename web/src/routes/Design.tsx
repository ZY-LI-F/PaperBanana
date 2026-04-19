import { useState, type ReactNode } from 'react';
import {
  Badge,
  BattleGrid,
  Breadcrumb,
  Button,
  Card,
  Combobox,
  Dialog,
  Empty,
  ErrorText,
  Field,
  HelperText,
  ImageGallery,
  Label,
  LogStream,
  Modal,
  NumberField,
  PromptEditor,
  RunStatusChip,
  Select,
  Skeleton,
  Slider,
  StageTimeline,
  Switch,
  Tabs,
  Tag,
  Textarea,
  Toast,
} from '../components/ui';
import { battleItems, galleryImages, logEntries, modelOptions, timelineStages } from './designData';

function Section({ children, description, title }: { children: ReactNode; description: string; title: string }) {
  return (
    <Card subtitle={description} title={title}>
      {children}
    </Card>
  );
}

export default function DesignRoute() {
  const [candidateCount, setCandidateCount] = useState(4);
  const [isPinned, setIsPinned] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [prompt, setPrompt] = useState('Design a clean medical-tech paper figure with numbered callouts, restrained contrast, and strong caption fidelity.');
  const [provider, setProvider] = useState(modelOptions[0]?.value ?? '');
  const [notes, setNotes] = useState('Use accent teal for primary pathways and blue for supporting metadata. Keep labels concise.');
  const [temperature, setTemperature] = useState(55);

  return (
    <div className="space-y-6">
      <Card
        actions={<Tag tone="ok">Visual QA</Tag>}
        subtitle="Every reusable primitive for the PaperBanana shell is rendered here with sample data."
        title="Design Sandbox"
      >
        <div className="flex flex-wrap items-center gap-3">
          <RunStatusChip status="running" />
          <RunStatusChip status="succeeded" />
          <RunStatusChip status="failed" />
        </div>
      </Card>

      <Section description="Buttons, tags, badges, status chips, and toast surfaces." title="Feedback">
        <div className="space-y-6">
          <div className="flex flex-wrap gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
          </div>
          <div className="flex flex-wrap gap-3">
            <Tag tone="ok">Stable</Tag>
            <Tag tone="warn">Needs review</Tag>
            <Badge tone="err">Pipeline blocked</Badge>
            <Badge tone="neutral">Draft</Badge>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Toast description="Run persistence completed and artifacts were written to disk." title="Saved" tone="ok" />
            <Toast description="Visualizer model key was rejected by the provider registry." title="Credential issue" tone="err" />
          </div>
        </div>
      </Section>

      <Section description="Form wrappers and input primitives for upcoming feature tasks." title="Form Controls">
        <div className="grid gap-6 xl:grid-cols-2">
          <Field>
            <Label htmlFor="provider">Primary model</Label>
            <Select id="provider" value={provider} options={modelOptions} onChange={(event) => setProvider(event.currentTarget.value)} />
            <HelperText>Backed by the shared API registry surface.</HelperText>
          </Field>
          <Field>
            <Label htmlFor="combobox">Quick search</Label>
            <Combobox id="combobox" options={modelOptions} placeholder="Search models…" />
            <ErrorText>Inline validation copy can live here when needed.</ErrorText>
          </Field>
          <Field>
            <Label htmlFor="candidates">Candidates</Label>
            <NumberField id="candidates" min={1} max={8} value={candidateCount} onChangeValue={setCandidateCount} />
          </Field>
          <Field>
            <Label htmlFor="slider">Creativity</Label>
            <Slider id="slider" max={100} min={0} value={temperature} valueLabel={`${temperature}%`} onChange={(event) => setTemperature(Number(event.currentTarget.value))} />
          </Field>
          <Field>
            <Label htmlFor="switch">Persist intermediate artifacts</Label>
            <div className="flex items-center gap-3">
              <Switch checked={isPinned} onCheckedChange={setIsPinned} />
              <HelperText>Toggle-friendly primitive for settings and advanced options.</HelperText>
            </div>
          </Field>
          <Field>
            <Label htmlFor="notes">Run notes</Label>
            <Textarea id="notes" value={notes} onChange={(event) => setNotes(event.currentTarget.value)} />
          </Field>
        </div>
      </Section>

      <Section description="Prompt composition, image review, logging, stage audit, and model battle components." title="Workflow Primitives">
        <div className="space-y-6">
          <PromptEditor value={prompt} onReuse={() => setPrompt(`${prompt}\n\nReuse requested from history.`)} />
          <ImageGallery images={galleryImages} />
          <LogStream entries={logEntries} />
          <StageTimeline stages={timelineStages} />
          <BattleGrid items={battleItems} />
        </div>
      </Section>

      <Section description="Navigation and overlay primitives used by the shell and detail pages." title="Navigation & Overlays">
        <div className="space-y-6">
          <Breadcrumb items={[{ label: 'Home', to: '/generate' }, { label: 'History', to: '/history' }, { label: 'Run 9b2f4c' }]} />
          <Tabs
            items={[
              { content: <p className="m-0 text-sm text-secondary">Planner prompt, retrieved evidence, and final prompt diff.</p>, key: 'audit', label: 'Audit', meta: '3 items' },
              { content: <p className="m-0 text-sm text-secondary">Latency, failures, and retry events for the run.</p>, key: 'metrics', label: 'Metrics', meta: 'Live' },
              { content: <p className="m-0 text-sm text-secondary">Reuse, resume, and delete actions render here.</p>, key: 'actions', label: 'Actions' },
            ]}
          />
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => setIsModalOpen(true)}>
              Open modal
            </Button>
            <Button variant="danger" onClick={() => setIsDialogOpen(true)}>
              Open dialog
            </Button>
          </div>
        </div>
      </Section>

      <Section description="Graceful loading and empty-state primitives for async surfaces." title="Fallback Surfaces">
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="space-y-3">
            <Skeleton width="40%" />
            <Skeleton width="100%" />
            <Skeleton width="82%" />
          </div>
          <Empty description="This placeholder keeps page shells stable before the feature task lands." title="No run selected" />
        </div>
      </Section>

      <Modal
        description="Reusable overlay for detail drill-downs, prompt previews, and artifact inspection."
        footer={<Button onClick={() => setIsModalOpen(false)}>Close modal</Button>}
        onClose={() => setIsModalOpen(false)}
        open={isModalOpen}
        title="Shared modal surface"
      >
        <p className="m-0 text-sm text-secondary">Modal layout inherits the same card tokens and spacing scale as the rest of the system.</p>
      </Modal>

      <Dialog
        confirmLabel="Delete run"
        description="Dialog wraps the modal primitive for confirm/cancel workflows."
        onCancel={() => setIsDialogOpen(false)}
        onConfirm={() => setIsDialogOpen(false)}
        open={isDialogOpen}
        title="Confirm destructive action"
      />
    </div>
  );
}
