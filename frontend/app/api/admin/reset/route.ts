import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export async function POST() {
  try {
    const parentDbPath = path.resolve(process.cwd(), '../appointment_reminders.db');
    const dbPath = fs.existsSync(parentDbPath) ? parentDbPath : path.resolve(process.cwd(), 'appointment_reminders.db');

    const db = new Database(dbPath);
    
    // Ensure called_yet column exists or reset status to pending
    try {
      db.prepare('ALTER TABLE appointment_reminders ADD COLUMN called_yet INTEGER DEFAULT 0').run();
    } catch (e) {
      // Column already exists
    }

    db.prepare("UPDATE appointment_reminders SET status = 'pending', retry_count = 0, called_yet = 0").run();
    db.close();

    return NextResponse.json({ success: true, message: 'All patients reset to pending' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
