import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WaterDatabase } from './database';

test('WaterDatabase enforces per-user isolation and persists CRUD + alert statuses', () => {
  const tmpFile = path.join(os.tmpdir(), `aqualedger-test-${Date.now()}.db`);
  try {
    const db = new WaterDatabase(tmpFile);
    const users = db.listUsers();
    assert.equal(users.length, 2);

    const alex = users[0];
    const priya = users[1];

    const alexInitial = db.getWorkspacePayload(alex.id);
    const priyaInitial = db.getWorkspacePayload(priya.id);
    assert.equal(alexInitial.readings.length, 92);
    assert.equal(priyaInitial.readings.length, 14);

    // Priya creates a reading; Alex's readings count must remain 92
    const created = db.addReading(priya.id, {
      date: '2026-11-19',
      volumeLiters: 495,
      nightFlowLph: 19.5,
      notes: 'Manual anomaly check',
      source: 'manual',
    });

    assert.equal(db.getReadingsForUser(alex.id).length, 92);
    assert.equal(db.getReadingsForUser(priya.id).length, 15);

    // Alex cannot delete Priya's reading
    assert.equal(db.deleteReading(alex.id, created.id), false);
    assert.equal(db.getReadingsForUser(priya.id).length, 15);

    // Priya's anomaly reading triggers an alert, which can be acknowledged
    const priyaPayload = db.getWorkspacePayload(priya.id);
    assert.ok(priyaPayload.alerts.length >= 1);
    const alertId = priyaPayload.alerts[0].id;
    const acked = db.updateAlertStatus(priya.id, alertId, 'Acknowledged');
    assert.equal(acked?.status, 'Acknowledged');

    // Priya can delete her reading
    assert.equal(db.deleteReading(priya.id, created.id), true);
    assert.equal(db.getReadingsForUser(priya.id).length, 14);
  } finally {
    if (fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  }
});
