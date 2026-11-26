import { permanentRedirect } from "next/navigation";

// O Cronograma virou Agenda
export default function Cronograma() {
  permanentRedirect("/agenda");
}
