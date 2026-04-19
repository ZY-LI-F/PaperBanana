export type RefineFormValues = {
  aspectRatio: string;
  imageModel: string;
  prompt: string;
  resolution: string;
};

export type RefineFormErrors = Partial<Record<'file' | 'imageModel' | 'prompt', string>>;

export type RefineApiResponse = {
  finalImagePath: string;
  imageBase64: string;
  runId: string;
};

export type RefineResult = {
  blob: Blob;
  downloadName: string;
  previewUrl: string;
  runId: string;
};
