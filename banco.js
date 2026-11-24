import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const TABELAS = `
  CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    category    TEXT    NOT NULL,
    unit        TEXT    NOT NULL DEFAULT 'un',
    price_cents INTEGER NOT NULL CHECK (price_cents > 0),
    stock       INTEGER NOT NULL CHECK (stock >= 0),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents > 0),
    discount_cents INTEGER NOT NULL CHECK (discount_cents >= 0),
    total_cents    INTEGER NOT NULL CHECK (total_cents > 0),
    created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id         INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id       INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name     TEXT    NOT NULL,
    unit             TEXT    NOT NULL,
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents > 0),
    quantity         INTEGER NOT NULL CHECK (quantity > 0),
    line_total_cents INTEGER NOT NULL CHECK (line_total_cents > 0)
  );

  CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
`;

const PRODUTOS_INICIAIS = [
  ['Arroz branco tipo 1 5 kg', 'Mercearia', 'pct', 2890, 40],
  ['Feijão carioca 1 kg', 'Mercearia', 'pct', 849, 60],
  ['Açúcar refinado 1 kg', 'Mercearia', 'pct', 479, 55],
  ['Café torrado e moído 500 g', 'Mercearia', 'pct', 1890, 35],
  ['Azeite extravirgem 500 ml', 'Mercearia', 'un', 3990, 18],
  ['Macarrão espaguete 500 g', 'Mercearia', 'pct', 549, 70],
  ['Banana prata', 'Hortifruti', 'kg', 699, 45],
  ['Tomate italiano', 'Hortifruti', 'kg', 899, 30],
  ['Batata inglesa', 'Hortifruti', 'kg', 599, 50],
  ['Leite integral 1 L', 'Laticínios', 'un', 569, 90],
  ['Queijo muçarela fatiado 200 g', 'Laticínios', 'pct', 1490, 25],
  ['Manteiga com sal 200 g', 'Laticínios', 'un', 1399, 28],
  ['Pão de forma integral', 'Padaria', 'pct', 1099, 22],
  ['Bolo de fubá caseiro', 'Padaria', 'un', 1850, 10],
  ['Suco de uva integral 1 L', 'Bebidas', 'un', 1690, 32],
  ['Água mineral 1,5 L', 'Bebidas', 'un', 349, 120],
  ['Detergente neutro 500 ml', 'Limpeza', 'un', 289, 80],
  ['Sabão em pó 1,6 kg', 'Limpeza', 'cx', 2290, 24],
];

function colocarProdutosIniciais(db) {
  const resultado = db.prepare('SELECT COUNT(*) AS total FROM products').get();
  if (resultado.total > 0) {
    return;
  }

  const inserir = db.prepare(
    'INSERT INTO products (name, category, unit, price_cents, stock) VALUES (?, ?, ?, ?, ?)',
  );

  db.exec('BEGIN');
  for (let i = 0; i < PRODUTOS_INICIAIS.length; i++) {
    const p = PRODUTOS_INICIAIS[i];
    inserir.run(p[0], p[1], p[2], p[3], p[4]);
  }
  db.exec('COMMIT');
}

export function abrirBanco(arquivo, colocarExemplos = true) {
  if (arquivo !== ':memory:') {
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  }

  const db = new DatabaseSync(arquivo);
  db.exec('PRAGMA foreign_keys = ON;');

  if (arquivo !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }

  db.exec(TABELAS);

  if (colocarExemplos) {
    colocarProdutosIniciais(db);
  }

  return db;
}
