import { hojeSP } from "@/lib/datas";

export const ETAPAS = [
  { id: "aquecimento", nome: "Aquecimento" },
  { id: "captacao", nome: "Captação" },
  { id: "abertura_carrinho", nome: "Abertura do carrinho" },
  { id: "vendas", nome: "Vendas" },
  { id: "pos_vendas", nome: "Pós-vendas" },
  { id: "debriefing", nome: "Debriefing" },
] as const;
export type EtapaId = (typeof ETAPAS)[number]["id"];

export const nomeEtapa = (id: string) => ETAPAS.find((e) => e.id === id)?.nome ?? id;
export const etapaNoTitulo = (id: string) => nomeEtapa(id).toLowerCase();

// plural = como aparece no título ("10 mensagens de vendas"); modelo = tipo de peça sugerido
export const TIPOS_ENTREGAVEL = [
  { id: "mensagens", nome: "Mensagens", plural: "mensagens", modelo: "Mensagem ou e-mail" },
  { id: "emails", nome: "E-mails", plural: "e-mails", modelo: "Mensagem ou e-mail" },
  { id: "anuncios", nome: "Anúncios", plural: "anúncios", modelo: "Post ou anúncio" },
  { id: "posts_stories", nome: "Posts e stories", plural: "posts e stories", modelo: "Post ou anúncio" },
  { id: "paginas", nome: "Páginas", plural: "páginas", modelo: "Site extra" },
  { id: "manychat", nome: "ManyChat", plural: "fluxos de ManyChat", modelo: "Site extra" },
  { id: "site_principal", nome: "Site principal", plural: "itens do site principal", modelo: "Site extra" },
  { id: "noticias", nome: "Notícias", plural: "notícias", modelo: "Notícia do site" },
] as const;

export const CORES_TAG = ["azul", "verde", "roxo", "laranja", "rosa", "cinza"] as const;
export const corTag = (c: string) => ((CORES_TAG as readonly string[]).includes(c) ? c : "cinza");

export interface DatasLanc {
  data_inicio: string | null;
  data_abertura: string | null;
  data_fechamento: string | null;
}

// Etapa em que o lançamento está, pelas datas. Só considera as etapas ligadas.
// É uma leitura pelas datas, não um registro: a lista mostra isso como "pelas datas".
export function etapaPelasDatas(l: DatasLanc, ativas: string[], hoje = hojeSP()): EtapaId {
  const liga = (e: EtapaId) => ativas.includes(e);
  const primeira = (...c: EtapaId[]) => c.find(liga) ?? c[c.length - 1];
  if (l.data_fechamento && hoje > l.data_fechamento) return primeira("pos_vendas", "debriefing");
  if (l.data_abertura && hoje >= l.data_abertura) {
    if (hoje === l.data_abertura && liga("abertura_carrinho")) return "abertura_carrinho";
    return primeira("vendas", "abertura_carrinho", "pos_vendas");
  }
  return primeira("captacao", "aquecimento", "abertura_carrinho", "vendas");
}

export function tituloEntregavel(qtd: number, tipoId: string, etapaId: string): string {
  const t = TIPOS_ENTREGAVEL.find((x) => x.id === tipoId);
  return `${qtd} ${t?.plural ?? tipoId} de ${etapaNoTitulo(etapaId)}`;
}
