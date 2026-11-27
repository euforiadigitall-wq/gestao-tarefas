-- 33: passar uma tarefa para outra pessoa (admin). Troca o responsável principal.
-- Só tarefa simples (a esteira tem uma pessoa por etapa), aberta e não pessoal. Rodar depois do 32 (ou do 31, se o 32 não existir).
-- p_manter_antigo = true deixa quem passou como co-responsável; false (padrão) tira da tarefa.

create or replace function gestao.transferir_tarefa(p_tarefa uuid, p_para uuid, p_manter_antigo boolean default false) returns void
language plpgsql security definer set search_path = gestao, public as $$
declare
  t gestao.tarefas%rowtype;
  v_antigo uuid;
begin
  if not gestao.e_admin() then raise exception 'apenas admin'; end if;
  select * into t from gestao.tarefas
   where id = p_tarefa and arquivada_em is null and status <> 'concluida' and not pessoal;
  if not found then raise exception 'tarefa nao encontrada'; end if;
  if t.etapa_atual is not null then raise exception 'tarefa com esteira tem uma pessoa por etapa'; end if;
  if p_para is null or not exists (select 1 from gestao.pessoas p where p.id = p_para and p.ativo) then
    raise exception 'a pessoa que vai receber precisa estar ativa';
  end if;
  if p_para = t.responsavel_id then return; end if;

  v_antigo := t.responsavel_id;
  perform set_config('gestao.silencioso', '1', true);
  perform set_config('gestao.interno', '1', true);
  update gestao.tarefas set responsavel_id = p_para where id = t.id;
  delete from gestao.tarefa_responsaveis where tarefa_id = t.id and pessoa_id = p_para;
  if p_manter_antigo and v_antigo is not null then
    insert into gestao.tarefa_responsaveis (tarefa_id, pessoa_id)
    select t.id, v_antigo
    where not exists (select 1 from gestao.tarefa_responsaveis r where r.tarefa_id = t.id and r.pessoa_id = v_antigo);
  end if;
  perform set_config('gestao.silencioso', '0', true);
  perform set_config('gestao.interno', '0', true);

  perform gestao._notificar(p_para, 'atribuida', t.id, 'Tarefa passada para você: ' || t.titulo,
                            jsonb_build_object('tarefa', t.titulo, 'por', (select nome from gestao.pessoas where id = auth.uid())));
end;
$$;
revoke execute on function gestao.transferir_tarefa(uuid, uuid, boolean) from public, anon;
grant execute on function gestao.transferir_tarefa(uuid, uuid, boolean) to authenticated;
