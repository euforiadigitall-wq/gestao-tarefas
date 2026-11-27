-- 29: fila de aprovação das tarefas que saem das reuniões. Rodar depois do 28.
-- Fluxo: a automação (n8n, ação "propor_reuniao" da Ponte Gestão) lê a transcrição e grava a reunião com os itens
-- como PROPOSTA. A Bia (ou outro admin) edita, remove, acrescenta e aprova na tela Reuniões.
-- Itens para a equipe viram tarefas no gestão ao aprovar. Itens para o cliente ficam guardados para o Portal Arco.

create table if not exists gestao.reunioes (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  data date not null,
  tipo text not null default 'interna' check (tipo in ('interna', 'arco')),
  cliente_id uuid references gestao.clientes (id),
  origem text unique,                -- id do arquivo da transcrição no Drive: impede ler a mesma reunião duas vezes
  resumo text,
  status text not null default 'pendente' check (status in ('pendente', 'publicada', 'descartada')),
  criado_em timestamptz not null default now(),
  publicada_em timestamptz,
  publicada_por uuid references gestao.pessoas (id)
);

create table if not exists gestao.reuniao_itens (
  id uuid primary key default gen_random_uuid(),
  reuniao_id uuid not null references gestao.reunioes (id) on delete cascade,
  titulo text not null,
  responsavel_id uuid references gestao.pessoas (id),
  responsavel_texto text,            -- como a automação entendeu o nome, para a Bia conferir quando não achou a pessoa
  prazo date,
  destino text not null default 'equipe' check (destino in ('equipe', 'cliente')),
  notas text,
  status text not null default 'proposta' check (status in ('proposta', 'publicada', 'removida')),
  tarefa_id uuid references gestao.tarefas (id) on delete set null,
  ordem int not null default 0
);
create index if not exists reuniao_itens_reuniao_idx on gestao.reuniao_itens (reuniao_id, ordem);

alter table gestao.reunioes enable row level security;
alter table gestao.reuniao_itens enable row level security;
drop policy if exists reunioes_admin on gestao.reunioes;
create policy reunioes_admin on gestao.reunioes for all to authenticated using (gestao.e_admin()) with check (gestao.e_admin());
drop policy if exists reuniao_itens_admin on gestao.reuniao_itens;
create policy reuniao_itens_admin on gestao.reuniao_itens for all to authenticated using (gestao.e_admin()) with check (gestao.e_admin());
grant select, insert, update, delete on gestao.reunioes, gestao.reuniao_itens to authenticated;

-- A automação grava a reunião e os itens como proposta. p_itens: [{titulo, responsavel, prazo, destino, notas}]
create or replace function gestao.srv_reuniao_propor(
  p_titulo text, p_data date, p_tipo text, p_origem text, p_cliente text, p_itens jsonb, p_resumo text default null
) returns jsonb
language plpgsql security definer set search_path = gestao, public as $$
declare
  v_id uuid;
  v_cli uuid;
  v_n int := 0;
  it jsonb;
  v_resp uuid;
  v_txt text;
begin
  if not gestao.e_servico() then raise exception 'apenas servico'; end if;
  if nullif(trim(p_origem), '') is null then raise exception 'falta o id da transcricao (origem)'; end if;
  select id into v_id from gestao.reunioes where origem = p_origem;
  if v_id is not null then return jsonb_build_object('reuniao', v_id, 'ja_existia', true); end if;

  if nullif(trim(p_cliente), '') is not null then
    select id into v_cli from gestao.clientes where lower(nome) = lower(trim(p_cliente)) limit 1;
    if v_cli is null then
      select id into v_cli from gestao.clientes where nome ilike '%' || trim(p_cliente) || '%' order by nome limit 1;
    end if;
  end if;

  insert into gestao.reunioes (titulo, data, tipo, cliente_id, origem, resumo)
  values (left(trim(p_titulo), 300), p_data, case when p_tipo = 'arco' then 'arco' else 'interna' end, v_cli, trim(p_origem), p_resumo)
  returning id into v_id;

  for it in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    v_txt := nullif(trim(it ->> 'responsavel'), '');
    v_resp := null;
    if v_txt is not null then
      select id into v_resp from gestao.pessoas
       where ativo and (lower(coalesce(apelido, '')) = lower(v_txt) or lower(split_part(nome, ' ', 1)) = lower(split_part(v_txt, ' ', 1)))
       order by (lower(coalesce(apelido, '')) = lower(v_txt)) desc limit 1;
    end if;
    if nullif(trim(it ->> 'titulo'), '') is null then continue; end if;
    v_n := v_n + 1;
    insert into gestao.reuniao_itens (reuniao_id, titulo, responsavel_id, responsavel_texto, prazo, destino, notas, ordem)
    values (v_id, left(trim(it ->> 'titulo'), 300), v_resp, v_txt,
            nullif(it ->> 'prazo', '')::date,
            case when it ->> 'destino' = 'cliente' then 'cliente' else 'equipe' end,
            nullif(trim(it ->> 'notas'), ''), v_n);
  end loop;
  return jsonb_build_object('reuniao', v_id, 'itens', v_n, 'ja_existia', false);
end;
$$;

-- Aprovar: cria as tarefas da equipe e marca a reunião como publicada (admin)
create or replace function gestao.aprovar_reuniao(p_reuniao uuid) returns int
language plpgsql security definer set search_path = gestao, public as $$
declare
  r gestao.reunioes%rowtype;
  it gestao.reuniao_itens%rowtype;
  v_tarefa uuid;
  v_n int := 0;
begin
  if not gestao.e_admin() then raise exception 'apenas admin'; end if;
  select * into r from gestao.reunioes where id = p_reuniao for update;
  if not found then raise exception 'reuniao nao encontrada'; end if;
  if r.status <> 'pendente' then raise exception 'reuniao ja publicada ou descartada'; end if;
  if exists (select 1 from gestao.reuniao_itens where reuniao_id = r.id and status = 'proposta' and destino = 'equipe' and responsavel_id is null) then
    raise exception 'ha item da equipe sem responsavel';
  end if;
  for it in select * from gestao.reuniao_itens where reuniao_id = r.id and status = 'proposta' and destino = 'equipe' order by ordem loop
    insert into gestao.tarefas (titulo, responsavel_id, prazo, notas, status, cliente_id, criado_por)
    values (it.titulo, it.responsavel_id, it.prazo,
            concat_ws(E'\n\n', it.notas, 'Veio da reunião "' || r.titulo || '" de ' || to_char(r.data, 'DD/MM/YYYY') || '.'),
            'a_fazer', r.cliente_id, auth.uid())
    returning id into v_tarefa;
    update gestao.reuniao_itens set status = 'publicada', tarefa_id = v_tarefa where id = it.id;
    v_n := v_n + 1;
  end loop;
  -- itens do cliente continuam como proposta até irem para o Portal; a reunião fica publicada
  update gestao.reunioes set status = 'publicada', publicada_em = now(), publicada_por = auth.uid() where id = r.id;
  return v_n;
end;
$$;
revoke execute on function gestao.aprovar_reuniao(uuid) from public, anon;
grant execute on function gestao.aprovar_reuniao(uuid) to authenticated;

revoke execute on function gestao.srv_reuniao_propor(text, date, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function gestao.srv_reuniao_propor(text, date, text, text, text, jsonb, text) to service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'gestao_n8n') then
    grant execute on function gestao.srv_reuniao_propor(text, date, text, text, text, jsonb, text) to gestao_n8n;
  end if;
end $$;

select 'ok' as reunioes, (select count(*) from gestao.reunioes) as reunioes_total;
