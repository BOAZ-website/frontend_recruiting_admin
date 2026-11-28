import { describe, expect, it } from 'vitest';

import { loadAfterSaves } from './useEvaluationData';

describe('늦은 목록 응답', () => {
  it('읽는 사이에 저장이 끝나면 저장 전 응답을 버리고 다시 읽는다', async () => {
    let generation = 0;
    const responses = ['저장 전 목록', '저장 후 목록'];
    const load = async () => {
      const value = responses.shift()!;
      // 첫 조회가 도착하기 전에 저장이 끝난다.
      if (value === '저장 전 목록') generation += 1;
      return value;
    };
    await expect(loadAfterSaves(load, () => generation)).resolves.toBe('저장 후 목록');
  });

  it('저장이 없으면 한 번만 읽고 서버 값을 그대로 따른다', async () => {
    let calls = 0;
    const load = async () => {
      calls += 1;
      return '목록';
    };
    await expect(loadAfterSaves(load, () => 0)).resolves.toBe('목록');
    expect(calls).toBe(1);
  });
});
