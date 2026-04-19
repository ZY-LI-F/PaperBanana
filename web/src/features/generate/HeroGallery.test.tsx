import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import HeroGallery from './HeroGallery';
import type { HeroVariant } from './types';

const VARIANTS: HeroVariant[] = [
  {
    candidateIndex: 0,
    downloadName: 'run-123_final_candidate_0.png',
    id: 'final-0',
    label: 'Final candidate 1',
    stage: 'final',
    url: '/api/runs/run-123/image/final/candidate_0.png',
  },
  {
    candidateIndex: 1,
    downloadName: 'run-123_critic_0_candidate_1.png',
    id: 'critic_0-1',
    label: 'Critic 1 candidate 2',
    stage: 'critic_0',
    url: '/api/runs/run-123/image/stages/critic_0/candidate_1.png',
  },
];

describe('HeroGallery', () => {
  test('shows the placeholder while artifacts are still pending', () => {
    render(<HeroGallery runId="run-123" runStatus="running" variants={[]} />);

    expect(
      screen.getByText('Final artifacts will appear here once generation completes.')
    ).toBeInTheDocument();
  });

  test('switches the hero preview and download target when a tile is clicked', async () => {
    const user = userEvent.setup();
    render(<HeroGalleryHarness variants={VARIANTS} />);

    const downloadLink = screen.getByRole('link', { name: 'Download' });
    expect(downloadLink).toHaveAttribute('download', 'run-123_final_candidate_0.png');
    expect(screen.getByTestId('hero-gallery-image')).toHaveAttribute(
      'src',
      '/api/runs/run-123/image/final/candidate_0.png'
    );

    await user.click(screen.getByRole('button', { name: /critic 1 candidate 2/i }));

    expect(screen.getByTestId('hero-gallery-image')).toHaveAttribute(
      'src',
      '/api/runs/run-123/image/stages/critic_0/candidate_1.png'
    );
    expect(downloadLink).toHaveAttribute('download', 'run-123_critic_0_candidate_1.png');
    expect(downloadLink).toHaveAttribute(
      'href',
      '/api/runs/run-123/image/stages/critic_0/candidate_1.png'
    );
  });
});

function HeroGalleryHarness({ variants }: { variants: HeroVariant[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <HeroGallery
      onSelect={setSelectedId}
      runId="run-123"
      runStatus="succeeded"
      selectedId={selectedId}
      variants={variants}
    />
  );
}
