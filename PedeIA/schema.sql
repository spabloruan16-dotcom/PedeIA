CREATE DATABASE IF NOT EXISTS pedeia CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE pedeia;

CREATE TABLE merchants (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE shops (
  id CHAR(36) PRIMARY KEY,
  merchant_id CHAR(36) NOT NULL,
  public_id VARCHAR(120) NOT NULL UNIQUE,
  name VARCHAR(140) NOT NULL,
  type VARCHAR(80) NOT NULL,
  description TEXT,
  photo_url TEXT,
  is_open BOOLEAN NOT NULL DEFAULT TRUE,
  accepts_delivery BOOLEAN NOT NULL DEFAULT TRUE,
  accepts_pickup BOOLEAN NOT NULL DEFAULT TRUE,
  delivery_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 45,
  pickup_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 20,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
);

CREATE TABLE categories (
  id CHAR(36) PRIMARY KEY,
  shop_id CHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY shop_category (shop_id, name),
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
);

CREATE TABLE products (
  id CHAR(36) PRIMARY KEY,
  shop_id CHAR(36) NOT NULL,
  category_id CHAR(36) NOT NULL,
  name VARCHAR(140) NOT NULL,
  description TEXT NOT NULL,
  photo_url TEXT,
  price DECIMAL(10,2) NOT NULL,
  available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE customers (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) UNIQUE,
  phone VARCHAR(30) NOT NULL,
  password_hash VARCHAR(255),
  address TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
  id CHAR(36) PRIMARY KEY,
  shop_id CHAR(36) NOT NULL,
  customer_id CHAR(36) NOT NULL,
  fulfillment ENUM('delivery','pickup') NOT NULL,
  address TEXT,
  payment VARCHAR(40) NOT NULL,
  notes TEXT,
  total DECIMAL(10,2) NOT NULL,
  status ENUM('Aguardando','Em preparo','Pronto','Saiu para entrega','Entregue','Cancelado') NOT NULL DEFAULT 'Aguardando',
  ready_at DATETIME NOT NULL,
  confirmed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (shop_id) REFERENCES shops(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE order_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id CHAR(36) NOT NULL,
  product_id CHAR(36) NOT NULL,
  product_name VARCHAR(140) NOT NULL,
  product_description TEXT NOT NULL,
  quantity SMALLINT UNSIGNED NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  item_note TEXT,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id CHAR(36) NOT NULL,
  sender_type ENUM('customer','merchant') NOT NULL,
  sender_id CHAR(36) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE ratings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id CHAR(36) NOT NULL UNIQUE,
  shop_id CHAR(36) NOT NULL,
  customer_id CHAR(36) NOT NULL,
  value TINYINT UNSIGNED NOT NULL,
  comment TEXT,
  media_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (value BETWEEN 1 AND 5),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (shop_id) REFERENCES shops(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);
