import { ConsultationService } from './consultation.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { asyncHandler } from '../../utils/async-handler.js';

export class ConsultationController {
  static book = asyncHandler(async (req, res) => {
    const consultation = await ConsultationService.bookConsultation(req.user.id, req.body);
    return ApiResponse.created(res, 'Consultation booked successfully', consultation);
  });

  static list = asyncHandler(async (req, res) => {
    const result = await ConsultationService.getConsultations(req.user, req.query);

    const summary = {
      total: result.pagination.total,
      scheduled: result.consultations.filter((c) => c.status === 'SCHEDULED').length,
      inProgress: result.consultations.filter((c) => c.status === 'IN_PROGRESS').length,
      completed: result.consultations.filter((c) => c.status === 'COMPLETED').length,
      cancelled: result.consultations.filter((c) => c.status === 'CANCELLED').length,
    };

    const items = result.consultations.map((c) => {
      const docFirst = c.doctor?.user?.profile?.firstName || '';
      const docLast = c.doctor?.user?.profile?.lastName || '';
      const patFirst = c.patient?.profile?.firstName || '';
      const patLast = c.patient?.profile?.lastName || '';

      return {
        id: c.id,
        consultationNumber: c.consultationNumber,
        status: c.status,
        scheduledAt: c.scheduledAt,
        doctorName: `${docFirst} ${docLast}`.trim() || 'Doctor',
        patientName: `${patFirst} ${patLast}`.trim() || 'Patient',
        paymentStatus: c.payment?.status || 'PENDING',
        ...c,
      };
    });

    return ApiResponse.paginated(
      res,
      'Consultations retrieved successfully',
      { summary, items },
      result.pagination
    );
  });

  static getById = asyncHandler(async (req, res) => {
    const consultation = await ConsultationService.getConsultationById(req.user, req.params.id);
    const docFirst = consultation.doctor?.user?.profile?.firstName || '';
    const docLast = consultation.doctor?.user?.profile?.lastName || '';
    const patFirst = consultation.patient?.profile?.firstName || '';
    const patLast = consultation.patient?.profile?.lastName || '';

    const summary = {
      consultationNumber: consultation.consultationNumber,
      status: consultation.status,
      scheduledAt: consultation.scheduledAt,
      doctorName: `${docFirst} ${docLast}`.trim() || 'Doctor',
      patientName: `${patFirst} ${patLast}`.trim() || 'Patient',
      paymentStatus: consultation.payment?.status || 'PENDING',
      hasPrescription: Boolean(consultation.prescription),
    };

    return ApiResponse.ok(res, 'Consultation retrieved successfully', {
      summary,
      consultation,
      ...consultation,
    });
  });

  static updateStatus = asyncHandler(async (req, res) => {
    const updated = await ConsultationService.updateConsultationStatus(req.user, req.params.id, req.body);
    return ApiResponse.ok(res, 'Consultation status updated successfully', updated);
  });
}
