import { createClient } from "../../utils/supabase/server";
import { cookies } from "next/headers";

export default async function Page() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: todos } = await supabase.from('todos').select();

  return (
    <main className="page-shell">
      <h1>Supabase Demo</h1>
      <ul>
        {todos?.map((todo: { id: string; name: string }) => (
          <li key={todo.id}>{todo.name}</li>
        ))}
      </ul>
    </main>
  );
}
