-- 31: ao aprovar uma reunião de cliente, as tarefas da equipe levam também a área "Projeto". Rodar depois do 30.
create or replace function gestao.aprovar_reuniao(p_reuniao uuid) returns int
language plpgsql security definer set search_path = gestao, public as $$
declare
  r gestao.reunioes%rowtype;
  it gestao.reuniao_itens%rowtype;
  v_tarefa uuid;
  v_area uuid;
  v_n int := 0;
begin
  if not gestao.e_admin() then raise exception 'apenas admin'; end if;
  select * into r from gestao.reunioes where id = p_reuniao for update;
  if not found then raise exception 'reuniao nao encontrada'; end if;
  if r.status <> 'pendente' then raise exception 'reuniao ja publicada ou descartada'; end if;
  if exists (select 1 from gestao.reuniao_itens where reuniao_id = r.id and status = 'proposta' and destino = 'equipe' and responsavel_id is null) then
    raise exception 'ha item da equipe sem responsavel';
  end if;
  if r.cliente_id is not null then
    select id into v_area from gestao.areas where lower(codigo) = 'projetos' or lower(nome) = 'projeto' or lower(nome) = 'projetos' order by (lower(codigo) = 'projetos') desc limit 1;
  end if;
  for it in select * from gestao.reuniao_itens where reuniao_id = r.id and status = 'proposta' and destino = 'equipe' order by ordem loop
    insert into gestao.tarefas (titulo, responsavel_id, prazo, notas, status, cliente_id, area_id, criado_por)
    values (it.titulo, it.responsavel_id, it.prazo,
            concat_ws(E'\n\n', it.notas, 'Veio da reunião "' || r.titulo || '" de ' || to_char(r.data, 'DD/MM/YYYY') || '.'),
            'a_fazer', r.cliente_id, v_area, auth.uid())
    returning id into v_tarefa;
    update gestao.reuniao_itens set status = 'publicada', tarefa_id = v_tarefa where id = it.id;
    v_n := v_n + 1;
  end loop;
  update gestao.reunioes set status = 'publicada', publicada_em = now(), publicada_por = auth.uid() where id = r.id;
  return v_n;
end;
$$;
revoke execute on function gestao.aprovar_reuniao(uuid) from public, anon;
grant execute on function gestao.aprovar_reuniao(uuid) to authenticated;
