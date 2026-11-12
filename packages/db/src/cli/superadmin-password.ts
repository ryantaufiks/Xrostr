import { hash } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import { createDatabase } from '../client.js';
import { platformAdmins } from '../schema/index.js';
import { requireEnv, requireSuperadminPassword } from './env.js';

// Sets the superadmin password from SEED_SUPERADMIN_PASSWORD and lifts any lockout.
// Two-factor enrolment is left untouched.
const handle = createDatabase(requireEnv('DATABASE_OWNER_URL'), { max: 1 });
try {
  const email = requireEnv('SEED_SUPERADMIN_EMAIL').trim().toLowerCase();
  const passwordHash = await hash(requireSuperadminPassword());
  const updated = await handle.db
    .update(platformAdmins)
    .set({ passwordHash, failedLoginCount: 0, lockedUntil: null })
    .where(eq(platformAdmins.email, email))
    .returning({ id: platformAdmins.id });
  if (updated.length === 0) {
    console.error(`No superadmin ${email}. Run the seed first.`);
    process.exitCode = 1;
  } else {
    console.log(`Password updated for superadmin ${email}.`);
  }
} finally {
  await handle.close();
}
