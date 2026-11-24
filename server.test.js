import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { abrirBanco } from './banco.js';
import { calcularTotais, criarServidor } from './server.js';

let db;
let server;
let base;

async function chamar(method, rota, body) {
  const res = await fetch(base + rota, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const texto = await res.text();
  const tipo = res.headers.get('content-type') ?? '';
  return { status: res.status, body: texto && tipo.includes('json') ? JSON.parse(texto) : texto };
}

const produto = (extra = {}) => ({
  name: 'Produto teste',
  category: 'Mercearia',
  unit: 'un',
  priceCents: 1000,
  stock: 10,
  ...extra,
});

async function criar(extra) {
  const { status, body } = await chamar('POST', '/api/products', produto(extra));
  assert.equal(status, 201);
  return body;
}

before(async () => {
  db = abrirBanco(':memory:', false);
  server = criarServidor(db);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  db.close();
});

beforeEach(() => {
  db.exec('DELETE FROM order_items; DELETE FROM orders; DELETE FROM products;');
});

describe('regra de desconto', () => {
  it('não aplica desconto abaixo de R$ 200,00', () => {
    const t = calcularTotais(19999);
    assert.equal(t.discountCents, 0);
    assert.equal(t.totalCents, 19999);
  });

  it('não aplica desconto em exatamente R$ 200,00', () => {
    const t = calcularTotais(20000);
    assert.equal(t.discountApplied, false);
    assert.equal(t.totalCents, 20000);
  });

  it('aplica 5% em R$ 200,01', () => {
    const t = calcularTotais(20001);
    assert.equal(t.discountApplied, true);
    assert.equal(t.discountCents, 1000);
    assert.equal(t.totalCents, 19001);
  });

  it('aplica 5% em R$ 300,00', () => {
    const t = calcularTotais(30000);
    assert.equal(t.discountCents, 1500);
    assert.equal(t.totalCents, 28500);
  });
});

describe('CRUD de produtos', () => {
  it('salva e consulta um produto', async () => {
    const criado = await criar();
    const { status, body } = await chamar('GET', `/api/products/${criado.id}`);
    assert.equal(status, 200);
    assert.equal(body.name, 'Produto teste');
    assert.equal(body.priceCents, 1000);
  });

  it('lista e filtra por nome e categoria', async () => {
    await criar({ name: 'Arroz' });
    await criar({ name: 'Sabão', category: 'Limpeza' });
    assert.equal((await chamar('GET', '/api/products')).body.length, 2);
    assert.equal((await chamar('GET', '/api/products?q=arr')).body.length, 1);
    assert.equal((await chamar('GET', '/api/products?category=Limpeza')).body[0].name, 'Sabão');
  });

  it('edita o cadastro inteiro com PUT', async () => {
    const { id } = await criar();
    const { status, body } = await chamar('PUT', `/api/products/${id}`, produto({ name: 'Editado', priceCents: 2500, stock: 3 }));
    assert.equal(status, 200);
    assert.equal(body.name, 'Editado');
    assert.equal(body.priceCents, 2500);
    assert.equal(body.stock, 3);
  });

  it('PUT exige todos os campos', async () => {
    const { id } = await criar();
    assert.equal((await chamar('PUT', `/api/products/${id}`, { name: 'Só nome' })).status, 422);
  });

  it('atualiza um campo com PATCH sem alterar os outros', async () => {
    const { id } = await criar();
    const { body } = await chamar('PATCH', `/api/products/${id}`, { stock: 99 });
    assert.equal(body.stock, 99);
    assert.equal(body.name, 'Produto teste');
    assert.equal(body.priceCents, 1000);
  });

  it('deleta um produto', async () => {
    const { id } = await criar();
    assert.equal((await chamar('DELETE', `/api/products/${id}`)).status, 204);
    assert.equal((await chamar('GET', `/api/products/${id}`)).status, 404);
  });

  it('rejeita dados inválidos', async () => {
    for (const invalido of [{ name: '' }, { priceCents: 0 }, { priceCents: 10.5 }, { stock: -1 }, { unit: 'xx' }]) {
      assert.equal((await chamar('POST', '/api/products', produto(invalido))).status, 422);
    }
  });

  it('rejeita nome duplicado, ignorando maiúsculas', async () => {
    await criar({ name: 'Leite' });
    assert.equal((await chamar('POST', '/api/products', produto({ name: 'LEITE' }))).status, 409);
  });
});

describe('compra e estoque', () => {
  it('dá baixa no estoque após a compra', async () => {
    const { id } = await criar({ stock: 10 });
    const { status, body } = await chamar('POST', '/api/orders', { items: [{ productId: id, quantity: 4 }] });
    assert.equal(status, 201);
    assert.equal(body.totalCents, 4000);
    assert.equal((await chamar('GET', `/api/products/${id}`)).body.stock, 6);
  });

  it('simular a compra não altera o estoque', async () => {
    const { id } = await criar({ stock: 10 });
    assert.equal((await chamar('POST', '/api/orders/quote', { items: [{ productId: id, quantity: 4 }] })).status, 200);
    assert.equal((await chamar('GET', `/api/products/${id}`)).body.stock, 10);
  });

  it('compra de exatamente R$ 200,00 não recebe desconto', async () => {
    const { id } = await criar({ priceCents: 5000 });
    const { body } = await chamar('POST', '/api/orders', { items: [{ productId: id, quantity: 4 }] });
    assert.equal(body.discountCents, 0);
    assert.equal(body.totalCents, 20000);
  });

  it('compra de R$ 200,01 recebe 5% de desconto', async () => {
    const a = await criar({ name: 'Item A', priceCents: 20000 });
    const b = await criar({ name: 'Item B', priceCents: 1 });
    const { body } = await chamar('POST', '/api/orders', {
      items: [{ productId: a.id, quantity: 1 }, { productId: b.id, quantity: 1 }],
    });
    assert.equal(body.subtotalCents, 20001);
    assert.equal(body.discountCents, 1000);
    assert.equal(body.totalCents, 19001);
  });

  it('recusa estoque insuficiente sem baixar nenhum item', async () => {
    const a = await criar({ name: 'Item A', stock: 10 });
    const b = await criar({ name: 'Item B', stock: 1 });
    const { status, body } = await chamar('POST', '/api/orders', {
      items: [{ productId: a.id, quantity: 2 }, { productId: b.id, quantity: 5 }],
    });
    assert.equal(status, 409);
    assert.equal(body.details[0].available, 1);
    assert.equal((await chamar('GET', `/api/products/${a.id}`)).body.stock, 10);
    assert.equal((await chamar('GET', `/api/products/${b.id}`)).body.stock, 1);
    assert.equal((await chamar('GET', '/api/orders')).body.length, 0);
  });

  it('soma linhas repetidas do mesmo produto ao checar o estoque', async () => {
    const { id } = await criar({ stock: 5 });
    const { status } = await chamar('POST', '/api/orders', {
      items: [{ productId: id, quantity: 3 }, { productId: id, quantity: 3 }],
    });
    assert.equal(status, 409);
    assert.equal((await chamar('GET', `/api/products/${id}`)).body.stock, 5);
  });

  it('ignora preço enviado pelo cliente', async () => {
    const { id } = await criar({ priceCents: 1000 });
    const { body } = await chamar('POST', '/api/orders', {
      items: [{ productId: id, quantity: 1, priceCents: 1 }],
      totalCents: 1,
    });
    assert.equal(body.totalCents, 1000);
  });

  it('recusa a compra se o preço mudou depois da cotação', async () => {
    const { id } = await criar({ priceCents: 1000, stock: 10 });
    const itens = [{ productId: id, quantity: 2 }];
    const cotacao = (await chamar('POST', '/api/orders/quote', { items: itens })).body;
    await chamar('PATCH', `/api/products/${id}`, { priceCents: 1500 });

    const { status } = await chamar('POST', '/api/orders', { items: itens, expectedTotalCents: cotacao.totalCents });
    assert.equal(status, 409);
    assert.equal((await chamar('GET', `/api/products/${id}`)).body.stock, 10);
    assert.equal((await chamar('GET', '/api/orders')).body.length, 0);
  });

  it('compras simultâneas nunca vendem mais que o estoque', async () => {
    const { id } = await criar({ stock: 5 });
    const respostas = await Promise.all(
      Array.from({ length: 12 }, () => chamar('POST', '/api/orders', { items: [{ productId: id, quantity: 1 }] })),
    );
    assert.equal(respostas.filter((r) => r.status === 201).length, 5);
    assert.equal(respostas.filter((r) => r.status === 409).length, 7);
    assert.equal((await chamar('GET', `/api/products/${id}`)).body.stock, 0);
  });

  it('rejeita carrinho vazio e quantidades inválidas', async () => {
    const { id } = await criar();
    assert.equal((await chamar('POST', '/api/orders', { items: [] })).status, 400);
    for (const quantity of [0, -1, 1.5, '2']) {
      assert.equal((await chamar('POST', '/api/orders', { items: [{ productId: id, quantity }] })).status, 400);
    }
  });

  it('mantém o histórico do pedido após deletar o produto', async () => {
    const { id } = await criar({ name: 'Item antigo' });
    await chamar('POST', '/api/orders', { items: [{ productId: id, quantity: 1 }] });
    await chamar('DELETE', `/api/products/${id}`);
    const { body } = await chamar('GET', '/api/orders');
    assert.equal(body[0].items[0].name, 'Item antigo');
    assert.equal(body[0].items[0].productId, null);
  });
});

describe('segurança do servidor', () => {
  it('não serve arquivos fora da lista permitida', async () => {
    for (const rota of ['/..%2fpackage.json', '/%2e%2e/src/app.js', '/..%5cpackage.json']) {
      assert.equal((await chamar('GET', rota)).status, 404);
    }
  });

  it('não entrega o código do servidor nem o banco ao navegador', async () => {
    const rotas = [
      '/server.js',
      '/banco.js',
      '/server.test.js',
      '/package.json',
      '/README.md',
      '/.gitignore',
      '/data/supermercado.db',
      '/data/supermercado.db-wal',
    ];
    for (const rota of rotas) {
      assert.equal((await chamar('GET', rota)).status, 404, rota);
    }
  });

  it('entrega as páginas e os arquivos da interface', async () => {
    for (const rota of ['/', '/admin', '/style.css', '/comum.js', '/loja.js', '/admin.js']) {
      assert.equal((await chamar('GET', rota)).status, 200, rota);
    }
  });

  it('exige JSON nas escritas', async () => {
    const res = await fetch(`${base}/api/products`, { method: 'POST', body: 'name=x' });
    assert.equal(res.status, 415);
  });
});
