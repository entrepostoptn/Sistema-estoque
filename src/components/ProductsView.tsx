import React, { useState, useMemo } from 'react';
import { 
  Package, 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Scale, 
  Box, 
  Filter, 
  Save, 
  X,
  Check,
  RefreshCw,
  Truck,
  DollarSign,
  Tag,
  Building2,
  Lock
} from 'lucide-react';
import { Product, UnitType, Supplier } from '../types';
import { 
  createProduct, 
  updateProduct, 
  toggleProductStatus, 
  deleteProduct, 
  validateProductCode, 
  checkProductCodeUnique,
  getNextSequentialProductCode,
  checkProductNameSupplierDuplicate,
  normalizeText
} from '../services/productService';

interface ProductsViewProps {
  products: Product[];
  suppliers?: Supplier[];
  onOpenEntriesForProduct?: (productId: string) => void;
  onOpenNewSupplier?: () => void;
}

const UNIT_OPTIONS: Array<{ value: UnitType; label: string }> = [
  { value: 'CAIXA', label: 'CAIXA (cx)' },
  { value: 'PACOTE', label: 'PACOTE (pct)' },
  { value: 'PECA', label: 'PEÇA (pç)' },
  { value: 'UNIDADE', label: 'UNIDADE (un)' },
  { value: 'FARDO', label: 'FARDO (fd)' },
  { value: 'KG', label: 'QUILOGRAMA (kg)' },
];

export const ProductsView: React.FC<ProductsViewProps> = ({ 
  products,
  suppliers = [],
  onOpenNewSupplier
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form State
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<UnitType>('CAIXA');
  const [defaultWeightKg, setDefaultWeightKg] = useState<number | string>(20);
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [costPrice, setCostPrice] = useState<number | string>('');
  const [costPriceType, setCostPriceType] = useState<'POR_KG' | 'POR_UNIDADE'>('POR_UNIDADE');
  const [salePrice, setSalePrice] = useState<number | string>('');
  const [salePriceType, setSalePriceType] = useState<'POR_KG' | 'POR_UNIDADE'>('POR_KG');
  const [active, setActive] = useState(true);

  // Validation & UI State
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const sTerm = searchTerm.toLowerCase();
      const matchesSearch = 
        p.name.toLowerCase().includes(sTerm) ||
        p.code.includes(searchTerm) ||
        (p.supplierName && p.supplierName.toLowerCase().includes(sTerm));
      const matchesStatus = 
        statusFilter === 'ALL' 
          ? true 
          : statusFilter === 'ACTIVE' 
            ? p.active 
            : !p.active;
      return matchesSearch && matchesStatus;
    });
  }, [products, searchTerm, statusFilter]);

  const openNewModal = () => {
    setEditingProduct(null);
    const nextCode = getNextSequentialProductCode(products);
    setCode(nextCode);
    setName('');
    setUnit('CAIXA');
    setDefaultWeightKg(20);
    setSupplierId('');
    setSupplierName('');
    setCostPrice('');
    setCostPriceType('POR_UNIDADE');
    setSalePrice('');
    setSalePriceType('POR_KG');
    setActive(true);
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setCode(product.code);
    setName(product.name);
    setUnit(product.unit);
    setDefaultWeightKg(product.defaultWeightKg || 0);
    setSupplierId(product.supplierId || '');
    setSupplierName(product.supplierName || '');
    setCostPrice(product.costPrice !== undefined && product.costPrice > 0 ? product.costPrice : '');
    setCostPriceType(product.costPriceType || 'POR_UNIDADE');
    setSalePrice(product.salePrice !== undefined && product.salePrice > 0 ? product.salePrice : '');
    setSalePriceType(product.salePriceType || 'POR_KG');
    setActive(product.active);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSupplierSelect = (id: string) => {
    setSupplierId(id);
    if (!id) {
      setSupplierName('');
      return;
    }
    const found = suppliers.find(s => s.id === id);
    if (found) {
      setSupplierName(found.name);
    }
  };

  // Instant code validator
  const codeValidation = useMemo(() => {
    if (!code) return { isValid: false, message: 'Digite de 2 a 4 números' };
    return validateProductCode(code);
  }, [code]);

  // Real-time duplicate validation: blocks if product name and supplier are duplicate, or if name === supplier
  const duplicateWarning = useMemo(() => {
    const normName = normalizeText(name);
    const normSupplier = normalizeText(supplierName);
    if (!normName) return null;

    // 1. Literal check: product name cannot be equal to supplier name
    if (normSupplier && normName === normSupplier) {
      return 'O nome do produto não pode ser idêntico ao nome do fornecedor.';
    }

    // 2. Check if a product with this exact name and exact supplier already exists
    const duplicate = products.find(p => {
      if (editingProduct && p.id === editingProduct.id) return false;
      const pNormName = normalizeText(p.name);
      const pNormSupplier = normalizeText(p.supplierName);

      // Must match name (case & accent insensitive)
      if (pNormName !== normName) return false;

      // Must match supplier:
      // a) Identical normalized supplier name
      // b) Same supplierId
      // c) Both without supplier
      const sameSupplierName = Boolean(normSupplier && pNormSupplier && normSupplier === pNormSupplier);
      const sameSupplierId = Boolean(supplierId && p.supplierId && supplierId === p.supplierId);
      const bothWithoutSupplier = !normSupplier && !pNormSupplier;

      return sameSupplierName || sameSupplierId || bothWithoutSupplier;
    });

    if (duplicate) {
      const suppText = duplicate.supplierName || supplierName 
        ? `para o fornecedor "${duplicate.supplierName || supplierName}"` 
        : 'sem fornecedor associado';
      return `Já existe um produto cadastrado com o nome "${duplicate.name}" ${suppText} (Código: ${duplicate.code}). Não é permitido cadastrar produtos com o mesmo nome e mesmo fornecedor.`;
    }

    return null;
  }, [name, supplierName, supplierId, products, editingProduct]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validate Code
    const codeVal = validateProductCode(code);
    if (!codeVal.isValid) {
      setFormError(codeVal.error || 'Código inválido.');
      return;
    }

    if (!name.trim()) {
      setFormError('O nome do produto é obrigatório.');
      return;
    }

    // Block if duplicate name and supplier in UI
    if (duplicateWarning) {
      setFormError(duplicateWarning);
      return;
    }

    // Secondary deep check against local + database
    const dupCheck = await checkProductNameSupplierDuplicate(
      name,
      supplierName,
      editingProduct?.id,
      products,
      supplierId
    );
    if (dupCheck.isDuplicate) {
      setFormError(dupCheck.error || 'Não é permitido cadastrar produtos com o mesmo nome e mesmo fornecedor.');
      return;
    }

    setSaving(true);
    try {
      const parsedCostPrice = costPrice === '' ? undefined : Number(costPrice) > 0 ? Number(costPrice) : undefined;
      const parsedSalePrice = salePrice === '' ? 0 : Number(salePrice) || 0;
      if (editingProduct) {
        await updateProduct(editingProduct.id, {
          code: code.trim(),
          name: name.trim().toUpperCase(),
          unit,
          defaultWeightKg: Number(defaultWeightKg) || 0,
          supplierId: supplierId.trim(),
          supplierName: supplierName.trim(),
          costPrice: parsedCostPrice,
          costPriceType,
          salePrice: parsedSalePrice,
          salePriceType,
          active
        });
        setActionSuccess(`Produto "${name.toUpperCase()}" atualizado com sucesso!`);
      } else {
        await createProduct({
          code: code.trim(),
          name: name.trim().toUpperCase(),
          unit,
          defaultWeightKg: Number(defaultWeightKg) || 0,
          supplierId: supplierId.trim(),
          supplierName: supplierName.trim(),
          costPrice: parsedCostPrice,
          costPriceType,
          salePrice: parsedSalePrice,
          salePriceType,
          active
        });
        setActionSuccess(`Produto "${name.toUpperCase()}" cadastrado com sucesso!`);
      }
      setModalOpen(false);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      setFormError(err.message || 'Erro ao salvar produto.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (product: Product) => {
    try {
      await toggleProductStatus(product.id, product.active);
      setActionSuccess(`Status do produto "${product.name}" alterado.`);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Erro ao alterar status.');
    }
  };

  const handleDelete = async (product: Product) => {
    if (confirm(`Deseja realmente excluir o produto "${product.code} - ${product.name}"?`)) {
      try {
        await deleteProduct(product.id);
        setActionSuccess(`Produto removido com sucesso.`);
        setTimeout(() => setActionSuccess(null), 3000);
      } catch (err: any) {
        alert(err.message || 'Erro ao excluir produto.');
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Package className="w-6 h-6 text-blue-600" />
            Cadastro e Gerenciamento de Produtos
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Controle de produtos, códigos numéricos exclusivos (2 a 4 dígitos), peso padrão e unidade.
          </p>
        </div>
        <button
          onClick={openNewModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm transition shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Novo Produto
        </button>
      </div>

      {actionSuccess && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-600 hover:text-emerald-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar por nome ou código numérico (ex: 101, Contrafilé)..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-medium text-slate-500">Status:</span>
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-md font-medium transition ${
                statusFilter === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todos ({products.length})
            </button>
            <button
              onClick={() => setStatusFilter('ACTIVE')}
              className={`px-3 py-1.5 rounded-md font-medium transition ${
                statusFilter === 'ACTIVE' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Ativos ({products.filter(p => p.active).length})
            </button>
            <button
              onClick={() => setStatusFilter('INACTIVE')}
              className={`px-3 py-1.5 rounded-md font-medium transition ${
                statusFilter === 'INACTIVE' ? 'bg-white text-rose-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Inativos ({products.filter(p => !p.active).length})
            </button>
          </div>
        </div>
      </div>

      {/* Database-style Products Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-700 border-b border-slate-200 tracking-wider">
              <tr>
                <th className="px-5 py-3.5 w-24">Código</th>
                <th className="px-5 py-3.5">Nome do Produto</th>
                <th className="px-5 py-3.5">Fornecedor</th>
                <th className="px-5 py-3.5">Unidade</th>
                <th className="px-5 py-3.5">Peso Padrão (kg)</th>
                <th className="px-5 py-3.5 text-right bg-amber-50/50 text-amber-950">
                  Custo Compra (R$)
                  <span className="block text-[9px] text-amber-700 font-normal">🔒 Controle Interno</span>
                </th>
                <th className="px-5 py-3.5 text-right">Valor Venda (R$)</th>
                <th className="px-5 py-3.5 text-center">Status</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                    <Box className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <p className="font-medium text-slate-600">Nenhum produto encontrado</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {searchTerm ? 'Tente ajustar sua busca ou filtro.' : 'Clique em "Novo Produto" para cadastrar o primeiro item.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3.5 font-mono font-bold text-blue-700 text-base">
                      {product.code}
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-slate-900">
                      {product.name}
                    </td>
                    <td className="px-5 py-3.5">
                      {product.supplierName ? (
                        <div className="flex items-center gap-1.5 text-slate-700 font-medium text-xs">
                          <Truck className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="truncate max-w-[150px]" title={product.supplierName}>{product.supplierName}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs italic">Não informado</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800">
                        {product.unit}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5 text-slate-700 font-medium text-xs">
                        <Scale className="w-3.5 h-3.5 text-slate-400" />
                        <span>{product.defaultWeightKg > 0 ? `${product.defaultWeightKg} kg / ${product.unit.toLowerCase()}` : '—'}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right bg-amber-50/20">
                      {product.costPrice && product.costPrice > 0 ? (
                        <div className="inline-flex flex-col items-end">
                          <span className="font-bold text-amber-950 font-mono text-sm">
                            {product.costPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                          <span className="text-[10px] text-amber-700 font-semibold uppercase">
                            {product.costPriceType === 'POR_KG' ? 'por kg' : `por ${product.unit.toLowerCase()}`}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs italic">Não inf.</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {product.salePrice && product.salePrice > 0 ? (
                        <div className="inline-flex flex-col items-end">
                          <span className="font-bold text-emerald-700 text-sm">
                            {product.salePrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                          <span className="text-[10px] text-slate-500 font-semibold uppercase">
                            {product.salePriceType === 'POR_UNIDADE' ? `por ${product.unit.toLowerCase()}` : 'por kg'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs italic">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <button
                        onClick={() => handleToggleStatus(product)}
                        title="Clique para alternar status"
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold cursor-pointer transition ${
                          product.active 
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' 
                            : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                        }`}
                      >
                        {product.active ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" /> Ativo
                          </>
                        ) : (
                          <>
                            <X className="w-3 h-3 text-rose-600" /> Inativo
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-5 py-3.5 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => openEditModal(product)}
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition"
                        title="Editar produto"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(product)}
                        className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md transition"
                        title="Excluir produto"
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
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex justify-between items-center">
          <span>Mostrando <strong>{filteredProducts.length}</strong> de <strong>{products.length}</strong> produtos</span>
          <span className="text-[11px] text-slate-400">Códigos numéricos únicos de 2 a 4 dígitos</span>
        </div>
      </div>

      {/* Product Modal (Create / Edit) */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-600" />
                {editingProduct ? 'Editar Produto' : 'Cadastrar Novo Produto'}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSave} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Code Field with Strict Numeric 2-4 digit requirement */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Código Numérico do Produto <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded">
                      Sequencial
                    </span>
                    {!editingProduct && (
                      <button
                        type="button"
                        onClick={() => setCode(getNextSequentialProductCode(products))}
                        className="text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                        title="Clique para preencher com o próximo código sequencial disponível"
                      >
                        Próximo Sequencial ({getNextSequentialProductCode(products)})
                      </button>
                    )}
                  </div>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    maxLength={4}
                    value={code}
                    onChange={(e) => {
                      // Filter out any non-numeric character immediately
                      const numericOnly = e.target.value.replace(/\D/g, '');
                      setCode(numericOnly);
                    }}
                    placeholder="Ex: 101 (somente números, 2 a 4 dígitos)"
                    className={`w-full px-3.5 py-2.5 text-base font-mono font-bold tracking-wider rounded-lg border outline-none transition ${
                      codeValidation.isValid 
                        ? 'border-emerald-400 bg-emerald-50/20 text-emerald-950 focus:ring-2 focus:ring-emerald-500' 
                        : code 
                          ? 'border-rose-300 bg-rose-50/30 text-rose-950 focus:ring-2 focus:ring-rose-500' 
                          : 'border-slate-300 focus:ring-2 focus:ring-blue-500'
                    }`}
                    required
                  />
                  {code && (
                    <div className="absolute right-3 top-3">
                      {codeValidation.isValid ? (
                        <CheckCircle className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-rose-500" />
                      )}
                    </div>
                  )}
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span className={codeValidation.isValid ? 'text-emerald-700 font-medium' : 'text-slate-500'}>
                    Regra: estritamente números, de 2 a 4 dígitos (ex: 10, 101, 1001, 9999)
                  </span>
                  <span className="font-mono text-slate-400">{code.length}/4 dígitos</span>
                </div>
              </div>

              {/* Product Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Nome do Produto <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value.toUpperCase())}
                  placeholder="Ex: CONTRAFILÉ, PICANHA, CORAÇÃO"
                  className={`w-full px-3.5 py-2 text-sm border rounded-lg outline-none uppercase font-semibold transition ${
                    duplicateWarning
                      ? 'border-rose-400 bg-rose-50/20 text-rose-950 focus:ring-2 focus:ring-rose-500'
                      : 'border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                  }`}
                  required
                />
                {duplicateWarning && (
                  <p className="text-xs font-bold text-rose-600 mt-1 flex items-center gap-1.5 animate-in fade-in">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{duplicateWarning}</span>
                  </p>
                )}
              </div>

              {/* Unit & Default Weight Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Unidade de Controle
                  </label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value as UnitType)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium"
                  >
                    {UNIT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Peso Padrão por Unidade (kg)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={defaultWeightKg}
                      onChange={(e) => setDefaultWeightKg(e.target.value)}
                      placeholder="Ex: 20"
                      className="w-full pl-3 pr-10 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-slate-900"
                    />
                    <span className="absolute right-3 top-2 text-xs font-semibold text-slate-400">
                      kg
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Ex: 1 caixa = 20 kg
                  </span>
                </div>
              </div>

              {/* Fornecedor (Supplier) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-blue-600" />
                    Fornecedor do Produto
                  </label>
                  {onOpenNewSupplier && (
                    <button
                      type="button"
                      onClick={() => {
                        setModalOpen(false);
                        onOpenNewSupplier();
                      }}
                      className="text-[11px] text-blue-600 hover:underline font-medium"
                    >
                      + Cadastrar Fornecedor
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <select
                      value={supplierId}
                      onChange={(e) => handleSupplierSelect(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white font-medium"
                    >
                      <option value="">-- Selecionar cadastrado --</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} {s.cnpj ? `(${s.cnpj})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <input
                      type="text"
                      value={supplierName}
                      onChange={(e) => {
                        setSupplierName(e.target.value);
                        const match = suppliers.find(s => s.name.toLowerCase() === e.target.value.toLowerCase());
                        setSupplierId(match ? match.id : '');
                      }}
                      placeholder="Ou digite o nome do fornecedor..."
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Escolha da lista de fornecedores ou digite livremente o frigorífico / distribuidor.
                </span>

                {/* Real-time duplicate blocker banner */}
                {duplicateWarning && (
                  <div className="mt-2 p-3.5 bg-rose-50 border-2 border-rose-300 rounded-xl text-rose-900 text-xs flex items-start gap-2.5 shadow-xs animate-in fade-in">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block text-rose-800 font-bold mb-0.5">Cadastro Bloqueado:</strong>
                      <span>{duplicateWarning}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Valor de Compra / Custo Pago (SOMENTE CONTROLE INTERNO) */}
              <div className="bg-amber-50/70 p-3.5 rounded-xl border border-amber-300 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-700" />
                    Valor de Compra / Custo (R$)
                    <span className="text-[10px] bg-amber-200/90 text-amber-900 px-2 py-0.5 rounded-full font-extrabold">
                      CONTROLE INTERNO
                    </span>
                  </label>
                  <div className="inline-flex rounded-lg border border-amber-300 p-0.5 bg-white text-xs">
                    <button
                      type="button"
                      onClick={() => setCostPriceType('POR_UNIDADE')}
                      className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                        costPriceType === 'POR_UNIDADE' ? 'bg-amber-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      R$ por {unit.toLowerCase()}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCostPriceType('POR_KG')}
                      className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                        costPriceType === 'POR_KG' ? 'bg-amber-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      R$ por kg
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <span className="absolute left-3 top-2 text-sm font-bold text-amber-700">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={costPrice}
                    onChange={(e) => setCostPrice(e.target.value)}
                    placeholder="Ex: 80.00"
                    className="w-full pl-10 pr-24 py-2 text-base font-bold text-slate-900 bg-white border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                  <span className="absolute right-3 top-2.5 text-xs font-bold text-amber-800">
                    {costPriceType === 'POR_KG' ? '/ kg' : `/ ${unit.toLowerCase()}`}
                  </span>
                </div>

                <p className="text-[11px] text-amber-800 font-medium">
                  🔒 Confidencial: custo pago pela empresa ao fornecedor. Usado exclusivamente para apuração de lucro interno e NUNCA aparece no Romaneio.
                </p>
              </div>

              {/* Valor de Venda (Sale Price) */}
              <div className="bg-emerald-50/60 p-3.5 rounded-xl border border-emerald-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-700" />
                    Valor de Venda (R$)
                  </label>
                  <div className="inline-flex rounded-lg border border-emerald-300 p-0.5 bg-white text-xs">
                    <button
                      type="button"
                      onClick={() => setSalePriceType('POR_KG')}
                      className={`px-2.5 py-1 rounded-md font-semibold transition ${
                        salePriceType === 'POR_KG' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      R$ por kg
                    </button>
                    <button
                      type="button"
                      onClick={() => setSalePriceType('POR_UNIDADE')}
                      className={`px-2.5 py-1 rounded-md font-semibold transition ${
                        salePriceType === 'POR_UNIDADE' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      R$ por {unit.toLowerCase()}
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <span className="absolute left-3 top-2 text-sm font-bold text-emerald-700">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                    placeholder="Ex: 48.90"
                    className="w-full pl-10 pr-24 py-2 text-base font-bold text-slate-900 bg-white border border-emerald-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                  <span className="absolute right-3 top-2.5 text-xs font-bold text-emerald-800">
                    {salePriceType === 'POR_KG' ? '/ kg' : `/ ${unit.toLowerCase()}`}
                  </span>
                </div>

                {Number(salePrice) > 0 && Number(defaultWeightKg) > 0 && (
                  <div className="text-[11px] text-emerald-900 bg-white/80 p-2 rounded-lg border border-emerald-200/80 flex items-center justify-between font-medium">
                    <span>
                      {salePriceType === 'POR_KG' 
                        ? `Valor estimado por ${unit.toLowerCase()} (~${defaultWeightKg} kg):` 
                        : `Valor equivalente estimado por kg:`}
                    </span>
                    <strong className="text-emerald-950 font-bold">
                      {salePriceType === 'POR_KG'
                        ? (Number(salePrice) * Number(defaultWeightKg)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        : (Number(salePrice) / Number(defaultWeightKg)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + ' / kg'
                      }
                    </strong>
                  </div>
                )}
              </div>

              {/* Status Switch */}
              <div className="pt-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-sm font-semibold text-slate-800">Produto Ativo</span>
                    <p className="text-xs text-slate-500">Produtos ativos podem ser movimentados em notas e romaneios</p>
                  </div>
                </label>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || !codeValidation.isValid || Boolean(duplicateWarning)}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm rounded-lg transition shadow-sm cursor-pointer"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Gravando...
                    </>
                  ) : duplicateWarning ? (
                    <>
                      <AlertCircle className="w-4 h-4 text-rose-300" />
                      Nome e Fornecedor Iguais (Bloqueado)
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      {editingProduct ? 'Salvar Alterações' : 'Cadastrar Produto'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
