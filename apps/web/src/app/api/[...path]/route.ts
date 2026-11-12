import type { NextRequest } from 'next/server';
import { proxyToApi } from '@/lib/server/bff';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ path: string[] }> };

async function handler(request: NextRequest, context: Context) {
  return proxyToApi(request, (await context.params).path);
}

export { handler as DELETE, handler as GET, handler as PATCH, handler as POST, handler as PUT };
