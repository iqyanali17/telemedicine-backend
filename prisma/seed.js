import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.info('Starting database seed...');

  const passwordHash = await bcrypt.hash('DemoPassword123!', 10);

  // 1. Seed Admin
  const admin = await prisma.user.upsert({
    where: { email: 'admin@amrutam.local' },
    update: {},
    create: {
      email: 'admin@amrutam.local',
      passwordHash,
      role: 'ADMIN',
      profile: {
        create: {
          firstName: 'System',
          lastName: 'Administrator',
          phone: '+919999900001',
        },
      },
    },
  });
  console.info(`Admin seeded: ${admin.email}`);

  // 2. Seed Doctor
  const doctor = await prisma.user.upsert({
    where: { email: 'dr.ayur@amrutam.local' },
    update: {},
    create: {
      email: 'dr.ayur@amrutam.local',
      passwordHash,
      role: 'DOCTOR',
      profile: {
        create: {
          firstName: 'Ananya',
          lastName: 'Sharma',
          phone: '+919999900002',
          gender: 'FEMALE',
        },
      },
      doctorProfile: {
        create: {
          licenseNumber: 'AYUR-MED-2024-001',
          specialization: 'Ayurvedic Medicine & Panchakarma',
          experienceYears: 8,
          consultationFee: 750.00,
          qualification: 'BAMS, MD (Ayurveda)',
          bio: 'Specialist in holistic lifestyle disorders, stress management, and traditional panchakarma therapies.',
          isVerified: true,
        },
      },
    },
  });
  console.info(`Doctor seeded: ${doctor.email}`);

  // 3. Seed Patient
  const patient = await prisma.user.upsert({
    where: { email: 'patient@amrutam.local' },
    update: {},
    create: {
      email: 'patient@amrutam.local',
      passwordHash,
      role: 'PATIENT',
      profile: {
        create: {
          firstName: 'Rahul',
          lastName: 'Verma',
          phone: '+919999900003',
          gender: 'MALE',
          bloodGroup: 'B+',
        },
      },
    },
  });
  console.info(`Patient seeded: ${patient.email}`);

  console.info('Database seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error('Database seed error:', e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
