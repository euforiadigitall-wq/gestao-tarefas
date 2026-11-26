-- 10: recorrentes personalizadas. Rodar depois do 09. Pode rodar mais de uma vez.
-- Quem gera as tarefas continua sendo o fluxo das 8h do n8n (gerar_recorrentes).

alter table gestao.recorrentes
  add column if not exists dias_semana int[],
  add column if not exists intervalo_semanas int not null default 1,
  add column if not exists ultimo_dia_util boolean not null default false,
  add column if not exists lancamento_id uuid references gestao.lancamentos (id) on delete set null,
  add column if not exists inicio date not null default current_date,
  add column if not exists fim date;

alter table gestao.recorrentes drop constraint if exists recorrentes_intervalo_check;
alter table gestao.recorrentes add constraint recorrentes_intervalo_check check (intervalo_semanas between 1 and 8);

-- A regra antiga exigia dia_semana; agora a semanal usa a lista dias_semana (1 = segunda ... 5 = sexta)
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'gestao.recorrentes'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%dia_semana IS NOT NULL%' loop
    execute format('alter table gestao.recorrentes drop constraint %I', c);
  end loop;
end $$;
update gestao.recorrentes set dias_semana = array[dia_semana] where dias_semana is null and dia_semana is not null;
alter table gestao.recorrentes drop constraint if exists recorrentes_regra_check;
alter table gestao.recorrentes add constraint recorrentes_regra_check check (
  (frequencia <> 'semanal' or coalesce(array_length(dias_semana, 1), 0) > 0)
  and (frequencia <> 'mensal' or ultimo_dia_util or dia_mes is not null)
  and (dias_semana is null or dias_semana <@ array[1,2,3,4,5])
  and (fim is null or fim >= inicio)
);

-- Gera as tarefas do dia. Interna: quem chama confere a permissao.
create or replace function gestao._gerar_recorrentes(p_data date) returns int
language plpgsql security definer set search_path = gestao, public as $$
declare
  r gestao.recorrentes%rowtype;
  v_n int := 0;
  v_id uuid;
  v_semanas int;
  v_ultimo boolean;
begin
  if extract(isodow from p_data) >= 6 then
    return 0;
  end if;
  perform set_config('gestao.silencioso', '1', true);
  -- o dia seguinte util cai em outro mes? entao hoje e o ultimo dia util do mes
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
    insert into gestao.tarefas (titulo, cliente_id, area_id, responsavel_id, bloco, notas, status, prazo, criado_por)
    values (r.titulo, r.cliente_id, r.area_id, r.responsavel_id, r.bloco, r.notas, 'a_fazer',
            gestao.add_dias_uteis(p_data, r.prazo_dias_uteis), r.criado_por)
    returning id into v_id;
    if r.lancamento_id is not null then
      insert into gestao.tarefa_lancamentos (tarefa_id, lancamento_id) values (v_id, r.lancamento_id);
    end if;
    update gestao.recorrentes set ultima_geracao = p_data where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

create or replace function gestao.gerar_recorrentes(p_data date default current_date) returns int
language plpgsql security definer set search_path = gestao, public as $$
begin
  if not gestao.e_servico() then raise exception 'apenas servico'; end if;
  return gestao._gerar_recorrentes(p_data);
end;
$$;

-- Botao "gerar as de hoje agora" para admin (nao duplica: cada recorrente gera no maximo uma vez por dia)
create or replace function gestao.gerar_recorrentes_agora() returns int
language plpgsql security definer set search_path = gestao, public as $$
begin
  if not gestao.e_admin() then raise exception 'apenas admin'; end if;
  return gestao._gerar_recorrentes((now() at time zone 'America/Sao_Paulo')::date);
end;
$$;

revoke execute on function gestao._gerar_recorrentes(date) from public, authenticated;
revoke execute on function gestao.gerar_recorrentes(date) from authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'gestao_n8n') then
    grant execute on function gestao.gerar_recorrentes(date) to gestao_n8n;
  end if;
end $$;
grant execute on function gestao.gerar_recorrentes_agora() to authenticated;

select count(*) as recorrentes from gestao.recorrentes;
