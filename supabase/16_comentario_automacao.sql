-- 16: automações (n8n) comentam e acham tarefas no sistema novo, no lugar do ClickUp.
-- - Comentário de automação: sem autor pessoa, com nome da automação (ex.: "Pré-análise do diagnóstico").
-- - gestao.srv_comentar(tarefa, texto, automacao): só serviço (gestao_n8n). Avisa o responsável como qualquer comentário.
-- - gestao.srv_achar_tarefa(titulo, so_abertas): devolve o id da tarefa com esse título exato (a mais recente).
-- Criar tarefas por automação já existe: gestao.importar_tarefas(itens, true, true).
-- Rodar depois do 15. Pode rodar de novo.

alter table gestao.comentarios alter column autor_id drop not null;
alter table gestao.comentarios add column if not exists automacao text;
alter table gestao.comentarios drop constraint if exists comentarios_autor_ck;
alter table gestao.comentarios add constraint comentarios_autor_ck check (autor_id is not null or automacao is not null);

create or replace function gestao.srv_comentar(p_tarefa uuid, p_texto text, p_automacao text default 'Automação')
returns uuid
language plpgsql security definer set search_path = gestao, public as $$
declare
  v_id uuid;
  t gestao.tarefas%rowtype;
begin
  if not gestao.e_servico() then
    raise exception 'apenas servico';
  end if;
  select * into t from gestao.tarefas where id = p_tarefa;
  if not found then
    raise exception 'tarefa nao encontrada';
  end if;
  insert into gestao.comentarios (tarefa_id, autor_id, automacao, texto)
  values (p_tarefa, null, left(coalesce(nullif(trim(p_automacao), ''), 'Automação'), 80), p_texto)
  returning id into v_id;
  if t.responsavel_id is not null then
    perform gestao._notificar(t.responsavel_id, 'comentario', p_tarefa, 'Novo comentário em: ' || t.titulo,
      jsonb_build_object('titulo', t.titulo, 'texto', left(p_texto, 300), 'por', coalesce(nullif(trim(p_automacao), ''), 'Automação')));
  end if;
  return v_id;
end;
$$;
revoke execute on function gestao.srv_comentar(uuid, text, text) from public, anon, authenticated;
grant execute on function gestao.srv_comentar(uuid, text, text) to service_role;

create or replace function gestao.srv_achar_tarefa(p_titulo text, p_so_abertas boolean default true)
returns uuid
language plpgsql stable security definer set search_path = gestao, public as $$
declare
  v_id uuid;
begin
  if not gestao.e_servico() then
    raise exception 'apenas servico';
  end if;
  select id into v_id from gestao.tarefas
  where titulo = p_titulo and arquivada_em is null
    and (not p_so_abertas or status <> 'concluida')
  order by criado_em desc limit 1;
  return v_id;
end;
$$;
revoke execute on function gestao.srv_achar_tarefa(text, boolean) from public, anon, authenticated;
grant execute on function gestao.srv_achar_tarefa(text, boolean) to service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'gestao_n8n') then
    grant execute on function gestao.srv_comentar(uuid, text, text) to gestao_n8n;
    grant execute on function gestao.srv_achar_tarefa(text, boolean) to gestao_n8n;
    grant execute on function gestao.importar_tarefas(jsonb, boolean, boolean) to gestao_n8n;
  end if;
end $$;

select 'ok' as resultado;
