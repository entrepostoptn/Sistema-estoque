import React, { useState, useMemo } from 'react';
import { 
  Store as StoreIcon, 
  Building2, 
  Plus, 
  Trash2, 
  Edit3, 
  CheckCircle, 
  X, 
  Save, 
  MapPin, 
  Phone, 
  FileText,
  AlertTriangle,
  Search,
  CheckSquare,
  Square,
  CopyX,
  Filter
} from 'lucide-react';
import { Store, Supplier, UserAccount } from '../types';
import { 
  createStore, 
  updateStore, 
  deleteStore, 
  deleteStoresMatchingName,
  deleteStoresPatternNumberedLoja,
  isNumberedExampleStore,
  deleteDuplicateStores,
  createSupplier, 
  updateSupplier, 
  deleteSupplier 
} from '../services/storeService';

interface StoresAndSuppliersViewProps {
  stores: Store[];
  suppliers: Supplier[];
  currentUser?: UserAccount | null;
}

export const StoresAndSuppliersView: React.FC<StoresAndSuppliersViewProps> = ({ 
  stores, 
  suppliers,
  currentUser 
}) => {
  const [activeTab, setActiveTab] = useState<'stores' | 'suppliers'>('stores');

  // Search & Selection State
  const [storeSearch, setStoreSearch] = useState('');
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Store modal
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [storeName, setStoreName] = useState('');
  const [storeCode, setStoreCode] = useState('');
  const [storeAddress, setStoreAddress] = useState('');

  // Supplier modal
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierName, setSupplierName] = useState('');
  const [supplierCnpj, setSupplierCnpj] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');

  const [saving, setSaving] = useState(false);
  const [processingBulk, setProcessingBulk] = useState(false);

  // Check how many stores have exact name "loja" (case-insensitive / trimmed)
  const storesNamedLoja = useMemo(() => {
    return stores.filter(s => (s.name || '').trim().toLowerCase() === 'loja');
  }, [stores]);

  // Check how many stores match the pattern "LOJA 01, LOJA 02 e assim sucessivamente"
  const storesNumberedExample = useMemo(() => {
    return stores.filter(s => isNumberedExampleStore(s.name, s.code));
  }, [stores]);

  // Check duplicate store names
  const duplicateStoreCount = useMemo(() => {
    const seen = new Set<string>();
    let dupes = 0;
    for (const s of stores) {
      const key = (s.name || '').trim().toUpperCase();
      if (seen.has(key)) {
        dupes++;
      } else {
        seen.add(key);
      }
    }
    return dupes;
  }, [stores]);

  // Filtered stores
  const filteredStores = useMemo(() => {
    const term = storeSearch.trim().toLowerCase();
    if (!term) return stores;
    return stores.filter(s => 
      (s.name || '').toLowerCase().includes(term) ||
      (s.code || '').toLowerCase().includes(term) ||
      (s.address || '').toLowerCase().includes(term)
    );
  }, [stores, storeSearch]);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setStatusMessage({ text, type });
    setTimeout(() => {
      setStatusMessage(null);
    }, 4500);
  };

  // Bulk action: Delete all stores whose name is equal to "loja"
  const handleDeleteStoresNamedLoja = async () => {
    const count = storesNamedLoja.length;
    const confirmMessage = count > 0
      ? `Confirmar exclusão de TODAS as ${count} loja(s) cujo Nome da Loja seja igual a "loja"? Esta ação não pode ser desfeita.`
      : 'Deseja pesquisar e excluir todas as lojas cujo nome seja exatamente "loja"?';

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setProcessingBulk(true);
    try {
      const res = await deleteStoresMatchingName('loja', currentUser);
      if (res.count > 0) {
        showToast(`Sucesso! ${res.count} loja(s) com o nome "loja" foram excluídas com sucesso.`, 'success');
        setSelectedStoreIds(prev => prev.filter(id => !storesNamedLoja.some(s => s.id === id)));
      } else {
        showToast('Nenhuma loja cadastrada com o nome exato "loja" foi encontrada.', 'info');
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao excluir lojas com nome "loja".', 'error');
    } finally {
      setProcessingBulk(false);
    }
  };

  // Bulk action: Delete all stores matching LOJA 01, LOJA 02 e assim sucessivamente
  const handleDeleteNumberedStores = async () => {
    const count = storesNumberedExample.length;
    const confirmMessage = count > 0
      ? `Confirmar a exclusão permanente de TODAS as ${count} lojas de modelo numeradas (ex: LOJA 01, LOJA 02, LOJA 03 e sucessivamente)? Essa ação limpará definitivamente os cadastros do banco de dados e do dispositivo.`
      : 'Deseja pesquisar e excluir todas as lojas que sigam o formato "LOJA 01, LOJA 02 e sucessivamente"?';

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setProcessingBulk(true);
    try {
      const res = await deleteStoresPatternNumberedLoja(currentUser);
      if (res.count > 0) {
        showToast(`Sucesso! ${res.count} lojas numeradas (LOJA 01, LOJA 02...) foram excluídas definitivamente.`, 'success');
        setSelectedStoreIds([]);
      } else {
        showToast('Nenhuma loja no modelo numerado (LOJA 01, LOJA 02...) foi encontrada.', 'info');
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao excluir lojas numeradas.', 'error');
    } finally {
      setProcessingBulk(false);
    }
  };

  // Bulk action: Delete duplicate stores
  const handleDeleteDuplicates = async () => {
    if (duplicateStoreCount === 0) {
      showToast('Nenhuma loja com nome duplicado foi encontrada.', 'info');
      return;
    }

    if (!window.confirm(`Foram identificadas ${duplicateStoreCount} lojas com nomes duplicados. Deseja excluir os cadastros repetidos mantendo apenas 1 de cada?`)) {
      return;
    }

    setProcessingBulk(true);
    try {
      const res = await deleteDuplicateStores(currentUser);
      showToast(`${res.count} lojas duplicadas foram removidas com sucesso!`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Erro ao remover lojas duplicadas.', 'error');
    } finally {
      setProcessingBulk(false);
    }
  };

  // Bulk action: Delete selected stores
  const handleDeleteSelected = async () => {
    if (selectedStoreIds.length === 0) return;

    if (!window.confirm(`Excluir as ${selectedStoreIds.length} lojas selecionadas?`)) {
      return;
    }

    setProcessingBulk(true);
    try {
      let deleted = 0;
      for (const id of selectedStoreIds) {
        await deleteStore(id, currentUser);
        deleted++;
      }
      setSelectedStoreIds([]);
      showToast(`${deleted} lojas selecionadas foram excluídas com sucesso!`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Erro ao excluir lojas selecionadas.', 'error');
    } finally {
      setProcessingBulk(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedStoreIds.length === filteredStores.length) {
      setSelectedStoreIds([]);
    } else {
      setSelectedStoreIds(filteredStores.map(s => s.id));
    }
  };

  const toggleSelectStore = (id: string) => {
    setSelectedStoreIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Store actions
  const openNewStore = () => {
    setEditingStore(null);
    setStoreName('');
    setStoreCode(`LJ${String(stores.length + 1).padStart(2, '0')}`);
    setStoreAddress('');
    setStoreModalOpen(true);
  };

  const openEditStore = (store: Store) => {
    setEditingStore(store);
    setStoreName(store.name);
    setStoreCode(store.code || '');
    setStoreAddress(store.address || '');
    setStoreModalOpen(true);
  };

  const handleSaveStore = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = storeName.trim();
    if (!clean) {
      showToast('O nome da loja é obrigatório.', 'error');
      return;
    }

    // Friendly warning if user types only "loja"
    if (clean.toLowerCase() === 'loja') {
      if (!window.confirm('O nome informado é apenas "LOJA". Deseja salvar mesmo assim com este nome genérico?')) {
        return;
      }
    }

    setSaving(true);
    try {
      if (editingStore) {
        await updateStore(editingStore.id, {
          name: clean.toUpperCase(),
          code: storeCode.trim().toUpperCase(),
          address: storeAddress.trim(),
          active: editingStore.active
        }, currentUser);
        showToast(`Loja "${clean.toUpperCase()}" atualizada!`, 'success');
      } else {
        await createStore({
          name: clean.toUpperCase(),
          code: storeCode.trim().toUpperCase(),
          address: storeAddress.trim()
        }, currentUser);
        showToast(`Loja "${clean.toUpperCase()}" cadastrada!`, 'success');
      }
      setStoreModalOpen(false);
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar loja.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Supplier actions
  const openNewSupplier = () => {
    setEditingSupplier(null);
    setSupplierName('');
    setSupplierCnpj('');
    setSupplierPhone('');
    setSupplierModalOpen(true);
  };

  const openEditSupplier = (sup: Supplier) => {
    setEditingSupplier(sup);
    setSupplierName(sup.name);
    setSupplierCnpj(sup.cnpj || '');
    setSupplierPhone(sup.phone || '');
    setSupplierModalOpen(true);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName.trim()) return;
    setSaving(true);
    try {
      if (editingSupplier) {
        await updateSupplier(editingSupplier.id, {
          name: supplierName.trim(),
          cnpj: supplierCnpj.trim(),
          phone: supplierPhone.trim(),
          active: editingSupplier.active
        });
        showToast(`Fornecedor "${supplierName.trim()}" atualizado!`, 'success');
      } else {
        await createSupplier({
          name: supplierName.trim(),
          cnpj: supplierCnpj.trim(),
          phone: supplierPhone.trim()
        });
        showToast(`Fornecedor "${supplierName.trim()}" cadastrado!`, 'success');
      }
      setSupplierModalOpen(false);
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar fornecedor.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {statusMessage && (
        <div className={`p-4 rounded-xl text-sm font-semibold flex items-center justify-between gap-3 shadow-md transition-all ${
          statusMessage.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
            : statusMessage.type === 'error'
              ? 'bg-rose-50 text-rose-800 border border-rose-200'
              : 'bg-blue-50 text-blue-800 border border-blue-200'
        }`}>
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />}
            {statusMessage.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />}
            {statusMessage.type === 'info' && <StoreIcon className="w-5 h-5 text-blue-600 shrink-0" />}
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Title */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <StoreIcon className="w-6 h-6 text-blue-600" />
            Lojas de Destino & Fornecedores
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Cadastre as lojas que recebem os romaneios de saída e os fornecedores das notas fiscais.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {activeTab === 'stores' ? (
            <>
              {/* Button to Delete all stores like LOJA 01, LOJA 02 and successively */}
              <button
                onClick={handleDeleteNumberedStores}
                disabled={processingBulk}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border transition ${
                  storesNumberedExample.length > 0
                    ? 'bg-rose-600 text-white hover:bg-rose-700 border-rose-700 shadow-xs'
                    : 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                }`}
                title="Exclui todas as lojas numeradas como LOJA 01, LOJA 02 e assim sucessivamente"
              >
                <Trash2 className="w-4 h-4" />
                Excluir LOJA 01, LOJA 02...
                {storesNumberedExample.length > 0 && (
                  <span className="bg-white/25 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold ml-0.5">
                    {storesNumberedExample.length}
                  </span>
                )}
              </button>

              {/* Button to Delete all stores whose name is equal to "loja" */}
              <button
                onClick={handleDeleteStoresNamedLoja}
                disabled={processingBulk}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border transition ${
                  storesNamedLoja.length > 0
                    ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100 ring-2 ring-amber-400/20'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-rose-600'
                }`}
                title="Exclui todas as lojas cujo nome seja igual a 'loja'"
              >
                <Trash2 className="w-4 h-4 text-slate-500" />
                Excluir lojas com nome "Loja"
                {storesNamedLoja.length > 0 && (
                  <span className="bg-amber-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                    {storesNamedLoja.length}
                  </span>
                )}
              </button>

              {/* Button to remove duplicate stores if any */}
              {duplicateStoreCount > 0 && (
                <button
                  onClick={handleDeleteDuplicates}
                  disabled={processingBulk}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 transition"
                  title="Remove cadastros com nomes duplicados mantendo 1 registro"
                >
                  <CopyX className="w-4 h-4 text-amber-600" />
                  Limpar Duplicadas ({duplicateStoreCount})
                </button>
              )}

              <button
                onClick={openNewStore}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition shadow-xs"
              >
                <Plus className="w-4 h-4" />
                Nova Loja
              </button>
            </>
          ) : (
            <button
              onClick={openNewSupplier}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition shadow-xs"
            >
              <Plus className="w-4 h-4" />
              Novo Fornecedor
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-4">
        <button
          onClick={() => setActiveTab('stores')}
          className={`pb-3 font-bold text-sm border-b-2 transition flex items-center gap-2 ${
            activeTab === 'stores'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <StoreIcon className="w-4 h-4" />
          Lojas de Destino ({stores.length})
        </button>

        <button
          onClick={() => setActiveTab('suppliers')}
          className={`pb-3 font-bold text-sm border-b-2 transition flex items-center gap-2 ${
            activeTab === 'suppliers'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Fornecedores ({suppliers.length})
        </button>
      </div>

      {/* Banner if stores like LOJA 01, LOJA 02... exist */}
      {activeTab === 'stores' && storesNumberedExample.length > 0 && (
        <div className="bg-rose-50 border border-rose-300 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-rose-950 shadow-xs animate-in fade-in duration-300">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-100 rounded-lg text-rose-700">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-sm">
                {storesNumberedExample.length === 1 
                  ? 'Foi detectada 1 loja cadastrada no modelo de exemplo (LOJA 01).'
                  : `Foram detectadas ${storesNumberedExample.length} lojas com nomes como "LOJA 01, LOJA 02 e sucessivamente".`}
              </p>
              <p className="text-xs text-rose-700 mt-0.5">
                Clique no botão ao lado para excluir permanentemente todas essas lojas de exemplo do banco de dados e do dispositivo.
              </p>
            </div>
          </div>
          <button
            onClick={handleDeleteNumberedStores}
            disabled={processingBulk}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition inline-flex items-center gap-2 shrink-0 shadow-xs"
          >
            <Trash2 className="w-4 h-4" />
            {processingBulk ? 'Excluindo...' : `Excluir todas (LOJA 01, LOJA 02...) [${storesNumberedExample.length}]`}
          </button>
        </div>
      )}

      {/* Banner if stores with name 'loja' exist */}
      {activeTab === 'stores' && storesNamedLoja.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 shadow-xs animate-in fade-in duration-300">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg text-amber-700">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-sm">
                {storesNamedLoja.length === 1 
                  ? 'Foi detectada 1 loja cadastrada com o Nome da Loja igual a "loja".'
                  : `Foram detectadas ${storesNamedLoja.length} lojas com o Nome da Loja igual a "loja".`}
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Clique no botão ao lado para excluir permanentemente todas as lojas com esse nome.
              </p>
            </div>
          </div>
          <button
            onClick={handleDeleteStoresNamedLoja}
            disabled={processingBulk}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition inline-flex items-center gap-2 shrink-0 shadow-xs"
          >
            <Trash2 className="w-4 h-4" />
            {processingBulk ? 'Excluindo...' : `Excluir todas com nome "loja" (${storesNamedLoja.length})`}
          </button>
        </div>
      )}

      {/* Stores List */}
      {activeTab === 'stores' && (
        <div className="space-y-3">
          {/* Search bar and bulk actions */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={storeSearch}
                onChange={(e) => setStoreSearch(e.target.value)}
                placeholder="Buscar loja por nome, código ou endereço..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>

            {selectedStoreIds.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600">
                  {selectedStoreIds.length} selecionada(s)
                </span>
                <button
                  onClick={handleDeleteSelected}
                  disabled={processingBulk}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition shadow-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Excluir Selecionadas
                </button>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="p-4 w-10 text-center">
                    <button 
                      onClick={toggleSelectAll} 
                      className="text-slate-400 hover:text-slate-700 transition"
                      title={selectedStoreIds.length === filteredStores.length ? 'Desmarcar todas' : 'Selecionar todas'}
                    >
                      {filteredStores.length > 0 && selectedStoreIds.length === filteredStores.length ? (
                        <CheckSquare className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="p-4 w-28">Código</th>
                  <th className="p-4">Nome da Loja</th>
                  <th className="p-4">Endereço / Unidade</th>
                  <th className="p-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStores.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400 text-xs">
                      {storeSearch 
                        ? 'Nenhuma loja encontrada para a busca informada.' 
                        : 'Nenhuma loja cadastrada. Clique em "Nova Loja" para adicionar destinos de romaneio.'}
                    </td>
                  </tr>
                ) : (
                  filteredStores.map((st) => {
                    const isNameLoja = (st.name || '').trim().toLowerCase() === 'loja';
                    const isNumbered = isNumberedExampleStore(st.name, st.code);
                    const isSelected = selectedStoreIds.includes(st.id);

                    return (
                      <tr 
                        key={st.id} 
                        className={`hover:bg-slate-50 transition ${
                          isNumbered ? 'bg-rose-50/40' : isNameLoja ? 'bg-amber-50/50' : ''
                        } ${isSelected ? 'bg-blue-50/40' : ''}`}
                      >
                        <td className="p-4 text-center">
                          <button
                            onClick={() => toggleSelectStore(st.id)}
                            className="text-slate-400 hover:text-blue-600 transition"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-blue-600" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                        <td className="p-4 font-mono font-bold text-blue-700">{st.code || '—'}</td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{st.name}</span>
                            {isNumbered && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                                Modelo "LOJA XX"
                              </span>
                            )}
                            {isNameLoja && !isNumbered && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                Nome "loja"
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-slate-500 text-xs flex items-center gap-1.5 mt-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{st.address || 'Endereço não informado'}</span>
                        </td>
                        <td className="p-4 text-right space-x-2">
                          <button
                            onClick={() => openEditStore(st)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 rounded transition"
                            title="Editar Loja"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={async () => {
                              if (confirm(`Excluir loja "${st.name}"?`)) {
                                try {
                                  await deleteStore(st.id, currentUser);
                                  showToast(`Loja "${st.name}" excluída.`, 'success');
                                } catch (e: any) {
                                  showToast(e.message || 'Erro ao excluir loja.', 'error');
                                }
                              }
                            }}
                            className="p-1.5 text-slate-500 hover:text-rose-600 rounded transition"
                            title="Excluir Loja"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Suppliers List */}
      {activeTab === 'suppliers' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="p-4">Nome do Fornecedor</th>
                <th className="p-4">CNPJ</th>
                <th className="p-4">Telefone de Contato</th>
                <th className="p-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {suppliers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-400 text-xs">
                    Nenhum fornecedor cadastrado. Clique em "Novo Fornecedor" para cadastrar empresas parceiras.
                  </td>
                </tr>
              ) : (
                suppliers.map((sup) => (
                  <tr key={sup.id} className="hover:bg-slate-50">
                    <td className="p-4 font-bold text-slate-900">{sup.name}</td>
                    <td className="p-4 font-mono text-slate-600 text-xs">{sup.cnpj || '—'}</td>
                    <td className="p-4 text-slate-500 text-xs flex items-center gap-1.5 mt-1">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      {sup.phone || '—'}
                    </td>
                    <td className="p-4 text-right space-x-2">
                      <button
                        onClick={() => openEditSupplier(sup)}
                        className="p-1.5 text-slate-500 hover:text-blue-600 rounded"
                        title="Editar Fornecedor"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={async () => {
                          if (confirm(`Excluir fornecedor "${sup.name}"?`)) {
                            try {
                              await deleteSupplier(sup.id);
                              showToast(`Fornecedor "${sup.name}" excluído.`, 'success');
                            } catch (e: any) {
                              showToast(e.message || 'Erro ao excluir fornecedor.', 'error');
                            }
                          }
                        }}
                        className="p-1.5 text-slate-500 hover:text-rose-600 rounded"
                        title="Excluir Fornecedor"
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
      )}

      {/* Store Modal */}
      {storeModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <StoreIcon className="w-4 h-4 text-blue-600" />
                {editingStore ? 'Editar Loja Destino' : 'Nova Loja Destino'}
              </h3>
              <button 
                onClick={() => setStoreModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStore} className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Código da Loja
                </label>
                <input
                  type="text"
                  value={storeCode}
                  onChange={(e) => setStoreCode(e.target.value)}
                  placeholder="Ex: LJ01, LJ02"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:bg-white uppercase font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome da Loja Destino *
                </label>
                <input
                  type="text"
                  required
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="Ex: LOJA 01 - CENTRO, FILIAL NORTE"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:bg-white uppercase"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Evite usar apenas a palavra genérica "loja". Dê preferência a "LOJA 01", "LOJA MATRIZ", etc.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Endereço / Unidade
                </label>
                <input
                  type="text"
                  value={storeAddress}
                  onChange={(e) => setStoreAddress(e.target.value)}
                  placeholder="Ex: Av. Brasil, 1200 - Centro"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStoreModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? 'Salvando...' : 'Salvar Loja'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Supplier Modal */}
      {supplierModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-600" />
                {editingSupplier ? 'Editar Fornecedor' : 'Novo Fornecedor'}
              </h3>
              <button 
                onClick={() => setSupplierModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Razão Social / Nome Fantasia *
                </label>
                <input
                  type="text"
                  required
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="Ex: Frigorífico Estrela Ltda"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  CNPJ
                </label>
                <input
                  type="text"
                  value={supplierCnpj}
                  onChange={(e) => setSupplierCnpj(e.target.value)}
                  placeholder="00.000.000/0000-00"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:bg-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Telefone / WhatsApp
                </label>
                <input
                  type="text"
                  value={supplierPhone}
                  onChange={(e) => setSupplierPhone(e.target.value)}
                  placeholder="(11) 98765-4321"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSupplierModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? 'Salvando...' : 'Salvar Fornecedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
