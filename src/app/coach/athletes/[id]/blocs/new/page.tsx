import NewBlockForm from '@/components/coach/NewBlockForm'

export default async function NewBlocPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <NewBlockForm athleteId={id} />
}
