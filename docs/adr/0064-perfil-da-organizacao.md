# 0064. Perfil da organização

- **Status:** Aceito
- **Data:** 2026-10-12
- **Complementa:** [0042](0042-moderacao-de-imagens.md) (moderação de artes) e
  [0030](0030-ingresso-digital.md) (ingresso digital)

## Contexto

Quem compra um ingresso no celular, e quem vende pelo link, só vê o nome da organização em letras
pequenas. Não há logo, não há como falar com ela e, para cada evento novo, o organizador digita de
novo o local, o endereço e o preço de sempre. Bandas, escolas e igrejas fazem vários eventos no
mesmo lugar, e a pessoa que comprou quer saber a quem perguntar quando algo muda.

## Opções consideradas

1. **Campos novos em `organizations`.** Simples, mas mistura o que é público (contato, logo) com o
   que é da conta (suspensão, bônus) e complica apagar o perfil ao excluir a conta.
2. **Tabela `organization_profiles` (1:1)** com o perfil público e os padrões de evento novo.
3. **Logo numa tabela própria**, com moderação à parte. Mais isolado, mas duplica a central de
   revisão, o classificador e a recusa por hash.
4. **Logo como um `blob` da organização**: `blobs.event_id` vira opcional e `blobs.organization_id`
   guarda o dono (um dos dois). A moderação inteira serve para o logo sem código novo.

## Decisão

Opções 2 e 4.

- **Perfil** (`GET|PUT /api/account/profile`, `/painel/organizacao`, ligado de Minha conta e do
  menu): cor da marca (`#rrggbb`), WhatsApp (guardado só com dígitos e DDI: quem digita
  `(11) 99999-8888` recebe `5511999998888`), e-mail de contato, site (`https://` acrescentado se
  faltar; nada além de `http(s)`), Instagram (aceita `@perfil`, `perfil` ou o endereço do perfil) e
  os padrões de evento novo: local, endereço e preço. Tudo opcional; campo em branco apaga. Edita
  quem é da organização; quem só está na equipe de um evento (ADR 0055) não vê esse perfil.
- **Usos.** O formulário de evento novo vem preenchido com local, endereço e preço do perfil
  (editáveis). O ingresso no celular e a página do vendedor mostram nome e logo e o botão
  **Falar com a organização** (WhatsApp com mensagem pronta) e os outros contatos preenchidos; a
  cor da marca pinta o topo deles quando a arte do ingresso é clara (na página do vendedor, só se
  o texto branco ficar legível). O campo `{organizacao}` entra nos textos do ingresso impresso
  (`fields.rs` e o espelho `lib/ticket-fields.ts`, com os mesmos exemplos nos testes).
- **Logo** (`POST|DELETE /api/account/profile/logo`): PNG ou JPEG até 8 MB, conferido pelo
  cabeçalho como a arte (lado, pixels), guardado já reduzido a 512 px em PNG (mantém a
  transparência). É moderado como a arte: classificador em segundo plano, flag aberta na central
  de revisão (sem evento: "Logo da organização"), recusa lembrada por hash em `rejected_art` (o
  arquivo enviado e o reduzido). O aviso ao organizador usa os tipos `art_rejected`/`art_approved`
  com `logo: true` e leva a `/painel/organizacao`. Um logo novo apaga os anteriores, menos os que
  ainda estão em revisão ou foram recusados.
- **Logo público**: `GET /api/logos/{id}` (sem login, limite por endereço, `public, max-age=3600`)
  só serve o logo atual de uma organização, e só se não estiver em revisão nem recusado. A página
  busca a imagem e a guarda no aparelho (`data:` URL), então o ingresso no celular mostra o logo
  também sem internet.
- **LGPD**: exportar a conta traz o perfil; excluir a conta apaga o perfil e os logos (a recusa por
  hash continua, ADR 0047).

## Consequências

- Um logo nunca aparece antes de estar livre de alerta; sem classificador, fica `unchecked` e
  aparece (como a arte, ADR 0042). Uma recusa posterior tira o logo das páginas em até uma hora
  (cache do navegador).
- `blobs` passa a ter dois donos possíveis; consultas que juntavam `blobs` com `events` usam
  `left join` e `coalesce` para achar a organização. O limite de armazenamento de artes por
  organização não conta o logo (um arquivo pequeno).
- O logo não é impresso por enquanto; se um dia for, passa por `ensure_printable` como a arte.
