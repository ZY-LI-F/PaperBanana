import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExamplesApiError, listExamples, type ExampleRow } from '../../../api/examples';
import { EXAMPLES } from '../../../data/examples';
import { ExamplePicker } from '../ExamplePicker';

vi.mock('../../../api/examples', async () => {
  const actual = await vi.importActual<typeof import('../../../api/examples')>(
    '../../../api/examples',
  );
  return {
    ...actual,
    listExamples: vi.fn(),
  };
});

const mockedListExamples = vi.mocked(listExamples);

function buildExampleRows(): ExampleRow[] {
  return EXAMPLES.map((example, index) => ({
    ...example,
    suggested_aspect_ratio: example.suggested_aspect_ratio ?? null,
    image_path: null,
    priority: index === 0 ? 3 : 2,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }));
}

async function renderReadyPicker(onLoad = vi.fn(), disabled = false) {
  render(<ExamplePicker disabled={disabled} onLoad={onLoad} />);
  await screen.findByLabelText(/discipline/i);
  return onLoad;
}

describe('ExamplePicker', () => {
  beforeEach(() => {
    mockedListExamples.mockReset();
    mockedListExamples.mockResolvedValue(buildExampleRows());
  });

  test('renders both selects and the load button', async () => {
    render(<ExamplePicker onLoad={vi.fn()} />);

    expect(await screen.findByLabelText(/discipline/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/language/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /load example/i })).toBeInTheDocument();
    expect(mockedListExamples).toHaveBeenCalledTimes(1);
  });

  test('changing the discipline does not trigger loading', async () => {
    const user = userEvent.setup();
    const onLoad = await renderReadyPicker();

    await user.selectOptions(screen.getByLabelText(/discipline/i), EXAMPLES[1].id);

    expect(onLoad).not.toHaveBeenCalled();
  });

  test('loads the default localized payload on click', async () => {
    const user = userEvent.setup();
    const onLoad = await renderReadyPicker();

    await user.click(screen.getByRole('button', { name: /load example/i }));

    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onLoad).toHaveBeenCalledWith({
      id: EXAMPLES[0].id,
      methodContent: EXAMPLES[0].method_content_zh,
      caption: EXAMPLES[0].caption_zh,
      aspectRatio: EXAMPLES[0].suggested_aspect_ratio,
    });
  });

  test('switching locale to english loads english content', async () => {
    const user = userEvent.setup();
    const onLoad = await renderReadyPicker();

    await user.selectOptions(screen.getByLabelText(/language/i), 'en');
    await user.click(screen.getByRole('button', { name: /load example/i }));

    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onLoad).toHaveBeenCalledWith({
      id: EXAMPLES[0].id,
      methodContent: EXAMPLES[0].method_content_en,
      caption: EXAMPLES[0].caption_en,
      aspectRatio: EXAMPLES[0].suggested_aspect_ratio,
    });
  });

  test('disabled state prevents loading', async () => {
    const user = userEvent.setup();
    const onLoad = await renderReadyPicker(vi.fn(), true);
    const loadButton = screen.getByRole('button', { name: /load example/i });

    expect(loadButton).toBeDisabled();
    await user.click(loadButton);

    expect(onLoad).not.toHaveBeenCalled();
  });

  test('retry recovers from a failed load', async () => {
    const user = userEvent.setup();
    mockedListExamples
      .mockRejectedValueOnce(
        new ExamplesApiError('/api/examples', 500, 'Server Error', { detail: 'broken' }),
      )
      .mockResolvedValueOnce(buildExampleRows());

    render(<ExamplePicker onLoad={vi.fn()} />);

    expect(
      await screen.findByText(/failed to load examples/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /retry/i }));

    expect(await screen.findByLabelText(/discipline/i)).toBeInTheDocument();
    expect(mockedListExamples).toHaveBeenCalledTimes(2);
  });

  test('aborts the in-flight request on unmount', async () => {
    let capturedSignal: AbortSignal | undefined;
    mockedListExamples.mockImplementationOnce(({ signal } = {}) => {
      capturedSignal = signal;
      return new Promise(() => {});
    });

    const view = render(<ExamplePicker onLoad={vi.fn()} />);

    await waitFor(() => expect(mockedListExamples).toHaveBeenCalledTimes(1));
    view.unmount();

    expect(capturedSignal?.aborted).toBe(true);
  });
});
