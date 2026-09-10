import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addWavyUnderline } from '../public/admin/bracket-buttons.js';

test('adds one combining wave below each non-whitespace grapheme', () => {
  assert.equal(addWavyUnderline('波浪 underline'), '波\u0330浪\u0330 u\u0330n\u0330d\u0330e\u0330r\u0330l\u0330i\u0330n\u0330e\u0330');
  assert.equal(addWavyUnderline('好\u0330'), '好\u0330');
  assert.equal(addWavyUnderline('👩‍💻'), '👩‍💻\u0330');
});
