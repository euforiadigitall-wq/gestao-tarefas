-- 28: tarefas pessoais ficam fora do "reatribuir em massa" e da carga por pessoa (admin). Rodar depois do 27.
-- Essas duas funções rodam com permissão de dono e passavam por dentro da trava do script 27.

create or replace function gestao.reatribuir_tarefas(p_de uuid, p_para uuid) returns int
language plpgsql security definer set search_path = gestao, public as $$
declare
  v_ids uuid[];
  v_n int;
begin
  if not gestao.e_admin() then
    raise exception 'apenas admin';
  end if;
  if p_de is null or p_para is null or p_de = p_para then
    raise exception 'escolha duas pessoas diferentes';
  end if;
  if not exists (select 1 from gestao.pessoas where id = p_para and ativo) then
    raise exception 'a pessoa que vai receber precisa estar ativa';
  end if;

  select array_agg(distinct t.id) into v_ids
  from gestao.tarefas t
  where t.status <> 'concluida' and t.arquivada_em is null and not t.pessoal
    and (t.responsavel_id = p_de
         or exists (select 1 from gestao.tarefa_etapas e where e.tarefa_id = t.id and e.responsavel_id = p_de and e.concluida_em is null));
  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n = 0 then
    return 0;
  end if;

  perform set_config('gestao.silencioso', '1', true);
  perform set_config('gestao.interno', '1', true);
  update gestao.tarefa_etapas set responsavel_id = p_para
   where tarefa_id = any (v_ids) and responsavel_id = p_de and concluida_em is null;
  update gestao.tarefas set responsavel_id = p_para
   where id = any (v_ids) and responsavel_id = p_de;
  update gestao.lancamento_checklist set pessoa_id = p_para
   where pessoa_id = p_de and coalesce(feito, false) = false;
  perform set_config('gestao.silencioso', '0', true);
  perform set_config('gestao.interno', '0', true);

  perform gestao._notificar(
    p_para, 'reatribuida', null, v_n || ' tarefas passadas para você',
    jsonb_build_object('titulo', v_n || ' tarefas abertas', 'quantidade', v_n,
                       'por', (select nome from gestao.pessoas where id = auth.uid()))
  );
  return v_n;
end;
$$;

create or replace function gestao.metricas_carga(p_hoje date default (now() at time zone 'America/Sao_Paulo')::date) returns jsonb
language plpgsql stable security definer set search_path = gestao, public as $$
begin
  if not gestao.e_admin() then
    raise exception 'apenas admin';
  end if;
  return (
    select coalesce(jsonb_agg(x order by (x ->> 'atrasadas')::int desc, (x ->> 'abertas')::int desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'pessoa_id', pe.id,
               'nome', coalesce(pe.nome, 'Sem responsável'),
               'abertas', count(*),
               'atrasadas', count(*) filter (where v.prazo_vez < p_hoje),
               'hoje', count(*) filter (where v.prazo_vez = p_hoje),
               'semana', count(*) filter (where v.prazo_vez > p_hoje and v.prazo_vez <= p_hoje + 7),
               'sem_prazo', count(*) filter (where v.prazo_vez is null)) as x
      from gestao.v_tarefas v
      left join gestao.pessoas pe on pe.id = v.responsavel_id
      where v.status <> 'concluida' and v.arquivada_em is null
        and not exists (select 1 from gestao.tarefas tp where tp.id = v.id and tp.pessoal)
      group by pe.id, pe.nome
    ) s
  );
end;
$$;
