/* global importScripts, firebase, self */
// Service worker cho FCM background push. Config truyền qua query string lúc
// register (file tĩnh trong public/ không đọc được process.env). Backend gửi
// payload `notification` nên FCM tự hiển thị thông báo khi tab đóng.
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

const params = new URLSearchParams(self.location.search);
firebase.initializeApp({
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
});

firebase.messaging();
