// tests/helpers/v81-emulator-spawn.js
// V81 Task 19 — Firebase Emulator Suite lifecycle helper.
// Spawns firestore + storage + auth emulators as child process; resolves on ready.
// REQUIRES: Java JDK (for firestore emulator) — see firebase.json for ports.

import { spawn } from 'node:child_process';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';

const EMULATOR_HOSTS = {
  firestore: 'localhost:8080',
  storage: 'localhost:9199',
  auth: 'localhost:9099',
};

let emulatorProc = null;
let adminApp = null;

/**
 * Spawn firebase emulators:start as child process. Resolves when emulators ready
 * (detects "All emulators ready!" in stdout). Rejects on timeout or spawn error.
 *
 * @param {{timeoutMs?: number}} opts
 */
export async function startEmulators({ timeoutMs = 90_000 } = {}) {
  if (emulatorProc) return; // already running
  return new Promise((resolve, reject) => {
    // Use npx firebase emulators:start (firebase-tools devDep installed in V81 Task 6)
    const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    emulatorProc = spawn(cmd, [
      'firebase', 'emulators:start',
      '--only', 'firestore,storage,auth',
      '--project', 'demo-test-v81',
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });

    const timer = setTimeout(() => {
      reject(new Error(`emulator start timeout (${timeoutMs}ms) — ensure Java JDK installed + ports 8080/9099/9199 free`));
    }, timeoutMs);

    let stdoutBuf = '';
    emulatorProc.stdout.on('data', (chunk) => {
      const s = chunk.toString();
      stdoutBuf += s;
      // Firebase emulator emits this line when all are ready
      if (s.includes('All emulators ready') || stdoutBuf.includes('All emulators ready')) {
        clearTimeout(timer);
        resolve();
      }
    });

    let stderrBuf = '';
    emulatorProc.stderr.on('data', (chunk) => {
      const s = chunk.toString();
      stderrBuf += s;
      // Common failures: missing Java, port in use
      if (s.includes('java') && s.toLowerCase().includes('not found')) {
        clearTimeout(timer);
        reject(new Error('Java JDK not found — required for Firestore emulator'));
      }
      if (s.includes('port already')) {
        clearTimeout(timer);
        reject(new Error(`Port conflict — emulator failed to start: ${s.slice(0, 200)}`));
      }
    });

    emulatorProc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    emulatorProc.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timer);
        reject(new Error(`emulator exited with code ${code}. stderr: ${stderrBuf.slice(0, 500)}`));
      }
    });
  });
}

/**
 * Stop emulators (SIGTERM child process) + cleanup admin app.
 */
export async function stopEmulators() {
  if (emulatorProc) {
    try {
      // Windows: spawn with shell creates a wrapper; need taskkill for clean shutdown
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(emulatorProc.pid), '/f', '/t'], { stdio: 'ignore' });
      } else {
        emulatorProc.kill('SIGTERM');
      }
    } catch { /* tolerant */ }
    emulatorProc = null;
  }
  if (adminApp) {
    try { await deleteApp(adminApp); } catch { /* tolerant */ }
    adminApp = null;
  }
}

/**
 * Returns admin SDK clients connected to the emulator suite.
 * MUST be called AFTER startEmulators() resolves.
 */
export function getEmulatorAdmin() {
  if (!adminApp) {
    // Inject emulator host env vars (admin SDK auto-detects these)
    process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOSTS.firestore;
    process.env.FIREBASE_STORAGE_EMULATOR_HOST = EMULATOR_HOSTS.storage;
    process.env.FIREBASE_AUTH_EMULATOR_HOST = EMULATOR_HOSTS.auth;
    adminApp = initializeApp({
      projectId: 'demo-test-v81',
      storageBucket: 'demo-test-v81.appspot.com',
    }, 'v81-emulator-test');
  }
  return {
    db: getFirestore(adminApp),
    storage: getStorage(adminApp).bucket(),
    auth: getAuth(adminApp),
  };
}
