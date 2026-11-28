import { useEffect, useRef, useState } from 'react';
import { Menu, User } from 'lucide-react';

import { logout, restoreSession } from '@/entities/auth/api/authApi';
import type { AuthSession } from '@/entities/auth/model/types';
import { trackImageOf } from '@/entities/user/model/trackImage';
import { fetchRecruitments, type RecruitmentDto } from '@/entities/recruitment/api/recruitmentApi';
import { visibleTracksOf } from '@/pages/recruiting-evaluation/model/applicantList';
import { TRACK_LABELS, type TrackType } from '@/pages/recruiting-evaluation/model/types';
import { EvaluationManagePage } from '@/pages/recruiting-evaluation/ui/EvaluationManagePage';
import { setSessionExpiredHandler } from '@/shared/api/client';
import boazLogo from '@/shared/assets/boaz-logo.png';
import { confirmLeave } from '@/shared/lib/leaveGuard';
import { LoginScreen } from '@/widgets/login-modal/ui/LoginScreen';

// 사이드바를 펼쳐 둘지. 브라우저마다 기억한다.
const SIDEBAR_OPEN_KEY = 'boaz_recruit_sidebar_open';
/** 접힌 사이드바를 띄우기 전, ☰·왼쪽 가장자리에 마우스가 머물러야 하는 시간. */
const PEEK_OPEN_DELAY_MS = 300;
/** 띄운 사이드바에서 마우스가 벗어난 뒤 닫히기까지의 시간. ☰와 사이드바 사이 빈틈을 지나도 닫히지 않게 한다. */
const PEEK_CLOSE_DELAY_MS = 200;

function readSidebarOpen(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_OPEN_KEY) !== 'false';
  } catch {
    return true;
  }
}

/** 상단 메뉴. 전체 지원 현황 또는 부문별 서류 평가. */
type Menu = { tab: 'applicants' } | { tab: 'my'; track: TrackType };

// 새로고침해도 보던 메뉴로 돌아오게 탭마다 기억한다. 값은 부문 이름 또는 'applicants'.
const MENU_KEY = 'boaz_recruit_menu';
// 로그아웃하면 지우는 화면 기억값. boaz_recruit_detail은 EvaluationManagePage의 DETAIL_KEY,
// boaz_recruit_answers_scroll은 ApplicantReviewDetail의 답변 스크롤 위치다.
const SCREEN_MEMORY_KEYS = [MENU_KEY, 'boaz_recruit_detail', 'boaz_recruit_answers_scroll'];

/** 다음에 같은 탭에서 로그인한 사람이 앞사람이 보던 화면으로 들어가지 않게 지운다. */
function forgetScreenMemory() {
  try {
    SCREEN_MEMORY_KEYS.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // 저장소를 쓸 수 없으면 남은 값도 없다.
  }
}
const TRACKS: readonly TrackType[] = ['ANALYSIS', 'VISUALIZATION', 'ENGINEERING'];

function readMenu(): Menu {
  try {
    const saved = sessionStorage.getItem(MENU_KEY);
    const track = TRACKS.find((item) => item === saved);
    if (track) return { tab: 'my', track };
  } catch {
    // 읽지 못하면 전체 지원 현황에서 시작한다.
  }
  return { tab: 'applicants' };
}

/**
 * 평가할 공고. 공고는 한 번에 하나만 올라오고 합격자를 뽑을 때까지 그대로 두므로, 기수가 가장 큰 공고가 지금 평가할 공고다.
 * 접수가 끝나 진행 중(is_active)이 아니어도 평가는 계속하므로 진행 여부로 고르지 않는다.
 */
function defaultRecruitmentOf(recruitments: RecruitmentDto[]): RecruitmentDto | undefined {
  return [...recruitments].sort((a, b) => b.term - a.term)[0];
}

/** 사이드바 맨 위 로고. 옆에 BrandText를 둔다. */
function BrandLogo() {
  return (
    <img
      src={boazLogo}
      alt=""
      width={28}
      height={28}
      className="size-7 rounded-full border border-slate-100/80 object-contain shadow-2xs transition-colors group-hover:border-slate-300"
    />
  );
}

function BrandText() {
  return (
    <span className="text-[15px] font-semibold whitespace-nowrap text-sky-950">bigdata BOAZ</span>
  );
}

/** 서류 평가 전용 관리자 화면. 로그인 → 모집 공고 선택 → 전체 지원 현황·부문별 서류 평가. */
export default function App() {
  // undefined: 새로고침 뒤 로그인 상태를 되살리는 중, null: 로그인 전.
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined);
  const [recruitments, setRecruitments] = useState<RecruitmentDto[] | null>(null);
  const [recruitmentError, setRecruitmentError] = useState<string | null>(null);
  const [recruitmentId, setRecruitmentId] = useState<number | null>(null);
  const [savedMenu, setMenu] = useState<Menu>(readMenu);
  // 메뉴를 누를 때마다 올린다. 화면이 지원자 상세를 닫고 목록으로 돌아간다.
  const [listRequest, setListRequest] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(readSidebarOpen);
  // 사이드바를 접었을 때 왼쪽 위 ☰나 왼쪽 가장자리에 마우스를 올리면 사이드바를 본문 위에 띄워 보여 준다(노션처럼).
  // 마우스가 잠깐 빈틈을 지나도 닫히지 않게 조금 늦게 닫는다.
  const [isPeeking, setIsPeeking] = useState(false);
  const peekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showPeek = () => {
    if (peekTimerRef.current) clearTimeout(peekTimerRef.current);
    // 이미 떠 있으면(띄운 사이드바 안으로 들어온 경우) 닫힘만 취소하고, 아니면 잠깐 머문 뒤에 띄운다.
    // 마우스가 ☰나 왼쪽 가장자리를 스치기만 해서는 열리지 않는다.
    if (isPeeking) return;
    peekTimerRef.current = setTimeout(() => setIsPeeking(true), PEEK_OPEN_DELAY_MS);
  };
  const hidePeek = () => {
    if (peekTimerRef.current) clearTimeout(peekTimerRef.current);
    peekTimerRef.current = setTimeout(() => setIsPeeking(false), PEEK_CLOSE_DELAY_MS);
  };
  useEffect(
    () => () => {
      if (peekTimerRef.current) clearTimeout(peekTimerRef.current);
    },
    [],
  );

  const sidebarRef = useRef<HTMLElement>(null);
  const openSidebarButtonRef = useRef<HTMLButtonElement>(null);
  // 접을 때 사이드바 안에 있던 포커스를 열기 버튼(☰)으로 옮길지. 버튼은 접힌 뒤에 그려지므로 그린 다음 옮긴다.
  const shouldFocusOpenButtonRef = useRef(false);
  useEffect(() => {
    if (isSidebarOpen || !shouldFocusOpenButtonRef.current) return;
    shouldFocusOpenButtonRef.current = false;
    openSidebarButtonRef.current?.focus();
  }, [isSidebarOpen]);

  const toggleSidebar = () => {
    // 포커스가 남은 채 사이드바를 숨기면(aria-hidden) 화면 읽기 프로그램이 숨긴 요소를 가리키고 브라우저가 경고한다.
    // 접기 전에 포커스를 빼 두고, 접힌 뒤 열기 버튼으로 옮긴다(R-16).
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && sidebarRef.current?.contains(focused)) {
      focused.blur();
      shouldFocusOpenButtonRef.current = true;
    }
    setIsPeeking(false);
    setIsSidebarOpen((current) => {
      try {
        localStorage.setItem(SIDEBAR_OPEN_KEY, String(!current));
      } catch {
        // 저장하지 못해도 지금 화면에서는 접고 편다.
      }
      return !current;
    });
  };

  // 관리자 콘솔과 같은 Ctrl+\(macOS는 Cmd+\) 단축키로 사이드바를 접고 편다.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === '\\') {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    let isCancelled = false;
    void restoreSession().then((restored) => {
      if (!isCancelled) setSession(restored);
    });
    // 토큰 재발급까지 실패하면 로그인 화면으로 돌아간다.
    setSessionExpiredHandler(() => {
      window.alert('로그인이 만료되었습니다. 다시 로그인해 주세요.');
      forgetScreenMemory();
      setSession(null);
    });
    return () => {
      isCancelled = true;
      setSessionExpiredHandler(null);
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    let isCancelled = false;
    fetchRecruitments()
      .then((items) => {
        if (isCancelled) return;
        setRecruitments(items);
        setRecruitmentId(defaultRecruitmentOf(items)?.recruitment_id ?? null);
      })
      .catch((error: unknown) => {
        if (!isCancelled)
          setRecruitmentError(
            error instanceof Error ? error.message : '모집 공고를 불러오지 못했습니다.',
          );
      });
    return () => {
      isCancelled = true;
    };
  }, [session]);

  useEffect(() => {
    try {
      sessionStorage.setItem(MENU_KEY, savedMenu.tab === 'my' ? savedMenu.track : 'applicants');
    } catch {
      // 저장하지 못하면 새로고침 때 전체 지원 현황에서 시작한다.
    }
  }, [savedMenu]);

  const handleLoginSuccess = (next: AuthSession) => {
    setRecruitments(null);
    setRecruitmentError(null);
    setMenu({ tab: 'applicants' });
    setSession(next);
  };

  const moveTo = (next: Menu) => {
    const go = () => {
      setMenu(next);
      setListRequest((value) => value + 1);
    };
    if (confirmLeave(go)) go();
  };

  const handleLogout = () => {
    const go = () => {
      logout()
        .then(() => {
          forgetScreenMemory();
          setSession(null);
        })
        .catch(() => window.alert('로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.'));
    };
    if (confirmLeave(go)) go();
  };

  if (session === undefined) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        불러오는 중…
      </div>
    );
  }
  if (session === null) return <LoginScreen onLoginSuccess={handleLoginSuccess} />;

  const tracks = visibleTracksOf(session);
  // 기억해 둔 부문을 이 계정이 볼 수 없으면(다른 계정으로 로그인 등) 전체 지원 현황을 보인다.
  const menu: Menu =
    savedMenu.tab === 'my' && !tracks.includes(savedMenu.track) ? { tab: 'applicants' } : savedMenu;
  const isActive = (item: Menu) =>
    item.tab === menu.tab &&
    (item.tab !== 'my' || (menu.tab === 'my' && item.track === menu.track));
  // 관리자 콘솔 사이드바의 "서류 평가 관리" 메뉴와 같은 묶음과 이름이다.
  const menuGroups: { title: string; menus: { item: Menu; label: string }[] }[] = [
    { title: '평가 현황', menus: [{ item: { tab: 'applicants' }, label: '전체 지원 현황' }] },
    {
      title: '서류 평가',
      menus: tracks.map((track) => ({ item: { tab: 'my', track }, label: TRACK_LABELS[track] })),
    },
  ];

  const myTrackImage = trackImageOf(session.track);
  // 사이드바 메뉴. 붙어 있는 사이드바와 접었을 때 띄우는 사이드바가 함께 쓴다.
  const renderMenuNav = (onNavigate?: () => void) => (
    <nav aria-label="서류 평가 메뉴" className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
      {menuGroups.map((group) => (
        <div key={group.title} className="space-y-0.5">
          <p className="px-2 pt-1 pb-0.5 text-[12px] font-semibold tracking-tight text-slate-500">
            {group.title}
          </p>
          <div className="space-y-0.5 pl-3">
            {group.menus.map(({ item, label }) => (
              <button
                key={label}
                type="button"
                aria-current={isActive(item) ? 'page' : undefined}
                onClick={() => {
                  onNavigate?.();
                  moveTo(item);
                }}
                className={`flex w-full cursor-pointer items-center rounded-lg px-2.5 py-2 text-left text-[14px] transition-all focus-visible:outline-2 focus-visible:outline-slate-400 ${
                  isActive(item)
                    ? 'bg-slate-100 font-semibold text-slate-900'
                    : 'font-medium text-slate-600 hover:bg-slate-100/70 hover:text-slate-900'
                }`}
              >
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex h-full bg-[#f8fafc]">
      {/* 사이드바는 접어도 그려 두고 폭만 0으로 줄인다. 폭이 부드럽게 바뀌어 본문(표 등)도 함께 천천히 늘고 준다.
          접혀 있을 때는 inert로 키보드 이동·화면 읽기에서 뺀다. */}
      <aside
        ref={sidebarRef}
        inert={!isSidebarOpen}
        aria-hidden={!isSidebarOpen}
        className={`h-full shrink-0 overflow-hidden bg-white shadow-[0_0_15px_rgba(0,0,0,0.02)] transition-[width] duration-200 ease-out select-none motion-reduce:transition-none ${
          isSidebarOpen ? 'w-60 border-r border-slate-200/40' : 'w-0'
        }`}
      >
        {/* 폭이 줄 때 안의 내용도 왼쪽으로 밀려 나가며 흐려진다. 잘려 나가지 않고 미끄러져 닫히는 것처럼 보인다. */}
        <div
          className={`flex h-full w-60 flex-col transition-[translate,opacity] duration-200 ease-out motion-reduce:transition-none ${
            isSidebarOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0'
          }`}
        >
          <div className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-100 px-4">
            {/* 로고와 이름. 누르면 접힌다(Ctrl/Cmd+\ 와 같다). */}
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="사이드바 접기"
              className="group flex cursor-pointer rounded-md focus-visible:outline-2 focus-visible:outline-slate-400"
            >
              <span className="flex items-center gap-2">
                <BrandLogo />
                <BrandText />
              </span>
            </button>
          </div>
          {renderMenuNav()}
        </div>
      </aside>
      {!isSidebarOpen && (
        <>
          {/* 왼쪽 가장자리 좁은 띠. 마우스를 대면 사이드바가 떠서 나온다. */}
          <div
            aria-hidden="true"
            className="fixed top-14 bottom-0 left-0 z-30 w-3"
            onMouseEnter={showPeek}
            onMouseLeave={hidePeek}
          />
          {/* 접었을 때 띄우는 사이드바. 본문을 밀지 않고 위에 겹쳐 미끄러져 나오고, 마우스가 벗어나면 다시 들어간다. */}
          <div
            inert={!isPeeking}
            aria-hidden={!isPeeking}
            onMouseEnter={showPeek}
            onMouseLeave={hidePeek}
            className={`fixed top-16 bottom-4 left-2 z-40 flex w-60 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_12px_32px_-12px_rgba(15,23,42,0.25)] transition-[translate,opacity] duration-200 ease-out select-none motion-reduce:transition-none ${
              isPeeking ? 'translate-x-0 opacity-100' : '-translate-x-[calc(100%+16px)] opacity-0'
            }`}
          >
            {renderMenuNav(() => setIsPeeking(false))}
          </div>
        </>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          // 접혔을 때 왼쪽 여백을 사이드바 머리(px-4)와 같게 두어 ☰가 사이드바 로고와 같은 자리에 온다.
          className={`flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-200/80 bg-white pr-6 ${isSidebarOpen ? 'pl-6' : 'pl-4'}`}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            {/* 사이드바가 열려 있으면 비워 두고(로고·이름은 사이드바 맨 위), 접혀 있으면 ☰만 둔다.
                ☰에 마우스를 올리면 사이드바가 떠서 나오고, 누르면 다시 고정된다. */}
            {!isSidebarOpen && (
              <div onMouseEnter={showPeek} onMouseLeave={hidePeek}>
                <button
                  ref={openSidebarButtonRef}
                  type="button"
                  onClick={toggleSidebar}
                  aria-label="사이드바 열기"
                  className="flex cursor-pointer rounded-md p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-slate-400"
                >
                  <Menu size={20} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {/* 이름 앞에 본인 부문 캐릭터를 둔다. 부문이 없으면(전부문) 사람 아이콘. */}
            <span
              className="flex items-center gap-2 text-[18px] font-bold text-slate-900"
              title={session.teamName}
            >
              {myTrackImage ? (
                <img
                  src={myTrackImage}
                  alt=""
                  width={26}
                  height={26}
                  className="size-[26px] rounded-full border border-slate-100/80 bg-white object-contain p-[2px] shadow-2xs"
                />
              ) : (
                <User size={18} className="text-slate-700" aria-hidden="true" />
              )}
              {session.name}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="cursor-pointer rounded-sm px-1 text-[13px] text-slate-600 transition-colors hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-slate-400"
            >
              로그아웃
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto px-8 py-7">
          {recruitmentError ? (
            <p role="alert" className="text-sm text-red-600">
              {recruitmentError}
            </p>
          ) : recruitments === null ? (
            <p className="text-sm text-slate-500">모집 공고를 불러오는 중…</p>
          ) : recruitmentId === null ? (
            <p className="text-sm text-slate-500">등록된 모집 공고가 없습니다.</p>
          ) : (
            <EvaluationManagePage
              // 공고를 바꾸면 화면 상태(선택한 지원자, 입력 중인 평가)를 버리고 새로 그린다.
              key={recruitmentId}
              recruitmentId={recruitmentId}
              account={session}
              initialTab={menu.tab}
              track={menu.tab === 'my' ? menu.track : (tracks[0] ?? 'ANALYSIS')}
              onOpenTrack={(track) => {
                setMenu({ tab: 'my', track });
              }}
              listRequest={listRequest}
            />
          )}
        </main>
      </div>
    </div>
  );
}
