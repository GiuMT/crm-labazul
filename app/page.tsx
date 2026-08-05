import { redirect } from 'next/navigation'

// Raiz: manda pro pipeline (que exige login; o middleware redireciona pra /login se deslogado).
export default function Home() {
  redirect('/pipeline')
}
