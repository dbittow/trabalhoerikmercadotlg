const formulario = pegar('form-produto');

let produtos = [];
let buscaAtual = '';
let idEmEdicao = null;
let produtoParaExcluir = null;

function limparErros() {
  const mensagens = formulario.querySelectorAll('[data-erro]');
  for (let i = 0; i < mensagens.length; i++) {
    mensagens[i].textContent = '';
  }

  const campos = formulario.querySelectorAll('[aria-invalid]');
  for (let i = 0; i < campos.length; i++) {
    campos[i].removeAttribute('aria-invalid');
  }
}

function mostrarErros(erros) {
  let primeiroCampo = null;

  for (const campo in erros) {
    const mensagem = formulario.querySelector('[data-erro="' + campo + '"]');
    if (mensagem) {
      mensagem.textContent = erros[campo];
    }

    let nomeDoCampo = campo;
    if (campo === 'priceCents') {
      nomeDoCampo = 'price';
    }

    const entrada = formulario.elements[nomeDoCampo];
    if (entrada) {
      entrada.setAttribute('aria-invalid', 'true');
      if (primeiroCampo === null) {
        primeiroCampo = entrada;
      }
    }
  }

  if (primeiroCampo !== null) {
    primeiroCampo.focus();
  }
}

function preencherListaDeCategorias() {
  const lista = pegar('lista-categorias');
  const categorias = [];
  lista.innerHTML = '';

  for (let i = 0; i < produtos.length; i++) {
    if (!categorias.includes(produtos[i].category)) {
      categorias.push(produtos[i].category);

      const opcao = document.createElement('option');
      opcao.value = produtos[i].category;
      lista.append(opcao);
    }
  }
}

function abrirFormulario(produto) {
  formulario.reset();
  limparErros();
  preencherListaDeCategorias();

  if (produto) {
    idEmEdicao = produto.id;
    pegar('titulo-form').textContent = 'Editar produto';
    formulario.elements.name.value = produto.name;
    formulario.elements.category.value = produto.category;
    formulario.elements.unit.value = produto.unit;
    formulario.elements.price.value = (produto.priceCents / 100).toFixed(2).replace('.', ',');
    formulario.elements.stock.value = produto.stock;
  } else {
    idEmEdicao = null;
    pegar('titulo-form').textContent = 'Novo produto';
  }

  pegar('dialogo-produto').showModal();
  formulario.elements.name.focus();
}

async function salvarProduto(evento) {
  evento.preventDefault();
  limparErros();

  const priceCents = converterPreco(formulario.elements.price.value);
  const textoEstoque = formulario.elements.stock.value.trim();
  const errosLocais = {};

  if (priceCents === null || priceCents <= 0) {
    errosLocais.priceCents = 'Informe um preço válido, como 12,50.';
  }
  if (!/^\d+$/.test(textoEstoque)) {
    errosLocais.stock = 'Informe um número inteiro.';
  }
  if (Object.keys(errosLocais).length > 0) {
    mostrarErros(errosLocais);
    return;
  }

  const produto = {
    name: formulario.elements.name.value,
    category: formulario.elements.category.value,
    unit: formulario.elements.unit.value,
    priceCents: priceCents,
    stock: Number(textoEstoque),
  };

  pegar('salvar').disabled = true;

  try {
    if (idEmEdicao !== null) {
      await chamarApi('/api/products/' + idEmEdicao, 'PUT', produto);
      mostrarAviso('Produto atualizado.');
    } else {
      await chamarApi('/api/products', 'POST', produto);
      mostrarAviso('Produto cadastrado.');
    }

    pegar('dialogo-produto').close();
    await carregarProdutos();
  } catch (erro) {
    if (erro.details && typeof erro.details === 'object') {
      mostrarErros(erro.details);
    } else {
      mostrarAviso(erro.message, 'erro');
    }
  } finally {
    pegar('salvar').disabled = false;
  }
}

async function ajustarEstoque(produto, mudanca) {
  let novoEstoque = produto.stock + mudanca;
  if (novoEstoque < 0) {
    novoEstoque = 0;
  }

  try {
    const atualizado = await chamarApi('/api/products/' + produto.id, 'PATCH', { stock: novoEstoque });
    produto.stock = atualizado.stock;
    desenharProdutos();
  } catch (erro) {
    mostrarAviso(erro.message, 'erro');
    await carregarProdutos();
  }
}

function pedirConfirmacaoDeExclusao(produto) {
  produtoParaExcluir = produto;
  pegar('texto-excluir').textContent =
    '"' + produto.name + '" sairá do catálogo. Os pedidos antigos continuam no histórico.';
  pegar('dialogo-excluir').showModal();
}

async function excluirProduto() {
  const produto = produtoParaExcluir;
  pegar('dialogo-excluir').close();

  if (produto === null) {
    return;
  }

  try {
    await chamarApi('/api/products/' + produto.id, 'DELETE');
    mostrarAviso('Produto excluído.');
  } catch (erro) {
    mostrarAviso(erro.message, 'erro');
  }

  produtoParaExcluir = null;
  await carregarProdutos();
}

function criarCelula(texto, classe) {
  return criarElemento('td', classe, texto);
}

function criarLinhaDoProduto(produto) {
  const linha = criarElemento('tr');
  linha.dataset.produto = produto.id;

  const celulaNome = criarElemento('td');
  celulaNome.append(criarElemento('strong', '', produto.name));

  const menos = criarBotao('−', '', 'Diminuir estoque de ' + produto.name, function () {
    ajustarEstoque(produto, -1);
  });
  menos.disabled = produto.stock === 0;

  let classeEstoque = 'num';
  if (produto.stock <= 5) {
    classeEstoque = 'num baixo';
  }
  const numero = criarElemento('output', classeEstoque, String(produto.stock));

  const mais = criarBotao('+', '', 'Aumentar estoque de ' + produto.name, function () {
    ajustarEstoque(produto, 1);
  });

  const ajuste = criarElemento('div', 'ajuste');
  ajuste.append(menos, numero, mais);
  const celulaEstoque = criarElemento('td');
  celulaEstoque.append(ajuste);

  const editar = criarBotao('Editar', 'botao pequeno', 'Editar ' + produto.name, function () {
    abrirFormulario(produto);
  });
  const excluir = criarBotao('Excluir', 'botao pequeno', 'Excluir ' + produto.name, function () {
    pedirConfirmacaoDeExclusao(produto);
  });

  const acoes = criarElemento('div', 'acoes');
  acoes.append(editar, excluir);
  const celulaAcoes = criarElemento('td');
  celulaAcoes.append(acoes);

  linha.append(
    celulaNome,
    criarCelula(produto.category),
    criarCelula(produto.unit),
    criarCelula(formatarPreco(produto.priceCents), 'direita num'),
    celulaEstoque,
    celulaAcoes,
  );
  return linha;
}

function desenharProdutos() {
  const corpoTabela = pegar('linhas');
  const termo = buscaAtual.trim().toLowerCase();
  let quantosApareceram = 0;

  corpoTabela.innerHTML = '';

  for (let i = 0; i < produtos.length; i++) {
    if (produtos[i].name.toLowerCase().includes(termo)) {
      corpoTabela.append(criarLinhaDoProduto(produtos[i]));
      quantosApareceram = quantosApareceram + 1;
    }
  }

  pegar('sem-produtos').hidden = quantosApareceram > 0;
}

async function carregarProdutos() {
  try {
    produtos = await chamarApi('/api/products');
    desenharProdutos();
  } catch (erro) {
    mostrarAviso(erro.message, 'erro');
  }
}

function textoDosItens(pedido) {
  const textos = [];
  for (let i = 0; i < pedido.items.length; i++) {
    textos.push(pedido.items[i].quantity + ' × ' + pedido.items[i].name);
  }
  return textos.join(', ');
}

function criarLinhaDoPedido(pedido) {
  const linha = criarElemento('tr');

  const celulaNumero = criarElemento('td');
  celulaNumero.append(criarElemento('strong', '', 'nº ' + pedido.id));

  let textoDesconto = '—';
  if (pedido.discountCents > 0) {
    textoDesconto = '− ' + formatarPreco(pedido.discountCents);
  }

  const celulaTotal = criarElemento('td', 'direita num');
  celulaTotal.append(criarElemento('strong', '', formatarPreco(pedido.totalCents)));

  linha.append(
    celulaNumero,
    criarCelula(formatarData(pedido.createdAt)),
    criarCelula(textoDosItens(pedido)),
    criarCelula(formatarPreco(pedido.subtotalCents), 'direita num'),
    criarCelula(textoDesconto, 'direita num'),
    celulaTotal,
  );
  return linha;
}

async function carregarPedidos() {
  try {
    const pedidos = await chamarApi('/api/orders');
    const corpoTabela = pegar('linhas-pedidos');

    pegar('sem-pedidos').hidden = pedidos.length > 0;
    corpoTabela.innerHTML = '';

    for (let i = 0; i < pedidos.length; i++) {
      corpoTabela.append(criarLinhaDoPedido(pedidos[i]));
    }
  } catch (erro) {
    mostrarAviso(erro.message, 'erro');
  }
}

function trocarAba(mostrarPedidos) {
  pegar('aba-produtos').setAttribute('aria-selected', String(!mostrarPedidos));
  pegar('aba-pedidos').setAttribute('aria-selected', String(mostrarPedidos));
  pegar('painel-produtos').hidden = mostrarPedidos;
  pegar('painel-pedidos').hidden = !mostrarPedidos;

  if (mostrarPedidos) {
    carregarPedidos();
  } else {
    carregarProdutos();
  }
}

formulario.addEventListener('submit', salvarProduto);

pegar('novo').addEventListener('click', function () {
  abrirFormulario(null);
});
pegar('cancelar').addEventListener('click', function () {
  pegar('dialogo-produto').close();
});
pegar('cancelar-excluir').addEventListener('click', function () {
  pegar('dialogo-excluir').close();
});
pegar('confirmar-excluir').addEventListener('click', excluirProduto);

pegar('busca').addEventListener('input', function (evento) {
  buscaAtual = evento.target.value;
  desenharProdutos();
});
pegar('aba-produtos').addEventListener('click', function () {
  trocarAba(false);
});
pegar('aba-pedidos').addEventListener('click', function () {
  trocarAba(true);
});

carregarProdutos();
