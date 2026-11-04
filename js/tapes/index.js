import { TAPE1 } from './tape1.js';
import { TAPE2 } from './tape2.js';
import { TAPE3 } from './tape3.js';

// The shelf. Tapes without a level are still being recorded.
export const TAPES = [
  TAPE1,
  TAPE2,
  TAPE3,
  { id: 't4', number: '04', title: 'CLOSING TIME', blurb: 'the mall is now closed.' },
];
