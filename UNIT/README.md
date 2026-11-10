# TEAM UNIT

TEAM UNIT 랜딩페이지와 프로젝트 문의함입니다. 랜딩페이지와 문의 접수는 공개이며, 문의함은 관리자 비밀번호로 잠금 해제합니다. 문의는 PostgreSQL에 저장합니다.

## 배포

Vercel의 프로젝트 루트 디렉터리를 이 저장소의 `UNIT`으로 지정합니다. 정적 파일은 `public/`, 서버 함수는 `api/`에 있습니다.

1. Vercel 프로젝트에 Neon PostgreSQL을 연결하고 Production에 `DATABASE_URL` 또는 `POSTGRES_URL`이 설정되어 있는지 확인합니다.
2. 관리자 비밀번호 검증값을 `ADMIN_PASSWORD_VERIFIER`라는 Production Secret으로 등록합니다. 형식은 24바이트 난수 소금의 16진수 값, 콜론, Node.js 기본 설정의 scrypt로 계산한 32바이트 해시의 16진수 값입니다.
3. 연결 문자열이 설정된 환경에서 `npm ci`와 `npm run db:migrate`를 실행한 뒤 배포합니다.
4. 배포 주소에서 공개 문의를 접수하고, 같은 주소의 `/admin`에서 비밀번호로 문의함을 엽니다.

관리자 세션은 한 시간 뒤 만료됩니다. 비밀번호를 교체하고 다시 배포하면 기존 세션이 무효화됩니다. 기존 ChatGPT Sites의 문의는 해당 사이트에서 확인할 수 있습니다.
