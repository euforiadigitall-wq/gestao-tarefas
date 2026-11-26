-- 12: resumo diario da equipe (Bia), reatribuicao em massa, carga por pessoa e metricas de gargalo
-- Rodar depois do 11.

-- 1. Resumo da equipe: novo tipo de aviso e opcao por pessoa
alter table gestao.pessoas add column if not exists avisos_equipe boolean not null default false;
update gestao.pessoas set avisos_equipe = true where papel = 'admin' and ativo and nome ilike 'bia%';

alter table gestao.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table gestao.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('atribuida', 'na_sua_etapa', 'devolvida', 'reatribuida', 'mencao', 'comentario', 'resumo_diario', 'resumo_equipe'));

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
  select ativo and case p_tipo when 'resumo_diario' then avisos_resumo when 'resumo_equipe' then avisos_equipe else avisos_email end
  into v_ok from gestao.pessoas where id = p_pessoa;
  if not coalesce(v_ok, false) then
    return;
  end if;
  insert into gestao.notificacoes (pessoa_id, tipo, tarefa_id, assunto, dados)
  values (p_pessoa, p_tipo, p_tarefa, p_assunto, p_dados);
end;
$$;
revoke execute on function gestao._notificar(uuid, text, uuid, text, jsonb) from authenticated;

create or replace function gestao.gerar_resumo_equipe(p_data date default current_date) returns int
language plpgsql security definer set search_path = gestao, public as $$
declare
  p record;
  v_pessoas jsonb;
  v_clientes jsonb;
  v_atras int;
  v_hoje int;
  v_n int := 0;
begin
  if not gestao.e_servico() then
    raise exception 'apenas servico';
  end if;
  if extract(isodow from p_data) >= 6 then
    return 0;
  end if;

  select coalesce(jsonb_agg(x order by (x ->> 'atrasadas')::int desc, x ->> 'nome'), '[]'::jsonb) into v_pessoas
  from (
    select jsonb_build_object(
             'nome', coalesce(pe.nome, 'Sem responsável'),
             'atrasadas', count(*) filter (where v.prazo_vez < p_data),
             'hoje', count(*) filter (where v.prazo_vez = p_data),
             'proximos7', count(*) filter (where v.prazo_vez > p_data and v.prazo_vez <= p_data + 7),
             'abertas', count(*)) as x
    from gestao.v_tarefas v
    left join gestao.pessoas pe on pe.id = v.responsavel_id
    where v.status <> 'concluida' and v.arquivada_em is null
    group by pe.nome
  ) s;

  select coalesce(jsonb_agg(x order by (x ->> 'atrasadas')::int desc), '[]'::jsonb) into v_clientes
  from (
    select jsonb_build_object('cliente', coalesce(v.cliente, 'Interna'), 'atrasadas', count(*)) as x
    from gestao.v_tarefas v
    where v.status <> 'concluida' and v.arquivada_em is null and v.prazo_vez < p_data
    group by v.cliente
    order by count(*) desc
    limit 5
  ) s;

  select count(*) filter (where prazo_vez < p_data), count(*) filter (where prazo_vez = p_data)
    into v_atras, v_hoje
  from gestao.v_tarefas where status <> 'concluida' and arquivada_em is null;

  for p in select id from gestao.pessoas where ativo and avisos_equipe loop
    if exists (select 1 from gestao.notificacoes
               where pessoa_id = p.id and tipo = 'resumo_equipe' and dados ->> 'data' = p_data::text) then
      continue;
    end if;
    perform gestao._notificar(
      p.id, 'resumo_equipe', null,
      'Equipe: ' || v_atras || ' atrasadas, ' || v_hoje || ' para hoje',
      jsonb_build_object('data', p_data, 'atrasadas', v_atras, 'hoje', v_hoje, 'pessoas', v_pessoas, 'clientes', v_clientes)
    );
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- 2. Reatribuir em massa (admin): passa as tarefas abertas de uma pessoa para outra, com um aviso so
create or replace function gestao.reatribuir_tarefas(p_de uuid, p_para uuid) returns int
language plpgsql security definer set search_path = gestao, public as $$
declare
  v_ids uuid[];
  v_n int;
begin
  if not gestao.e_admin() then
    raise exception 'apenas admin';
  end if;
  if p_de is null or p_para is null or p_de = p_para then
    raise exception 'escolha duas pessoas diferentes';
  end if;
  if not exists (select 1 from gestao.pessoas where id = p_para and ativo) then
    raise exception 'a pessoa que vai receber precisa estar ativa';
  end if;

  select array_agg(distinct t.id) into v_ids
  from gestao.tarefas t
  where t.status <> 'concluida' and t.arquivada_em is null
    and (t.responsavel_id = p_de
         or exists (select 1 from gestao.tarefa_etapas e where e.tarefa_id = t.id and e.responsavel_id = p_de and e.concluida_em is null));
  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n = 0 then
    return 0;
  end if;

  perform set_config('gestao.silencioso', '1', true);
  perform set_config('gestao.interno', '1', true);
  update gestao.tarefa_etapas set responsavel_id = p_para
   where tarefa_id = any (v_ids) and responsavel_id = p_de and concluida_em is null;
  update gestao.tarefas set responsavel_id = p_para
   where id = any (v_ids) and responsavel_id = p_de;
  update gestao.lancamento_checklist set pessoa_id = p_para
   where pessoa_id = p_de and coalesce(feito, false) = false;
  perform set_config('gestao.silencioso', '0', true);
  perform set_config('gestao.interno', '0', true);

  perform gestao._notificar(
    p_para, 'reatribuida', null, v_n || ' tarefas passadas para você',
    jsonb_build_object('titulo', v_n || ' tarefas abertas', 'quantidade', v_n,
                       'por', (select nome from gestao.pessoas where id = auth.uid()))
  );
  return v_n;
end;
$$;

-- 3. Carga por pessoa e metricas de gargalo (admin)
create or replace function gestao.metricas_carga(p_hoje date default (now() at time zone 'America/Sao_Paulo')::date) returns jsonb
language plpgsql stable security definer set search_path = gestao, public as $$
begin
  if not gestao.e_admin() then
    raise exception 'apenas admin';
  end if;
  return (
    select coalesce(jsonb_agg(x order by (x ->> 'atrasadas')::int desc, (x ->> 'abertas')::int desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'pessoa_id', pe.id,
               'nome', coalesce(pe.nome, 'Sem responsável'),
               'abertas', count(*),
               'atrasadas', count(*) filter (where v.prazo_vez < p_hoje),
               'hoje', count(*) filter (where v.prazo_vez = p_hoje),
               'semana', count(*) filter (where v.prazo_vez > p_hoje and v.prazo_vez <= p_hoje + 7),
               'sem_prazo', count(*) filter (where v.prazo_vez is null)) as x
      from gestao.v_tarefas v
      left join gestao.pessoas pe on pe.id = v.responsavel_id
      where v.status <> 'concluida' and v.arquivada_em is null
      group by pe.id, pe.nome
    ) s
  );
end;
$$;

create or replace function gestao.metricas_gargalo(p_dias int default 90) returns jsonb
language plpgsql stable security definer set search_path = gestao, public as $$
declare
  v_ini timestamptz := now() - make_interval(days => greatest(coalesce(p_dias, 90), 1));
  v_etapas jsonb;
  v_dev_etapa jsonb;
  v_dev_pessoa jsonb;
  v_atraso_cliente jsonb;
begin
  if not gestao.e_admin() then
    raise exception 'apenas admin';
  end if;

  select coalesce(jsonb_agg(x order by (x ->> 'dias_medios')::numeric desc), '[]'::jsonb) into v_etapas
  from (
    select jsonb_build_object(
             'modelo', coalesce(m.nome, 'Sem modelo'),
             'etapa', e.nome,
             'concluidas', count(*),
             'dias_medios', round((avg(extract(epoch from (e.concluida_em - e.iniciada_em)) / 86400))::numeric, 1),
             'fora_do_prazo', count(*) filter (where e.prazo_previsto is not null and e.concluida_em::date > e.prazo_previsto)) as x
    from gestao.tarefa_etapas e
    join gestao.tarefas t on t.id = e.tarefa_id
    left join gestao.modelos_peca m on m.id = t.modelo_id
    where e.concluida_em >= v_ini and e.iniciada_em is not null
    group by m.nome, e.nome
    having count(*) >= 1
    order by avg(extract(epoch from (e.concluida_em - e.iniciada_em))) desc
    limit 15
  ) s;

  select coalesce(jsonb_agg(x order by (x ->> 'devolucoes')::int desc), '[]'::jsonb) into v_dev_etapa
  from (
    select jsonb_build_object('modelo', coalesce(m.nome, 'Sem modelo'), 'etapa', e.nome, 'devolucoes', count(*)) as x
    from gestao.historico h
    join gestao.tarefas t on t.id = h.tarefa_id
    left join gestao.modelos_peca m on m.id = t.modelo_id
    left join gestao.tarefa_etapas e on e.tarefa_id = h.tarefa_id and e.ordem = h.para_etapa
    where h.acao = 'devolveu' and h.quando >= v_ini
    group by m.nome, e.nome
    order by count(*) desc
    limit 10
  ) s;

  select coalesce(jsonb_agg(x order by (x ->> 'devolucoes')::int desc), '[]'::jsonb) into v_dev_pessoa
  from (
    select jsonb_build_object('nome', coalesce(pe.nome, 'Sem responsável'), 'devolucoes', count(*)) as x
    from gestao.historico h
    left join gestao.tarefa_etapas e on e.tarefa_id = h.tarefa_id and e.ordem = h.para_etapa
    left join gestao.pessoas pe on pe.id = e.responsavel_id
    where h.acao = 'devolveu' and h.quando >= v_ini
    group by pe.nome
    order by count(*) desc
    limit 10
  ) s;

  select coalesce(jsonb_agg(x order by (x ->> 'atrasadas')::int desc), '[]'::jsonb) into v_atraso_cliente
  from (
    select jsonb_build_object('cliente', coalesce(v.cliente, 'Interna'), 'atrasadas', count(*)) as x
    from gestao.v_tarefas v
    where v.status <> 'concluida' and v.arquivada_em is null and v.prazo_vez < (now() at time zone 'America/Sao_Paulo')::date
    group by v.cliente
    order by count(*) desc
    limit 10
  ) s;

  return jsonb_build_object('dias', p_dias, 'etapas', v_etapas, 'devolucoes_etapa', v_dev_etapa,
                            'devolucoes_pessoa', v_dev_pessoa, 'atrasadas_cliente', v_atraso_cliente);
end;
$$;

-- 4. Permissoes
revoke execute on function gestao.gerar_resumo_equipe(date) from public, anon, authenticated;
revoke execute on function gestao.reatribuir_tarefas(uuid, uuid) from public, anon;
revoke execute on function gestao.metricas_carga(date) from public, anon;
revoke execute on function gestao.metricas_gargalo(int) from public, anon;
grant execute on function gestao.reatribuir_tarefas(uuid, uuid) to authenticated;
grant execute on function gestao.metricas_carga(date) to authenticated;
grant execute on function gestao.metricas_gargalo(int) to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'gestao_n8n') then
    grant execute on function gestao.gerar_resumo_equipe(date) to gestao_n8n;
  end if;
end $$;
