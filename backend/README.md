# Halo Backend API

Backend для маркетплейса ювелирных изделий `Halo`:
- авторизация (JWT)
- роли `buyer / seller / admin`
- товары (поиск + фильтры)
- корзина
- оформление заказа
- seller/admin API
- PostgreSQL

## 1. Локальный запуск

1. Установите зависимости:
```bash
npm install
```

2. Создайте `.env` на основе `.env.example`.

3. Примените схему БД и сиды:
```bash
npm run db:migrate
npm run db:seed
```

4. Запустите сервер:
```bash
npm run dev
```

API будет доступен на `http://localhost:8080`.

## 2. Основные эндпоинты

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

### Products
- `GET /api/products`
- `GET /api/products/:id`
- `POST /api/products` (`seller/admin`)
- `PUT /api/products/:id` (`seller/admin`)
- `DELETE /api/products/:id` (`seller/admin`, soft delete)

Фильтры `GET /api/products`:
- `search`
- `category` (slug или имя)
- `minPrice`
- `maxPrice`
- `material`
- `size`
- `sellerId`
- `sort=newest|price_asc|price_desc|rating_desc`
- `limit`
- `offset`

### Cart (`buyer/admin`)
- `GET /api/cart`
- `POST /api/cart/items`
- `PATCH /api/cart/items/:itemId`
- `DELETE /api/cart/items/:itemId`
- `DELETE /api/cart/clear`

### Orders
- `POST /api/orders/checkout` (`buyer/admin`)
- `GET /api/orders/my` (`buyer/admin`)
- `GET /api/orders/:id` (owner/admin)

### Seller
- `GET /api/seller/products`
- `GET /api/seller/orders`

### Admin
- `GET /api/admin/users`
- `GET /api/admin/products`
- `GET /api/admin/orders`
- `PATCH /api/admin/orders/:id/status`

## 3. Роли

- При регистрации доступны только роли `buyer` и `seller`.
- Чтобы назначить пользователя админом:
```bash
npm run admin:promote -- user@example.com
```

## 4. Деплой на Render

В корне репозитория уже добавлен `render.yaml`:
- web service `halo-api`
- PostgreSQL `halo-db`

Что сделать:
1. Запушить проект на GitHub.
2. В Render выбрать `New +` -> `Blueprint`.
3. Подключить репозиторий и применить `render.yaml`.
4. После первого деплоя зайти в Shell сервиса и выполнить:
```bash
cd backend
npm run db:migrate
npm run db:seed
```

## 5. Подключение pgAdmin 4 к Render PostgreSQL

1. В Render откройте `halo-db`.
2. Скопируйте `External Database URL` и разберите его на:
- host
- port (`5432`)
- database
- username
- password
3. В pgAdmin: `Create -> Server`.
4. Вкладка `Connection`:
- Host name/address: `host`
- Port: `5432`
- Maintenance database: `database`
- Username: `username`
- Password: `password`
5. Вкладка `SSL`:
- SSL mode: `Require`
6. Save.

Примечание:
- Backend на Render должен использовать `Internal Database URL` (это быстрее и безопаснее внутри Render).
- Для внешних инструментов (pgAdmin) используйте `External Database URL`.

