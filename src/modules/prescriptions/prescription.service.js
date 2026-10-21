import PDFDocument from 'pdfkit';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/api-error.js';
import { NotificationDispatcher } from '../notifications/notification.dispatcher.js';

export class PrescriptionService {
  /**
   * Creates a medical prescription for an active/completed consultation
   */
  static async createPrescription(userId, data) {
    const doctorProfile = await prisma.doctorProfile.findUnique({
      where: { userId },
    });

    if (!doctorProfile) {
      throw ApiError.forbidden('Only doctors can issue prescriptions');
    }

    const consultation = await prisma.consultation.findUnique({
      where: { id: data.consultationId },
      include: {
        patient: true,
        doctor: { include: { user: { include: { profile: true } } } },
      },
    });

    if (!consultation) {
      throw ApiError.notFound('Consultation not found');
    }

    if (consultation.doctorId !== doctorProfile.id) {
      throw ApiError.forbidden('You are not authorized to issue a prescription for this consultation');
    }

    // Clinical eligibility validation: Prescription can only be issued during or upon completing a consultation
    if (consultation.status === 'CANCELLED') {
      throw ApiError.conflict('Cannot issue a prescription for a cancelled consultation');
    }

    if (consultation.status === 'NO_SHOW') {
      throw ApiError.conflict('Cannot issue a prescription for a no-show consultation');
    }

    if (consultation.status === 'SCHEDULED' || consultation.status === 'REQUESTED') {
      throw ApiError.conflict('Consultation must be started and in-progress before issuing a prescription');
    }

    if (consultation.status !== 'IN_PROGRESS' && consultation.status !== 'COMPLETED') {
      throw ApiError.conflict(`Consultation status '${consultation.status}' is not eligible for prescription issuance`);
    }

    const result = await prisma.$transaction(async (tx) => {
      const prescription = await tx.prescription.create({
        data: {
          consultationId: data.consultationId,
          doctorId: doctorProfile.id,
          patientId: consultation.patientId,
          diagnosis: data.diagnosis,
          medicines: data.medicines,
          instructions: data.instructions,
          validUntil: data.validUntil ? new Date(data.validUntil) : null,
        },
        include: {
          doctor: {
            select: {
              licenseNumber: true,
              specialization: true,
              qualification: true,
              user: { select: { profile: true } },
            },
          },
          patient: {
            select: {
              email: true,
              profile: true,
            },
          },
          consultation: {
            select: {
              consultationNumber: true,
              scheduledAt: true,
            },
          },
        },
      });

      // Automatically transition IN_PROGRESS to COMPLETED upon prescription issuance
      if (consultation.status === 'IN_PROGRESS') {
        await tx.consultation.update({
          where: { id: consultation.id },
          data: {
            status: 'COMPLETED',
            endedAt: new Date(),
          },
        });
      }

      return prescription;
    });

    NotificationDispatcher.notifyPrescriptionIssued(result, consultation);

    return result;
  }

  /**
   * Retrieves prescription by consultation ID with object-level authorization
   */
  static async getPrescriptionByConsultation(user, consultationId) {
    const prescription = await prisma.prescription.findUnique({
      where: { consultationId },
      include: {
        doctor: {
          select: {
            id: true,
            specialization: true,
            qualification: true,
            licenseNumber: true,
            user: { select: { profile: { select: { firstName: true, lastName: true } } } },
          },
        },
        patient: {
          select: {
            profile: true,
          },
        },
        consultation: {
          select: {
            consultationNumber: true,
            scheduledAt: true,
          },
        },
      },
    });

    if (!prescription) {
      throw ApiError.notFound('Prescription not found');
    }

    // Object-level authorization check
    if (user.role === 'PATIENT' && prescription.patientId !== user.id) {
      throw ApiError.forbidden('Not authorized to access this prescription');
    }

    if (user.role === 'DOCTOR') {
      const doctorProfile = await prisma.doctorProfile.findUnique({
        where: { userId: user.id },
      });
      if (!doctorProfile || prescription.doctorId !== doctorProfile.id) {
        throw ApiError.forbidden('Not authorized to access this prescription');
      }
    }

    return prescription;
  }

  /**
   * Retrieves prescription by ID with object-level authorization
   */
  static async getPrescriptionById(user, id) {
    const prescription = await prisma.prescription.findUnique({
      where: { id },
      include: {
        doctor: {
          select: {
            id: true,
            specialization: true,
            qualification: true,
            licenseNumber: true,
            user: { select: { profile: { select: { firstName: true, lastName: true } } } },
          },
        },
        patient: {
          select: {
            id: true,
            email: true,
            profile: true,
          },
        },
        consultation: {
          select: {
            consultationNumber: true,
            scheduledAt: true,
          },
        },
      },
    });

    if (!prescription) {
      throw ApiError.notFound('Prescription not found');
    }

    // Object-level authorization check
    if (user.role === 'PATIENT' && prescription.patientId !== user.id) {
      throw ApiError.forbidden('Not authorized to access this prescription');
    }

    if (user.role === 'DOCTOR') {
      const doctorProfile = await prisma.doctorProfile.findUnique({
        where: { userId: user.id },
      });
      if (!doctorProfile || prescription.doctorId !== doctorProfile.id) {
        throw ApiError.forbidden('Not authorized to access this prescription');
      }
    }

    return prescription;
  }

  /**
   * Generates a clinical prescription PDF stream
   */
  static async generatePrescriptionPdfStream(user, id) {
    const prescription = await this.getPrescriptionById(user, id);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    // Clinic Header
    doc
      .fontSize(20)
      .fillColor('#2d6a4f')
      .text('AMRUTAM AYURVEDA TELEMEDICINE', { align: 'center' });
    doc
      .fontSize(10)
      .fillColor('#6c757d')
      .text('Holistic Healthcare & Online Consultations', {
        align: 'center',
      });
    doc.moveDown(1);
    doc.strokeColor('#e9ecef').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    // Doctor & Patient Two-Column Summary
    const doctorName = `Dr. ${prescription.doctor.user.profile?.firstName || ''} ${prescription.doctor.user.profile?.lastName || ''}`;
    const patientName = `${prescription.patient.profile?.firstName || 'Patient'} ${prescription.patient.profile?.lastName || ''}`;
    const dateStr = new Date(prescription.createdAt).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    doc.fontSize(11).fillColor('#212529');
    doc.text(`Doctor: ${doctorName}`, 50, doc.y, { continued: true });
    doc.text(`Date: ${dateStr}`, { align: 'right' });

    doc.text(`Qualification: ${prescription.doctor.qualification || 'BAMS'}`, 50, doc.y, { continued: true });
    doc.text(`Consultation #: ${prescription.consultation?.consultationNumber || 'N/A'}`, { align: 'right' });

    doc.text(`License No: ${prescription.doctor.licenseNumber}`, 50, doc.y, { continued: true });
    doc.text(`Patient: ${patientName}`, { align: 'right' });

    doc.text(`Specialization: ${prescription.doctor.specialization}`, 50, doc.y);
    doc.moveDown(1.5);

    // Diagnosis Section
    doc.strokeColor('#2d6a4f').lineWidth(2).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fontSize(13).fillColor('#2d6a4f').text('CLINICAL ASSESSMENT & DIAGNOSIS:');
    doc.fontSize(11).fillColor('#343a40').text(prescription.diagnosis);
    doc.moveDown(1.5);

    // Rx Section (Medicines)
    doc.fontSize(14).fillColor('#2d6a4f').text('Rx (PRESCRIPTION DETAILS):');
    doc.moveDown(0.5);

    const medicines = Array.isArray(prescription.medicines) ? prescription.medicines : [];
    medicines.forEach((med, index) => {
      doc.fontSize(11).fillColor('#1b4332').text(`${index + 1}. ${med.name}`);
      doc
        .fontSize(10)
        .fillColor('#495057')
        .text(`   Dosage: ${med.dosage} | Frequency: ${med.frequency} | Duration: ${med.duration}`);
      if (med.instructions) {
        doc.fontSize(9).fillColor('#6c757d').text(`   Instructions: ${med.instructions}`);
      }
      doc.moveDown(0.5);
    });

    if (prescription.instructions) {
      doc.moveDown(1);
      doc.fontSize(12).fillColor('#2d6a4f').text('DIETARY & LIFESTYLE ADVICE:');
      doc.fontSize(10).fillColor('#343a40').text(prescription.instructions);
    }

    // Footer & Digital Verification Seal
    doc.moveDown(2);
    doc.strokeColor('#e9ecef').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);
    doc
      .fontSize(9)
      .fillColor('#adb5bd')
      .text('This prescription is electronically generated through the Amrutam Telemedicine Platform.', {
        align: 'center',
      });
    doc
      .fontSize(8)
      .fillColor('#adb5bd')
      .text(`Document ID: ${prescription.id} | Validated in accordance with Telemedicine Practice Guidelines.`, {
        align: 'center',
      });

    doc.end();
    return doc;
  }
}
