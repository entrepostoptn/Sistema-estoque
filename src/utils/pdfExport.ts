import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Product, StockMovement } from '../types';

export interface StockSummaryRow {
  code: string;
  name: string;
  unit: string;
  entriesBoxes: number;
  entriesKg: number;
  exitsBoxes: number;
  exitsKg: number;
  currentBoxes: number;
  currentKg: number;
}

export function computeStockSummary(products: Product[], movements: StockMovement[]): StockSummaryRow[] {
  const map = new Map<string, StockSummaryRow>();

  // Initialize with products
  products.forEach(p => {
    map.set(p.id, {
      code: p.code,
      name: p.name,
      unit: p.unit || 'CAIXA',
      entriesBoxes: 0,
      entriesKg: 0,
      exitsBoxes: 0,
      exitsKg: 0,
      currentBoxes: 0,
      currentKg: 0
    });
  });

  // Accumulate valid movements
  movements.forEach(m => {
    if (m.status === 'CANCELLED') return;

    let row = map.get(m.productId);
    if (!row) {
      row = {
        code: m.productCode || '---',
        name: m.productName || 'Produto Não Cadastrado',
        unit: m.unit || 'CAIXA',
        entriesBoxes: 0,
        entriesKg: 0,
        exitsBoxes: 0,
        exitsKg: 0,
        currentBoxes: 0,
        currentKg: 0
      };
      map.set(m.productId, row);
    }

    if (m.type === 'ENTRADA') {
      row.entriesBoxes += m.boxes || 0;
      row.entriesKg += m.weightKg || 0;
      row.currentBoxes += m.boxes || 0;
      row.currentKg += m.weightKg || 0;
    } else if (m.type === 'SAIDA') {
      row.exitsBoxes += m.boxes || 0;
      row.exitsKg += m.weightKg || 0;
      row.currentBoxes -= m.boxes || 0;
      row.currentKg -= m.weightKg || 0;
    }
  });

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/**
 * Generates and downloads a formatted PDF document containing Stock Summary & Current Movements
 */
export function exportStockAndMovementsPDF(
  products: Product[],
  movements: StockMovement[],
  currentUserName?: string
) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const now = new Date();
  const dateFormatted = now.toLocaleDateString('pt-BR');
  const timeFormatted = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // Calculate stock summary
  const summaryRows = computeStockSummary(products, movements);

  const totalCurrentBoxes = summaryRows.reduce((acc, r) => acc + r.currentBoxes, 0);
  const totalCurrentKg = summaryRows.reduce((acc, r) => acc + r.currentKg, 0);
  const totalEntriesBoxes = summaryRows.reduce((acc, r) => acc + r.entriesBoxes, 0);
  const totalEntriesKg = summaryRows.reduce((acc, r) => acc + r.entriesKg, 0);
  const totalExitsBoxes = summaryRows.reduce((acc, r) => acc + r.exitsBoxes, 0);
  const totalExitsKg = summaryRows.reduce((acc, r) => acc + r.exitsKg, 0);

  // Filter recent movements (up to last 100 valid)
  const validMovements = movements
    .filter(m => m.status !== 'CANCELLED')
    .slice(0, 100);

  // Header banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, 210, 24, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('SISTEMA DE GESTÃO DE ESTOQUE - ENTREPOSTO', 14, 11);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('RELATÓRIO OFICIAL: RESUMO DE ESTOQUE E MOVIMENTAÇÕES', 14, 18);

  doc.setFontSize(8);
  doc.text(`Emissão: ${dateFormatted} às ${timeFormatted}`, 196, 11, { align: 'right' });
  doc.text(`Operador: ${currentUserName || 'Sistema'}`, 196, 18, { align: 'right' });

  // KPI Summary Cards
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(14, 28, 58, 18, 2, 2, 'FD');
  doc.roundedRect(76, 28, 58, 18, 2, 2, 'FD');
  doc.roundedRect(138, 28, 58, 18, 2, 2, 'FD');

  doc.setTextColor(100, 116, 139); // slate-500
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL ENTRADAS', 18, 33);
  doc.text('TOTAL SAÍDAS', 80, 33);
  doc.text('SALDO ATUAL EM ESTOQUE', 142, 33);

  doc.setTextColor(5, 150, 105); // emerald-600
  doc.setFontSize(10);
  doc.text(`${totalEntriesBoxes.toLocaleString('pt-BR')} cx  /  ${totalEntriesKg.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} kg`, 18, 41);

  doc.setTextColor(2, 132, 199); // sky-600
  doc.text(`${totalExitsBoxes.toLocaleString('pt-BR')} cx  /  ${totalExitsKg.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} kg`, 80, 41);

  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(`${totalCurrentBoxes.toLocaleString('pt-BR')} cx  /  ${totalCurrentKg.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} kg`, 142, 41);

  // Section 1: Stock Summary Table
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('1. RESUMO DO ESTOQUE ATUAL POR PRODUTO', 14, 53);

  const stockTableData = summaryRows.map(row => [
    row.code,
    row.name,
    row.unit,
    `${row.entriesBoxes} cx\n${row.entriesKg.toFixed(1)} kg`,
    `${row.exitsBoxes} cx\n${row.exitsKg.toFixed(1)} kg`,
    row.currentBoxes.toString(),
    `${row.currentKg.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} kg`
  ]);

  autoTable(doc, {
    startY: 56,
    head: [['Cód.', 'Produto', 'Unidade', 'Entradas', 'Saídas', 'Saldo (Cx)', 'Saldo (Kg)']],
    body: stockTableData,
    theme: 'striped',
    styles: {
      fontSize: 8,
      cellPadding: 2,
      lineColor: [226, 232, 240],
      lineWidth: 0.1
    },
    headStyles: {
      fillColor: [30, 41, 59], // slate-800
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'left'
    },
    columnStyles: {
      0: { cellWidth: 15, halign: 'center' },
      1: { cellWidth: 60 },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 28, halign: 'right' },
      5: { cellWidth: 20, halign: 'right', fontStyle: 'bold' },
      6: { cellWidth: 23, halign: 'right', fontStyle: 'bold' }
    },
    foot: [[
      'TOTAL',
      `${summaryRows.length} itens cadastrados`,
      '',
      `${totalEntriesBoxes} cx\n${totalEntriesKg.toFixed(1)} kg`,
      `${totalExitsBoxes} cx\n${totalExitsKg.toFixed(1)} kg`,
      `${totalCurrentBoxes} cx`,
      `${totalCurrentKg.toFixed(1)} kg`
    ]],
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold'
    }
  });

  // Section 2: Recent Movements
  let finalY = (doc as any).lastAutoTable?.finalY || 160;

  // Check if we need page break or add space
  if (finalY > 230) {
    doc.addPage();
    finalY = 20;
  } else {
    finalY += 10;
  }

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('2. HISTÓRICO DE MOVIMENTAÇÕES OPERACIONAIS RECENTES', 14, finalY);

  const movementsTableData = validMovements.map(m => {
    const dateStr = m.createdAtIso ? m.createdAtIso.split('T')[0] : '';
    const typeLabel = m.type === 'ENTRADA' ? 'ENTRADA' : 'SAÍDA';
    const destination = m.type === 'ENTRADA' ? (m.supplierName || 'Fornecedor') : (m.storeName || 'Loja / Destino');
    return [
      dateStr,
      typeLabel,
      m.documentNumber || m.documentType,
      destination,
      `${m.productCode} - ${m.productName}`,
      m.boxes.toString(),
      `${m.weightKg.toFixed(1)} kg`,
      m.userName || 'Operador'
    ];
  });

  autoTable(doc, {
    startY: finalY + 3,
    head: [['Data', 'Tipo', 'Documento', 'Origem / Destino', 'Produto', 'Cx', 'Peso (kg)', 'Operador']],
    body: movementsTableData,
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      cellPadding: 1.8,
      lineColor: [226, 232, 240],
      lineWidth: 0.1
    },
    headStyles: {
      fillColor: [51, 65, 85], // slate-700
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'left'
    },
    columnStyles: {
      0: { cellWidth: 18, halign: 'center' },
      1: { cellWidth: 16, halign: 'center' },
      2: { cellWidth: 26 },
      3: { cellWidth: 32 },
      4: { cellWidth: 44 },
      5: { cellWidth: 12, halign: 'right' },
      6: { cellWidth: 18, halign: 'right' },
      7: { cellWidth: 24 }
    }
  });

  // Footer on all pages
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(
      `Relatório gerado em ${dateFormatted} às ${timeFormatted} • Documento oficial do sistema Entreposto • Página ${i} de ${totalPages}`,
      105,
      290,
      { align: 'center' }
    );
  }

  // Save the PDF
  const filename = `relatorio_estoque_movimentacoes_${now.toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
}
