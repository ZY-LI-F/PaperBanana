import { EXAMPLE_CAPTION, EXAMPLE_METHOD } from './constants';
import type { GenerateFormState, GeneratePrefill } from './types';

type FormAction =
  | {
      field: keyof GenerateFormState;
      type: 'setField';
      value: GenerateFormState[keyof GenerateFormState];
    }
  | {
      prefill: GeneratePrefill;
      type: 'applyPrefill';
    }
  | {
      imageModel: string;
      mainModel: string;
      type: 'applyModelDefaults';
    };

export function createInitialFormState(): GenerateFormState {
  return {
    aspectRatio: '21:9',
    caption: EXAMPLE_CAPTION,
    expMode: 'demo_full',
    figureLanguage: '',
    figureSize: '7-9cm',
    imageModel: '',
    mainModel: '',
    maxCriticRounds: 3,
    methodContent: EXAMPLE_METHOD,
    numCandidates: 10,
    parentRunId: '',
    retrievalSetting: 'auto',
  };
}

export function formReducer(
  state: GenerateFormState,
  action: FormAction,
): GenerateFormState {
  if (action.type === 'setField') {
    return { ...state, [action.field]: action.value };
  }
  if (action.type === 'applyPrefill') {
    return applyPrefill(state, action.prefill);
  }
  return applyModelDefaults(state, action.mainModel, action.imageModel);
}

function applyPrefill(
  state: GenerateFormState,
  prefill: GeneratePrefill,
): GenerateFormState {
  const nextState = { ...state };
  Object.entries(prefill).forEach(([field, value]) => {
    if (value !== undefined) {
      nextState[field as keyof GenerateFormState] = value as never;
    }
  });
  return nextState;
}

function applyModelDefaults(
  state: GenerateFormState,
  mainModel: string,
  imageModel: string,
): GenerateFormState {
  return {
    ...state,
    imageModel: state.imageModel || imageModel,
    mainModel: state.mainModel || mainModel,
  };
}
