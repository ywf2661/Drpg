import { expect, test } from 'vitest';
import { musicFor } from './sound';

test('배경 음악: 1~4층 던전, 5층(보스) 보스 테마', () => {
  expect([1, 2, 3, 4, 5].map(musicFor)).toEqual(['dungeon_theme', 'dungeon_theme', 'dungeon_theme', 'dungeon_theme', 'boss_theme']);
});
