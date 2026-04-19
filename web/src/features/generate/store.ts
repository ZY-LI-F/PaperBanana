import { create } from 'zustand';
import type { GeneratePrefill } from './types';

type GeneratePrefillStore = {
  clearPrefill: () => void;
  prefill: GeneratePrefill | null;
  setPrefill: (prefill: GeneratePrefill | null) => void;
};

export const useGeneratePrefillStore = create<GeneratePrefillStore>((set) => ({
  clearPrefill: () => set({ prefill: null }),
  prefill: null,
  setPrefill: (prefill) => set({ prefill }),
}));
