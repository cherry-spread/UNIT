import { database } from '../server/database.mjs';
import { noStore, sameOrigin } from '../server/http.mjs';
import { createSession, passwordMatches, sessionCookie, tokenDigest } from '../server/admin-auth.mjs';

const adminHeaders = {
  ...noStore,
  'Content-Type': 'text/html; charset=utf-8',
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy': "default-src 'none'; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};

function adminShell(title, content, status = 200, headerAction = '') {
  return new Response(`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${title} — TEAM UNIT</title>
<link rel="stylesheet" href="/style.css"></head><body>
<header class="header"><div class="wrap header-inner"><a class="wordmark" href="/">TEAM UNIT<span>.</span></a>
${headerAction || '<a class="text-link" href="/">랜딩페이지 ↗</a>'}</div></header>
<main class="wrap section inbox"><p class="eyebrow">INQUIRY INBOX</p><h1>${title}</h1>${content}</main></body></html>`, { status, headers: adminHeaders });
}

function adminGate(error = '', status = 401) {
  return adminShell('관리자 비밀번호 입력', `
<p class="section-copy muted">문의함을 열려면 관리자 비밀번호를 입력하세요.</p>
<form class="admin-form" method="post" action="/admin">
<label for="password">비밀번호</label>
<input id="password" name="password" type="password" autocomplete="current-password" minlength="12" maxlength="128" required>
<button class="button button-dark" type="submit">문의함 열기</button>
${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
</form>`, status);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function adminPage(inquiries, page) {
  const dateFormat = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short',
  });
  const entries = inquiries.slice(0, 20).map(item => `
    <article class="inquiry-card">
      <p class="tag">${escapeHtml(dateFormat.format(new Date(item.created_at)))}</p>
      <h2>${escapeHtml(item.project || '제목 없는 프로젝트')}</h2>
      <p class="muted">회신 이메일 · ${escapeHtml(item.email)}</p>
      <p class="inquiry-body">${escapeHtml(item.brief)}</p>
    </article>`).join('');
  const previous = page > 1 ? `<a class="text-link" href="/admin?page=${page - 1}">← 이전</a>` : '';
  const next = inquiries.length > 20 ? `<a class="text-link" href="/admin?page=${page + 1}">다음 →</a>` : '';
  return adminShell('프로젝트 문의 관리', `
<p class="section-copy muted">접수된 문의를 최근 순으로 확인합니다.</p>
<div class="inquiry-list">${entries || '<p class="inquiry-card">접수된 문의가 없습니다.</p>'}</div>
<div class="actions">${previous}${next}</div>`, 200,
    '<form method="post" action="/admin"><button class="button button-red" name="intent" value="logout">문의함 잠그기</button></form>');
}

export async function GET(request) {
  try {
    const hash = tokenDigest(request);
    if (!hash) return adminGate();
    const sql = database();
    const [session] = await sql`SELECT 1 FROM unit_admin_sessions WHERE token_hash = ${hash} AND expires_at > now()`;
    if (!session) return adminGate();
    const requestedPage = Number(new URL(request.url).searchParams.get('page'));
    const page = Number.isSafeInteger(requestedPage) ? Math.min(10000, Math.max(1, requestedPage)) : 1;
    const inquiries = await sql`SELECT project, email, brief, created_at FROM unit_inquiries
      ORDER BY created_at DESC, id DESC LIMIT 21 OFFSET ${(page - 1) * 20}`;
    return adminPage(inquiries, page);
  } catch {
    return adminGate('문의함에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.', 503);
  }
}

export async function POST(request) {
  if (!sameOrigin(request) ||
      !request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) {
    return new Response(null, { status: 403, headers: adminHeaders });
  }
  const text = await request.text();
  if (text.length > 2000) return new Response(null, { status: 413, headers: adminHeaders });
  const form = new URLSearchParams(text);
  try {
    const sql = database();
    let cookie;
    if (form.get('intent') === 'logout') {
      const hash = tokenDigest(request);
      if (hash) await sql`DELETE FROM unit_admin_sessions WHERE token_hash = ${hash}`;
      cookie = sessionCookie('', 0);
    } else {
      const bucket = Math.floor(Date.now() / 300000);
      const [attempt] = await sql`INSERT INTO unit_admin_attempts (bucket, attempts) VALUES (${bucket}, 1)
        ON CONFLICT (bucket) DO UPDATE SET attempts = unit_admin_attempts.attempts + 1
        WHERE unit_admin_attempts.attempts < 25 RETURNING attempts`;
      if (!attempt) return adminGate('로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.', 429);
      if (!await passwordMatches(form.get('password'))) return adminGate('비밀번호를 확인해 주세요.');
      cookie = sessionCookie(await createSession(sql));
      await sql`DELETE FROM unit_admin_attempts WHERE bucket < ${bucket - 12}`;
    }
    return new Response(null, {
      status: 303, headers: { ...adminHeaders, Location: '/admin', 'Set-Cookie': cookie },
    });
  } catch {
    return adminGate('문의함에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.', 503);
  }
}
