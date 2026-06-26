'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, CheckCircle2, Trash2, X } from 'lucide-react';
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
interface EnrolledPhoto {
  index: number;
  url: string;
}

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
  const { data: photos } = useQuery({
    queryKey: ['face', 'me', 'photos'],
    queryFn: () => api.get<EnrolledPhoto[]>('/face/me/photos'),
  });

  const enrolledCount = photos?.length ?? status?.enrolledCount ?? 0;
  const remaining = Math.max(0, MAX_SHOTS - enrolledCount);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void startCamera();
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
  }, [startCamera]);

  useEffect(() => {
    return () => previews.forEach((url) => URL.revokeObjectURL(url));
  }, [previews]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['face', 'me', 'status'] });
    void queryClient.invalidateQueries({ queryKey: ['face', 'me', 'photos'] });
  };

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

  const addPhotos = useMutation({
    mutationFn: () => {
      const form = new FormData();
      shots.forEach((blob, i) => form.append('photos', blob, `face-${i}.jpg`));
      return api.upload<{ enrolledCount: number }>('/face/me/photos', form);
    },
    onSuccess: (res) => {
      toast.success(`Đã lưu — hiện có ${res.enrolledCount}/${MAX_SHOTS} ảnh`);
      setShots([]);
      setPreviews([]);
      invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Lưu ảnh thất bại'),
  });

  const deletePhoto = useMutation({
    mutationFn: (index: number) =>
      api.delete<{ enrolledCount: number }>(`/face/me/photos/${index}`),
    onSuccess: () => {
      toast.success('Đã xoá ảnh');
      invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Xoá thất bại'),
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
        <h1 className="text-2xl font-bold">Khuôn mặt chấm công</h1>
        <p className="text-muted-foreground">
          Dùng để chấm công bằng khuôn mặt. Lưu tối đa {MAX_SHOTS} ảnh (rõ mặt,
          nhìn thẳng, đủ sáng) — đủ để nhận diện.
        </p>
      </div>

      {/* Ảnh đã đăng ký */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {enrolledCount > 0 && <CheckCircle2 className="size-5 text-green-600" />}
            Ảnh đã đăng ký ({enrolledCount}/{MAX_SHOTS})
          </CardTitle>
          <CardDescription>
            {enrolledCount === 0
              ? 'Chưa có ảnh nào — chụp bên dưới để đăng ký.'
              : status?.enrolledAt
                ? `Cập nhật ${new Date(status.enrolledAt).toLocaleDateString('vi-VN')} · bấm thùng rác để xoá`
                : 'Bấm thùng rác để xoá ảnh'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {enrolledCount === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa đăng ký khuôn mặt</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {(photos ?? []).map((p) => (
                <div key={p.index} className="relative">
                  {/* signed URL từ storage — không dùng next/image */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={`Ảnh ${p.index + 1}`}
                    className="size-24 rounded-md border object-cover"
                  />
                  <button
                    type="button"
                    aria-label="Xoá ảnh"
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-1 text-white disabled:opacity-50"
                    disabled={deletePhoto.isPending}
                    onClick={() => deletePhoto.mutate(p.index)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chụp thêm */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Chụp thêm ảnh</CardTitle>
          <CardDescription>
            {remaining > 0
              ? `Có thể thêm ${remaining} ảnh nữa`
              : `Đã đủ ${MAX_SHOTS} ảnh — chụp thêm sẽ GHI ĐÈ ảnh cũ nhất`}
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
            <Camera className="size-4" /> Chụp ({shots.length}/{MAX_SHOTS})
          </Button>

          {previews.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {previews.map((url, i) => (
                <div key={url} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Ảnh mới ${i + 1}`}
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
            disabled={shots.length < 1 || addPhotos.isPending}
            onClick={() => addPhotos.mutate()}
          >
            {addPhotos.isPending ? 'Đang lưu…' : `Lưu ${shots.length} ảnh`}
          </Button>
        </CardContent>
      </Card>
    </FadeIn>
  );
}
