-- 20: prazo na criação de peça pela automação (srv_criar_peca ganha p_prazo).
-- O prazo vale para a peça inteira, em dias úteis (sem feriados): as etapas do meio ficam com o SLA do tipo
-- e o que sobra vai para a última etapa. Prazo que já passou, ou menor que a soma dos SLAs, mantém os SLAs do tipo.
-- Rodar depois do 19. Pode rodar de novo.

drop function if exists gestao.srv_criar_peca(text, text, jsonb, text, uuid, text, text);

create or replace function gestao.srv_criar_peca(
  p_titulo text, p_modelo text, p_responsaveis jsonb default '{}'::jsonb, p_notas text default null,
  p_depende_de uuid default null, p_cliente text default null, p_area text default 'projetos', p_prazo date default null
) returns uuid
language plpgsql security definer set search_path = gestao, public as $$
declare
  v_modelo uuid;
  v_cliente uuid;
  v_area uuid;
  v_resp jsonb := '{}'::jsonb;
  r record;
  v_pessoa uuid;
  v_id uuid;
  v_dias int;
  v_outras int;
  v_ult uuid;
begin
  if not gestao.e_servico() then raise exception 'apenas servico'; end if;
  select id into v_modelo from gestao.modelos_peca where nome = p_modelo and ativo;
  if v_modelo is null then raise exception 'tipo nao encontrado: %', p_modelo; end if;
  if nullif(trim(p_cliente), '') is not null then
    select id into v_cliente from gestao.clientes
    where ativo and lower(nome) = lower(trim(p_cliente)) limit 1;
    if v_cliente is null then
      select id into v_cliente from gestao.clientes
      where ativo and nome ilike '%' || trim(p_cliente) || '%' order by length(nome) limit 1;
    end if;
    if v_cliente is null then raise exception 'cliente nao encontrado: %', p_cliente; end if;
  end if;
  if v_cliente is not null then
    select id into v_area from gestao.areas where ativo and (lower(codigo) = lower(trim(p_area)) or lower(nome) = lower(trim(p_area))) limit 1;
    if v_area is null then raise exception 'area nao encontrada: %', p_area; end if;
  end if;
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
  v_id := gestao.criar_tarefa_de_modelo(p_titulo, v_cliente, v_modelo, v_area, null, null, v_resp, p_notas);
  if p_depende_de is not null then
    perform set_config('gestao.interno', '1', true);
    update gestao.tarefas set depende_de = p_depende_de where id = v_id;
  end if;
  if p_prazo is not null then
    -- prazo da peça inteira em dias úteis: o que sobra depois das outras etapas vai para a última
    select count(*) into v_dias from generate_series(current_date + 1, p_prazo, interval '1 day') d
    where extract(isodow from d) < 6;
    select id into v_ult from gestao.tarefa_etapas where tarefa_id = v_id order by ordem desc limit 1;
    select coalesce(sum(sla_dias_uteis), 0) into v_outras from gestao.tarefa_etapas where tarefa_id = v_id and id <> v_ult;
    perform set_config('gestao.interno', '1', true);
    update gestao.tarefa_etapas set sla_dias_uteis = greatest(1, v_dias - v_outras) where id = v_ult;
    perform gestao._recalcular_prazos(v_id);
  end if;
  return v_id;
end;
$$;

revoke execute on function gestao.srv_criar_peca(text, text, jsonb, text, uuid, text, text, date) from public, anon, authenticated;
grant execute on function gestao.srv_criar_peca(text, text, jsonb, text, uuid, text, text, date) to service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'gestao_n8n') then
    grant execute on function gestao.srv_criar_peca(text, text, jsonb, text, uuid, text, text, date) to gestao_n8n;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Onboarding Arco no gestão: o n8n (fluxo "Arco · Onboarding") chama uma função só, e a regra fica no banco.
-- Acha ou cria o cliente e monta as 7 tarefas do onboarding, com os mesmos prazos em dias úteis que tinham no ClickUp.
-- Pode ser chamada duas vezes para o mesmo cliente (a Autentique repete webhook): o que já existe é pulado.
-- ---------------------------------------------------------------------------------------------
create or replace function gestao.srv_garantir_cliente(p_nome text) returns uuid
language plpgsql security definer set search_path = gestao, public as $$
declare v uuid; v_nome text := trim(p_nome);
begin
  if not gestao.e_servico() then raise exception 'apenas servico'; end if;
  if coalesce(v_nome, '') = '' then raise exception 'informe o cliente'; end if;
  select id into v from gestao.clientes where lower(nome) = lower(v_nome) limit 1;
  if v is null then
    insert into gestao.clientes (nome) values (v_nome) returning id into v;
  elsif not (select ativo from gestao.clientes where id = v) then
    update gestao.clientes set ativo = true where id = v;
  end if;
  return v;
end;
$$;

create or replace function gestao.srv_onboarding_arco(p_cliente text, p_rodape text default '') returns jsonb
language plpgsql security definer set search_path = gestao, public as $$
declare
  v_nome text := trim(p_cliente);
  v_cli uuid;
  v_hoje date := current_date;
  v_rod text := case when coalesce(p_rodape, '') = '' then '' else E'\n\n' || p_rodape end;
  v_pesq uuid;
  v_id uuid;
  v_criadas text[] := '{}';
  v_puladas text[] := '{}';
  v_itens jsonb;
  v_res jsonb;
begin
  if not gestao.e_servico() then raise exception 'apenas servico'; end if;
  v_cli := gestao.srv_garantir_cliente(v_nome);

  -- tarefas de pessoa (simples): Bia agenda e encerra a coleta; Isa analisa o diagnóstico
  v_itens := jsonb_build_array(
    jsonb_build_object('titulo', '[ARCO] ' || v_nome || ' · Agendar reunião de diagnóstico (Encontro 1)', 'cliente', v_nome, 'area', 'projetos', 'responsavel', 'Bia',
      'prazo', gestao.add_dias_uteis(v_hoje, 4),
      'notas', 'Marcar no mesmo dia em que a pesquisa de audiência sobe. A data do Encontro 1 fica para depois do mapa da persona (dia útil 9). Convite com os dois e-mails da EuforIA.' || v_rod),
    jsonb_build_object('titulo', '[ARCO] ' || v_nome || ' · Analisar diagnóstico', 'cliente', v_nome, 'area', 'projetos', 'responsavel', 'Isa',
      'prazo', gestao.add_dias_uteis(v_hoje, 3),
      'notas', 'A pré-análise da IA aparece na página do cliente no admin do portal assim que ele envia o formulário. Prazo de 2 dias a partir da devolução.' || v_rod),
    jsonb_build_object('titulo', '[ARCO] ' || v_nome || ' · Encerrar coleta da pesquisa de audiência', 'cliente', v_nome, 'area', 'projetos', 'responsavel', 'Bia',
      'prazo', gestao.add_dias_uteis(v_hoje, 8),
      'notas', '4 dias de coleta.' || v_rod)
  );
  v_res := gestao.importar_tarefas(v_itens, true, true);

  -- peças da rotina (Claude gera, a Isa revisa)
  if exists (select 1 from gestao.tarefas where titulo = '[ARCO] ' || v_nome || ' · Pesquisa de mercado' and cliente_id = v_cli and arquivada_em is null) then
    select id into v_pesq from gestao.tarefas where titulo = '[ARCO] ' || v_nome || ' · Pesquisa de mercado' and cliente_id = v_cli and arquivada_em is null order by criado_em desc limit 1;
    v_puladas := array_append(v_puladas, 'Pesquisa de mercado'::text);
  else
    v_pesq := gestao.srv_criar_peca('[ARCO] ' || v_nome || ' · Pesquisa de mercado', 'Rascunho da rotina', '{"aprovador":"Isa"}'::jsonb,
      'Em paralelo ao diagnóstico. Leitura em 4 passos: tamanho, modelo, vão, benchmark.' || v_rod, null, v_nome, 'projetos', gestao.add_dias_uteis(v_hoje, 3));
    v_criadas := array_append(v_criadas, 'Pesquisa de mercado'::text);
  end if;

  if exists (select 1 from gestao.tarefas where titulo = '[ARCO] ' || v_nome || ' · Subir pesquisa de audiência' and cliente_id = v_cli and arquivada_em is null) then
    v_puladas := array_append(v_puladas, 'Subir pesquisa de audiência'::text);
  else
    perform gestao.srv_criar_peca('[ARCO] ' || v_nome || ' · Subir pesquisa de audiência', 'Rascunho da rotina', '{"aprovador":"Isa"}'::jsonb,
      'Só depois do diagnóstico analisado e da pesquisa de mercado concluída. A rotina gera o formulário e o convite; revisar, mandar ao cliente e concluir. Cliente sobe em 1 dia.' || v_rod,
      v_pesq, v_nome, 'projetos', gestao.add_dias_uteis(v_hoje, 4));
    v_criadas := array_append(v_criadas, 'Subir pesquisa de audiência'::text);
  end if;

  if exists (select 1 from gestao.tarefas where titulo = '[ARCO] ' || v_nome || ' · Mapa da persona' and cliente_id = v_cli and arquivada_em is null) then
    v_puladas := array_append(v_puladas, 'Mapa da persona'::text);
  else
    perform gestao.srv_criar_peca('[ARCO] ' || v_nome || ' · Mapa da persona', 'Rascunho da rotina', '{"aprovador":"Isa"}'::jsonb,
      '1 dia após o fim da coleta, cruzando formulário, pesquisa de mercado e pesquisa de audiência.' || v_rod, null, v_nome, 'projetos', gestao.add_dias_uteis(v_hoje, 9));
    v_criadas := array_append(v_criadas, 'Mapa da persona'::text);
  end if;

  if exists (select 1 from gestao.tarefas where titulo = '[ARCO] ' || v_nome || ' · Preparar Encontro 1' and cliente_id = v_cli and arquivada_em is null) then
    v_puladas := array_append(v_puladas, 'Preparar Encontro 1'::text);
  else
    perform gestao.srv_criar_peca('[ARCO] ' || v_nome || ' · Preparar Encontro 1', 'Encontro Arco', '{"aprovador":"Isa"}'::jsonb,
      'Skill preparacao-encontro-arco: esqueleto aprovado antes do deck.' || v_rod, null, v_nome, 'projetos', gestao.add_dias_uteis(v_hoje, 9));
    v_criadas := array_append(v_criadas, 'Preparar Encontro 1'::text);
  end if;

  return jsonb_build_object('cliente', v_nome, 'cliente_id', v_cli,
    'tarefas_simples', v_res, 'pecas_criadas', to_jsonb(v_criadas), 'pecas_ja_existiam', to_jsonb(v_puladas),
    'total_criadas', coalesce(jsonb_array_length(v_res -> 'criadas'), 0) + coalesce(array_length(v_criadas, 1), 0));
end;
$$;

revoke execute on function gestao.srv_garantir_cliente(text) from public, anon, authenticated;
revoke execute on function gestao.srv_onboarding_arco(text, text) from public, anon, authenticated;
grant execute on function gestao.srv_garantir_cliente(text) to service_role;
grant execute on function gestao.srv_onboarding_arco(text, text) to service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'gestao_n8n') then
    grant execute on function gestao.srv_garantir_cliente(text) to gestao_n8n;
    grant execute on function gestao.srv_onboarding_arco(text, text) to gestao_n8n;
  end if;
end $$;
