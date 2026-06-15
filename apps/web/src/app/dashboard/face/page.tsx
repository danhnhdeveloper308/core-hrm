'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, CheckCircle2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FadeIn } from '@/components/motion/primitives';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { api, ApiError } from '@/lib/api/client';

interface FaceStatus {
  enrolled: boolean;
  enrolledCount: number;
  enrolledAt: string | null;
}

const MIN_SHOTS = 3;
const MAX_SHOTS = 5;

export default function FaceEnrollPage() {
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [shots, setShots] = useState<Blob[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [camError, setCamError] = useState<string | null>(null);

  const { data: status } = useQuery({
    queryKey: ['face', 'me', 'status'],
    queryFn: () => api.get<FaceStatus>('/face/me/status'),
  });

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCamError(null);
      }
    } catch {
      setCamError('Không mở được camera — kiểm tra quyền truy cập');
    }
  }, []);

  useEffect(() => {
    // Subscribe camera (external system) — setState trong callback async
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void startCamera();
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
  }, [startCamera]);

  useEffect(() => {
    return () => previews.forEach((url) => URL.revokeObjectURL(url));
  }, [previews]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || shots.length >= MAX_SHOTS) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setShots((s) => [...s, blob]);
        setPreviews((p) => [...p, URL.createObjectURL(blob)]);
      },
      'image/jpeg',
      0.9,
    );
  }, [shots.length]);

  const enroll = useMutation({
    mutationFn: () => {
      const form = new FormData();
      shots.forEach((blob, i) => form.append('photos', blob, `enroll-${i}.jpg`));
      return api.upload<{ enrolledCount: number }>('/face/enroll', form);
    },
    onSuccess: (res) => {
      toast.success(`Đã đăng ký khuôn mặt với ${res.enrolledCount} ảnh`);
      setShots([]);
      setPreviews([]);
      void queryClient.invalidateQueries({ queryKey: ['face', 'me', 'status'] });
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Đăng ký thất bại'),
  });

  function removeShot(index: number) {
    setPreviews((p) => {
      const url = p[index];
      if (url) URL.revokeObjectURL(url);
      return p.filter((_, i) => i !== index);
    });
    setShots((s) => s.filter((_, i) => i !== index));
  }

  return (
    <FadeIn className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Đăng ký khuôn mặt</h1>
        <p className="text-muted-foreground">
          Dùng để chấm công bằng khuôn mặt. Chụp {MIN_SHOTS}–{MAX_SHOTS} ảnh rõ
          mặt, nhìn thẳng, đủ sáng.
        </p>
      </div>

      {status?.enrolled && (
        <Card>
          <CardContent className="flex items-center gap-2 p-4 text-sm">
            <CheckCircle2 className="size-5 text-green-600" />
            Đã đăng ký {status.enrolledCount} ảnh
            {status.enrolledAt
              ? ` · ${new Date(status.enrolledAt).toLocaleDateString('vi-VN')}`
              : ''}
            . Chụp lại để cập nhật.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Camera</CardTitle>
          <CardDescription>
            Đã chụp {shots.length}/{MAX_SHOTS}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative mx-auto aspect-4/3 w-full max-w-md overflow-hidden rounded-lg bg-muted">
            <video ref={videoRef} className="size-full object-cover" playsInline muted />
            {camError && (
              <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-muted-foreground">
                {camError}
              </div>
            )}
          </div>

          <Button
            className="w-full"
            variant="outline"
            onClick={capture}
            disabled={shots.length >= MAX_SHOTS || camError !== null}
          >
            <Camera className="size-4" /> Chụp ảnh ({shots.length}/{MAX_SHOTS})
          </Button>

          {previews.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {previews.map((url, i) => (
                <div key={url} className="relative">
                  {/* preview blob local, không cần next/image */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Ảnh ${i + 1}`}
                    className="size-20 rounded-md object-cover"
                  />
                  <button
                    type="button"
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-white"
                    onClick={() => removeShot(i)}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <Button
            className="w-full"
            disabled={shots.length < MIN_SHOTS || enroll.isPending}
            onClick={() => enroll.mutate()}
          >
            {enroll.isPending
              ? 'Đang đăng ký…'
              : `Đăng ký khuôn mặt (${shots.length} ảnh)`}
          </Button>
        </CardContent>
      </Card>
    </FadeIn>
  );
}
