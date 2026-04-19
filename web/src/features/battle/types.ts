import type { StageTimelineItem } from '../../components/ui';
import type { RunStatus } from '../../lib/api';

export type ModelOption = {
  id: string;
  label: string;
  modelName: string;
  providerId: string;
  providerName: string;
};

export type SettingsDefaults = {
  image_gen_model?: string;
  main_model?: string;
};

export type BattleFormValues = {
  aspectRatio: string;
  caption: string;
  expMode: string;
  imageModels: string[];
  mainModel: string;
  maxCriticRounds: number;
  methodContent: string;
  retrievalSetting: string;
};

export type SubmitBattleInput = BattleFormValues & {
  modelLabels: Record<string, string>;
};

export type BattleCell = {
  detailHref?: string | null;
  elapsedLabel: string;
  error?: string | null;
  id: string;
  imageSrc?: string | null;
  modelId: string;
  modelLabel: string;
  status: RunStatus;
};

export type BattleState = {
  cells: BattleCell[];
  error: string | null;
  isSubmitting: boolean;
  parentRunId: string | null;
  parentStatus: RunStatus | null;
  stages: StageTimelineItem[];
  submit: (input: SubmitBattleInput) => Promise<void>;
};
