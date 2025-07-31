import { describe, expect, it } from 'vitest';
import { generateInvoicePDF, printInvoice, exportElementAsPDF } from '../pdfGenerator';

// Mock jsPDF and html2canvas for tests where they would be called
vi.mock('jspdf', () => ({
  default: vi
    .fn()
    .mockImplementation(() => ({
      addImage: vi.fn(),
      addPage: vi.fn(),
      save: vi.fn(),
      internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
    })),
}));
vi.mock('html2canvas', () => ({ default: vi.fn() }));

describe('pdfGenerator utilities', () => {
  it('generateInvoicePDF throws when element missing', async () => {
    await expect(generateInvoicePDF()).rejects.toThrow(
      'Élément de la facture non trouvé'
    );
  });

  it('printInvoice throws when element missing', () => {
    expect(() => printInvoice()).toThrow('Élément de la facture non trouvé');
  });

  it('exportElementAsPDF throws when element missing', async () => {
    await expect(exportElementAsPDF('missing', 'test')).rejects.toThrow(
      'Élément non trouvé'
    );
  });
});
