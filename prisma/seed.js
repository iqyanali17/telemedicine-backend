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
  console.info(`✅ Admin seeded: ${admin.email}`);

  // 2. Seed 5 Doctors with diverse specialties, experience, and fees
  const doctorsData = [
    {
      email: 'dr.ayur@amrutam.local',
      firstName: 'Ananya',
      lastName: 'Sharma',
      phone: '+919999900002',
      gender: 'FEMALE',
      licenseNumber: 'AYUR-MED-2024-001',
      specialization: 'Ayurvedic Medicine & Panchakarma',
      experienceYears: 8,
      consultationFee: 750.00,
      qualification: 'BAMS, MD (Ayurveda)',
      bio: 'Specialist in holistic lifestyle disorders, stress management, and traditional panchakarma therapies.',
    },
    {
      email: 'dr.vikram@amrutam.local',
      firstName: 'Vikramaditya',
      lastName: 'Joshi',
      phone: '+919999900004',
      gender: 'MALE',
      licenseNumber: 'AYUR-MED-2024-002',
      specialization: 'Kayachikitsa & Chronic Metabolism',
      experienceYears: 14,
      consultationFee: 900.00,
      qualification: 'BAMS, MD (Kayachikitsa), PhD',
      bio: 'Senior Ayurvedic physician specializing in metabolic disorders, type-2 diabetes reversal, and digestive wellness.',
    },
    {
      email: 'dr.priya@amrutam.local',
      firstName: 'Priya',
      lastName: 'Nair',
      phone: '+919999900005',
      gender: 'FEMALE',
      licenseNumber: 'AYUR-MED-2024-003',
      specialization: 'Ayurvedic Dermatology & Trichology',
      experienceYears: 6,
      consultationFee: 650.00,
      qualification: 'BAMS, Fellowship in Ayurvedic Cosmetology',
      bio: 'Expert in herbal skin care, chronic eczema, psoriasis management, and hair fall therapies using classical rasayana.',
    },
    {
      email: 'dr.rajesh@amrutam.local',
      firstName: 'Rajesh',
      lastName: 'Kulkarni',
      phone: '+919999900006',
      gender: 'MALE',
      licenseNumber: 'AYUR-MED-2024-004',
      specialization: 'Shalya Tantra & Spine Health',
      experienceYears: 12,
      consultationFee: 800.00,
      qualification: 'BAMS, MS (Ayurveda - Shalya)',
      bio: 'Specialist in non-invasive management of joint pain, sciatica, arthritis, and marma therapy rehabilitation.',
    },
    {
      email: 'dr.meera@amrutam.local',
      firstName: 'Meera',
      lastName: 'Iyer',
      phone: '+919999900007',
      gender: 'FEMALE',
      licenseNumber: 'AYUR-MED-2024-005',
      specialization: 'Prasuti & Stri Roga (Women Health)',
      experienceYears: 10,
      consultationFee: 700.00,
      qualification: 'BAMS, MD (Stri Roga)',
      bio: 'Holistic women wellness physician focusing on PCOS/PCOD, hormonal imbalance, fertility, and post-partum Ayurvedic care.',
    },
  ];

  for (const doc of doctorsData) {
    const doctor = await prisma.user.upsert({
      where: { email: doc.email },
      update: {},
      create: {
        email: doc.email,
        passwordHash,
        role: 'DOCTOR',
        profile: {
          create: {
            firstName: doc.firstName,
            lastName: doc.lastName,
            phone: doc.phone,
            gender: doc.gender,
          },
        },
        doctorProfile: {
          create: {
            licenseNumber: doc.licenseNumber,
            specialization: doc.specialization,
            experienceYears: doc.experienceYears,
            consultationFee: doc.consultationFee,
            qualification: doc.qualification,
            bio: doc.bio,
            isVerified: true,
          },
        },
      },
      include: { doctorProfile: true },
    });

    // Seed open availability slots for this doctor for the next 7 days
    if (doctor.doctorProfile) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);

      const endTime = new Date(tomorrow);
      endTime.setMinutes(endTime.getMinutes() + 30);

      const slotExists = await prisma.availabilitySlot.findFirst({
        where: { doctorId: doctor.doctorProfile.id },
      });

      if (!slotExists) {
        await prisma.availabilitySlot.create({
          data: {
            doctorId: doctor.doctorProfile.id,
            startTime: tomorrow,
            endTime,
            status: 'AVAILABLE',
          },
        });
      }
    }

    console.info(`✅ Doctor seeded: Dr. ${doc.firstName} ${doc.lastName} (${doc.email})`);
  }

  // 3. Seed Patients
  const patientsData = [
    {
      email: 'patient@amrutam.local',
      firstName: 'Rahul',
      lastName: 'Verma',
      phone: '+919999900003',
      gender: 'MALE',
      bloodGroup: 'B+',
    },
    {
      email: 'patient2@amrutam.local',
      firstName: 'Sunita',
      lastName: 'Patel',
      phone: '+919999900008',
      gender: 'FEMALE',
      bloodGroup: 'O+',
    },
  ];

  for (const pat of patientsData) {
    const patient = await prisma.user.upsert({
      where: { email: pat.email },
      update: {},
      create: {
        email: pat.email,
        passwordHash,
        role: 'PATIENT',
        profile: {
          create: {
            firstName: pat.firstName,
            lastName: pat.lastName,
            phone: pat.phone,
            gender: pat.gender,
            bloodGroup: pat.bloodGroup,
          },
        },
      },
    });
    console.info(`✅ Patient seeded: ${patient.email}`);
  }

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
