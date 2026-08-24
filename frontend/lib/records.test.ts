import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatToE164, mapCallAttempt, mapPatient } from './records';

test('formatToE164 adds US country code for 10 digits', () => {
  assert.equal(formatToE164('510-529-6731'), '+15105296731');
});

test('formatToE164 keeps an existing plus prefix', () => {
  assert.equal(formatToE164('+15105296731'), '+15105296731');
});

test('mapPatient exposes date_of_birth as dob for the main UI', () => {
  const mapped = mapPatient({
    patient_id: 'rec_001',
    first_name: 'Ada',
    last_name: 'Lovelace',
    date_of_birth: '1815-12-10',
    phone_number: '5551234567',
    home_address: '',
    insurance_number: '',
    medical_record_number: 'MRN1',
    appointment_date: '2026-08-01',
    appointment_time: '10:00 AM',
    timezone: 'America/Los_Angeles',
    called_yet: 0,
  });
  assert.equal(mapped.dob, '1815-12-10');
  assert.equal(mapped.called_yet, 0);
});

test('mapCallAttempt maps serial id and timestamp for the history table', () => {
  const mapped = mapCallAttempt({
    call_attempt_id: 9,
    patient_id: 'rec_001',
    vapi_call_id: 'abc',
    status: 'initiated',
    decision: '',
    user_speech: '',
    created_at: '2026-08-23T12:00:00.000Z',
  });
  assert.equal(mapped.id, 9);
  assert.equal(mapped.call_time, '2026-08-23T12:00:00.000Z');
});
