import { NextResponse } from 'next/server';
import { getAppVersion } from '@/lib/app-version';

// GET /api/version — return app version for UI diagnostics
export async function GET() {
  return NextResponse.json({ version: getAppVersion() });
}
