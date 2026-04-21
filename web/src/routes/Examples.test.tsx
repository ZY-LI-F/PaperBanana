import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createExample,
  deleteExample,
  listExamples,
  updateExample,
  uploadExampleImage,
  type ExampleRow,
} from '../api/examples';

const mockExampleEditor = vi.fn();
const mockExampleList = vi.fn();

vi.mock('../api/examples', async () => {
  const actual = await vi.importActual<typeof import('../api/examples')>('../api/examples');
  return {
    ...actual,
    createExample: vi.fn(),
    deleteExample: vi.fn(),
    listExamples: vi.fn(),
    updateExample: vi.fn(),
    uploadExampleImage: vi.fn(),
  };
});

vi.mock('../components/examples/ExampleEditor', () => ({
  ExampleEditor: (props: {
    error: string | null;
    onImageChange: (file: File | null) => void;
    onSave: () => void;
    open: boolean;
  }) => {
    mockExampleEditor(props);
    if (!props.open) return null;
    return (
      <section>
        <label htmlFor="example-image">Image</label>
        <input
          id="example-image"
          type="file"
          onChange={(event) => props.onImageChange(event.currentTarget.files?.[0] ?? null)}
        />
        <button onClick={props.onSave} type="button">
          保存示例 / Save Example
        </button>
        {props.error ? <p>{props.error}</p> : null}
      </section>
    );
  },
}));

vi.mock('../components/examples/ExampleList', () => ({
  ExampleList: (props: { examples: ExampleRow[] }) => {
    mockExampleList(props.examples);
    return (
      <section>
        {props.examples.map((example) => (
          <p key={example.id}>{example.title_zh}</p>
        ))}
      </section>
    );
  },
}));

import ExamplesRoute from './Examples';

const mockedCreateExample = vi.mocked(createExample);
const mockedDeleteExample = vi.mocked(deleteExample);
const mockedListExamples = vi.mocked(listExamples);
const mockedUpdateExample = vi.mocked(updateExample);
const mockedUploadExampleImage = vi.mocked(uploadExampleImage);

function buildExampleRow(): ExampleRow {
  return {
    id: 'example-1',
    discipline: 'biology',
    title_en: 'Cell cycle overview',
    title_zh: '细胞周期概览',
    method_content_en: 'English method',
    method_content_zh: '中文方法',
    caption_en: 'English caption',
    caption_zh: '中文图注',
    suggested_aspect_ratio: '16:9',
    image_path: 'results/examples/example-1.png',
    priority: 2,
    created_at: '2026-04-21T00:00:00Z',
    updated_at: '2026-04-21T00:00:00Z',
  };
}

describe('ExamplesRoute', () => {
  beforeEach(() => {
    mockExampleEditor.mockClear();
    mockExampleList.mockClear();
    mockedCreateExample.mockReset();
    mockedDeleteExample.mockReset();
    mockedListExamples.mockReset();
    mockedUpdateExample.mockReset();
    mockedUploadExampleImage.mockReset();
  });

  test('refreshes the list before showing an upload error after create succeeds', async () => {
    const createdExample = buildExampleRow();
    const user = userEvent.setup();

    mockedListExamples.mockResolvedValueOnce([]).mockResolvedValueOnce([createdExample]);
    mockedCreateExample.mockResolvedValue(createdExample);
    mockedUploadExampleImage.mockRejectedValue(new Error('upload failed'));

    render(<ExamplesRoute />);

    await waitFor(() => expect(mockedListExamples).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: /new example/i }));
    await user.upload(
      screen.getByLabelText(/image/i),
      new File(['image'], 'example.png', { type: 'image/png' }),
    );
    await user.click(screen.getByRole('button', { name: /save example/i }));

    await waitFor(() => {
      expect(mockedCreateExample).toHaveBeenCalledTimes(1);
      expect(mockedUploadExampleImage).toHaveBeenCalledTimes(1);
      expect(mockedListExamples).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText(createdExample.title_zh)).toBeInTheDocument();
    expect(await screen.findByText('upload failed')).toBeInTheDocument();
    expect(mockedUpdateExample).not.toHaveBeenCalled();
  });
});
