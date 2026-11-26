-- 17: horário opcional na tarefa e Base Arco (só admin) dentro do sistema.
-- 1) gestao.tarefas.horario: hora do compromisso (reuniões). Sem horário continua valendo só a data.
-- 2) gestao.base_arco: páginas de texto (uma por cliente, com subpáginas "Encontros" e "Entre encontros").
--    Só admin lê e edita. As rotinas (n8n, usuário gestao_n8n) leem e escrevem pelas funções srv_base_*.
-- Rodar depois do 16. Pode rodar de novo.

alter table gestao.tarefas add column if not exists horario time;

create or replace view gestao.v_tarefas with (security_invoker = true) as
select t.id, t.titulo, t.cliente_id, t.area_id, t.entregavel_id, t.modelo_id, t.bloco, t.notas, t.responsavel_id,
       t.status, t.etapa_atual, t.estado_atual, t.prazo, t.depende_de, t.criado_por, t.criado_em, t.concluida_em,
       t.concluida_por, t.arquivada_em, t.arquivada_por,
       c.nome as cliente,
       a.nome as area,
       p.nome as responsavel,
       e.nome as proxima_acao,
       coalesce(e.prazo_previsto, t.prazo) as prazo_vez,
       (t.status <> 'concluida' and t.arquivada_em is null
        and coalesce(e.prazo_previsto, t.prazo) < current_date) as atrasada,
       gestao.etiquetas_tarefa(t.id) as lancamentos,
       array(select tl.lancamento_id from gestao.tarefa_lancamentos tl where tl.tarefa_id = t.id) as lancamento_ids,
       (select count(*)::int from gestao.tarefa_etapas te where te.tarefa_id = t.id) as etapas_total,
       t.horario
from gestao.tarefas t
left join gestao.clientes c on c.id = t.cliente_id
left join gestao.areas a on a.id = t.area_id
left join gestao.pessoas p on p.id = t.responsavel_id
left join gestao.tarefa_etapas e on e.tarefa_id = t.id and e.ordem = t.etapa_atual;
grant select on gestao.v_tarefas to authenticated;

-- Base Arco
create table if not exists gestao.base_arco (
  id uuid primary key default gen_random_uuid(),
  pai_id uuid references gestao.base_arco (id) on delete cascade,
  titulo text not null check (length(trim(titulo)) > 0),
  conteudo text not null default '',
  ordem int not null default 0,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references gestao.pessoas (id)
);
create unique index if not exists base_arco_titulo_uk
  on gestao.base_arco (coalesce(pai_id, '00000000-0000-0000-0000-000000000000'::uuid), titulo);

alter table gestao.base_arco enable row level security;
drop policy if exists base_arco_adm on gestao.base_arco;
create policy base_arco_adm on gestao.base_arco for all to authenticated
  using (gestao.e_admin()) with check (gestao.e_admin());
grant select, insert, update, delete on gestao.base_arco to authenticated;

-- Rotinas: pai = título da página do cliente (ou null para página de topo), titulo = título da página.
create or replace function gestao.srv_base_ler(p_pai text, p_titulo text) returns text
language plpgsql stable security definer set search_path = gestao, public as $$
declare r text;
begin
  if not gestao.e_servico() then raise exception 'apenas servico'; end if;
  select b.conteudo into r from gestao.base_arco b
  left join gestao.base_arco pai on pai.id = b.pai_id
  where b.titulo = p_titulo and ((p_pai is null and b.pai_id is null) or pai.titulo = p_pai)
  limit 1;
  return r;
end;
$$;

create or replace function gestao.srv_base_salvar(p_pai text, p_titulo text, p_conteudo text, p_modo text default 'substituir')
returns uuid
language plpgsql security definer set search_path = gestao, public as $$
declare
  v_pai uuid;
  v_id uuid;
begin
  if not gestao.e_servico() then raise exception 'apenas servico'; end if;
  if p_modo not in ('substituir', 'prepend', 'append') then raise exception 'modo invalido'; end if;
  if p_pai is not null then
    select id into v_pai from gestao.base_arco where pai_id is null and titulo = p_pai;
    if v_pai is null then raise exception 'pagina do cliente nao encontrada: %', p_pai; end if;
  end if;
  select id into v_id from gestao.base_arco
  where titulo = p_titulo and coalesce(pai_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(v_pai, '00000000-0000-0000-0000-000000000000'::uuid);
  if v_id is null then
    insert into gestao.base_arco (pai_id, titulo, conteudo, ordem)
    values (v_pai, p_titulo, p_conteudo,
            (select coalesce(max(ordem), 0) + 1 from gestao.base_arco where pai_id is not distinct from v_pai))
    returning id into v_id;
  else
    update gestao.base_arco
    set conteudo = case p_modo
          when 'prepend' then p_conteudo || E'\n\n' || conteudo
          when 'append'  then conteudo || E'\n\n' || p_conteudo
          else p_conteudo end,
        atualizado_em = now()
    where id = v_id;
  end if;
  return v_id;
end;
$$;

revoke execute on function gestao.srv_base_ler(text, text) from public, anon, authenticated;
revoke execute on function gestao.srv_base_salvar(text, text, text, text) from public, anon, authenticated;
grant execute on function gestao.srv_base_ler(text, text) to service_role;
grant execute on function gestao.srv_base_salvar(text, text, text, text) to service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'gestao_n8n') then
    grant execute on function gestao.srv_base_ler(text, text) to gestao_n8n;
    grant execute on function gestao.srv_base_salvar(text, text, text, text) to gestao_n8n;
  end if;
end $$;

select 'ok' as resultado, (select count(*) from gestao.base_arco) as paginas;
