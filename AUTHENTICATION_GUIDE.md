# Hệ thống đăng nhập và gửi nhận Email

## Tổng quan

Hệ thống này cung cấp luồng đăng ký/đăng nhập local và OAuth2 (Google) với khả năng gửi nhận email thông qua SMTP/IMAP cho cả Gmail và Outlook.

## Tính năng chính

### 1. Xác thực người dùng (Authentication)

#### Đăng ký Local
```
POST /register
Body: {
  "username": "john_doe",
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

Khi đăng ký thành công:
- Mật khẩu được hash bằng bcrypt (10 rounds)
- Tự động gửi email welcome
- Lưu user với `authProvider: 'local'`

#### Đăng nhập Local
```
POST /login
Body: {
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

Response:
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "abc123...",
  "email": "user@example.com",
  "username": "john_doe"
}
```

#### Đăng nhập Google OAuth2
```
GET /auth/google
```
Redirect đến Google OAuth consent screen, sau khi xác thực redirect về:
```
GET /auth/google/callback
```

### 2. Quản lý mật khẩu

#### Yêu cầu reset mật khẩu
```
POST /password/request-reset
Body: {
  "email": "user@example.com"
}
```

Hệ thống sẽ:
- Tạo token reset an toàn (32 bytes random)
- Token có thời hạn 1 giờ
- Gửi email với link reset password

#### Reset mật khẩu
```
POST /password/reset
Body: {
  "token": "token_from_email",
  "newPassword": "NewSecurePassword123!"
}
```

#### Đổi mật khẩu (đã đăng nhập)
```
POST /password/change
Headers: {
  "Authorization": "Bearer <accessToken>"
}
Body: {
  "currentPassword": "OldPassword123!",
  "newPassword": "NewSecurePassword123!"
}
```

### 3. Gửi nhận Email

#### Hỗ trợ các Email Provider

Hệ thống tự động phát hiện và cấu hình cho:

1. **Gmail**
   - IMAP: imap.gmail.com:993 (SSL/TLS)
   - SMTP: smtp.gmail.com:587 (STARTTLS)

2. **Outlook/Hotmail**
   - IMAP: outlook.office365.com:993 (SSL/TLS)
   - SMTP: smtp.office365.com:587 (STARTTLS)

3. **Yahoo Mail**
   - IMAP: imap.mail.yahoo.com:993 (SSL/TLS)
   - SMTP: smtp.mail.yahoo.com:587 (STARTTLS)

#### Gửi Email với credentials của user

```typescript
// Trong code
await dynamicMailService.sendMailWithCredentials(
  'user@gmail.com',
  'user_app_password',
  {
    to: 'recipient@example.com',
    subject: 'Test Email',
    html: '<h1>Hello</h1><p>This is a test</p>',
    text: 'Hello, this is a test',
  }
);
```

#### Nhận Email từ IMAP

```typescript
// Fetch emails cho một user cụ thể
const emails = await imapService.fetchEmailsForUser(
  'user@gmail.com',
  'user_app_password',
  'INBOX',
  50 // limit
);
```

### 4. Mã hóa Credentials

Hệ thống cung cấp mã hóa AES-256-GCM cho email credentials:

```typescript
// Encrypt email password
const encryptedPassword = await authService.encryptCredentials(
  'user_email_password',
  'user_account_password'
);

// Decrypt để sử dụng
const decryptedPassword = await authService.decryptCredentials(
  encryptedPassword,
  'user_account_password'
);
```

**Đặc điểm:**
- Algorithm: AES-256-GCM (authenticated encryption)
- Key derivation: scrypt
- Salt: 64 bytes random
- IV: 16 bytes random
- Auth tag: 16 bytes

## Cấu hình môi trường (.env)

```env
# Database
MONGODB_URI=mongodb://localhost:27017/email_system

# JWT
JWT_SECRET=your-secret-key-min-32-characters

# Server
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Google OAuth2
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# System Email (cho welcome email, password reset)
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=your-system-email@gmail.com
MAIL_PASSWORD=your-app-password
MAIL_FROM="System <noreply@example.com>"

# IMAP (optional - cho scheduled email fetching)
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=your-email@gmail.com
IMAP_PASSWORD=your-app-password
IMAP_TLS=true

# Cookie Authentication (optional)
USE_COOKIE_AUTH=false
```

## Cài đặt

```bash
# Install dependencies
pnpm install

# Start development server
pnpm run start:dev

# Build for production
pnpm run build

# Start production server
pnpm run start:prod
```

## Cấu hình Gmail/Outlook

### Gmail

1. Bật 2-Factor Authentication
2. Tạo App Password:
   - Google Account → Security → 2-Step Verification → App passwords
   - Chọn "Mail" và "Other device"
   - Copy password (16 ký tự không có khoảng trắng)

### Outlook

1. Bật 2-Factor Authentication
2. Tạo App Password:
   - Microsoft Account → Security → Advanced security options
   - Create a new app password
   - Sử dụng password này thay vì password thường

## Kiến trúc bảo mật

### 1. Password Security
- Hash: bcrypt với 10 salt rounds
- Không bao giờ lưu plaintext password
- Password reset token: cryptographically random, 1 hour expiry

### 2. Token Management
- Access token: JWT, 15 minutes expiry
- Refresh token: Random 40 bytes hex, 7 days expiry
- Automatic token rotation khi refresh

### 3. Email Encryption
- AES-256-GCM với authenticated encryption
- Key derivation từ user password (không lưu key)
- Salt và IV unique cho mỗi encryption

### 4. SMTP/IMAP Security
- Luôn sử dụng TLS/SSL
- App passwords thay vì passwords thường
- Connection timeout và retry logic

## API Endpoints

### Authentication
- `POST /register` - Đăng ký user mới
- `POST /login` - Đăng nhập local
- `POST /refresh` - Làm mới access token
- `POST /logout` - Đăng xuất
- `GET /profile` - Lấy thông tin user
- `GET /auth/google` - Bắt đầu OAuth2 flow
- `GET /auth/google/callback` - Google callback

### Password Management
- `POST /password/request-reset` - Yêu cầu reset password
- `POST /password/reset` - Reset password với token
- `POST /password/change` - Đổi password (authenticated)

## Database Schema

### Account
```typescript
{
  username: string (unique, required)
  email: string (unique, required)
  password?: string (hashed, optional cho OAuth users)
  googleId?: string (unique, sparse)
  googleAccessToken?: string
  googleRefreshToken?: string
  authProvider: 'local' | 'google' (default: 'local')
  role: string (default: 'user')
  createdAt: Date
  updatedAt: Date
}
```

### PasswordReset
```typescript
{
  email: string (required)
  token: string (required, unique)
  expiresAt: Date (required, TTL index)
  used: boolean (default: false)
  createdAt: Date
}
```

### RefreshToken
```typescript
{
  token: string (required, unique)
  accountId: string (required)
  expiresAt: Date (required)
  createdAt: Date
}
```

### AccessToken
```typescript
{
  accessToken: string (required)
  accountId: string (required)
  createdAt: Date
}
```

## Best Practices

1. **Luôn sử dụng HTTPS trong production**
2. **Rotate secrets định kỳ**
3. **Monitor failed login attempts**
4. **Implement rate limiting**
5. **Log security events**
6. **Validate và sanitize tất cả input**
7. **Keep dependencies updated**
8. **Use environment variables, never hardcode secrets**

## Troubleshooting

### Gmail: "Less secure app access"
- Sử dụng App Password thay vì account password
- Bật 2FA trước khi tạo App Password

### Outlook: "Authentication failed"
- Kiểm tra email/password chính xác
- Bật 2FA và tạo App Password
- Thử với smtp.office365.com thay vì smtp-mail.outlook.com

### IMAP không kết nối được
- Kiểm tra firewall/port 993 mở
- Verify credentials
- Check IMAP enabled trong email settings

### Email không gửi được
- Verify SMTP credentials
- Check port 587 hoặc 465
- Test với telnet: `telnet smtp.gmail.com 587`

## License

MIT
