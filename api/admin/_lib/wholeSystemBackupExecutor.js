// api/admin/_lib/wholeSystemBackupExecutor.js
// V81 — Shared whole-system backup executor.
// Called by /api/cron/whole-system-backup-daily.js (cron, auto-type) AND
// /api/admin/whole-system-backup-export.js (admin button, manual-type).
//
// Performs full backup: cleanup retention + collections + storage + auth + manifest.
// Per spec §5.1 + §5.2.

import { FieldValue } from 'firebase-admin/firestore';
import { randomBytes, createHash } from 'node:crypto';
import {
  formatBackupName,
  resolveCollectionScope,
  resolveStorageScope,
  CUSTOMER_SUBCOLLECTIONS,
  shouldCleanupBackup,
  buildWholeSystemManifest,
  computeWholeSystemManifestHash,
  sanitizeAuthUser,
  encodeFirestoreData, // V81-fix1: Timestamp/GeoPoint/Bytes encoder
} from '../../../src/lib/wholeSystemBackupCore.js';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;

async function sha256Stream(readable) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    readable.on('data', (c) => h.update(c));
    readable.on('end', () => resolve(`sha256:${h.digest('hex')}`));
    readable.on('error', reject);
  });
}

function sha256Buffer(buf) {
  return `sha256:${createHash('sha256').update(buf).digest('hex')}`;
}

/**
 * runWholeSystemBackup — full export of Firestore + Storage + Auth to a backup
 * folder at backups/whole-system/{name}/.
 *
 * @param {object} args
 * @param {Firestore} args.db
 * @param {Bucket} args.storage
 * @param {Auth} args.auth
 * @param {'auto'|'manual'|'pre-restore'} args.type
 * @param {string} args.createdBy — audit attribution
 * @param {boolean} args.runCleanup — true ONLY for cron (auto type); false for manual
 * @returns {Promise<{name, manifestHash, stats, failedCollections, failedStorageObjects}>}
 */
export async function runWholeSystemBackup({ db, storage, auth, type, createdBy, runCleanup }) {
  const start = Date.now();
  const name = formatBackupName(type, new Date());
  const baseStoragePath = `backups/whole-system/${name}`;
  const failedCollections = [];
  const failedStorageObjects = [];
  const collections = [];
  const storageObjects = [];

  // 1. Cleanup retention (AV64) — only for auto (cron) per spec §5.1
  if (runCleanup) {
    const [files] = await storage.getFiles({ prefix: 'backups/whole-system/' });
    const folderTs = new Map();
    for (const f of files) {
      const m = f.name.match(/^backups\/whole-system\/([^/]+)\//);
      if (!m) continue;
      const folder = m[1];
      if (!folderTs.has(folder)) {
        const ts = f.metadata?.timeCreated ? new Date(f.metadata.timeCreated).getTime() : Date.now();
        folderTs.set(folder, ts);
      }
    }
    for (const [folder, createdMs] of folderTs.entries()) {
      const ageMs = Date.now() - createdMs;
      const decision = shouldCleanupBackup(folder, ageMs, Date.now());
      if (decision.action === 'delete') {
        try {
          await storage.deleteFiles({ prefix: `backups/whole-system/${folder}/` });
        } catch (e) {
          // Tolerant — log + continue (don't abort cron on cleanup failure)
          console.warn(`Cleanup failed for ${folder}: ${e.message}`);
        }
      }
    }
  }

  // 2. Export universal collections
  const scope = resolveCollectionScope();
  for (const colName of scope.universal) {
    try {
      const snap = await db.collection(`${PREFIX}/${colName}`).get();
      // V38 spread-order discipline: docId WINS over any stray data.id field
      // (legacy ProClinic imports occasionally carry numeric `id` in data).
      // V81-fix1 (2026-05-17): encode Firestore-native types (Timestamp/GeoPoint/Bytes)
      // before JSON.stringify so restore can re-hydrate. Diagnostic on real prod
      // (2026-05-17) confirmed bare JSON.stringify degrades Timestamp→Map.
      const docs = snap.docs.map(d => encodeFirestoreData({ ...d.data(), id: d.id }));
      const json = JSON.stringify(docs, null, 2);
      const filePath = `${baseStoragePath}/collections/universal/${colName}.json`;
      await storage.file(filePath).save(json, { contentType: 'application/json' });
      collections.push({
        path: `collections/universal/${colName}.json`,
        name: colName,
        type: 'universal',
        docCount: docs.length,
        fileSizeBytes: Buffer.byteLength(json, 'utf8'),
        fileHash: sha256Buffer(json),
      });
    } catch (e) {
      failedCollections.push({ name: colName, error: e.message });
    }
  }

  // 3. Export branch-scoped collections
  for (const colName of scope.branchScoped) {
    try {
      const snap = await db.collection(`${PREFIX}/${colName}`).get();
      // V81-fix1 (2026-05-17): encode Firestore-native types (Timestamp/GeoPoint/Bytes)
      // before JSON.stringify so restore can re-hydrate. Diagnostic on real prod
      // (2026-05-17) confirmed bare JSON.stringify degrades Timestamp→Map.
      const docs = snap.docs.map(d => encodeFirestoreData({ ...d.data(), id: d.id }));
      const json = JSON.stringify(docs, null, 2);
      const filePath = `${baseStoragePath}/collections/branch-scoped/${colName}.json`;
      await storage.file(filePath).save(json, { contentType: 'application/json' });
      collections.push({
        path: `collections/branch-scoped/${colName}.json`,
        name: colName,
        type: 'branch-scoped',
        docCount: docs.length,
        fileSizeBytes: Buffer.byteLength(json, 'utf8'),
        fileHash: sha256Buffer(json),
      });
    } catch (e) {
      failedCollections.push({ name: colName, error: e.message });
    }
  }

  // 4. Export customer subcollections (V74 T4 pattern)
  try {
    const custSnap = await db.collection(`${PREFIX}/be_customers`).get();
    for (const custDoc of custSnap.docs) {
      const cid = custDoc.id;
      for (const subName of CUSTOMER_SUBCOLLECTIONS) {
        try {
          const subSnap = await db.collection(`${PREFIX}/be_customers/${cid}/${subName}`).get();
          if (subSnap.empty) continue;
          // V38 spread-order: docId WINS over any stray data.id field
          // V81-fix1: encode Timestamp/GeoPoint/Bytes before JSON.stringify
          const docs = subSnap.docs.map(d => encodeFirestoreData({ ...d.data(), id: d.id }));
          const json = JSON.stringify(docs, null, 2);
          const filePath = `${baseStoragePath}/collections/subcollections/be_customers__${cid}__${subName}.json`;
          await storage.file(filePath).save(json, { contentType: 'application/json' });
          collections.push({
            path: `collections/subcollections/be_customers__${cid}__${subName}.json`,
            name: `be_customers/${cid}/${subName}`,
            type: 'subcollection',
            docCount: docs.length,
            fileSizeBytes: Buffer.byteLength(json, 'utf8'),
            fileHash: sha256Buffer(json),
          });
        } catch (e) {
          failedCollections.push({ name: `be_customers/${cid}/${subName}`, error: e.message });
        }
      }
    }
  } catch (e) {
    failedCollections.push({ name: '__customer_subcollections__', error: e.message });
  }

  // 5. Export chat_conversations messages subcoll
  try {
    const convSnap = await db.collection(`${PREFIX}/chat_conversations`).get();
    for (const convDoc of convSnap.docs) {
      const convId = convDoc.id;
      try {
        const msgsSnap = await db.collection(`${PREFIX}/chat_conversations/${convId}/messages`).get();
        if (msgsSnap.empty) continue;
        // V38 spread-order: docId WINS over any stray data.id field
        // V81-fix1: encode Timestamp/GeoPoint/Bytes before JSON.stringify
        const docs = msgsSnap.docs.map(d => encodeFirestoreData({ ...d.data(), id: d.id }));
        const json = JSON.stringify(docs, null, 2);
        const filePath = `${baseStoragePath}/collections/subcollections/chat_conversations__${convId}__messages.json`;
        await storage.file(filePath).save(json, { contentType: 'application/json' });
        collections.push({
          path: `collections/subcollections/chat_conversations__${convId}__messages.json`,
          name: `chat_conversations/${convId}/messages`,
          type: 'subcollection',
          docCount: docs.length,
          fileSizeBytes: Buffer.byteLength(json, 'utf8'),
          fileHash: sha256Buffer(json),
        });
      } catch (e) {
        failedCollections.push({ name: `chat_conversations/${convId}/messages`, error: e.message });
      }
    }
  } catch (e) {
    failedCollections.push({ name: '__chat_messages_subcoll__', error: e.message });
  }

  // 6. Export Auth users (sanitized via wholeSystemBackupCore.sanitizeAuthUser)
  let authUsersFileHash = '';
  let authUserCount = 0;
  try {
    const allUsers = [];
    let nextPageToken;
    do {
      const page = await auth.listUsers(1000, nextPageToken);
      for (const u of page.users) {
        const json = u.toJSON ? u.toJSON() : u;
        allUsers.push(sanitizeAuthUser(json));
      }
      nextPageToken = page.pageToken;
    } while (nextPageToken);
    authUserCount = allUsers.length;
    const json = JSON.stringify(allUsers, null, 2);
    authUsersFileHash = sha256Buffer(json);
    await storage.file(`${baseStoragePath}/auth/users.json`).save(json, { contentType: 'application/json' });
  } catch (e) {
    failedCollections.push({ name: '__auth_users__', error: e.message });
  }

  // 7. Copy Storage objects (resolveStorageScope = recursion gate + scope filter)
  let totalStorageBytes = 0;
  try {
    const [allStorageFiles] = await storage.getFiles();
    for (const f of allStorageFiles) {
      if (!resolveStorageScope(f.name)) continue;
      try {
        const destPath = `${baseStoragePath}/storage/${f.name}`;
        await f.copy(storage.file(destPath));
        const [meta] = await f.getMetadata();
        const sizeBytes = parseInt(meta.size || '0', 10);
        const fileHash = await sha256Stream(f.createReadStream());
        totalStorageBytes += sizeBytes;
        storageObjects.push({
          path: `storage/${f.name}`,
          originalGsPath: f.name,
          fileSizeBytes: sizeBytes,
          fileHash,
          contentType: meta.contentType || 'application/octet-stream',
        });
      } catch (e) {
        failedStorageObjects.push({ path: f.name, error: e.message });
      }
    }
  } catch (e) {
    failedStorageObjects.push({ path: '__storage_enumerate__', error: e.message });
  }

  // 8. Build manifest + seal hash (AV62)
  const totalDocCount = collections.reduce((s, c) => s + c.docCount, 0);
  const manifest = buildWholeSystemManifest({
    name,
    createdAt: new Date().toISOString(),
    createdBy,
    collections,
    storageObjects,
    authUsers: {
      path: 'auth/users.json',
      userCount: authUserCount,
      fileHash: authUsersFileHash,
    },
    stats: {
      totalDocCount,
      totalStorageBytes,
      totalAuthUsers: authUserCount,
      elapsedSec: Math.round((Date.now() - start) / 1000),
    },
  });
  manifest.manifestHash = computeWholeSystemManifestHash(manifest);

  // 9. Write manifest.json
  const manifestJson = JSON.stringify(manifest, null, 2);
  await storage.file(`${baseStoragePath}/manifest.json`).save(manifestJson, { contentType: 'application/json' });

  // 10. Audit doc
  const auditId = `whole-system-backup-${name}-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await db.doc(`${PREFIX}/be_admin_audit/${auditId}`).set({
    op: 'whole-system-backup',
    name,
    type,
    source: createdBy,
    stats: manifest.stats,
    manifestHash: manifest.manifestHash,
    failedCollections,
    failedStorageObjects,
    completedAt: FieldValue.serverTimestamp(),
  });

  return {
    name,
    manifestHash: manifest.manifestHash,
    stats: manifest.stats,
    failedCollections,
    failedStorageObjects,
  };
}
