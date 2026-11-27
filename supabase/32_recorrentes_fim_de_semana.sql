-- Recorrentes tambem no fim de semana.
-- 1) A regra "Dias da semana" passa a aceitar 6 (sabado) e 7 (domingo).
-- 2) O gerador deixa de sair cedo no fim de semana: nesses dias gera so as regras semanais que marcaram o dia.
--    "Todo dia util" e "Todo mes" continuam sem gerar sabado e domingo.
-- 3) Prazo: segue em dias uteis a partir do dia da geracao (0 = no proprio dia, inclusive sabado ou domingo).
alter table gestao.recorrentes drop constraint if exists recorrentes_regra_check;
alter table gestao.recorrentes add constraint recorrentes_regra_check check (
  (frequencia <> 'semanal' or coalesce(array_length(dias_semana, 1), 0) > 0)
  and (frequencia <> 'mensal' or ultimo_dia_util or dia_mes is not null)
  and (dias_semana is null or dias_semana <@ array[1,2,3,4,5,6,7])
  and (fim is null or fim >= inicio)
);

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
  v_fds boolean;
begin
  v_fds := extract(isodow from p_data) >= 6;
  perform set_config('gestao.silencioso', '1', true);
  v_ultimo := date_trunc('month', gestao.add_dias_uteis(p_data, 1)) <> date_trunc('month', p_data);
  for r in select * from gestao.recorrentes where ativo and inicio <= p_data and (fim is null or fim >= p_data) loop
    if r.ultima_geracao is not distinct from p_data then continue; end if;
    -- sabado e domingo: so gera as regras de dias da semana que marcaram esse dia
    if v_fds and r.frequencia <> 'semanal' then continue; end if;
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
