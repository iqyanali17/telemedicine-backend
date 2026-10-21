import { TotpUtil } from '../src/utils/totp.js';

const secret = process.argv[2];

if (!secret) {
  console.error('Please provide your Base32 secret from /auth/mfa/setup:');
  console.info('Example: node scripts/generate-mfa-code.js JBSWY3DPEHPK3PXP...');
  process.exit(1);
}

try {
  const code = TotpUtil.generateTotp(secret.trim());
  console.info('\n🔐 Your 6-Digit MFA Verification Code:');
  console.info(`   >>> ${code} <<<`);
  console.info('\n(Valid for 30 seconds. Enter this in POST /auth/mfa/verify)\n');
} catch (error) {
  console.error('Error generating code:', error.message);
  process.exit(1);
}
