import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST() {
  try {
    const db = getDb();
    db.prepare('UPDATE patients SET called_yet = 0').run();
    db.close();

    return NextResponse.json({ success: true, message: 'All patient records reset to called_yet = 0' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
