import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get('poltr_session')?.value;

  return NextResponse.json({
    authenticated: !!sessionToken,
  });
}
