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
  resolveStorageScopeForBackup, // V81-fix6: scope-aware (full vs customer-only)
  CUSTOMER_SUBCOLLECTIONS,
  shouldCleanupBackup,
  planRetentionWithValidityGuard, // 2026-07-21: keep-last-valid retention guard
  buildWholeSystemManifest,
  computeWholeSystemManifestHash,
  sanitizeAuthUser,
  encodeFirestoreData, // V81-fix1: Timestamp/GeoPoint/Bytes encoder
  mapWithConcurrency,            // V122: bounded-parallel I/O (300s timeout fix)
  classifyCollectionCategory,    // V122: file-path category for dynamic collections
  FULL_SCOPE_COLLECTION_DENYLIST, // V122: deliberate full-scope exclusions
} from '../../../src/lib/wholeSystemBackupCore.js';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;

// V122 (2026-05-26): bounded parallelism for the backup I/O. The pre-V122
// executor ran every read+write SEQUENTIALLY → ~1000+ cross-region round-trips
// → exceeded the 300s Vercel cap → NO_MANIFEST. These limits collapse N trips
// into ceil(N/limit) batches while staying well under Firestore/Storage QPS.
const COLLECTION_CONCURRENCY = 20;
const SUBCOLL_CONCURRENCY = 40;
const STORAGE_CONCURRENCY = 15;

// V81-fix6: backup storage path prefix per scope
function backupPathPrefix(scope) {
  return scope === 'customer-only' ? 'backups/customer-only' : 'backups/whole-system';
}

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
export async function runWholeSystemBackup({ db, storage, auth, type, createdBy, runCleanup, scope = 'full' }) {
  const start = Date.now();
  const name = formatBackupName(type, new Date());
  const pathPrefix = backupPathPrefix(scope);
  const baseStoragePath = `${pathPrefix}/${name}`;
  const failedCollections = [];
  const failedStorageObjects = [];
  const collections = [];
  const storageObjects = [];

  // 1. Cleanup retention (AV64) — only for auto (cron) per spec §5.1.
  // 2026-07-21: keep-last-valid guard — a retention-expired auto folder is
  // deleted ONLY when a strictly-newer manifest-valid folder exists, so a
  // V122-style broken-backup streak can never age the LAST healthy backup
  // into deletion. hasManifest comes from the same getFiles() listing.
  if (runCleanup) {
    const [files] = await storage.getFiles({ prefix: `${pathPrefix}/` });
    const folderTs = new Map();
    const folderHasManifest = new Set();
    for (const f of files) {
      const m = f.name.match(/^backups\/whole-system\/([^/]+)\/(.*)$/);
      if (!m) continue;
      const folder = m[1];
      if (!folderTs.has(folder)) {
        const ts = f.metadata?.timeCreated ? new Date(f.metadata.timeCreated).getTime() : Date.now();
        folderTs.set(folder, ts);
      }
      if (m[2] === 'manifest.json') folderHasManifest.add(folder);
    }
    const plan = planRetentionWithValidityGuard(
      [...folderTs.entries()].map(([name, createdMs]) => ({
        name, createdMs, hasManifest: folderHasManifest.has(name),
      })),
      Date.now(),
    );
    for (const k of plan.kept) {
      if (k.reason.includes('validity guard')) console.warn(`[retention] ${k.name}: ${k.reason}`);
    }
    for (const folder of plan.toDelete) {
      try {
        await storage.deleteFiles({ prefix: `${pathPrefix}/${folder}/` });
      } catch (e) {
        // Tolerant — log + continue (don't abort cron on cleanup failure)
        console.warn(`Cleanup failed for ${folder}: ${e.message}`);
      }
    }
  }

  const colScope = resolveCollectionScope({ scope });

  // 2+3. Export collections — V122: PARALLEL + dynamic enumeration for full scope.
  // Full scope discovers EVERY collection under PREFIX via listCollections() so
  // a new feature collection can NEVER be silently omitted (Bug-2 fix; the
  // pre-V122 hardcoded lists missed 28/65 prod collections incl. money +
  // counters). Customer-only keeps its curated subset (intentional scope).
  let colNames;
  if (colScope.scope === 'customer-only') {
    colNames = [...colScope.universal, ...colScope.branchScoped];
  } else {
    const discovered = await db.doc(PREFIX).listCollections();
    colNames = discovered
      .map(c => c.id)
      .filter(id => !FULL_SCOPE_COLLECTION_DENYLIST.includes(id));
  }
  const colResults = await mapWithConcurrency(colNames, COLLECTION_CONCURRENCY, async (colName) => {
    try {
      const snap = await db.collection(`${PREFIX}/${colName}`).get();
      // V38 spread-order discipline: docId WINS over any stray data.id field.
      // V81-fix1: encode Firestore-native types (Timestamp/GeoPoint/Bytes) before
      // JSON.stringify so restore can re-hydrate (bare stringify degrades Timestamp→Map).
      const docs = snap.docs.map(d => encodeFirestoreData({ ...d.data(), id: d.id }));
      const json = JSON.stringify(docs, null, 2);
      const category = classifyCollectionCategory(colName);
      const filePath = `${baseStoragePath}/collections/${category}/${colName}.json`;
      await storage.file(filePath).save(json, { contentType: 'application/json' });
      return {
        path: `collections/${category}/${colName}.json`,
        name: colName,
        type: category,
        docCount: docs.length,
        fileSizeBytes: Buffer.byteLength(json, 'utf8'),
        fileHash: sha256Buffer(json),
      };
    } catch (e) {
      failedCollections.push({ name: colName, error: e.message });
      return null;
    }
  });
  for (const r of colResults) if (r) collections.push(r);

  // 4. Export customer subcollections (V74 T4) — V122: PARALLEL over (customer × subcoll) pairs.
  try {
    const custSnap = await db.collection(`${PREFIX}/be_customers`).get();
    const pairs = [];
    for (const custDoc of custSnap.docs) {
      for (const subName of CUSTOMER_SUBCOLLECTIONS) pairs.push({ cid: custDoc.id, subName });
    }
    const subResults = await mapWithConcurrency(pairs, SUBCOLL_CONCURRENCY, async ({ cid, subName }) => {
      try {
        const subSnap = await db.collection(`${PREFIX}/be_customers/${cid}/${subName}`).get();
        if (subSnap.empty) return null;
        const docs = subSnap.docs.map(d => encodeFirestoreData({ ...d.data(), id: d.id }));
        const json = JSON.stringify(docs, null, 2);
        const filePath = `${baseStoragePath}/collections/subcollections/be_customers__${cid}__${subName}.json`;
        await storage.file(filePath).save(json, { contentType: 'application/json' });
        return {
          path: `collections/subcollections/be_customers__${cid}__${subName}.json`,
          name: `be_customers/${cid}/${subName}`,
          type: 'subcollection',
          docCount: docs.length,
          fileSizeBytes: Buffer.byteLength(json, 'utf8'),
          fileHash: sha256Buffer(json),
        };
      } catch (e) {
        failedCollections.push({ name: `be_customers/${cid}/${subName}`, error: e.message });
        return null;
      }
    });
    for (const r of subResults) if (r) collections.push(r);
  } catch (e) {
    failedCollections.push({ name: '__customer_subcollections__', error: e.message });
  }

  // 5. Export chat_conversations messages subcoll — V122: PARALLEL over conversations.
  try {
    const convSnap = await db.collection(`${PREFIX}/chat_conversations`).get();
    const convResults = await mapWithConcurrency(convSnap.docs, SUBCOLL_CONCURRENCY, async (convDoc) => {
      const convId = convDoc.id;
      try {
        const msgsSnap = await db.collection(`${PREFIX}/chat_conversations/${convId}/messages`).get();
        if (msgsSnap.empty) return null;
        const docs = msgsSnap.docs.map(d => encodeFirestoreData({ ...d.data(), id: d.id }));
        const json = JSON.stringify(docs, null, 2);
        const filePath = `${baseStoragePath}/collections/subcollections/chat_conversations__${convId}__messages.json`;
        await storage.file(filePath).save(json, { contentType: 'application/json' });
        return {
          path: `collections/subcollections/chat_conversations__${convId}__messages.json`,
          name: `chat_conversations/${convId}/messages`,
          type: 'subcollection',
          docCount: docs.length,
          fileSizeBytes: Buffer.byteLength(json, 'utf8'),
          fileHash: sha256Buffer(json),
        };
      } catch (e) {
        failedCollections.push({ name: `chat_conversations/${convId}/messages`, error: e.message });
        return null;
      }
    });
    for (const r of convResults) if (r) collections.push(r);
  } catch (e) {
    failedCollections.push({ name: '__chat_messages_subcoll__', error: e.message });
  }

  // 6. Export Auth users (V81-fix6: skip for customer-only scope — Auth is system-wide)
  let authUsersFileHash = '';
  let authUserCount = 0;
  if (colScope.includeAuth) {
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
  }

  // 7. Copy Storage objects (V81-fix6: scope-aware filter) — V122: PARALLEL.
  let totalStorageBytes = 0;
  try {
    const [allStorageFiles] = await storage.getFiles();
    const includeFiles = allStorageFiles.filter(f => resolveStorageScopeForBackup(f.name, { scope }));
    const stResults = await mapWithConcurrency(includeFiles, STORAGE_CONCURRENCY, async (f) => {
      try {
        const destPath = `${baseStoragePath}/storage/${f.name}`;
        await f.copy(storage.file(destPath));
        const [meta] = await f.getMetadata();
        const sizeBytes = parseInt(meta.size || '0', 10);
        const fileHash = await sha256Stream(f.createReadStream());
        return {
          path: `storage/${f.name}`,
          originalGsPath: f.name,
          fileSizeBytes: sizeBytes,
          fileHash,
          contentType: meta.contentType || 'application/octet-stream',
        };
      } catch (e) {
        failedStorageObjects.push({ path: f.name, error: e.message });
        return null;
      }
    });
    for (const r of stResults) {
      if (r) { storageObjects.push(r); totalStorageBytes += r.fileSizeBytes; }
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
  // V81-fix6: stamp scope on manifest so restore knows what to wipe
  manifest.scope = colScope.scope;
  manifest.backupType = scope === 'customer-only' ? 'customer-only' : 'whole-system';
  manifest.manifestHash = computeWholeSystemManifestHash(manifest);

  // 9. Write manifest.json
  const manifestJson = JSON.stringify(manifest, null, 2);
  await storage.file(`${baseStoragePath}/manifest.json`).save(manifestJson, { contentType: 'application/json' });

  // 10. Audit doc
  const auditId = `${scope === 'customer-only' ? 'customer-only' : 'whole-system'}-backup-${name}-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await db.doc(`${PREFIX}/be_admin_audit/${auditId}`).set({
    op: scope === 'customer-only' ? 'customer-only-backup' : 'whole-system-backup',
    name,
    type,
    scope: colScope.scope,
    source: createdBy,
    stats: manifest.stats,
    manifestHash: manifest.manifestHash,
    failedCollections,
    failedStorageObjects,
    completedAt: FieldValue.serverTimestamp(),
  });

  return {
    name,
    scope: colScope.scope,
    manifestHash: manifest.manifestHash,
    stats: manifest.stats,
    failedCollections,
    failedStorageObjects,
  };
}
