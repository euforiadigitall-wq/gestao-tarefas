-- 03: cadastra as 7 pessoas no sistema de tarefas.
-- Rode DEPOIS de criar os 7 logins em Authentication > Users.
-- Antes de rodar, troque cada COLOQUE_O_EMAIL_... pelo e-mail EXATO do login criado.
-- Quem tem papel 'admin' enxerga e pode tudo. Quem tem 'membro' enxerga so o que for liberado.

insert into gestao.pessoas (id, nome, apelido, email, papel)
select u.id, v.nome, v.apelido, lower(u.email), v.papel::gestao.papel
from (values
  ('Izabella de Carvalho', 'Iza',        'COLOQUE_O_EMAIL_DA_IZA',    'admin'),
  ('Isa',                  'Isa',        'COLOQUE_O_EMAIL_DA_ISA',    'admin'),
  ('Bia',                  'Bia',        'COLOQUE_O_EMAIL_DA_BIA',    'admin'),
  ('Jony',                 'Jony',       'COLOQUE_O_EMAIL_DO_JONY',   'admin'),
  ('Matheus',              'Matheus',    'COLOQUE_O_EMAIL_DO_MATHEUS','membro'),
  ('Rapha',                'Rapha',      'rapha@jatobapassos.com.br', 'membro'),
  ('Rafael Dev',           'Rafael Dev', 'COLOQUE_O_EMAIL_DO_RAFAEL', 'membro')
) as v(nome, apelido, email, papel)
join auth.users u on lower(u.email) = lower(v.email)
on conflict (id) do update
  set nome = excluded.nome, apelido = excluded.apelido, email = excluded.email,
      papel = excluded.papel, ativo = true;

-- Conferencia: devem aparecer as 7 pessoas. Se faltar alguem, o e-mail nao bate com o login.
select nome, apelido, email, papel, ativo from gestao.pessoas order by papel, nome;
