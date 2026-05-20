import RoomClient from '../../../components/RoomClient';

interface RoomPageProps {
  params: Promise<{
    roomCode: string;
  }>;
  searchParams: Promise<{
    playerId?: string;
  }>;
}

export default async function RoomPage({ params, searchParams }: RoomPageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  return (
    <main className="page-shell">
      <RoomClient roomCode={resolvedParams.roomCode.toUpperCase()} playerId={resolvedSearchParams.playerId} />
    </main>
  );
}
