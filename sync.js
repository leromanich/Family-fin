// sync.js — Synchronisation locale ↔ Supabase
let syncInProgress = false;
let syncListeners = [];

function onSyncChange(fn) { syncListeners.push(fn); }
function notifySync(status) { syncListeners.forEach(fn => fn(status)); }

async function pushOperationsToCloud(supabase, userId) {
  const unsynced = await localDB.operations.where('synced').equals(0).toArray();
  if (unsynced.length === 0) return { pushed: 0, deleted: 0 };

  let pushed = 0, deleted = 0;
  for (const op of unsynced) {
    try {
      if (op.pending_delete) {
        const { error } = await supabase.from('operations').delete().eq('id', op.id);
        if (!error || error.code === 'PGRST116') {
          await localDB.operations.delete(op.id);
          deleted++;
        }
      } else {
        const payload = {
          id: op.id,
          user_id: op.user_id,
          type: op.type,
          amount: op.amount,
          description: op.description || null,
          operation_date: op.operation_date
        };
        const { error } = await supabase.from('operations').upsert(payload);
        if (!error) {
          await localDB.operations.update(op.id, { synced: 1 });
          pushed++;
        }
      }
    } catch (e) {
      console.warn('Sync échec pour', op.id, e);
    }
  }
  return { pushed, deleted };
}

async function pullOperationsFromCloud(supabase, userId) {
  const { data, error } = await supabase
    .from('operations').select('*').eq('user_id', userId);
  if (error) return 0;

  const localUnsyncedIds = new Set(
    (await localDB.operations.where('synced').equals(0).toArray()).map(o => o.id)
  );

  let pulled = 0;
  for (const remote of data) {
    if (localUnsyncedIds.has(remote.id)) continue;
    await localDB.operations.put({ ...remote, synced: 1 });
    pulled++;
  }
  return pulled;
}

async function pullProfilesFromCloud(supabase) {
  const { data, error } = await supabase.from('profiles').select('*');
  if (!error && data) await saveProfilesLocal(data);
}

async function runSync(supabase, userId) {
  if (syncInProgress) return { skipped: true };
  if (!navigator.onLine) {
    notifySync({ state: 'offline' });
    return { offline: true };
  }

  syncInProgress = true;
  notifySync({ state: 'syncing' });

  try {
    const pushRes = await pushOperationsToCloud(supabase, userId);
    const pulled = await pullOperationsFromCloud(supabase, userId);
    await pullProfilesFromCloud(supabase);
    await setMeta('last_sync', new Date().toISOString());
    notifySync({ state: 'ok', pushed: pushRes.pushed, pulled, deleted: pushRes.deleted });
    return { ok: true, ...pushRes, pulled };
  } catch (e) {
    console.error('Erreur sync', e);
    notifySync({ state: 'error', error: e.message });
    return { error: e.message };
  } finally {
    syncInProgress = false;
  }
}

window.addEventListener('online', () => {
  if (window.__runSync) window.__runSync();
});

setInterval(() => {
  if (navigator.onLine && window.__runSync) window.__runSync();
}, 60000);
