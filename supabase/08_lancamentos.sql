-- Lançamentos: código e cor (a etiqueta), datas-âncora, equipe, entregáveis com quantidade
-- e checklist com modelo. Rode depois do 07. Pode rodar de novo.

-- 1. Lançamento ganha código, cor e datas-âncora

alter table gestao.lancamentos
  add column if not exists codigo text,
  add column if not exists cor text not null default 'azul'
    check (cor in ('azul', 'verde', 'roxo', 'laranja', 'rosa', 'cinza')),
  add column if not exists data_inicio date,
  add column if not exists data_fechamento date,
  add column if not exists promocao_explicita boolean not null default false;

create unique index if not exists lancamentos_codigo_uq on gestao.lancamentos (lower(codigo));

-- Cada lançamento liga só as etapas que usa (o TJBA, por exemplo, pode ir direto para vendas)
alter table gestao.lancamento_etapas add column if not exists ativa boolean not null default true;

-- Mais de um bloco do mesmo tipo na mesma etapa (bloco semanal de 10 mensagens)
alter table gestao.entregaveis drop constraint if exists entregaveis_lancamento_etapa_id_tipo_key;
alter table gestao.entregaveis
  add column if not exists quantidade int check (quantidade is null or quantidade > 0),
  add column if not exists rotulo text;

-- 2. Equipe do lançamento (quem faz cada papel neste lançamento)

create table if not exists gestao.lancamento_papeis (
  lancamento_id uuid not null references gestao.lancamentos (id) on delete cascade,
  papel text not null check (papel in ('copy', 'aprovador', 'design', 'social', 'site', 'dev')),
  pessoa_id uuid not null references gestao.pessoas (id),
  primary key (lancamento_id, papel)
);

-- 3. A etiqueta: uma tarefa pode pertencer a mais de um lançamento

create table if not exists gestao.tarefa_lancamentos (
  tarefa_id uuid not null references gestao.tarefas (id) on delete cascade,
  lancamento_id uuid not null references gestao.lancamentos (id) on delete cascade,
  primary key (tarefa_id, lancamento_id)
);
create index if not exists tarefa_lancamentos_lanc_idx on gestao.tarefa_lancamentos (lancamento_id);

-- 4. Checklist: modelo padrão (editável) e a cópia de cada lançamento

create table if not exists gestao.checklist_modelo (
  id uuid primary key default gen_random_uuid(),
  etapa gestao.etapa_lancamento not null,
  texto text not null,
  papel text check (papel in ('copy', 'aprovador', 'design', 'social', 'site', 'dev')),
  critico boolean not null default false,
  ancora text not null check (ancora in ('inicio', 'abertura', 'fechamento')),
  dias_uteis int not null default 0 check (dias_uteis >= 0),
  condicao text check (condicao in ('promocao_explicita')),
  ordem int not null default 0,
  ativo boolean not null default true,
  unique (etapa, texto)
);

create table if not exists gestao.lancamento_checklist (
  id uuid primary key default gen_random_uuid(),
  lancamento_id uuid not null references gestao.lancamentos (id) on delete cascade,
  etapa gestao.etapa_lancamento not null,
  texto text not null,
  papel text,
  pessoa_id uuid references gestao.pessoas (id),
  critico boolean not null default false,
  prazo date,
  ordem int not null default 0,
  feito boolean not null default false,
  feito_por uuid references gestao.pessoas (id),
  feito_em timestamptz
);
create index if not exists lancamento_checklist_lanc_idx on gestao.lancamento_checklist (lancamento_id, etapa);
create index if not exists lancamento_checklist_pessoa_idx on gestao.lancamento_checklist (pessoa_id) where not feito;

-- 5. Quem enxerga o lançamento: admin, liberado no cliente (área Lançamentos), da equipe
--    ou responsável por um item do checklist

create or replace function gestao.pode_ver_lancamento(p_lanc uuid) returns boolean
language sql stable security definer set search_path = gestao, public as $$
  select gestao.ativa() and exists (
    select 1 from gestao.lancamentos l
    where l.id = p_lanc
      and (gestao.pode_ver(l.cliente_id, (select id from gestao.areas where codigo = 'lancamentos'))
           or exists (select 1 from gestao.lancamento_papeis lp
                      where lp.lancamento_id = l.id and lp.pessoa_id = auth.uid())
           or exists (select 1 from gestao.lancamento_checklist ci
                      where ci.lancamento_id = l.id and ci.pessoa_id = auth.uid()))
  );
$$;

-- Códigos do lançamento de uma tarefa. Security definer de propósito: quem vê a tarefa
-- sempre vê a etiqueta, mesmo sem acesso ao lançamento.
create or replace function gestao.etiquetas_tarefa(p_tarefa uuid) returns jsonb
language sql stable security definer set search_path = gestao, public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'codigo', l.codigo, 'cor', l.cor) order by l.codigo), '[]'::jsonb)
  from gestao.tarefa_lancamentos tl
  join gestao.lancamentos l on l.id = tl.lancamento_id
  where tl.tarefa_id = p_tarefa;
$$;

create or replace view gestao.v_tarefas with (security_invoker = true) as
select t.*,
       c.nome as cliente,
       a.nome as area,
       p.nome as responsavel,
       e.nome as proxima_acao,
       coalesce(e.prazo_previsto, t.prazo) as prazo_vez,
       (t.status <> 'concluida' and t.arquivada_em is null
        and coalesce(e.prazo_previsto, t.prazo) < current_date) as atrasada,
       gestao.etiquetas_tarefa(t.id) as lancamentos,
       array(select tl.lancamento_id from gestao.tarefa_lancamentos tl where tl.tarefa_id = t.id) as lancamento_ids
from gestao.tarefas t
left join gestao.clientes c on c.id = t.cliente_id
left join gestao.areas a on a.id = t.area_id
left join gestao.pessoas p on p.id = t.responsavel_id
left join gestao.tarefa_etapas e on e.tarefa_id = t.id and e.ordem = t.etapa_atual;

-- 6. Criar lançamento: etapas ligadas, equipe e checklist copiado do modelo

drop function if exists gestao.criar_lancamento(uuid, text, date);

create or replace function gestao.criar_lancamento(
  p_cliente uuid, p_nome text, p_codigo text, p_cor text,
  p_data_inicio date, p_data_abertura date, p_data_fechamento date,
  p_etapas text[], p_promocao boolean default false, p_equipe jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = gestao, public as $$
declare
  v_id uuid;
  e gestao.etapa_lancamento;
  r record;
  v_ancora date;
begin
  if not (gestao.e_admin() or gestao.e_servico()) then
    raise exception 'apenas admin';
  end if;
  if nullif(trim(p_codigo), '') is null then
    raise exception 'informe o codigo do lancamento';
  end if;
  if exists (select 1 from gestao.lancamentos where lower(codigo) = lower(trim(p_codigo))) then
    raise exception 'ja existe um lancamento com o codigo %', trim(p_codigo);
  end if;

  insert into gestao.lancamentos (cliente_id, nome, codigo, cor, data_inicio, data_abertura, data_fechamento, promocao_explicita, status)
  values (p_cliente, trim(p_nome), trim(p_codigo), coalesce(nullif(p_cor, ''), 'azul'),
          p_data_inicio, p_data_abertura, p_data_fechamento, coalesce(p_promocao, false), 'em_andamento')
  returning id into v_id;

  foreach e in array enum_range(null::gestao.etapa_lancamento) loop
    insert into gestao.lancamento_etapas (lancamento_id, etapa, ativa)
    values (v_id, e, coalesce(e::text = any (p_etapas), false));
  end loop;

  insert into gestao.lancamento_papeis (lancamento_id, papel, pessoa_id)
  select v_id, k, nullif(v, '')::uuid
  from jsonb_each_text(coalesce(p_equipe, '{}'::jsonb)) as x(k, v)
  where nullif(v, '') is not null and k in ('copy', 'aprovador', 'design', 'social', 'site', 'dev');

  for r in
    select m.* from gestao.checklist_modelo m
    join gestao.lancamento_etapas le on le.lancamento_id = v_id and le.etapa = m.etapa and le.ativa
    where m.ativo and (m.condicao is null or (m.condicao = 'promocao_explicita' and coalesce(p_promocao, false)))
    order by m.etapa, m.ordem
  loop
    v_ancora := case r.ancora when 'inicio' then p_data_inicio when 'abertura' then p_data_abertura else p_data_fechamento end;
    insert into gestao.lancamento_checklist (lancamento_id, etapa, texto, papel, pessoa_id, critico, prazo, ordem)
    values (v_id, r.etapa, r.texto, r.papel,
            (select pessoa_id from gestao.lancamento_papeis where lancamento_id = v_id and papel = r.papel),
            r.critico,
            case when v_ancora is null then null else gestao.add_dias_uteis(v_ancora, r.dias_uteis) end,
            r.ordem);
  end loop;

  insert into gestao.debriefing (lancamento_id) values (v_id);
  return v_id;
end;
$$;

-- 7. Entregável com quantidade: cria o registro e o card da esteira, já com a etiqueta

create or replace function gestao.criar_entregavel(
  p_lancamento uuid, p_etapa gestao.etapa_lancamento, p_tipo gestao.tipo_entregavel,
  p_quantidade int, p_rotulo text, p_modelo uuid, p_titulo text,
  p_responsaveis jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = gestao, public as $$
declare
  v_cliente uuid;
  v_le uuid;
  v_ent uuid;
  v_tarefa uuid;
  v_equipe jsonb;
begin
  if not (gestao.e_admin() or gestao.e_servico()) then
    raise exception 'apenas admin';
  end if;
  select cliente_id into v_cliente from gestao.lancamentos where id = p_lancamento;
  if v_cliente is null then
    raise exception 'lancamento nao encontrado';
  end if;
  select id into v_le from gestao.lancamento_etapas
  where lancamento_id = p_lancamento and etapa = p_etapa and ativa;
  if v_le is null then
    raise exception 'esta etapa nao esta ligada neste lancamento';
  end if;

  insert into gestao.entregaveis (lancamento_etapa_id, tipo, quantidade, rotulo)
  values (v_le, p_tipo, p_quantidade, nullif(trim(p_rotulo), ''))
  returning id into v_ent;

  select coalesce(jsonb_object_agg(papel, pessoa_id), '{}'::jsonb) into v_equipe
  from gestao.lancamento_papeis where lancamento_id = p_lancamento;

  v_tarefa := gestao.criar_tarefa_de_modelo(
    p_titulo, v_cliente, p_modelo,
    (select id from gestao.areas where codigo = 'lancamentos'),
    v_ent, nullif(trim(p_rotulo), ''),
    v_equipe || coalesce(p_responsaveis, '{}'::jsonb)
  );
  insert into gestao.tarefa_lancamentos (tarefa_id, lancamento_id) values (v_tarefa, p_lancamento);
  return v_tarefa;
end;
$$;

-- 8. Marcar item do checklist: admin ou o responsável pelo item

create or replace function gestao.marcar_item_lancamento(p_item uuid, p_feito boolean) returns void
language plpgsql security definer set search_path = gestao, public as $$
begin
  if not gestao.ativa() then
    raise exception 'sem acesso';
  end if;
  update gestao.lancamento_checklist
  set feito = p_feito,
      feito_por = case when p_feito then auth.uid() else null end,
      feito_em = case when p_feito then now() else null end
  where id = p_item and (gestao.e_admin() or pessoa_id = auth.uid());
  if not found then
    raise exception 'sem permissao para este item';
  end if;
end;
$$;

-- 9. Seguranca por linha

alter table gestao.lancamento_papeis enable row level security;
alter table gestao.tarefa_lancamentos enable row level security;
alter table gestao.checklist_modelo enable row level security;
alter table gestao.lancamento_checklist enable row level security;

drop policy if exists lancamento_papeis_admin on gestao.lancamento_papeis;
drop policy if exists lancamento_papeis_sel on gestao.lancamento_papeis;
create policy lancamento_papeis_admin on gestao.lancamento_papeis for all to authenticated
  using (gestao.e_admin()) with check (gestao.e_admin());
create policy lancamento_papeis_sel on gestao.lancamento_papeis for select to authenticated
  using (gestao.pode_ver_lancamento(lancamento_id));

drop policy if exists tarefa_lancamentos_admin on gestao.tarefa_lancamentos;
drop policy if exists tarefa_lancamentos_sel on gestao.tarefa_lancamentos;
create policy tarefa_lancamentos_admin on gestao.tarefa_lancamentos for all to authenticated
  using (gestao.e_admin()) with check (gestao.e_admin());
create policy tarefa_lancamentos_sel on gestao.tarefa_lancamentos for select to authenticated
  using (gestao.pode_ver_tarefa(tarefa_id));

drop policy if exists checklist_modelo_admin on gestao.checklist_modelo;
drop policy if exists checklist_modelo_sel on gestao.checklist_modelo;
create policy checklist_modelo_admin on gestao.checklist_modelo for all to authenticated
  using (gestao.e_admin()) with check (gestao.e_admin());
create policy checklist_modelo_sel on gestao.checklist_modelo for select to authenticated
  using (gestao.ativa());

drop policy if exists lancamento_checklist_admin on gestao.lancamento_checklist;
drop policy if exists lancamento_checklist_sel on gestao.lancamento_checklist;
create policy lancamento_checklist_admin on gestao.lancamento_checklist for all to authenticated
  using (gestao.e_admin()) with check (gestao.e_admin());
create policy lancamento_checklist_sel on gestao.lancamento_checklist for select to authenticated
  using (gestao.ativa() and (pessoa_id = auth.uid() or gestao.pode_ver_lancamento(lancamento_id)));

grant select, insert, update, delete on all tables in schema gestao to authenticated;
grant all on all tables in schema gestao to service_role;
grant execute on all functions in schema gestao to authenticated, service_role;

-- 10. Modelo padrão do checklist: o que costuma passar batido.
--     Papel, etapa e prazo são sugestões: ajuste o que não bater com o seu fluxo.

insert into gestao.checklist_modelo (etapa, texto, papel, critico, ancora, dias_uteis, condicao, ordem) values
  ('abertura_carrinho', 'Trocar o nome do grupo',                              'dev'   , false, 'abertura',   0, null,                 1),
  ('abertura_carrinho', 'Colocar o link de vendas na descrição do grupo',      'dev'   , false, 'abertura',   0, null,                 2),
  ('vendas',            'Tirar do ar a página de vendas com desconto',         'dev',    true,  'fechamento', 0, 'promocao_explicita', 1),
  ('vendas',            'Retirar o link de vendas da descrição do grupo',      'dev'   , true,  'fechamento', 0, null,                 2),
  ('pos_vendas',        'Desligar o gatilho do ManyChat',                      'dev',    true,  'fechamento', 1, null,                 1),
  ('pos_vendas',        'Trocar o link da bio',                                'dev'   , false, 'fechamento', 1, null,                 2),
  ('pos_vendas',        'Arquivar os posts do lançamento',                     'social', false, 'fechamento', 2, null,                 3)
on conflict (etapa, texto) do nothing;

-- Conferência
select etapa, texto, papel, critico, ancora, dias_uteis, condicao from gestao.checklist_modelo order by etapa, ordem;
