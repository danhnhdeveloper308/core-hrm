'use client';

import { Camera, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

interface CameraCaptureProps {
  /** Gọi khi chụp xong — trả Blob JPEG. */
  onCapture: (blob: Blob) => void;
  disabled?: boolean;
}

/** Mở camera trước, chụp 1 khung hình → JPEG blob. Tối giản cho điện thoại yếu. */
export function CameraCapture({ onCapture, disabled }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // setState chỉ sau await (async) — tránh set đồng bộ trong effect
  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setReady(true);
        setError(null);
      }
    } catch {
      setReady(false);
      setError('Không mở được camera — kiểm tra quyền truy cập');
    }
  }, []);

  useEffect(() => {
    // Subscribe camera (external system) — setState nằm trong callback async của start()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void start();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [start]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(blob);
      },
      'image/jpeg',
      0.9,
    );
  }, [onCapture]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative aspect-4/3 w-full max-w-sm overflow-hidden rounded-lg bg-muted">
        <video ref={videoRef} className="size-full object-cover" playsInline muted />
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground">
            <p>{error}</p>
            <Button size="sm" variant="outline" onClick={() => void start()}>
              <RefreshCw className="size-4" /> Thử lại
            </Button>
          </div>
        )}
      </div>
      <Button
        className="w-full max-w-sm"
        disabled={!ready || disabled}
        onClick={capture}
      >
        <Camera className="size-5" /> Chụp & chấm công
      </Button>
    </div>
  );
}
