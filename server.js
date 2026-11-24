import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { abrirBanco } from './banco.js';

const LIMITE_DESCONTO = 20000;
const PERCENTUAL_DESCONTO = 5;

const UNIDADES = ['un', 'kg', 'L', 'pct', 'cx'];
const PRECO_MAXIMO = 99999999;
const ESTOQUE_MAXIMO = 1000000;
const QUANTIDADE_MAXIMA = 9999;
const TAMANHO_MAXIMO_CORPO = 100 * 1024;

const ARQUIVOS = {
  '/': 'index.html',
  '/admin': 'admin.html',
  '/style.css': 'style.css',
  '/comum.js': 'comum.js',
  '/loja.js': 'loja.js',
  '/admin.js': 'admin.js',
};

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

const COLUNAS_PRODUTO = `id, name, category, unit, price_cents AS priceCents, stock,
  created_at AS createdAt, updated_at AS updatedAt`;

const COLUNAS_PEDIDO = `id, subtotal_cents AS subtotalCents, discount_cents AS discountCents,
  total_cents AS totalCents, created_at AS createdAt`;

class ErroApi extends Error {
  constructor(status, mensagem, detalhes) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
  }
}

export function calcularTotais(subtotal) {
  let desconto = 0;
  let percentual = 0;
  let temDesconto = false;

  if (subtotal > LIMITE_DESCONTO) {
    desconto = Math.round((subtotal * PERCENTUAL_DESCONTO) / 100);
    percentual = PERCENTUAL_DESCONTO;
    temDesconto = true;
  }

  return {
    subtotalCents: subtotal,
    discountCents: desconto,
    totalCents: subtotal - desconto,
    discountApplied: temDesconto,
    discountPercent: percentual,
    discountThresholdCents: LIMITE_DESCONTO,
  };
}

function textoValido(valor, minimo, maximo) {
  if (typeof valor !== 'string') {
    return false;
  }
  const tamanho = valor.trim().length;
  return tamanho >= minimo && tamanho <= maximo;
}

function inteiroValido(valor, minimo, maximo) {
  return Number.isInteger(valor) && valor >= minimo && valor <= maximo;
}

function validarProduto(dados, parcial) {
  if (dados === null || typeof dados !== 'object' || Array.isArray(dados)) {
    throw new ErroApi(400, 'Envie os dados do produto em formato JSON.');
  }

  const produto = {};
  const erros = {};
  const campos = ['name', 'category', 'unit', 'priceCents', 'stock'];

  for (let i = 0; i < campos.length; i++) {
    if (dados[campos[i]] === undefined && !parcial) {
      erros[campos[i]] = 'Campo obrigatório.';
    }
  }

  if (dados.name !== undefined) {
    if (textoValido(dados.name, 2, 80)) {
      produto.name = dados.name.trim();
    } else {
      erros.name = 'O nome deve ter entre 2 e 80 caracteres.';
    }
  }

  if (dados.category !== undefined) {
    if (textoValido(dados.category, 2, 40)) {
      produto.category = dados.category.trim();
    } else {
      erros.category = 'A categoria deve ter entre 2 e 40 caracteres.';
    }
  }

  if (dados.unit !== undefined) {
    if (UNIDADES.includes(dados.unit)) {
      produto.unit = dados.unit;
    } else {
      erros.unit = 'A unidade deve ser uma destas: ' + UNIDADES.join(', ') + '.';
    }
  }

  if (dados.priceCents !== undefined) {
    if (inteiroValido(dados.priceCents, 1, PRECO_MAXIMO)) {
      produto.priceCents = dados.priceCents;
    } else {
      erros.priceCents = 'O preço deve ser maior que zero e ter no máximo duas casas decimais.';
    }
  }

  if (dados.stock !== undefined) {
    if (inteiroValido(dados.stock, 0, ESTOQUE_MAXIMO)) {
      produto.stock = dados.stock;
    } else {
      erros.stock = 'O estoque deve ser um número inteiro maior ou igual a zero.';
    }
  }

  if (Object.keys(erros).length > 0) {
    throw new ErroApi(422, 'Revise os campos do produto.', erros);
  }
  if (parcial && Object.keys(produto).length === 0) {
    throw new ErroApi(400, 'Nenhum campo para atualizar.');
  }

  return produto;
}

function tratarErroDeNome(erro) {
  if (erro.message.includes('UNIQUE constraint failed: products.name')) {
    throw new ErroApi(409, 'Já existe um produto com esse nome.', { name: 'Nome já cadastrado.' });
  }
  throw erro;
}

function listarProdutos(db, busca, categoria) {
  const termo = busca.trim();
  const categoriaLimpa = categoria.trim();
  const padrao = '%' + termo.replace(/[\\%_]/g, '\\$&') + '%';

  const sql = `SELECT ${COLUNAS_PRODUTO} FROM products
    WHERE (? = '' OR name LIKE ? ESCAPE '\\')
      AND (? = '' OR category = ?)
    ORDER BY category, name`;

  return db.prepare(sql).all(termo, padrao, categoriaLimpa, categoriaLimpa);
}

function buscarProduto(db, id) {
  const produto = db.prepare(`SELECT ${COLUNAS_PRODUTO} FROM products WHERE id = ?`).get(id);
  if (!produto) {
    throw new ErroApi(404, 'Produto não encontrado.');
  }
  return produto;
}

function criarProduto(db, dados) {
  const p = validarProduto(dados, false);
  const sql = 'INSERT INTO products (name, category, unit, price_cents, stock) VALUES (?, ?, ?, ?, ?)';

  try {
    const resultado = db.prepare(sql).run(p.name, p.category, p.unit, p.priceCents, p.stock);
    return buscarProduto(db, Number(resultado.lastInsertRowid));
  } catch (erro) {
    return tratarErroDeNome(erro);
  }
}

function atualizarProduto(db, id, dados, parcial) {
  const p = buscarProduto(db, id);
  const novosDados = validarProduto(dados, parcial);

  for (const campo in novosDados) {
    p[campo] = novosDados[campo];
  }

  const sql = `UPDATE products
    SET name = ?, category = ?, unit = ?, price_cents = ?, stock = ?, updated_at = datetime('now')
    WHERE id = ?`;

  try {
    db.prepare(sql).run(p.name, p.category, p.unit, p.priceCents, p.stock, id);
  } catch (erro) {
    tratarErroDeNome(erro);
  }
  return buscarProduto(db, id);
}

function removerProduto(db, id) {
  const resultado = db.prepare('DELETE FROM products WHERE id = ?').run(id);
  if (resultado.changes === 0) {
    throw new ErroApi(404, 'Produto não encontrado.');
  }
}

function lerItensDoCarrinho(dados) {
  if (!dados || !Array.isArray(dados.items) || dados.items.length === 0) {
    throw new ErroApi(400, 'O carrinho está vazio.');
  }

  const itens = [];

  for (let i = 0; i < dados.items.length; i++) {
    const item = dados.items[i];

    if (item === null || typeof item !== 'object') {
      throw new ErroApi(400, 'Produto inválido no carrinho.');
    }
    if (!Number.isInteger(item.productId) || item.productId < 1) {
      throw new ErroApi(400, 'Produto inválido no carrinho.');
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new ErroApi(400, 'A quantidade deve ser um número inteiro maior que zero.');
    }

    let existente = null;
    for (let j = 0; j < itens.length; j++) {
      if (itens[j].productId === item.productId) {
        existente = itens[j];
      }
    }

    if (existente === null) {
      existente = { productId: item.productId, quantity: 0 };
      itens.push(existente);
    }

    existente.quantity = existente.quantity + item.quantity;

    if (existente.quantity > QUANTIDADE_MAXIMA) {
      throw new ErroApi(400, 'A quantidade máxima por produto é ' + QUANTIDADE_MAXIMA + '.');
    }
  }

  return itens;
}

function calcularPedido(db, itens) {
  const buscar = db.prepare('SELECT id, name, unit, price_cents AS priceCents, stock FROM products WHERE id = ?');
  const linhas = [];
  const problemas = [];
  let subtotal = 0;

  for (let i = 0; i < itens.length; i++) {
    const item = itens[i];
    const produto = buscar.get(item.productId);

    if (!produto) {
      problemas.push({ productId: item.productId, name: null, requested: item.quantity, available: 0 });
      continue;
    }

    if (produto.stock < item.quantity) {
      problemas.push({
        productId: item.productId,
        name: produto.name,
        requested: item.quantity,
        available: produto.stock,
      });
    }

    const totalDaLinha = produto.priceCents * item.quantity;
    subtotal = subtotal + totalDaLinha;

    linhas.push({
      productId: item.productId,
      name: produto.name,
      unit: produto.unit,
      unitPriceCents: produto.priceCents,
      quantity: item.quantity,
      lineTotalCents: totalDaLinha,
    });
  }

  if (problemas.length > 0) {
    throw new ErroApi(409, 'Alguns itens não têm estoque suficiente.', problemas);
  }

  const resumo = calcularTotais(subtotal);
  resumo.items = linhas;
  return resumo;
}

function simularPedido(db, dados) {
  const itens = lerItensDoCarrinho(dados);
  return calcularPedido(db, itens);
}

function criarPedido(db, dados) {
  const itens = lerItensDoCarrinho(dados);

  db.exec('BEGIN IMMEDIATE');

  try {
    const resumo = calcularPedido(db, itens);

    if (dados.expectedTotalCents !== undefined && dados.expectedTotalCents !== resumo.totalCents) {
      throw new ErroApi(409, 'Os preços mudaram. Confira o carrinho antes de finalizar.', []);
    }

    const baixarEstoque = db.prepare(
      `UPDATE products SET stock = stock - ?, updated_at = datetime('now')
       WHERE id = ? AND stock >= ?`,
    );

    for (let i = 0; i < resumo.items.length; i++) {
      const item = resumo.items[i];
      const resultado = baixarEstoque.run(item.quantity, item.productId, item.quantity);

      if (resultado.changes !== 1) {
        throw new ErroApi(409, 'Estoque insuficiente para ' + item.name + '.');
      }
    }

    const pedido = db
      .prepare('INSERT INTO orders (subtotal_cents, discount_cents, total_cents) VALUES (?, ?, ?)')
      .run(resumo.subtotalCents, resumo.discountCents, resumo.totalCents);
    const pedidoId = Number(pedido.lastInsertRowid);

    const inserirItem = db.prepare(
      `INSERT INTO order_items
         (order_id, product_id, product_name, unit, unit_price_cents, quantity, line_total_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );

    for (let i = 0; i < resumo.items.length; i++) {
      const item = resumo.items[i];
      inserirItem.run(
        pedidoId,
        item.productId,
        item.name,
        item.unit,
        item.unitPriceCents,
        item.quantity,
        item.lineTotalCents,
      );
    }

    db.exec('COMMIT');
    return buscarPedido(db, pedidoId);
  } catch (erro) {
    db.exec('ROLLBACK');
    throw erro;
  }
}

function buscarItensDoPedido(db, pedidoId) {
  const sql = `SELECT product_id AS productId, product_name AS name, unit,
      unit_price_cents AS unitPriceCents, quantity, line_total_cents AS lineTotalCents
    FROM order_items WHERE order_id = ? ORDER BY id`;
  return db.prepare(sql).all(pedidoId);
}

function buscarPedido(db, id) {
  const pedido = db.prepare(`SELECT ${COLUNAS_PEDIDO} FROM orders WHERE id = ?`).get(id);
  pedido.items = buscarItensDoPedido(db, id);
  return pedido;
}

function listarPedidos(db) {
  const pedidos = db.prepare(`SELECT ${COLUNAS_PEDIDO} FROM orders ORDER BY id DESC LIMIT 100`).all();

  for (let i = 0; i < pedidos.length; i++) {
    pedidos[i].items = buscarItensDoPedido(db, pedidos[i].id);
  }
  return pedidos;
}

function responderJson(res, status, corpo) {
  if (status === 204) {
    res.writeHead(204);
    res.end();
    return;
  }

  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(corpo));
}

async function lerJson(req) {
  const tipo = (req.headers['content-type'] || '').toLowerCase();
  if (!tipo.startsWith('application/json')) {
    throw new ErroApi(415, 'Envie o corpo como application/json.');
  }

  const pedacos = [];
  let tamanho = 0;

  for await (const pedaco of req) {
    tamanho = tamanho + pedaco.length;
    if (tamanho > TAMANHO_MAXIMO_CORPO) {
      throw new ErroApi(413, 'Requisição grande demais.');
    }
    pedacos.push(pedaco);
  }

  try {
    return JSON.parse(Buffer.concat(pedacos).toString('utf8'));
  } catch (erro) {
    throw new ErroApi(400, 'JSON inválido.');
  }
}

function lerId(texto) {
  const id = Number(texto);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new ErroApi(400, 'Identificador inválido.');
  }
  return id;
}

async function tratarApi(db, req, res, url) {
  const metodo = req.method;
  const rota = url.pathname;
  const partes = rota.split('/');

  if (rota === '/api/products') {
    if (metodo === 'GET') {
      const busca = url.searchParams.get('q') || '';
      const categoria = url.searchParams.get('category') || '';
      return responderJson(res, 200, listarProdutos(db, busca, categoria));
    }
    if (metodo === 'POST') {
      return responderJson(res, 201, criarProduto(db, await lerJson(req)));
    }
    throw new ErroApi(405, 'Método não permitido.');
  }

  if (partes.length === 4 && partes[2] === 'products' && partes[3] !== '') {
    const id = lerId(partes[3]);

    if (metodo === 'GET') {
      return responderJson(res, 200, buscarProduto(db, id));
    }
    if (metodo === 'PUT') {
      return responderJson(res, 200, atualizarProduto(db, id, await lerJson(req), false));
    }
    if (metodo === 'PATCH') {
      return responderJson(res, 200, atualizarProduto(db, id, await lerJson(req), true));
    }
    if (metodo === 'DELETE') {
      removerProduto(db, id);
      return responderJson(res, 204);
    }
    throw new ErroApi(405, 'Método não permitido.');
  }

  if (rota === '/api/orders/quote') {
    if (metodo === 'POST') {
      return responderJson(res, 200, simularPedido(db, await lerJson(req)));
    }
    throw new ErroApi(405, 'Método não permitido.');
  }

  if (rota === '/api/orders') {
    if (metodo === 'GET') {
      return responderJson(res, 200, listarPedidos(db));
    }
    if (metodo === 'POST') {
      return responderJson(res, 201, criarPedido(db, await lerJson(req)));
    }
    throw new ErroApi(405, 'Método não permitido.');
  }

  throw new ErroApi(404, 'Rota não encontrada.');
}

function responderNaoEncontrado(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Página não encontrada.');
}

async function enviarArquivo(req, res, rota) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end();
    return;
  }

  const nome = ARQUIVOS[rota];
  if (!nome) {
    responderNaoEncontrado(res);
    return;
  }

  try {
    const conteudo = await fs.promises.readFile(path.join(import.meta.dirname, nome));
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(nome)], 'Cache-Control': 'no-cache' });

    if (req.method === 'HEAD') {
      res.end();
    } else {
      res.end(conteudo);
    }
  } catch (erro) {
    responderNaoEncontrado(res);
  }
}

export function criarServidor(db) {
  return http.createServer(async (req, res) => {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch (erro) {
      res.writeHead(400);
      res.end();
      return;
    }

    if (!url.pathname.startsWith('/api/')) {
      await enviarArquivo(req, res, url.pathname);
      return;
    }

    try {
      await tratarApi(db, req, res, url);
    } catch (erro) {
      if (erro instanceof ErroApi) {
        responderJson(res, erro.status, { error: erro.message, details: erro.detalhes });
      } else {
        console.error(erro);
        responderJson(res, 500, { error: 'Erro interno do servidor.' });
      }
    }
  });
}

function iniciar() {
  const arquivoBanco = process.env.DB_FILE || path.join(import.meta.dirname, 'data', 'supermercado.db');
  const porta = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';

  const db = abrirBanco(arquivoBanco);
  const servidor = criarServidor(db);

  servidor.listen(porta, host, () => {
    console.log('Loja:     http://localhost:' + porta + '/');
    console.log('Gerência: http://localhost:' + porta + '/admin');
  });

  function encerrar() {
    servidor.close(() => {
      db.close();
      process.exit(0);
    });
    servidor.closeAllConnections();
  }

  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);
}

if (path.basename(process.argv[1] || '', '.js') === 'server') {
  iniciar();
}
