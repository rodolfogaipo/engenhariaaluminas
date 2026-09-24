/* =========================================================
   drive.js — upload de arquivos pro Google Drive
   Só o Admin (ou quem estiver logado quando anexar) precisa
   autorizar uma vez; os arquivos ficam com link público pra
   qualquer funcionário baixar sem precisar logar em nada.
   ========================================================= */

const DRIVE_CLIENT_ID = '686082435207-arrhfca928macudgsrjb49r70alkokc0.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const TAMANHO_MAX_DRIVE = 200 * 1024 * 1024; // 200MB por arquivo

let _accessToken = null;
let _accessTokenExpiraEm = 0;

function carregarScriptGis() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Não consegui carregar o login do Google.'));
    document.head.appendChild(script);
  });
}

async function obterTokenDrive() {
  if (_accessToken && Date.now() < _accessTokenExpiraEm - 60000) {
    return _accessToken;
  }
  await carregarScriptGis();
  return new Promise((resolve, reject) => {
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: DRIVE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (resp) => {
        if (resp.error) {
          reject(new Error('Não autorizou o acesso ao Drive.'));
          return;
        }
        _accessToken = resp.access_token;
        _accessTokenExpiraEm = Date.now() + resp.expires_in * 1000;
        resolve(_accessToken);
      },
    });
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

function tipoDoArquivo(mime) {
  if (mime.startsWith('image/')) return 'imagem';
  if (mime.startsWith('video/')) return 'video';
  return 'pdf';
}

/* Foto de celular costuma vir com 3–8 MB e 4000px — muito mais do que
   precisa pra ver no app ou imprimir. Antes de enviar, reduz pra no
   máximo 2000px no lado maior (JPEG 85%): fica com poucas centenas de
   KB, sobe várias vezes mais rápido e continua nítida. GIF/SVG e
   imagens já pequenas vão como estão. */
const LADO_MAX_FOTO = 1600; // nítido na tela e na ficha impressa, e sobe bem mais rápido

async function comprimirImagemSeCompensar(file) {
  const tipo = file.type || '';
  if (!tipo.startsWith('image/') || tipo === 'image/gif' || tipo === 'image/svg+xml') return file;
  if (file.size < 250 * 1024) return file;
  try {
    let fonte;
    let largura;
    let altura;
    if (window.createImageBitmap) {
      // imageOrientation: foto tirada de lado no celular não fica deitada
      fonte = await createImageBitmap(file, { imageOrientation: 'from-image' });
      largura = fonte.width;
      altura = fonte.height;
    } else {
      fonte = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });
      largura = fonte.naturalWidth;
      altura = fonte.naturalHeight;
    }
    const escala = Math.min(1, LADO_MAX_FOTO / Math.max(largura, altura));
    const w = Math.round(largura * escala);
    const h = Math.round(altura * escala);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // PNG com fundo transparente não fica preto no JPEG
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(fonte, 0, 0, w, h);
    if (fonte.close) fonte.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob || blob.size >= file.size) return file; // não compensou: manda o original
    const nome = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], nome, { type: 'image/jpeg', lastModified: Date.now() });
  } catch (e) {
    return file; // qualquer problema na redução: manda o original, nunca trava
  }
}

const Drive = {
  async conectar() {
    await obterTokenDrive();
  },

  async enviarArquivo(fileOriginal) {
    if (fileOriginal.size > TAMANHO_MAX_DRIVE) {
      throw new Error('Arquivo maior que 200MB.');
    }
    const [token, file] = await Promise.all([obterTokenDrive(), comprimirImagemSeCompensar(fileOriginal)]);

    // Envia o arquivo em binário, direto (antes era convertido pra texto
    // base64, que deixa tudo 33% maior e trava o celular em vídeos)
    const boundary = 'engaluminas' + Date.now() + Math.random().toString(36).slice(2, 8);
    const metadata = { name: file.name, mimeType: file.type || 'application/octet-stream' };
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\nContent-Type: ${metadata.mimeType}\r\n\r\n`,
      file,
      `\r\n--${boundary}--`,
    ]);

    const resp = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );
    if (!resp.ok) throw new Error('Falha ao enviar pro Drive (' + resp.status + ').');
    const arquivo = await resp.json();

    // torna o arquivo acessível por link, pra funcionário baixar sem logar
    await fetch(`https://www.googleapis.com/drive/v3/files/${arquivo.id}/permissions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });

    return {
      id: arquivo.id,
      nome: arquivo.name,
      tipo: tipoDoArquivo(metadata.mimeType),
      tamanho: file.size,
      linkVisualizar: `https://drive.google.com/file/d/${arquivo.id}/view`,
      linkBaixar: `https://drive.google.com/uc?export=download&id=${arquivo.id}`,
      linkImagem: `https://lh3.googleusercontent.com/d/${arquivo.id}`,
      criadoEm: Date.now(),
    };
  },

  /* Envia vários de uma vez (4 em paralelo), mantendo a ordem escolhida.
     onProgresso(feitos, total) é chamado a cada arquivo concluído.
     Retorna { enviados: [...na ordem], erros: [{ nome, mensagem }] }. */
  async enviarVarios(arquivos, onProgresso, emParalelo = 4) {
    const lista = Array.from(arquivos || []);
    const resultados = new Array(lista.length).fill(null);
    const erros = [];
    let proximo = 0;
    let feitos = 0;
    if (lista.length) {
      await obterTokenDrive(); // pede a autorização uma vez só, antes de abrir os envios
      onProgresso?.(0, lista.length);
    }
    const trabalhador = async () => {
      while (proximo < lista.length) {
        const i = proximo++;
        try {
          resultados[i] = await this.enviarArquivo(lista[i]);
        } catch (e) {
          erros.push({ nome: lista[i].name, mensagem: e && e.message ? e.message : 'erro desconhecido' });
        }
        feitos++;
        onProgresso?.(feitos, lista.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(emParalelo, lista.length) }, trabalhador));
    return { enviados: resultados.filter(Boolean), erros };
  },

  async excluirArquivo(driveId) {
    try {
      const token = await obterTokenDrive();
      await fetch(`https://www.googleapis.com/drive/v3/files/${driveId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // se falhar (ex: já foi excluído manualmente), não trava o app
    }
  },
};

window.Drive = Drive;
