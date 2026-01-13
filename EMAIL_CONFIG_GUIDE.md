# Hướng dẫn cấu hình Email - Có hoặc Không

## 🎯 TL;DR (Too Long; Didn't Read)

**Không cần config email trong .env để test hệ thống!**
- ✅ Đăng ký/đăng nhập: **HOẠT ĐỘNG BÌNHlà thường**
- ❌ Welcome email: Bị skip (có warning trong log)
- ❌ Password reset: Không dùng được (cần email)
- ✅ User gửi/nhận email: **HOẠT ĐỘNG BÌNH THƯỜNG** (user tự cung cấp email)

---

## 📧 Có 2 loại Email trong hệ thống

### 1️⃣ System Emails (config trong .env)

**Dùng để làm gì?**
- Gửi welcome email khi user đăng ký
- Gửi link reset password
- Gửi notification của hệ thống

**Cần config gì?**
```env
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=system@yourapp.com      # 1 email duy nhất cho toàn hệ thống
MAIL_PASSWORD=your-app-password
MAIL_FROM="Your App <noreply@yourapp.com>"
```

**⚠️ Nếu KHÔNG config:**
- ✅ Đăng ký/đăng nhập vẫn hoạt động
- ❌ Không có welcome email
- ❌ Không dùng được password reset

---

### 2️⃣ User Emails (KHÔNG cần config .env)

**Dùng để làm gì?**
- User gửi email từ Gmail/Outlook của họ
- User nhận email từ inbox của họ
- Mỗi user dùng email riêng của họ

**Cần config gì?**
- **KHÔNG** cần config trong .env
- User tự cung cấp email + app password khi dùng
- Hệ thống tự động detect provider (Gmail/Outlook/Yahoo)

**Ví dụ sử dụng:**
```typescript
// User tự cung cấp credentials
const userEmail = "user@gmail.com";
const userAppPassword = "abcd efgh ijkl mnop"; // App password của user

// Gửi email
await dynamicMailService.sendMailWithCredentials(
  userEmail,
  userAppPassword,
  {
    to: "recipient@example.com",
    subject: "Hello",
    html: "<h1>Hello from user's Gmail</h1>"
  }
);

// Nhận email
const emails = await imapService.fetchEmailsForUser(
  userEmail,
  userAppPassword,
  'INBOX',
  50
);
```

---

## 🧪 3 Cách để Test

### Option 1: Test KHÔNG CẦN Email Config (Khuyến nghị để test nhanh)

**File .env:**
```env
# Bỏ qua hoặc comment các dòng này
# MAIL_HOST=
# MAIL_PORT=
# MAIL_USER=
# MAIL_PASSWORD=
```

**Chức năng hoạt động:**
- ✅ POST /register - Đăng ký thành công (không có welcome email)
- ✅ POST /login - Đăng nhập thành công
- ✅ GET /profile - Lấy thông tin user
- ✅ POST /logout - Đăng xuất
- ✅ User gửi/nhận email (nếu user cung cấp email credentials)

**Chức năng KHÔNG hoạt động:**
- ❌ POST /password/request-reset - Báo lỗi "Email service not configured"

**Khi nào dùng:**
- Đang phát triển frontend
- Test authentication flow
- Chưa cần password reset
- Chưa có email để dùng

---

### Option 2: Test VỚI Email Config (Full features)

**Bước 1: Tạo Gmail App Password**
1. Vào https://myaccount.google.com/security
2. Bật "2-Step Verification"
3. Vào https://myaccount.google.com/apppasswords
4. Chọn "Mail" → "Other" → Đặt tên "Your App"
5. Copy password (16 ký tự, không có khoảng trắng)

**Bước 2: Cấu hình .env**
```env
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=your-email@gmail.com
MAIL_PASSWORD=abcdefghijklmnop  # 16 chars từ bước 1
MAIL_FROM="Your App <noreply@yourapp.com>"
```

**Chức năng hoạt động:**
- ✅ Tất cả chức năng ở Option 1
- ✅ Welcome email khi đăng ký
- ✅ Password reset email
- ✅ Notification emails

**Khi nào dùng:**
- Test đầy đủ tính năng
- Cần test email flow
- Production deployment

---

### Option 3: Test với Mailtrap/MailHog (Development)

**Dùng Mailtrap (Fake SMTP):**
```env
MAIL_HOST=smtp.mailtrap.io
MAIL_PORT=2525
MAIL_USER=your-mailtrap-username
MAIL_PASSWORD=your-mailtrap-password
MAIL_FROM="Test App <test@example.com>"
```

**Ưu điểm:**
- ✅ Test email mà không gửi email thật
- ✅ Xem email trong dashboard
- ✅ Không cần App Password

**Đăng ký Mailtrap:**
- https://mailtrap.io (Free plan: 500 emails/month)

---

## 📱 Ví dụ Frontend Integration

### Đăng ký (không cần email config)

```typescript
async function register() {
  const response = await fetch('http://localhost:3000/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'john_doe',
      email: 'john@gmail.com',
      password: 'SecurePass123!'
    })
  });
  
  const data = await response.json();
  // { message: "User registered successfully", ... }
  // Đăng ký thành công, không cần check email
}
```

### Password Reset (CẦN email config)

```typescript
async function requestPasswordReset() {
  try {
    const response = await fetch('http://localhost:3000/password/request-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'john@gmail.com' })
    });
    
    const data = await response.json();
    alert('Check your email for reset link!');
  } catch (error) {
    // Nếu không config email: "Email service not configured"
    alert('Password reset is currently unavailable');
  }
}
```

### User gửi email (user tự cung cấp, không dùng .env)

```typescript
async function sendUserEmail() {
  // User nhập email và app password của họ
  const userEmail = document.getElementById('user-email').value;
  const userAppPassword = document.getElementById('app-password').value;
  
  const response = await fetch('http://localhost:3000/email/send', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      fromEmail: userEmail,
      fromPassword: userAppPassword,  // User's App Password
      to: 'recipient@example.com',
      subject: 'Hello',
      body: 'This is sent from user\'s Gmail'
    })
  });
}
```

---

## 🔍 Kiểm tra Email có được config không

**Trong code backend:**
```typescript
// Auth Service đã có method
const isConfigured = this.isEmailConfigured();
if (isConfigured) {
  await this.mailService.sendWelcomeEmail(...);
} else {
  this.logger.warn('Email not configured, skipping');
}
```

**Trong logs:**
```
[AuthService] Email service not configured - skipping welcome email
[AuthService] User registered successfully
```

---

## 🎯 Khuyến nghị cho từng giai đoạn

### 🚀 Giai đoạn Development
```env
# Không config email, test nhanh
# MAIL_HOST=
# MAIL_USER=
# MAIL_PASSWORD=
```
**Lý do:** Nhanh, không cần setup email

---

### 🧪 Giai đoạn Testing
```env
# Dùng Mailtrap
MAIL_HOST=smtp.mailtrap.io
MAIL_PORT=2525
MAIL_USER=mailtrap-username
MAIL_PASSWORD=mailtrap-password
```
**Lý do:** Test email flow mà không gửi thật

---

### 🌐 Giai đoạn Staging
```env
# Dùng Gmail/Outlook thật
MAIL_HOST=smtp.gmail.com
MAIL_USER=staging@yourapp.com
MAIL_PASSWORD=app-password
```
**Lý do:** Test với email service thật

---

### 🔥 Production
```env
# Dùng SendGrid, AWS SES, hoặc Mailgun
MAIL_HOST=smtp.sendgrid.net
MAIL_USER=apikey
MAIL_PASSWORD=your-sendgrid-api-key
```
**Lý do:** Professional email service với monitoring

---

## ❓ FAQ

**Q: Tôi có cần host email server không?**
A: KHÔNG. Chỉ cần 1 email Gmail/Outlook để gửi system emails.

**Q: User có cần cung cấp email trong .env không?**
A: KHÔNG. User tự cung cấp khi họ muốn gửi/nhận email.

**Q: Tôi có thể test mà không có email không?**
A: CÓ. Đăng ký/đăng nhập hoạt động bình thường, chỉ skip welcome email.

**Q: Gmail App Password là gì?**
A: Password đặc biệt cho ứng dụng (không phải password thường).

**Q: Có miễn phí không?**
A: Gmail/Outlook: Miễn phí với giới hạn. Mailtrap: Free 500 emails/month.

**Q: Production nên dùng gì?**
A: SendGrid, AWS SES, Mailgun (professional, reliable, có monitoring).

---

## 📊 So sánh Options

| Tính năng | Không config | Config Gmail | Mailtrap | SendGrid |
|-----------|-------------|--------------|----------|----------|
| Setup time | ⚡ 0 phút | 🕐 5 phút | 🕐 10 phút | 🕐 15 phút |
| Đăng ký/đăng nhập | ✅ | ✅ | ✅ | ✅ |
| Welcome email | ❌ | ✅ | ✅ | ✅ |
| Password reset | ❌ | ✅ | ✅ | ✅ |
| User send/receive | ✅ | ✅ | ✅ | ✅ |
| Chi phí | 💰 Free | 💰 Free | 💰 Free | 💰 Paid |
| Production-ready | ❌ | ⚠️ OK | ❌ | ✅ |

---

## 🎉 Kết luận

**Để test nhanh**: Không cần config email, đăng ký/đăng nhập vẫn hoạt động!
**Để test đầy đủ**: Config 1 email Gmail trong .env.
**User emails**: KHÔNG BAO GIỜ cần config trong .env, user tự cung cấp!

Happy coding! 🚀
