-- 18: etapas que são da automação (n8n e rotinas do Claude), no lugar dos comentários do ClickUp.
-- Como era no ClickUp -> como fica aqui:
--   rotina gera o rascunho e comenta "RASCUNHO GERADO"  -> srv_entregar: comenta e passa a etapa para a revisão
--   você conclui a tarefa (aprova)                       -> Concluir etapa de revisão: libera a próxima
--   você comenta "REFAZER ..."                           -> Devolver com motivo: a etapa volta para a automação
--   rotina procurava tarefas sem a marca                 -> srv_pendentes_automacao: lista o que está na vez da automação
-- Papel "automacao" não tem pessoa: a etapa fica "na vez da automação" até alguém entregar.
-- Rodar depois do 17. Pode rodar de novo.

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
  where me.modelo_id = p_modelo and me.responsavel_padrao is null and me.papel <> 'automacao'
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
         case when me.papel = 'automacao' then null
              else coalesce(me.responsavel_padrao, nullif(v_resp ->> me.papel, '')::uuid, cp.pessoa_id, pp.pessoa_id) end,
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

do $$
declare m uuid;
begin
  insert into gestao.modelos_peca (nome) values ('Rascunho da rotina') on conflict (nome) do nothing;
  select id into m from gestao.modelos_peca where nome = 'Rascunho da rotina';
  insert into gestao.modelos_etapa (modelo_id, ordem, nome, estado, papel, sla_dias_uteis) values
    (m, 1, 'Gerar',   'Gerado',   'automacao', 1),
    (m, 2, 'Revisar', 'Aprovado', 'aprovador', 1)
    on conflict (modelo_id, ordem) do nothing;

  insert into gestao.modelos_peca (nome) values ('Encontro Arco') on conflict (nome) do nothing;
  select id into m from gestao.modelos_peca where nome = 'Encontro Arco';
  insert into gestao.modelos_etapa (modelo_id, ordem, nome, estado, papel, sla_dias_uteis) values
    (m, 1, 'Gerar esqueleto', 'Esqueleto gerado', 'automacao', 1),
    (m, 2, 'Revisar esqueleto', 'Esqueleto aprovado', 'aprovador', 1),
    (m, 3, 'Gerar deck',      'Deck gerado',      'automacao', 1),
    (m, 4, 'Revisar deck',    'Deck aprovado',    'aprovador', 1)
    on conflict (modelo_id, ordem) do nothing;
end $$;

-- Cria uma peça por tipo. Responsáveis por papel, com uuid OU nome/apelido (ex.: {"aprovador":"Isa"}).
create or replace function gestao.srv_criar_peca(
  p_titulo text, p_modelo text, p_responsaveis jsonb default '{}'::jsonb, p_notas text default null,
  p_depende_de uuid default null
) returns uuid
language plpgsql security definer set search_path = gestao, public as $$
declare
  v_modelo uuid;
  v_resp jsonb := '{}'::jsonb;
  r record;
  v_pessoa uuid;
  v_id uuid;
begin
  if not gestao.e_servico() then raise exception 'apenas servico'; end if;
  select id into v_modelo from gestao.modelos_peca where nome = p_modelo and ativo;
  if v_modelo is null then raise exception 'tipo nao encontrado: %', p_modelo; end if;
  for r in select key, value from jsonb_each_text(coalesce(p_responsaveis, '{}'::jsonb)) loop
    if r.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_pessoa := r.value::uuid;
    else
      select id into v_pessoa from gestao.pessoas
      where ativo and (lower(nome) = lower(r.value) or lower(apelido) = lower(r.value)) limit 1;
      if v_pessoa is null then raise exception 'pessoa nao encontrada: %', r.value; end if;
    end if;
    v_resp := v_resp || jsonb_build_object(r.key, v_pessoa::text);
  end loop;
  v_id := gestao.criar_tarefa_de_modelo(p_titulo, null, v_modelo, null, null, null, v_resp, p_notas);
  if p_depende_de is not null then
    perform set_config('gestao.interno', '1', true);
    update gestao.tarefas set depende_de = p_depende_de where id = v_id;
  end if;
  return v_id;
end;
$$;

-- O que está na vez da automação agora. Só entra tarefa cuja dependência já foi concluída.
-- "refazer" traz o motivo da devolução quando a última ação foi uma devolução (o antigo comentário REFAZER).
create or replace function gestao.srv_pendentes_automacao() returns jsonb
language plpgsql stable security definer set search_path = gestao, public as $$
begin
  if not gestao.e_servico() then raise exception 'apenas servico'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'tarefa_id', t.id, 'titulo', t.titulo, 'cliente', c.nome, 'tipo', mp.nome, 'etapa', te.nome,
      'notas', t.notas, 'prazo', te.prazo_previsto,
      'refazer', (select case when h.acao = 'devolveu' then h.motivo end from gestao.historico h
                  where h.tarefa_id = t.id order by h.quando desc limit 1)
    ) order by te.prazo_previsto nulls last, t.criado_em)
    from gestao.tarefas t
    join gestao.tarefa_etapas te on te.tarefa_id = t.id and te.ordem = t.etapa_atual
    join gestao.modelos_etapa me on me.modelo_id = t.modelo_id and me.ordem = t.etapa_atual
    join gestao.modelos_peca mp on mp.id = t.modelo_id
    left join gestao.clientes c on c.id = t.cliente_id
    where t.status <> 'concluida' and t.arquivada_em is null and me.papel = 'automacao'
      and (t.depende_de is null or exists (select 1 from gestao.tarefas d where d.id = t.depende_de and d.status = 'concluida'))
  ), '[]'::jsonb);
end;
$$;

-- A automação entrega: comenta (com o link e os pontos de revisão) e passa a etapa para quem revisa.
create or replace function gestao.srv_entregar(p_tarefa uuid, p_texto text, p_automacao text default 'Automação')
returns void
language plpgsql security definer set search_path = gestao, public as $$
declare
  t gestao.tarefas%rowtype;
  v_prox gestao.tarefa_etapas%rowtype;
  v_estado text;
  v_papel text;
begin
  if not gestao.e_servico() then raise exception 'apenas servico'; end if;
  perform set_config('gestao.interno', '1', true);
  select * into t from gestao.tarefas where id = p_tarefa and arquivada_em is null for update;
  if not found then raise exception 'tarefa nao encontrada'; end if;
  if t.status = 'concluida' or t.etapa_atual is null then raise exception 'tarefa sem etapa aberta'; end if;
  select papel into v_papel from gestao.modelos_etapa where modelo_id = t.modelo_id and ordem = t.etapa_atual;
  if v_papel is distinct from 'automacao' then raise exception 'a etapa atual nao e da automacao'; end if;
  insert into gestao.comentarios (tarefa_id, autor_id, automacao, texto)
  values (t.id, null, left(coalesce(nullif(trim(p_automacao), ''), 'Automação'), 80), p_texto);
  update gestao.tarefa_etapas set concluida_em = now() where tarefa_id = t.id and ordem = t.etapa_atual
  returning estado into v_estado;
  select * into v_prox from gestao.tarefa_etapas where tarefa_id = t.id and ordem > t.etapa_atual order by ordem limit 1;
  if found then
    update gestao.tarefa_etapas set iniciada_em = now() where id = v_prox.id;
    update gestao.tarefas set etapa_atual = v_prox.ordem, responsavel_id = v_prox.responsavel_id,
                              status = 'em_andamento', estado_atual = v_estado
    where id = t.id;
    perform gestao._recalcular_prazos(t.id);
    insert into gestao.historico (tarefa_id, quem, acao, de_etapa, para_etapa)
    values (t.id, null, 'avancou', t.etapa_atual, v_prox.ordem);
  else
    update gestao.tarefas set status = 'concluida', estado_atual = v_estado, concluida_em = now() where id = t.id;
    insert into gestao.historico (tarefa_id, quem, acao, de_etapa) values (t.id, null, 'concluiu', t.etapa_atual);
  end if;
end;
$$;

revoke execute on function gestao.srv_criar_peca(text, text, jsonb, text, uuid) from public, anon, authenticated;
revoke execute on function gestao.srv_pendentes_automacao() from public, anon, authenticated;
revoke execute on function gestao.srv_entregar(uuid, text, text) from public, anon, authenticated;
grant execute on function gestao.srv_criar_peca(text, text, jsonb, text, uuid) to service_role;
grant execute on function gestao.srv_pendentes_automacao() to service_role;
grant execute on function gestao.srv_entregar(uuid, text, text) to service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'gestao_n8n') then
    grant execute on function gestao.srv_criar_peca(text, text, jsonb, text, uuid) to gestao_n8n;
    grant execute on function gestao.srv_pendentes_automacao() to gestao_n8n;
    grant execute on function gestao.srv_entregar(uuid, text, text) to gestao_n8n;
  end if;
end $$;

select nome from gestao.modelos_peca order by nome;
