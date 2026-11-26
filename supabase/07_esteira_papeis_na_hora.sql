-- Papéis na hora de criar a peça, não fixos por cliente.
-- Agora criar_tarefa_de_modelo recebe quem faz cada função (p_responsaveis) e aceita
-- cliente avulso (sem cadastro). Papéis salvos em Admin > Papéis continuam valendo como
-- sugestão, mas não são mais obrigatórios. Rode depois do 06. Pode rodar de novo.

drop function if exists gestao.criar_tarefa_de_modelo(text, uuid, uuid, uuid, uuid, text);

create or replace function gestao.criar_tarefa_de_modelo(
  p_titulo text, p_cliente uuid, p_modelo uuid,
  p_area uuid default null, p_entregavel uuid default null, p_bloco text default null,
  p_responsaveis jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = gestao, public as $$
declare
  v_id uuid;
  v_primeira int;
  v_faltam text;
begin
  if not (gestao.e_admin() or gestao.e_servico()) then
    raise exception 'apenas admin cria tarefa com esteira';
  end if;
  if p_cliente is not null and p_area is null then
    raise exception 'escolha a area do cliente';
  end if;
  perform set_config('gestao.interno', '1', true);
  select min(ordem) into v_primeira from gestao.modelos_etapa where modelo_id = p_modelo;
  if v_primeira is null then
    raise exception 'modelo sem etapas';
  end if;

  -- ordem de decisao: responsavel fixo do modelo, escolha na hora, papel salvo do cliente
  select string_agg(distinct me.papel, ', ') into v_faltam
  from gestao.modelos_etapa me
  where me.modelo_id = p_modelo and me.responsavel_padrao is null
    and nullif(p_responsaveis ->> me.papel, '') is null
    and not exists (select 1 from gestao.cliente_papeis cp where cp.cliente_id = p_cliente and cp.papel = me.papel);
  if v_faltam is not null then
    raise exception 'defina quem faz o papel: %', v_faltam;
  end if;

  insert into gestao.tarefas (titulo, cliente_id, area_id, modelo_id, entregavel_id, bloco,
                              status, etapa_atual, criado_por)
  values (p_titulo, p_cliente, p_area, p_modelo, p_entregavel, p_bloco,
          'em_andamento', v_primeira, auth.uid())
  returning id into v_id;

  insert into gestao.tarefa_etapas (tarefa_id, ordem, nome, estado, responsavel_id, sla_dias_uteis)
  select v_id, me.ordem, me.nome, me.estado,
         coalesce(me.responsavel_padrao, nullif(p_responsaveis ->> me.papel, '')::uuid, cp.pessoa_id),
         me.sla_dias_uteis
  from gestao.modelos_etapa me
  left join gestao.cliente_papeis cp on cp.cliente_id = p_cliente and cp.papel = me.papel
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

revoke execute on function gestao.criar_tarefa_de_modelo(text, uuid, uuid, uuid, uuid, text, jsonb) from public, anon;
grant execute on function gestao.criar_tarefa_de_modelo(text, uuid, uuid, uuid, uuid, text, jsonb) to authenticated, service_role;

-- Peças de site feitas pelo dev, para cliente avulso ou cadastrado
do $$
declare
  m uuid;
begin
  insert into gestao.modelos_peca (nome) values ('Site extra') on conflict (nome) do nothing;
  select id into m from gestao.modelos_peca where nome = 'Site extra';
  insert into gestao.modelos_etapa (modelo_id, ordem, nome, estado, papel, sla_dias_uteis) values
    (m, 1, 'Desenvolver', 'Desenvolvido', 'dev',       1),
    (m, 2, 'Revisar',     'Revisado',     'aprovador', 1),
    (m, 3, 'Publicar',    'Publicado',    'dev',       1)
    on conflict (modelo_id, ordem) do nothing;

  insert into gestao.modelos_peca (nome) values ('Site extra com copy') on conflict (nome) do nothing;
  select id into m from gestao.modelos_peca where nome = 'Site extra com copy';
  insert into gestao.modelos_etapa (modelo_id, ordem, nome, estado, papel, sla_dias_uteis) values
    (m, 1, 'Escrever copy', 'Copy criada',  'copy',      1),
    (m, 2, 'Aprovar copy',  'Copy aprovada','aprovador', 1),
    (m, 3, 'Desenvolver',   'Desenvolvido', 'dev',       1),
    (m, 4, 'Revisar',       'Revisado',     'aprovador', 1),
    (m, 5, 'Publicar',      'Publicado',    'dev',       1)
    on conflict (modelo_id, ordem) do nothing;
end $$;

-- Conferência: 6 modelos
select nome from gestao.modelos_peca order by nome;
