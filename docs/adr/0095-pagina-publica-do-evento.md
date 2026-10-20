# 0095. Página pública do evento

- **Status:** Aceito
- **Data:** 2026-10-20
- **Complementa:** [0062](0062-paginas-publicas-para-busca.md) (páginas públicas),
  [0064](0064-perfil-da-organizacao.md) (perfil da organização) e
  [0056](0056-categorias-de-ingresso.md) (categorias)

## Contexto

Quem vende ingresso "na mão" divulga o evento num cartaz e numa mensagem de WhatsApp que se perde
na conversa. Faltava um link só para mandar: quando é, onde é, quanto custa e com quem comprar.

## Decisão

- Cada evento pode ter uma página em `/e/<endereço>` (`events.public_page`, `public_slug` único,
  minúsculas, números e hífen, 3 a 60 caracteres). Fica desligada até a coordenação (parte
  `manage`) ligá-la no card **Página do evento** da visão geral.
- A página mostra o nome, a data no horário do evento, o local com o mapa (o `iframe` do Google
  Maps só carrega quando a pessoa toca; a CSP libera só `www.google.com/maps` em `frame-src`), o
  texto opcional (`public_description`, até 600), o preço de cada categoria (ou o do evento), o
  perfil da organização e os vendedores escolhidos (`sellers.on_public_page`, só quem tem telefone,
  nunca a bilheteria) com um botão de WhatsApp e uma mensagem pronta.
- **Esgotado:** a organização marca à mão (`public_sold_out`) ou o selo aparece sozinho quando
  todo número pago já foi vendido, enviado no celular, dado como cortesia, usado na porta ou
  cancelado; o mesmo vale para cada categoria, que ganha o seu selo.
- A API pública (`GET /api/public/events/{slug}`) responde 404 para uma página desligada, passa por
  `ratelimit::PUBLIC_PAGE` e nunca expõe quem comprou nem quanto foi vendido. A página tem
  metadados, imagem de compartilhamento própria e a marca do Ingresso Impresso no rodapé; entra no
  `robots` como as outras páginas públicas, mas não no sitemap (é do organizador).
- Duplicar o evento ou criar outra data não copia a página: o endereço é único.

## Consequências

- O organizador ganha um link curto para o cartaz e os grupos; o comprador fala direto com um
  vendedor, como já acontecia, sem a plataforma tocar no dinheiro.
- Um endereço escolhido fica preso ao evento enquanto ele existir.
