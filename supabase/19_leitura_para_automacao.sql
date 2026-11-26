-- 19: o que a rotina e o n8n precisam LER e CRIAR no gestão (o usuário gestao_n8n não lê tabelas, só chama funções).
-- Substitui o que a rotina lia no ClickUp:
--   ler comentários e descrição de uma tarefa       -> srv_ler_tarefa
--   buscar tarefas por nome e prazo                 -> srv_buscar_tarefas
--   criar tarefa já no cliente certo                -> srv_criar_peca (agora com cliente e área; área padrão: projetos)
--   saber desde quando o REFAZER (devolução) vale   -> srv_pendentes_automacao ganha devolvida_em
-- Rodar depois do 18. Pode rodar de novo.

drop function if exists gestao.srv_criar_peca(text, text, jsonb, text, uuid);
drop function if exists gestao.srv_criar_peca(text, text, jsonb, text, uuid, text);

create or replace function gestao.srv_criar_peca(
  p_titulo text, p_modelo text, p_responsaveis jsonb default '{}'::jsonb, p_notas text default null,
  p_depende_de uuid default null, p_cliente text default null, p_area text default 'projetos'
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
  return v_id;
end;
$$;

-- Uma tarefa por inteiro: dados, etapa atual, comentários (do mais antigo ao mais novo) e a última devolução.
create or replace function gestao.srv_ler_tarefa(p_tarefa uuid) returns jsonb
language plpgsql stable security definer set search_path = gestao, public as $$
declare v jsonb;
begin
  if not gestao.e_servico() then raise exception 'apenas servico'; end if;
  select jsonb_build_object(
    'tarefa_id', t.id, 'titulo', t.titulo, 'cliente', c.nome, 'tipo', mp.nome,
    'status', t.status, 'concluida', t.status = 'concluida', 'concluida_em', t.concluida_em,
    'etapa', te.nome, 'papel_da_etapa', me.papel, 'responsavel', p.nome,
    'prazo', t.prazo, 'horario', t.horario, 'notas', t.notas, 'depende_de', t.depende_de,
    'ultima_devolucao', (select jsonb_build_object('motivo', h.motivo, 'quando', h.quando)
                         from gestao.historico h where h.tarefa_id = t.id and h.acao = 'devolveu'
                         order by h.quando desc limit 1),
    'comentarios', coalesce((select jsonb_agg(jsonb_build_object(
                       'autor', coalesce(pa.nome, cm.automacao, 'Alguém'), 'automacao', cm.autor_id is null,
                       'texto', cm.texto, 'quando', cm.criado_em) order by cm.criado_em)
                     from gestao.comentarios cm left join gestao.pessoas pa on pa.id = cm.autor_id
                     where cm.tarefa_id = t.id), '[]'::jsonb)
  ) into v
  from gestao.tarefas t
  left join gestao.clientes c on c.id = t.cliente_id
  left join gestao.modelos_peca mp on mp.id = t.modelo_id
  left join gestao.tarefa_etapas te on te.tarefa_id = t.id and te.ordem = t.etapa_atual
  left join gestao.modelos_etapa me on me.modelo_id = t.modelo_id and me.ordem = t.etapa_atual
  left join gestao.pessoas p on p.id = t.responsavel_id
  where t.id = p_tarefa;
  if v is null then raise exception 'tarefa nao encontrada'; end if;
  return v;
end;
$$;

-- Busca por pedaço do título e/ou intervalo de prazo. Sem comentários (use srv_ler_tarefa para isso).
create or replace function gestao.srv_buscar_tarefas(
  p_texto text default null, p_de date default null, p_ate date default null,
  p_incluir_concluidas boolean default false
) returns jsonb
language plpgsql stable security definer set search_path = gestao, public as $$
begin
  if not gestao.e_servico() then raise exception 'apenas servico'; end if;
  return coalesce((
    select jsonb_agg(x order by x ->> 'prazo', x ->> 'horario') from (
      select jsonb_build_object('tarefa_id', t.id, 'titulo', t.titulo, 'cliente', c.nome,
             'responsavel', p.nome, 'prazo', t.prazo, 'horario', t.horario,
             'status', t.status, 'concluida', t.status = 'concluida', 'tipo', mp.nome) as x
      from gestao.tarefas t
      left join gestao.clientes c on c.id = t.cliente_id
      left join gestao.pessoas p on p.id = t.responsavel_id
      left join gestao.modelos_peca mp on mp.id = t.modelo_id
      where t.arquivada_em is null
        and (p_incluir_concluidas or t.status <> 'concluida')
        and (nullif(trim(p_texto), '') is null or t.titulo ilike '%' || trim(p_texto) || '%')
        and (p_de is null or t.prazo >= p_de)
        and (p_ate is null or t.prazo <= p_ate)
      order by t.prazo nulls last limit 200
    ) q
  ), '[]'::jsonb);
end;
$$;

-- Pendências da automação: agora com a data da devolução (o REFAZER) para a rotina ignorar comentários antigos.
create or replace function gestao.srv_pendentes_automacao() returns jsonb
language plpgsql stable security definer set search_path = gestao, public as $$
begin
  if not gestao.e_servico() then raise exception 'apenas servico'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'tarefa_id', t.id, 'titulo', t.titulo, 'cliente', c.nome, 'tipo', mp.nome, 'etapa', te.nome,
      'notas', t.notas, 'prazo', te.prazo_previsto,
      'refazer', (select case when h.acao = 'devolveu' then h.motivo end from gestao.historico h
                  where h.tarefa_id = t.id order by h.quando desc limit 1),
      'devolvida_em', (select case when h.acao = 'devolveu' then h.quando end from gestao.historico h
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

-- Põe uma linha no começo das notas (ex.: "**Pasta no Drive:** URL"), só se ainda não houver uma linha com o mesmo prefixo.
create or replace function gestao.srv_notas_inicio(p_tarefa uuid, p_linha text, p_prefixo text default null)
returns void
language plpgsql security definer set search_path = gestao, public as $$
declare v_notas text;
begin
  if not gestao.e_servico() then raise exception 'apenas servico'; end if;
  if nullif(trim(p_linha), '') is null then raise exception 'linha vazia'; end if;
  select coalesce(notas, '') into v_notas from gestao.tarefas where id = p_tarefa;
  if not found then raise exception 'tarefa nao encontrada'; end if;
  if p_prefixo is not null and position(p_prefixo in v_notas) > 0 then return; end if;
  perform set_config('gestao.interno', '1', true);
  update gestao.tarefas set notas = p_linha || case when v_notas = '' then '' else E'\n' || v_notas end where id = p_tarefa;
end;
$$;

-- Tipos que a rotina usa no lugar das tarefas "[PÁGINA] ..." do ClickUp.
do $$
declare m uuid;
begin
  insert into gestao.modelos_peca (nome) values ('Briefing de página') on conflict (nome) do nothing;
  select id into m from gestao.modelos_peca where nome = 'Briefing de página';
  insert into gestao.modelos_etapa (modelo_id, ordem, nome, estado, papel, sla_dias_uteis) values
    (m, 1, 'Gerar briefing',        'Briefing gerado',  'automacao', 1),
    (m, 2, 'Revisar briefing',      'Briefing aprovado', 'aprovador', 1),
    (m, 3, 'Entregar ao dev',       'Entregue ao dev',  'automacao', 1)
    on conflict (modelo_id, ordem) do nothing;
end $$;

revoke execute on function gestao.srv_criar_peca(text, text, jsonb, text, uuid, text, text) from public, anon, authenticated;
revoke execute on function gestao.srv_notas_inicio(uuid, text, text) from public, anon, authenticated;
grant execute on function gestao.srv_notas_inicio(uuid, text, text) to service_role;
revoke execute on function gestao.srv_ler_tarefa(uuid) from public, anon, authenticated;
revoke execute on function gestao.srv_buscar_tarefas(text, date, date, boolean) from public, anon, authenticated;
revoke execute on function gestao.srv_pendentes_automacao() from public, anon, authenticated;
grant execute on function gestao.srv_criar_peca(text, text, jsonb, text, uuid, text, text) to service_role;
grant execute on function gestao.srv_ler_tarefa(uuid) to service_role;
grant execute on function gestao.srv_buscar_tarefas(text, date, date, boolean) to service_role;
grant execute on function gestao.srv_pendentes_automacao() to service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'gestao_n8n') then
    grant execute on function gestao.srv_criar_peca(text, text, jsonb, text, uuid, text, text) to gestao_n8n;
    grant execute on function gestao.srv_notas_inicio(uuid, text, text) to gestao_n8n;
    grant execute on function gestao.srv_ler_tarefa(uuid) to gestao_n8n;
    grant execute on function gestao.srv_buscar_tarefas(text, date, date, boolean) to gestao_n8n;
    grant execute on function gestao.srv_pendentes_automacao() to gestao_n8n;
  end if;
end $$;

select proname from pg_proc where pronamespace = 'gestao'::regnamespace and proname like 'srv_%' order by 1;
