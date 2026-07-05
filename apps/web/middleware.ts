import { NextResponse, type NextRequest } from "next/server";

// Единственная задача — прокинуть текущий путь вместе с query-строкой в
// заголовок, чтобы серверные гейты (requireUser) могли построить
// /login?next=<path> и вернуть пользователя туда, куда он шёл (с теми же
// query-параметрами). Никаких auth-редиректов здесь нет: проверка сессии
// (и dev-автологин) остаётся в requireUser, иначе dev-режим бы сломался.
export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"]
};
