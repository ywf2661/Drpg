import { expect, test } from 'vitest';
import { parseSound } from './sound';

test('소리 설정: 저장된 값을 읽고, 없거나 이상하면 기본값(효과음·음악 100%, 켜짐)', () => {
  const def = { sfx: 1, music: 1, muted: false };
  expect(parseSound(null)).toEqual(def);
  expect(parseSound('{bad')).toEqual(def);
  expect(parseSound(JSON.stringify({ sfx: 0.3, music: 0, muted: true }))).toEqual({ sfx: 0.3, music: 0, muted: true });
  expect(parseSound(JSON.stringify({ sfx: 2, music: -1, muted: 'yes' }))).toEqual({ sfx: 1, music: 0, muted: false }); // 범위 밖은 자르고, 이상한 값은 기본
  expect(parseSound(JSON.stringify({ sfx: 'x' }))).toEqual(def);
});
