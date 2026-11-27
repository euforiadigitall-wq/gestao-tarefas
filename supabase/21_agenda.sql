-- 21: agenda do Google Calendar espelhada com o gestão (substitui o fluxo "Agenda ↔ ClickUp").
-- Regra: tarefa com horário é compromisso. Evento aceito na agenda vira tarefa; tarefa com horário vira evento.
-- O n8n (usuário gestao_n8n) só chama estas funções. Rodar depois do 20. Pode rodar de novo.

-- 1) De qual tarefa veio (ou para qual vai) cada evento
alter table gestao.tarefas add column if not exists agenda_evento_id text;
create unique index if not exists tarefas_agenda_evento_uk on gestao.tarefas (agenda_evento_id) where agenda_evento_id is not null;

-- 2) E-mails de agenda de cada pessoa (podem ser diferentes do e-mail de login)
create table if not exists gestao.pessoa_agenda_emails (
  email text primary key check (email = lower(email)),
  pessoa_id uuid not null references gestao.pessoas (id) on delete cascade
);
alter table gestao.pessoa_agenda_emails enable row level security;
drop policy if exists pessoa_agenda_emails_adm on gestao.pessoa_agenda_emails;
create policy pessoa_agenda_emails_adm on gestao.pessoa_agenda_emails for all to authenticated
  using (gestao.e_admin()) with check (gestao.e_admin());
grant select, insert, update, delete on gestao.pessoa_agenda_emails to authenticated;

-- Os mesmos e-mails que o fluxo antigo usava. Quem ainda não existe em pessoas fica de fora (rode de novo depois).
insert into gestao.pessoa_agenda_emails (email, pessoa_id)
select v.email, p.id
from (values
  ('coproducaodigital.lancamento@gmail.com', 'Iza'),
  ('euforiadigitall@gmail.com',              'Isa'),
  ('isabelamonjardim@gmail.com',             'Isa'),
  ('cs.euforiadigital@gmail.com',                'Bia'),
  ('jony.gestortrafego@gmail.com',           'Jony'),
  ('matheushrnery@gmail.com',                'Matheus')
) as v(email, apelido)
join gestao.pessoas p on lower(p.apelido) = lower(v.apelido)
on conflict (email) do nothing;

-- 3) Ler: tarefas com horário (ou já ligadas a evento) na janela + quem é quem na agenda
create or replace function gestao.srv_agenda_ler(p_de date, p_ate date) returns jsonb
language plpgsql stable security definer set search_path = gestao, public as $$
begin
  if not gestao.e_servico() then raise exception 'apenas servico'; end if;
  return jsonb_build_object(
    'tarefas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'titulo', t.titulo, 'prazo', t.prazo, 'horario', to_char(t.horario, 'HH24:MI'),
        'concluida', t.status = 'concluida', 'responsavel_id', t.responsavel_id,
        'responsavel_emails', coalesce((select jsonb_agg(a.email order by a.email) from gestao.pessoa_agenda_emails a where a.pessoa_id = t.responsavel_id), '[]'::jsonb),
        'agenda_evento_id', t.agenda_evento_id, 'criado_em', t.criado_em) order by t.prazo, t.horario)
      from gestao.tarefas t
      where t.arquivada_em is null and t.prazo between p_de and p_ate
        and (t.horario is not null or t.agenda_evento_id is not null)
    ), '[]'::jsonb),
    'equipe', coalesce((select jsonb_agg(jsonb_build_object('email', a.email, 'pessoa_id', a.pessoa_id)) from gestao.pessoa_agenda_emails a), '[]'::jsonb)
  );
end;
$$;

-- 4) Evento novo na agenda -> tarefa. Responsável: o primeiro convidado da equipe; sem equipe, a Iza.
create or replace function gestao.srv_agenda_criar(
  p_titulo text, p_prazo date, p_horario time, p_emails jsonb, p_evento_id text, p_notas text default null
) returns uuid
language plpgsql security definer set search_path = gestao, public as $$
declare
  v_id uuid;
  v_resp uuid;
begin
  if not gestao.e_servico() then raise exception 'apenas servico'; end if;
  if nullif(trim(p_evento_id), '') is null then raise exception 'falta o id do evento'; end if;
  select id into v_id from gestao.tarefas where agenda_evento_id = p_evento_id;
  if v_id is not null then return v_id; end if;
  select a.pessoa_id into v_resp
  from jsonb_array_elements_text(coalesce(p_emails, '[]'::jsonb)) with ordinality e(email, n)
  join gestao.pessoa_agenda_emails a on a.email = lower(e.email)
  join gestao.pessoas p on p.id = a.pessoa_id and p.ativo
  order by e.n limit 1;
  if v_resp is null then
    select id into v_resp from gestao.pessoas where ativo and lower(apelido) = 'iza' limit 1;
  end if;
  if v_resp is null then raise exception 'nao achei responsavel (cadastre a Iza em pessoas)'; end if;
  -- tarefa que nasce da agenda não precisa do e-mail "nova tarefa para você"
  perform set_config('gestao.silencioso', '1', true);
  insert into gestao.tarefas (titulo, responsavel_id, prazo, horario, notas, status, agenda_evento_id)
  values (left(trim(p_titulo), 300), v_resp, p_prazo, p_horario, p_notas, 'a_fazer', p_evento_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- 5) Evento remarcado ou cancelado na agenda -> ajusta a tarefa. Nunca conclui, apaga ou troca responsável.
create or replace function gestao.srv_agenda_atualizar(
  p_tarefa uuid, p_prazo date default null, p_horario time default null, p_titulo text default null
) returns uuid
language plpgsql security definer set search_path = gestao, public as $$
begin
  if not gestao.e_servico() then raise exception 'apenas servico'; end if;
  perform set_config('gestao.interno', '1', true);
  update gestao.tarefas
  set prazo = coalesce(p_prazo, prazo),
      horario = coalesce(p_horario, horario),
      titulo = coalesce(nullif(trim(p_titulo), ''), titulo)
  where id = p_tarefa and arquivada_em is null and status <> 'concluida';
  return p_tarefa;
end;
$$;

revoke execute on function gestao.srv_agenda_ler(date, date) from public, anon, authenticated;
revoke execute on function gestao.srv_agenda_criar(text, date, time, jsonb, text, text) from public, anon, authenticated;
revoke execute on function gestao.srv_agenda_atualizar(uuid, date, time, text) from public, anon, authenticated;
grant execute on function gestao.srv_agenda_ler(date, date) to service_role;
grant execute on function gestao.srv_agenda_criar(text, date, time, jsonb, text, text) to service_role;
grant execute on function gestao.srv_agenda_atualizar(uuid, date, time, text) to service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'gestao_n8n') then
    grant execute on function gestao.srv_agenda_ler(date, date) to gestao_n8n;
    grant execute on function gestao.srv_agenda_criar(text, date, time, jsonb, text, text) to gestao_n8n;
    grant execute on function gestao.srv_agenda_atualizar(uuid, date, time, text) to gestao_n8n;
  end if;
end $$;

-- Conferência: devem aparecer as pessoas ligadas a e-mails de agenda (Iza, Isa, Bia, Jony, Matheus).
select p.apelido, a.email from gestao.pessoa_agenda_emails a join gestao.pessoas p on p.id = a.pessoa_id order by p.apelido, a.email;
