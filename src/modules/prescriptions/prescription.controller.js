import { PrescriptionService } from './prescription.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { asyncHandler } from '../../utils/async-handler.js';

export class PrescriptionController {
  static create = asyncHandler(async (req, res) => {
    const prescription = await PrescriptionService.createPrescription(req.user.id, req.body);
    return ApiResponse.created(res, 'Prescription issued successfully', prescription);
  });

  static getByConsultation = asyncHandler(async (req, res) => {
    const prescription = await PrescriptionService.getPrescriptionByConsultation(
      req.user,
      req.params.consultationId
    );
    return ApiResponse.ok(res, 'Prescription retrieved successfully', prescription);
  });

  static getById = asyncHandler(async (req, res) => {
    const prescription = await PrescriptionService.getPrescriptionById(req.user, req.params.id);
    return ApiResponse.ok(res, 'Prescription retrieved successfully', prescription);
  });

  static downloadPdf = asyncHandler(async (req, res) => {
    const pdfStream = await PrescriptionService.generatePrescriptionPdfStream(req.user, req.params.id);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="prescription-${req.params.id}.pdf"`);

    pdfStream.pipe(res);
  });
}
