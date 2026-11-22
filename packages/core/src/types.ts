/** The pipeline steps. Private steps run only on the device; `reason` may use the cloud. */
export type Step = 'detect' | 'minimize' | 'route' | 'answerLocal' | 'reason';

export const PRIVATE_STEPS: readonly Step[] = ['detect', 'minimize', 'route', 'answerLocal'];
