import { Clock } from '../application/ports.js';

export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
