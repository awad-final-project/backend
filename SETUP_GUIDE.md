# Hướng dẫn sử dụng hệ thống

## Bước 1: Cài đặt

```bash
# Clone repository (nếu cần)
git clone <repository-url>
cd backend

# Cài đặt dependencies
pnpm install
```

## Bước 2: Cấu hình môi trường

```bash
# Copy file .env.example sang .env
cp .env.example .env
```

Sau đó chỉnh sửa file `.env` với thông tin của bạn.

### Cấu hình Gmail

1. Truy cập: https://myaccount.google.com/security
2. Bật "2-Step Verification"
3. Truy cập: https://myaccount.google.com/apppasswords
4. Chọn "Mail" và "Other (Custom name)"
5. Copy password 16 ký tự và dán vào `.env`:

```env
MAIL_USER=your-email@gmail.com
MAIL_PASSWORD=abcdabcdabcdabcd  # 16 characters, no spaces
```

### Cấu hình Outlook

1. Truy cập: https://account.microsoft.com/security
2. Bật "Two-step verification"
3. Tạo App password trong "Advanced security options"
4. Cấu hình trong `.env`:

```env
MAIL_HOST=smtp.office365.com
MAIL_USER=your-email@outlook.com
MAIL_PASSWORD=your-app-password
```

## Bước 3: Khởi chạy MongoDB

```bash
# Nếu dùng Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest

# Hoặc cài MongoDB local
# https://www.mongodb.com/try/download/community
```

## Bước 4: Chạy ứng dụng

```bash
# Development mode
pnpm run start:dev

# Production mode
pnpm run build
pnpm run start:prod
```

Server sẽ chạy tại: http://localhost:3000

## Bước 5: Test API

### 5.1 Đăng ký user mới

```bash
curl -X POST http://localhost:3000/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@gmail.com",
    "password": "SecurePassword123!"
  }'
```

Response:
```json
{
  "message": "User registered successfully",
  "userId": "...",
  "email": "test@gmail.com",
  "username": "testuser"
}
```

Kiểm tra email để thấy welcome email!

### 5.2 Đăng nhập

```bash
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@gmail.com",
    "password": "SecurePassword123!"
  }'
```

Response:
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "abc123...",
  "email": "test@gmail.com",
  "username": "testuser"
}
```

### 5.3 Lấy thông tin profile

```bash
curl -X GET http://localhost:3000/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 5.4 Yêu cầu reset password

```bash
curl -X POST http://localhost:3000/password/request-reset \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@gmail.com"
  }'
```

Kiểm tra email để lấy reset token!

### 5.5 Reset password

```bash
curl -X POST http://localhost:3000/password/reset \
  -H "Content-Type: application/json" \
  -d '{
    "token": "token-from-email",
    "newPassword": "NewPassword123!"
  }'
```

### 5.6 Đổi password (đã đăng nhập)

```bash
curl -X POST http://localhost:3000/password/change \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "NewPassword123!",
    "newPassword": "AnotherPassword123!"
  }'
```

## Bước 6: Tích hợp Frontend

### React/Vue/Angular example:

```typescript
// Register
const register = async (username: string, email: string, password: string) => {
  const response = await fetch('http://localhost:3000/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, email, password }),
  });
  return response.json();
};

// Login
const login = async (email: string, password: string) => {
  const response = await fetch('http://localhost:3000/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json();
  
  // Save tokens
  localStorage.setItem('accessToken', data.accessToken);
  localStorage.setItem('refreshToken', data.refreshToken);
  
  return data;
};

// Make authenticated request
const getProfile = async () => {
  const token = localStorage.getItem('accessToken');
  const response = await fetch('http://localhost:3000/profile', {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  return response.json();
};

// Google OAuth
const loginWithGoogle = () => {
  window.location.href = 'http://localhost:3000/auth/google';
};
```

## Bước 7: Sử dụng email động (từ user)

Để gửi email từ địa chỉ email của người dùng:

```typescript
// Trong EmailService hoặc controller
import { DynamicMailService } from '../mailer';

// Inject service
constructor(private dynamicMailService: DynamicMailService) {}

// Gửi email
async sendUserEmail(userEmail: string, userPassword: string, to: string, subject: string, content: string) {
  await this.dynamicMailService.sendMailWithCredentials(
    userEmail,
    userPassword,
    {
      to,
      subject,
      html: content,
      text: content,
    }
  );
}
```

## Bước 8: Nhận email qua IMAP

```typescript
import { ImapService } from '../imap';

// Inject service
constructor(private imapService: ImapService) {}

// Fetch emails
async getUserEmails(userEmail: string, userPassword: string) {
  const emails = await this.imapService.fetchEmailsForUser(
    userEmail,
    userPassword,
    'INBOX',
    50
  );
  return emails;
}
```

## Troubleshooting

### Lỗi: "Authentication failed"

**Gmail:**
- Đảm bảo đã bật 2FA
- Sử dụng App Password, không phải password thường
- Kiểm tra không có khoảng trắng trong password

**Outlook:**
- Bật 2FA
- Tạo App Password
- Thử với `smtp.office365.com` thay vì `smtp-mail.outlook.com`

### Lỗi: "Connection timeout"

- Kiểm tra firewall
- Verify port 587 (SMTP) và 993 (IMAP) mở
- Thử ping server: `ping smtp.gmail.com`

### Lỗi: "Invalid JWT token"

- Token đã hết hạn (15 phút)
- Sử dụng refresh token để lấy token mới
- Kiểm tra JWT_SECRET khớp

### Email không nhận được

- Kiểm tra spam folder
- Verify SMTP credentials
- Check logs trong console
- Test với email khác

## Production Checklist

- [ ] Đổi `NODE_ENV=production`
- [ ] Sử dụng JWT_SECRET mạnh (min 32 chars)
- [ ] Bật HTTPS
- [ ] Cấu hình CORS đúng
- [ ] Rate limiting
- [ ] Logging và monitoring
- [ ] Backup database
- [ ] Environment variables an toàn
- [ ] Update dependencies

## Support

Nếu gặp vấn đề, kiểm tra:
1. Logs trong console
2. MongoDB connection
3. Email credentials
4. Network/firewall settings

## Tài liệu tham khảo

- [Gmail App Passwords](https://support.google.com/accounts/answer/185833)
- [Outlook App Passwords](https://support.microsoft.com/en-us/account-billing/manage-app-passwords-for-two-step-verification-d6dc8c6d-4bf7-4851-ad95-6d07799387e9)
- [NestJS Documentation](https://docs.nestjs.com)
- [Passport.js](http://www.passportjs.org/)
- [Nodemailer](https://nodemailer.com/)
