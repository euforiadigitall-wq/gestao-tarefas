"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function admin() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  return data.user ? supabase : null;
}
const atualizar = () => revalidatePath("/reunioes");

export async function salvarItem(f: FormData) {
  const id = String(f.get("id") ?? "");
  if (!ID.test(id)) return;
  const titulo = String(f.get("titulo") ?? "").trim().slice(0, 300);
  if (!titulo) return;
  const resp = String(f.get("responsavel") ?? "");
  const prazo = String(f.get("prazo") ?? "");
  const destino = f.get("destino") === "cliente" ? "cliente" : "equipe";
  const supabase = await admin();
  if (!supabase) return;
  await supabase.from("reuniao_itens").update({
    titulo, destino,
    responsavel_id: ID.test(resp) ? resp : null,
    prazo: DATA.test(prazo) ? prazo : null,
    notas: String(f.get("notas") ?? "").trim().slice(0, 600) || null,
  }).eq("id", id).eq("status", "proposta");
  atualizar();
}

export async function removerItem(f: FormData) {
  const id = String(f.get("id") ?? "");
  if (!ID.test(id)) return;
  const supabase = await admin();
  if (!supabase) return;
  await supabase.from("reuniao_itens").update({ status: "removida" }).eq("id", id).eq("status", "proposta");
  atualizar();
}

export async function acrescentarItem(f: FormData) {
  const reuniao = String(f.get("reuniao") ?? "");
  const titulo = String(f.get("titulo") ?? "").trim().slice(0, 300);
  if (!ID.test(reuniao) || !titulo) return;
  const resp = String(f.get("responsavel") ?? "");
  const prazo = String(f.get("prazo") ?? "");
  const supabase = await admin();
  if (!supabase) return;
  await supabase.from("reuniao_itens").insert({
    reuniao_id: reuniao, titulo,
    destino: f.get("destino") === "cliente" ? "cliente" : "equipe",
    responsavel_id: ID.test(resp) ? resp : null,
    prazo: DATA.test(prazo) ? prazo : null,
    ordem: 999,
  });
  atualizar();
}

export async function aprovarReuniao(f: FormData) {
  const id = String(f.get("id") ?? "");
  if (!ID.test(id)) return;
  const supabase = await admin();
  if (!supabase) return;
  const { error } = await supabase.rpc("aprovar_reuniao", { p_reuniao: id });
  if (error) console.error("[reunioes] aprovar:", error.message);
  atualizar();
}

export async function descartarReuniao(f: FormData) {
  const id = String(f.get("id") ?? "");
  if (!ID.test(id)) return;
  const supabase = await admin();
  if (!supabase) return;
  await supabase.from("reunioes").update({ status: "descartada" }).eq("id", id).eq("status", "pendente");
  atualizar();
}
