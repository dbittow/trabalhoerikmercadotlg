function pegar(id) {
  return document.getElementById(id);
}

function formatarPreco(centavos) {
  const valor = (centavos / 100).toFixed(2);
  return 'R$ ' + valor.replace('.', ',');
}

function converterPreco(texto) {
  const valor = texto.trim().replace('R$', '').trim().replace(',', '.');

  if (!/^\d+(\.\d{1,2})?$/.test(valor)) {
    return null;
  }

  const partes = valor.split('.');
  const reais = Number(partes[0]);
  let centavos = 0;

  if (partes.length === 2) {
    centavos = Number(partes[1].padEnd(2, '0'));
  }

  return reais * 100 + centavos;
}

async function chamarApi(rota, metodo, corpo) {
  const opcoes = { method: metodo || 'GET' };

  if (corpo !== undefined) {
    opcoes.headers = { 'Content-Type': 'application/json' };
    opcoes.body = JSON.stringify(corpo);
  }

  let resposta;
  try {
    resposta = await fetch(rota, opcoes);
  } catch (falha) {
    const erro = new Error('Sem conexão com o servidor.');
    erro.status = 0;
    throw erro;
  }

  if (resposta.status === 204) {
    return null;
  }

  let dados = null;
  try {
    dados = await resposta.json();
  } catch (falha) {
    dados = null;
  }

  if (!resposta.ok) {
    let mensagem = 'Não foi possível concluir a operação.';
    let detalhes;

    if (dados !== null) {
      mensagem = dados.error;
      detalhes = dados.details;
    }

    const erro = new Error(mensagem);
    erro.status = resposta.status;
    erro.details = detalhes;
    throw erro;
  }

  return dados;
}

function criarElemento(tag, classe, texto) {
  const elemento = document.createElement(tag);

  if (classe) {
    elemento.className = classe;
  }
  if (texto !== undefined) {
    elemento.textContent = texto;
  }

  return elemento;
}

function criarBotao(texto, classe, rotulo, aoClicar) {
  const botao = criarElemento('button', classe, texto);
  botao.type = 'button';
  botao.setAttribute('aria-label', rotulo);
  botao.addEventListener('click', aoClicar);
  return botao;
}

let temporizadorAviso;

function mostrarAviso(mensagem, tipo) {
  const caixa = pegar('toast');
  caixa.textContent = mensagem;
  caixa.dataset.tipo = tipo || 'ok';
  caixa.hidden = false;

  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(function () {
    caixa.hidden = true;
  }, 4200);
}

function formatarData(textoDoBanco) {
  const data = new Date(textoDoBanco.replace(' ', 'T') + 'Z');
  return data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
