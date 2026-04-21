# Halo Backend API

Backend для маркетплейса ювелирных изделий `Halo`.

## Функции

- JWT авторизация
- роли `buyer / seller / admin`
- товары + поиск и фильтры
- корзина и checkout
- избранное
- отзывы и рейтинг
- уведомления о заказах
- seller/admin endpoints

## Локальный запуск

```bash
npm install
copy .env.example .env
npm run db:migrate
npm run db:seed
npm run dev
```

## Основные эндпоинты

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

### Products
- `GET /api/products`
- `GET /api/products/:id`
- `POST /api/products` (`seller/admin`)
- `PUT /api/products/:id` (`seller/admin`)
- `DELETE /api/products/:id` (`seller/admin`)

### Cart
- `GET /api/cart`
- `POST /api/cart/items`
- `PATCH /api/cart/items/:itemId`
- `DELETE /api/cart/items/:itemId`
- `DELETE /api/cart/clear`

### Favorites
- `GET /api/favorites`
- `POST /api/favorites/:productId`
- `DELETE /api/favorites/:productId`

### Orders
- `POST /api/orders/checkout`
- `GET /api/orders/my`
- `GET /api/orders/:id`

### Reviews
- `GET /api/reviews/product/:productId`
- `POST /api/reviews/product/:productId`
- `PUT /api/reviews/:reviewId`
- `DELETE /api/reviews/:reviewId`

### Notifications
- `GET /api/notifications`
- `PATCH /api/notifications/:id/read`
- `PATCH /api/notifications/read-all`

### Seller
- `GET /api/seller/products`
- `GET /api/seller/orders`

### Admin
- `GET /api/admin/users`
- `GET /api/admin/products`
- `GET /api/admin/orders`
- `PATCH /api/admin/orders/:id/status`

## Render деплой

В репозитории уже есть `render.yaml`.

- `halo-api` и `halo-db` создаются через Blueprint
- в `startCommand` настроены `db:migrate` и `db:seed`, поэтому Render Shell не обязателен

## pgAdmin 4

Подключайтесь к `halo-db` через `External Database URL`:

- Host
- Port `5432`
- Database
- Username
- Password
- SSL mode: `Require`

Для backend в Render используйте `Internal Database URL`.
