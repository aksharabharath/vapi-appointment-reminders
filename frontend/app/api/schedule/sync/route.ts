import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
  try {
    const { scheduledTime } = await request.json();

    if (!scheduledTime) {
      return NextResponse.json({ success: false, error: 'Missing scheduled time' }, { status: 400 });
    }

    // Write scheduled_time.txt to root project directory
    const filePath = path.resolve(process.cwd(), '../scheduled_time.txt');
    fs.writeFileSync(filePath, scheduledTime, 'utf-8');

    return NextResponse.json({ success: true, message: 'Synced to scheduled_time.txt successfully' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
