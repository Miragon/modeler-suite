import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { EXAMPLE_DIAGRAM } from '../src/examples.js';

it('keeps the example file, which Orca and the smoke tests open, equal to EXAMPLE_DIAGRAM', () => {
  const file = readFileSync(
    new URL('../../../example/order-fulfilment.__EXT__', import.meta.url),
    'utf8',
  );
  expect(file).toBe(EXAMPLE_DIAGRAM);
});
