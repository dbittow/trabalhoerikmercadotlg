const LIMITE_DESCONTO = 20000;

let produtos = [];
let carrinho = [];
let categoriaAtual = '';
let buscaAtual = '';
let cotacao = null;
let numeroCotacao = 0;
let enviando = false;

function acharProduto(id) {
  for (let i = 0; i < produtos.length; i++) {
    if (produtos[i].id === id) {
      return produtos[i];
    }
  }
  return null;
}

function acharNoCarrinho(id) {
  for (let i = 0; i < carrinho.length; i++) {
    if (carrinho[i].id === id) {
      return carrinho[i];
    }
  }
  return null;
}

function removerDoCarrinho(id) {
  const novoCarrinho = [];
  for (let i = 0; i < carrinho.length; i++) {
    if (carrinho[i].id !== id) {
      novoCarrinho.push(carrinho[i]);
    }
  }
  carrinho = novoCarrinho;
}

function definirQuantidade(id, quantidade) {
  const produto = acharProduto(id);
  if (produto === null) {
    return;
  }

  let ajustada = quantidade;
  if (ajustada > produto.stock) {
    ajustada = produto.stock;
  }
  if (ajustada < 0) {
    ajustada = 0;
  }

  const item = acharNoCarrinho(id);
  if (ajustada === 0) {
    removerDoCarrinho(id);
  } else if (item !== null) {
    item.quantidade = ajustada;
  } else {
    carrinho.push({ id: id, quantidade: ajustada });
  }

  cotacao = null;
  desenharProdutos();
  desenharCarrinho();
  atualizarCotacao();
}

function criarControleQuantidade(produto, quantidade, compacto) {
  let classe = 'stepper';
  if (compacto) {
    classe = 'stepper compacto';
  }

  const controle = criarElemento('div', classe);

  const menos = criarBotao('−', '', 'Remover uma unidade de ' + produto.name, function () {
    definirQuantidade(produto.id, quantidade - 1);
  });

  const numero = criarElemento('output', 'num', String(quantidade));

  const mais = criarBotao('+', '', 'Adicionar uma unidade de ' + produto.name, function () {
    definirQuantidade(produto.id, quantidade + 1);
  });
  mais.disabled = quantidade >= produto.stock;

  controle.append(menos, numero, mais);
  return controle;
}

function desenharCategorias() {
  const categorias = [];
  for (let i = 0; i < produtos.length; i++) {
    if (!categorias.includes(produtos[i].category)) {
      categorias.push(produtos[i].category);
    }
  }
  categorias.sort(function (a, b) {
    return a.localeCompare(b, 'pt-BR');
  });

  if (categoriaAtual !== '' && !categorias.includes(categoriaAtual)) {
    categoriaAtual = '';
  }

  const area = pegar('categorias');
  area.innerHTML = '';
  area.append(criarBotaoCategoria('', 'Todos'));

  for (let i = 0; i < categorias.length; i++) {
    area.append(criarBotaoCategoria(categorias[i], categorias[i]));
  }
}

function criarBotaoCategoria(valor, rotulo) {
  const botao = criarElemento('button', 'chip', rotulo);
  botao.type = 'button';
  botao.setAttribute('aria-pressed', String(categoriaAtual === valor));
  botao.addEventListener('click', function () {
    categoriaAtual = valor;
    desenharCategorias();
    desenharProdutos();
  });
  return botao;
}

function produtoApareceNaTela(produto) {
  if (categoriaAtual !== '' && produto.category !== categoriaAtual) {
    return false;
  }
  const termo = buscaAtual.trim().toLowerCase();
  return produto.name.toLowerCase().includes(termo);
}

function textoDoEstoque(produto) {
  if (produto.stock === 0) {
    return 'Esgotado';
  }
  if (produto.stock <= 5) {
    return 'Só ' + produto.stock + ' em estoque';
  }
  return produto.stock + ' em estoque';
}

function criarCartao(produto) {
  let classeCartao = 'produto';
  if (produto.stock === 0) {
    classeCartao = 'produto esgotado';
  }

  let classeEstoque = 'estoque';
  if (produto.stock <= 5) {
    classeEstoque = 'estoque baixo';
  }

  const cartao = criarElemento('article', classeCartao);
  cartao.dataset.produto = produto.id;

  const etiqueta = criarElemento('span', 'etiqueta num', formatarPreco(produto.priceCents));
  etiqueta.append(criarElemento('small', '', '/' + produto.unit));

  const areaAcao = criarElemento('div', 'produto-acao');
  const item = acharNoCarrinho(produto.id);

  if (item !== null) {
    areaAcao.append(criarControleQuantidade(produto, item.quantidade, false));
  } else {
    let textoBotao = 'Adicionar';
    if (produto.stock === 0) {
      textoBotao = 'Indisponível';
    }

    const botao = criarBotao(
      textoBotao,
      'botao primario largo',
      'Adicionar ' + produto.name + ' ao carrinho',
      function () {
        definirQuantidade(produto.id, 1);
      },
    );
    botao.disabled = produto.stock === 0;
    areaAcao.append(botao);
  }

  cartao.append(
    criarElemento('span', 'produto-cat', produto.category),
    criarElemento('h3', 'produto-nome', produto.name),
    etiqueta,
    criarElemento('span', classeEstoque, textoDoEstoque(produto)),
    areaAcao,
  );
  return cartao;
}

function desenharProdutos() {
  const grade = pegar('grade');
  grade.innerHTML = '';
  let quantosApareceram = 0;

  for (let i = 0; i < produtos.length; i++) {
    if (produtoApareceNaTela(produtos[i])) {
      grade.append(criarCartao(produtos[i]));
      quantosApareceram = quantosApareceram + 1;
    }
  }

  pegar('sem-resultado').hidden = quantosApareceram > 0;
}

function calcularSubtotal() {
  let soma = 0;
  for (let i = 0; i < carrinho.length; i++) {
    const produto = acharProduto(carrinho[i].id);
    if (produto !== null) {
      soma = soma + produto.priceCents * carrinho[i].quantidade;
    }
  }
  return soma;
}

function desenharCarrinho() {
  const lista = pegar('itens');
  lista.innerHTML = '';
  let unidades = 0;

  for (let i = 0; i < carrinho.length; i++) {
    const produto = acharProduto(carrinho[i].id);
    if (produto === null) {
      continue;
    }

    const quantidade = carrinho[i].quantidade;
    unidades = unidades + quantidade;

    const linha = criarElemento('li', 'item');
    linha.append(
      criarElemento('span', 'item-nome', produto.name),
      criarControleQuantidade(produto, quantidade, true),
      criarElemento('span', 'item-total num', formatarPreco(produto.priceCents * quantidade)),
    );
    lista.append(linha);
  }

  if (carrinho.length === 0) {
    lista.append(criarElemento('li', 'vazio', 'Seu carrinho está vazio.'));
  }

  pegar('limpar').hidden = carrinho.length === 0;

  if (unidades === 1) {
    pegar('movel-qtd').textContent = '1 item';
  } else {
    pegar('movel-qtd').textContent = unidades + ' itens';
  }

  desenharResumo();
}

function desenharResumo() {
  let subtotal = calcularSubtotal();
  let desconto = 0;
  let total = subtotal;
  let ganhouDesconto = false;

  if (cotacao !== null) {
    subtotal = cotacao.subtotalCents;
    desconto = cotacao.discountCents;
    total = cotacao.totalCents;
    ganhouDesconto = cotacao.discountApplied;
  }

  const calculando = cotacao === null && subtotal > LIMITE_DESCONTO;

  let totalNaTela = formatarPreco(total);
  if (calculando) {
    totalNaTela = 'Calculando…';
  }

  pegar('subtotal').textContent = formatarPreco(subtotal);
  pegar('linha-desconto').hidden = !ganhouDesconto;
  pegar('desconto').textContent = '− ' + formatarPreco(desconto);
  pegar('total').textContent = totalNaTela;
  pegar('movel-total').textContent = totalNaTela;
  pegar('finalizar').disabled = cotacao === null || enviando;

  const meta = pegar('meta');
  meta.classList.toggle('conquistada', ganhouDesconto);

  // Carrinho vazio: não mostra o aviso de quanto falta para o desconto.
  meta.hidden = calcularSubtotal() === 0;
  if (meta.hidden) {
    meta.textContent = '';
    return;
  }

  if (ganhouDesconto) {
    meta.textContent = 'Você economizou ' + formatarPreco(desconto) + ' nesta compra.';
  } else if (calculando) {
    meta.textContent = 'Calculando desconto…';
  } else {
    const falta = LIMITE_DESCONTO - subtotal + 1;

    let progresso = (subtotal / LIMITE_DESCONTO) * 100;
    if (progresso > 100) {
      progresso = 100;
    }

    const barra = criarElemento('div', 'barra');
    barra.setAttribute('aria-hidden', 'true');
    const preenchimento = criarElemento('span');
    preenchimento.style.width = progresso + '%';
    barra.append(preenchimento);

    meta.textContent = 'Faltam ' + formatarPreco(falta) + ' para ganhar 5% de desconto';
    meta.append(barra);
  }
}

function itensParaEnviar() {
  const itens = [];
  for (let i = 0; i < carrinho.length; i++) {
    itens.push({ productId: carrinho[i].id, quantity: carrinho[i].quantidade });
  }
  return itens;
}

async function atualizarCotacao() {
  numeroCotacao = numeroCotacao + 1;
  const numeroDestaCotacao = numeroCotacao;

  if (carrinho.length === 0) {
    cotacao = null;
    desenharResumo();
    return;
  }

  cotacao = null;

  try {
    const resposta = await chamarApi('/api/orders/quote', 'POST', { items: itensParaEnviar() });

    if (numeroDestaCotacao !== numeroCotacao) {
      return;
    }

    cotacao = resposta;

    let precoMudou = false;
    for (let i = 0; i < resposta.items.length; i++) {
      const item = resposta.items[i];
      const produto = acharProduto(item.productId);

      if (produto !== null && produto.priceCents !== item.unitPriceCents) {
        produto.priceCents = item.unitPriceCents;
        precoMudou = true;
      }
    }

    if (precoMudou) {
      desenharProdutos();
      desenharCarrinho();
    } else {
      desenharResumo();
    }
  } catch (erro) {
    if (numeroDestaCotacao !== numeroCotacao) {
      return;
    }

    if (erro.status === 409) {
      await sincronizar(erro.details);
    } else {
      mostrarAviso(erro.message, 'erro');
    }
  }
}

async function sincronizar(problemas) {
  try {
    produtos = await chamarApi('/api/products');
  } catch (erro) {
    mostrarAviso(erro.message, 'erro');
    return;
  }

  cotacao = null;

  const novoCarrinho = [];
  for (let i = 0; i < carrinho.length; i++) {
    const item = carrinho[i];
    const produto = acharProduto(item.id);

    if (produto !== null && produto.stock > 0) {
      if (item.quantidade > produto.stock) {
        item.quantidade = produto.stock;
      }
      novoCarrinho.push(item);
    }
  }
  carrinho = novoCarrinho;

  desenharCategorias();
  desenharProdutos();
  desenharCarrinho();

  if (problemas && problemas.length > 0) {
    const nomes = [];
    for (let i = 0; i < problemas.length; i++) {
      if (problemas[i].name === null) {
        nomes.push('Produto removido');
      } else {
        nomes.push(problemas[i].name);
      }
    }
    mostrarAviso('Estoque mudou e o carrinho foi ajustado: ' + nomes.join(', ') + '.', 'erro');
  }

  await atualizarCotacao();
}

function mostrarRecibo(pedido) {
  pegar('recibo-titulo').textContent = 'Pedido nº ' + pedido.id;

  const lista = pegar('recibo-itens');
  lista.innerHTML = '';

  for (let i = 0; i < pedido.items.length; i++) {
    const item = pedido.items[i];
    const linha = criarElemento('li');
    linha.append(
      criarElemento('span', '', item.quantity + ' × ' + item.name),
      criarElemento('span', 'num', formatarPreco(item.lineTotalCents)),
    );
    lista.append(linha);
  }

  pegar('recibo-subtotal').textContent = formatarPreco(pedido.subtotalCents);
  pegar('recibo-linha-desconto').hidden = pedido.discountCents === 0;
  pegar('recibo-desconto').textContent = '− ' + formatarPreco(pedido.discountCents);
  pegar('recibo-total').textContent = formatarPreco(pedido.totalCents);
  pegar('recibo').showModal();
}

async function finalizarCompra() {
  if (enviando || carrinho.length === 0 || cotacao === null) {
    return;
  }

  enviando = true;
  pegar('finalizar').disabled = true;
  pegar('finalizar').textContent = 'Finalizando…';

  try {
    const pedido = await chamarApi('/api/orders', 'POST', {
      items: itensParaEnviar(),
      expectedTotalCents: cotacao.totalCents,
    });

    carrinho = [];
    cotacao = null;
    mostrarRecibo(pedido);
    await sincronizar();
  } catch (erro) {
    if (erro.status === 409) {
      await sincronizar(erro.details);
      if (!erro.details || erro.details.length === 0) {
        mostrarAviso(erro.message, 'erro');
      }
    } else {
      mostrarAviso(erro.message, 'erro');
    }
  } finally {
    enviando = false;
    pegar('finalizar').textContent = 'Finalizar compra';
    desenharResumo();
  }
}

pegar('busca').addEventListener('input', function (evento) {
  buscaAtual = evento.target.value;
  desenharProdutos();
});

pegar('limpar').addEventListener('click', function () {
  carrinho = [];
  cotacao = null;
  desenharProdutos();
  desenharCarrinho();
  atualizarCotacao();
});

pegar('finalizar').addEventListener('click', finalizarCompra);

pegar('fechar-recibo').addEventListener('click', function () {
  pegar('recibo').close();
});

async function iniciarLoja() {
  try {
    produtos = await chamarApi('/api/products');
    desenharCategorias();
    desenharProdutos();
    desenharCarrinho();
  } catch (erro) {
    mostrarAviso(erro.message, 'erro');
  }
}

iniciarLoja();
