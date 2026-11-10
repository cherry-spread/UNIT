import { database } from '../server/database.mjs';
import { json, sameOrigin } from '../server/http.mjs';

export async function POST(request) {
  if (!sameOrigin(request)) return json({ error: '페이지를 새로고침한 뒤 다시 시도해 주세요.' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return json({ error: '문의 입력 형식을 확인해 주세요.' }, 415);
  }

  const text = await request.text();
  if (text.length > 15000) return json({ error: '문의 내용이 너무 깁니다.' }, 413);
  let input;
  try {
    input = JSON.parse(text);
  } catch {
    return json({ error: '문의 입력 형식을 확인해 주세요.' }, 400);
  }
  const { id, project, email, brief, website } = input ?? {};
  if (website ||
      typeof id !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(id) ||
      typeof project !== 'string' || project.trim().length > 120 ||
      typeof email !== 'string' || email.trim().length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof brief !== 'string' || !brief.trim() || brief.trim().length > 3000) {
    return json({ error: '이메일과 문의 내용을 확인해 주세요.' }, 400);
  }

  try {
    const sql = database();
    const submitted = [project.trim(), email.trim(), brief.trim()];
    await sql`INSERT INTO unit_inquiries (id, project, email, brief)
      VALUES (${id}, ${submitted[0]}, ${submitted[1]}, ${submitted[2]})
      ON CONFLICT (id) DO NOTHING`;
    const [saved] = await sql`SELECT project, email, brief FROM unit_inquiries WHERE id = ${id}`;
    if (!saved || [saved.project, saved.email, saved.brief].some((value, index) => value !== submitted[index])) {
      return json({ error: '접수 번호가 중복되었습니다. 내용을 수정한 뒤 다시 시도해 주세요.' }, 409);
    }
    return json({ received: true, receipt: id }, 201);
  } catch {
    return json({ error: '지금은 문의를 저장할 수 없습니다. 잠시 후 다시 시도해 주세요.' }, 503);
  }
}
