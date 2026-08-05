import { redirect } from "next/navigation";

/**
 * Промо-страница появится вместе с публичной частью; пока корень ведёт в
 * кабинет, чтобы не держать заглушку на видном месте.
 */
export default function RootPage() {
  redirect("/dashboard");
}
