-- Recorrente com mais de um responsavel e ligada ao evento do Google Agenda de mesmo nome.
-- Quem faz continua em responsavel_id; os demais ficam em responsaveis_extras e viram co-responsaveis.
-- horario: se a recorrente e um compromisso (ex.: Weekly 10h), a tarefa nasce com hora.
-- Se a tarefa daquele dia ja existe (nasceu do evento da agenda), a recorrente a adota em vez de duplicar.
alter table gestao.recorrentes
  add column if not exists responsaveis_extras uuid[] not null default '{}',
  add column if not exists horario time;
alter table gestao.tarefas
  add column if not exists recorrente_id uuid references gestao.recorrentes (id) on delete set null;

create or replace function gestao._gerar_recorrentes(p_data date) returns int
language plpgsql security definer set search_path = gestao, public as $$
declare
  r gestao.recorrentes%rowtype;
  v_n int := 0;
  v_id uuid;
  v_resp uuid;
  v_prazo date;
  v_semanas int;
  v_ultimo boolean;
begin
  if extract(isodow from p_data) >= 6 then
    return 0;
  end if;
  perform set_config('gestao.silencioso', '1', true);
  v_ultimo := date_trunc('month', gestao.add_dias_uteis(p_data, 1)) <> date_trunc('month', p_data);
  for r in select * from gestao.recorrentes where ativo and inicio <= p_data and (fim is null or fim >= p_data) loop
    if r.ultima_geracao is not distinct from p_data then continue; end if;
    if r.frequencia = 'semanal' then
      if not (extract(isodow from p_data)::int = any (coalesce(r.dias_semana, array[r.dia_semana]))) then continue; end if;
      v_semanas := ((date_trunc('week', p_data)::date - date_trunc('week', r.inicio)::date) / 7);
      if v_semanas % r.intervalo_semanas <> 0 then continue; end if;
    elsif r.frequencia = 'mensal' then
      if r.ultimo_dia_util then
        if not v_ultimo then continue; end if;
      elsif extract(day from p_data) < r.dia_mes
         or (r.ultima_geracao is not null and date_trunc('month', r.ultima_geracao) >= date_trunc('month', p_data)) then
        continue;
      end if;
    end if;
    v_prazo := gestao.add_dias_uteis(p_data, r.prazo_dias_uteis);
    -- ja existe a tarefa do dia (ex.: criada a partir do evento do Google com o mesmo nome)? Adota.
    select id, responsavel_id into v_id, v_resp from gestao.tarefas
    where arquivada_em is null and prazo = v_prazo and lower(trim(titulo)) = lower(trim(r.titulo))
      and cliente_id is not distinct from r.cliente_id
    order by (agenda_evento_id is not null) desc, criado_em limit 1;
    if found then
      update gestao.tarefas set recorrente_id = r.id, horario = coalesce(horario, r.horario) where id = v_id;
    else
      insert into gestao.tarefas (titulo, cliente_id, area_id, responsavel_id, bloco, notas, status, prazo, horario, criado_por, recorrente_id)
      values (r.titulo, r.cliente_id, r.area_id, r.responsavel_id, r.bloco, r.notas, 'a_fazer', v_prazo, r.horario, r.criado_por, r.id)
      returning id, responsavel_id into v_id, v_resp;
      if r.lancamento_id is not null then
        insert into gestao.tarefa_lancamentos (tarefa_id, lancamento_id) values (v_id, r.lancamento_id);
      end if;
    end if;
    insert into gestao.tarefa_responsaveis (tarefa_id, pessoa_id)
    select v_id, x from (select distinct unnest(array_append(r.responsaveis_extras, r.responsavel_id)) as x) e
    where x is distinct from v_resp
      and exists (select 1 from gestao.pessoas p where p.id = x and p.ativo)
      and not exists (select 1 from gestao.tarefa_responsaveis q where q.tarefa_id = v_id and q.pessoa_id = x);
    update gestao.recorrentes set ultima_geracao = p_data where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function gestao._gerar_recorrentes(date) from public, authenticated;

-- Agenda: a leitura passa a dizer se a tarefa e de uma recorrente; a atualizacao aceita ligar a tarefa ao evento
create or replace function gestao.srv_agenda_ler(p_de date, p_ate date) returns jsonb
language plpgsql stable security definer set search_path = gestao, public as $$
begin
  if not gestao.e_servico() then raise exception 'apenas servico'; end if;
  return jsonb_build_object(
    'tarefas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'titulo', t.titulo, 'prazo', t.prazo, 'horario', to_char(t.horario, 'HH24:MI'),
        'concluida', t.status = 'concluida', 'responsavel_id', t.responsavel_id,
        'responsavel_emails', coalesce((select jsonb_agg(a.email order by a.email) from gestao.pessoa_agenda_emails a where a.pessoa_id = t.responsavel_id), '[]'::jsonb),
        'agenda_evento_id', t.agenda_evento_id, 'recorrente_id', t.recorrente_id, 'criado_em', t.criado_em) order by t.prazo, t.horario)
      from gestao.tarefas t
      where t.arquivada_em is null and t.prazo between p_de and p_ate
        and (t.horario is not null or t.agenda_evento_id is not null)
    ), '[]'::jsonb),
    'equipe', coalesce((select jsonb_agg(jsonb_build_object('email', a.email, 'pessoa_id', a.pessoa_id)) from gestao.pessoa_agenda_emails a), '[]'::jsonb)
  );
end;
$$;

drop function if exists gestao.srv_agenda_atualizar(uuid, date, time, text);
create or replace function gestao.srv_agenda_atualizar(
  p_tarefa uuid, p_prazo date default null, p_horario time default null, p_titulo text default null, p_evento text default null
) returns uuid
language plpgsql security definer set search_path = gestao, public as $$
begin
  if not gestao.e_servico() then raise exception 'apenas servico'; end if;
  perform set_config('gestao.interno', '1', true);
  update gestao.tarefas
  set prazo = coalesce(p_prazo, prazo),
      horario = coalesce(p_horario, horario),
      titulo = coalesce(nullif(trim(p_titulo), ''), titulo),
      -- liga a tarefa ao evento do Google de mesmo nome (so se ainda nao tem ligacao e o evento esta livre)
      agenda_evento_id = case
        when nullif(trim(p_evento), '') is not null and agenda_evento_id is null
             and not exists (select 1 from gestao.tarefas o where o.agenda_evento_id = trim(p_evento))
        then trim(p_evento) else agenda_evento_id end
  where id = p_tarefa and arquivada_em is null and status <> 'concluida';
  return p_tarefa;
end;
$$;
revoke execute on function gestao.srv_agenda_ler(date, date) from public, anon, authenticated;
revoke execute on function gestao.srv_agenda_atualizar(uuid, date, time, text, text) from public, anon, authenticated;
grant execute on function gestao.srv_agenda_ler(date, date) to service_role;
grant execute on function gestao.srv_agenda_atualizar(uuid, date, time, text, text) to service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'gestao_n8n') then
    grant execute on function gestao.srv_agenda_ler(date, date) to gestao_n8n;
    grant execute on function gestao.srv_agenda_atualizar(uuid, date, time, text, text) to gestao_n8n;
  end if;
end $$;

-- As 4 recorrentes semanais que ja tem evento de mesmo nome no Google Agenda.
-- Pode rodar de novo: se a regra existe, acerta os responsaveis; se nao, cria.
-- Primeiro nome da lista = quem fica como responsavel principal; os demais viram co-responsaveis.
create or replace function pg_temp.pessoa(p_nome text) returns uuid language sql stable as $$
  select id from gestao.pessoas
  where lower(apelido) = lower(p_nome) or lower(split_part(nome, ' ', 1)) = lower(p_nome)
  order by (lower(apelido) = lower(p_nome)) desc limit 1
$$;

do $$
declare
  v record;
  v_resp uuid;
  v_extras uuid[];
  v_iza uuid := pg_temp.pessoa('Iza');
begin
  for v in select * from (values
    ('[GT] Weekly',               array['Iza','Isa','Bia','Jony'],                          1, '09:00'),
    ('[Copy] Weekly',             array['Isa','Raphael'],                                   1, '10:00'),
    ('[CS] Alinhamento Bia',      array['Isa','Bia'],                                       4, '10:00'),
    ('[EuforIA] Projeto Virgínia', array['Isa','Iza','Raphael','Jony','Bia','Rafael'],      4, '11:00')
  ) as t(titulo, quem, dia, hora) loop
    v_resp := pg_temp.pessoa(v.quem[1]);
    select coalesce(array_agg(x), '{}') into v_extras
    from (select pg_temp.pessoa(q) as x from unnest(v.quem[2:]) q) e where x is not null;
    if v_resp is null then raise exception 'nao achei a pessoa %', v.quem[1]; end if;
    if exists (select 1 from gestao.recorrentes r where lower(r.titulo) = lower(v.titulo)) then
      update gestao.recorrentes set responsavel_id = v_resp, responsaveis_extras = v_extras,
             dias_semana = array[v.dia], horario = v.hora::time, prazo_dias_uteis = 0, ativo = true
      where lower(titulo) = lower(v.titulo);
    else
      insert into gestao.recorrentes (titulo, responsavel_id, responsaveis_extras, frequencia, dias_semana, intervalo_semanas, prazo_dias_uteis, horario, inicio, criado_por)
      values (v.titulo, v_resp, v_extras, 'semanal', array[v.dia], 1, 0, v.hora::time, date '2026-11-30', v_iza);
    end if;
  end loop;
end $$;

-- Apaga a "[GT] Weekly" avulsa da Iza (30/11) que veio da importacao; a do Jony, ligada ao evento do Google, fica.
delete from gestao.tarefas
where lower(titulo) = '[gt] weekly' and prazo = date '2026-11-30'
  and responsavel_id = pg_temp.pessoa('Iza') and agenda_evento_id is null and recorrente_id is null
  and exists (select 1 from gestao.tarefas o where lower(o.titulo) = '[gt] weekly' and o.prazo = date '2026-11-30' and o.id <> tarefas.id);

select r.titulo, p.apelido as principal, cardinality(r.responsaveis_extras) as extras, r.dias_semana, r.horario
from gestao.recorrentes r join gestao.pessoas p on p.id = r.responsavel_id
where lower(r.titulo) in ('[gt] weekly', '[copy] weekly', '[cs] alinhamento bia', '[euforia] projeto virgínia') order by r.titulo;

select count(*) as recorrentes, count(*) filter (where cardinality(responsaveis_extras) > 0) as com_mais_de_um from gestao.recorrentes;
