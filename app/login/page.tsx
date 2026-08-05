import { Suspense } from 'react'
import LoginForm from '@/components/LoginForm'

export default function LoginPage() {
  return (
    <main className="bg-marca-gradiente min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="mb-1 flex items-center justify-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-marca-ciano" />
            <span className="text-2xl font-bold text-marca-azul">LabAzul</span>
          </div>
          <p className="text-sm text-slate-500">CRM — acesso</p>
        </div>
        <Suspense fallback={<div className="h-40" />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  )
}
