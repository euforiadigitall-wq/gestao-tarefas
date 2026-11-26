-- 09: area Projeto, reabrir tarefa concluida, excluir tarefa e lancamento.
-- Rodar depois do 08. Pode rodar mais de uma vez.

insert into gestao.areas (codigo, nome) values ('projetos', 'Projeto')
on conflict (codigo) do nothing;

-- O historico passa a aceitar 'reabriu'
do $$
declare c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'gestao.historico'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%avancou%';
  if c is not null then execute format('alter table gestao.historico drop constraint %I', c); end if;
  alter table gestao.historico add constraint historico_acao_check
    check (acao in ('criou', 'avancou', 'devolveu', 'concluiu', 'concluiu_em_massa', 'arquivou', 'restaurou', 'reabriu'));
end $$;

-- Desfazer a conclusao: tarefa simples volta para "a fazer"; peca com esteira volta para a ultima etapa
create or replace function gestao.reabrir_tarefa(p_tarefa uuid) returns void
language plpgsql security definer set search_path = gestao, public as $$
declare
  t gestao.tarefas%rowtype;
begin
  if not gestao.ativa() then raise exception 'sem acesso'; end if;
  perform set_config('gestao.interno', '1', true);
  select * into t from gestao.tarefas where id = p_tarefa for update;
  if not found or not gestao.pode_ver_tarefa(t.id) then raise exception 'tarefa nao encontrada'; end if;
  if t.status <> 'concluida' then raise exception 'tarefa nao esta concluida'; end if;
  if t.responsavel_id is distinct from auth.uid() and not gestao.e_admin() then
    raise exception 'so o responsavel ou admin reabre';
  end if;
  if t.etapa_atual is null then
    update gestao.tarefas set status = 'a_fazer', concluida_em = null, concluida_por = null where id = t.id;
  else
    update gestao.tarefa_etapas set concluida_em = null, concluida_por = null, iniciada_em = now()
    where tarefa_id = t.id and ordem = t.etapa_atual;
    update gestao.tarefas
    set status = 'em_andamento', concluida_em = null, concluida_por = null,
        estado_atual = coalesce((select estado from gestao.tarefa_etapas
                                 where tarefa_id = t.id and ordem < t.etapa_atual order by ordem desc limit 1), 'Na fila')
    where id = t.id;
    perform gestao._recalcular_prazos(t.id);
  end if;
  insert into gestao.historico (tarefa_id, quem, acao, de_etapa) values (t.id, auth.uid(), 'reabriu', t.etapa_atual);
end;
$$;

-- Excluir de vez (so admin). Etapas, links, comentarios e historico saem junto.
create or replace function gestao.excluir_tarefa(p_tarefa uuid) returns void
language plpgsql security definer set search_path = gestao, public as $$
begin
  if not gestao.e_admin() then raise exception 'apenas admin'; end if;
  delete from gestao.tarefas where id = p_tarefa;
  if not found then raise exception 'tarefa nao encontrada'; end if;
end;
$$;

-- Excluir um lancamento inteiro, com as tarefas dos entregaveis. Devolve quantas tarefas sairam.
create or replace function gestao.excluir_lancamento(p_lancamento uuid) returns int
language plpgsql security definer set search_path = gestao, public as $$
declare n int;
begin
  if not gestao.e_admin() then raise exception 'apenas admin'; end if;
  delete from gestao.tarefas t
  where t.entregavel_id in (
    select e.id from gestao.entregaveis e
    join gestao.lancamento_etapas le on le.id = e.lancamento_etapa_id
    where le.lancamento_id = p_lancamento
  );
  get diagnostics n = row_count;
  delete from gestao.lancamentos where id = p_lancamento;
  if not found then raise exception 'lancamento nao encontrado'; end if;
  return n;
end;
$$;

-- Excluir um entregavel e a tarefa dele
create or replace function gestao.excluir_entregavel(p_entregavel uuid) returns void
language plpgsql security definer set search_path = gestao, public as $$
begin
  if not gestao.e_admin() then raise exception 'apenas admin'; end if;
  delete from gestao.tarefas where entregavel_id = p_entregavel;
  delete from gestao.entregaveis where id = p_entregavel;
  if not found then raise exception 'entregavel nao encontrado'; end if;
end;
$$;

grant execute on function gestao.reabrir_tarefa(uuid), gestao.excluir_tarefa(uuid),
  gestao.excluir_lancamento(uuid), gestao.excluir_entregavel(uuid) to authenticated;

select codigo, nome from gestao.areas order by nome;
