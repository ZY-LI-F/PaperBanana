import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EXAMPLES } from '../../../data/examples';
import { ExamplePicker } from '../ExamplePicker';

describe('ExamplePicker', () => {
  test('renders both selects and the load button', () => {
    render(<ExamplePicker onLoad={vi.fn()} />);

    expect(screen.getByLabelText(/discipline/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/language/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /load example/i })).toBeInTheDocument();
  });

  test('changing the discipline does not trigger loading', async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn();

    render(<ExamplePicker onLoad={onLoad} />);

    await user.selectOptions(screen.getByLabelText(/discipline/i), EXAMPLES[1].id);

    expect(onLoad).not.toHaveBeenCalled();
  });

  test('loads the default localized payload on click', async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn();

    render(<ExamplePicker onLoad={onLoad} />);

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
    const onLoad = vi.fn();

    render(<ExamplePicker onLoad={onLoad} />);

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
    const onLoad = vi.fn();

    render(<ExamplePicker disabled onLoad={onLoad} />);

    const loadButton = screen.getByRole('button', { name: /load example/i });
    expect(loadButton).toBeDisabled();

    await user.click(loadButton);

    expect(onLoad).not.toHaveBeenCalled();
  });
});
