import { redirect } from "next/navigation";

/**
 * `/admin` n'a pas de tableau de bord dédié : plusieurs liens internes (ex. la
 * flèche « Retour » de l'import CSV) y pointaient et tombaient en 404 faute de
 * page. On redirige vers une page d'administration réelle et accessible à tous
 * les profils admin (super-admin ET gestionnaire d'espaces) : `/admin/espaces`.
 */
export default function AdminIndexPage() {
  redirect("/admin/espaces");
}
