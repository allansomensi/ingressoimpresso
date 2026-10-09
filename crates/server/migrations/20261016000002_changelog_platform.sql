-- Notes of the release that brought platform controls (ADRs 0037–0043). Admins edit or delete
-- them like any other note.
insert into changelog_entries (id, kind, title, body, published_at) values
  ('6d0f4b8e-1c2a-4d7e-9a51-0f3b2c8e1a05', 'new', 'Cupons e crédito',
   'Em Minha conta agora tem um campo para cupons. Um cupom pode dar crédito em reais, ingressos grátis ou desconto no próximo lote.

O crédito é usado sozinho quando você cria um lote, e a tela do lote mostra a conta passo a passo: preço da tabela, promoção ou cupom e crédito.',
   now()),
  ('6d0f4b8e-1c2a-4d7e-9a51-0f3b2c8e1a06', 'improvement', 'Painel feito para o celular',
   'O painel ganhou uma barra de navegação embaixo da tela, menus que abrem de baixo para cima e campos que não dão zoom sozinhos no iPhone. Dá para fazer tudo com uma mão só.',
   now() - interval '1 minute'),
  ('6d0f4b8e-1c2a-4d7e-9a51-0f3b2c8e1a07', 'new', 'Avisos no sininho e página de status',
   'Avisos importantes, como uma manutenção programada, chegam pelo sininho do painel. Em ingressoimpresso.com.br/status você confere a qualquer hora se tudo está funcionando.',
   now() - interval '2 minutes'),
  ('6d0f4b8e-1c2a-4d7e-9a51-0f3b2c8e1a08', 'security', 'Revisão das imagens enviadas',
   'As artes enviadas passam por uma análise automática. Imagens que parecem fora dos Termos de Uso são revisadas pela equipe antes de serem impressas.',
   now() - interval '3 minutes');
