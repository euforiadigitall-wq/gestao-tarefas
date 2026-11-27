-- 04: ajustes de acesso no schema crm (rodar no SQL Editor do projeto, uma vez)
-- Motivo: o projeto Supabase é compartilhado com o sistema de tarefas, então os logins do time existem
-- também no CRM. As tabelas do CRM já exigem crm.eh_membro() ou papel sócia. Faltavam 2 pontos.
--
-- 1) crm.resumos_historico tinha a política "auth le" com using (true): qualquer login lia tudo.
-- 2) crm.equipe() devolvia nome e papel da equipe do CRM para qualquer login.
--
-- Não mexe em nenhuma outra política. Para desfazer, rode o bloco DESFAZER no fim deste arquivo.

begin;

drop policy if exists "auth le" on crm.resumos_historico;
create policy "membro le" on crm.resumos_historico
  for select to authenticated
  using (crm.eh_membro());

create or replace function crm.equipe()
returns table(user_id uuid, nome text, papel text)
language sql stable security definer
set search_path to 'crm', 'public'
as $$
  select m.user_id, m.nome, m.papel
  from crm.membros m
  where crm.eh_membro()
  order by m.nome;
$$;

commit;

-- Conferência (somente leitura): não pode sobrar política aberta com "true" no crm nem no gestao.
-- O esperado é nenhuma linha em crm. No gestao, só as de n8n (depois do script 05) e as que você conhece.
select schemaname, tablename, policyname, roles::text, cmd, qual
from pg_policies
where schemaname in ('crm', 'gestao') and (qual is null or qual = 'true')
order by 1, 2, 3;

-- DESFAZER (só se algo do CRM parar de funcionar):
-- begin;
-- drop policy if exists "membro le" on crm.resumos_historico;
-- create policy "auth le" on crm.resumos_historico for select to authenticated using (true);
-- create or replace function crm.equipe() returns table(user_id uuid, nome text, papel text)
--   language sql stable security definer set search_path to 'crm', 'public'
--   as $f$ select m.user_id, m.nome, m.papel from crm.membros m where auth.uid() is not null order by m.nome; $f$;
-- commit;
