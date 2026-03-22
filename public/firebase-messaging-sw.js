// Firebase Messaging Service Worker — LoverClinic OPD
// ไฟล์นี้ต้องอยู่ที่ /public/firebase-messaging-sw.js (serve ที่ root)

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20",
  authDomain: "loverclinic-opd-4c39b.firebaseapp.com",
  projectId: "loverclinic-opd-4c39b",
  storageBucket: "loverclinic-opd-4c39b.firebasestorage.app",
  messagingSenderId: "653911776503",
  appId: "1:653911776503:web:9e23f723d3ed877962c7f2",
});

const messaging = firebase.messaging();

// FCM auto-shows notification จาก notification payload ในข้อความ
// ไม่ต้องเรียก showNotification ซ้ำใน onBackgroundMessage เพราะจะได้ 2 อัน

// กดที่ notification → เปิดแอป
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
