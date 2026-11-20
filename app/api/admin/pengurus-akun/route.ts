import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { normalizeUsername, usernameToAuthEmail } from '@/lib/supabase';

function getServerSupabaseAdmin() {
  const url = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''
  ).trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const anonKey = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''
  ).trim();

  if (!url || !serviceRoleKey) {
    return null;
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const verifier = anonKey
    ? createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
    : admin;

  return { admin, verifier };
}

function hasAdminOrSekretarisRole(jabatanRows: Array<{ divisi?: string; nama_jabatan?: string }>): boolean {
  return jabatanRows.some((j) => {
    const text = `${j.divisi || ''} ${j.nama_jabatan || ''}`.toLowerCase();
    return (
      text.includes('pengasuh') ||
      text.includes('dzurriyah') ||
      text.includes('kepala pondok') ||
      text.includes('sekretaris')
    );
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action?: 'create_account' | 'reset_password' | 'sync_status';
      pengurus_id?: string;
      username?: string;
      temporary_password?: string;
      status?: string;
    };

    const action = body?.action;
    const pengurusId = (body?.pengurus_id || '').trim();

    if (!action || !pengurusId) {
      return NextResponse.json(
        { error: 'Parameter action dan pengurus_id wajib diisi.' },
        { status: 400 }
      );
    }

    const clients = getServerSupabaseAdmin();
    if (!clients) {
      return NextResponse.json(
        {
          error:
            'SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di server. Tambahkan environment variable SUPABASE_SERVICE_ROLE_KEY untuk mengaktifkan manajemen akun terpusat.',
          code: 'MISSING_SERVICE_ROLE_KEY',
        },
        { status: 503 }
      );
    }

    const { admin, verifier } = clients;

    // Verifikasi token pemanggil dari header Authorization Bearer
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return NextResponse.json({ error: 'Token otorisasi tidak ditemukan.' }, { status: 401 });
    }

    const { data: callerAuth, error: callerErr } = await verifier.auth.getUser(token);
    if (callerErr || !callerAuth?.user) {
      return NextResponse.json({ error: 'Sesi pemanggil tidak valid.' }, { status: 401 });
    }

    // Pastikan pemanggil adalah pengurus aktif dengan jabatan Pimpinan Inti atau Sekretaris
    const { data: callerPengurus } = await admin
      .from('pengurus')
      .select('id, status')
      .eq('auth_user_id', callerAuth.user.id)
      .maybeSingle();

    if (!callerPengurus || String(callerPengurus.status || '').toLowerCase() !== 'aktif') {
      return NextResponse.json({ error: 'Akun pemanggil tidak aktif.' }, { status: 403 });
    }

    const { data: callerJabs } = await admin
      .from('pengurus_jabatan')
      .select('divisi, nama_jabatan')
      .eq('pengurus_id', callerPengurus.id);

    if (!hasAdminOrSekretarisRole((callerJabs || []) as Array<{ divisi?: string; nama_jabatan?: string }>)) {
      return NextResponse.json(
        { error: 'Hanya Admin Utama (Pimpinan Inti) atau Sekretaris yang berhak mengelola akun pengurus.' },
        { status: 403 }
      );
    }

    // Ambil data target pengurus
    const { data: target, error: targetErr } = await admin
      .from('pengurus')
      .select('id, nama_lengkap, username, auth_user_id, status')
      .eq('id', pengurusId)
      .maybeSingle();

    if (targetErr || !target) {
      return NextResponse.json({ error: 'Data pengurus target tidak ditemukan.' }, { status: 404 });
    }

    if (action === 'create_account') {
      const uname = normalizeUsername(body.username || target.username || '');
      const tempPw = (body.temporary_password || '').trim();
      if (!uname || uname.length < 3) {
        return NextResponse.json({ error: 'Username minimal 3 karakter (huruf/angka/titik).' }, { status: 400 });
      }
      if (tempPw.length < 6) {
        return NextResponse.json({ error: 'Password sementara minimal 6 karakter.' }, { status: 400 });
      }

      const { data: dupUser } = await admin
        .from('pengurus')
        .select('id')
        .ilike('username', uname)
        .neq('id', pengurusId)
        .maybeSingle();

      if (dupUser) {
        return NextResponse.json(
          { error: `Username "${uname}" sudah digunakan pengurus lain.` },
          { status: 409 }
        );
      }

      const email = usernameToAuthEmail(uname);
      let authUserId = target.auth_user_id as string | null;

      if (authUserId) {
        const { error: updErr } = await admin.auth.admin.updateUserById(authUserId, {
          email,
          password: tempPw,
          email_confirm: true,
          ban_duration: String(target.status || 'aktif').toLowerCase() === 'aktif' ? 'none' : '876000h',
          user_metadata: { pengurus_id: pengurusId, username: uname, nama_lengkap: target.nama_lengkap },
        });
        if (updErr) {
          return NextResponse.json({ error: updErr.message }, { status: 400 });
        }
      } else {
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email,
          password: tempPw,
          email_confirm: true,
          user_metadata: { pengurus_id: pengurusId, username: uname, nama_lengkap: target.nama_lengkap },
        });
        if (createErr || !created?.user) {
          return NextResponse.json(
            { error: createErr?.message || 'Gagal membuat akun di Supabase Auth.' },
            { status: 400 }
          );
        }
        authUserId = created.user.id;
      }

      const { error: dbUpdErr } = await admin
        .from('pengurus')
        .update({
          auth_user_id: authUserId,
          username: uname,
          must_change_password: true,
        })
        .eq('id', pengurusId);

      if (dbUpdErr) {
        return NextResponse.json({ error: dbUpdErr.message }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        username: uname,
        auth_user_id: authUserId,
        must_change_password: true,
      });
    }

    if (action === 'reset_password') {
      const tempPw = (body.temporary_password || '').trim();
      if (tempPw.length < 6) {
        return NextResponse.json({ error: 'Password sementara baru minimal 6 karakter.' }, { status: 400 });
      }
      if (!target.auth_user_id) {
        return NextResponse.json(
          { error: 'Pengurus ini belum memiliki akun login. Buat akun terlebih dahulu.' },
          { status: 400 }
        );
      }

      const { error: resetErr } = await admin.auth.admin.updateUserById(
        String(target.auth_user_id),
        { password: tempPw }
      );
      if (resetErr) {
        return NextResponse.json({ error: resetErr.message }, { status: 400 });
      }

      await admin
        .from('pengurus')
        .update({ must_change_password: true })
        .eq('id', pengurusId);

      return NextResponse.json({ ok: true, must_change_password: true });
    }

    if (action === 'sync_status') {
      const nextStatus = String(body.status || target.status || 'aktif').toLowerCase();
      if (target.auth_user_id) {
        await admin.auth.admin.updateUserById(String(target.auth_user_id), {
          ban_duration: nextStatus === 'aktif' ? 'none' : '876000h',
        });
      }
      return NextResponse.json({ ok: true, status: nextStatus });
    }

    return NextResponse.json({ error: 'Action tidak dikenali.' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Terjadi kesalahan server.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
