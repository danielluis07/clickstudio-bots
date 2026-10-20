import Link from "next/link";

export function ForgotPasswordLink() {
  return (
    <Link href="/esqueci-a-senha" className="text-sm underline underline-offset-4">
      Esqueci minha senha
    </Link>
  );
}
