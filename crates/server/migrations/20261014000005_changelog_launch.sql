-- ADR 0031: the first notes of "Novidades", for the release that brought it. Admins edit or
-- delete them like any other note.
insert into changelog_entries (id, kind, title, body, published_at) values
  ('6d0f4b8e-1c2a-4d7e-9a51-0f3b2c8e1a01', 'new', 'Ingresso no celular',
   'Quem não vai buscar o papel recebe o ingresso por um link no WhatsApp. A pessoa abre no celular, mostra o QR na entrada e a portaria lê igual ao papel, mesmo sem internet.

No evento, abra a aba Digitais, escolha o número e envie. Você vê quem já abriu o ingresso e quem já entrou.',
   now()),
  ('6d0f4b8e-1c2a-4d7e-9a51-0f3b2c8e1a02', 'new', 'Entrar com Google',
   'Além do código por e-mail, agora dá para entrar com a sua conta Google, em um clique. Se você já tinha conta com o mesmo e-mail, é a mesma conta.',
   now() - interval '1 minute'),
  ('6d0f4b8e-1c2a-4d7e-9a51-0f3b2c8e1a03', 'improvement', 'Resultados de cada evento',
   'A visão geral do evento mostra quanto foi vendido, o faturamento estimado, o custo dos ingressos e as entradas a cada 15 minutos. Em Resultados, no menu, ficam todos os eventos juntos, com planilha para baixar.',
   now() - interval '2 minutes'),
  ('6d0f4b8e-1c2a-4d7e-9a51-0f3b2c8e1a04', 'security', 'Seus dados, do seu jeito',
   'Em Minha conta você baixa uma cópia de todos os seus dados ou exclui a conta. Publicamos os Termos de Uso, a Política de Privacidade e a Política de Reembolso, e o login ganhou limites contra abuso.',
   now() - interval '3 minutes');
