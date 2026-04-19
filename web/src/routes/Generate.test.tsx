import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockApi = vi.hoisted(() => ({
  runs: {
    create: vi.fn(),
    detail: vi.fn(),
  },
  settings: {
    defaults: vi.fn().mockResolvedValue({
      defaults: { image_gen_model: 'image-model', main_model: 'main-model' },
    }),
    providers: vi.fn().mockResolvedValue({ providers: [] }),
  },
}));

vi.mock('../features/generate/FinalGallery', () => {
  throw new Error('Generate route should not import FinalGallery.');
});

vi.mock('../lib/api', () => ({
  api: mockApi,
}));

vi.mock('../features/generate/HeroGallery', () => ({
  default: () => <section data-testid="hero-gallery">HeroGallery</section>,
}));

vi.mock('../features/generate/GenerateForm', () => ({
  GenerateForm: () => <section data-testid="generate-form">GenerateForm</section>,
}));

vi.mock('../features/generate/StageTimeline', () => ({
  StageTimeline: () => <section data-testid="stage-timeline">StageTimeline</section>,
}));

vi.mock('../features/generate/hooks/useRunEvents', () => ({
  useRunEvents: () => ({ connectionState: 'closed', lastEventAt: null }),
}));

vi.mock('../features/generate/store', () => ({
  useGeneratePrefillStore: () => ({
    prefill: null,
    setPrefill: vi.fn(),
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useLocation: () => ({ state: null }),
  };
});

import GenerateRoute from './Generate';

describe('GenerateRoute', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('renders HeroGallery above the form grid and loads defaults', async () => {
    render(<GenerateRoute />);

    await waitFor(() => expect(mockApi.settings.providers).toHaveBeenCalledTimes(1));

    const heroGallery = screen.getByTestId('hero-gallery');
    const form = screen.getByTestId('generate-form');
    const relationship = heroGallery.compareDocumentPosition(form);

    expect(relationship & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    fireEvent.click(screen.getByRole('button', { name: /stage timeline/i }));
    expect(screen.getByTestId('stage-timeline')).toBeInTheDocument();
    expect(mockApi.settings.defaults).toHaveBeenCalledTimes(1);
  });
});
