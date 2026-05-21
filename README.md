# Banrau

Ứng dụng quản lý vận hành bán hàng/nhập hàng với frontend React + Vite và backend Node.js + Express + Supabase/PostgreSQL.

## Tổng quan

Repository gồm 2 phần chính:

- `client/`: giao diện quản trị viết bằng React, TypeScript, Vite, React Router, TanStack Query và Tailwind CSS.
- `server/`: API backend viết bằng Express, TypeScript, Supabase, JWT, Cloudinary và các tác vụ Zalo notification.

Các nhóm chức năng nổi bật:

- Đăng nhập, phân quyền và cấu hình hệ thống.
- Quản lý khách hàng, hàng hóa, kho, nhập hàng, xuất hàng và giao hàng.
- Quản lý nhân sự, chấm công, nghỉ phép, tạm ứng, lương và duyệt yêu cầu.
- Quản lý xe, thu tiền, công nợ, doanh thu và hóa đơn.
- Upload ảnh qua Cloudinary.
- Gửi/tổng hợp thông báo Zalo theo lịch.

## Công nghệ

### Frontend

- React 19
- TypeScript
- Vite
- React Router
- TanStack Query
- React Hook Form + Zod
- Tailwind CSS
- Vitest + Testing Library

### Backend

- Node.js 20
- Express 5
- TypeScript
- Supabase/PostgreSQL
- JWT + bcryptjs
- Cloudinary
- Zalo 
- Docker/Fly.io/Vercel config

## Yêu cầu môi trường

- Node.js 20.x cho backend.
- npm hoặc pnpm.
- Supabase project đã có schema/database phù hợp.
- Cloudinary account nếu dùng chức năng upload ảnh.
- Thông tin Zalo/ZCA nếu bật gửi tin nhắn tự động.

## Cài đặt

Cài dependency ở từng phần:

```bash
cd server
npm install

cd ../client
npm install
```

Nếu muốn dùng pnpm:

```bash
cd server
pnpm install

cd ../client
pnpm install
```

## Cấu hình biến môi trường

### Backend

Tạo file `server/.env` từ mẫu:

```bash
cd server
cp .env.example .env
```

Các biến bắt buộc:

```env
PORT=3000
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
JWT_SECRET=your-jwt-secret
NODE_ENV=development
```

Các biến thường dùng thêm:

```env
CLIENT_URL=http://localhost:5173
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
ZALO_ENABLE_SENDS=false
```

Với Zalo/ZCA, xem thêm:

- `server/.env.zalo.example`
- `server/docs/ZALO_SETUP.md`
- `server/docs/ZALO_QUICK_REFERENCE.md`
- `server/docs/ZALO_IMPLEMENTATION_GUIDE.md`

### Frontend

Tạo file `client/.env`:

```env
VITE_API_URL=http://localhost:3000/api
```

Nếu không cấu hình, frontend mặc định gọi API tại `http://localhost:3000/api`.

### Driver tracking map

Backend hỗ trợ realtime map tài xế với các biến tùy chọn:

```env
DRIVER_LOCATION_MIN_INTERVAL_SECONDS=10
DRIVER_LOCATION_MIN_DISTANCE_METERS=20
DRIVER_OFFLINE_AFTER_SECONDS=300
DRIVER_LOCATION_RETENTION_DAYS=7
DRIVER_MAP_REALTIME_ENABLED=true
DRIVER_MAP_EGRESS_PERCENT=0
DRIVER_MAP_AVERAGE_SPEED_KMH=22
SLACK_WEBHOOK_URL=
```

Cost guard: nếu egress vượt 80% quota tháng trước ngày 20, đặt `DRIVER_MAP_REALTIME_ENABLED=false` để trang bản đồ chuyển sang polling 20 giây.

## Chạy dự án ở local

Mở 2 terminal riêng.

Terminal 1 - backend:

```bash
cd server
npm run dev
```

Backend chạy tại:

- API: `http://localhost:3000/api`
- Health check: `http://localhost:3000/health`

Terminal 2 - frontend:

```bash
cd client
npm run dev
```

Frontend chạy tại:

- `http://localhost:5173`

## Build production

Backend:

```bash
cd server
npm run build
npm start
```

Frontend:

```bash
cd client
npm run build
npm run preview
```

## Kiểm tra chất lượng code

Frontend có script lint:

```bash
cd client
npm run lint
```

Frontend có cấu hình Vitest, có thể chạy trực tiếp bằng:

```bash
cd client
npx vitest run
```

Backend hiện có các test TypeScript dạng script trong `server/__tests__`. Chạy từng file bằng `ts-node-dev` khi cần, ví dụ:

```bash
cd server
npx ts-node-dev --transpile-only __tests__/customers-aliases.test.ts
```

## Database

Các file SQL chính nằm trong:

- `server/database/schema.sql`
- `server/database/seed.sql`
- `server/database/rls.sql`
- `server/database/migrations/`

Khi thiết lập Supabase mới, áp dụng schema/migration phù hợp trước khi chạy backend.

## Scripts hữu ích

### Backend

```bash
npm run dev
npm run build
npm start
npm run seed
npm run create-admin
npm run set-profile-password
npm run zca:login
```

### Frontend

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

## Cấu trúc thư mục

```text
.
├── client/
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── context/
│   │   ├── hooks/
│   │   ├── pages/
│   │   └── types/
│   └── vite.config.ts
├── server/
│   ├── src/
│   │   ├── config/
│   │   ├── middlewares/
│   │   ├── modules/
│   │   ├── types/
│   │   └── utils/
│   ├── database/
│   ├── docs/
│   └── scripts/
└── README.md
```

## Deploy

Repository có sẵn cấu hình deploy:

- `client/vercel.json`
- `server/vercel.json`
- `server/Dockerfile`
- `server/fly.toml`

Trước khi deploy, cần cấu hình đầy đủ biến môi trường trên nền tảng tương ứng.

## Ghi chú bảo mật

- Không commit file `.env` thật hoặc khóa service role.
- `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, Cloudinary secret và thông tin Zalo/ZCA phải được lưu trong secret manager của môi trường deploy.
- Chỉ bật `ZALO_ENABLE_SENDS=true` khi đã kiểm tra kỹ cấu hình gửi tin nhắn.
