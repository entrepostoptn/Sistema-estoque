import React, { useState, useMemo, useId } from 'react';
import { 
  ArrowDownToLine, 
  Plus, 
  Trash2, 
  Save, 
  FileText, 
  Scale, 
  Box, 
  Calendar, 
  Building2, 
  User, 
  AlertCircle, 
  CheckCircle2, 
  Info, 
  Search,
  Eye,
  XCircle,
  Clock,
  Lock,
  DollarSign,
  Edit3,
  ListFilter,
  Check,
  Barcode,
  Sparkles
} from 'lucide-react';
import { Product, Invoice, InvoiceItem, Supplier } from '../types';
import { registerInvoiceEntry, cancelInvoice, updateInvoiceCostPrices } from '../services/inventoryService';
import { useAuth } from '../firebase/authContext';

const formatBRL = (val?: number | null) => {
  return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

interface EntriesViewProps {
  products: Product[];
  invoices: Invoice[];
  suppliers: Supplier[];
  onOpenNewProduct: () => void;
  onOpenNfeEntry?: () => void;
}

export const EntriesView: React.FC<EntriesViewProps> = ({ 
  products, 
  invoices, 
  suppliers,
  onOpenNewProduct,
  onOpenNfeEntry
}) => {
  const { currentUser } = useAuth();

  // Form Header State
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  // Items State
  const [items, setItems] = useState<InvoiceItem[]>([]);

  // Item Form Input State (for adding item)
  const [selectedProductId, setSelectedProductId] = useState('');
  const [entryMode, setEntryMode] = useState<'by_unit' | 'by_weight'>('by_unit');
  const [quantityInput, setQuantityInput] = useState<number | string>(10);
  const [weightInput, setWeightInput] = useState<number | string>(200);
  const [costPriceInput, setCostPriceInput] = useState<number | string>('');
  const [totalCostPriceInput, setTotalCostPriceInput] = useState<number | string>('');
  const [costPriceType, setCostPriceType] = useState<'POR_UNIDADE' | 'POR_KG'>('POR_UNIDADE');
  const [saveCostsToProductCatalog, setSaveCostsToProductCatalog] = useState(true);

  // Product selection mode in EntriesView (Direct dropdown vs Search)
  const [productSelectMode, setProductSelectMode] = useState<'dropdown' | 'search'>('dropdown');
  const [productSearchQuery, setProductSearchQuery] = useState('');

  // Live item total cost preview (Internal Control)
  const previewItemCost = useMemo(() => {
    if (totalCostPriceInput !== '' && Number(totalCostPriceInput) > 0) {
      return Number(totalCostPriceInput);
    }
    const unitCost = Number(costPriceInput) || 0;
    if (unitCost <= 0) return 0;
    if (costPriceType === 'POR_KG') {
      const wt = Number(weightInput) || 0;
      return Math.round(wt * unitCost * 100) / 100;
    } else {
      const qty = Number(quantityInput) || 0;
      return Math.round(qty * unitCost * 100) / 100;
    }
  }, [costPriceInput, totalCostPriceInput, costPriceType, quantityInput, weightInput]);

  // UI States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [cancellingInvoice, setCancellingInvoice] = useState<Invoice | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Modal for editing costs on existing invoice
  const [isEditingInvoiceCosts, setIsEditingInvoiceCosts] = useState(false);
  const [editingInvoiceCostItems, setEditingInvoiceCostItems] = useState<Array<{
    id: string;
    unitCostPrice: number | string;
    costPriceType: 'POR_KG' | 'POR_UNIDADE';
    totalCostPrice: number | string;
  }>>([]);
  const [saveUpdatedCostsToProducts, setSaveUpdatedCostsToProducts] = useState(true);
  const [isUpdatingInvoiceCosts, setIsUpdatingInvoiceCosts] = useState(false);

  // Handle product selection and set initial suggested values
  const handleProductChange = (prodId: string) => {
    setSelectedProductId(prodId);
    const prod = products.find(p => p.id === prodId);
    if (prod) {
      const defaultWeight = prod.defaultWeightKg || 20;
      const qty = Number(quantityInput) || 10;
      const calcWeight = Math.round(qty * defaultWeight * 100) / 100;
      setQuantityInput(qty);
      setWeightInput(calcWeight);

      if (typeof prod.costPrice === 'number' && prod.costPrice > 0) {
        setCostPriceInput(prod.costPrice);
        const cType = prod.costPriceType || 'POR_UNIDADE';
        setCostPriceType(cType);
        if (cType === 'POR_KG') {
          setTotalCostPriceInput(Math.round(calcWeight * prod.costPrice * 100) / 100);
        } else {
          setTotalCostPriceInput(Math.round(qty * prod.costPrice * 100) / 100);
        }
      } else {
        setCostPriceInput('');
        setTotalCostPriceInput('');
      }
    } else {
      setCostPriceInput('');
      setTotalCostPriceInput('');
    }
  };

  // When user types unit cost: auto-calculate total cost
  const handleUnitCostChange = (val: string) => {
    setCostPriceInput(val);
    const num = Number(val);
    if (val === '' || isNaN(num) || num <= 0) {
      setTotalCostPriceInput('');
      return;
    }
    if (costPriceType === 'POR_KG') {
      const wt = Number(weightInput) || 0;
      setTotalCostPriceInput(wt > 0 ? Math.round(wt * num * 100) / 100 : '');
    } else {
      const qty = Number(quantityInput) || 0;
      setTotalCostPriceInput(qty > 0 ? Math.round(qty * num * 100) / 100 : '');
    }
  };

  // When user types total cost: auto-calculate unit cost
  const handleTotalCostChange = (val: string) => {
    setTotalCostPriceInput(val);
    const num = Number(val);
    if (val === '' || isNaN(num) || num <= 0) {
      setCostPriceInput('');
      return;
    }
    if (costPriceType === 'POR_KG') {
      const wt = Number(weightInput) || 0;
      setCostPriceInput(wt > 0 ? Math.round((num / wt) * 100) / 100 : '');
    } else {
      const qty = Number(quantityInput) || 0;
      setCostPriceInput(qty > 0 ? Math.round((num / qty) * 100) / 100 : '');
    }
  };

  // When cost base changes (POR_UNIDADE vs POR_KG): recompute accordingly
  const handleCostPriceTypeChange = (newType: 'POR_UNIDADE' | 'POR_KG') => {
    setCostPriceType(newType);
    const uCost = Number(costPriceInput) || 0;
    if (uCost > 0) {
      if (newType === 'POR_KG') {
        const wt = Number(weightInput) || 0;
        setTotalCostPriceInput(wt > 0 ? Math.round(wt * uCost * 100) / 100 : '');
      } else {
        const qty = Number(quantityInput) || 0;
        setTotalCostPriceInput(qty > 0 ? Math.round(qty * uCost * 100) / 100 : '');
      }
    }
  };

  // When quantity in boxes changes: allows free manual typing without overwriting weight
  const handleQuantityChange = (val: string) => {
    setQuantityInput(val);
    const qty = Number(val) || 0;
    const uCost = Number(costPriceInput) || 0;
    if (costPriceType === 'POR_UNIDADE' && uCost > 0 && qty > 0) {
      setTotalCostPriceInput(Math.round(qty * uCost * 100) / 100);
    }
  };

  // When weight in kg changes: allows free manual typing without overwriting quantity
  const handleWeightChange = (val: string) => {
    setWeightInput(val);
    const wt = Number(val) || 0;
    const uCost = Number(costPriceInput) || 0;
    if (costPriceType === 'POR_KG' && uCost > 0 && wt > 0) {
      setTotalCostPriceInput(Math.round(wt * uCost * 100) / 100);
    }
  };

  // Helper to suggest standard weight based on packaging
  const handleSuggestStandardWeight = () => {
    const qty = Number(quantityInput) || 0;
    const prod = products.find(p => p.id === selectedProductId);
    if (prod && prod.defaultWeightKg > 0 && qty > 0) {
      setWeightInput(Math.round(qty * prod.defaultWeightKg * 100) / 100);
    }
  };

  // Helper to suggest boxes from total weight
  const handleSuggestBoxesFromWeight = () => {
    const wt = Number(weightInput) || 0;
    const prod = products.find(p => p.id === selectedProductId);
    if (prod && prod.defaultWeightKg > 0 && wt > 0) {
      setQuantityInput(Math.round((wt / prod.defaultWeightKg) * 100) / 100);
    }
  };

  // Inline manipulation of quantity, weight or cost price directly in the invoice items table
  const handleUpdateItemProperty = (itemId: string, field: 'quantityBoxes' | 'weightKg' | 'unitCostPrice', val: number) => {
    setItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const updated = {
          ...item,
          [field]: Math.max(0, val)
        };
        const uCost = typeof updated.unitCostPrice === 'number' && updated.unitCostPrice > 0 ? updated.unitCostPrice : 0;
        if (uCost > 0) {
          if (updated.costPriceType === 'POR_KG') {
            updated.totalCostPrice = Math.round((Number(updated.weightKg) || 0) * uCost * 100) / 100;
          } else {
            updated.totalCostPrice = Math.round((Number(updated.quantityBoxes) || 0) * uCost * 100) / 100;
          }
        } else {
          updated.totalCostPrice = undefined;
        }
        return updated;
      }
      return item;
    }));
  };

  // Add Item to Invoice Items list
  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!selectedProductId) {
      setErrorMessage('Selecione um produto para adicionar à nota.');
      return;
    }

    const prod = products.find(p => p.id === selectedProductId);
    if (!prod) {
      setErrorMessage('Produto não encontrado.');
      return;
    }

    const qty = Number(quantityInput);
    const weight = Number(weightInput);

    if (qty <= 0 && weight <= 0) {
      setErrorMessage('Informe uma quantidade ou peso maior que zero.');
      return;
    }

    const unitCost = Number(costPriceInput) > 0 ? Number(costPriceInput) : undefined;
    let totalCost: number | undefined = undefined;
    if (unitCost !== undefined && unitCost > 0) {
      if (costPriceType === 'POR_KG') {
        totalCost = Math.round(weight * unitCost * 100) / 100;
      } else {
        totalCost = Math.round(qty * unitCost * 100) / 100;
      }
    }

    const newItem: InvoiceItem = {
      id: Math.random().toString(36).substring(2, 9),
      productId: prod.id,
      productCode: prod.code,
      productName: prod.name,
      unit: prod.unit,
      quantityBoxes: qty,
      weightKg: weight,
      mode: entryMode,
      unitCostPrice: unitCost,
      costPriceType: costPriceType,
      totalCostPrice: totalCost
    };

    setItems([...items, newItem]);
    setSelectedProductId('');
    setQuantityInput(10);
    setWeightInput(200);
    setCostPriceInput('');
    setTotalCostPriceInput('');
  };

  const handleUpdateItemTotalCost = (itemId: string, val: number) => {
    setItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const validTotal = Math.max(0, val);
        if (validTotal <= 0) {
          return {
            ...item,
            totalCostPrice: undefined,
            unitCostPrice: undefined
          };
        }
        let uCost = 0;
        if (item.costPriceType === 'POR_KG') {
          const wt = Number(item.weightKg) || 0;
          uCost = wt > 0 ? Math.round((validTotal / wt) * 100) / 100 : 0;
        } else {
          const qty = Number(item.quantityBoxes) || 0;
          uCost = qty > 0 ? Math.round((validTotal / qty) * 100) / 100 : 0;
        }
        return {
          ...item,
          totalCostPrice: validTotal,
          unitCostPrice: uCost > 0 ? uCost : undefined
        };
      }
      return item;
    }));
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  // Summaries
  const totalBoxes = items.reduce((sum, item) => sum + item.quantityBoxes, 0);
  const totalWeightKg = items.reduce((sum, item) => sum + item.weightKg, 0);
  const totalCostPrice = items.reduce((sum, item) => sum + (Number(item.totalCostPrice) || 0), 0);

  // Save Invoice
  const handleSaveInvoice = async () => {
    setErrorMessage(null);

    if (!invoiceNumber.trim()) {
      setErrorMessage('O número da nota fiscal é obrigatório.');
      return;
    }

    if (!supplierName.trim()) {
      setErrorMessage('O nome do fornecedor é obrigatório.');
      return;
    }

    if (items.length === 0) {
      setErrorMessage('Adicione pelo menos um produto à nota fiscal antes de salvar.');
      return;
    }

    if (!currentUser) {
      setErrorMessage('Usuário não autenticado.');
      return;
    }

    setIsSubmitting(true);
    try {
      await registerInvoiceEntry({
        invoiceNumber,
        supplierName,
        date,
        notes,
        items,
        user: currentUser,
        saveCostsToProducts: saveCostsToProductCatalog
      });

      setSuccessMessage(`Nota Fiscal ${invoiceNumber} registrada com sucesso no Firebase! Estoque atualizado.`);
      // Reset form
      setInvoiceNumber('');
      setSupplierName('');
      setNotes('');
      setItems([]);
      setDate(new Date().toISOString().split('T')[0]);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao registrar nota fiscal.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditInvoiceCosts = (inv: Invoice) => {
    setViewingInvoice(inv);
    setIsEditingInvoiceCosts(true);
    setEditingInvoiceCostItems(
      inv.items.map(it => ({
        id: it.id,
        unitCostPrice: it.unitCostPrice !== undefined ? it.unitCostPrice : '',
        costPriceType: it.costPriceType || 'POR_UNIDADE',
        totalCostPrice: it.totalCostPrice !== undefined ? it.totalCostPrice : ''
      }))
    );
  };

  const handleUpdateEditingCostItem = (
    itemId: string,
    field: 'unitCostPrice' | 'totalCostPrice' | 'costPriceType',
    val: any,
    boxes: number,
    weightKg: number
  ) => {
    setEditingInvoiceCostItems(prev => prev.map(it => {
      if (it.id !== itemId) return it;
      const updated = { ...it, [field]: val };
      if (field === 'unitCostPrice') {
        const uCost = Number(val);
        if (val !== '' && !isNaN(uCost) && uCost > 0) {
          if (updated.costPriceType === 'POR_KG') {
            updated.totalCostPrice = Math.round(weightKg * uCost * 100) / 100;
          } else {
            updated.totalCostPrice = Math.round(boxes * uCost * 100) / 100;
          }
        } else {
          updated.totalCostPrice = '';
        }
      } else if (field === 'totalCostPrice') {
        const tCost = Number(val);
        if (val !== '' && !isNaN(tCost) && tCost > 0) {
          if (updated.costPriceType === 'POR_KG') {
            updated.unitCostPrice = weightKg > 0 ? Math.round((tCost / weightKg) * 100) / 100 : '';
          } else {
            updated.unitCostPrice = boxes > 0 ? Math.round((tCost / boxes) * 100) / 100 : '';
          }
        } else {
          updated.unitCostPrice = '';
        }
      } else if (field === 'costPriceType') {
        const uCost = Number(updated.unitCostPrice);
        if (uCost > 0) {
          if (val === 'POR_KG') {
            updated.totalCostPrice = Math.round(weightKg * uCost * 100) / 100;
          } else {
            updated.totalCostPrice = Math.round(boxes * uCost * 100) / 100;
          }
        }
      }
      return updated;
    }));
  };

  const handleSaveInvoiceCosts = async () => {
    if (!viewingInvoice || !currentUser) return;
    setIsUpdatingInvoiceCosts(true);
    try {
      const itemsToUpdate = editingInvoiceCostItems.map(item => {
        const uCost = item.unitCostPrice !== '' ? Number(item.unitCostPrice) : undefined;
        const tCost = item.totalCostPrice !== '' ? Number(item.totalCostPrice) : undefined;
        return {
          id: item.id,
          unitCostPrice: uCost,
          costPriceType: item.costPriceType,
          totalCostPrice: tCost
        };
      });

      const updated = await updateInvoiceCostPrices({
        invoiceId: viewingInvoice.id,
        items: itemsToUpdate,
        user: currentUser,
        saveCostsToProducts: saveUpdatedCostsToProducts
      });

      setViewingInvoice(updated);
      setIsEditingInvoiceCosts(false);
      setSuccessMessage(`Preços de custo da Nota Fiscal ${updated.invoiceNumber} atualizados com sucesso!`);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      alert(err.message || 'Erro ao atualizar custos da nota fiscal.');
    } finally {
      setIsUpdatingInvoiceCosts(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancellingInvoice || !currentUser) return;
    if (!cancelReason.trim()) {
      alert('Informe o motivo do cancelamento.');
      return;
    }

    try {
      await cancelInvoice(cancellingInvoice.id, currentUser, cancelReason);
      setCancellingInvoice(null);
      setCancelReason('');
      setSuccessMessage(`Nota Fiscal ${cancellingInvoice.invoiceNumber} cancelada e estoque estornado.`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Erro ao cancelar nota.');
    }
  };

  const activeProducts = products.filter(p => p.active);

  const searchedActiveProducts = useMemo(() => {
    if (!productSearchQuery.trim()) return activeProducts;
    const q = productSearchQuery.toLowerCase().trim();
    return activeProducts.filter(p => 
      p.code.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      (p.supplierName && p.supplierName.toLowerCase().includes(q))
    );
  }, [activeProducts, productSearchQuery]);

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ArrowDownToLine className="w-6 h-6 text-emerald-600" />
            Entrada de Mercadorias (Notas Fiscais)
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Lance notas fiscais de fornecedores com múltiplos produtos e controle consistente de caixas e peso (kg).
          </p>
        </div>

        {/* Current logged-in user badge (immutable per requirement 9) */}
        <div className="flex items-center gap-2.5 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg">
          <User className="w-4 h-4 text-slate-500" />
          <div className="text-left">
            <div className="text-[11px] text-slate-400 font-medium">Responsável pelo Lançamento:</div>
            <div className="text-xs font-bold text-slate-800">{currentUser?.name}</div>
          </div>
        </div>
      </div>

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Banner de Acesso Rápido para Entrada por NF-e */}
      {onOpenNfeEntry && (
        <div className="p-4 bg-gradient-to-r from-emerald-950 via-slate-900 to-blue-950 rounded-2xl text-white border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Barcode className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <strong className="text-sm font-black text-white">Prefere lançar por Chave de Acesso?</strong>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 uppercase tracking-wide">
                  Novo
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Bipe a chave de 44 dígitos com leitor de código de barras ou importe o XML para carregar todos os produtos e custos automaticamente.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenNfeEntry}
            className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 active:scale-98 text-slate-950 font-black text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-md cursor-pointer shrink-0"
          >
            <Barcode className="w-4 h-4" />
            <span>Abrir Entrada por NF-e</span>
          </button>
        </div>
      )}

      {/* Main Form: Invoice Header & Product Input */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left: Invoice Data & Add Product */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Section 1: Nota Fiscal Info */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              1. Dados da Nota Fiscal
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Número da Nota Fiscal <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="Ex: 1234"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Fornecedor <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  list="suppliersList"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="Ex: Fornecedor ABC"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
                <datalist id="suppliersList">
                  {suppliers.map(s => (
                    <option key={s.id} value={s.name} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Data da Entrada <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Observações (Opcional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Carga descarregada na câmara frigorífica 2"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Section 2: Product Inserter */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Box className="w-4 h-4 text-emerald-600" />
                2. Adicionar Produtos à Nota Fiscal
              </h2>
              {activeProducts.length === 0 && (
                <button
                  type="button"
                  onClick={onOpenNewProduct}
                  className="text-xs text-blue-600 hover:underline font-semibold"
                >
                  + Cadastrar produtos primeiro
                </button>
              )}
            </div>

            <form onSubmit={handleAddItem} className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              {/* Product selector with Dual Mode (Direct Dropdown or Text Search) */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700 uppercase">
                    Selecione o Produto (Código / Nome)
                  </label>
                  <div className="inline-flex rounded-lg border border-slate-300 p-0.5 bg-white text-xs">
                    <button
                      type="button"
                      onClick={() => setProductSelectMode('dropdown')}
                      className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer flex items-center gap-1 ${
                        productSelectMode === 'dropdown' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <ListFilter className="w-3 h-3" />
                      Lista / Dropdown
                    </button>
                    <button
                      type="button"
                      onClick={() => setProductSelectMode('search')}
                      className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer flex items-center gap-1 ${
                        productSelectMode === 'search' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Search className="w-3 h-3" />
                      Busca Rápida
                    </button>
                  </div>
                </div>

                {productSelectMode === 'dropdown' ? (
                  <select
                    value={selectedProductId}
                    onChange={(e) => handleProductChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm font-semibold border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                    required
                  >
                    <option value="">-- Selecione o produto na lista --</option>
                    {activeProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.name} ({p.unit} ~{p.defaultWeightKg} kg)
                        {p.supplierName ? ` • Forn: ${p.supplierName}` : ''}
                        {p.costPrice && p.costPrice > 0 ? ` • 🔒 Custo Cadastrado: R$ ${p.costPrice.toFixed(2)}${p.costPriceType === 'POR_KG' ? '/kg' : '/cx'}` : ' • ⚠️ Sem custo cadastrado'}
                        {p.salePrice && p.salePrice > 0 ? ` • Venda: R$ ${p.salePrice.toFixed(2)}` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={productSearchQuery}
                        onChange={(e) => setProductSearchQuery(e.target.value)}
                        placeholder="Digite o código (ex: 101) ou nome do produto para filtrar..."
                        className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white outline-none"
                      />
                    </div>
                    <select
                      value={selectedProductId}
                      onChange={(e) => handleProductChange(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm font-semibold border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                      size={Math.min(5, Math.max(2, searchedActiveProducts.length + 1))}
                      required
                    >
                      <option value="">-- Selecione o produto filtrado --</option>
                      {searchedActiveProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code} — {p.name} ({p.unit} ~{p.defaultWeightKg} kg)
                          {p.costPrice && p.costPrice > 0 ? ` • 🔒 Custo: R$ ${p.costPrice.toFixed(2)}${p.costPriceType === 'POR_KG' ? '/kg' : '/cx'}` : ' • ⚠️ Sem custo cadastrado'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Feedback badge for chosen product cost status */}
                {selectedProductId && (() => {
                  const prod = products.find(p => p.id === selectedProductId);
                  if (!prod) return null;
                  return (
                    <div className="mt-2 text-xs flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-800">
                        Selecionado: {prod.code} — {prod.name}
                      </span>
                      {prod.costPrice && prod.costPrice > 0 ? (
                        <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 px-2 py-0.5 rounded font-bold border border-amber-200">
                          <Lock className="w-3 h-3 text-amber-700" />
                          Custo Cadastrado: R$ {prod.costPrice.toFixed(2)} ({prod.costPriceType === 'POR_KG' ? 'por kg' : 'por caixa'}) — Carregado abaixo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-800 px-2 py-0.5 rounded font-semibold border border-blue-200">
                          ℹ️ Este produto ainda não possui custo cadastrado. Informe o valor de compra pago abaixo.
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Mode switch & Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                {/* Mode Selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Forma de Lançamento
                  </label>
                  <div className="grid grid-cols-2 rounded-lg border border-slate-300 p-0.5 bg-white text-xs">
                    <button
                      type="button"
                      onClick={() => setEntryMode('by_unit')}
                      className={`py-1.5 rounded-md font-medium transition ${
                        entryMode === 'by_unit' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      Por Caixas
                    </button>
                    <button
                      type="button"
                      onClick={() => setEntryMode('by_weight')}
                      className={`py-1.5 rounded-md font-medium transition ${
                        entryMode === 'by_weight' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      Por Quilos
                    </button>
                  </div>
                </div>

                {/* Boxes / Units Input */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700 uppercase">
                      Qtd (Caixas / Unid)
                    </label>
                    <button
                      type="button"
                      onClick={handleSuggestBoxesFromWeight}
                      className="text-[10px] text-blue-600 hover:underline font-medium"
                      title="Calcular caixas com base no peso e peso padrão do produto"
                    >
                      ⚡ Calcular caixas
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      value={quantityInput}
                      onChange={(e) => handleQuantityChange(e.target.value)}
                      placeholder="Ex: 10"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white outline-none font-bold text-slate-900"
                      required
                    />
                  </div>
                </div>

                {/* Weight Input */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700 uppercase">
                      Peso Total (kg)
                    </label>
                    <button
                      type="button"
                      onClick={handleSuggestStandardWeight}
                      className="text-[10px] text-emerald-600 hover:underline font-medium"
                      title="Calcular peso sugerido com base nas caixas x peso padrão"
                    >
                      ⚡ Sugerir peso padrão
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={weightInput}
                      onChange={(e) => handleWeightChange(e.target.value)}
                      placeholder="Ex: 200.00"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white outline-none font-bold text-slate-900"
                      required
                    />
                    <span className="absolute right-3 top-2 text-xs font-bold text-slate-400">kg</span>
                  </div>
                </div>
              </div>

              {/* Preço de Compra / Custo da Mercadoria (SOMENTE CONTROLE INTERNO) */}
              <div className="p-4 bg-amber-50/80 border-2 border-amber-300 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-1.5 border-b border-amber-200">
                  <div className="flex items-center gap-1.5 text-xs font-black text-amber-950 uppercase tracking-wide">
                    <Lock className="w-4 h-4 text-amber-600" />
                    <span>Valor de Compra / Preço Pago pela Empresa</span>
                    <span className="bg-amber-200/90 text-amber-950 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full">
                      SOMENTE CONTROLE INTERNO
                    </span>
                  </div>
                  <span className="text-[11px] text-amber-800 font-bold flex items-center gap-1">
                    🔒 Confidencial: NUNCA aparece no Romaneio nem para as lojas
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end pt-1">
                  {/* Base do Custo: Por Caixa vs Por Quilo */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      1. Base do Valor Pago
                    </label>
                    <div className="grid grid-cols-2 rounded-lg border border-amber-300 p-0.5 bg-white text-xs">
                      <button
                        type="button"
                        onClick={() => handleCostPriceTypeChange('POR_UNIDADE')}
                        className={`py-1.5 rounded-md font-bold transition cursor-pointer ${
                          costPriceType === 'POR_UNIDADE' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        R$ por Caixa
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCostPriceTypeChange('POR_KG')}
                        className={`py-1.5 rounded-md font-bold transition cursor-pointer ${
                          costPriceType === 'POR_KG' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        R$ por Quilo (kg)
                      </button>
                    </div>
                  </div>

                  {/* Preço de Custo Unitário */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-700 uppercase">
                        2. Custo Unitário {costPriceType === 'POR_UNIDADE' ? '(R$ / caixa)' : '(R$ / kg)'}
                      </label>
                      <span className="text-[10px] text-amber-700 font-bold">Por unidade</span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={costPriceInput}
                        onChange={(e) => handleUnitCostChange(e.target.value)}
                        placeholder={costPriceType === 'POR_UNIDADE' ? 'Ex: 80.00' : 'Ex: 4.00'}
                        className="w-full pl-9 pr-3 py-2 text-sm border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white outline-none font-bold text-slate-900"
                      />
                    </div>
                  </div>

                  {/* Preço Total Pago Deste Item */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-700 uppercase">
                        3. Custo Total do Item (R$)
                      </label>
                      <span className="text-[10px] text-amber-700 font-bold">Total pago</span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={totalCostPriceInput}
                        onChange={(e) => handleTotalCostChange(e.target.value)}
                        placeholder="Ex: 800.00"
                        className="w-full pl-9 pr-3 py-2 text-sm border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white outline-none font-bold text-slate-900 font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Checkbox: salvar no cadastro do produto */}
                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-amber-200">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-amber-950">
                    <input
                      type="checkbox"
                      checked={saveCostsToProductCatalog}
                      onChange={(e) => setSaveCostsToProductCatalog(e.target.checked)}
                      className="w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500 cursor-pointer"
                    />
                    <span>Salvar / atualizar este valor como custo padrão no cadastro do produto</span>
                  </label>
                  <span className="text-xs text-amber-900 font-medium">
                    Total previsto do item: <strong>{formatBRL(previewItemCost)}</strong>
                  </span>
                </div>
              </div>

              {/* Manipulation info note */}
              <div className="text-[11px] text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 flex items-center justify-between">
                <span>💡 <strong>Manipulação Livre:</strong> Você pode digitar livremente tanto as caixas quanto o peso real aferido na balança e o custo pago.</span>
              </div>

              {/* Add Button */}
              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={!selectedProductId}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-sm rounded-lg transition shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  Adicionar Produto à Nota
                </button>
              </div>
            </form>
          </div>

          {/* Section 3: Items Table in this Invoice */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Produtos Adicionados à Nota ({items.length})
              </span>
              <span className="text-xs text-slate-500">
                Você pode manipular as caixas, pesos e custos diretamente nos campos da tabela abaixo
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50/50 text-[11px] uppercase font-semibold text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5">Cód</th>
                    <th className="px-4 py-2.5">Produto</th>
                    <th className="px-4 py-2.5 text-center">Unidade</th>
                    <th className="px-4 py-2.5 text-right">Qtd (Caixas)</th>
                    <th className="px-4 py-2.5 text-right">Peso Real (kg)</th>
                    <th className="px-4 py-2.5 text-right bg-amber-50/60 text-amber-900">
                      Custo Unitário (R$)
                      <span className="block text-[9px] text-amber-700 font-normal">🔒 Controle Interno</span>
                    </th>
                    <th className="px-4 py-2.5 text-right bg-amber-50/60 text-amber-900">Custo Total (R$)</th>
                    <th className="px-4 py-2.5 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-400 text-xs">
                        Nenhum item adicionado ainda. Preencha os campos acima e clique em "Adicionar Produto à Nota".
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-2.5 font-mono font-bold text-blue-700">
                          {item.productCode}
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-slate-900">
                          {item.productName}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-medium">
                            {item.unit}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={item.quantityBoxes}
                            onChange={(e) => handleUpdateItemProperty(item.id, 'quantityBoxes', Number(e.target.value))}
                            className="w-20 px-2 py-1 text-right text-xs font-bold text-blue-800 border border-slate-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
                            title="Clique para manipular a quantidade de caixas"
                          />
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="inline-flex items-center gap-1 justify-end">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.weightKg}
                              onChange={(e) => handleUpdateItemProperty(item.id, 'weightKg', Number(e.target.value))}
                              className="w-24 px-2 py-1 text-right text-xs font-bold text-emerald-800 border border-slate-300 rounded focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 bg-white"
                              title="Clique para manipular o peso aferido em kg"
                            />
                            <span className="text-xs font-semibold text-slate-500">kg</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right bg-amber-50/30">
                          <div className="inline-flex items-center gap-1 justify-end">
                            <span className="text-xs font-bold text-slate-400">R$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.unitCostPrice !== undefined ? item.unitCostPrice : ''}
                              onChange={(e) => handleUpdateItemProperty(item.id, 'unitCostPrice', Number(e.target.value))}
                              placeholder="0,00"
                              className="w-20 px-2 py-1 text-right text-xs font-bold text-amber-900 border border-amber-300 rounded focus:border-amber-500 focus:ring-1 focus:ring-amber-500 bg-white"
                              title="Clique para alterar o valor de compra pago pela empresa"
                            />
                            <span className="text-[10px] text-slate-500 font-medium">
                              {item.costPriceType === 'POR_KG' ? '/kg' : '/cx'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right bg-amber-50/30 whitespace-nowrap">
                          <div className="inline-flex items-center gap-1 justify-end">
                            <span className="text-xs font-bold text-slate-400">R$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.totalCostPrice !== undefined ? item.totalCostPrice : ''}
                              onChange={(e) => handleUpdateItemTotalCost(item.id, Number(e.target.value))}
                              placeholder="0,00"
                              className="w-24 px-2 py-1 text-right text-xs font-bold text-amber-950 font-mono border border-amber-300 rounded focus:border-amber-500 focus:ring-1 focus:ring-amber-500 bg-white"
                              title="Clique para manipular o custo total deste item diretamente"
                            />
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="text-slate-400 hover:text-rose-600 p-1 rounded"
                            title="Remover produto da nota"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: Summary Before Saving & Save Button */}
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-5 sticky top-20">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-3">
              <Info className="w-4 h-4 text-blue-600" />
              Resumo da Nota Fiscal
            </h2>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Nota Fiscal:</span>
                <span className="font-bold text-slate-900">{invoiceNumber || '—'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Fornecedor:</span>
                <span className="font-semibold text-slate-800 truncate max-w-[150px]">{supplierName || '—'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Data de Entrada:</span>
                <span className="text-slate-800">{date}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Itens Distintos:</span>
                <span className="font-semibold text-slate-900">{items.length} produto(s)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Total de Caixas:</span>
                <span className="font-bold text-blue-700 text-base">{totalBoxes} cx</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Peso Total Bruto:</span>
                <span className="font-bold text-emerald-700 text-base">
                  {totalWeightKg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100 bg-amber-50/70 -mx-3 px-3 rounded-lg border border-amber-200">
                <div>
                  <span className="text-amber-950 font-bold block text-xs">Custo Total de Compra:</span>
                  <span className="text-[10px] text-amber-700 font-semibold flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" />
                    Somente Controle Interno
                  </span>
                </div>
                <span className="font-black text-amber-900 font-mono text-base">
                  {formatBRL(totalCostPrice)}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Usuário Responsável:</span>
                <span className="text-xs font-semibold text-slate-700">{currentUser?.name}</span>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleSaveInvoice}
                disabled={isSubmitting || items.length === 0 || !invoiceNumber || !supplierName}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <Save className="w-5 h-5" />
                {isSubmitting ? 'Gravando no Firebase...' : 'CONFIRMAR E SALVAR NOTA'}
              </button>
              <p className="text-[11px] text-slate-400 text-center mt-2">
                Ao salvar, a movimentação é gravada permanentemente no Firebase e o estoque é incrementado.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Invoices History Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden mt-8">
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-slate-600" />
            <h3 className="font-bold text-slate-900 text-sm sm:text-base">
              Notas Fiscais de Entrada Registradas
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            Total: <strong>{invoices.length}</strong> notas
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-5 py-3">Nota Fiscal</th>
                <th className="px-5 py-3">Data</th>
                <th className="px-5 py-3">Fornecedor</th>
                <th className="px-5 py-3 text-right">Itens</th>
                <th className="px-5 py-3 text-right">Total Caixas</th>
                <th className="px-5 py-3 text-right">Peso (kg)</th>
                <th className="px-5 py-3 text-right bg-amber-50/60 text-amber-900">
                  Valor da Nota (Custo)
                  <span className="block text-[9px] text-amber-700 font-normal">🔒 Controle Interno</span>
                </th>
                <th className="px-5 py-3">Usuário</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-8 text-center text-slate-400 text-xs">
                    Nenhuma nota fiscal registrada no sistema ainda.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className={`hover:bg-slate-50/80 ${inv.status === 'CANCELLED' ? 'bg-slate-100/50 opacity-60' : ''}`}>
                    <td className="px-5 py-3 font-mono font-bold text-blue-700">
                      <div>NF {inv.invoiceNumber}</div>
                      {inv.accessKey && (
                        <span className="text-[10px] font-sans font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded flex items-center gap-1 w-max mt-0.5" title={`Chave: ${inv.accessKey}`}>
                          <Barcode className="w-3 h-3 text-emerald-600" />
                          <span>Chave NF-e</span>
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-700">
                      {inv.date}
                    </td>
                    <td className="px-5 py-3 font-medium text-slate-900">
                      {inv.supplierName}
                    </td>
                    <td className="px-5 py-3 text-right text-slate-700">
                      {inv.items?.length || 0}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-slate-900">
                      {inv.totalBoxes} cx
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-emerald-700 whitespace-nowrap">
                      <div>{inv.totalWeightKg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg</div>
                      {inv.hasWeightAdjustment && inv.totalNfeOriginalWeightKg !== undefined && (
                        <div className="text-[10px] text-slate-400 font-normal">
                          NF-e: {inv.totalNfeOriginalWeightKg.toFixed(2)} kg
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-bold text-amber-900 bg-amber-50/20 whitespace-nowrap">
                      {inv.totalCostPrice ? formatBRL(inv.totalCostPrice) : '—'}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-600">
                      {inv.userName}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                        inv.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {inv.status === 'CONFIRMED' ? 'Confirmada' : 'Cancelada'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right space-x-1 whitespace-nowrap">
                      {inv.status === 'CONFIRMED' && (
                        <button
                          onClick={() => openEditInvoiceCosts(inv)}
                          className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded transition"
                          title="Informar / Alterar custos desta nota"
                        >
                          <DollarSign className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setViewingInvoice(inv);
                          setIsEditingInvoiceCosts(false);
                        }}
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                        title="Ver detalhes da nota"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {inv.status === 'CONFIRMED' && (
                        <button
                          onClick={() => setCancellingInvoice(inv)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                          title="Cancelar / Estornar nota"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice Details Modal */}
      {viewingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  Nota Fiscal {viewingInvoice.invoiceNumber}
                  {isEditingInvoiceCosts && (
                    <span className="text-xs bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded-full">
                      Editando Custos Internos
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-500">
                  Fornecedor: {viewingInvoice.supplierName} • Data: {viewingInvoice.date} • Lançado por: {viewingInvoice.userName}
                </p>
                {viewingInvoice.accessKey && (
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Barcode className="w-3 h-3 text-emerald-600" />
                      Chave NF-e: {viewingInvoice.accessKey.slice(0, 4)}...{viewingInvoice.accessKey.slice(-4)}
                    </span>
                    {viewingInvoice.series && (
                      <span className="text-[10px] font-bold text-slate-600 bg-slate-200 px-2 py-0.5 rounded-full">
                        Série: {viewingInvoice.series}
                      </span>
                    )}
                    {viewingInvoice.hasWeightAdjustment && (
                      <span className="text-[10px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Scale className="w-3 h-3 text-amber-700" />
                        Divergência de Balança Aferida
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!isEditingInvoiceCosts && viewingInvoice.status === 'CONFIRMED' && (
                  <button
                    type="button"
                    onClick={() => openEditInvoiceCosts(viewingInvoice)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Informar / Alterar Custos
                  </button>
                )}
                <button
                  onClick={() => {
                    setViewingInvoice(null);
                    setIsEditingInvoiceCosts(false);
                  }}
                  className="text-slate-400 hover:text-slate-600 text-lg font-bold"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6">
              {viewingInvoice.status === 'CANCELLED' && (
                <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs">
                  <strong>Nota Cancelada por:</strong> {viewingInvoice.cancelledByUserName || 'Usuário'} <br />
                  <strong>Motivo:</strong> {viewingInvoice.cancelReason || 'Sem motivo informado'}
                </div>
              )}

              {/* Box Comparativo de Pesagem Física vs NF-e */}
              {viewingInvoice.totalNfeOriginalWeightKg !== undefined && (
                <div className="mb-4 p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-emerald-700 shrink-0" />
                    <div>
                      <span className="font-bold text-emerald-950 block">Conferência de Pesagem Física (Estoque vs NF-e):</span>
                      <span className="text-[11px] text-emerald-800">
                        O estoque foi lançado com o <strong>Peso Recebido</strong>. O <strong>Peso da NF-e</strong> permanece arquivado como referência original.
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 bg-white px-3 py-1.5 rounded-lg border border-emerald-200 shadow-2xs font-mono self-end sm:self-center">
                    <div>
                      <span className="text-[9px] uppercase font-sans text-slate-400 block">Peso NF-e</span>
                      <span className="font-bold text-slate-700">{viewingInvoice.totalNfeOriginalWeightKg.toFixed(2)} kg</span>
                    </div>
                    <span className="text-slate-400 text-xs">➔</span>
                    <div>
                      <span className="text-[9px] uppercase font-sans text-emerald-700 block font-bold">Recebido</span>
                      <span className="font-black text-emerald-900">{viewingInvoice.totalWeightKg.toFixed(2)} kg</span>
                    </div>
                    {viewingInvoice.hasWeightAdjustment && (
                      <div className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        (viewingInvoice.totalWeightDiffKg || 0) < 0 ? 'bg-rose-100 text-rose-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {(viewingInvoice.totalWeightDiffKg || 0) > 0 ? '+' : ''}{(viewingInvoice.totalWeightDiffKg || 0).toFixed(2)} kg
                      </div>
                    )}
                  </div>
                </div>
              )}

              {isEditingInvoiceCosts ? (
                <div className="mb-4 p-3.5 bg-amber-50 border-2 border-amber-300 rounded-xl text-xs text-amber-950 space-y-2">
                  <div className="flex items-center gap-2 font-black uppercase text-amber-900">
                    <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Edição de Preços de Compra (Controle Interno)</span>
                  </div>
                  <p className="text-amber-800">
                    Digite o custo unitário ou custo total de cada item da nota. Ao salvar, as movimentações de estoque e os relatórios de lucro interno serão recalculados automaticamente.
                  </p>
                </div>
              ) : (
                <div className="mb-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span><strong>Controle Interno:</strong> Os valores de custo abaixo são administrativos e NUNCA aparecem nos Romaneios nem para as lojas.</span>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold text-slate-700 border-b">
                    <tr>
                      <th className="p-2">Cód</th>
                      <th className="p-2">Produto</th>
                      <th className="p-2 text-right">Caixas</th>
                      <th className="p-2 text-right">Peso (kg)</th>
                      <th className="p-2 text-right bg-amber-50/60 text-amber-900">
                        {isEditingInvoiceCosts ? 'Preço Pago (Custo Unitário)' : 'Preço Pago (Custo)'}
                      </th>
                      <th className="p-2 text-right bg-amber-50/60 text-amber-900">Custo Total</th>
                      <th className="p-2 text-center">Modo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {viewingInvoice.items?.map((it) => {
                      const editItem = editingInvoiceCostItems.find(e => e.id === it.id);
                      return (
                        <tr key={it.id}>
                          <td className="p-2 font-mono font-bold text-blue-700">{it.productCode}</td>
                          <td className="p-2 font-medium text-slate-900">{it.productName}</td>
                          <td className="p-2 text-right">{it.quantityBoxes} cx</td>
                          <td className="p-2 text-right">
                            <span className="font-bold text-emerald-700 block">{it.weightKg.toFixed(2)} kg</span>
                            {it.nfeOriginalWeightKg !== undefined && (
                              <span className="text-[10px] text-slate-400 block font-mono">
                                NF-e: {it.nfeOriginalWeightKg.toFixed(2)} kg
                              </span>
                            )}
                            {it.weightDiffKg !== undefined && Math.abs(it.weightDiffKg) >= 0.01 && (
                              <span className={`text-[9px] font-bold px-1 rounded inline-block font-mono ${
                                it.weightDiffKg < 0 ? 'bg-rose-100 text-rose-800' : 'bg-blue-100 text-blue-800'
                              }`}>
                                {it.weightDiffKg > 0 ? '+' : ''}{it.weightDiffKg.toFixed(2)} kg
                              </span>
                            )}
                          </td>
                          
                          {/* Unit cost cell */}
                          <td className="p-2 text-right bg-amber-50/20">
                            {isEditingInvoiceCosts ? (
                              <div className="inline-flex items-center gap-1 justify-end">
                                <span className="text-xs font-bold text-slate-400">R$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={editItem?.unitCostPrice !== undefined ? editItem.unitCostPrice : ''}
                                  onChange={(e) => handleUpdateEditingCostItem(it.id, 'unitCostPrice', e.target.value, it.quantityBoxes, it.weightKg)}
                                  placeholder="0,00"
                                  className="w-20 px-2 py-1 text-right text-xs font-bold text-amber-900 border border-amber-300 rounded focus:border-amber-500 bg-white"
                                />
                                <select
                                  value={editItem?.costPriceType || 'POR_UNIDADE'}
                                  onChange={(e) => handleUpdateEditingCostItem(it.id, 'costPriceType', e.target.value as any, it.quantityBoxes, it.weightKg)}
                                  className="text-[10px] bg-white border border-amber-300 rounded px-1 py-1 font-bold text-amber-900"
                                >
                                  <option value="POR_UNIDADE">/cx</option>
                                  <option value="POR_KG">/kg</option>
                                </select>
                              </div>
                            ) : (
                              <span className="font-mono text-amber-900 text-xs">
                                {it.unitCostPrice ? `${formatBRL(it.unitCostPrice)}${it.costPriceType === 'POR_KG' ? '/kg' : '/cx'}` : '—'}
                              </span>
                            )}
                          </td>

                          {/* Total cost cell */}
                          <td className="p-2 text-right bg-amber-50/20 font-mono font-bold text-amber-950 text-xs">
                            {isEditingInvoiceCosts ? (
                              <div className="inline-flex items-center gap-1 justify-end">
                                <span className="text-xs font-bold text-slate-400">R$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={editItem?.totalCostPrice !== undefined ? editItem.totalCostPrice : ''}
                                  onChange={(e) => handleUpdateEditingCostItem(it.id, 'totalCostPrice', e.target.value, it.quantityBoxes, it.weightKg)}
                                  placeholder="0,00"
                                  className="w-24 px-2 py-1 text-right text-xs font-bold text-amber-950 font-mono border border-amber-300 rounded focus:border-amber-500 bg-white"
                                />
                              </div>
                            ) : (
                              <span>{it.totalCostPrice ? formatBRL(it.totalCostPrice) : '—'}</span>
                            )}
                          </td>

                          <td className="p-2 text-center text-xs text-slate-500">{it.mode === 'by_unit' ? 'Por Caixas' : 'Por Quilos'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t font-bold bg-slate-50">
                    <tr>
                      <td colSpan={2} className="p-2 text-right text-slate-700">Totais:</td>
                      <td className="p-2 text-right text-blue-700">{viewingInvoice.totalBoxes} cx</td>
                      <td className="p-2 text-right text-emerald-700">
                        <div>{viewingInvoice.totalWeightKg.toFixed(2)} kg</div>
                        {viewingInvoice.totalNfeOriginalWeightKg !== undefined && (
                          <div className="text-[10px] text-slate-400 font-normal">
                            NF-e: {viewingInvoice.totalNfeOriginalWeightKg.toFixed(2)} kg
                          </div>
                        )}
                      </td>
                      <td className="p-2 text-right text-amber-900 text-xs">Custo Total da Nota:</td>
                      <td className="p-2 text-right font-mono text-amber-950 font-black">
                        {isEditingInvoiceCosts ? (
                          formatBRL(
                            editingInvoiceCostItems.reduce((sum, it) => sum + (Number(it.totalCostPrice) || 0), 0)
                          )
                        ) : (
                          formatBRL(viewingInvoice.totalCostPrice)
                        )}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {isEditingInvoiceCosts && (
                <div className="mt-4 p-3 bg-amber-50/60 border border-amber-200 rounded-lg">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-amber-950">
                    <input
                      type="checkbox"
                      checked={saveUpdatedCostsToProducts}
                      onChange={(e) => setSaveUpdatedCostsToProducts(e.target.checked)}
                      className="w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500 cursor-pointer"
                    />
                    <span>Atualizar também o preço de custo padrão no cadastro dos produtos correspondentes</span>
                  </label>
                </div>
              )}

              {viewingInvoice.notes && (
                <p className="mt-4 text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <strong>Observações:</strong> {viewingInvoice.notes}
                </p>
              )}

              {viewingInvoice.weightAdjustmentHistory && viewingInvoice.weightAdjustmentHistory.length > 0 && (
                <div className="mt-4 p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center gap-2 font-bold text-slate-800">
                    <Scale className="w-4 h-4 text-emerald-700" />
                    <span>Histórico de Conferência de Pesagem Física na Balança:</span>
                  </div>
                  <div className="space-y-1.5 divide-y divide-slate-200/80">
                    {viewingInvoice.weightAdjustmentHistory.map((adj, i) => (
                      <div key={i} className="pt-1.5 flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-slate-600 gap-1">
                        <div>
                          <strong className="text-slate-900 font-mono">{adj.productCode}</strong> - {adj.productName}:{' '}
                          NF-e Original: <span className="font-mono font-medium">{adj.nfeOriginalWeightKg.toFixed(2)} kg</span> ➔ Recebido:{' '}
                          <strong className="font-mono text-emerald-800">{adj.receivedWeightKg.toFixed(2)} kg</strong>{' '}
                          <span className={`font-mono font-bold px-1.5 py-0.5 rounded text-[10px] ${
                            adj.diffKg < 0 ? 'bg-rose-100 text-rose-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            (Diferença: {adj.diffKg > 0 ? '+' : ''}{adj.diffKg.toFixed(2)} kg)
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
                          {adj.adjustedByUserName} • {new Date(adj.adjustedAtIso).toLocaleString('pt-BR')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <div>
                {isEditingInvoiceCosts && (
                  <span className="text-xs text-amber-900 font-semibold">
                    * Os lucros dos romaneios e relatórios serão recalculados com os novos custos
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isEditingInvoiceCosts ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsEditingInvoiceCosts(false)}
                      disabled={isUpdatingInvoiceCosts}
                      className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-semibold rounded-lg cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveInvoiceCosts}
                      disabled={isUpdatingInvoiceCosts}
                      className="inline-flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold rounded-lg shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      {isUpdatingInvoiceCosts ? 'Salvando...' : 'Salvar Custos da Nota'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setViewingInvoice(null)}
                    className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm font-semibold rounded-lg cursor-pointer"
                  >
                    Fechar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Invoice Modal */}
      {cancellingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-200 overflow-hidden">
            <div className="p-5 bg-rose-50 border-b border-rose-200 flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-rose-600" />
              <div>
                <h3 className="font-bold text-rose-950 text-base">
                  Cancelar Nota Fiscal {cancellingInvoice.invoiceNumber}?
                </h3>
                <p className="text-xs text-rose-700">
                  Esta ação irá estornar as quantidades e pesos do estoque e registrar a auditoria.
                </p>
              </div>
            </div>

            <div className="p-5 space-y-3">
              <label className="block text-xs font-semibold text-slate-700 uppercase">
                Motivo do Cancelamento <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ex: Erro de digitação na quantidade de contrafilé informado pela portaria..."
                className="w-full p-2.5 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-rose-500"
                rows={3}
                required
              />
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => {
                  setCancellingInvoice(null);
                  setCancelReason('');
                }}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-lg"
              >
                Voltar
              </button>
              <button
                onClick={handleConfirmCancel}
                disabled={!cancelReason.trim()}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg shadow-sm"
              >
                Confirmar Cancelamento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
