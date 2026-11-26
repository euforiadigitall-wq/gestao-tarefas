-- 11: a view de tarefas passa a trazer quantas etapas a peca tem (para a linha de etapas). Rodar depois do 10.
create or replace view gestao.v_tarefas with (security_invoker = true) as
select t.*,
       c.nome as cliente,
       a.nome as area,
       p.nome as responsavel,
       e.nome as proxima_acao,
       coalesce(e.prazo_previsto, t.prazo) as prazo_vez,
       (t.status <> 'concluida' and t.arquivada_em is null
        and coalesce(e.prazo_previsto, t.prazo) < current_date) as atrasada,
       gestao.etiquetas_tarefa(t.id) as lancamentos,
       array(select tl.lancamento_id from gestao.tarefa_lancamentos tl where tl.tarefa_id = t.id) as lancamento_ids,
       (select count(*)::int from gestao.tarefa_etapas te where te.tarefa_id = t.id) as etapas_total
from gestao.tarefas t
left join gestao.clientes c on c.id = t.cliente_id
left join gestao.areas a on a.id = t.area_id
left join gestao.pessoas p on p.id = t.responsavel_id
left join gestao.tarefa_etapas e on e.tarefa_id = t.id and e.ordem = t.etapa_atual;

grant select on gestao.v_tarefas to authenticated;
select count(*) as tarefas from gestao.v_tarefas;
