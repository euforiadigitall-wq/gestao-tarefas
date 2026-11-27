-- 24: mais de um responsável por tarefa simples.
-- O responsável principal continua em tarefas.responsavel_id (nada do que já existe muda).
-- Os demais ficam em gestao.tarefa_responsaveis. Qualquer um dos responsáveis vê, edita, conclui e reabre;
-- concluir vale para todos. Só admin define quem são. Tarefa com esteira continua com uma pessoa por etapa.
-- Rodar depois do 23. Pode rodar de novo.

create table if not exists gestao.tarefa_responsaveis (
  tarefa_id uuid not null references gestao.tarefas (id) on delete cascade,
  pessoa_id uuid not null references gestao.pessoas (id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (tarefa_id, pessoa_id)
);
create index if not exists tarefa_responsaveis_pessoa_idx on gestao.tarefa_responsaveis (pessoa_id);
alter table gestao.tarefa_responsaveis enable row level security;

-- Responsável principal ou co-responsável (sem passar pela RLS, para a política da tarefa não entrar em ciclo)
create or replace function gestao.e_responsavel(p_tarefa uuid) returns boolean
language sql stable security definer set search_path = gestao, public as $$
  select exists (select 1 from gestao.tarefas t where t.id = p_tarefa and t.responsavel_id = auth.uid())
      or exists (select 1 from gestao.tarefa_responsaveis r where r.tarefa_id = p_tarefa and r.pessoa_id = auth.uid());
$$;
revoke execute on function gestao.e_responsavel(uuid) from public, anon;
grant execute on function gestao.e_responsavel(uuid) to authenticated;

-- Quem atua na tarefa (etapa ou co-responsável) passa a vê-la: isso alimenta tarefas_sel e pode_ver_tarefa
create or replace function gestao.atua_na_tarefa(p_tarefa uuid) returns boolean
language sql stable security definer set search_path = gestao, public as $$
  select exists (select 1 from gestao.tarefa_etapas e where e.tarefa_id = p_tarefa and e.responsavel_id = auth.uid())
      or exists (select 1 from gestao.tarefa_responsaveis r where r.tarefa_id = p_tarefa and r.pessoa_id = auth.uid());
$$;

drop policy if exists tarefa_responsaveis_sel on gestao.tarefa_responsaveis;
create policy tarefa_responsaveis_sel on gestao.tarefa_responsaveis for select to authenticated using (gestao.pode_ver_tarefa(tarefa_id));
drop policy if exists tarefa_responsaveis_adm on gestao.tarefa_responsaveis;
create policy tarefa_responsaveis_adm on gestao.tarefa_responsaveis for all to authenticated
  using (gestao.e_admin()) with check (gestao.e_admin());
grant select, insert, update, delete on gestao.tarefa_responsaveis to authenticated;

-- Editar a tarefa (descrição, prazo, links): principal, co-responsável ou admin. O trigger continua barrando troca de responsável por quem não é admin.
drop policy if exists tarefas_upd on gestao.tarefas;
create policy tarefas_upd on gestao.tarefas for update to authenticated
  using (gestao.e_admin() or responsavel_id = auth.uid() or gestao.e_responsavel(id))
  with check (gestao.e_admin() or responsavel_id = auth.uid() or gestao.e_responsavel(id));

-- Concluir e reabrir: qualquer responsável
create or replace function gestao.concluir_tarefa(p_tarefa uuid) returns void
language plpgsql security definer set search_path = gestao, public as $$
declare
  t gestao.tarefas%rowtype;
begin
  if not gestao.ativa() then raise exception 'sem acesso'; end if;
  perform set_config('gestao.interno', '1', true);
  select * into t from gestao.tarefas where id = p_tarefa and arquivada_em is null for update;
  if not found then raise exception 'tarefa nao encontrada'; end if;
  if t.etapa_atual is not null then raise exception 'tarefa com esteira: use avancar_etapa'; end if;
  if t.status = 'concluida' then raise exception 'tarefa ja concluida'; end if;
  if not gestao.e_responsavel(t.id) and not gestao.e_admin() then
    raise exception 'so o responsavel ou admin conclui';
  end if;
  update gestao.tarefas set status = 'concluida', concluida_em = now(), concluida_por = auth.uid() where id = t.id;
  insert into gestao.historico (tarefa_id, quem, acao) values (t.id, auth.uid(), 'concluiu');
end;
$$;

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
  if not gestao.e_responsavel(t.id) and not gestao.e_admin() then
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

-- Admin define os responsáveis além do principal. Avisa só quem entrou agora.
create or replace function gestao.definir_responsaveis(p_tarefa uuid, p_pessoas uuid[]) returns void
language plpgsql security definer set search_path = gestao, public as $$
declare
  t gestao.tarefas%rowtype;
  v_nova uuid;
begin
  if not gestao.e_admin() then raise exception 'apenas admin'; end if;
  select * into t from gestao.tarefas where id = p_tarefa and arquivada_em is null;
  if not found then raise exception 'tarefa nao encontrada'; end if;
  if t.etapa_atual is not null then raise exception 'tarefa com esteira tem uma pessoa por etapa'; end if;
  p_pessoas := array(select distinct x from unnest(coalesce(p_pessoas, '{}')) x
                     where x is distinct from t.responsavel_id and exists (select 1 from gestao.pessoas p where p.id = x and p.ativo));
  delete from gestao.tarefa_responsaveis where tarefa_id = t.id and pessoa_id <> all (p_pessoas);
  for v_nova in
    select x from unnest(p_pessoas) x where not exists (select 1 from gestao.tarefa_responsaveis r where r.tarefa_id = t.id and r.pessoa_id = x)
  loop
    insert into gestao.tarefa_responsaveis (tarefa_id, pessoa_id) values (t.id, v_nova);
    perform gestao._notificar(v_nova, 'atribuida', t.id, 'Nova tarefa para você: ' || t.titulo, jsonb_build_object('tarefa', t.titulo));
  end loop;
end;
$$;
revoke execute on function gestao.definir_responsaveis(uuid, uuid[]) from public, anon;
grant execute on function gestao.definir_responsaveis(uuid, uuid[]) to authenticated;

-- Quem mais é responsável: na view, no fim das colunas
create or replace view gestao.v_tarefas with (security_invoker = true) as
select t.id, t.titulo, t.cliente_id, t.area_id, t.entregavel_id, t.modelo_id, t.bloco, t.notas, t.responsavel_id,
       t.status, t.etapa_atual, t.estado_atual, t.prazo, t.depende_de, t.criado_por, t.criado_em, t.concluida_em,
       t.concluida_por, t.arquivada_em, t.arquivada_por,
       c.nome as cliente,
       a.nome as area,
       p.nome as responsavel,
       e.nome as proxima_acao,
       coalesce(e.prazo_previsto, t.prazo) as prazo_vez,
       (t.status <> 'concluida' and t.arquivada_em is null
        and coalesce(e.prazo_previsto, t.prazo) < current_date) as atrasada,
       gestao.etiquetas_tarefa(t.id) as lancamentos,
       array(select tl.lancamento_id from gestao.tarefa_lancamentos tl where tl.tarefa_id = t.id) as lancamento_ids,
       (select count(*)::int from gestao.tarefa_etapas te where te.tarefa_id = t.id) as etapas_total,
       t.horario,
       array(select r.pessoa_id from gestao.tarefa_responsaveis r where r.tarefa_id = t.id) as co_responsavel_ids,
       (select string_agg(pp.nome, ', ' order by pp.nome) from gestao.tarefa_responsaveis r join gestao.pessoas pp on pp.id = r.pessoa_id where r.tarefa_id = t.id) as co_responsaveis
from gestao.tarefas t
left join gestao.clientes c on c.id = t.cliente_id
left join gestao.areas a on a.id = t.area_id
left join gestao.pessoas p on p.id = t.responsavel_id
left join gestao.tarefa_etapas e on e.tarefa_id = t.id and e.ordem = t.etapa_atual;
grant select on gestao.v_tarefas to authenticated;

-- Resumo do dia também para os co-responsáveis
create or replace function gestao.gerar_resumo_diario(p_data date default current_date) returns int
language plpgsql security definer set search_path = gestao, public as $$
declare
  p record;
  v_hoje jsonb;
  v_atras jsonb;
  v_n int := 0;
begin
  if not gestao.e_servico() then raise exception 'apenas servico'; end if;
  if extract(isodow from p_data) >= 6 then return 0; end if;
  for p in select id from gestao.pessoas where ativo and avisos_resumo loop
    if exists (select 1 from gestao.notificacoes
               where pessoa_id = p.id and tipo = 'resumo_diario' and dados ->> 'data' = p_data::text) then
      continue;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('titulo', v.titulo, 'cliente', v.cliente, 'acao', v.proxima_acao, 'prazo', v.prazo_vez)
                              order by v.prazo_vez, v.titulo), '[]'::jsonb)
      into v_hoje
    from gestao.v_tarefas v
    where (v.responsavel_id = p.id or p.id = any (v.co_responsavel_ids)) and v.status <> 'concluida' and v.arquivada_em is null and v.prazo_vez = p_data;
    select coalesce(jsonb_agg(jsonb_build_object('titulo', v.titulo, 'cliente', v.cliente, 'acao', v.proxima_acao, 'prazo', v.prazo_vez)
                              order by v.prazo_vez, v.titulo), '[]'::jsonb)
      into v_atras
    from gestao.v_tarefas v
    where (v.responsavel_id = p.id or p.id = any (v.co_responsavel_ids)) and v.status <> 'concluida' and v.arquivada_em is null and v.prazo_vez < p_data;
    if jsonb_array_length(v_hoje) + jsonb_array_length(v_atras) > 0 then
      perform gestao._notificar(
        p.id, 'resumo_diario', null,
        'Seu dia: ' || jsonb_array_length(v_hoje) || ' para hoje, ' || jsonb_array_length(v_atras) || ' atrasadas',
        jsonb_build_object('data', p_data, 'hoje', v_hoje, 'atrasadas', v_atras)
      );
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;
revoke execute on function gestao.gerar_resumo_diario(date) from authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'gestao_n8n') then
    grant execute on function gestao.gerar_resumo_diario(date) to gestao_n8n;
  end if;
end $$;

-- As 12 tarefas que no ClickUp estavam com Isa e Bia (importadas com a nota abaixo) ganham a Bia como segunda responsável
insert into gestao.tarefa_responsaveis (tarefa_id, pessoa_id)
select t.id, b.id
from gestao.tarefas t
join gestao.pessoas i on i.id = t.responsavel_id and lower(i.apelido) = 'isa'
join gestao.pessoas b on lower(b.apelido) = 'bia'
where t.notas = 'No ClickUp estava com Isa e Bia.' and t.etapa_atual is null and t.arquivada_em is null
on conflict do nothing;

select count(*) as tarefas_com_segundo_responsavel from gestao.tarefa_responsaveis;
