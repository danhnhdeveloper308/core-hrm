Rà soát bảo mật toàn repo và báo cáo + fix:
- Cookie flags (httpOnly/Secure/SameSite), CORS origins, helmet config
- Refresh token rotation + reuse detection còn đúng không
- Route nào thiếu @RequirePermissions / @Public
- Input nào chưa qua zod validation
- Secrets bị hardcode, log lộ thông tin nhạy cảm (token, password hash)
- Rate limiting cho auth endpoints
