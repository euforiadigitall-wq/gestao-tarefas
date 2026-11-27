-- 05: usuário de banco só para o n8n do sistema de tarefas (rodar no SQL Editor, depois do 02 e do 04)
-- Troque TROQUE_ESTA_SENHA por uma senha forte (30+ caracteres, sem aspas e sem espaço) ANTES de rodar.
-- Guarde a senha só no n8n (credencial Postgres). Ela não vai para o repositório, nem para a Vercel.
--
-- O que este usuário consegue: ler avisos pendentes, marcar como enviado, ler nome e e-mail de quem recebe,
-- e chamar gerar_recorrentes e gerar_resumo_diario. Não enxerga o schema crm, nem auth, nem as outras tabelas do gestao.

begin;

create role gestao_n8n login password 'TROQUE_ESTA_SENHA'
  nosuperuser nocreatedb nocreaterole noinherit nobypassrls connection limit 5;
alter role gestao_n8n set statement_timeout = '30s';

grant usage on schema gestao to gestao_n8n;
grant select on gestao.notificacoes to gestao_n8n;
grant update (enviada_em, tentativas, erro) on gestao.notificacoes to gestao_n8n;
grant select (id, nome, email) on gestao.pessoas to gestao_n8n;
grant execute on function gestao.gerar_recorrentes(date), gestao.gerar_resumo_diario(date) to gestao_n8n;

-- O RLS vale para este usuário também, então ele precisa das próprias políticas
create policy n8n_le_notificacoes on gestao.notificacoes
  for select to gestao_n8n using (true);
create policy n8n_marca_notificacoes on gestao.notificacoes
  for update to gestao_n8n using (true) with check (true);
create policy n8n_le_pessoas on gestao.pessoas
  for select to gestao_n8n using (true);

-- As rotinas só rodam para "serviço". Além da chave service_role (fluxos antigos), passa a valer o usuário gestao_n8n.
-- session_user é quem abriu a conexão, mesmo dentro de função security definer.
create or replace function gestao.e_servico() returns boolean
language sql stable as $$
  select session_user = 'gestao_n8n'
      or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role';
$$;

commit;

-- Conferência (somente leitura). O esperado: false, false, false, true
select
  has_schema_privilege('gestao_n8n', 'crm', 'usage')          as le_crm,
  has_schema_privilege('gestao_n8n', 'auth', 'usage')         as le_auth,
  has_table_privilege('gestao_n8n', 'gestao.tarefas', 'select') as le_tarefas,
  has_table_privilege('gestao_n8n', 'gestao.notificacoes', 'select') as le_notificacoes;

-- Quando os dois fluxos novos estiverem funcionando, remova o caminho da chave service_role:
--   create or replace function gestao.e_servico() returns boolean language sql stable as $$ select session_user = 'gestao_n8n'; $$;
-- (isso também fecha o uso dessas rotinas por qualquer chave service_role)

-- DESFAZER:
-- begin;
-- drop policy if exists n8n_le_notificacoes on gestao.notificacoes;
-- drop policy if exists n8n_marca_notificacoes on gestao.notificacoes;
-- drop policy if exists n8n_le_pessoas on gestao.pessoas;
-- drop owned by gestao_n8n;
-- drop role gestao_n8n;
-- create or replace function gestao.e_servico() returns boolean language sql stable as $$
--   select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'; $$;
-- commit;
