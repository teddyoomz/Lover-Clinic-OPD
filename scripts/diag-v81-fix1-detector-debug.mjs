#!/usr/bin/env node
// V81-fix1 detector debug — print actual admin SDK Timestamp shape
// vs my duck-type detector logic.

import { Timestamp } from 'firebase-admin/firestore';
import { encodeFirestoreData } from '../src/lib/wholeSystemBackupCore.js';

const ts = Timestamp.fromMillis(1777000000000);

console.log('=== Timestamp instance probe ===');
console.log('typeof ts:', typeof ts);
console.log('ts.constructor.name:', ts.constructor.name);
console.log('Object.keys(ts):', Object.keys(ts));
console.log('Object.getOwnPropertyNames(ts):', Object.getOwnPropertyNames(ts));
console.log('ts._seconds:', ts._seconds, '(typeof:', typeof ts._seconds, ')');
console.log('ts._nanoseconds:', ts._nanoseconds, '(typeof:', typeof ts._nanoseconds, ')');
console.log('ts.seconds:', ts.seconds, '(typeof:', typeof ts.seconds, ')');
console.log('ts.nanoseconds:', ts.nanoseconds, '(typeof:', typeof ts.nanoseconds, ')');
console.log('JSON.stringify(ts):', JSON.stringify(ts));
console.log('');

console.log('=== encodeFirestoreData(ts) ===');
const encoded = encodeFirestoreData(ts);
console.log(JSON.stringify(encoded, null, 2));
console.log('');

console.log('=== When wrapped in object ===');
const wrapped = { name: 'A', createdAt: ts, nested: { lastSyncedAt: ts } };
console.log('Original obj keys:', Object.keys(wrapped));
console.log('Original.createdAt keys:', Object.keys(wrapped.createdAt));
const enc2 = encodeFirestoreData(wrapped);
console.log('Encoded:', JSON.stringify(enc2, null, 2));
