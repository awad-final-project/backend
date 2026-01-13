# Backend - Email Application API

NestJS backend API cho ứng dụng email với authentication, gửi/nhận email qua SMTP/IMAP, và mã hóa dữ liệu.

## ⚡ Quick Start (2 phút)

```bash
# 1. Copy config tối thiểu (không cần email!)
cp .env.minimal .env

# 2. Start MongoDB
docker run -d -p 27017:27017 --name mongodb mongo:latest

# 3. Install & run
pnpm install
pnpm run start:dev
```

**✅ Đăng ký/đăng nhập hoạt động ngay!** (không cần config email)

📖 Chi tiết: [QUICK_START.md](QUICK_START.md)

---

## 🚀 Features

### Authentication & Authorization
- ✅ Local authentication (email/password)
- ✅ Google OAuth 2.0
- ✅ JWT tokens (access + refresh)
- ✅ Password reset qua email
- ✅ Bcrypt password hashing
- ✅ Session management

### Email System
- ✅ Gửi email từ Gmail/Outlook của user
- ✅ Nhận email qua IMAP
- ✅ Auto-detect email provider (Gmail, Outlook, Yahoo)
- ✅ Welcome emails
- ✅ Password reset emails
- ✅ Attachment support

### Security
- ✅ AES-256-GCM encryption cho email credentials
- ✅ Scrypt key derivation
- ✅ TLS/SSL cho SMTP/IMAP
- ✅ Secure token generation
- ✅ Input validation

---

## 📦 Tech Stack

- **NestJS** - Node.js framework
- **TypeScript** - Type safety
- **MongoDB & Mongoose** - Database
- **Passport.js** - Authentication (Local + Google OAuth)
- **JWT** - Token management
- **bcrypt** - Password hashing
- **Nodemailer** - SMTP client
- **IMAP-simple** - IMAP client
- **Crypto** - AES-256-GCM encryption

---

## 📚 Documentation

| File | Mô tả |
|------|-------|
| [QUICK_START.md](QUICK_START.md) | **Bắt đầu test trong 2 phút** |
| [EMAIL_CONFIG_GUIDE.md](EMAIL_CONFIG_GUIDE.md) | **Email config có hoặc không** |
| [SETUP_GUIDE.md](SETUP_GUIDE.md) | Hướng dẫn setup đầy đủ |
| [AUTHENTICATION_GUIDE.md](AUTHENTICATION_GUIDE.md) | API documentation & security |
| [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) | Tổng kết các tính năng |

---

## 🏗️ Setup Options

### Option 1: Test nhanh (Không cần email) ⚡

```bash
cp .env.minimal .env
pnpm install
pnpm run start:dev
```

**Hoạt động:**
- ✅ Đăng ký/đăng nhập
- ✅ JWT tokens
- ✅ User gửi/nhận email (user tự cung cấp credentials)

**Không hoạt động:**
- ❌ Welcome email
- ❌ Password reset

### Option 2: Full features (Có email) 🎯

```bash
cp .env.example .env
# Edit .env và thêm Gmail App Password
pnpm install
pnpm run start:dev
```

**Hoạt động tất cả tính năng!**

📖 Chi tiết: [EMAIL_CONFIG_GUIDE.md](EMAIL_CONFIG_GUIDE.md)

---

## 🔑 Environment Variables

```env
# MongoDB
MONGO_URI=mongodb://localhost:27017
MONGO_DB=user_registration

# JWT
JWT_SECRET=your_secret_key

# CORS
CORS_ORIGIN=http://localhost:5173
FRONTEND_URL=http://localhost:5173

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
```

## 📡 API Endpoints

### Authentication

- `POST /register` - Đăng ký user mới
- `POST /login` - Đăng nhập
- `POST /refresh` - Refresh access token
- `POST /logout` - Đăng xuất
- `GET /profile` - Lấy thông tin user (protected)
- `GET /auth/google` - Google OAuth login
- `GET /auth/google/callback` - Google OAuth callback

### Email Management

- `GET /emails/mailboxes` - Lấy danh sách mailboxes với count
- `GET /emails/folder/:folder` - Lấy emails theo folder
- `GET /emails/:id` - Lấy chi tiết email
- `POST /emails/send` - Gửi email
- `PATCH /emails/:id/star` - Toggle star email
- `PATCH /emails/:id/read` - Mark email as read/unread
- `DELETE /emails/:id` - Xóa email
- `POST /emails/seed` - Seed mock emails (dev only)

## 🐳 Docker

### Build Image

```bash
docker build -t backend:latest .
```

### Run Container

```bash
docker run -p 3000:3000 \
  -e MONGO_URI=mongodb://mongo:27017 \
  -e JWT_SECRET=your_secret \
  backend:latest
```

## 🚢 Production Deployment

Backend này được deploy tự động qua DevOps repository.

### Manual Build for Production

```bash
# Build
pnpm run build

# Start production
pnpm run start:prod
```

### GitHub Container Registry

```bash
# Build and push
docker build -t ghcr.io/awad-final-project/backend:latest .
docker push ghcr.io/awad-final-project/backend:latest
```

## 📁 Project Structure

```
src/
├── main.ts              # Application entry point
├── libs/
│   ├── database/        # MongoDB schemas & models
│   ├── decorators/      # Custom decorators (CurrentUser)
│   ├── dtos/            # Data Transfer Objects
│   ├── guards/          # Auth guards (JWT, Google)
│   └── utils/           # Utilities & pipes
└── modules/
    ├── app/             # Root module
    ├── auth/            # Authentication module
    │   └── strategies/  # Passport strategies
    └── email/           # Email management module
```

## 🧪 Testing

```bash
# Unit tests
pnpm run test

# E2E tests
pnpm run test:e2e

# Test coverage
pnpm run test:cov
```

## 🔒 Security

- Passwords hashed with bcrypt
- JWT tokens với expiry
- CORS configured
- Input validation với class-validator
- MongoDB injection protection

## 📝 Scripts

- `pnpm run start` - Start server
- `pnpm run start:dev` - Start với hot reload
- `pnpm run start:prod` - Start production
- `pnpm run build` - Build project
- `pnpm run test` - Run tests
- `pnpm run lint` - Run linter

## 🔗 Related Repositories

- [Frontend](https://github.com/awad-final-project/frontend) - React frontend
- [DevOps](https://github.com/awad-final-project/devops) - Deployment configs

## 📄 License

MIT
