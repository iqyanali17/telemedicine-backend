import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/config/database.js';

dotenv.config();

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, ...values] = arg.slice(2).split('=');
      parsed[key] = values.join('=');
    }
  }
  return parsed;
}

async function createAccount() {
  const args = parseArgs();
  const role = (args.role || '').toUpperCase();

  if (!['ADMIN', 'DOCTOR'].includes(role)) {
    console.error('Error: --role must be either ADMIN or DOCTOR.');
    console.info('\nUsage:');
    console.info('  node scripts/create-account.js --role=ADMIN --email=admin@example.com --password=Password123! --firstName=System --lastName=Admin [--phone=9876543210]');
    console.info('  node scripts/create-account.js --role=DOCTOR --email=doc@example.com --password=Password123! --firstName=Aarav --lastName=Patel --licenseNumber=MED-12345 --specialization="Ayurveda" [--phone=9876543211] [--experienceYears=8] [--consultationFee=750] [--qualification="BAMS"]');
    process.exit(1);
  }

  const {
    email,
    password,
    firstName = 'Admin',
    lastName = 'User',
    phone,
    licenseNumber,
    specialization = 'General Medicine',
    experienceYears = '5',
    consultationFee = '500',
    qualification = 'MBBS / BAMS',
    bio = 'Medical practitioner',
  } = args;

  if (!email || !password) {
    console.error('Error: Both --email and --password are required.');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('Error: Password must be at least 8 characters long.');
    process.exit(1);
  }

  if (role === 'DOCTOR' && !licenseNumber) {
    console.error('Error: --licenseNumber is required when creating a DOCTOR account.');
    process.exit(1);
  }

  try {
    // Check if user email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (existingUser) {
      console.error(`Error: A user with email "${email}" already exists.`);
      process.exit(1);
    }

    // Check if phone already exists
    if (phone) {
      const existingPhone = await prisma.profile.findUnique({
        where: { phone: phone.trim() },
      });
      if (existingPhone) {
        console.error(`Error: A profile with phone number "${phone}" already exists.`);
        process.exit(1);
      }
    }

    // Check if licenseNumber exists for doctor
    if (role === 'DOCTOR' && licenseNumber) {
      const existingLicense = await prisma.doctorProfile.findUnique({
        where: { licenseNumber: licenseNumber.trim() },
      });
      if (existingLicense) {
        console.error(`Error: A doctor with license number "${licenseNumber}" already exists.`);
        process.exit(1);
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const cleanEmail = email.toLowerCase().trim();
    const cleanPhone = phone ? phone.trim() : null;

    if (role === 'ADMIN') {
      const admin = await prisma.user.create({
        data: {
          email: cleanEmail,
          passwordHash,
          role: 'ADMIN',
          profile: {
            create: {
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              phone: cleanPhone,
            },
          },
        },
        include: { profile: true },
      });

      console.info('\n✅ Admin account created successfully:');
      console.info(`   ID:        ${admin.id}`);
      console.info(`   Email:     ${admin.email}`);
      console.info(`   Role:      ${admin.role}`);
      console.info(`   Name:      ${admin.profile?.firstName} ${admin.profile?.lastName}`);
      console.info(`   Phone:     ${admin.profile?.phone || 'N/A'}`);
    } else if (role === 'DOCTOR') {
      const doctor = await prisma.user.create({
        data: {
          email: cleanEmail,
          passwordHash,
          role: 'DOCTOR',
          profile: {
            create: {
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              phone: cleanPhone,
            },
          },
          doctorProfile: {
            create: {
              licenseNumber: licenseNumber.trim(),
              specialization: specialization.trim(),
              experienceYears: parseInt(experienceYears, 10) || 5,
              consultationFee: parseFloat(consultationFee) || 500.0,
              qualification: qualification.trim(),
              bio: bio.trim(),
              isVerified: true,
            },
          },
        },
        include: { profile: true, doctorProfile: true },
      });

      console.info('\n✅ Doctor account created successfully:');
      console.info(`   ID:             ${doctor.id}`);
      console.info(`   Email:          ${doctor.email}`);
      console.info(`   Role:           ${doctor.role}`);
      console.info(`   Name:           Dr. ${doctor.profile?.firstName} ${doctor.profile?.lastName}`);
      console.info(`   License Number: ${doctor.doctorProfile?.licenseNumber}`);
      console.info(`   Specialization: ${doctor.doctorProfile?.specialization}`);
      console.info(`   Fee:            INR ${doctor.doctorProfile?.consultationFee}`);
      console.info(`   Verified:       ${doctor.doctorProfile?.isVerified}`);
    }
  } catch (error) {
    console.error('Failed to create account:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createAccount();
