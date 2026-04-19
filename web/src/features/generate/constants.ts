import type { Option } from '../../components/ui/shared';

export const EXAMPLE_KEY = 'paper-banana';

export const EXAMPLE_OPTIONS: Option[] = [
  { label: 'None', value: 'none' },
  { label: 'PaperBanana Framework', value: EXAMPLE_KEY },
];

export const PIPELINE_DESCRIPTIONS: Record<string, string> = {
  demo_full:
    'Retriever -> Planner -> Stylist -> Visualizer -> Critic -> Visualizer',
  demo_planner_critic:
    'Retriever -> Planner -> Visualizer -> Critic -> Visualizer (no Stylist)',
};

export const PIPELINE_OPTIONS: Option[] = [
  { label: 'demo_planner_critic', value: 'demo_planner_critic' },
  { label: 'demo_full', value: 'demo_full' },
];

export const RETRIEVAL_OPTIONS: Option[] = [
  { label: 'Auto', value: 'auto' },
  { label: 'Manual', value: 'manual' },
  { label: 'Random', value: 'random' },
  { label: 'None', value: 'none' },
];

export const ASPECT_RATIO_OPTIONS: Option[] = [
  { label: '16:9', value: '16:9' },
  { label: '21:9', value: '21:9' },
  { label: '3:2', value: '3:2' },
];

export const FIGURE_SIZE_OPTIONS: Option[] = [
  { label: '1-3cm', value: '1-3cm' },
  { label: '4-6cm', value: '4-6cm' },
  { label: '7-9cm', value: '7-9cm' },
  { label: '10-13cm', value: '10-13cm' },
  { label: '14-17cm', value: '14-17cm' },
];

export const FIGURE_LANGUAGE_OPTIONS: Option[] = [
  { label: 'Auto (follow input language)', value: '' },
  { label: '简体中文 (force Chinese text)', value: 'zh' },
  { label: 'English (force English text)', value: 'en' },
];

export const EXAMPLE_METHOD = `## Methodology: The PaperBanana Framework

In this section, we present the architecture of PaperBanana, a reference-driven agentic framework for automated academic illustration. As illustrated in Figure \\ref{fig:methodology_diagram}, PaperBanana orchestrates a collaborative team of five specialized agents--Retriever, Planner, Stylist, Visualizer, and Critic--to transform raw scientific content into publication-quality diagrams and plots. (See Appendix \\ref{app_sec:agent_prompts} for prompts)

### Retriever Agent

Given the source context $S$ and the communicative intent $C$, the Retriever Agent identifies $N$ most relevant examples $\\mathcal{E} = \\{E_n\\}_{n=1}^{N} \\subset \\mathcal{R}$ from the fixed reference set $\\mathcal{R}$ to guide the downstream agents. As defined in Section \\ref{sec:task_formulation}, each example $E_i \\in \\mathcal{R}$ is a triplet $(S_i, C_i, I_i)$.
To leverage the reasoning capabilities of VLMs, we adopt a generative retrieval approach where the VLM performs selection over candidate metadata:
$$
\\mathcal{E} = \\text{VLM}_{\\text{Ret}} \\left( S, C, \\{ (S_i, C_i) \\}_{E_i \\in \\mathcal{R}} \\right)
$$

### Planner Agent

The Planner Agent serves as the cognitive core of the system. It takes the source context $S$, communicative intent $C$, and retrieved examples $\\mathcal{E}$ as inputs:
$$
P = \\text{VLM}_{\\text{plan}}(S, C, \\{ (S_i, C_i, I_i) \\}_{E_i \\in \\mathcal{E}})
$$

### Stylist Agent

The Stylist refines each initial description $P$ into a stylistically optimized version $P^*$:
$$
P^* = \\text{VLM}_{\\text{style}}(P, \\mathcal{G})
$$

### Visualizer Agent

The Visualizer Agent leverages an image generation model:
$$
I_t = \\text{Image-Gen}(P_t)
$$

### Critic Agent

The Critic provides targeted feedback and produces a refined description:
$$
P_{t+1} = \\text{VLM}_{\\text{critic}}(I_t, S, C, P_t)
$$
The Visualizer-Critic loop iterates for $T=3$ rounds.`;

export const EXAMPLE_CAPTION =
  'Figure 1: Overview of our PaperBanana framework. Given the source context and communicative intent, we first apply a Linear Planning Phase to retrieve relevant reference examples and synthesize a stylistically optimized description. We then use an Iterative Refinement Loop (consisting of Visualizer and Critic agents) to transform the description into visual output and conduct multi-round refinements to produce the final academic illustration.';
