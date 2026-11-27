-- 22: onboarding de Tráfego e Página no gestão (substitui a criação de tarefas no ClickUp do fluxo
-- "Tráfego e Página · Formulário respondido"). O n8n chama uma função só; a regra e os prazos ficam no banco.
-- Prazos em dias úteis a partir de hoje (sem feriados), os mesmos que o fluxo tinha no ClickUp.
-- Pode ser chamada duas vezes para o mesmo cliente (a planilha pode repetir a linha): o que já existe é pulado.
-- Rodar depois do 21. Pode rodar de novo.

-- Izabella de Carvalho é a "Iza" nas tarefas e nas rotinas.
update gestao.pessoas set apelido = 'Iza'
where lower(nome) = 'izabella de carvalho' and coalesce(apelido, '') <> 'Iza';

create or replace function gestao.srv_onboarding_pagina_trafego(
  p_cliente text, p_trafego boolean, p_pagina boolean, p_rodape text default ''
) returns jsonb
language plpgsql security definer set search_path = gestao, public as $$
declare
  v_nome text := trim(p_cliente);
  v_cli uuid;
  v_hoje date := current_date;
  v_rod text := case when coalesce(p_rodape, '') = '' then '' else E'\n\n' || p_rodape end;
  v_itens jsonb := '[]'::jsonb;
  v_res jsonb := jsonb_build_object('criadas', '[]'::jsonb, 'duplicadas', '[]'::jsonb, 'erros', '[]'::jsonb);
  v_pesq uuid;
  v_criadas text[] := '{}';
  v_puladas text[] := '{}';
  v_analise_titulo text;
  v_analise_id uuid;
  p record;
begin
  if not gestao.e_servico() then raise exception 'apenas servico'; end if;
  if not coalesce(p_trafego, false) and not coalesce(p_pagina, false) then raise exception 'informe tráfego ou página'; end if;
  v_cli := gestao.srv_garantir_cliente(v_nome);

  -- tarefas de pessoa (todas da Iza, como no ClickUp)
  if p_trafego then
    v_itens := v_itens || jsonb_build_array(
      jsonb_build_object('titulo', '[TRÁFEGO] ' || v_nome || ' · Analisar formulário', 'cliente', v_nome, 'area', 'projetos', 'responsavel', 'Iza',
        'prazo', gestao.add_dias_uteis(v_hoje, 1),
        'notas', 'O cliente preencheu o formulário de diagnóstico. O resumo da IA está nos comentários desta tarefa.' || v_rod),
      jsonb_build_object('titulo', '[TRÁFEGO] ' || v_nome || ' · Conferir acesso ao gerenciador', 'cliente', v_nome, 'area', 'projetos', 'responsavel', 'Iza',
        'prazo', gestao.add_dias_uteis(v_hoje, 2),
        'notas', 'O cliente recebeu no WhatsApp o passo a passo para dar acesso à conta de anúncios e o guia dos criativos. Conferir se o acesso chegou.' || v_rod),
      jsonb_build_object('titulo', '[TRÁFEGO] ' || v_nome || ' · Definir gestor e dar acesso', 'cliente', v_nome, 'area', 'trafego', 'responsavel', 'Iza',
        'prazo', gestao.add_dias_uteis(v_hoje, 3),
        'notas', 'Escolher o gestor responsável e dar a ele acesso à conta de anúncios.' || v_rod));
  end if;
  if p_pagina then
    v_itens := v_itens || jsonb_build_array(
      jsonb_build_object('titulo', '[PÁGINA] ' || v_nome || ' · Analisar diagnóstico', 'cliente', v_nome, 'area', 'projetos', 'responsavel', 'Iza',
        'prazo', gestao.add_dias_uteis(v_hoje, 2),
        'notas', E'O cliente preencheu o formulário de diagnóstico. O resumo da IA está nos comentários desta tarefa.\n\nO que fazer:\n1. Ler o resumo, principalmente a seção 4 (lacunas) e a 5 (sinais de atenção).\n2. Mandar ao cliente pelo WhatsApp as perguntas da seção 4 que mudam a página (até 5).\n3. Colar as respostas como comentário nesta tarefa, começando com RESPOSTAS DA CLIENTE. A rotina usa esse comentário nas próximas etapas.\n4. Concluir a tarefa.' || v_rod),
      jsonb_build_object('titulo', '[PÁGINA] ' || v_nome || ' · Agendar reunião', 'cliente', v_nome, 'area', 'projetos', 'responsavel', 'Iza',
        'prazo', gestao.add_dias_uteis(v_hoje, 6),
        'notas', '3 dias úteis depois de subir a pesquisa de audiência.' || v_rod),
      jsonb_build_object('titulo', '[PÁGINA] ' || v_nome || ' · Encerrar coleta da pesquisa de audiência', 'cliente', v_nome, 'area', 'projetos', 'responsavel', 'Iza',
        'prazo', gestao.add_dias_uteis(v_hoje, 7),
        'notas', '4 dias de coleta.' || v_rod));
  end if;
  v_res := gestao.importar_tarefas(v_itens, true, true);

  -- peças da rotina (Claude gera, a Iza revisa; concluir é aprovar) e briefing para o dev
  if p_pagina then
    for p in
      select * from (values
        (1, 'Pesquisa de mercado', 'Rascunho da rotina', 2, 'A rotina gera o rascunho (leitura em 4 passos: tamanho, modelo, vão, benchmark) e comenta aqui com o link. Revisar no Drive e concluir.'),
        (2, 'Subir pesquisa de audiência', 'Rascunho da rotina', 3, 'Só depois da pesquisa de mercado concluída. Roteiro com a skill pesquisa-audiencia-script. Cliente sobe em 1 dia.'),
        (3, 'Análise', 'Rascunho da rotina', 10, 'A rotina gera o rascunho quando a coleta encerra, cruzando diagnóstico, pesquisa de mercado e pesquisa de audiência. Revisar no Drive e concluir: concluir é a aprovação.'),
        (4, 'Copy da página', 'Rascunho da rotina', 17, 'A rotina gera o rascunho depois da Análise concluída e da reunião gravada (notas do Gemini). Revisar no Drive e concluir.'),
        (5, 'Briefing para o webdesign', 'Briefing de página', 17, 'A rotina gera o rascunho depois da Copy concluída. Revisar no Drive e concluir: ao concluir, a rotina entrega copy e briefing ao Rafael.')
      ) as x(ordem, sufixo, modelo, dias, notas) order by ordem
    loop
      if exists (select 1 from gestao.tarefas where titulo = '[PÁGINA] ' || v_nome || ' · ' || p.sufixo and cliente_id = v_cli and arquivada_em is null) then
        v_puladas := array_append(v_puladas, p.sufixo);
        if p.ordem = 1 then
          select id into v_pesq from gestao.tarefas where titulo = '[PÁGINA] ' || v_nome || ' · ' || p.sufixo and cliente_id = v_cli and arquivada_em is null order by criado_em desc limit 1;
        end if;
      else
        declare v_nova uuid;
        begin
          v_nova := gestao.srv_criar_peca('[PÁGINA] ' || v_nome || ' · ' || p.sufixo, p.modelo, '{"aprovador":"Iza"}'::jsonb,
            p.notas || v_rod, case when p.ordem = 2 then v_pesq else null end, v_nome, 'projetos', gestao.add_dias_uteis(v_hoje, p.dias));
          if p.ordem = 1 then v_pesq := v_nova; end if;
        end;
        v_criadas := array_append(v_criadas, p.sufixo);
      end if;
    end loop;
  end if;

  -- onde vai o resumo da IA: a análise do tráfego, ou a da página quando o cliente é só de página
  v_analise_titulo := case when p_trafego then '[TRÁFEGO] ' || v_nome || ' · Analisar formulário' else '[PÁGINA] ' || v_nome || ' · Analisar diagnóstico' end;
  select id into v_analise_id from gestao.tarefas
  where titulo = v_analise_titulo and cliente_id = v_cli and arquivada_em is null order by criado_em desc limit 1;

  return jsonb_build_object('cliente', v_nome, 'cliente_id', v_cli, 'analise_id', v_analise_id,
    'tarefas_simples', v_res, 'pecas_criadas', to_jsonb(v_criadas), 'pecas_ja_existiam', to_jsonb(v_puladas),
    'total_criadas', coalesce(jsonb_array_length(v_res -> 'criadas'), 0) + coalesce(array_length(v_criadas, 1), 0),
    'erros', coalesce(v_res -> 'erros', '[]'::jsonb));
end;
$$;

revoke execute on function gestao.srv_onboarding_pagina_trafego(text, boolean, boolean, text) from public, anon, authenticated;
grant execute on function gestao.srv_onboarding_pagina_trafego(text, boolean, boolean, text) to service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'gestao_n8n') then
    grant execute on function gestao.srv_onboarding_pagina_trafego(text, boolean, boolean, text) to gestao_n8n;
  end if;
end $$;

-- Conferência: a Iza precisa existir com apelido "Iza", e os dois tipos de peça abaixo precisam estar ativos.
select nome, apelido, papel from gestao.pessoas where lower(apelido) = 'iza' or lower(nome) = 'izabella de carvalho';
select nome, ativo from gestao.modelos_peca where nome in ('Rascunho da rotina', 'Briefing de página');
