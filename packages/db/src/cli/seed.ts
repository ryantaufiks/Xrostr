import { hash } from '@node-rs/argon2';
import { createDatabase } from '../client.js';
import { platformAdmins } from '../schema/index.js';
import { requireEnv } from './env.js';

// Seeds the first platform superadmin. TOTP enrolment is forced on first login.
const handle = createDatabase(requireEnv('DATABASE_OWNER_URL'), { max: 1 });
try {
  const email = requireEnv('SEED_SUPERADMIN_EMAIL').trim().toLowerCase();
  const passwordHash = await hash(requireEnv('SEED_SUPERADMIN_PASSWORD'));
  const inserted = await handle.db
    .insert(platformAdmins)
    .values({ email, fullName: 'Platform Superadmin', passwordHash })
    .onConflictDoNothing({ target: platformAdmins.email })
    .returning({ id: platformAdmins.id });
  console.log(
    inserted.length ? `Created superadmin ${email}.` : `Superadmin ${email} already exists.`,
  );
} finally {
  await handle.close();
}
