-- 23: e-mail da Bia passa a ser cs.euforiadigital@gmail.com (agenda e cadastro em pessoas).
-- ANTES: troque o e-mail do login da Bia em Authentication > Users (mesmo usuário, não crie outro:
-- criar outro usuário cria outra pessoa e as tarefas da Bia ficam presas na antiga).
-- Pode rodar de novo.

-- 1) Agenda: sai o e-mail antigo, entra o novo
do $$
declare v_bia uuid;
begin
  select id into v_bia from gestao.pessoas where lower(apelido) = 'bia' limit 1;
  if v_bia is null then raise notice 'Bia não está em pessoas: nada feito'; return; end if;
  delete from gestao.pessoa_agenda_emails where email = 'biamktcontato@gmail.com';
  insert into gestao.pessoa_agenda_emails (email, pessoa_id) values ('cs.euforiadigital@gmail.com', v_bia)
  on conflict (email) do update set pessoa_id = excluded.pessoa_id;
end $$;

-- 2) Cadastro: só copia o e-mail novo se o login já foi trocado (senão a Bia perde o acesso ao app)
update gestao.pessoas p set email = lower(u.email)
from auth.users u
where u.id = p.id and lower(p.apelido) = 'bia' and lower(u.email) = 'cs.euforiadigital@gmail.com';

-- Conferência: o e-mail de pessoas e o do login precisam ser iguais ao novo; a agenda deve listar só o novo.
select p.apelido, p.email as email_em_pessoas, lower(u.email) as email_do_login
from gestao.pessoas p join auth.users u on u.id = p.id where lower(p.apelido) = 'bia';
select a.email as email_na_agenda from gestao.pessoa_agenda_emails a join gestao.pessoas p on p.id = a.pessoa_id where lower(p.apelido) = 'bia';
