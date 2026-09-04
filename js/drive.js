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

const Drive = {
  async conectar() {
    await obterTokenDrive();
  },

  async enviarArquivo(file) {
    if (file.size > TAMANHO_MAX_DRIVE) {
      throw new Error('Arquivo maior que 200MB.');
    }
    const token = await obterTokenDrive();

    const base64Data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
      reader.readAsDataURL(file);
    });

    const boundary = 'engaluminas' + Date.now();
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelim = `\r\n--${boundary}--`;
    const metadata = { name: file.name, mimeType: file.type || 'application/octet-stream' };

    const body =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      `Content-Type: ${metadata.mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n` +
      base64Data +
      closeDelim;

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
