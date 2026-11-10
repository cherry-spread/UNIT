export const noStore = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

export function sameOrigin(request) {
  return request.headers.get('origin') === new URL(request.url).origin;
}

export function json(data, status) {
  return Response.json(data, { status, headers: noStore });
}
