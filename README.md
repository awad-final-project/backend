# Backend - Mail Application API

NestJS backend API cho ứng dụng mail với authentication và email management.

## 🚀 Features

- JWT Authentication (access + refresh tokens)
- Google OAuth 2.0
- Email CRUD operations
- MongoDB integration
- Swagger API documentation

## 📦 Tech Stack

- **NestJS** - Node.js framework
- **TypeScript** - Type safety
- **MongoDB & Mongoose** - Database
- **Passport.js** - Authentication
- **JWT** - Token management
- **bcrypt** - Password hashing

## 🏗️ Development

### Prerequisites

- Node.js 18+
- MongoDB
- pnpm (recommended) hoặc npm

### Setup

```bash
# Install dependencies
pnpm install

# Copy environment file
cp .env.template .env

# Edit .env với thông tin của bạn
nano .env

# Start development server
pnpm run start:dev
```

Server sẽ chạy tại `http://localhost:3000`

### Environment Variables

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
