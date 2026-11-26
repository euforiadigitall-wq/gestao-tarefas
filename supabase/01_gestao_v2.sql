create schema if not exists gestao;

create type gestao.papel as enum ('admin', 'membro');
create type gestao.status_tarefa as enum ('a_fazer', 'em_andamento', 'concluida');
create type gestao.etapa_lancamento as enum ('aquecimento', 'captacao', 'abertura_carrinho', 'vendas', 'pos_vendas', 'debriefing');
create type gestao.tipo_entregavel as enum ('manychat', 'mensagens', 'paginas', 'anuncios', 'posts_stories', 'site_principal', 'noticias', 'emails');
create type gestao.status_entregavel as enum ('a_fazer', 'em_andamento', 'concluido');
create type gestao.status_mensagem as enum ('rascunho', 'aprovada', 'programada');
create type gestao.status_comando as enum ('rascunho', 'testado', 'no_ar');

create table gestao.pessoas (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  apelido text,
  email text unique,
  papel gestao.papel not null default 'membro',
  ativo boolean not null default true
);

create table gestao.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true
);

create table gestao.areas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  ativo boolean not null default true
);

insert into gestao.areas (codigo, nome) values ('trafego', 'Tráfego'), ('lancamentos', 'Lançamentos');

-- Quais clientes cada pessoa enxerga. area_id nulo = todas as areas do cliente.
create table gestao.acessos (
  pessoa_id uuid not null references gestao.pessoas (id) on delete cascade,
  cliente_id uuid not null references gestao.clientes (id) on delete cascade,
  area_id uuid references gestao.areas (id) on delete cascade
);

create unique index acessos_uni on gestao.acessos (pessoa_id, cliente_id, coalesce(area_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Quem exerce um papel em cada cliente (ex.: aprovador)
create table gestao.cliente_papeis (
  cliente_id uuid not null references gestao.clientes (id) on delete cascade,
  papel text not null,
  pessoa_id uuid not null references gestao.pessoas (id),
  primary key (cliente_id, papel)
);

create table gestao.modelos_peca (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true
);

-- nome = acao no infinitivo (Criar); estado = particípio (Criada)
create table gestao.modelos_etapa (
  id uuid primary key default gen_random_uuid(),
  modelo_id uuid not null references gestao.modelos_peca (id) on delete cascade,
  ordem int not null,
  nome text not null,
  estado text not null,
  responsavel_padrao uuid references gestao.pessoas (id),
  papel text,
  sla_dias_uteis int not null default 1 check (sla_dias_uteis >= 0),
  unique (modelo_id, ordem),
  check (responsavel_padrao is not null or papel is not null)
);

create table gestao.lancamentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references gestao.clientes (id),
  nome text not null,
  data_abertura date,
  status text not null default 'planejado' check (status in ('planejado', 'em_andamento', 'encerrado')),
  criado_em timestamptz not null default now()
);

create table gestao.lancamento_etapas (
  id uuid primary key default gen_random_uuid(),
  lancamento_id uuid not null references gestao.lancamentos (id) on delete cascade,
  etapa gestao.etapa_lancamento not null,
  inicio date,
  fim date,
  unique (lancamento_id, etapa)
);

create table gestao.entregaveis (
  id uuid primary key default gen_random_uuid(),
  lancamento_etapa_id uuid not null references gestao.lancamento_etapas (id) on delete cascade,
  tipo gestao.tipo_entregavel not null,
  responsavel_id uuid references gestao.pessoas (id),
  status gestao.status_entregavel not null default 'a_fazer',
  prazo date,
  notas text,
  unique (lancamento_etapa_id, tipo)
);

create table gestao.entregavel_checklist (
  id uuid primary key default gen_random_uuid(),
  entregavel_id uuid not null references gestao.entregaveis (id) on delete cascade,
  texto text not null,
  feito boolean not null default false,
  ordem int not null default 0
);

create table gestao.lanc_comandos (
  id uuid primary key default gen_random_uuid(),
  entregavel_id uuid not null references gestao.entregaveis (id) on delete cascade,
  palavra_gatilho text not null,
  o_que_faz text,
  resposta text,
  status gestao.status_comando not null default 'rascunho'
);

create table gestao.lanc_mensagens (
  id uuid primary key default gen_random_uuid(),
  entregavel_id uuid not null references gestao.entregaveis (id) on delete cascade,
  dia_offset int not null,
  canal text,
  texto text,
  status gestao.status_mensagem not null default 'rascunho',
  ordem int not null default 0
);

create table gestao.debriefing (
  lancamento_id uuid primary key references gestao.lancamentos (id) on delete cascade,
  investimento numeric(12, 2),
  leads int,
  vendas int,
  faturamento numeric(12, 2),
  o_que_funcionou text,
  o_que_travou text,
  proximo_lancamento text
);

-- etapa_atual = ordem da proxima acao pendente; estado_atual = estado da ultima acao feita
create table gestao.tarefas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  cliente_id uuid references gestao.clientes (id),
  area_id uuid references gestao.areas (id),
  entregavel_id uuid references gestao.entregaveis (id) on delete set null,
  modelo_id uuid references gestao.modelos_peca (id),
  bloco text,
  notas text,
  responsavel_id uuid references gestao.pessoas (id),
  status gestao.status_tarefa not null default 'a_fazer',
  etapa_atual int,
  estado_atual text not null default 'Na fila',
  prazo date,
  depende_de uuid references gestao.tarefas (id) on delete set null,
  criado_por uuid references gestao.pessoas (id),
  criado_em timestamptz not null default now(),
  concluida_em timestamptz,
  concluida_por uuid references gestao.pessoas (id),
  arquivada_em timestamptz,
  arquivada_por uuid references gestao.pessoas (id)
);

create index tarefas_hoje_idx on gestao.tarefas (responsavel_id, status) where arquivada_em is null;
create index tarefas_cliente_idx on gestao.tarefas (cliente_id, area_id);
create index tarefas_entregavel_idx on gestao.tarefas (entregavel_id);

create table gestao.tarefa_etapas (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references gestao.tarefas (id) on delete cascade,
  ordem int not null,
  nome text not null,
  estado text not null,
  responsavel_id uuid references gestao.pessoas (id),
  sla_dias_uteis int not null default 1 check (sla_dias_uteis >= 0),
  prazo_previsto date,
  iniciada_em timestamptz,
  concluida_em timestamptz,
  concluida_por uuid references gestao.pessoas (id),
  unique (tarefa_id, ordem)
);

create table gestao.historico (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references gestao.tarefas (id) on delete cascade,
  quando timestamptz not null default now(),
  quem uuid references gestao.pessoas (id),
  acao text not null check (acao in ('criou', 'avancou', 'devolveu', 'concluiu', 'concluiu_em_massa', 'arquivou', 'restaurou')),
  de_etapa int,
  para_etapa int,
  motivo text
);

create table gestao.checklist (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references gestao.tarefas (id) on delete cascade,
  texto text not null,
  feito boolean not null default false,
  ordem int not null default 0
);

-- Funcoes de apoio: identidade e visibilidade

create or replace function gestao.ativa() returns boolean
language sql stable security definer set search_path = gestao, public as $$
  select exists (select 1 from gestao.pessoas where id = auth.uid() and ativo);
$$;

create or replace function gestao.e_admin() returns boolean
language sql stable security definer set search_path = gestao, public as $$
  select exists (select 1 from gestao.pessoas where id = auth.uid() and ativo and papel = 'admin');
$$;

create or replace function gestao.pode_ver(p_cliente uuid, p_area uuid) returns boolean
language sql stable security definer set search_path = gestao, public as $$
  select gestao.e_admin() or exists (
    select 1 from gestao.acessos a
    join gestao.pessoas p on p.id = a.pessoa_id
    where a.pessoa_id = auth.uid() and p.ativo and a.cliente_id = p_cliente
      and (a.area_id is null or a.area_id = p_area)
  );
$$;

create or replace function gestao.pode_ver_cliente(p_cliente uuid) returns boolean
language sql stable security definer set search_path = gestao, public as $$
  select gestao.e_admin()
    or exists (select 1 from gestao.acessos a where a.pessoa_id = auth.uid() and a.cliente_id = p_cliente and gestao.ativa())
    or exists (select 1 from gestao.tarefas t where t.cliente_id = p_cliente and t.responsavel_id = auth.uid() and gestao.ativa());
$$;

create or replace function gestao.pode_ver_tarefa(p_tarefa uuid) returns boolean
language sql stable security definer set search_path = gestao, public as $$
  select gestao.ativa() and exists (
    select 1 from gestao.tarefas t
    where t.id = p_tarefa
      and (gestao.e_admin()
           or t.responsavel_id = auth.uid()
           or t.criado_por = auth.uid()
           or (t.cliente_id is not null and gestao.pode_ver(t.cliente_id, t.area_id)))
  );
$$;

create or replace function gestao.pode_ver_lancamento(p_lanc uuid) returns boolean
language sql stable security definer set search_path = gestao, public as $$
  select exists (
    select 1 from gestao.lancamentos l
    where l.id = p_lanc
      and gestao.pode_ver(l.cliente_id, (select id from gestao.areas where codigo = 'lancamentos'))
  );
$$;

create or replace function gestao.pode_ver_lanc_etapa(p_le uuid) returns boolean
language sql stable security definer set search_path = gestao, public as $$
  select exists (
    select 1 from gestao.lancamento_etapas le
    where le.id = p_le and gestao.pode_ver_lancamento(le.lancamento_id)
  );
$$;

create or replace function gestao.pode_ver_entregavel(p_ent uuid) returns boolean
language sql stable security definer set search_path = gestao, public as $$
  select exists (
    select 1 from gestao.entregaveis e
    where e.id = p_ent and gestao.pode_ver_lanc_etapa(e.lancamento_etapa_id)
  );
$$;

-- Funcoes de apoio: prazos

create or replace function gestao.add_dias_uteis(d date, n int) returns date
language plpgsql immutable as $$
declare
  r date := d;
  k int := 0;
begin
  while k < n loop
    r := r + 1;
    if extract(isodow from r) < 6 then
      k := k + 1;
    end if;
  end loop;
  return r;
end;
$$;

create or replace function gestao._recalcular_prazos(p_tarefa uuid) returns void
language plpgsql security definer set search_path = gestao, public as $$
declare
  v_inicio date := current_date;
  v_fim date;
  v_atual int;
  r record;
begin
  select etapa_atual into v_atual from gestao.tarefas where id = p_tarefa;
  for r in
    select id, sla_dias_uteis from gestao.tarefa_etapas
    where tarefa_id = p_tarefa and ordem >= v_atual and concluida_em is null
    order by ordem
  loop
    v_fim := gestao.add_dias_uteis(v_inicio, r.sla_dias_uteis);
    update gestao.tarefa_etapas set prazo_previsto = v_fim where id = r.id;
    v_inicio := v_fim;
  end loop;
  update gestao.tarefas
  set prazo = (select max(prazo_previsto) from gestao.tarefa_etapas where tarefa_id = p_tarefa)
  where id = p_tarefa;
end;
$$;

-- Trava: quem nao e admin nao troca responsavel nem mexe em autoria por update direto

create or replace function gestao._trava_campos() returns trigger
language plpgsql as $$
begin
  if current_setting('gestao.interno', true) = '1' or gestao.e_admin() then
    return new;
  end if;
  if new.responsavel_id is distinct from old.responsavel_id
     or new.concluida_por is distinct from old.concluida_por
     or new.criado_por is distinct from old.criado_por then
    raise exception 'apenas admin altera responsavel ou autoria';
  end if;
  return new;
end;
$$;

create trigger tarefas_trava before update on gestao.tarefas
for each row execute function gestao._trava_campos();

-- Esteira

create or replace function gestao.criar_tarefa_de_modelo(
  p_titulo text, p_cliente uuid, p_modelo uuid,
  p_area uuid default null, p_entregavel uuid default null, p_bloco text default null
) returns uuid
language plpgsql security definer set search_path = gestao, public as $$
declare
  v_id uuid;
  v_primeira int;
  v_faltam text;
begin
  if not gestao.e_admin() then
    raise exception 'apenas admin cria tarefa com esteira';
  end if;
  perform set_config('gestao.interno', '1', true);
  select min(ordem) into v_primeira from gestao.modelos_etapa where modelo_id = p_modelo;
  if v_primeira is null then
    raise exception 'modelo sem etapas';
  end if;
  select string_agg(distinct me.papel, ', ') into v_faltam
  from gestao.modelos_etapa me
  where me.modelo_id = p_modelo and me.responsavel_padrao is null
    and not exists (select 1 from gestao.cliente_papeis cp where cp.cliente_id = p_cliente and cp.papel = me.papel);
  if v_faltam is not null then
    raise exception 'defina no cliente quem exerce o papel: %', v_faltam;
  end if;
  insert into gestao.tarefas (titulo, cliente_id, area_id, modelo_id, entregavel_id, bloco,
                              status, etapa_atual, criado_por)
  values (p_titulo, p_cliente, p_area, p_modelo, p_entregavel, p_bloco,
          'em_andamento', v_primeira, auth.uid())
  returning id into v_id;
  insert into gestao.tarefa_etapas (tarefa_id, ordem, nome, estado, responsavel_id, sla_dias_uteis)
  select v_id, me.ordem, me.nome, me.estado, coalesce(me.responsavel_padrao, cp.pessoa_id), me.sla_dias_uteis
  from gestao.modelos_etapa me
  left join gestao.cliente_papeis cp on cp.cliente_id = p_cliente and cp.papel = me.papel
  where me.modelo_id = p_modelo;
  update gestao.tarefa_etapas set iniciada_em = now() where tarefa_id = v_id and ordem = v_primeira;
  update gestao.tarefas
  set responsavel_id = (select responsavel_id from gestao.tarefa_etapas where tarefa_id = v_id and ordem = v_primeira)
  where id = v_id;
  perform gestao._recalcular_prazos(v_id);
  insert into gestao.historico (tarefa_id, quem, acao, para_etapa) values (v_id, auth.uid(), 'criou', v_primeira);
  return v_id;
end;
$$;

create or replace function gestao.avancar_etapa(p_tarefa uuid) returns void
language plpgsql security definer set search_path = gestao, public as $$
declare
  t gestao.tarefas%rowtype;
  v_prox gestao.tarefa_etapas%rowtype;
  v_estado text;
begin
  if not gestao.ativa() then
    raise exception 'sem acesso';
  end if;
  perform set_config('gestao.interno', '1', true);
  select * into t from gestao.tarefas where id = p_tarefa and arquivada_em is null for update;
  if not found then
    raise exception 'tarefa nao encontrada';
  end if;
  if t.status = 'concluida' then
    raise exception 'tarefa ja concluida';
  end if;
  if t.etapa_atual is null then
    raise exception 'tarefa sem esteira';
  end if;
  if t.responsavel_id is distinct from auth.uid() and not gestao.e_admin() then
    raise exception 'so quem esta com a etapa ou admin avanca';
  end if;
  update gestao.tarefa_etapas set concluida_em = now(), concluida_por = auth.uid()
  where tarefa_id = t.id and ordem = t.etapa_atual
  returning estado into v_estado;
  select * into v_prox from gestao.tarefa_etapas where tarefa_id = t.id and ordem > t.etapa_atual order by ordem limit 1;
  if found then
    update gestao.tarefa_etapas set iniciada_em = now() where id = v_prox.id;
    update gestao.tarefas set etapa_atual = v_prox.ordem, responsavel_id = v_prox.responsavel_id,
                              status = 'em_andamento', estado_atual = v_estado
    where id = t.id;
    perform gestao._recalcular_prazos(t.id);
    insert into gestao.historico (tarefa_id, quem, acao, de_etapa, para_etapa)
    values (t.id, auth.uid(), 'avancou', t.etapa_atual, v_prox.ordem);
  else
    update gestao.tarefas set status = 'concluida', estado_atual = v_estado,
                              concluida_em = now(), concluida_por = auth.uid()
    where id = t.id;
    insert into gestao.historico (tarefa_id, quem, acao, de_etapa)
    values (t.id, auth.uid(), 'concluiu', t.etapa_atual);
  end if;
end;
$$;

create or replace function gestao.devolver_etapa(p_tarefa uuid, p_motivo text) returns void
language plpgsql security definer set search_path = gestao, public as $$
declare
  t gestao.tarefas%rowtype;
  v_ant gestao.tarefa_etapas%rowtype;
begin
  if not gestao.ativa() then
    raise exception 'sem acesso';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'informe o motivo';
  end if;
  perform set_config('gestao.interno', '1', true);
  select * into t from gestao.tarefas where id = p_tarefa and arquivada_em is null for update;
  if not found or t.etapa_atual is null then
    raise exception 'tarefa nao encontrada ou sem esteira';
  end if;
  if t.responsavel_id is distinct from auth.uid() and not gestao.e_admin() then
    raise exception 'so quem esta com a etapa ou admin devolve';
  end if;
  select * into v_ant from gestao.tarefa_etapas where tarefa_id = t.id and ordem < t.etapa_atual order by ordem desc limit 1;
  if not found then
    raise exception 'ja esta na primeira etapa';
  end if;
  update gestao.tarefa_etapas
  set concluida_em = null, concluida_por = null,
      iniciada_em = case when ordem = v_ant.ordem then now() else null end
  where tarefa_id = t.id and ordem >= v_ant.ordem;
  update gestao.tarefas
  set etapa_atual = v_ant.ordem, responsavel_id = v_ant.responsavel_id, status = 'em_andamento',
      estado_atual = coalesce((select estado from gestao.tarefa_etapas
                               where tarefa_id = t.id and ordem < v_ant.ordem order by ordem desc limit 1), 'Na fila')
  where id = t.id;
  perform gestao._recalcular_prazos(t.id);
  insert into gestao.historico (tarefa_id, quem, acao, de_etapa, para_etapa, motivo)
  values (t.id, auth.uid(), 'devolveu', t.etapa_atual, v_ant.ordem, trim(p_motivo));
end;
$$;

-- Acoes em massa (somente admin)

create or replace function gestao.concluir_em_massa(p_ids uuid[]) returns int
language plpgsql security definer set search_path = gestao, public as $$
declare
  v_n int;
begin
  if not gestao.e_admin() then
    raise exception 'apenas admin';
  end if;
  perform set_config('gestao.interno', '1', true);
  with alvo as (
    update gestao.tarefas set status = 'concluida', concluida_em = now(), concluida_por = auth.uid()
    where id = any (p_ids) and status <> 'concluida' and arquivada_em is null
    returning id
  )
  insert into gestao.historico (tarefa_id, quem, acao) select id, auth.uid(), 'concluiu_em_massa' from alvo;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function gestao.arquivar_em_massa(p_ids uuid[]) returns int
language plpgsql security definer set search_path = gestao, public as $$
declare
  v_n int;
begin
  if not gestao.e_admin() then
    raise exception 'apenas admin';
  end if;
  perform set_config('gestao.interno', '1', true);
  with alvo as (
    update gestao.tarefas set arquivada_em = now(), arquivada_por = auth.uid()
    where id = any (p_ids) and arquivada_em is null
    returning id
  )
  insert into gestao.historico (tarefa_id, quem, acao) select id, auth.uid(), 'arquivou' from alvo;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function gestao.restaurar_tarefas(p_ids uuid[]) returns int
language plpgsql security definer set search_path = gestao, public as $$
declare
  v_n int;
begin
  if not gestao.e_admin() then
    raise exception 'apenas admin';
  end if;
  perform set_config('gestao.interno', '1', true);
  with alvo as (
    update gestao.tarefas set arquivada_em = null, arquivada_por = null
    where id = any (p_ids) and arquivada_em is not null
    returning id
  )
  insert into gestao.historico (tarefa_id, quem, acao) select id, auth.uid(), 'restaurou' from alvo;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Lancamento: cria as 6 etapas fixas

create or replace function gestao.criar_lancamento(p_cliente uuid, p_nome text, p_data_abertura date)
returns uuid
language plpgsql security definer set search_path = gestao, public as $$
declare
  v_id uuid;
  e gestao.etapa_lancamento;
begin
  if not gestao.e_admin() then
    raise exception 'apenas admin';
  end if;
  insert into gestao.lancamentos (cliente_id, nome, data_abertura)
  values (p_cliente, p_nome, p_data_abertura)
  returning id into v_id;
  foreach e in array enum_range(null::gestao.etapa_lancamento) loop
    insert into gestao.lancamento_etapas (lancamento_id, etapa) values (v_id, e);
  end loop;
  insert into gestao.debriefing (lancamento_id) values (v_id);
  return v_id;
end;
$$;

-- Seguranca por linha

do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'gestao' loop
    execute format('alter table gestao.%I enable row level security', t);
  end loop;

  foreach t in array array['pessoas', 'clientes', 'areas', 'acessos', 'cliente_papeis',
                           'modelos_peca', 'modelos_etapa', 'lancamentos', 'lancamento_etapas'] loop
    execute format('create policy %I on gestao.%I for all to authenticated using (gestao.e_admin()) with check (gestao.e_admin())', t || '_admin', t);
  end loop;

  foreach t in array array['pessoas', 'areas', 'modelos_peca', 'modelos_etapa'] loop
    execute format('create policy %I on gestao.%I for select to authenticated using (gestao.ativa())', t || '_sel', t);
  end loop;
end;
$$;

create policy clientes_sel on gestao.clientes for select to authenticated using (gestao.pode_ver_cliente(id));
create policy acessos_sel on gestao.acessos for select to authenticated using (pessoa_id = auth.uid() and gestao.ativa());
create policy cliente_papeis_sel on gestao.cliente_papeis for select to authenticated using (gestao.pode_ver_cliente(cliente_id));

create policy lancamentos_sel on gestao.lancamentos for select to authenticated using (gestao.pode_ver_lancamento(id));
create policy lancamento_etapas_sel on gestao.lancamento_etapas for select to authenticated using (gestao.pode_ver_lancamento(lancamento_id));

create policy entregaveis_sel on gestao.entregaveis for select to authenticated using (gestao.pode_ver_lanc_etapa(lancamento_etapa_id));
create policy entregaveis_ins on gestao.entregaveis for insert to authenticated with check (gestao.pode_ver_lanc_etapa(lancamento_etapa_id));
create policy entregaveis_upd on gestao.entregaveis for update to authenticated using (gestao.pode_ver_lanc_etapa(lancamento_etapa_id)) with check (gestao.pode_ver_lanc_etapa(lancamento_etapa_id));
create policy entregaveis_del on gestao.entregaveis for delete to authenticated using (gestao.e_admin());

do $$
declare
  t text;
begin
  foreach t in array array['entregavel_checklist', 'lanc_comandos', 'lanc_mensagens'] loop
    execute format('create policy %I on gestao.%I for select to authenticated using (gestao.pode_ver_entregavel(entregavel_id))', t || '_sel', t);
    execute format('create policy %I on gestao.%I for insert to authenticated with check (gestao.pode_ver_entregavel(entregavel_id))', t || '_ins', t);
    execute format('create policy %I on gestao.%I for update to authenticated using (gestao.pode_ver_entregavel(entregavel_id)) with check (gestao.pode_ver_entregavel(entregavel_id))', t || '_upd', t);
    execute format('create policy %I on gestao.%I for delete to authenticated using (gestao.e_admin())', t || '_del', t);
  end loop;
end;
$$;

create policy debriefing_sel on gestao.debriefing for select to authenticated using (gestao.pode_ver_lancamento(lancamento_id));
create policy debriefing_upd on gestao.debriefing for update to authenticated using (gestao.pode_ver_lancamento(lancamento_id)) with check (gestao.pode_ver_lancamento(lancamento_id));

create policy tarefas_sel on gestao.tarefas for select to authenticated
  using (gestao.ativa() and (gestao.e_admin() or responsavel_id = auth.uid() or criado_por = auth.uid()
                             or (cliente_id is not null and gestao.pode_ver(cliente_id, area_id))));
create policy tarefas_ins on gestao.tarefas for insert to authenticated
  with check (gestao.e_admin() or (responsavel_id = auth.uid() and criado_por = auth.uid() and etapa_atual is null
                                    and (cliente_id is null or gestao.pode_ver(cliente_id, area_id))));
create policy tarefas_upd on gestao.tarefas for update to authenticated
  using (gestao.e_admin() or responsavel_id = auth.uid())
  with check (gestao.e_admin() or responsavel_id = auth.uid());
create policy tarefas_del on gestao.tarefas for delete to authenticated using (gestao.e_admin());

create policy tarefa_etapas_sel on gestao.tarefa_etapas for select to authenticated using (gestao.pode_ver_tarefa(tarefa_id));
create policy historico_sel on gestao.historico for select to authenticated using (gestao.pode_ver_tarefa(tarefa_id));
create policy checklist_sel on gestao.checklist for select to authenticated using (gestao.pode_ver_tarefa(tarefa_id));
create policy checklist_ins on gestao.checklist for insert to authenticated with check (gestao.pode_ver_tarefa(tarefa_id));
create policy checklist_upd on gestao.checklist for update to authenticated using (gestao.pode_ver_tarefa(tarefa_id)) with check (gestao.pode_ver_tarefa(tarefa_id));
create policy checklist_del on gestao.checklist for delete to authenticated using (gestao.pode_ver_tarefa(tarefa_id));

-- Permissoes

revoke all on schema gestao from public, anon;
revoke execute on all functions in schema gestao from public, anon;
grant usage on schema gestao to authenticated;
grant select, insert, update, delete on all tables in schema gestao to authenticated;
grant execute on all functions in schema gestao to authenticated;
revoke execute on function gestao._recalcular_prazos(uuid) from authenticated;
revoke execute on function gestao._trava_campos() from authenticated;
