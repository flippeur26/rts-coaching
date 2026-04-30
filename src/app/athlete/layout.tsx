import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AthleteNav from '@/components/athlete/AthleteNav'

export default async function AthleteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'athlete') redirect('/')

  return (
    <div className="min-h-screen bg-gray-950">
      <main className="max-w-2xl mx-auto px-4 py-6 pb-24">
        {children}
      </main>
      <AthleteNav />
    </div>
  )
}
