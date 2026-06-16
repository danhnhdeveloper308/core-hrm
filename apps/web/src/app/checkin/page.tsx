'use client';

import type { AttendanceLogResponse } from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, LogIn, LogOut, MapPin } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CameraCapture } from '@/components/checkin/camera-capture';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api, ApiError } from '@/lib/api/client';

interface TodayResponse {
  logs: AttendanceLogResponse[];
  serverTime: string;
  requirement: {
    requireFace: boolean;
    requireLocation: boolean;
    worksiteName: string | null;
    worksiteLat: number | null;
    worksiteLng: number | null;
    radiusM: number | null;
  };
}

const TYPE_LABEL: Record<string, string> = { IN: 'Vào', OUT: 'Ra', UNKNOWN: '—' };

function timeStr(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

/** Haversine (m) để hiển thị khoảng cách tới worksite. */
function distanceM(a: GeolocationCoordinates, lat: number, lng: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat - a.latitude);
  const dLng = toRad(lng - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export default function CheckinPage() {
  const queryClient = useQueryClient();
  const [clock, setClock] = useState('');
  const [coords, setCoords] = useState<GeolocationCoordinates | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      );
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const { data } = useQuery({
    queryKey: ['attendance', 'me', 'today'],
    queryFn: () => api.get<TodayResponse>('/attendance/me/today'),
    refetchInterval: 30_000,
  });

  const req = data?.requirement;

  // Lấy GPS khi worksite yêu cầu vị trí
  useEffect(() => {
    if (!req?.requireLocation || !navigator.geolocation) return;
    // Subscribe geolocation (external system) — setState chỉ trong callback
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        setCoords(pos.coords);
        setGeoError(null);
      },
      () => setGeoError('Không lấy được vị trí — hãy bật định vị'),
      { enableHighAccuracy: true, maximumAge: 10_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [req?.requireLocation]);

  const lastType = data?.logs[data.logs.length - 1]?.type;
  const nextType: 'IN' | 'OUT' = lastType === 'IN' ? 'OUT' : 'IN';

  const check = useMutation({
    mutationFn: (photo?: Blob) => {
      const form = new FormData();
      form.append('type', nextType);
      if (coords) {
        form.append('lat', String(coords.latitude));
        form.append('lng', String(coords.longitude));
        form.append('accuracy', String(coords.accuracy));
      }
      if (photo) form.append('photo', photo, 'checkin.jpg');
      return api.upload<AttendanceLogResponse>('/attendance/check', form);
    },
    onSuccess: (log) => {
      toast.success(`Đã chấm công ${TYPE_LABEL[log.type]} lúc ${timeStr(log.recordedAt)}`);
      void queryClient.invalidateQueries({ queryKey: ['attendance', 'me', 'today'] });
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Chấm công thất bại'),
  });

  const dist =
    coords && req?.worksiteLat != null && req.worksiteLng != null
      ? Math.round(distanceM(coords, req.worksiteLat, req.worksiteLng))
      : null;
  const inRange = dist != null && req?.radiusM != null ? dist <= req.radiusM : true;

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-5 bg-background p-4">
      <div className="text-center">
        <Clock className="mx-auto mb-2 size-8 text-muted-foreground" />
        <p className="text-5xl font-bold tabular-nums">{clock}</p>
        <p className="text-muted-foreground">
          {new Date().toLocaleDateString('vi-VN', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </div>

      {req && (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
          {req.worksiteName ? (
            <span className="text-muted-foreground">
              Địa điểm: <span className="font-medium">{req.worksiteName}</span>
              {req.requireFace && ' · yêu cầu khuôn mặt'}
            </span>
          ) : (
            <span className="rounded-md bg-amber-500/10 px-2 py-1 text-amber-600">
              Bạn chưa được gán địa điểm làm việc — chấm công không yêu cầu xác thực
            </span>
          )}
          {req.requireLocation && (
            <span className="flex items-center gap-1">
              <MapPin className="size-4 text-muted-foreground" />
              {geoError ? (
                <span className="text-destructive">{geoError}</span>
              ) : dist != null ? (
                <span className={inRange ? 'text-green-600' : 'text-destructive'}>
                  Cách {dist}m {inRange ? '(trong phạm vi)' : `(vượt ${req.radiusM}m)`}
                </span>
              ) : (
                <span className="text-muted-foreground">Đang lấy vị trí…</span>
              )}
            </span>
          )}
        </div>
      )}

      {req?.requireFace ? (
        <CameraCapture
          disabled={check.isPending || (req.requireLocation && !inRange)}
          onCapture={(blob) => check.mutate(blob)}
        />
      ) : (
        <Button
          size="lg"
          className="h-20 w-64 text-lg"
          disabled={check.isPending || (req?.requireLocation && !inRange)}
          onClick={() => check.mutate(undefined)}
        >
          {nextType === 'IN' ? (
            <>
              <LogIn className="size-6" /> Chấm công VÀO
            </>
          ) : (
            <>
              <LogOut className="size-6" /> Chấm công RA
            </>
          )}
        </Button>
      )}

      <Card className="w-full max-w-sm">
        <CardContent className="p-4">
          <h2 className="mb-2 text-sm font-semibold">Lịch sử hôm nay</h2>
          {!data || data.logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có lượt chấm công</p>
          ) : (
            <ul className="space-y-1">
              {data.logs.map((log) => (
                <li key={log.id} className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {TYPE_LABEL[log.type]}
                    {log.source === 'FACE' && ' 📷'}
                  </span>
                  <span className="tabular-nums">{timeStr(log.recordedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
