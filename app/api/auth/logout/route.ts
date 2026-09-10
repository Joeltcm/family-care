export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const cloudflareAccess = request.headers.has('cf-access-jwt-assertion');
  const destination = cloudflareAccess
    ? new URL('/cdn-cgi/access/logout', request.url)
    : new URL('/signout-with-chatgpt?return_to=/', request.url);
  return Response.redirect(destination, 302);
}
