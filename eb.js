// db.js — Base de données locale (IndexedDB via Dexie)
const localDB = new Dexie('FamilyFinLocal');

localDB.version(1).stores({
  operations: 'id, user_id, operation_date, synced, pending_delete',
  profiles: 'id, email, synced',
  meta: 'key'
});

async function saveOperationLocal(op) {
  op.synced = 0;
  await localDB.operations.put(op);
}

async function getMyOperations(userId) {
  const ops = await localDB.operations
    .where('user_id').equals(userId)
    .and(o => !o.pending_delete)
    .toArray();
  return ops.sort((a, b) => (b.operation_date || '').localeCompare(a.operation_date || ''));
}

async function getAllOperations() {
  const ops = await localDB.operations.filter(o => !o.pending_delete).toArray();
  return ops;
}

async function deleteOperationLocal(id) {
  const op = await localDB.operations.get(id);
  if (!op) return;
  if (op.synced === 0) {
    await localDB.operations.delete(id);
  } else {
    op.pending_delete = 1;
    op.synced = 0;
    await localDB.operations.put(op);
  }
}

async function saveProfilesLocal(profiles) {
  await localDB.profiles.bulkPut(profiles.map(p => ({ ...p, synced: 1 })));
}

async function getProfilesLocal() {
  return await localDB.profiles.toArray();
}

async function setMeta(key, value) {
  await localDB.meta.put({ key, value });
}
async function getMeta(key) {
  const row = await localDB.meta.get(key);
  return row?.value;
}

function generateUUID() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
