import type { TrackType } from '@/entities/recruitment/model/types';

/** 로그인한 운영진. 배포된 백엔드의 계정 조회(GET /api/v1/admin/accounts/{id}) 응답에서 만든다. */
export interface AuthSession {
  adminId: number;
  username: string;
  name: string;
  /** SUPER(대표진·차기대표진) 또는 TEAM(그 외 팀). */
  role: 'SUPER' | 'TEAM';
  /** 대표진, 차기대표진, 서비스운영팀 등 한글 팀 이름. */
  teamName: string;
  /** 계정의 부문. 차기대표진처럼 전 부문 계정은 ALL일 수 있다. */
  track: TrackType | 'ALL';
}

/** POST /api/v1/auth/admin/login 요청. */
export interface LoginRequest {
  username: string;
  password: string;
}
