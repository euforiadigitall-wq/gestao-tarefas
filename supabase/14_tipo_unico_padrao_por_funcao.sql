-- 14: tipo único de tarefa, responsável padrão por função e membros escolhendo o tipo.
-- 1) gestao.papel_padrao: quem faz cada função quando ninguém escolhe (vale também para cliente avulso).
-- 2) criar_tarefa_de_modelo passa a usar, nesta ordem: responsável fixo do modelo, escolha na hora (só admin),
--    papel salvo do cliente, padrão da função.
-- 3) Membro pode criar peça a partir de um tipo: não escolhe pessoas, as etapas vão para os padrões. Só com
--    cliente que ele pode ver. Quem cria sempre enxerga a peça.
-- 4) Tipos novos: "Site" (Fazer, Revisar; Revisar devolvido volta para Fazer até aprovar) e "Calendário editorial".
-- Rodar depois do 13. Pode rodar de novo.

create table if not exists gestao.papel_padrao (
  papel text primary key,
  pessoa_id uuid not null references gestao.pessoas (id) on delete cascade
);
alter table gestao.papel_padrao enable row level security;
drop policy if exists papel_padrao_sel on gestao.papel_padrao;
create policy papel_padrao_sel on gestao.papel_padrao for select to authenticated using (gestao.ativa());
drop policy if exists papel_padrao_adm on gestao.papel_padrao;
create policy papel_padrao_adm on gestao.papel_padrao for all to authenticated
  using (gestao.e_admin()) with check (gestao.e_admin());
grant select, insert, update, delete on gestao.papel_padrao to authenticated;

-- Valores iniciais (ajustáveis em Admin > Papéis). Só entram se a função ainda não tem padrão.
insert into gestao.papel_padrao (papel, pessoa_id)
select x.papel, p.id
from (values ('site', 'rafael%dev%'), ('dev', 'rafael%dev%'), ('aprovador', 'iza%'), ('calendario', 'rapha%')) as x(papel, padrao)
cross join lateral (
  select id from gestao.pessoas where ativo and nome ilike x.padrao order by nome limit 1
) p
on conflict (papel) do nothing;

drop function if exists gestao.criar_tarefa_de_modelo(text, uuid, uuid, uuid, uuid, text, jsonb);
create or replace function gestao.criar_tarefa_de_modelo(
  p_titulo text, p_cliente uuid, p_modelo uuid,
  p_area uuid default null, p_entregavel uuid default null, p_bloco text default null,
  p_responsaveis jsonb default '{}'::jsonb, p_notas text default null
) returns uuid
language plpgsql security definer set search_path = gestao, public as $$
declare
  v_id uuid;
  v_primeira int;
  v_faltam text;
  v_adm boolean := gestao.e_admin() or gestao.e_servico();
  v_resp jsonb := coalesce(p_responsaveis, '{}'::jsonb);
begin
  if not v_adm then
    if not gestao.ativa() then
      raise exception 'sem permissao';
    end if;
    -- membro nao escolhe pessoas: as etapas seguem os padroes
    v_resp := '{}'::jsonb;
    if p_cliente is not null and not gestao.pode_ver(p_cliente, p_area) then
      raise exception 'voce nao tem acesso a esse cliente';
    end if;
    if p_entregavel is not null or nullif(p_bloco, '') is not null then
      raise exception 'apenas admin usa entregavel e bloco';
    end if;
  end if;
  if p_cliente is not null and p_area is null then
    raise exception 'escolha a area do cliente';
  end if;
  perform set_config('gestao.interno', '1', true);
  select min(ordem) into v_primeira from gestao.modelos_etapa where modelo_id = p_modelo;
  if v_primeira is null then
    raise exception 'modelo sem etapas';
  end if;

  select string_agg(distinct me.papel, ', ') into v_faltam
  from gestao.modelos_etapa me
  where me.modelo_id = p_modelo and me.responsavel_padrao is null
    and nullif(v_resp ->> me.papel, '') is null
    and not exists (select 1 from gestao.cliente_papeis cp where cp.cliente_id = p_cliente and cp.papel = me.papel)
    and not exists (select 1 from gestao.papel_padrao pp join gestao.pessoas pe on pe.id = pp.pessoa_id and pe.ativo where pp.papel = me.papel);
  if v_faltam is not null then
    raise exception 'defina quem faz o papel: %', v_faltam;
  end if;

  insert into gestao.tarefas (titulo, cliente_id, area_id, modelo_id, entregavel_id, bloco,
                              status, etapa_atual, criado_por, notas)
  values (p_titulo, p_cliente, p_area, p_modelo, p_entregavel, p_bloco,
          'em_andamento', v_primeira, auth.uid(), nullif(left(p_notas, 600), ''))
  returning id into v_id;

  insert into gestao.tarefa_etapas (tarefa_id, ordem, nome, estado, responsavel_id, sla_dias_uteis)
  select v_id, me.ordem, me.nome, me.estado,
         coalesce(me.responsavel_padrao, nullif(v_resp ->> me.papel, '')::uuid, cp.pessoa_id, pp.pessoa_id),
         me.sla_dias_uteis
  from gestao.modelos_etapa me
  left join gestao.cliente_papeis cp on cp.cliente_id = p_cliente and cp.papel = me.papel
  left join (select pp.papel, pp.pessoa_id from gestao.papel_padrao pp join gestao.pessoas pe on pe.id = pp.pessoa_id and pe.ativo) pp
         on pp.papel = me.papel
  where me.modelo_id = p_modelo;

  update gestao.tarefa_etapas set iniciada_em = now() where tarefa_id = v_id and ordem = v_primeira;
  update gestao.tarefas
  set responsavel_id = (select responsavel_id from gestao.tarefa_etapas where tarefa_id = v_id and ordem = v_primeira)
  where id = v_id;
  perform gestao._recalcular_prazos(v_id);
  insert into gestao.historico (tarefa_id, quem, acao, para_etapa) values (v_id, auth.uid(), 'criou', v_primeira);
  return v_id;
end;
$$;
revoke execute on function gestao.criar_tarefa_de_modelo(text, uuid, uuid, uuid, uuid, text, jsonb, text) from public, anon;
grant execute on function gestao.criar_tarefa_de_modelo(text, uuid, uuid, uuid, uuid, text, jsonb, text) to authenticated, service_role;

-- Tipos novos
do $$
declare m uuid;
begin
  insert into gestao.modelos_peca (nome) values ('Site') on conflict (nome) do nothing;
  select id into m from gestao.modelos_peca where nome = 'Site';
  insert into gestao.modelos_etapa (modelo_id, ordem, nome, estado, papel, sla_dias_uteis) values
    (m, 1, 'Fazer',   'Feito',    'site',      1),
    (m, 2, 'Revisar', 'Aprovado', 'aprovador', 1)
    on conflict (modelo_id, ordem) do nothing;

  insert into gestao.modelos_peca (nome) values ('Calendário editorial') on conflict (nome) do nothing;
  select id into m from gestao.modelos_peca where nome = 'Calendário editorial';
  insert into gestao.modelos_etapa (modelo_id, ordem, nome, estado, papel, sla_dias_uteis) values
    (m, 1, 'Criar',   'Criado',   'calendario', 1),
    (m, 2, 'Revisar', 'Revisado', 'aprovador',  1),
    (m, 3, 'Aprovar', 'Aprovado', 'aprovador',  1)
    on conflict (modelo_id, ordem) do nothing;
end $$;

select nome from gestao.modelos_peca order by nome;
