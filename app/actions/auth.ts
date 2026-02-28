'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function handleSignOut() {
  const cookieStore = await cookies();
  // NextAuth v5 session cookie names (HTTPS prod + HTTP dev variants)
  cookieStore.delete('__Secure-authjs.session-token');
  cookieStore.delete('__Host-authjs.csrf-token');
  cookieStore.delete('authjs.session-token');
  cookieStore.delete('authjs.csrf-token');
  redirect('/login');
}
