import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  Printer, 
  X, 
  Building2, 
  Calendar, 
  User, 
  FileText, 
  CheckCircle2, 
  Layers, 
  Store,
  ChevronRight,
  ExternalLink,
  Truck,
  Scale
} from 'lucide-react';
import { Shipment, SystemSettings, Product } from '../types';

interface RomaneioPrintModalProps {
  shipment: Shipment;
  settings: SystemSettings;
  products?: Product[];
  onClose: () => void;
  autoPrint?: boolean;
  onEditWeights?: (shipment: Shipment) => void;
}

const formatBRL = (val: number | undefined | null) => {
  if (typeof val !== 'number' || isNaN(val)) return 'R$ 0,00';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

export const RomaneioPrintModal: React.FC<RomaneioPrintModalProps> = ({ 
  shipment, 
  settings, 
  products = [],
  onClose,
  autoPrint = false,
  onEditWeights
}) => {
  // Map of products to reliably lookup supplier if not stored directly on item
  const productsMap = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of products) {
      if (p.id) map.set(p.id, p);
      if (p.code) map.set(p.code, p);
    }
    return map;
  }, [products]);

  const getItemSupplier = (item: any): string => {
    if (item.supplierName && String(item.supplierName).trim()) {
      return String(item.supplierName).trim();
    }
    const matched = productsMap.get(item.productId) || productsMap.get(item.productCode);
    if (matched?.supplierName && String(matched.supplierName).trim()) {
      return String(matched.supplierName).trim();
    }
    if (shipment.supplierName && String(shipment.supplierName).trim()) {
      return String(shipment.supplierName).trim();
    }
    return '—';
  };

  // 'ALL' prints all stores (each in its own dedicated independent page/document)
  // or a store destination index (e.g. 0, 1, 2) prints only that specific store
  const [selectedViewMode, setSelectedViewMode] = useState<'ALL' | number>('ALL');

  // Trigger browser's native print dialog (Ctrl+P / Google Chrome print preview)
  const handlePrint = () => {
    window.print();
  };

  // Add body print class and handle keyboard shortcuts (Ctrl+P and ESC)
  useEffect(() => {
    document.body.classList.add('has-romaneio-print');

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+P or Cmd+P
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        window.print();
      }
      // Escape to close
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.classList.remove('has-romaneio-print');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // If autoPrint is requested, automatically trigger native Google Chrome print dialog
  useEffect(() => {
    if (autoPrint) {
      const timer = setTimeout(() => {
        window.print();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [autoPrint]);

  const formattedDateTime = shipment.createdAt?.toDate 
    ? shipment.createdAt.toDate().toLocaleString('pt-BR') 
    : new Date().toLocaleString('pt-BR');

  const destinationsToRender = selectedViewMode === 'ALL' 
    ? (shipment.destinations || [])
    : [shipment.destinations[selectedViewMode]].filter(Boolean);

  const modalContent = (
    <div id="romaneio-print-portal" className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white print:static print:overflow-visible">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl border border-slate-300 my-8 overflow-hidden print:m-0 print:border-none print:shadow-none print:max-w-none print:w-full print:overflow-visible">
        
        {/* Modal Controls Bar (hidden during printing) */}
        <div className="px-6 py-4 bg-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-400" />
              <span className="font-bold text-base">Impressão de Romaneios Individuais por Loja</span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Romaneio Geral Nº <span className="font-mono font-bold text-blue-300">{shipment.romaneioNumber}</span> • {shipment.destinations?.length || 0} loja(s) nesta operação
            </p>
          </div>

          <div className="flex items-center gap-3">
            {onEditWeights && (
              <button
                type="button"
                onClick={() => onEditWeights(shipment)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm rounded-xl shadow-md transition cursor-pointer active:scale-98"
                title="Alterar peso (kg) dos produtos deste romaneio"
              >
                <Scale className="w-4 h-4" />
                <span>Alterar Peso</span>
              </button>
            )}
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl shadow-md transition cursor-pointer active:scale-98"
              title="Abre a tela de impressão do navegador (Google Chrome / Ctrl+P)"
            >
              <Printer className="w-4 h-4" />
              {selectedViewMode === 'ALL' 
                ? 'IMPRIMIR ROMANEIO (Ctrl + P / Google Chrome)' 
                : 'IMPRIMIR ESTA LOJA (Ctrl + P)'}
            </button>
            <button
              onClick={onClose}
              title="Fechar (X)"
              className="p-2 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Store Tabs Selector (hidden during printing) */}
        <div className="bg-slate-100 border-b border-slate-200 px-6 py-3 flex items-center gap-2 overflow-x-auto print:hidden">
          <span className="text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap mr-1 flex items-center gap-1.5">
            <Store className="w-3.5 h-3.5 text-blue-600" />
            Exibir Romaneio:
          </span>

          <button
            type="button"
            onClick={() => setSelectedViewMode('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              selectedViewMode === 'ALL'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
            }`}
          >
            Todas as Lojas ({shipment.destinations?.length || 0} Folhas Individuais)
          </button>

          {shipment.destinations?.map((dest, idx) => (
            <button
              key={dest.id || idx}
              type="button"
              onClick={() => setSelectedViewMode(idx)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                selectedViewMode === idx
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              {dest.storeName} ({dest.subtotalBoxes} cx)
            </button>
          ))}
        </div>

        {/* Notice for User with Ctrl+P connection info */}
        <div className="px-6 py-2.5 bg-blue-50 border-b border-blue-200 text-xs text-blue-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2 print:hidden">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-200 text-blue-800 font-mono font-bold text-[10px]">
              Ctrl + P
            </span>
            <span>
              <strong>Impressão Direta:</strong> O botão acima aciona a janela nativa do Google Chrome para selecionar sua impressora ou salvar em PDF.
            </span>
          </div>
          <div className="flex items-center gap-3 font-mono font-bold text-xs shrink-0">
            <span className="text-blue-700">
              {destinationsToRender.length} romaneio(s)
            </span>
            <span className="bg-emerald-100 text-emerald-900 px-2.5 py-1 rounded border border-emerald-300">
              Total Geral a Pagar: {formatBRL(
                typeof shipment.totalPrice === 'number' && shipment.totalPrice > 0
                  ? shipment.totalPrice
                  : (shipment.destinations || []).reduce((acc, d) => {
                      const dTotal = typeof d.subtotalPrice === 'number' && d.subtotalPrice > 0
                        ? d.subtotalPrice
                        : (d.items || []).reduce((s, it) => {
                            const itPrice = typeof it.totalPrice === 'number' && it.totalPrice > 0
                              ? it.totalPrice
                              : (it.weightKg || 0) * (it.unitPrice || 0);
                            return s + itPrice;
                          }, 0);
                      return acc + dTotal;
                    }, 0)
              )}
            </span>
          </div>
        </div>

        {/* Printable Documents Body */}
        <div className="p-4 sm:p-8 font-sans text-slate-900 bg-white print:p-0 print:text-black print:overflow-visible">
          {destinationsToRender.map((dest, destIndex) => {
            const isLast = destIndex === destinationsToRender.length - 1;
            const destSuppliers = Array.from(
              new Set(
                (dest.items || [])
                  .map(it => getItemSupplier(it))
                  .filter(s => s && s !== '—')
              )
            );

            return (
              <div 
                key={dest.id || destIndex}
                className={`individual-store-document print:p-6 p-6 sm:p-8 border border-slate-200 rounded-2xl mb-8 print:m-0 print:border-none print:rounded-none bg-white ${
                  !isLast ? 'print:break-after-page print:page-break-after-always' : ''
                }`}
                style={{
                  pageBreakAfter: !isLast ? 'always' : 'auto',
                  breakAfter: !isLast ? 'page' : 'auto'
                }}
              >
                {/* Independent Header for this Store */}
                <div className="border-b-2 border-slate-900 pb-4 mb-5">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <h1 className="text-lg sm:text-xl font-black tracking-tight text-slate-950 uppercase">
                        {settings.companyName || 'CENTRAL DE DISTRIBUIÇÃO E CARNES'}
                      </h1>
                      <p className="text-xs text-slate-600 mt-0.5">
                        CNPJ: {settings.companyCnpj || '00.000.000/0001-00'} • Tel: {settings.companyPhone || '(11) 3344-5566'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {settings.companyAddress || 'Av. Logística, 1000 - Galpão 4 - Centro Logístico'}
                      </p>
                    </div>

                    <div className="text-right border-2 border-slate-900 p-3 rounded-xl bg-slate-50 print:bg-transparent">
                      <span className="text-[11px] uppercase font-bold text-slate-600 block">
                        Romaneio de Entrega Individual
                      </span>
                      <span className="text-lg sm:text-xl font-black font-mono text-blue-900 tracking-wider">
                        ROMANEIO — {dest.storeName.toUpperCase()}
                      </span>
                      <div className="text-xs font-mono font-bold text-slate-700 mt-0.5">
                        Nº {shipment.romaneioNumber} / {dest.storeName}
                      </div>
                      <span className={`block text-[10px] font-bold mt-1 ${
                        shipment.status === 'CANCELLED' ? 'text-rose-600 uppercase' : 'text-emerald-700'
                      }`}>
                        {shipment.status === 'CANCELLED' ? '• ROMANEIO CANCELADO •' : '• DOCUMENTO OFICIAL DE EXPEDIÇÃO •'}
                      </span>
                    </div>
                  </div>

                  {/* Destination Store Highlights Banner */}
                  <div className="mt-4 p-3 bg-blue-50/80 border border-blue-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-xs">
                        LJ
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-blue-700 block">Loja Destinatária:</span>
                        <span className="text-sm font-black text-slate-900 uppercase">
                          {dest.storeName}
                        </span>
                        {destSuppliers.length > 0 && (
                          <div className="text-[10px] text-slate-600 font-medium mt-0.5">
                            <span className="font-bold text-slate-700">Fornecedor(es): </span>
                            <span className="text-blue-900 font-bold">{destSuppliers.join(', ')}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-right">
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">Data Emissão:</span>
                        <span className="font-semibold text-slate-800">{shipment.date || formattedDateTime}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">Expedido por:</span>
                        <span className="font-semibold text-slate-800">{shipment.userName}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">Total Desta Loja:</span>
                        <span className="font-bold text-blue-900 font-mono">
                          {dest.subtotalBoxes} cx ({dest.subtotalWeightKg.toFixed(2)} kg)
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-emerald-700 block uppercase font-bold">Total a Pagar:</span>
                        <span className="font-black text-emerald-800 font-mono text-sm">
                          {formatBRL(
                            dest.subtotalPrice ||
                              dest.items.reduce((sum, it) => {
                                const itPrice = typeof it.totalPrice === 'number' && it.totalPrice > 0
                                  ? it.totalPrice
                                  : (it.weightKg || 0) * (it.unitPrice || 0);
                                return sum + itPrice;
                              }, 0)
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {shipment.notes && (
                    <div className="mt-2.5 text-xs bg-slate-50 p-2 rounded-lg border border-slate-200">
                      <span className="font-bold text-slate-700">Observações do Carregamento: </span>
                      <span className="text-slate-600">{shipment.notes}</span>
                    </div>
                  )}
                </div>

                {/* Products Table - ONLY FOR THIS STORE */}
                <div className="border border-slate-300 rounded-xl overflow-hidden mb-6">
                  <div className="bg-slate-100 px-4 py-2 border-b border-slate-300 flex items-center justify-between">
                    <span className="font-bold text-xs uppercase text-slate-800 tracking-wider">
                      Itens Faturados e Carregados Exclusivamente para: {dest.storeName}
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-600">
                      {dest.items?.length || 0} produto(s)
                    </span>
                  </div>

                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-[11px] uppercase font-bold text-slate-600 border-b border-slate-200">
                        <th className="px-3 py-2 w-16">Cód.</th>
                        <th className="px-3 py-2">Descrição do Produto</th>
                        <th className="px-3 py-2 w-36">Fornecedor</th>
                        <th className="px-3 py-2 text-right w-20">Qtd (cx)</th>
                        <th className="px-3 py-2 text-center w-14">Unid</th>
                        <th className="px-3 py-2 text-right w-24">Peso (kg)</th>
                        <th className="px-3 py-2 text-right w-24">Preço Venda</th>
                        <th className="px-3 py-2 text-right w-28">Valor a Pagar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {dest.items?.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-6 text-center text-slate-400 italic">
                            Nenhum item adicionado para esta loja.
                          </td>
                        </tr>
                      ) : (
                        dest.items?.map((item, itemIdx) => {
                          const itemSupplier = getItemSupplier(item);
                          const isPerUnit = item.priceType === 'POR_UNIDADE';
                          return (
                            <tr key={item.id || itemIdx} className="hover:bg-slate-50">
                              <td className="px-3 py-2.5 font-mono font-bold text-slate-900">
                                {item.productCode}
                              </td>
                              <td className="px-3 py-2.5 font-semibold text-slate-900 uppercase">
                                {item.productName}
                              </td>
                              <td className="px-3 py-2.5 text-slate-700 text-xs font-semibold uppercase">
                                {itemSupplier}
                              </td>
                              <td className="px-3 py-2.5 text-right font-black text-slate-950 text-sm font-mono">
                                {item.quantityBoxes}
                              </td>
                              <td className="px-3 py-2.5 text-center text-slate-600">
                                <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px] font-semibold">
                                  {item.unit}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-right font-black text-slate-900 font-mono text-xs">
                                {item.weightKg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono text-slate-700 text-xs whitespace-nowrap">
                                {item.unitPrice && item.unitPrice > 0 ? (
                                  <span>{formatBRL(item.unitPrice)}{isPerUnit ? '/cx' : '/kg'}</span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right font-black text-emerald-950 font-mono text-sm whitespace-nowrap">
                                {formatBRL(
                                  typeof item.totalPrice === 'number' && item.totalPrice > 0
                                    ? item.totalPrice
                                    : isPerUnit
                                      ? (item.quantityBoxes || 0) * (item.unitPrice || 0)
                                      : (item.weightKg || 0) * (item.unitPrice || 0)
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 font-bold text-xs border-t-2 border-slate-300">
                        <td colSpan={3} className="px-3 py-3 text-right uppercase text-slate-800">
                          SUBTOTAL EXCLUSIVO ({dest.storeName}):
                        </td>
                        <td className="px-3 py-3 text-right text-blue-900 font-black text-sm font-mono">
                          {dest.subtotalBoxes} cx
                        </td>
                        <td className="px-3 py-3 text-center text-slate-500 font-normal text-[11px]">
                          itens
                        </td>
                        <td className="px-3 py-3 text-right text-emerald-900 font-black text-sm font-mono">
                          {dest.subtotalWeightKg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
                        </td>
                        <td className="px-3 py-3 text-right uppercase text-slate-600 text-[10px] font-sans">
                          TOTAL A PAGAR:
                        </td>
                        <td className="px-3 py-3 text-right text-emerald-900 font-black text-base font-mono whitespace-nowrap">
                          {formatBRL(
                            dest.subtotalPrice ||
                              dest.items.reduce((sum, it) => {
                                const isPerUnit = it.priceType === 'POR_UNIDADE';
                                const itPrice = typeof it.totalPrice === 'number' && it.totalPrice > 0
                                  ? it.totalPrice
                                  : isPerUnit
                                    ? (it.quantityBoxes || 0) * (it.unitPrice || 0)
                                    : (it.weightKg || 0) * (it.unitPrice || 0);
                                return sum + itPrice;
                              }, 0)
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Delivery and Receipt Confirmation Signatures */}
                <div className="border border-slate-300 rounded-xl p-4 bg-slate-50 print:bg-transparent page-break-inside-avoid">
                  <div className="text-[11px] font-bold uppercase text-slate-700 mb-4 pb-1 border-b border-slate-200 flex items-center justify-between">
                    <span>Termo de Conferência e Recebimento na Loja: {dest.storeName}</span>
                    <span className="text-[10px] text-slate-500 font-normal">
                      Mercadoria conferida conforme especificações acima
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center text-xs">
                    <div>
                      <div className="border-t border-slate-400 pt-2 font-bold text-slate-800">
                        {shipment.userName}
                      </div>
                      <div className="text-[10px] text-slate-500">Expedição / Centro de Distribuição</div>
                    </div>

                    <div>
                      <div className="border-t border-slate-400 pt-2 font-bold text-slate-800">
                        Motorista Responsável
                      </div>
                      <div className="text-[10px] text-slate-500">Nome Legível & Assinatura</div>
                    </div>

                    <div>
                      <div className="border-t border-slate-400 pt-2 font-bold text-slate-800">
                        Recebedor ({dest.storeName})
                      </div>
                      <div className="text-[10px] text-slate-500">Nome Legível, Matrícula & Assinatura</div>
                    </div>
                  </div>

                  <div className="mt-4 pt-2 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center text-[10px] text-slate-500">
                    <span>Data de Entrega: _____/_____/_________  Hora: ____:____</span>
                    <span>Documento nº {shipment.romaneioNumber} / {dest.storeName}</span>
                  </div>
                </div>

                {/* Print Footer note */}
                <div className="mt-4 text-center text-[9px] text-slate-400 print:block">
                  Via da Loja • Central de Distribuição e Carnes Pata Negra • Romaneio individual gerado em {formattedDateTime}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
