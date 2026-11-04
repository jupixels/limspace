import { TAPE1 } from './tape1.js';
import { TAPE2 } from './tape2.js';

// The shelf. Tapes without a level are still being recorded.
export const TAPES = [
  TAPE1,
  TAPE2,
  { id: 't3', number: '03', title: 'RECESS', blurb: 'the party is still waiting for you.' },
  { id: 't4', number: '04', title: 'CLOSING TIME', blurb: 'the mall is now closed.' },
];
