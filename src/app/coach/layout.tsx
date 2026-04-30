import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CoachNav from '@/components/coach/CoachNav'

export default async function CoachLayout({
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

  if (profile?.role !== 'coach') redirect('/')

  return (
    <div className="min-h-screen bg-gray-950">
      <CoachNav userName={profile.full_name} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
}
