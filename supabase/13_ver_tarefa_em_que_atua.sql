-- 13: quem tem uma etapa numa tarefa passa a ver a tarefa inteira, mesmo quando a vez é de outra pessoa.
-- Antes, o dev de um "Site extra" avulso deixava de ver a peça enquanto ela estava com a Iza na revisão,
-- e não via a peça "na fila" antes da etapa dele. Quem não atua na tarefa continua sem ver.
-- Só leitura: quem não é a vez continua sem poder alterar a tarefa. Rodar depois do 12.

create or replace function gestao.atua_na_tarefa(p_tarefa uuid) returns boolean
language sql stable security definer set search_path = gestao, public as $$
  select exists (select 1 from gestao.tarefa_etapas e where e.tarefa_id = p_tarefa and e.responsavel_id = auth.uid());
$$;
revoke execute on function gestao.atua_na_tarefa(uuid) from public, anon;
grant execute on function gestao.atua_na_tarefa(uuid) to authenticated;

drop policy if exists tarefas_sel on gestao.tarefas;
create policy tarefas_sel on gestao.tarefas for select to authenticated using (
  gestao.ativa() and (
    gestao.e_admin()
    or responsavel_id = auth.uid()
    or criado_por = auth.uid()
    or gestao.atua_na_tarefa(id)
    or (cliente_id is not null and gestao.pode_ver(cliente_id, area_id))
  )
);

create or replace function gestao.pode_ver_tarefa(p_tarefa uuid) returns boolean
language sql stable security definer set search_path = gestao, public as $$
  select gestao.ativa() and exists (
    select 1 from gestao.tarefas t
    where t.id = p_tarefa
      and (gestao.e_admin()
           or t.responsavel_id = auth.uid()
           or t.criado_por = auth.uid()
           or gestao.atua_na_tarefa(t.id)
           or (t.cliente_id is not null and gestao.pode_ver(t.cliente_id, t.area_id)))
  );
$$;
