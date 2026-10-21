import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/api-error.js';

export class AvailabilityService {
  static async getSlots({ doctorId, date, status = 'AVAILABLE' }) {
    let startTimeFilter;
    if (date) {
      const startOfDay = new Date(`${date}T00:00:00.000Z`);
      const endOfDay = new Date(`${date}T23:59:59.999Z`);
      startTimeFilter = { gte: startOfDay, lte: endOfDay };
    }

    return prisma.availabilitySlot.findMany({
      where: {
        ...(doctorId && { doctorId }),
        ...(status && { status }),
        ...(startTimeFilter && { startTime: startTimeFilter }),
      },
      include: {
        doctor: {
          select: {
            id: true,
            specialization: true,
            consultationFee: true,
            user: {
              select: {
                profile: {
                  select: { firstName: true, lastName: true },
                },
              },
            },
          },
        },
      },
      orderBy: { startTime: 'asc' },
    });
  }

  static async createSlots(userId, slotsData) {
    const doctorProfile = await prisma.doctorProfile.findUnique({
      where: { userId },
    });

    if (!doctorProfile) {
      throw ApiError.forbidden('Only registered doctors can create availability slots');
    }

    // Insert slots ignoring duplicates
    const records = slotsData.map((slot) => ({
      doctorId: doctorProfile.id,
      startTime: new Date(slot.startTime),
      endTime: new Date(slot.endTime),
      status: 'AVAILABLE',
    }));

    return prisma.availabilitySlot.createMany({
      data: records,
      skipDuplicates: true,
    });
  }

  static async deleteSlot(userId, slotId) {
    const doctorProfile = await prisma.doctorProfile.findUnique({
      where: { userId },
    });

    if (!doctorProfile) {
      throw ApiError.forbidden('Only registered doctors can delete availability slots');
    }

    const slot = await prisma.availabilitySlot.findUnique({
      where: { id: slotId },
    });

    if (!slot) {
      throw ApiError.notFound('Availability slot not found');
    }

    if (slot.doctorId !== doctorProfile.id) {
      throw ApiError.forbidden('You can only delete your own availability slots');
    }

    if (slot.status === 'BOOKED') {
      throw ApiError.conflict('Cannot delete an availability slot that has already been booked');
    }

    const linkedConsultation = await prisma.consultation.findFirst({
      where: { slotId },
    });

    if (linkedConsultation) {
      throw ApiError.conflict('Cannot delete an availability slot that has associated consultation history');
    }

    return prisma.availabilitySlot.delete({
      where: { id: slotId },
    });
  }
}
