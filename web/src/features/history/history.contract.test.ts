import {
  buildReuseState,
  buildStagePromptGroups,
  parseHistoryList,
  parseHistoryRunDetail,
} from './utils';

const list = parseHistoryList({
  items: [
    {
      aspect_ratio: '16:9',
      caption: 'Figure caption',
      created_at: '2026-04-19T00:00:00Z',
      exp_mode: 'demo_full',
      id: 'run-1',
      image_model: 'provider::image',
      kind: 'generate',
      main_model: 'provider::main',
      max_critic_rounds: 2,
      method_content: 'Method body',
      num_candidates: 4,
      retrieval_setting: 'auto',
      status: 'succeeded',
      updated_at: '2026-04-19T00:30:00Z',
    },
  ],
  limit: 20,
  offset: 0,
  total: 1,
});

if (list.total !== 1 || list.items[0]?.id !== 'run-1') {
  throw new Error('History list parsing should preserve run items and totals.');
}

const detail = parseHistoryRunDetail({
  aspect_ratio: '16:9',
  caption: 'Figure caption',
  created_at: '2026-04-19T00:00:00Z',
  exp_mode: 'demo_full',
  id: 'run-1',
  image_model: 'provider::image',
  kind: 'generate',
  main_model: 'provider::main',
  max_critic_rounds: 2,
  method_content: 'Method body',
  num_candidates: 4,
  planner_prompt: 'planner prompt',
  retrieval_setting: 'auto',
  reuse: {
    parent_run_id: 'run-1',
    method_content: 'Method body',
  },
  stages: [
    {
      image_urls: [],
      payload: {
        caption: 'Figure caption',
        content: 'Method body',
        top10_references: ['ref-1', 'ref-2'],
      },
      stage_name: 'retriever',
      status: 'succeeded',
    },
    {
      image_urls: ['/api/runs/run-1/image/stages/planner/candidate_0.png'],
      payload: {
        caption: 'Figure caption',
        content: 'Method body',
        target_diagram_desc0: 'planner prompt',
        top10_references: ['ref-1', 'ref-2'],
      },
      stage_name: 'planner',
      status: 'succeeded',
    },
  ],
  status: 'succeeded',
  updated_at: '2026-04-19T00:30:00Z',
  visualizer_prompt: 'visualizer prompt',
});

const reuse = buildReuseState(detail);
if (reuse.parent_run_id !== 'run-1' || reuse.method_content !== 'Method body') {
  throw new Error('Reuse mapping should preserve parent_run_id and form inputs.');
}

const plannerPrompts = buildStagePromptGroups(detail.stages[1]);
if (plannerPrompts.output[0]?.value !== 'planner prompt') {
  throw new Error('Planner stage should expose prompt output blocks.');
}
