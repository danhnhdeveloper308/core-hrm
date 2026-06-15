'use client';

import type { Enable2faResponse, Setup2faResponse } from '@repo/shared';
import { Copy, Download, ShieldCheck, ShieldOff } from 'lucide-react';
/* eslint-disable @next/next/no-img-element -- QR là data-URL, không cần next/image */
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { api, ApiError } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';

/** Tải recovery codes về file .txt — kèm hướng dẫn và thời điểm tạo. */
function downloadRecoveryCodes(codes: string[], email: string | undefined) {
  const content = [
    'RECOVERY CODES — Xác thực 2 lớp',
    `Tài khoản: ${email ?? 'không rõ'}`,
    `Tạo lúc: ${new Date().toLocaleString('vi-VN')}`,
    '',
    'Mỗi mã chỉ dùng được MỘT lần khi mất thiết bị authenticator.',
    'Lưu file này ở nơi an toàn (password manager, két...) — KHÔNG chia sẻ.',
    '',
    ...codes.map((code, i) => `${String(i + 1).padStart(2, '0')}. ${code}`),
    '',
  ].join('\n');

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `recovery-codes-${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function TwoFactorCard() {
  const user = useAuthStore((s) => s.user);
  const hydrate = useAuthStore((s) => s.hydrate);

  const [setup, setSetup] = useState<Setup2faResponse | null>(null);
  const [confirmCode, setConfirmCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function startSetup() {
    setBusy(true);
    try {
      setSetup(await api.post<Setup2faResponse>('/auth/2fa/setup'));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Lỗi khởi tạo 2FA');
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable() {
    setBusy(true);
    try {
      const res = await api.post<Enable2faResponse>('/auth/2fa/enable', {
        code: confirmCode,
      });
      setRecoveryCodes(res.recoveryCodes);
      setSetup(null);
      setConfirmCode('');
      await hydrate();
      toast.success('Đã bật xác thực 2 lớp');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Mã không đúng');
      setConfirmCode('');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      await api.post('/auth/2fa/disable', { password: disablePassword });
      setDisableOpen(false);
      setDisablePassword('');
      await hydrate();
      toast.success('Đã tắt xác thực 2 lớp');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Tắt 2FA thất bại');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Xác thực 2 lớp (TOTP)
          {user?.totpEnabled ? (
            <Badge className="gap-1">
              <ShieldCheck className="size-3" /> Đang bật
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1">
              <ShieldOff className="size-3" /> Chưa bật
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Bảo vệ tài khoản bằng mã 6 số từ Google Authenticator / 1Password…
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {user?.totpEnabled ? (
          <Button
            variant="destructive"
            onClick={() => setDisableOpen(true)}
            disabled={busy}
          >
            Tắt 2FA
          </Button>
        ) : (
          <Button onClick={startSetup} disabled={busy}>
            {busy ? 'Đang khởi tạo…' : 'Bật 2FA'}
          </Button>
        )}

        {/* Bước 1+2: quét QR rồi nhập mã xác nhận */}
        <Dialog open={setup !== null} onOpenChange={(o) => !o && setSetup(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Quét QR bằng app authenticator</DialogTitle>
              <DialogDescription>
                Sau khi quét, nhập mã 6 số đầu tiên để xác nhận và bật 2FA.
              </DialogDescription>
            </DialogHeader>
            {setup ? (
              <div className="flex flex-col items-center gap-4">
                <img
                  src={setup.qrCodeDataUrl}
                  alt="QR code 2FA"
                  className="size-48 rounded-md border bg-white p-2"
                />
                <div className="w-full space-y-1 text-center">
                  <p className="text-xs text-muted-foreground">
                    Không quét được? Nhập secret thủ công:
                  </p>
                  <code className="block break-all rounded bg-muted px-2 py-1 text-xs">
                    {setup.secret}
                  </code>
                </div>
                <InputOTP
                  maxLength={6}
                  value={confirmCode}
                  onChange={setConfirmCode}
                  onComplete={confirmEnable}
                >
                  <InputOTPGroup>
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
            ) : null}
            <DialogFooter>
              <Button
                onClick={confirmEnable}
                disabled={busy || confirmCode.length !== 6}
                className="w-full"
              >
                {busy ? 'Đang xác nhận…' : 'Xác nhận & bật 2FA'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bước 3: hiện recovery codes đúng 1 lần */}
        <Dialog
          open={recoveryCodes !== null}
          onOpenChange={(o) => !o && setRecoveryCodes(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Lưu recovery codes</DialogTitle>
              <DialogDescription>
                8 mã dưới đây chỉ hiển thị <b>một lần duy nhất</b>. Dùng khi mất
                thiết bị authenticator — mỗi mã dùng được 1 lần.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2">
              {recoveryCodes?.map((code) => (
                <code
                  key={code}
                  className="rounded bg-muted px-2 py-1 text-center font-mono text-sm"
                >
                  {code}
                </code>
              ))}
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  downloadRecoveryCodes(recoveryCodes ?? [], user?.email);
                  toast.success('Đã tải recovery codes (.txt)');
                }}
              >
                <Download className="size-4" /> Tải về (.txt)
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(
                    (recoveryCodes ?? []).join('\n'),
                  );
                  toast.success('Đã copy recovery codes');
                }}
              >
                <Copy className="size-4" /> Copy tất cả
              </Button>
              <Button onClick={() => setRecoveryCodes(null)}>Đã lưu xong</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Tắt 2FA — yêu cầu mật khẩu */}
        <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tắt xác thực 2 lớp</DialogTitle>
              <DialogDescription>
                Nhập mật khẩu để xác nhận. Recovery codes cũ sẽ bị vô hiệu.
              </DialogDescription>
            </DialogHeader>
            <Input
              type="password"
              placeholder="Mật khẩu hiện tại"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
            />
            <DialogFooter>
              <Button
                variant="destructive"
                onClick={disable}
                disabled={busy || !disablePassword}
              >
                {busy ? 'Đang tắt…' : 'Tắt 2FA'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
