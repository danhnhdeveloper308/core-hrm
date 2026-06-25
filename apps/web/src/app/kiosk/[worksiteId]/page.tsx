'use client';

import type { KioskCheckResult, KioskWorksite } from '@repo/shared';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, MapPin, ScanFace } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CameraCapture } from '@/components/checkin/camera-capture';
import { api, ApiError } from '@/lib/api/client';

const TYPE_LABEL: Record<'IN' | 'OUT', string> = { IN: 'VÀO', OUT: 'RA' };

function timeStr(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function KioskPage() {
  const params = useParams<{ worksiteId: string }>();
  const worksiteId = params.worksiteId;

  const [coords, setCoords] = useState<GeolocationCoordinates | null>(null);
  const [clock, setClock] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<KioskCheckResult | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: ws, isError } = useQuery({
    queryKey: ['kiosk', worksiteId],
    queryFn: () => api.get<KioskWorksite>(`/attendance/kiosk/${worksiteId}`),
    retry: false,
  });

  // Đồng hồ
  useEffect(() => {
    const t = setInterval(
      () => setClock(new Date().toLocaleTimeString('vi-VN')),
      1000,
    );
    return () => clearInterval(t);
  }, []);

  // Định vị (nếu địa điểm yêu cầu)
  useEffect(() => {
    if (!ws?.requireLocation || !navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition(
      (pos) => setCoords(pos.coords),
      () => setCoords(null),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 10_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [ws?.requireLocation]);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  async function onCapture(blob: Blob) {
    if (ws?.requireLocation && !coords) {
      toast.error('Đang lấy vị trí — vui lòng bật định vị và thử lại');
      return;
    }
    setSubmitting(true);
    try {
      const form = new FormData();
      if (coords) {
        form.append('lat', String(coords.latitude));
        form.append('lng', String(coords.longitude));
        form.append('accuracy', String(coords.accuracy));
      }
      form.append('photo', blob, 'kiosk.jpg');
      const res = await api.upload<KioskCheckResult>(
        `/attendance/kiosk/${worksiteId}/check`,
        form,
      );
      setResult(res);
      // Tự ẩn kết quả sau 6s để người kế tiếp chấm
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setResult(null), 6000);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'Chấm công thất bại, thử lại',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (isError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <p className="text-lg text-muted-foreground">
          Không tìm thấy địa điểm chấm công. Kiểm tra lại đường dẫn kiosk.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-muted/30 p-4">
      <div className="text-center">
        <h1 className="flex items-center justify-center gap-2 text-2xl font-bold">
          <ScanFace className="size-7 text-primary" /> Chấm công khuôn mặt
        </h1>
        <p className="text-muted-foreground">
          {ws?.orgName ?? '—'} · {ws?.name ?? '…'}
        </p>
        <p className="mt-1 font-mono text-3xl font-bold tabular-nums">{clock}</p>
      </div>

      {result ? (
        <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-2xl border bg-card p-8 text-center shadow-lg">
          <CheckCircle2 className="size-16 text-emerald-500" />
          <p className="text-2xl font-bold">Xin chào, {result.employeeName}!</p>
          <p className="text-muted-foreground">
            {result.employeeCode}
            {result.worksiteName ? ` · ${result.worksiteName}` : ''}
          </p>
          <p className="text-lg">
            Đã chấm{' '}
            <span
              className={
                result.type === 'IN'
                  ? 'font-bold text-emerald-600'
                  : 'font-bold text-orange-600'
              }
            >
              {TYPE_LABEL[result.type]}
            </span>{' '}
            lúc <b>{timeStr(result.recordedAt)}</b>
          </p>
        </div>
      ) : (
        <div className="w-full max-w-md space-y-3">
          <CameraCapture onCapture={(b) => void onCapture(b)} disabled={submitting} />
          {ws?.requireLocation && (
            <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-4" />
              {coords
                ? 'Đã có vị trí — nhìn vào camera và chụp để chấm công'
                : 'Đang lấy vị trí… hãy cho phép truy cập định vị'}
            </p>
          )}
          {submitting && (
            <p className="text-center text-sm text-muted-foreground">
              Đang nhận diện…
            </p>
          )}
        </div>
      )}

      <p className="max-w-md text-center text-xs text-muted-foreground">
        Hệ thống tự nhận diện bạn qua khuôn mặt — không cần đăng nhập. Qua giờ tan
        làm sẽ không chấm RA được (báo HR chấm bù).
      </p>
    </div>
  );
}
