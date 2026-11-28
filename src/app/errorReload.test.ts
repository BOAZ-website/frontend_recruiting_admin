// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { ERROR_RELOAD_KEY, isScreenRestoreKey, recordErrorReload } from './errorReload';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('오류 자동 복구', () => {
  it('이 앱의 boaz_recruit_* 키만 지우고 같은 출처의 다른 앱 키는 남긴다', () => {
    localStorage.setItem('boaz_recruit_sidebar_open', 'false');
    localStorage.setItem('boaz_is_logged_in', 'true');
    localStorage.setItem('boaz_admin_some_setting', 'x');
    sessionStorage.setItem('boaz_recruit_detail', '{}');
    sessionStorage.setItem('boaz_other_app', 'y');

    expect(recordErrorReload(1_000)).toBe(true);

    expect(localStorage.getItem('boaz_recruit_sidebar_open')).toBeNull();
    expect(sessionStorage.getItem('boaz_recruit_detail')).toBeNull();
    expect(localStorage.getItem('boaz_is_logged_in')).toBe('true');
    expect(localStorage.getItem('boaz_admin_some_setting')).toBe('x');
    expect(sessionStorage.getItem('boaz_other_app')).toBe('y');
    expect(sessionStorage.getItem(ERROR_RELOAD_KEY)).not.toBeNull();
  });

  it('지울 키 판단', () => {
    expect(isScreenRestoreKey('boaz_recruit_menu')).toBe(true);
    expect(isScreenRestoreKey('boaz_username')).toBe(false);
  });
});
