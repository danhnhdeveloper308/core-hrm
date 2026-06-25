'use client';

import { toast } from 'sonner';
import { api } from './api/client';

/**
 * Thông báo trình duyệt 2 lớp:
 * 1) Notification API (KHÔNG cần Firebase) — hiện thông báo OS khi user đang ở
 *    tab khác (app vẫn mở nền, socket còn sống). Chỉ cần user cấp quyền.
 * 2) FCM push (cần NEXT_PUBLIC_FIREBASE_*) — thêm trường hợp ĐÓNG HẲN trình duyệt.
 * Prompt xin quyền tách khỏi cấu hình FCM → vẫn hỏi & dùng được lớp (1) khi
 * chưa cấu hình Firebase.
 */
const cfg = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

export type FcmResult = 'ok' | 'unsupported' | 'denied' | 'error';

export const FCM_RESULT_MSG: Record<FcmResult, string> = {
  ok: 'Đã bật thông báo trên thiết bị này',
  denied: 'Bạn đã từ chối quyền thông báo của trình duyệt',
  unsupported: 'Trình duyệt không hỗ trợ thông báo',
  error: 'Không bật được thông báo',
};

/** Firebase đã cấu hình đủ để lấy FCM token (push khi đóng trình duyệt). */
export function fcmConfigured(): boolean {
  return Boolean(
    cfg.apiKey && cfg.projectId && cfg.messagingSenderId && cfg.appId && vapidKey,
  );
}

/** Trình duyệt hỗ trợ Notification API. */
export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission;
}

/** Đăng ký FCM token (chỉ khi đã cấu hình + đã cấp quyền). Best-effort. */
async function registerFcmToken(): Promise<void> {
  if (!fcmConfigured() || !('serviceWorker' in navigator)) return;
  const [{ initializeApp, getApps }, { getMessaging, getToken, isSupported, onMessage }] =
    await Promise.all([import('firebase/app'), import('firebase/messaging')]);
  if (!(await isSupported())) return;

  const app = getApps()[0] ?? initializeApp(cfg as Record<string, string>);
  const swUrl = `/firebase-messaging-sw.js?${new URLSearchParams({
    apiKey: cfg.apiKey ?? '',
    authDomain: cfg.authDomain ?? '',
    projectId: cfg.projectId ?? '',
    messagingSenderId: cfg.messagingSenderId ?? '',
    appId: cfg.appId ?? '',
  }).toString()}`;
  const registration = await navigator.serviceWorker.register(swUrl);

  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });
  if (token) {
    await api.post('/notifications/device-tokens', { token, platform: 'web' });
  }
  // Foreground: socket đã hiển thị in-app → no-op tránh trùng
  onMessage(messaging, () => {});
}

/**
 * Bật thông báo: xin quyền (tuỳ chọn) → nếu được cấp thì lớp (1) hoạt động ngay;
 * thêm đăng ký FCM nếu đã cấu hình. Trả mã kết quả cho UI.
 */
export async function initFcm(opts?: {
  requestPermission?: boolean;
}): Promise<FcmResult> {
  if (!pushSupported()) return 'unsupported';
  try {
    let permission = Notification.permission;
    if (permission === 'default' && opts?.requestPermission) {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') return 'denied';
    // Quyền OK → lớp (1) chạy được. FCM là tuỳ chọn, lỗi không chặn kết quả.
    try {
      await registerFcmToken();
    } catch {
      /* FCM lỗi nhưng native notification vẫn hoạt động */
    }
    return 'ok';
  } catch {
    return 'error';
  }
}

/**
 * Hiện thông báo OS khi user KHÔNG đang xem tab này (đang ở tab/app khác).
 * Dùng Notification API trực tiếp — không cần Firebase. Tab đang xem thì bỏ qua
 * (toast in-app là đủ) để tránh trùng.
 */
export function showNativeIfHidden(n: {
  title: string;
  body: string;
  link: string | null;
}): void {
  if (typeof document === 'undefined' || !pushSupported()) return;
  // Có FCM → để FCM (service worker) lo thông báo OS, tránh hiển thị TRÙNG.
  if (fcmConfigured()) return;
  if (document.visibilityState === 'visible') return;
  if (Notification.permission !== 'granted') return;
  try {
    const notif = new Notification(n.title, { body: n.body });
    notif.onclick = () => {
      window.focus();
      if (n.link) window.location.href = n.link;
      notif.close();
    };
  } catch {
    /* một số trình duyệt yêu cầu hiển thị qua service worker — bỏ qua êm */
  }
}

// ===== Prompt xin quyền (1 lần, không nag) =====
const DISMISS_KEY = 'push-prompt-dismissed-at';
const DISMISS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 ngày
let promptedThisSession = false;

function rememberDismiss(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* localStorage không khả dụng — bỏ qua */
  }
}

function dismissedRecently(): boolean {
  try {
    const last = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return last > 0 && Date.now() - last < DISMISS_WINDOW_MS;
  } catch {
    return false;
  }
}

/**
 * Gọi sau khi đăng nhập: nếu trình duyệt hỗ trợ + chưa cấp quyền + chưa bị tắt
 * gần đây → hiện 1 prompt (toast có nút Bật). KHÔNG phụ thuộc cấu hình Firebase
 * (vẫn hỏi để bật thông báo khi ở tab khác). Không hỏi lại trong phiên + 7 ngày
 * sau khi user bấm "Để sau".
 */
export function maybePromptForPush(): void {
  if (promptedThisSession) return;
  if (!pushSupported()) return;
  if (Notification.permission !== 'default') return; // granted→xong; denied→không hỏi lại được
  if (dismissedRecently()) return;
  promptedThisSession = true;

  toast('Bật thông báo trên trình duyệt?', {
    description: 'Nhận thông báo duyệt đơn ngay cả khi bạn đang ở tab khác.',
    duration: Infinity,
    action: {
      label: 'Bật',
      onClick: () => {
        void (async () => {
          const res = await initFcm({ requestPermission: true });
          toast[res === 'ok' ? 'success' : 'warning'](FCM_RESULT_MSG[res]);
          rememberDismiss(); // đã xử lý → không hỏi lại
        })();
      },
    },
    cancel: { label: 'Để sau', onClick: rememberDismiss },
    onDismiss: rememberDismiss,
  });
}
