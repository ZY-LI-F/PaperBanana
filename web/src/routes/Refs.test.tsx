import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createRef,
  deleteRef,
  deleteRefImage,
  listRefs,
  updateRef,
  updateRefImage,
  uploadRefImage,
  type RefImage,
  type RefRow,
} from '../api/refs';

vi.mock('../api/refs', async () => {
  const actual = await vi.importActual<typeof import('../api/refs')>('../api/refs');
  return {
    ...actual,
    createRef: vi.fn(),
    deleteRef: vi.fn(),
    deleteRefImage: vi.fn(),
    listRefs: vi.fn(),
    updateRef: vi.fn(),
    updateRefImage: vi.fn(),
    uploadRefImage: vi.fn(),
  };
});

vi.mock('../components/refs/RefEditor', () => ({
  RefEditor: (props: {
    onClose: () => void;
    onSave: (payload: {
      additional_info: Record<string, unknown> | null;
      category: string | null;
      content: string;
      visual_intent: string;
    }) => Promise<void>;
    open: boolean;
    task: string;
  }) => {
    if (!props.open) return null;
    return (
      <section>
        <p>editor-{props.task}</p>
        <button
          type="button"
          onClick={() =>
            void props.onSave({
              additional_info: { source: 'test' },
              category: 'data_analysis',
              content: 'saved content',
              visual_intent: 'saved intent',
            })
          }
        >
          save ref
        </button>
        <button type="button" onClick={props.onClose}>
          close editor
        </button>
      </section>
    );
  },
}));

vi.mock('../components/refs/RefImageManager', () => ({
  RefImageManager: (props: {
    onDeleteImage: (image: RefImage) => Promise<void>;
    onUpdateImage: (key: string, patch: { order_index: number }) => Promise<void>;
    onUploadImage: (
      file: File,
      payload: { order_index: number; role: 'variant'; style: string | null }
    ) => Promise<void>;
    open: boolean;
  }) => {
    if (!props.open) return null;
    return (
      <section>
        <button
          type="button"
          onClick={() =>
            void props.onUploadImage(new File(['img'], 'variant.png', { type: 'image/png' }), {
              order_index: 2,
              role: 'variant',
              style: 'flat',
            })
          }
        >
          upload image
        </button>
        <button
          type="button"
          onClick={() => void props.onUpdateImage('overlay-key', { order_index: 3 })}
        >
          save image
        </button>
        <button
          type="button"
          onClick={() =>
            void props.onDeleteImage({
              key: 'overlay-key',
              order_index: 3,
              role: 'variant',
              source: 'overlay',
              style: 'flat',
            })
          }
        >
          delete image
        </button>
      </section>
    );
  },
}));

vi.mock('../components/refs/RefList', () => ({
  RefList: (props: {
    onDelete: (task: 'diagram' | 'plot', row: RefRow) => void;
    onEdit: (task: 'diagram' | 'plot', row: RefRow) => void;
    onManageImages: (task: 'diagram' | 'plot', row: RefRow) => void;
    refs: RefRow[];
    task: 'diagram' | 'plot';
  }) => (
    <section>
      <p>{props.task}-list</p>
      {props.refs.map((row) => (
        <div key={row.id}>
          <span>{row.id}</span>
          <button type="button" onClick={() => props.onEdit(props.task, row)}>
            edit-{row.id}
          </button>
          <button type="button" onClick={() => props.onManageImages(props.task, row)}>
            manage-{row.id}
          </button>
          <button type="button" onClick={() => props.onDelete(props.task, row)}>
            delete-{row.id}
          </button>
        </div>
      ))}
    </section>
  ),
}));

import RefsRoute from './Refs';

const mockedCreateRef = vi.mocked(createRef);
const mockedDeleteRef = vi.mocked(deleteRef);
const mockedDeleteRefImage = vi.mocked(deleteRefImage);
const mockedListRefs = vi.mocked(listRefs);
const mockedUpdateRef = vi.mocked(updateRef);
const mockedUpdateRefImage = vi.mocked(updateRefImage);
const mockedUploadRefImage = vi.mocked(uploadRefImage);

const DIAGRAM_ROWS = [buildRow('diagram-ref')];
const PLOT_ROWS = [buildRow('plot-ref')];

describe('RefsRoute', () => {
  beforeEach(() => {
    mockedCreateRef.mockReset();
    mockedDeleteRef.mockReset();
    mockedDeleteRefImage.mockReset();
    mockedListRefs.mockReset();
    mockedUpdateRef.mockReset();
    mockedUpdateRefImage.mockReset();
    mockedUploadRefImage.mockReset();
    mockedListRefs.mockImplementation((task) =>
      Promise.resolve(task === 'diagram' ? DIAGRAM_ROWS : PLOT_ROWS)
    );
    mockedCreateRef.mockResolvedValue(buildRow('created-ref'));
    mockedDeleteRef.mockResolvedValue();
    mockedDeleteRefImage.mockResolvedValue();
    mockedUpdateRef.mockResolvedValue(buildRow('updated-ref'));
    mockedUpdateRefImage.mockResolvedValue(buildRow('updated-ref'));
    mockedUploadRefImage.mockResolvedValue(buildRow('updated-ref'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('switches tabs between diagram and plot refs', async () => {
    const user = userEvent.setup();

    render(<RefsRoute />);

    await waitFor(() => expect(mockedListRefs).toHaveBeenCalledTimes(2));
    expect(screen.getByText('diagram-ref')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /plot/i }));

    expect(screen.getByText('plot-ref')).toBeInTheDocument();
    expect(screen.queryByText('diagram-ref')).not.toBeInTheDocument();
  });

  test('creates a ref in the active tab and refreshes both task lists', async () => {
    const user = userEvent.setup();

    render(<RefsRoute />);

    await waitFor(() => expect(mockedListRefs).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole('button', { name: /plot/i }));
    await user.click(screen.getByRole('button', { name: /new ref/i }));
    await user.click(screen.getByRole('button', { name: /save ref/i }));

    await waitFor(() => {
      expect(mockedCreateRef).toHaveBeenCalledWith('plot', {
        additional_info: { source: 'test' },
        category: 'data_analysis',
        content: 'saved content',
        visual_intent: 'saved intent',
      });
      expect(mockedListRefs).toHaveBeenCalledTimes(4);
    });
  });

  test('routes image manager actions to the selected ref', async () => {
    const user = userEvent.setup();

    render(<RefsRoute />);

    await waitFor(() => expect(mockedListRefs).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole('button', { name: /manage-diagram-ref/i }));
    await user.click(screen.getByRole('button', { name: /upload image/i }));
    await user.click(screen.getByRole('button', { name: /save image/i }));
    await user.click(screen.getByRole('button', { name: /delete image/i }));

    await waitFor(() => {
      expect(mockedUploadRefImage).toHaveBeenCalledWith(
        'diagram',
        'diagram-ref',
        expect.any(File),
        { order_index: 2, role: 'variant', style: 'flat' }
      );
      expect(mockedUpdateRefImage).toHaveBeenCalledWith('diagram', 'diagram-ref', 'overlay-key', {
        order_index: 3,
      });
      expect(mockedDeleteRefImage).toHaveBeenCalledWith('diagram', 'diagram-ref', 'overlay-key');
    });
  });
});

function buildRow(id: string): RefRow {
  return {
    _baseline: false,
    additional_info: null,
    category: 'data_analysis',
    content: 'content',
    id,
    images: [],
    primary_image_key: null,
    visual_intent: 'visual intent',
  };
}
