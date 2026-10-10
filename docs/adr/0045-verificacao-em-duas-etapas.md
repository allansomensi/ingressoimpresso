# 0045. Verificação em duas etapas (opcional)

- **Status:** Aceito
- **Data:** 2026-10-10

## Contexto

O login é sem senha: um código por e-mail ou o Google (ADRs 0012, 0029). Quem toma a caixa de
e-mail de um organizador entra na conta dele, gera arquivos e mexe nos pagamentos. Alguns
organizadores pediram uma segunda proteção, mas ela não pode virar atrito para quem não quer.

## Decisão

- **Opcional, por pessoa**, ligada em **Minha conta**. Usa um app autenticador (TOTP, RFC 6238:
  HMAC-SHA1, passos de 30 s, 6 dígitos, tolerância de um passo para cada lado), compatível com
  Google Authenticator, Microsoft Authenticator, Authy e 1Password.
- **Ligar:** `POST /api/account/two-factor/setup` gera uma chave de 160 bits e devolve o link
  `otpauth://` (mostrado como QR) e a chave em base32. Ela só passa a valer depois que
  `.../enable` recebe um código certo; aí saem **10 códigos de recuperação** (`ABCD-EFGH`, sem
  letras parecidas), mostrados uma vez.
- **Entrar:** `POST /api/auth/verify` e `POST /api/auth/google` aceitam `twoFactorCode`. Para uma
  conta com a verificação ligada, sem ele a resposta é `403 two_factor_required` e nada é gravado
  (a transação volta): o código do e-mail não é gasto e o ID token do Google continua valendo. O
  painel então pede o código do app (ou um de recuperação) e reenvia o primeiro passo junto.
  Não há estado intermediário no servidor.
- **Guarda:** a chave fica cifrada com a chave mestra (`keys::seal_data`, finalidade
  `totp-secret`, presa ao id do usuário). Os códigos de recuperação ficam só como hash com chave
  (`keys::keyed_hash`). `totp_last_step` impede usar o mesmo código duas vezes.
- **Tentativas:** 10 códigos errados em 15 minutos bloqueiam o segundo passo da conta por um
  tempo (contagem em memória, como os cupons; a API roda em uma instância). Só os erros contam.
- **Desligar ou gerar novos códigos de recuperação** pede um código do app (desligar também aceita
  um de recuperação).
- **Celular perdido:** um admin desliga em **Admin** → organização → pessoa, depois de confirmar a
  identidade por outro meio. A ação vai para a auditoria (`user_two_factor_reset`).
- **Fora do escopo:** chaves de acesso (passkeys/WebAuthn) e SMS. Passkeys podem vir num ADR
  futuro; SMS é caro e fraco contra troca de chip.

## Consequências

- A Política de Privacidade passou a citar a chave cifrada e os códigos de recuperação, e
  `TERMS_VERSION` mudou.
- A portaria e o ingresso digital não mudam: não usam a sessão do organizador.
- Quem perde o celular e os códigos depende do suporte; o painel avisa isso na tela do segundo
  passo.
