-- v3: rodar DEPOIS do script da v2

alter table gestao.pessoas add column avisos_email boolean not null default true;
alter table gestao.pessoas add column avisos_resumo boolean not null default true;

create or replace function gestao.e_servico() returns boolean
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role';
$$;

-- Tabelas novas

create table gestao.notificacoes (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references gestao.pessoas (id) on delete cascade,
  tipo text not null check (tipo in ('atribuida', 'na_sua_etapa', 'devolvida', 'reatribuida', 'mencao', 'comentario', 'resumo_diario')),
  tarefa_id uuid references gestao.tarefas (id) on delete cascade,
  assunto text not null,
  dados jsonb not null default '{}'::jsonb,
  criada_em timestamptz not null default now(),
  enviada_em timestamptz,
  tentativas int not null default 0,
  erro text
);

create index notificacoes_pendentes_idx on gestao.notificacoes (criada_em) where enviada_em is null;

create table gestao.recorrentes (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  cliente_id uuid references gestao.clientes (id),
  area_id uuid references gestao.areas (id),
  responsavel_id uuid not null references gestao.pessoas (id),
  frequencia text not null check (frequencia in ('diaria_util', 'semanal', 'mensal')),
  dia_semana int check (dia_semana between 1 and 5),
  dia_mes int check (dia_mes between 1 and 28),
  prazo_dias_uteis int not null default 1 check (prazo_dias_uteis >= 0),
  bloco text,
  notas text,
  ativo boolean not null default true,
  ultima_geracao date,
  criado_por uuid references gestao.pessoas (id),
  check ((frequencia <> 'semanal' or dia_semana is not null) and (frequencia <> 'mensal' or dia_mes is not null))
);

create table gestao.comentarios (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references gestao.tarefas (id) on delete cascade,
  autor_id uuid not null references gestao.pessoas (id),
  texto text not null check (length(trim(texto)) > 0),
  criado_em timestamptz not null default now()
);

create table gestao.links (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references gestao.tarefas (id) on delete cascade,
  titulo text not null,
  url text not null check (url ~* '^https?://'),
  criado_por uuid references gestao.pessoas (id),
  criado_em timestamptz not null default now()
);

create table gestao.filtros_salvos (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null default auth.uid() references gestao.pessoas (id) on delete cascade,
  nome text not null,
  filtro jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

create index tarefas_busca_idx on gestao.tarefas
  using gin (to_tsvector('portuguese', titulo || ' ' || coalesce(notas, '')));

-- Views (respeitam a seguranca por linha de quem consulta)

create view gestao.v_tarefas with (security_invoker = true) as
select t.*,
       c.nome as cliente,
       a.nome as area,
       p.nome as responsavel,
       e.nome as proxima_acao,
       coalesce(e.prazo_previsto, t.prazo) as prazo_vez,
       (t.status <> 'concluida' and t.arquivada_em is null
        and coalesce(e.prazo_previsto, t.prazo) < current_date) as atrasada
from gestao.tarefas t
left join gestao.clientes c on c.id = t.cliente_id
left join gestao.areas a on a.id = t.area_id
left join gestao.pessoas p on p.id = t.responsavel_id
left join gestao.tarefa_etapas e on e.tarefa_id = t.id and e.ordem = t.etapa_atual;

create view gestao.v_cliente_resumo with (security_invoker = true) as
select c.id as cliente_id,
       c.nome,
       count(*) filter (where v.status <> 'concluida' and v.arquivada_em is null) as abertas,
       count(*) filter (where v.atrasada) as atrasadas,
       count(*) filter (where v.status = 'concluida' and v.concluida_em >= now() - interval '30 days') as concluidas_30d,
       max(v.concluida_em) filter (
         where v.status = 'concluida'
           and not exists (select 1 from gestao.historico h where h.tarefa_id = v.id and h.acao = 'concluiu_em_massa')
       ) as ultima_conclusao,
       min(v.prazo_vez) filter (where v.status <> 'concluida' and v.arquivada_em is null) as proximo_prazo
from gestao.clientes c
left join gestao.v_tarefas v on v.cliente_id = c.id
group by c.id, c.nome;

-- Horas corridas entre iniciar e concluir cada acao
create view gestao.v_tempo_etapas with (security_invoker = true) as
select t.modelo_id,
       m.nome as tipo_peca,
       e.ordem,
       e.nome as acao,
       e.responsavel_id,
       p.nome as responsavel,
       count(*) as feitas,
       round(avg(extract(epoch from (e.concluida_em - e.iniciada_em)) / 3600.0)::numeric, 1) as media_horas,
       round(max(extract(epoch from (e.concluida_em - e.iniciada_em)) / 3600.0)::numeric, 1) as maximo_horas
from gestao.tarefa_etapas e
join gestao.tarefas t on t.id = e.tarefa_id
left join gestao.modelos_peca m on m.id = t.modelo_id
left join gestao.pessoas p on p.id = e.responsavel_id
where e.concluida_em is not null and e.iniciada_em is not null
group by t.modelo_id, m.nome, e.ordem, e.nome, e.responsavel_id, p.nome;

create view gestao.v_devolucoes with (security_invoker = true) as
select t.modelo_id,
       m.nome as tipo_peca,
       h.de_etapa as ordem,
       e.nome as acao,
       count(*) as devolucoes
from gestao.historico h
join gestao.tarefas t on t.id = h.tarefa_id
left join gestao.modelos_peca m on m.id = t.modelo_id
left join gestao.tarefa_etapas e on e.tarefa_id = t.id and e.ordem = h.de_etapa
where h.acao = 'devolveu'
group by t.modelo_id, m.nome, h.de_etapa, e.nome;

-- Avisos

create or replace function gestao._notificar(
  p_pessoa uuid, p_tipo text, p_tarefa uuid, p_assunto text, p_dados jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = gestao, public as $$
declare
  v_ok boolean;
begin
  if p_pessoa is null or p_pessoa is not distinct from auth.uid() then
    return;
  end if;
  if current_setting('gestao.silencioso', true) = '1' then
    return;
  end if;
  select ativo and case when p_tipo = 'resumo_diario' then avisos_resumo else avisos_email end
  into v_ok from gestao.pessoas where id = p_pessoa;
  if not coalesce(v_ok, false) then
    return;
  end if;
  insert into gestao.notificacoes (pessoa_id, tipo, tarefa_id, assunto, dados)
  values (p_pessoa, p_tipo, p_tarefa, p_assunto, p_dados);
end;
$$;

create or replace function gestao._notif_historico() returns trigger
language plpgsql security definer set search_path = gestao, public as $$
declare
  t gestao.tarefas%rowtype;
  v_cli text;
begin
  if new.acao not in ('criou', 'avancou', 'devolveu') then
    return new;
  end if;
  select * into t from gestao.tarefas where id = new.tarefa_id;
  if t.status = 'concluida' then
    return new;
  end if;
  select nome into v_cli from gestao.clientes where id = t.cliente_id;
  perform gestao._notificar(
    t.responsavel_id,
    case new.acao when 'devolveu' then 'devolvida' when 'criou' then 'atribuida' else 'na_sua_etapa' end,
    t.id,
    case new.acao when 'devolveu' then 'Devolvida para você: ' when 'criou' then 'Nova tarefa para você: ' else 'Chegou na sua etapa: ' end || t.titulo,
    jsonb_build_object(
      'titulo', t.titulo,
      'cliente', v_cli,
      'estado', t.estado_atual,
      'proxima_acao', (select nome from gestao.tarefa_etapas where tarefa_id = t.id and ordem = t.etapa_atual),
      'prazo', (select prazo_previsto from gestao.tarefa_etapas where tarefa_id = t.id and ordem = t.etapa_atual),
      'motivo', new.motivo,
      'por', (select nome from gestao.pessoas where id = new.quem)
    )
  );
  return new;
end;
$$;

create trigger historico_notifica after insert on gestao.historico
for each row execute function gestao._notif_historico();

create or replace function gestao._notif_tarefas() returns trigger
language plpgsql security definer set search_path = gestao, public as $$
declare
  v_cli text;
begin
  if new.responsavel_id is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.etapa_atual is not null then
      return new;
    end if;
  elsif new.responsavel_id is not distinct from old.responsavel_id
        or current_setting('gestao.interno', true) = '1' then
    return new;
  end if;
  select nome into v_cli from gestao.clientes where id = new.cliente_id;
  perform gestao._notificar(
    new.responsavel_id,
    case tg_op when 'INSERT' then 'atribuida' else 'reatribuida' end,
    new.id,
    case tg_op when 'INSERT' then 'Nova tarefa para você: ' else 'Tarefa passada para você: ' end || new.titulo,
    jsonb_build_object('titulo', new.titulo, 'cliente', v_cli, 'prazo', new.prazo,
                       'por', (select nome from gestao.pessoas where id = auth.uid()))
  );
  return new;
end;
$$;

create trigger tarefas_notifica after insert or update of responsavel_id on gestao.tarefas
for each row execute function gestao._notif_tarefas();

-- Resumo diario (somente servico: n8n)

create or replace function gestao.gerar_resumo_diario(p_data date default current_date) returns int
language plpgsql security definer set search_path = gestao, public as $$
declare
  p record;
  v_hoje jsonb;
  v_atras jsonb;
  v_n int := 0;
begin
  if not gestao.e_servico() then
    raise exception 'apenas servico';
  end if;
  if extract(isodow from p_data) >= 6 then
    return 0;
  end if;
  for p in select id from gestao.pessoas where ativo and avisos_resumo loop
    if exists (select 1 from gestao.notificacoes
               where pessoa_id = p.id and tipo = 'resumo_diario' and dados ->> 'data' = p_data::text) then
      continue;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('titulo', v.titulo, 'cliente', v.cliente, 'acao', v.proxima_acao, 'prazo', v.prazo_vez)
                              order by v.prazo_vez, v.titulo), '[]'::jsonb)
      into v_hoje
    from gestao.v_tarefas v
    where v.responsavel_id = p.id and v.status <> 'concluida' and v.arquivada_em is null and v.prazo_vez = p_data;
    select coalesce(jsonb_agg(jsonb_build_object('titulo', v.titulo, 'cliente', v.cliente, 'acao', v.proxima_acao, 'prazo', v.prazo_vez)
                              order by v.prazo_vez, v.titulo), '[]'::jsonb)
      into v_atras
    from gestao.v_tarefas v
    where v.responsavel_id = p.id and v.status <> 'concluida' and v.arquivada_em is null and v.prazo_vez < p_data;
    if jsonb_array_length(v_hoje) + jsonb_array_length(v_atras) > 0 then
      perform gestao._notificar(
        p.id, 'resumo_diario', null,
        'Seu dia: ' || jsonb_array_length(v_hoje) || ' para hoje, ' || jsonb_array_length(v_atras) || ' atrasadas',
        jsonb_build_object('data', p_data, 'hoje', v_hoje, 'atrasadas', v_atras)
      );
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

-- Recorrentes (somente servico: n8n). Geram tarefa simples, sem e-mail por tarefa

create or replace function gestao.gerar_recorrentes(p_data date default current_date) returns int
language plpgsql security definer set search_path = gestao, public as $$
declare
  r gestao.recorrentes%rowtype;
  v_n int := 0;
begin
  if not gestao.e_servico() then
    raise exception 'apenas servico';
  end if;
  if extract(isodow from p_data) >= 6 then
    return 0;
  end if;
  perform set_config('gestao.silencioso', '1', true);
  for r in select * from gestao.recorrentes where ativo loop
    if r.frequencia = 'diaria_util' then
      if r.ultima_geracao is not distinct from p_data then continue; end if;
    elsif r.frequencia = 'semanal' then
      if extract(isodow from p_data) <> r.dia_semana or r.ultima_geracao is not distinct from p_data then continue; end if;
    else
      if extract(day from p_data) < r.dia_mes
         or (r.ultima_geracao is not null and date_trunc('month', r.ultima_geracao) >= date_trunc('month', p_data)) then
        continue;
      end if;
    end if;
    insert into gestao.tarefas (titulo, cliente_id, area_id, responsavel_id, bloco, notas, status, prazo, criado_por)
    values (r.titulo, r.cliente_id, r.area_id, r.responsavel_id, r.bloco, r.notas, 'a_fazer',
            gestao.add_dias_uteis(p_data, r.prazo_dias_uteis), r.criado_por);
    update gestao.recorrentes set ultima_geracao = p_data where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- Concluir tarefa simples (registra no historico)

create or replace function gestao.concluir_tarefa(p_tarefa uuid) returns void
language plpgsql security definer set search_path = gestao, public as $$
declare
  t gestao.tarefas%rowtype;
begin
  if not gestao.ativa() then
    raise exception 'sem acesso';
  end if;
  perform set_config('gestao.interno', '1', true);
  select * into t from gestao.tarefas where id = p_tarefa and arquivada_em is null for update;
  if not found then
    raise exception 'tarefa nao encontrada';
  end if;
  if t.etapa_atual is not null then
    raise exception 'tarefa com esteira: use avancar_etapa';
  end if;
  if t.status = 'concluida' then
    raise exception 'tarefa ja concluida';
  end if;
  if t.responsavel_id is distinct from auth.uid() and not gestao.e_admin() then
    raise exception 'so o responsavel ou admin conclui';
  end if;
  update gestao.tarefas set status = 'concluida', concluida_em = now(), concluida_por = auth.uid() where id = t.id;
  insert into gestao.historico (tarefa_id, quem, acao) values (t.id, auth.uid(), 'concluiu');
end;
$$;

-- Comentarios com @mencao

create or replace function gestao._pessoa_ve_tarefa(p_pessoa uuid, p_tarefa uuid) returns boolean
language sql stable security definer set search_path = gestao, public as $$
  select exists (
    select 1 from gestao.pessoas p
    join gestao.tarefas t on t.id = p_tarefa
    where p.id = p_pessoa and p.ativo
      and (p.papel = 'admin' or t.responsavel_id = p.id or t.criado_por = p.id
           or (t.cliente_id is not null and exists (
                 select 1 from gestao.acessos a
                 where a.pessoa_id = p.id and a.cliente_id = t.cliente_id
                   and (a.area_id is null or a.area_id = t.area_id))))
  );
$$;

create or replace function gestao.comentar(p_tarefa uuid, p_texto text, p_mencionados uuid[] default '{}')
returns uuid
language plpgsql security definer set search_path = gestao, public as $$
declare
  v_id uuid;
  t gestao.tarefas%rowtype;
  v_pessoa uuid;
  v_dados jsonb;
begin
  if not gestao.pode_ver_tarefa(p_tarefa) then
    raise exception 'sem acesso a tarefa';
  end if;
  select * into t from gestao.tarefas where id = p_tarefa;
  insert into gestao.comentarios (tarefa_id, autor_id, texto) values (p_tarefa, auth.uid(), p_texto)
  returning id into v_id;
  v_dados := jsonb_build_object('titulo', t.titulo, 'texto', p_texto,
                                'por', (select nome from gestao.pessoas where id = auth.uid()));
  for v_pessoa in select distinct x from unnest(coalesce(p_mencionados, '{}')) as x loop
    if gestao._pessoa_ve_tarefa(v_pessoa, p_tarefa) then
      perform gestao._notificar(v_pessoa, 'mencao', p_tarefa, 'Você foi mencionado em: ' || t.titulo, v_dados);
    end if;
  end loop;
  if t.responsavel_id is not null and not (t.responsavel_id = any (coalesce(p_mencionados, '{}'))) then
    perform gestao._notificar(t.responsavel_id, 'comentario', p_tarefa, 'Novo comentário em: ' || t.titulo, v_dados);
  end if;
  return v_id;
end;
$$;

-- Colar lista / importacao: admin ou servico (n8n). Sem confirmar, so mostra a previa.
-- Cada item: {titulo, cliente, area, responsavel, prazo, bloco, notas}
-- cliente pelo nome; area pelo codigo ou nome; responsavel pelo nome, apelido ou e-mail.

create or replace function gestao.importar_tarefas(
  p_itens jsonb, p_confirmar boolean default false, p_silencioso boolean default false
) returns jsonb
language plpgsql security definer set search_path = gestao, public as $$
declare
  it jsonb;
  i int := 0;
  v_cli uuid;
  v_area uuid;
  v_resp uuid;
  v_prazo date;
  v_titulo text;
  v_chave text;
  v_chaves text[] := '{}';
  v_criar jsonb := '[]'::jsonb;
  v_dup jsonb := '[]'::jsonb;
  v_err jsonb := '[]'::jsonb;
  v_motivo text;
begin
  if not (gestao.e_admin() or gestao.e_servico()) then
    raise exception 'apenas admin';
  end if;
  if p_silencioso then
    perform set_config('gestao.silencioso', '1', true);
  end if;
  for it in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    i := i + 1;
    v_motivo := null;
    v_cli := null; v_area := null; v_resp := null; v_prazo := null;
    v_titulo := trim(coalesce(it ->> 'titulo', ''));
    if v_titulo = '' then
      v_motivo := 'titulo vazio';
    end if;
    if v_motivo is null and trim(coalesce(it ->> 'cliente', '')) <> '' then
      select id into v_cli from gestao.clientes where lower(nome) = lower(trim(it ->> 'cliente'));
      if v_cli is null then v_motivo := 'cliente nao encontrado: ' || (it ->> 'cliente'); end if;
    end if;
    if v_motivo is null and v_cli is not null then
      select id into v_area from gestao.areas
      where lower(codigo) = lower(trim(coalesce(it ->> 'area', ''))) or lower(nome) = lower(trim(coalesce(it ->> 'area', '')));
      if v_area is null then v_motivo := 'informe a area valida para tarefa de cliente'; end if;
    end if;
    if v_motivo is null then
      select id into v_resp from gestao.pessoas
      where ativo and (lower(nome) = lower(trim(coalesce(it ->> 'responsavel', '')))
                       or lower(apelido) = lower(trim(coalesce(it ->> 'responsavel', '')))
                       or lower(email) = lower(trim(coalesce(it ->> 'responsavel', ''))))
      limit 1;
      if v_resp is null then v_motivo := 'responsavel nao encontrado: ' || coalesce(it ->> 'responsavel', ''); end if;
    end if;
    if v_motivo is null and trim(coalesce(it ->> 'prazo', '')) <> '' then
      begin
        v_prazo := (it ->> 'prazo')::date;
      exception when others then
        v_motivo := 'prazo invalido: ' || (it ->> 'prazo');
      end;
    end if;
    if v_motivo is not null then
      v_err := v_err || jsonb_build_object('linha', i, 'titulo', v_titulo, 'motivo', v_motivo);
      continue;
    end if;
    v_chave := lower(v_titulo) || '|' || coalesce(v_cli::text, '') || '|' || v_resp::text;
    if v_chave = any (v_chaves)
       or exists (select 1 from gestao.tarefas x
                  where lower(x.titulo) = lower(v_titulo) and x.cliente_id is not distinct from v_cli
                    and x.responsavel_id = v_resp and x.status <> 'concluida' and x.arquivada_em is null) then
      v_dup := v_dup || jsonb_build_object('linha', i, 'titulo', v_titulo);
      continue;
    end if;
    v_chaves := v_chaves || v_chave;
    if p_confirmar then
      insert into gestao.tarefas (titulo, cliente_id, area_id, responsavel_id, prazo, bloco, notas, status, criado_por)
      values (v_titulo, v_cli, v_area, v_resp, v_prazo, it ->> 'bloco', it ->> 'notas', 'a_fazer', auth.uid());
    end if;
    v_criar := v_criar || jsonb_build_object('linha', i, 'titulo', v_titulo);
  end loop;
  return jsonb_build_object('confirmado', p_confirmar, 'criadas', v_criar, 'duplicadas', v_dup, 'erros', v_err);
end;
$$;

-- criar_tarefa_de_modelo agora tambem aceita o servico (n8n)

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
  if not (gestao.e_admin() or gestao.e_servico()) then
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

-- Seguranca por linha das tabelas novas

alter table gestao.notificacoes enable row level security;
alter table gestao.recorrentes enable row level security;
alter table gestao.comentarios enable row level security;
alter table gestao.links enable row level security;
alter table gestao.filtros_salvos enable row level security;

create policy notificacoes_sel on gestao.notificacoes for select to authenticated using (pessoa_id = auth.uid());

create policy recorrentes_admin on gestao.recorrentes for all to authenticated
  using (gestao.e_admin()) with check (gestao.e_admin());

create policy comentarios_sel on gestao.comentarios for select to authenticated using (gestao.pode_ver_tarefa(tarefa_id));
create policy comentarios_upd on gestao.comentarios for update to authenticated
  using (autor_id = auth.uid()) with check (autor_id = auth.uid());
create policy comentarios_del on gestao.comentarios for delete to authenticated
  using (autor_id = auth.uid() or gestao.e_admin());

create policy links_sel on gestao.links for select to authenticated using (gestao.pode_ver_tarefa(tarefa_id));
create policy links_ins on gestao.links for insert to authenticated
  with check (gestao.pode_ver_tarefa(tarefa_id) and criado_por = auth.uid());
create policy links_del on gestao.links for delete to authenticated
  using (criado_por = auth.uid() or gestao.e_admin());

create policy filtros_proprios on gestao.filtros_salvos for all to authenticated
  using (pessoa_id = auth.uid()) with check (pessoa_id = auth.uid());

-- Permissoes

grant select, insert, update, delete on all tables in schema gestao to authenticated;
revoke insert, update, delete on gestao.notificacoes from authenticated;
revoke insert on gestao.comentarios from authenticated;
grant usage on schema gestao to service_role;
grant all on all tables in schema gestao to service_role;
grant execute on all functions in schema gestao to authenticated, service_role;
revoke execute on function gestao._notificar(uuid, text, uuid, text, jsonb) from authenticated;
revoke execute on function gestao._notif_historico() from authenticated;
revoke execute on function gestao._notif_tarefas() from authenticated;
revoke execute on function gestao._pessoa_ve_tarefa(uuid, uuid) from authenticated;
revoke execute on function gestao.gerar_resumo_diario(date) from authenticated;
revoke execute on function gestao.gerar_recorrentes(date) from authenticated;
revoke execute on function gestao._recalcular_prazos(uuid) from authenticated;
revoke execute on function gestao._trava_campos() from authenticated;
revoke execute on all functions in schema gestao from anon, public;
