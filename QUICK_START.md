# ⚡ Quick Start - Test trong 2 phút

## Bước 1: Copy config tối thiểu

```bash
cp .env.minimal .env
```

Hoặc tạo file `.env` với nội dung:

```env
MONGODB_URI=mongodb://localhost:27017/email_system
JWT_SECRET=your-secret-key-min-32-chars-please-change-this
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
USE_COOKIE_AUTH=false
```

**Không cần config email!**

## Bước 2: Start MongoDB

```bash
# Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest

# Hoặc MongoDB installed locally
mongod
```

## Bước 3: Install & Run

```bash
pnpm install
pnpm run start:dev
```

Server chạy tại: http://localhost:3000

## Bước 4: Test API

### Đăng ký

```bash
curl -X POST http://localhost:3000/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@gmail.com",
    "password": "Test123456!"
  }'
```

**Kết quả:**
```json
{
  "message": "User registered successfully",
  "userId": "...",
  "email": "test@gmail.com",
  "username": "testuser"
}
```

✅ Đăng ký thành công (không có welcome email - OK!)

### Đăng nhập

```bash
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@gmail.com",
    "password": "Test123456!"
  }'
```

**Kết quả:**
```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "abc123...",
  "email": "test@gmail.com",
  "username": "testuser"
}
```

✅ Đăng nhập thành công!

### Get Profile

```bash
# Thay YOUR_ACCESS_TOKEN bằng accessToken từ bước trên
curl -X GET http://localhost:3000/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Kết quả:**
```json
{
  "username": "testuser",
  "email": "test@gmail.com",
  "role": "user"
}
```

✅ Lấy thông tin user thành công!

## Bước 5: (Optional) Test User Send Email

### Backend endpoint cần thêm:

Tạo endpoint để user gửi email từ Gmail/Outlook của họ:

```typescript
// email.controller.ts
@Post('send-from-user')
@UseGuards(JwtAuthGuard)
async sendFromUser(
  @Body() data: {
    userEmail: string;
    userPassword: string;
    to: string;
    subject: string;
    body: string;
  },
) {
  await this.dynamicMailService.sendMailWithCredentials(
    data.userEmail,
    data.userPassword,
    {
      to: data.to,
      subject: data.subject,
      html: data.body,
    }
  );
  return { message: 'Email sent successfully' };
}
```

### Test:

```bash
curl -X POST http://localhost:3000/email/send-from-user \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userEmail": "your-gmail@gmail.com",
    "userPassword": "your-app-password",
    "to": "recipient@example.com",
    "subject": "Test Email",
    "body": "<h1>Hello from user Gmail!</h1>"
  }'
```

✅ Email gửi từ Gmail của user!

## 🎉 Xong!

**Những gì hoạt động:**
- ✅ Đăng ký user
- ✅ Đăng nhập
- ✅ Get profile
- ✅ Logout
- ✅ Refresh token
- ✅ User gửi/nhận email (nếu user cung cấp credentials)

**Những gì KHÔNG hoạt động (do không config email):**
- ❌ Welcome email
- ❌ Password reset

## 📧 Muốn thêm Welcome Email & Password Reset?

### Thêm vào file `.env`:

```env
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=your-email@gmail.com
MAIL_PASSWORD=abcdefghijklmnop  # 16 chars từ https://myaccount.google.com/apppasswords
MAIL_FROM="Your App <noreply@yourapp.com>"
```

### Restart server:

```bash
# Ctrl+C để dừng
pnpm run start:dev
```

Giờ thì:
- ✅ Welcome email khi đăng ký
- ✅ Password reset qua email

## 📚 Tài liệu

- **EMAIL_CONFIG_GUIDE.md** - Hướng dẫn chi tiết về email config
- **SETUP_GUIDE.md** - Hướng dẫn setup đầy đủ
- **AUTHENTICATION_GUIDE.md** - API documentation

## 🐛 Troubleshooting

**Lỗi: Cannot connect to MongoDB**
```bash
# Start MongoDB
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

**Lỗi: Port 3000 already in use**
```env
# Đổi port trong .env
PORT=3001
```

**Không nhận được email**
```
# Normal! Không config email trong .env
# Đăng ký/đăng nhập vẫn hoạt động bình thường
```

## 🚀 Next Steps

1. ✅ Test đăng ký/đăng nhập
2. ✅ Integrate với Frontend
3. ⚠️ Thêm email config nếu cần
4. ⚠️ Setup Google OAuth nếu cần
5. 🚀 Deploy to production

Happy coding! 🎉
