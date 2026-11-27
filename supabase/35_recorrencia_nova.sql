-- 35: recorrência como no ClickUp. Rodar depois do 34.
--  1) Mensal por dia da semana: "toda última terça do mês", "primeira segunda", etc. (a última pega mês de 4 ou de 5 semanas)
--  2) A cada N dias corridos (ex.: regar a planta a cada 10 dias), contando do dia de início, inclusive fim de semana
--  3) Prazo em dias corridos em vez de úteis (opção por regra)
-- Dia útil continua sendo o padrão de tudo que já existe. O gerador roda de segunda a sexta, às 8h:
-- se a data cai no sábado ou domingo, a tarefa é gerada na sexta anterior, com o prazo no sábado ou domingo.
-- Pode rodar de novo.

alter table gestao.recorrentes
  add column if not exists intervalo_dias int,
  add column if not exists mensal_semana int,
  add column if not exists mensal_dia_semana int,
  add column if not exists prazo_corridos boolean not null default false,
  add column if not exists ultima_ocorrencia date;

do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'gestao.recorrentes'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%diaria_util%' loop
    execute format('alter table gestao.recorrentes drop constraint %I', c);
  end loop;
end $$;
alter table gestao.recorrentes add constraint recorrentes_frequencia_check
  check (frequencia in ('diaria_util', 'semanal', 'mensal', 'a_cada_n_dias'));

alter table gestao.recorrentes drop constraint if exists recorrentes_regra_check;
alter table gestao.recorrentes add constraint recorrentes_regra_check check (
  (frequencia <> 'semanal' or coalesce(array_length(dias_semana, 1), 0) > 0)
  and (frequencia <> 'mensal' or ultimo_dia_util or dia_mes is not null
       or (mensal_semana is not null and mensal_dia_semana is not null))
  and (frequencia <> 'a_cada_n_dias' or coalesce(intervalo_dias between 1 and 365, false))
  and (mensal_semana is null or mensal_semana between 1 and 5)
  and (mensal_dia_semana is null or mensal_dia_semana between 1 and 7)
  and (dias_semana is null or dias_semana <@ array[1, 2, 3, 4, 5])
  and (fim is null or fim >= inicio)
);

-- mensal_semana: 1 a 4 = primeira a quarta; 5 = última. mensal_dia_semana: 1 = segunda ... 7 = domingo.
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
  v_datas date[];
  v_d date;
  v_cand date;
  v_ok boolean;
begin
  if extract(isodow from p_data) >= 6 then
    return 0;
  end if;
  perform set_config('gestao.silencioso', '1', true);
  v_ultimo := date_trunc('month', gestao.add_dias_uteis(p_data, 1)) <> date_trunc('month', p_data);
  for r in select * from gestao.recorrentes
           where ativo and inicio <= p_data + 2 and (fim is null or fim >= p_data) loop
    if r.ultima_geracao is not distinct from p_data then continue; end if;
    v_datas := '{}';

    if r.frequencia = 'a_cada_n_dias' or (r.frequencia = 'mensal' and r.mensal_semana is not null) then
      -- datas corridas: na sexta, olha também sábado e domingo
      for v_cand in select p_data + g from generate_series(0, case when extract(isodow from p_data) = 5 then 2 else 0 end) g loop
        if v_cand < r.inicio or (r.fim is not null and v_cand > r.fim) then continue; end if;
        if r.ultima_ocorrencia is not null and v_cand <= r.ultima_ocorrencia then continue; end if;
        if r.frequencia = 'a_cada_n_dias' then
          v_ok := (v_cand - r.inicio) % r.intervalo_dias = 0;
        else
          v_ok := extract(isodow from v_cand)::int = r.mensal_dia_semana
                  and (case when r.mensal_semana between 1 and 4
                            then ((extract(day from v_cand)::int - 1) / 7 + 1) = r.mensal_semana
                            else date_trunc('month', v_cand + 7) <> date_trunc('month', v_cand) end);
        end if;
        if v_ok then v_datas := v_datas || v_cand; end if;
      end loop;
    else
      if r.inicio > p_data then continue; end if;
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
      v_datas := array[p_data];
    end if;

    if coalesce(array_length(v_datas, 1), 0) = 0 then continue; end if;

    foreach v_d in array v_datas loop
      v_prazo := case when r.prazo_corridos then v_d + r.prazo_dias_uteis
                      else gestao.add_dias_uteis(v_d, r.prazo_dias_uteis) end;
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
    end loop;

    update gestao.recorrentes set ultima_geracao = p_data, ultima_ocorrencia = v_datas[array_upper(v_datas, 1)] where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function gestao._gerar_recorrentes(date) from public, authenticated;

select frequencia, count(*) as regras from gestao.recorrentes group by frequencia;
