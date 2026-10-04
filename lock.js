// lock.js — Verrouillage par PIN (fonctionne hors ligne)
const PIN_ITERATIONS = 120000;

async function hashPIN(pin, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: PIN_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

function generateSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr));
}

async function setupPIN(pin) {
  const salt = generateSalt();
  const hash = await hashPIN(pin, salt);
  await setMeta('pin_salt', salt);
  await setMeta('pin_hash', hash);
  await setMeta('pin_created_at', new Date().toISOString());
}

async function verifyPIN(pin) {
  const salt = await getMeta('pin_salt');
  const storedHash = await getMeta('pin_hash');
  if (!salt || !storedHash) return false;
  const hash = await hashPIN(pin, salt);
  if (hash.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) {
    diff |= hash.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return diff === 0;
}

async function hasPIN() {
  return !!(await getMeta('pin_hash'));
}

async function removePIN() {
  await localDB.meta.delete('pin_hash');
  await localDB.meta.delete('pin_salt');
}

const LOCK_TIMEOUT_MS = 2 * 60 * 1000;
let lastActivity = Date.now();
let lockCallback = null;

function registerLockCallback(fn) { lockCallback = fn; }
function markActivity() { lastActivity = Date.now(); }

function startAutoLockWatcher() {
  ['click', 'touchstart', 'keydown', 'scroll'].forEach(evt => {
    window.addEventListener(evt, markActivity, { passive: true });
  });

  setInterval(() => {
    if (lockCallback && Date.now() - lastActivity > LOCK_TIMEOUT_MS) {
      lockCallback();
    }
  }, 10000);

  let hiddenAt = null;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
    } else {
      if (hiddenAt && Date.now() - hiddenAt > 30000 && lockCallback) {
        lockCallback();
      }
      markActivity();
    }
  });
}
