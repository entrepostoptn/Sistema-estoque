import React, { useState, useMemo } from 'react';
import { 
  ArrowUpFromLine, 
  Plus, 
  Trash2, 
  Printer, 
  FileText, 
  Store as StoreIcon, 
  Building2, 
  Calendar, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Eye, 
  Scale, 
  Box, 
  X, 
  XCircle, 
  Sparkles,
  Search,
  CheckSquare,
  Square,
  Package,
  DollarSign,
  Edit3,
  Save,
  RotateCcw,
  ChevronDown,
  ListFilter,
  Lock
} from 'lucide-react';
import { 
  Product, 
  Shipment, 
  ShipmentDestination, 
  ShipmentItem, 
  Store, 
  Supplier,
  ProductStockSummary, 
  SystemSettings 
} from '../types';
import { 
  registerShipmentExit, 
  cancelShipment, 
  deleteShipmentPermanently,
  updateShipmentWeights 
} from '../services/inventoryService';
import { ensureDefault34Stores } from '../services/storeService';
import { isAdminGeral } from '../services/authPermissions';
import { RomaneioPrintModal } from './RomaneioPrintModal';
import { useAuth } from '../firebase/authContext';

interface ShipmentsViewProps {
  products: Product[];
  shipments: Shipment[];
  stores: Store[];
  suppliers?: Supplier[];
  stockMap: Map<string, ProductStockSummary>;
  settings: SystemSettings;
  onOpenNewStore: () => void;
  onOpenNewProduct: () => void;
}

export const ShipmentsView: React.FC<ShipmentsViewProps> = ({
  products,
  shipments,
  stores,
  suppliers = [],
  stockMap,
  settings,
  onOpenNewStore,
  onOpenNewProduct
}) => {
  const { currentUser } = useAuth();

  // Create Shipment Form State
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  
  // Destination Stores inside this Romaneio
  const [destinations, setDestinations] = useState<ShipmentDestination[]>([
    {
      id: 'dest_1',
      storeId: '',
      storeName: '',
      items: [],
      subtotalBoxes: 0,
      subtotalWeightKg: 0
    }
  ]);

  // Selected Store ID to add an item to
  const [activeDestinationIndex, setActiveDestinationIndex] = useState<number>(0);

  // Currency Formatter Helper
  const formatBRL = (val?: number | null) => {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Main Tab Navigation: Emitir Novo Romaneio vs Romaneios Finalizados
  const [activeMainTab, setActiveMainTab] = useState<'create' | 'finalized'>('create');
  const [viewingShipment, setViewingShipment] = useState<Shipment | null>(null);

  // New Item Input State
  const [selectedProductId, setSelectedProductId] = useState('');
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const [productSelectMode, setProductSelectMode] = useState<'dropdown' | 'search'>('dropdown');
  const [itemSupplierName, setItemSupplierName] = useState('');
  const [itemMode, setItemMode] = useState<'by_unit' | 'by_weight'>('by_unit');
  const [quantityInput, setQuantityInput] = useState<number | string>(10);
  const [weightInput, setWeightInput] = useState<number | string>(200);

  // Viewing Shipment Weight Editing State
  const [isEditingWeights, setIsEditingWeights] = useState(false);
  const [tempDestinations, setTempDestinations] = useState<ShipmentDestination[]>([]);
  const [isSavingWeights, setIsSavingWeights] = useState(false);
  const [weightEditReason, setWeightEditReason] = useState('');
  const [weightEditSuccess, setWeightEditSuccess] = useState<string | null>(null);
  const [weightEditError, setWeightEditError] = useState<string | null>(null);

  // Products map for quick supplier lookup fallback
  const productsMap = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of products) {
      if (p.id) map.set(p.id, p);
      if (p.code) map.set(p.code, p);
    }
    return map;
  }, [products]);

  // Multi-Store Selection Modal State
  const [isStoreSelectorOpen, setIsStoreSelectorOpen] = useState(false);
  const [storeFilterText, setStoreFilterText] = useState('');
  const [selectedStoresSet, setSelectedStoresSet] = useState<Set<string>>(new Set());
  const [isEnsuringStores, setIsEnsuringStores] = useState(false);

  // Status & Modal States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [printedShipment, setPrintedShipment] = useState<Shipment | null>(null);
  const [autoPrintRomaneio, setAutoPrintRomaneio] = useState(false);
  const [finalizedShipment, setFinalizedShipment] = useState<Shipment | null>(null);
  const [lastSavedShipment, setLastSavedShipment] = useState<Shipment | null>(null);
  const [cancellingShipment, setCancellingShipment] = useState<Shipment | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [deletingShipment, setDeletingShipment] = useState<Shipment | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Helper to open romaneio print modal and automatically launch Google Chrome print preview (Ctrl+P)
  const handleOpenPrint = (ship: Shipment, triggerAutoPrint: boolean = true) => {
    setPrintedShipment(ship);
    setAutoPrintRomaneio(triggerAutoPrint);
  };

  // Selected Product object helper
  const selectedProductObj = useMemo(() => {
    return products.find(p => p.id === selectedProductId) || null;
  }, [products, selectedProductId]);

  // Live item total preview calculation:
  // Regra do cliente: O preço eu não preencho no romaneio o valor é puxado de produtos o que for informado lá é usado como base de cálculo
  // Valor a pagar = Preço do produto cadastrado (R$/kg) × kg informado no romaneio
  const previewItemPrice = useMemo(() => {
    const price = selectedProductObj && typeof selectedProductObj.salePrice === 'number' && selectedProductObj.salePrice > 0
      ? selectedProductObj.salePrice
      : 0;
    if (price <= 0) return 0;
    const wt = Number(weightInput) || 0;
    return Math.round(wt * price * 100) / 100;
  }, [selectedProductObj, weightInput]);

  // Filtered active products based on search query
  const filteredProducts = useMemo(() => {
    const q = productSearchQuery.trim().toLowerCase();
    const active = products.filter(p => p.active);
    if (!q) return active;
    return active.filter(p => {
      const code = (p.code || '').toLowerCase();
      const name = (p.name || '').toLowerCase();
      const supplier = (p.supplierName || '').toLowerCase();
      return code.includes(q) || name.includes(q) || supplier.includes(q);
    });
  }, [products, productSearchQuery]);

  // Synchronize tempDestinations whenever viewingShipment changes
  React.useEffect(() => {
    if (viewingShipment) {
      const cloned = JSON.parse(JSON.stringify(viewingShipment.destinations || []));
      // Pre-fill cost prices from catalog if item doesn't have it yet
      const enriched = cloned.map((d: any) => {
        let subCost = 0;
        const items = (d.items || []).map((it: any) => {
          let uCost = typeof it.unitCostPrice === 'number' && it.unitCostPrice > 0 ? it.unitCostPrice : undefined;
          let cType = it.costPriceType || undefined;
          let tCost = typeof it.totalCostPrice === 'number' && it.totalCostPrice > 0 ? it.totalCostPrice : undefined;

          if (uCost === undefined) {
            const prod = products.find(p => p.id === it.productId);
            if (prod && typeof prod.costPrice === 'number' && prod.costPrice > 0) {
              uCost = prod.costPrice;
              cType = prod.costPriceType || 'POR_UNIDADE';
              const w = Number(it.weightKg) || 0;
              const b = Number(it.quantityBoxes) || 0;
              tCost = cType === 'POR_KG' ? Math.round(w * uCost * 100) / 100 : Math.round(b * uCost * 100) / 100;
            }
          } else if (tCost === undefined && uCost > 0) {
            const w = Number(it.weightKg) || 0;
            const b = Number(it.quantityBoxes) || 0;
            tCost = cType === 'POR_KG' ? Math.round(w * uCost * 100) / 100 : Math.round(b * uCost * 100) / 100;
          }

          if (tCost) subCost += tCost;

          return {
            ...it,
            priceType: it.priceType || 'POR_KG',
            unitCostPrice: uCost,
            costPriceType: cType || 'POR_UNIDADE',
            totalCostPrice: tCost
          };
        });
        return {
          ...d,
          items,
          subtotalCostPrice: subCost > 0 ? Math.round(subCost * 100) / 100 : undefined
        };
      });

      setTempDestinations(enriched);
      setIsEditingWeights(false);
      setWeightEditReason('');
      setWeightEditSuccess(null);
      setWeightEditError(null);
    }
  }, [viewingShipment, products]);

  // Handler to update any item property (weightKg, unitPrice, priceType, totalPrice, unitCostPrice, costPriceType, totalCostPrice)
  const handleUpdateItemValue = (
    destId: string,
    itemId: string,
    field: 'weightKg' | 'unitPrice' | 'priceType' | 'totalPrice' | 'unitCostPrice' | 'costPriceType' | 'totalCostPrice',
    value: any
  ) => {
    setTempDestinations(prev => {
      return prev.map(dest => {
        if ((dest.id || '') !== destId) return dest;
        let subWeight = 0;
        let subBoxes = 0;
        let subPrice = 0;
        let subCost = 0;

        const updatedItems = dest.items.map(it => {
          const b = Number(it.quantityBoxes) || 0;
          let w = Number(it.weightKg) || 0;
          let uPrice = typeof it.unitPrice === 'number' ? it.unitPrice : 0;
          let pType = it.priceType || 'POR_KG';
          let tPrice = typeof it.totalPrice === 'number' ? it.totalPrice : 0;

          let uCost = typeof it.unitCostPrice === 'number' ? it.unitCostPrice : 0;
          let cType = it.costPriceType || 'POR_UNIDADE';
          let tCost = typeof it.totalCostPrice === 'number' ? it.totalCostPrice : 0;

          if (it.id === itemId) {
            if (field === 'weightKg') {
              w = Math.max(0, parseFloat(value) || 0);
              // Recalculate sale price if per kg
              if (pType === 'POR_KG' && uPrice > 0) {
                tPrice = Math.round(w * uPrice * 100) / 100;
              }
              // Recalculate cost price if per kg
              if (cType === 'POR_KG' && uCost > 0) {
                tCost = Math.round(w * uCost * 100) / 100;
              }
            } else if (field === 'unitPrice') {
              uPrice = Math.max(0, parseFloat(value) || 0);
              if (uPrice > 0) {
                tPrice = pType === 'POR_KG' ? Math.round(w * uPrice * 100) / 100 : Math.round(b * uPrice * 100) / 100;
              } else {
                tPrice = 0;
              }
            } else if (field === 'priceType') {
              pType = value as 'POR_KG' | 'POR_UNIDADE';
              if (uPrice > 0) {
                tPrice = pType === 'POR_KG' ? Math.round(w * uPrice * 100) / 100 : Math.round(b * uPrice * 100) / 100;
              }
            } else if (field === 'totalPrice') {
              tPrice = Math.max(0, parseFloat(value) || 0);
              if (tPrice > 0) {
                if (pType === 'POR_KG') {
                  uPrice = w > 0 ? Math.round((tPrice / w) * 100) / 100 : 0;
                } else {
                  uPrice = b > 0 ? Math.round((tPrice / b) * 100) / 100 : 0;
                }
              } else {
                uPrice = 0;
              }
            } else if (field === 'unitCostPrice') {
              uCost = Math.max(0, parseFloat(value) || 0);
              if (uCost > 0) {
                tCost = cType === 'POR_KG' ? Math.round(w * uCost * 100) / 100 : Math.round(b * uCost * 100) / 100;
              } else {
                tCost = 0;
              }
            } else if (field === 'costPriceType') {
              cType = value as 'POR_KG' | 'POR_UNIDADE';
              if (uCost > 0) {
                tCost = cType === 'POR_KG' ? Math.round(w * uCost * 100) / 100 : Math.round(b * uCost * 100) / 100;
              }
            } else if (field === 'totalCostPrice') {
              tCost = Math.max(0, parseFloat(value) || 0);
              if (tCost > 0) {
                if (cType === 'POR_KG') {
                  uCost = w > 0 ? Math.round((tCost / w) * 100) / 100 : 0;
                } else {
                  uCost = b > 0 ? Math.round((tCost / b) * 100) / 100 : 0;
                }
              } else {
                uCost = 0;
              }
            }

            subWeight += w;
            subBoxes += b;
            subPrice += tPrice;
            subCost += tCost;

            return {
              ...it,
              weightKg: w,
              unitPrice: uPrice > 0 ? uPrice : undefined,
              priceType: pType,
              totalPrice: tPrice > 0 ? tPrice : undefined,
              unitCostPrice: uCost > 0 ? uCost : undefined,
              costPriceType: cType,
              totalCostPrice: tCost > 0 ? tCost : undefined
            };
          } else {
            subWeight += w;
            subBoxes += b;
            subPrice += tPrice;
            subCost += tCost;
            return it;
          }
        });

        return {
          ...dest,
          items: updatedItems,
          subtotalBoxes: Math.round(subBoxes * 100) / 100,
          subtotalWeightKg: Math.round(subWeight * 100) / 100,
          subtotalPrice: subPrice > 0 ? Math.round(subPrice * 100) / 100 : undefined,
          subtotalCostPrice: subCost > 0 ? Math.round(subCost * 100) / 100 : undefined
        };
      });
    });
  };

  // Handler to update weight of an item inside viewingShipment (backwards compatibility)
  const handleItemWeightChange = (destId: string, itemId: string, newWeightStr: string) => {
    handleUpdateItemValue(destId, itemId, 'weightKg', newWeightStr);
  };

  // Handler to save modified weights, selling prices and cost prices
  const handleSaveWeights = async () => {
    if (!viewingShipment || !currentUser) return;
    setIsSavingWeights(true);
    setWeightEditError(null);
    setWeightEditSuccess(null);
    try {
      const updated = await updateShipmentWeights({
        shipmentId: viewingShipment.id,
        updatedDestinations: tempDestinations,
        user: currentUser,
        reason: weightEditReason.trim() || 'Ajuste de peso, valor de venda e custo do romaneio'
      });
      setViewingShipment(updated);
      setWeightEditSuccess(`Pesos, valores de venda e custos do Romaneio Nº ${updated.romaneioNumber} atualizados com sucesso e estoque recalculado!`);
      setIsEditingWeights(false);
      setTimeout(() => setWeightEditSuccess(null), 5000);
    } catch (err: any) {
      console.error('Erro ao atualizar pesos e valores do romaneio:', err);
      setWeightEditError(err.message || 'Erro ao salvar alterações.');
    } finally {
      setIsSavingWeights(false);
    }
  };

  // Auto-calculate weight/quantity when product changes
  const handleProductSelect = (prodId: string) => {
    setSelectedProductId(prodId);
    const prod = products.find(p => p.id === prodId);
    if (prod) {
      setProductSearchQuery(`${prod.code} - ${prod.name}`);
      setIsProductDropdownOpen(false);
      setItemSupplierName(prod.supplierName || '');
      const defWeight = prod.defaultWeightKg || 20;
      const qty = Number(quantityInput) > 0 ? Number(quantityInput) : 10;
      setQuantityInput(qty);
      if (defWeight > 0) {
        setWeightInput(Math.round(qty * defWeight * 100) / 100);
      }
    } else {
      setProductSearchQuery('');
      setItemSupplierName('');
      setIsProductDropdownOpen(false);
    }
  };

  const handleClearProductSelection = () => {
    setSelectedProductId('');
    setProductSearchQuery('');
    setItemSupplierName('');
    setIsProductDropdownOpen(false);
  };

  // When quantity in boxes changes: automatically calculate converted weight if conversion exists
  const handleQuantityChange = (val: string) => {
    setQuantityInput(val);
    const qty = Number(val);
    const prod = products.find(p => p.id === selectedProductId);
    if (prod && prod.defaultWeightKg > 0 && !isNaN(qty) && qty > 0) {
      setWeightInput(Math.round(qty * prod.defaultWeightKg * 100) / 100);
    }
  };

  // When weight in kg changes: allows free manual typing without overwriting quantity
  const handleWeightChange = (val: string) => {
    setWeightInput(val);
  };

  // Helper to suggest standard weight
  const handleSuggestStandardWeight = () => {
    const qty = Number(quantityInput) || 0;
    const prod = products.find(p => p.id === selectedProductId);
    if (prod && prod.defaultWeightKg > 0 && qty > 0) {
      setWeightInput(Math.round(qty * prod.defaultWeightKg * 100) / 100);
    }
  };

  // Helper to suggest boxes from weight
  const handleSuggestBoxesFromWeight = () => {
    const wt = Number(weightInput) || 0;
    const prod = products.find(p => p.id === selectedProductId);
    if (prod && prod.defaultWeightKg > 0 && wt > 0) {
      setQuantityInput(Math.round((wt / prod.defaultWeightKg) * 100) / 100);
    }
  };

  // Inline manipulation of quantity or weight directly in the store items table
  const handleUpdateStoreItem = (
    destIndex: number, 
    itemId: string, 
    field: 'quantityBoxes' | 'weightKg', 
    val: number
  ) => {
    const updated = [...destinations];
    const targetDest = { ...updated[destIndex] };
    targetDest.items = targetDest.items.map(it => {
      if (it.id === itemId) {
        const updatedItem = {
          ...it,
          [field]: Math.max(0, val)
        };
        // Auto-recalculate weight if boxes changed and product has conversion
        if (field === 'quantityBoxes' && it.defaultWeightKg && it.defaultWeightKg > 0) {
          updatedItem.weightKg = Math.round(val * it.defaultWeightKg * 100) / 100;
        }
        // Recalculate item total price
        // Regra do cliente: O valor a pagar é o preço que está informado no produto vezes a quantidade de kg informado no romaneio.
        const uP = Number(updatedItem.unitPrice) || 0;
        if (uP > 0) {
          updatedItem.totalPrice = Math.round((Number(updatedItem.weightKg) || 0) * uP * 100) / 100;
        } else {
          updatedItem.totalPrice = 0;
        }
        return updatedItem;
      }
      return it;
    });
    targetDest.subtotalBoxes = Math.round(targetDest.items.reduce((sum, it) => sum + (Number(it.quantityBoxes) || 0), 0) * 100) / 100;
    targetDest.subtotalWeightKg = Math.round(targetDest.items.reduce((sum, it) => sum + (Number(it.weightKg) || 0), 0) * 100) / 100;
    targetDest.subtotalPrice = Math.round(targetDest.items.reduce((sum, it) => sum + (Number(it.totalPrice) || 0), 0) * 100) / 100;
    updated[destIndex] = targetDest;
    setDestinations(updated);
  };

  // Multi-Store Selection Handlers
  const handleOpenStoreSelector = () => {
    const activeNames = new Set(destinations.map(d => d.storeName.toUpperCase()));
    setSelectedStoresSet(activeNames);
    setStoreFilterText('');
    setIsStoreSelectorOpen(true);
  };

  const handleToggleStoreInModal = (storeName: string) => {
    const key = storeName.toUpperCase();
    const nextSet = new Set(selectedStoresSet);
    if (nextSet.has(key)) {
      nextSet.delete(key);
    } else {
      nextSet.add(key);
    }
    setSelectedStoresSet(nextSet);
  };

  // Preset: User Example (Loja 01, Loja 03, Loja 10, Loja 25)
  const handleSelectExampleStores = () => {
    const targetKeys = ['LOJA 01', 'LOJA 1', 'LOJA 03', 'LOJA 3', 'LOJA 10', 'LOJA 25'];
    const nextSet = new Set<string>();

    for (const st of stores) {
      const upper = st.name.toUpperCase();
      if (targetKeys.some(tk => upper === tk || upper.startsWith(tk + ' ') || upper.endsWith(' ' + tk))) {
        nextSet.add(upper);
      }
    }

    // Fallbacks if not found by exact pattern
    if (nextSet.size === 0) {
      targetKeys.forEach(k => nextSet.add(k));
    }

    setSelectedStoresSet(nextSet);
  };

  const handleSelectAllStores = () => {
    const all = new Set(stores.map(s => s.name.toUpperCase()));
    setSelectedStoresSet(all);
  };

  const handleDeselectAllStores = () => {
    setSelectedStoresSet(new Set());
  };

  const handleEnsureStores = async () => {
    setIsEnsuringStores(true);
    try {
      await ensureDefault34Stores();
      setSuccessMessage('34 lojas cadastradas garantidas com sucesso!');
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Erro ao carregar lojas.');
    } finally {
      setIsEnsuringStores(false);
    }
  };

  const handleConfirmStoreSelection = () => {
    if (selectedStoresSet.size === 0) {
      alert('Selecione pelo menos uma loja para a distribuição.');
      return;
    }

    const currentDestMap = new Map(destinations.map(d => [d.storeName.toUpperCase(), d]));
    const newDestinations: ShipmentDestination[] = [];

    // Order by stores list if available
    const orderedStoreNames: string[] = [];
    for (const st of stores) {
      if (selectedStoresSet.has(st.name.toUpperCase())) {
        orderedStoreNames.push(st.name);
      }
    }
    // Any remaining selected store not in stores list
    for (const sName of selectedStoresSet) {
      if (!orderedStoreNames.some(n => n.toUpperCase() === sName)) {
        orderedStoreNames.push(sName);
      }
    }

    for (const sName of orderedStoreNames) {
      const existing = currentDestMap.get(sName.toUpperCase());
      if (existing) {
        newDestinations.push(existing);
      } else {
        const matchingStore = stores.find(s => s.name.toUpperCase() === sName.toUpperCase());
        newDestinations.push({
          id: `dest_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          storeId: matchingStore?.id || '',
          storeName: matchingStore?.name || sName,
          items: [],
          subtotalBoxes: 0,
          subtotalWeightKg: 0
        });
      }
    }

    setDestinations(newDestinations);
    setActiveDestinationIndex(0);
    setIsStoreSelectorOpen(false);
  };

  // Requirement 1: Ao clicar em "Adicionar nova loja ao romaneio", buscar automaticamente todas as lojas cadastradas no módulo "Lojas"
  const handleAddDestinationStore = () => {
    handleOpenStoreSelector();
  };

  // Requirement 5 & 6: Exclusão Definitiva de Romaneio exclusiva do ADMIN GERAL
  const handleConfirmDelete = async () => {
    if (!deletingShipment || !currentUser) return;
    setIsDeleting(true);
    try {
      await deleteShipmentPermanently(deletingShipment.id, currentUser, deleteReason);
      setSuccessMessage(`Romaneio Nº ${deletingShipment.romaneioNumber} excluído definitivamente pelo ADMIN GERAL.`);
      setDeletingShipment(null);
      setDeleteReason('');
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Erro ao excluir romaneio.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRemoveDestinationStore = (index: number) => {
    if (destinations.length <= 1) {
      alert('O romaneio deve ter ao menos um destino.');
      return;
    }
    const updated = destinations.filter((_, idx) => idx !== index);
    setDestinations(updated);
    setActiveDestinationIndex(Math.max(0, index - 1));
  };

  const handleUpdateStoreName = (index: number, storeName: string, storeId?: string) => {
    const updated = [...destinations];
    updated[index].storeName = storeName;
    if (storeId) updated[index].storeId = storeId;
    setDestinations(updated);
  };

  // Add item to active destination store
  const handleAddItemToStore = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!selectedProductId) {
      setErrorMessage('Selecione um produto.');
      return;
    }

    const prod = products.find(p => p.id === selectedProductId);
    if (!prod) return;

    const qty = Number(quantityInput);
    const weight = Number(weightInput);

    if (qty <= 0 && weight <= 0) {
      setErrorMessage('Informe uma quantidade ou peso maior que zero.');
      return;
    }

    // Check current stock availability
    const stock = stockMap.get(prod.id);
    const availableBoxes = stock ? stock.currentBoxes : 0;
    const availableWeight = stock ? stock.currentWeightKg : 0;

    // Calculate total already in form for this product
    let totalInFormBoxes = qty;
    let totalInFormWeight = weight;
    for (const d of destinations) {
      for (const it of d.items) {
        if (it.productId === prod.id) {
          totalInFormBoxes += it.quantityBoxes;
          totalInFormWeight += it.weightKg;
        }
      }
    }

    if (!settings.allowNegativeStock) {
      if (totalInFormBoxes > availableBoxes) {
        setErrorMessage(
          `Estoque insuficiente para "${prod.name}"! Disponível: ${availableBoxes} caixas (solicitado no total do romaneio: ${totalInFormBoxes} caixas).`
        );
        return;
      }
      if (totalInFormWeight > availableWeight) {
        setErrorMessage(
          `Estoque insuficiente em peso para "${prod.name}"! Disponível: ${availableWeight.toFixed(2)} kg (solicitado: ${totalInFormWeight.toFixed(2)} kg).`
        );
        return;
      }
    }

    // Regra do cliente: O preço eu não preencho no romaneio o valor é puxado de produtos o que for informado lá é usado como base de cálculo
    const uPrice = typeof prod.salePrice === 'number' && prod.salePrice > 0 ? prod.salePrice : 0;
    // Valor a pagar = Preço do produto cadastrado (R$/kg) × kg informado no romaneio
    const itemTotal = uPrice > 0 ? Math.round(weight * uPrice * 100) / 100 : 0;

    // Custo de compra registrado (SOMENTE CONTROLE INTERNO)
    const uCost = typeof prod.costPrice === 'number' && prod.costPrice > 0 ? prod.costPrice : undefined;
    const cType = prod.costPriceType || 'POR_UNIDADE';
    let itemCostTotal: number | undefined = undefined;
    if (uCost && uCost > 0) {
      itemCostTotal = cType === 'POR_KG' ? Math.round(weight * uCost * 100) / 100 : Math.round(qty * uCost * 100) / 100;
    }

    const newItem: ShipmentItem = {
      id: Math.random().toString(36).substring(2, 9),
      productId: prod.id,
      productCode: prod.code,
      productName: prod.name,
      supplierName: itemSupplierName.trim() || prod.supplierName || '',
      supplierId: prod.supplierId || '',
      unit: prod.unit,
      quantityBoxes: qty,
      weightKg: weight,
      mode: itemMode,
      defaultWeightKg: prod.defaultWeightKg || 0,
      conversionText: prod.defaultWeightKg && prod.defaultWeightKg > 0 ? `1 ${prod.unit.toLowerCase()} = ${prod.defaultWeightKg} kg` : '',
      unitPrice: uPrice,
      priceType: 'POR_KG',
      totalPrice: itemTotal,
      unitCostPrice: uCost,
      costPriceType: cType,
      totalCostPrice: itemCostTotal
    };

    const updatedDestinations = [...destinations];
    const targetDest = updatedDestinations[activeDestinationIndex];
    targetDest.items.push(newItem);
    targetDest.subtotalBoxes = Math.round((targetDest.subtotalBoxes + qty) * 100) / 100;
    targetDest.subtotalWeightKg = Math.round((targetDest.subtotalWeightKg + weight) * 100) / 100;
    targetDest.subtotalPrice = Math.round(targetDest.items.reduce((sum, it) => sum + (it.totalPrice || 0), 0) * 100) / 100;
    targetDest.subtotalCostPrice = Math.round(targetDest.items.reduce((sum, it) => sum + (it.totalCostPrice || 0), 0) * 100) / 100;

    setDestinations(updatedDestinations);
    setSelectedProductId('');
    setProductSearchQuery('');
    setIsProductDropdownOpen(false);
    setItemSupplierName('');
    setQuantityInput(10);
    setWeightInput(200);
  };

  // Remove item from a specific destination
  const handleRemoveItemFromStore = (destIndex: number, itemId: string) => {
    const updated = [...destinations];
    const target = updated[destIndex];
    const removedItem = target.items.find(i => i.id === itemId);
    if (removedItem) {
      target.items = target.items.filter(i => i.id !== itemId);
      target.subtotalBoxes = Math.round(target.items.reduce((s, it) => s + (it.quantityBoxes || 0), 0) * 100) / 100;
      target.subtotalWeightKg = Math.round(target.items.reduce((s, it) => s + (it.weightKg || 0), 0) * 100) / 100;
      target.subtotalPrice = Math.round(target.items.reduce((s, it) => s + (it.totalPrice || 0), 0) * 100) / 100;
      setDestinations(updated);
    }
  };

  // Grand totals
  const grandTotalBoxes = destinations.reduce((sum, d) => sum + d.subtotalBoxes, 0);
  const grandTotalWeightKg = destinations.reduce((sum, d) => sum + d.subtotalWeightKg, 0);
  const grandTotalPrice = destinations.reduce((sum, d) => {
    const dSub = typeof d.subtotalPrice === 'number' && !isNaN(d.subtotalPrice)
      ? d.subtotalPrice
      : d.items.reduce((s, it) => s + (it.totalPrice || 0), 0);
    return sum + dSub;
  }, 0);
  const grandTotalItems = destinations.reduce((sum, d) => sum + d.items.length, 0);

  // Summary of Central CD Stock deductions across all stores in this distribution
  const centralCdDeductions = useMemo(() => {
    const map = new Map<string, {
      productId: string;
      productCode: string;
      productName: string;
      unit: string;
      stockBoxes: number;
      stockWeightKg: number;
      deductedBoxes: number;
      deductedWeightKg: number;
      byStore: Array<{ storeName: string; boxes: number; weightKg: number }>;
    }>();

    for (const d of destinations) {
      for (const it of d.items) {
        if (!map.has(it.productId)) {
          const st = stockMap.get(it.productId);
          map.set(it.productId, {
            productId: it.productId,
            productCode: it.productCode,
            productName: it.productName,
            unit: it.unit,
            stockBoxes: st ? st.currentBoxes : 0,
            stockWeightKg: st ? st.currentWeightKg : 0,
            deductedBoxes: 0,
            deductedWeightKg: 0,
            byStore: []
          });
        }
        const entry = map.get(it.productId)!;
        entry.deductedBoxes += it.quantityBoxes;
        entry.deductedWeightKg += it.weightKg;
        entry.byStore.push({
          storeName: d.storeName,
          boxes: it.quantityBoxes,
          weightKg: it.weightKg
        });
      }
    }

    return Array.from(map.values());
  }, [destinations, stockMap]);

  // Save Romaneio
  const handleSaveRomaneio = async () => {
    setErrorMessage(null);

    if (grandTotalItems === 0) {
      setErrorMessage('Adicione pelo menos um produto a alguma das lojas antes de salvar o romaneio.');
      return;
    }

    // Verify each store has items
    for (const d of destinations) {
      if (d.items.length === 0) {
        setErrorMessage(`A "${d.storeName}" não possui nenhum produto adicionado. Remova a loja vazia ou adicione produtos a ela.`);
        return;
      }
    }

    if (!currentUser) {
      setErrorMessage('Usuário não autenticado.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await registerShipmentExit({
        date,
        notes,
        destinations,
        user: currentUser,
        currentStockMap: stockMap,
        allowNegativeStock: settings.allowNegativeStock
      });

      const savedShipmentObj: Shipment = {
        id: result.shipmentId,
        romaneioNumber: result.romaneioNumber,
        date,
        notes,
        userId: currentUser.id,
        userName: currentUser.name,
        destinations,
        totalBoxes: grandTotalBoxes,
        totalWeightKg: grandTotalWeightKg,
        totalPrice: result.totalPrice || grandTotalPrice,
        createdAt: new Date(),
        status: 'CONFIRMED'
      };

      setSuccessMessage(`ROMANEIO Nº ${result.romaneioNumber} gravado e finalizado com sucesso! Estoque atualizado.`);
      
      // Abre a tela de confirmação com o botão de imprimir romaneio em destaque
      setFinalizedShipment(savedShipmentObj);
      setLastSavedShipment(savedShipmentObj);

      // Reset form
      setNotes('');
      setDate(new Date().toISOString().split('T')[0]);
      setDestinations([
        {
          id: 'dest_1',
          storeId: '',
          storeName: stores[0]?.name || '',
          items: [],
          subtotalBoxes: 0,
          subtotalWeightKg: 0
        }
      ]);
      setActiveDestinationIndex(0);
      setTimeout(() => setSuccessMessage(null), 6000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao registrar saída de romaneio.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancellingShipment || !currentUser) return;
    if (!cancelReason.trim()) {
      alert('Informe o motivo do cancelamento.');
      return;
    }

    try {
      await cancelShipment(cancellingShipment.id, currentUser, cancelReason);
      setCancellingShipment(null);
      setCancelReason('');
      setSuccessMessage(`Romaneio Nº ${cancellingShipment.romaneioNumber} cancelado e estoque estornado.`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Erro ao cancelar romaneio.');
    }
  };

  const activeProducts = products.filter(p => p.active);
  const currentActiveDest = destinations[activeDestinationIndex] || destinations[0];

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ArrowUpFromLine className="w-6 h-6 text-blue-600" />
            Saída de Mercadorias / Romaneio
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Geração de romaneios com numeração automática exclusiva, suporte a múltiplas lojas no mesmo carregamento e impressão em papel.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[11px] text-slate-400 font-medium block">Usuário Responsável:</span>
            <span className="text-xs font-bold text-slate-800">{currentUser?.name}</span>
          </div>
        </div>
      </div>

      {/* Persistent Banner when a shipment was finalized with direct Print Button */}
      {lastSavedShipment && (
        <div className="p-4 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border-2 border-emerald-400 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Printer className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-extrabold text-emerald-950 text-sm">
                  Romaneio Nº {lastSavedShipment.romaneioNumber} gravado e finalizado!
                </h4>
                <span className="bg-emerald-200 text-emerald-900 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                  Pronto para Impressão
                </span>
              </div>
              <p className="text-xs text-emerald-800 mt-0.5">
                {lastSavedShipment.destinations.length} loja(s) • {lastSavedShipment.totalBoxes} cx • {lastSavedShipment.totalWeightKg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg • Total Geral a Pagar: <strong className="text-emerald-950 font-mono text-sm">{formatBRL(lastSavedShipment.totalPrice)}</strong>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setPrintedShipment(lastSavedShipment)}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-lg text-xs flex items-center gap-2 shadow-xs transition cursor-pointer hover:shadow active:scale-98"
            >
              <Printer className="w-4 h-4" />
              IMPRIMIR ROMANEIO Nº {lastSavedShipment.romaneioNumber}
            </button>
            <button
              type="button"
              onClick={() => setLastSavedShipment(null)}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-lg text-xs cursor-pointer hover:bg-emerald-100/50"
              title="Dispensar aviso"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {successMessage && !lastSavedShipment && (
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

      {/* Top Navigation Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 p-1.5 shadow-2xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveMainTab('create')}
            className={`px-4 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeMainTab === 'create'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <ArrowUpFromLine className="w-4 h-4" />
            Emitir Novo Romaneio
          </button>

          <button
            type="button"
            onClick={() => setActiveMainTab('finalized')}
            className={`px-4 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeMainTab === 'finalized'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Clock className="w-4 h-4" />
            Romaneios Finalizados ({shipments.length})
          </button>
        </div>

        {activeMainTab === 'create' && shipments.length > 0 && (
          <button
            type="button"
            onClick={() => setActiveMainTab('finalized')}
            className="text-xs font-semibold text-blue-600 hover:underline px-3 py-1 flex items-center gap-1 cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" />
            Ver {shipments.length} romaneios finalizados →
          </button>
        )}
      </div>

      {/* Main Creation Form: shown when activeMainTab is 'create' */}
      {activeMainTab === 'create' && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Romaneio Details + Stores + Item Inserter */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Romaneio Header Inputs */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                1. Identificação do Romaneio
              </h2>
              <span className="text-xs font-mono bg-blue-50 text-blue-700 px-2.5 py-1 rounded font-bold">
                Numeração Automática Sequencial
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Data de Saída <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Observações Gerais do Carregamento
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Motorista Carlos - Caminhão Placa ABC-1234"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Requirement 2: ROMANEIO PARA VÁRIAS LOJAS */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <StoreIcon className="w-4 h-4 text-emerald-600" />
                  2. Lojas de Destino da Distribuição ({destinations.length} selecionadas)
                </h2>
                <p className="text-xs text-slate-500">
                  Todas as saídas serão deduzidas do Estoque Central do CD e registradas separadamente por loja.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleOpenStoreSelector}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition shadow-xs cursor-pointer"
                >
                  <CheckSquare className="w-4 h-4" />
                  Adicionar nova loja ao romaneio ({destinations.length})
                </button>
                <button
                  type="button"
                  onClick={handleAddDestinationStore}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  + Loja Manual
                </button>
              </div>
            </div>

            {/* Quick Helper Banner */}
            <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  <strong>Distribuição Central:</strong> Selecione as lojas atendidas (ex: Loja 1, Loja 6, Loja 10, Loja 14) e monte o romaneio de cada uma abaixo.
                </span>
              </div>
              <button
                type="button"
                onClick={handleSelectExampleStores}
                className="text-[11px] font-bold text-blue-700 hover:underline bg-white px-2.5 py-1 rounded border border-blue-300 self-start sm:self-auto shrink-0 shadow-2xs"
              >
                ⚡ Usar Exemplo: Loja 1, 6, 10 e 14
              </button>
            </div>

            {/* Tabs for Destination Stores */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
              {destinations.map((dest, idx) => {
                const isActive = activeDestinationIndex === idx;
                return (
                  <div
                    key={dest.id || idx}
                    className={`flex items-center gap-2 px-3.5 py-2.5 rounded-lg border text-xs font-bold cursor-pointer transition whitespace-nowrap ${
                      isActive 
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs ring-2 ring-blue-300' 
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                    onClick={() => setActiveDestinationIndex(idx)}
                  >
                    <span>{dest.storeName}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                      isActive ? 'bg-blue-800 text-white font-mono' : 'bg-slate-200 text-slate-700 font-mono'
                    }`}>
                      {dest.items.length} itens ({dest.subtotalBoxes} cx)
                    </span>
                    {destinations.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveDestinationStore(idx);
                        }}
                        className={`p-0.5 rounded hover:bg-rose-500 hover:text-white transition ${
                          isActive ? 'text-blue-200' : 'text-slate-400'
                        }`}
                        title="Remover esta loja do romaneio"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Active Store Header & Quick Edit Name */}
            <div className="bg-slate-100/90 p-3.5 rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 flex-1">
                <span className="font-bold text-slate-800 whitespace-nowrap">Montando Romaneio de:</span>
                <input
                  type="text"
                  list="storesList"
                  value={currentActiveDest.storeName}
                  onChange={(e) => handleUpdateStoreName(activeDestinationIndex, e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded font-bold text-slate-900 bg-white flex-1 max-w-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Nome da Loja (ex: LOJA 01)"
                />
                <datalist id="storesList">
                  {stores.map(st => (
                    <option key={st.id} value={st.name} />
                  ))}
                </datalist>
                <span className="text-[11px] text-slate-500">
                  (Loja {activeDestinationIndex + 1} de {destinations.length})
                </span>
              </div>

              <div className="text-slate-600 font-medium flex flex-wrap items-center gap-2">
                <span>Subtotal Loja Atual: <strong className="text-blue-700 font-mono">{currentActiveDest.subtotalBoxes} cx</strong> • <strong className="text-emerald-700 font-mono">{currentActiveDest.subtotalWeightKg.toFixed(2)} kg</strong></span>
                <span className="bg-emerald-100 text-emerald-900 font-bold px-2 py-0.5 rounded border border-emerald-300 font-mono text-xs">
                  A Pagar: {formatBRL(currentActiveDest.subtotalPrice || currentActiveDest.items.reduce((s, it) => s + (it.totalPrice || 0), 0))}
                </span>
              </div>
            </div>

            {/* Section 3: Add Items for CURRENT Active Store */}
            <form onSubmit={handleAddItemToStore} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
              <div className="text-xs font-bold text-slate-800 uppercase flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-blue-600" />
                  Inserir Produto no Romaneio de: <span className="text-blue-700 font-black">{currentActiveDest.storeName}</span>
                </span>
                {activeProducts.length === 0 && (
                  <button type="button" onClick={onOpenNewProduct} className="text-blue-600 hover:underline">
                    + Cadastrar produto
                  </button>
                )}
              </div>

              {/* Product selector & Supplier */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2 relative">
                  <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                    <div className="flex items-center gap-2">
                      <label className="block text-xs font-bold text-slate-700 uppercase">
                        Selecionar Produto
                      </label>
                      {/* Alternador de Modo: Lista Suspensa vs Busca Escrita */}
                      <div className="inline-flex rounded-lg bg-slate-200/90 p-0.5 text-[11px] font-bold">
                        <button
                          type="button"
                          onClick={() => {
                            setProductSelectMode('dropdown');
                            setIsProductDropdownOpen(false);
                          }}
                          className={`px-2.5 py-0.5 rounded-md transition cursor-pointer flex items-center gap-1 ${
                            productSelectMode === 'dropdown'
                              ? 'bg-white text-blue-700 shadow-2xs font-extrabold'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                          title="Selecionar produto diretamente por menu suspenso (sem precisar digitar)"
                        >
                          <ListFilter className="w-3 h-3" />
                          <span>Lista Suspensa (Sem Digitar)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setProductSelectMode('search')}
                          className={`px-2.5 py-0.5 rounded-md transition cursor-pointer flex items-center gap-1 ${
                            productSelectMode === 'search'
                              ? 'bg-white text-blue-700 shadow-2xs font-extrabold'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                          title="Buscar produto digitando código ou nome"
                        >
                          <Search className="w-3 h-3" />
                          <span>Busca Escrita</span>
                        </button>
                      </div>
                    </div>

                    {selectedProductObj && (
                      <button
                        type="button"
                        onClick={handleClearProductSelection}
                        className="text-[11px] font-bold text-rose-600 hover:text-rose-800 flex items-center gap-1 cursor-pointer"
                        title="Limpar seleção atual"
                      >
                        <X className="w-3.5 h-3.5" />
                        Limpar seleção
                      </button>
                    )}
                  </div>

                  {productSelectMode === 'dropdown' ? (
                    /* Modo 1: Seleção Direta por Lista Suspensa (<select>) */
                    <div>
                      <select
                        value={selectedProductId}
                        onChange={(e) => handleProductSelect(e.target.value)}
                        className={`w-full px-3.5 py-2.5 text-sm font-bold border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white transition shadow-2xs cursor-pointer ${
                          selectedProductId 
                            ? 'border-emerald-500 bg-emerald-50/20 text-slate-900' 
                            : 'border-slate-300 text-slate-800'
                        }`}
                      >
                        <option value="">-- Clique aqui para selecionar o produto na lista suspensa --</option>
                        {activeProducts.map((p) => {
                          const st = stockMap.get(p.id);
                          const avBoxes = st ? st.currentBoxes : 0;
                          const avKg = st ? st.currentWeightKg : 0;
                          return (
                            <option key={p.id} value={p.id}>
                              {p.code} — {p.name} {p.supplierName ? `• Forn: ${p.supplierName}` : ''} • CD: {avBoxes} cx ({avKg.toFixed(1)} kg) {p.salePrice ? `• ${formatBRL(p.salePrice)}/kg` : ''}
                            </option>
                          );
                        })}
                      </select>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                        <span>💡 <strong>Menu Suspenso Direto:</strong> Escolha o produto com 1 clique sem precisar digitar.</span>
                        <button
                          type="button"
                          onClick={() => setProductSelectMode('search')}
                          className="text-blue-600 hover:underline font-bold"
                        >
                          Prefere pesquisar digitando? Busca Escrita →
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Modo 2: Busca Escrita por Digitação */
                    <div>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                          <Search className="w-4 h-4 text-blue-600" />
                        </div>

                        <input
                          type="text"
                          value={productSearchQuery}
                          onChange={(e) => {
                            setProductSearchQuery(e.target.value);
                            setIsProductDropdownOpen(true);
                            if (selectedProductId) {
                              setSelectedProductId('');
                            }
                          }}
                          onFocus={() => setIsProductDropdownOpen(true)}
                          placeholder="🔍 Digite para buscar: ex: 101, Contrafilé, Picanha, Bacon..."
                          className={`w-full pl-10 pr-16 py-2.5 text-sm font-semibold border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white transition shadow-2xs ${
                            selectedProductId 
                              ? 'border-emerald-500 bg-emerald-50/20 text-slate-900 font-bold' 
                              : 'border-slate-300 text-slate-900'
                          }`}
                        />

                        {/* Right controls inside input: clear (X) and dropdown toggle */}
                        <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center gap-1">
                          {productSearchQuery && (
                            <button
                              type="button"
                              onClick={handleClearProductSelection}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded-md transition cursor-pointer"
                              title="Limpar busca escrita"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setIsProductDropdownOpen(!isProductDropdownOpen)}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded-md transition cursor-pointer"
                            title="Ver lista de produtos"
                          >
                            <ChevronDown className={`w-4 h-4 transition-transform ${isProductDropdownOpen ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                      </div>

                      {/* Search Results Dropdown List */}
                      {isProductDropdownOpen && (
                        <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden max-h-72 flex flex-col animate-in fade-in zoom-in-95 duration-100">
                          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-[11px] text-slate-500 font-medium">
                            <span>{filteredProducts.length} produto(s) encontrado(s) na busca</span>
                            <button
                              type="button"
                              onClick={() => setIsProductDropdownOpen(false)}
                              className="text-slate-400 hover:text-slate-700 text-xs cursor-pointer font-bold"
                            >
                              Fechar ✕
                            </button>
                          </div>

                          <div className="overflow-y-auto divide-y divide-slate-100 p-1">
                            {filteredProducts.length === 0 ? (
                              <div className="p-4 text-center text-xs text-slate-500 space-y-2">
                                <p>Nenhum produto encontrado para "<strong>{productSearchQuery}</strong>".</p>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onOpenNewProduct();
                                    setIsProductDropdownOpen(false);
                                  }}
                                  className="text-blue-600 font-bold hover:underline"
                                >
                                  + Cadastrar novo produto agora
                                </button>
                              </div>
                            ) : (
                              filteredProducts.map((p) => {
                                const st = stockMap.get(p.id);
                                const avBoxes = st ? st.currentBoxes : 0;
                                const avKg = st ? st.currentWeightKg : 0;
                                const isSelected = p.id === selectedProductId;

                                return (
                                  <div
                                    key={p.id}
                                    onClick={() => handleProductSelect(p.id)}
                                    className={`p-2.5 rounded-lg flex items-center justify-between gap-3 cursor-pointer transition ${
                                      isSelected 
                                        ? 'bg-blue-50 border border-blue-200' 
                                        : 'hover:bg-slate-50'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <span className="font-mono font-bold text-xs bg-slate-100 text-blue-700 px-2 py-0.5 rounded border border-slate-200 shrink-0">
                                        {p.code}
                                      </span>
                                      <div className="min-w-0">
                                        <span className="font-bold text-xs text-slate-900 block truncate">{p.name}</span>
                                        <span className="text-[11px] text-slate-500 block truncate">
                                          {p.supplierName ? `Fornecedor: ${p.supplierName}` : 'Sem fornecedor'} 
                                          {p.defaultWeightKg ? ` • 1 ${p.unit} = ${p.defaultWeightKg} kg` : ''}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="text-right shrink-0 font-mono text-xs">
                                      <span className={`block font-bold text-[11px] ${avBoxes > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                                        {avBoxes} cx / {avKg.toFixed(1)} kg
                                      </span>
                                      {p.salePrice ? (
                                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 inline-block">
                                          {formatBRL(p.salePrice)}/kg
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Active Selection Details Pill */}
                  {selectedProductObj && (
                    <div className="mt-1.5 p-2.5 bg-emerald-50 border border-emerald-300 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs animate-in fade-in">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-emerald-600 text-white font-mono font-bold rounded text-[11px]">
                          CÓD: {selectedProductObj.code}
                        </span>
                        <span className="font-bold text-slate-900">{selectedProductObj.name}</span>
                        {selectedProductObj.supplierName && (
                          <span className="text-slate-500 text-[11px]">• Fornecedor: {selectedProductObj.supplierName}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2.5 text-[11px] font-mono">
                        {(() => {
                          const st = stockMap.get(selectedProductObj.id);
                          const avBoxes = st ? st.currentBoxes : 0;
                          const avKg = st ? st.currentWeightKg : 0;
                          return (
                            <span className={`font-bold ${avBoxes > 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                              Estoque no CD: {avBoxes} cx ({avKg.toFixed(1)} kg)
                            </span>
                          );
                        })()}
                        {selectedProductObj.salePrice ? (
                          <span className="bg-emerald-100 text-emerald-900 font-bold px-1.5 py-0.5 rounded border border-emerald-300">
                            {formatBRL(selectedProductObj.salePrice)}/kg
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Fornecedor da Mercadoria
                  </label>
                  <input
                    type="text"
                    value={itemSupplierName}
                    onChange={(e) => setItemSupplierName(e.target.value)}
                    placeholder="Puxado do produto ou digite"
                    list="suppliers-shipment-list"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white font-medium text-slate-800"
                  />
                  <datalist id="suppliers-shipment-list">
                    {suppliers.map(s => (
                      <option key={s.id} value={s.name} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Mode switch, Quantity, Weight & Unit Price */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Forma da Saída
                  </label>
                  <div className="grid grid-cols-2 rounded-lg border border-slate-300 p-0.5 bg-white text-xs">
                    <button
                      type="button"
                      onClick={() => setItemMode('by_unit')}
                      className={`py-1.5 rounded-md font-medium transition ${
                        itemMode === 'by_unit' ? 'bg-blue-600 text-white shadow-xs font-bold' : 'text-slate-600'
                      }`}
                    >
                      Por Caixas
                    </button>
                    <button
                      type="button"
                      onClick={() => setItemMode('by_weight')}
                      className={`py-1.5 rounded-md font-medium transition ${
                        itemMode === 'by_weight' ? 'bg-blue-600 text-white shadow-xs font-bold' : 'text-slate-600'
                      }`}
                    >
                      Por Quilos
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700 uppercase">
                      Qtd ({selectedProductObj?.unit || 'Caixas'})
                    </label>
                    <button
                      type="button"
                      onClick={handleSuggestBoxesFromWeight}
                      className="text-[10px] text-blue-600 hover:underline font-medium"
                      title="Calcular caixas com base no peso e peso padrão"
                    >
                      ⚡ Calcular cx
                    </button>
                  </div>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    value={quantityInput}
                    onChange={(e) => handleQuantityChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white font-bold text-slate-900"
                    placeholder="Ex: 15"
                    required
                  />
                </div>

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
                      ⚡ Sugerir peso
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={weightInput}
                      onChange={(e) => handleWeightChange(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white font-bold text-slate-900"
                      placeholder="Ex: 150.00"
                      required
                    />
                    <span className="absolute right-3 top-2 text-xs font-bold text-slate-400">kg</span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700 uppercase flex items-center gap-1">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                      Preço Puxado de Produtos
                    </label>
                    <span className="text-[10px] text-emerald-700 bg-emerald-100 font-bold px-1.5 py-0.5 rounded">
                      Puxado de Produtos
                    </span>
                  </div>
                  <div className="px-3 py-2 bg-slate-100 border border-slate-300 rounded-lg flex items-center justify-between h-[38px]">
                    <span className="text-xs text-slate-500 font-medium">Preço / kg:</span>
                    <div className="text-right">
                      {selectedProductObj && typeof selectedProductObj.salePrice === 'number' && selectedProductObj.salePrice > 0 ? (
                        <span className="text-sm font-black font-mono text-emerald-700">
                          {formatBRL(selectedProductObj.salePrice)} <span className="text-xs font-sans text-slate-500 font-bold">/kg</span>
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-slate-400">
                          {selectedProductObj ? 'R$ 0,00 /kg (Não informado em Produtos)' : 'Selecione o produto'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Financial Highlight Banner for this item */}
              <div className="p-3 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-md bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                    R$
                  </div>
                  <div>
                    <span className="text-[11px] uppercase font-bold text-emerald-800 block">
                      Valor a Pagar por este Produto:
                    </span>
                    <span className="text-xs text-slate-600">
                      Preço puxado do produto × kg informado no romaneio: {Number(weightInput || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg × {formatBRL(selectedProductObj?.salePrice || 0)}/kg
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-base font-black font-mono text-emerald-800 bg-white px-3 py-1 rounded-md border border-emerald-300 shadow-2xs">
                    {formatBRL(previewItemPrice)}
                  </span>
                </div>
              </div>

              {/* Manipulation info note */}
              <div className="text-[11px] text-slate-500 bg-slate-100 px-3 py-1.5 rounded border border-slate-200 flex items-center justify-between">
                <span>
                  💡 <strong>Base de Cálculo:</strong> O preço não é digitado no romaneio — ele é puxado automaticamente do cadastro de produtos e multiplicado pela quantidade de kg.
                </span>
                <span className="text-slate-400 font-mono text-[10px]">Preço Fixo do Cadastro</span>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!selectedProductId}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Inserir Produto em {currentActiveDest.storeName}
                </button>
              </div>
            </form>

            {/* List of items in current active store - User Requirement 3 */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <StoreIcon className="w-4 h-4 text-slate-600" />
                  Produtos no Romaneio de <strong className="text-blue-700">{currentActiveDest.storeName}</strong> ({currentActiveDest.items.length})
                </span>
                <div className="flex flex-wrap items-center gap-2 font-mono text-slate-700">
                  <span className="bg-white px-2.5 py-1 rounded border border-slate-200">
                    Subtotal: <strong className="text-blue-700">{currentActiveDest.subtotalBoxes} cx</strong> | <strong className="text-emerald-700">{currentActiveDest.subtotalWeightKg.toFixed(2)} kg</strong>
                  </span>
                  <span className="bg-emerald-100 text-emerald-900 font-bold px-2.5 py-1 rounded border border-emerald-300">
                    Total Loja: {formatBRL(currentActiveDest.subtotalPrice || currentActiveDest.items.reduce((s, it) => s + (it.totalPrice || 0), 0))}
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2.5 font-bold">Código</th>
                      <th className="px-3 py-2.5 font-bold">Produto</th>
                      <th className="px-3 py-2.5 font-bold">Fornecedor</th>
                      <th className="px-3 py-2.5 text-right font-bold">Qtd (cx)</th>
                      <th className="px-3 py-2.5 text-center font-bold">Unid</th>
                      <th className="px-3 py-2.5 text-right font-bold">Peso Total (kg)</th>
                      <th className="px-3 py-2.5 text-right font-bold">Preço Puxado (R$/kg)</th>
                      <th className="px-3 py-2.5 text-right font-bold">Valor a Pagar (R$)</th>
                      <th className="px-3 py-2.5 text-center font-bold">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {currentActiveDest.items.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                          Nenhum produto adicionado para <strong>{currentActiveDest.storeName}</strong> ainda.
                          <div className="text-[11px] text-slate-400 mt-1">
                            Use o formulário acima para adicionar os produtos e valores que serão entregues a esta loja.
                          </div>
                        </td>
                      </tr>
                    ) : (
                      currentActiveDest.items.map((it) => (
                        <tr key={it.id} className="hover:bg-slate-50/80">
                          <td className="px-3 py-2.5 font-mono font-bold text-blue-700">{it.productCode}</td>
                          <td className="px-3 py-2.5 font-semibold text-slate-900">{it.productName}</td>
                          <td className="px-3 py-2.5 text-slate-700 text-xs font-semibold uppercase">
                            {it.supplierName || productsMap.get(it.productId)?.supplierName || '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={it.quantityBoxes}
                              onChange={(e) => handleUpdateStoreItem(activeDestinationIndex, it.id, 'quantityBoxes', Number(e.target.value))}
                              className="w-20 px-2 py-1 text-right text-xs font-bold text-blue-800 border border-slate-300 rounded bg-white focus:ring-1 focus:ring-blue-500 font-mono"
                              title="Manipular quantidade"
                            />
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className="font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded text-[11px] uppercase">
                              {it.unit}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <div className="inline-flex items-center gap-1 justify-end">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={it.weightKg}
                                onChange={(e) => handleUpdateStoreItem(activeDestinationIndex, it.id, 'weightKg', Number(e.target.value))}
                                className="w-24 px-2 py-1 text-right text-xs font-bold text-emerald-800 border border-slate-300 rounded bg-white focus:ring-1 focus:ring-emerald-500 font-mono"
                                title="Manipular peso aferido em kg"
                              />
                              <span className="text-[10px] text-slate-500 font-semibold">kg</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono">
                            <div className="text-right">
                              <span className="font-bold text-slate-900 text-xs block">
                                {formatBRL(it.unitPrice)}
                              </span>
                              <span className="text-[10px] text-emerald-700 font-semibold block font-sans">
                                /kg (do produto)
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">
                            <span className="font-black text-emerald-800 font-mono text-sm block">
                              {formatBRL(
                                typeof it.totalPrice === 'number' && it.totalPrice > 0
                                  ? it.totalPrice
                                  : (Number(it.weightKg) || 0) * (Number(it.unitPrice) || 0)
                              )}
                            </span>
                            <span className="text-[10px] text-slate-400 block font-sans">
                              {(Number(it.weightKg) || 0).toFixed(2)} kg × {formatBRL(Number(it.unitPrice) || 0)}/kg
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItemFromStore(activeDestinationIndex, it.id)}
                              className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition cursor-pointer"
                              title="Remover produto da loja"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {currentActiveDest.items.length > 0 && (
                    <tfoot>
                      <tr className="bg-slate-100 font-bold text-xs border-t-2 border-slate-300">
                        <td colSpan={3} className="px-3 py-2.5 text-right uppercase text-slate-700">
                          Subtotal {currentActiveDest.storeName}:
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-blue-800">
                          {currentActiveDest.subtotalBoxes} cx
                        </td>
                        <td></td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-800">
                          {currentActiveDest.subtotalWeightKg.toFixed(2)} kg
                        </td>
                        <td className="text-right text-[10px] text-slate-500 uppercase px-2 font-sans">
                          Total a Pagar:
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-black text-emerald-800 text-sm whitespace-nowrap">
                          {formatBRL(currentActiveDest.subtotalPrice || currentActiveDest.items.reduce((s, it) => s + (it.totalPrice || 0), 0))}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Complete Romaneio Summary + Live Central CD Stock Deduction + Save */}
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4 sticky top-20">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-3">
              <FileText className="w-4 h-4 text-blue-600" />
              Resumo Geral do Romaneio
            </h2>

            {/* Requirement 4: Live CD Central Stock Deduction Preview */}
            <div className="bg-slate-900 text-white p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Estoque Central do CD
                  </span>
                </div>
                <span className="text-[10px] text-blue-300 font-mono font-bold bg-slate-800 px-2 py-0.5 rounded">
                  {centralCdDeductions.length} produto(s)
                </span>
              </div>

              <p className="text-[11px] text-slate-300 leading-tight">
                Todas as quantidades distribuídas sairão do Estoque Central do CD:
              </p>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {centralCdDeductions.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-2 text-center">
                    Nenhum produto adicionado ainda.
                  </p>
                ) : (
                  centralCdDeductions.map((cdItem) => {
                    const remainingBoxes = cdItem.stockBoxes - cdItem.deductedBoxes;
                    const remainingWeight = cdItem.stockWeightKg - cdItem.deductedWeightKg;
                    const isDeficit = remainingBoxes < 0;

                    return (
                      <div key={cdItem.productId} className="p-2.5 bg-slate-800/90 rounded-lg text-xs space-y-1.5 border border-slate-700/60">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-bold text-blue-300 font-mono text-[11px] mr-1.5">
                              {cdItem.productCode}
                            </span>
                            <span className="font-bold text-white">{cdItem.productName}</span>
                          </div>
                          <span className="font-black text-rose-400 font-mono">
                            -{cdItem.deductedBoxes} {cdItem.unit.toLowerCase()}
                          </span>
                        </div>

                        <div className="flex justify-between text-[11px] text-slate-300 pt-0.5 border-t border-slate-700/40">
                          <span>Inicial: <strong className="text-slate-100 font-mono">{cdItem.stockBoxes} cx</strong></span>
                          <span>
                            Após Romaneio:{' '}
                            <strong className={`font-mono ${isDeficit ? 'text-rose-400 font-black' : 'text-emerald-400'}`}>
                              {remainingBoxes} cx
                            </strong>
                          </span>
                        </div>

                        {/* Breakdown per store */}
                        <div className="text-[10px] text-slate-400 flex flex-wrap gap-1 pt-1">
                          {cdItem.byStore.map((st, i) => (
                            <span key={i} className="bg-slate-700/80 text-slate-200 px-1.5 py-0.5 rounded font-mono text-[10px]">
                              {st.storeName}: {st.boxes}cx ({st.weightKg.toFixed(1)}kg)
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Stores breakdown */}
            <div className="space-y-2 text-xs">
              <div className="font-semibold text-slate-700 mb-1 flex items-center justify-between">
                <span>Destinos Selecionados ({destinations.length}):</span>
                <button
                  type="button"
                  onClick={handleOpenStoreSelector}
                  className="text-[10px] text-blue-600 hover:underline"
                >
                  Alterar Seleção
                </button>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                {destinations.map((d, i) => (
                  <div 
                    key={d.id || i} 
                    onClick={() => setActiveDestinationIndex(i)}
                    className={`p-2 rounded-lg border flex justify-between items-center cursor-pointer transition ${
                      activeDestinationIndex === i 
                        ? 'bg-blue-50 border-blue-300' 
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div>
                      <span className="font-bold text-slate-900">{d.storeName}</span>
                      <span className="text-[10px] text-slate-500 block">{d.items.length} produto(s)</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-blue-700">{d.subtotalBoxes} cx</span>
                      <span className="text-[10px] text-emerald-700 font-bold block">{d.subtotalWeightKg.toFixed(2)} kg</span>
                      <span className="text-[11px] text-emerald-800 font-mono font-black block">
                        {formatBRL(d.subtotalPrice || d.items.reduce((s, it) => s + (it.totalPrice || 0), 0))}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="border-t border-slate-200 pt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Lojas Atendidas:</span>
                <span className="font-bold text-slate-900">{destinations.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total de Produtos:</span>
                <span className="font-bold text-slate-900">{grandTotalItems}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Geral Caixas:</span>
                <span className="font-black text-blue-700 text-lg">{grandTotalBoxes} cx</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Peso Total Geral:</span>
                <span className="font-black text-emerald-700 text-lg">
                  {grandTotalWeightKg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
                </span>
              </div>
              <div className="flex justify-between items-center bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-300 p-3 rounded-xl mt-1 shadow-2xs">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-900 block">
                    Valor Total a Pagar:
                  </span>
                  <span className="text-[10px] text-emerald-700">
                    Soma financeira geral
                  </span>
                </div>
                <span className="font-black text-emerald-800 text-xl font-mono">
                  {formatBRL(grandTotalPrice)}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 space-y-2">
              <button
                type="button"
                onClick={handleSaveRomaneio}
                disabled={isSubmitting || grandTotalItems === 0}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black text-sm rounded-xl transition shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <ArrowUpFromLine className="w-5 h-5" />
                {isSubmitting ? 'Gerando Romaneio...' : 'FINALIZAR E GERAR ROMANEIO'}
              </button>
              <p className="text-[11px] text-slate-400 text-center">
                Registra a saída do Estoque Central do CD e gera a versão de impressão do romaneio por loja.
              </p>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Saved Shipments / Romaneios List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden mt-8">
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-slate-600" />
            <div>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                {activeMainTab === 'finalized' ? 'Histórico Completo de Romaneios Finalizados' : 'Romaneios de Saída Emitidos'}
              </h3>
              <p className="text-xs text-slate-500">
                Visualize os romaneios concluídos, confira os valores a pagar calculados e reimprima os documentos.
              </p>
            </div>
          </div>
          <span className="text-xs text-slate-600 bg-white px-3 py-1.5 rounded-lg border border-slate-200 font-medium">
            Total: <strong className="text-blue-700">{shipments.length}</strong> romaneio(s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-5 py-3">Romaneio Nº</th>
                <th className="px-5 py-3">Data</th>
                <th className="px-5 py-3">Lojas Atendidas</th>
                <th className="px-5 py-3 text-right">Total Caixas</th>
                <th className="px-5 py-3 text-right">Peso (kg)</th>
                <th className="px-5 py-3 text-right">Valor Total (R$)</th>
                <th className="px-5 py-3">Responsável</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shipments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-slate-400 text-xs">
                    Nenhum romaneio emitido até o momento.
                  </td>
                </tr>
              ) : (
                shipments.map((ship) => (
                  <tr key={ship.id} className={`hover:bg-slate-50/80 ${ship.status === 'CANCELLED' ? 'bg-slate-100/50 opacity-60' : ''}`}>
                    <td className="px-5 py-3 font-mono font-bold text-blue-700">
                      Nº {ship.romaneioNumber}
                    </td>
                    <td className="px-5 py-3 text-slate-700">
                      {ship.date}
                    </td>
                    <td className="px-5 py-3 font-medium text-slate-900">
                      <div className="flex flex-wrap gap-1">
                        {ship.destinations?.map((d, i) => (
                          <span key={i} className="inline-block bg-slate-100 border border-slate-200 text-slate-800 text-[11px] px-2 py-0.5 rounded font-semibold">
                            {d.storeName}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-slate-900">
                      {ship.totalBoxes} cx
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-emerald-700">
                      {ship.totalWeightKg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
                    </td>
                    <td className="px-5 py-3 text-right font-black font-mono text-emerald-700">
                      {formatBRL(
                        typeof ship.totalPrice === 'number' && ship.totalPrice > 0
                          ? ship.totalPrice
                          : (ship.destinations || []).reduce((acc, d) => {
                              const dTotal = typeof d.subtotalPrice === 'number' && d.subtotalPrice > 0
                                ? d.subtotalPrice
                                : (d.items || []).reduce((s, it) => {
                                    const itPrice = typeof it.totalPrice === 'number' && it.totalPrice > 0
                                      ? it.totalPrice
                                      : (Number(it.weightKg) || 0) * (Number(it.unitPrice) || 0);
                                    return s + itPrice;
                                  }, 0);
                              return acc + dTotal;
                            }, 0)
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-600">
                      {ship.userName}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                        ship.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {ship.status === 'CONFIRMED' ? 'Confirmado' : 'Cancelado'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right space-x-1.5 whitespace-nowrap">
                      {/* Botão Visualizar Romaneio Finalizado */}
                      <button
                        type="button"
                        onClick={() => setViewingShipment(ship)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold transition border border-slate-300 cursor-pointer"
                        title="Visualizar Romaneio Finalizado"
                      >
                        <Eye className="w-3.5 h-3.5 text-blue-600" />
                        Visualizar
                      </button>

                      {/* Botão Alterar Peso do Romaneio */}
                      {ship.status === 'CONFIRMED' && (
                        <button
                          type="button"
                          onClick={() => {
                            setViewingShipment(ship);
                            setIsEditingWeights(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold transition cursor-pointer"
                          title="Visualizar e Alterar Pesos deste Romaneio"
                        >
                          <Scale className="w-3.5 h-3.5 text-amber-600" />
                          Alterar Peso
                        </button>
                      )}

                      {/* Botão REIMPRIMIR DOCUMENTO */}
                      <button
                        type="button"
                        onClick={() => handleOpenPrint(ship, true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
                        title="Imprimir Romaneio (Ctrl+P / Google Chrome)"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        IMPRIMIR ROMANEIO (Ctrl + P)
                      </button>

                      {ship.status === 'CONFIRMED' && (
                        <button
                          onClick={() => setCancellingShipment(ship)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                          title="Cancelar / Estornar Romaneio"
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

      {/* Requirement 2: Multi-Store Selection Modal */}
      {isStoreSelectorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400 flex items-center justify-center text-blue-400">
                  <StoreIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">
                    Selecionar Lojas para Distribuição Central
                  </h3>
                  <p className="text-xs text-slate-300">
                    Selecione as lojas que receberão mercadorias nesta distribuição. O sistema montará o romaneio de cada uma.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsStoreSelectorOpen(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Actions & Search Bar */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-3 shrink-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-slate-600 mr-1">Atalhos rápidos:</span>
                  <button
                    type="button"
                    onClick={handleSelectExampleStores}
                    className="px-2.5 py-1 text-xs font-bold bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-md transition border border-blue-300 flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3 text-blue-600" />
                    Exemplo: Loja 1, 6, 10 e 14
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectAllStores}
                    className="px-2.5 py-1 text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 rounded-md transition border border-slate-300 cursor-pointer"
                  >
                    Marcar Todas ({stores.length})
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAllStores}
                    className="px-2.5 py-1 text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 rounded-md transition border border-slate-300 cursor-pointer"
                  >
                    Desmarcar Todas
                  </button>
                </div>
              </div>

              {/* Search Box */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={storeFilterText}
                  onChange={(e) => setStoreFilterText(e.target.value)}
                  placeholder="Pesquisar loja por nome ou código..."
                  className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                />
              </div>
            </div>

            {/* Stores Grid */}
            <div className="p-4 overflow-y-auto flex-1 min-h-0 bg-slate-50/50">
              {stores.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-sm font-semibold text-slate-700">Nenhuma loja cadastrada no sistema.</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Cadastre suas lojas destinatárias personalizadas na aba "Lojas de Destino & Fornecedores".
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                  {stores
                    .filter(st => {
                      if (!storeFilterText.trim()) return true;
                      const term = storeFilterText.toLowerCase().trim();
                      return (
                        st.name.toLowerCase().includes(term) ||
                        (st.code && st.code.toLowerCase().includes(term))
                      );
                    })
                    .map((st) => {
                      const isSelected = selectedStoresSet.has(st.name.toUpperCase());
                      const currentDest = destinations.find(d => d.storeName.toUpperCase() === st.name.toUpperCase());
                      const itemsInCurrentDest = currentDest ? currentDest.items.length : 0;

                      return (
                        <div
                          key={st.id}
                          onClick={() => handleToggleStoreInModal(st.name)}
                          className={`p-3 rounded-xl border text-xs cursor-pointer transition select-none flex flex-col justify-between ${
                            isSelected
                              ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-300 shadow-xs'
                              : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1 mb-1">
                            <span className="font-bold text-slate-900 text-xs leading-tight">
                              {st.name}
                            </span>
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-300 shrink-0" />
                            )}
                          </div>
                          
                          <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-100">
                            <span className="text-slate-400 font-mono">{st.code || 'CD-DEST'}</span>
                            {itemsInCurrentDest > 0 && (
                              <span className="bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded font-mono">
                                {itemsInCurrentDest} produto(s)
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-4 bg-white border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-slate-600 font-medium">
                Selecionadas para o Romaneio: <strong className="text-blue-700 font-mono text-sm">{selectedStoresSet.size}</strong> de {stores.length} lojas
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsStoreSelectorOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmStoreSelection}
                  disabled={selectedStoresSet.size === 0}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition shadow-xs flex items-center gap-2 cursor-pointer"
                >
                  <CheckSquare className="w-4 h-4" />
                  Confirmar e Montar Romaneios ({selectedStoresSet.size} Lojas)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Romaneio Finalizado com Sucesso com botão destacado para Imprimir */}
      {finalizedShipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden">
            {/* Header com X para fechar */}
            <div className="p-6 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white text-center relative">
              <button
                type="button"
                onClick={() => setFinalizedShipment(null)}
                className="absolute top-4 right-4 p-2 text-white/80 hover:text-white rounded-xl hover:bg-white/20 transition cursor-pointer"
                title="Fechar (X)"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3 backdrop-blur-xs border border-white/30 shadow-inner">
                <CheckCircle2 className="w-10 h-10 text-white" />
              </div>
              <span className="text-[11px] uppercase tracking-widest font-black text-emerald-200 block mb-1">
                Romaneio Concluído com Sucesso
              </span>
              <h3 className="text-2xl font-black tracking-tight text-white">
                Romaneio Nº {finalizedShipment.romaneioNumber}
              </h3>
              <p className="text-xs text-emerald-100 mt-1 max-w-xs mx-auto">
                Mercadorias faturadas e estoque central do CD baixado com sucesso.
              </p>
            </div>

            {/* Content Details */}
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 divide-y divide-slate-200 text-xs">
                <div className="flex justify-between py-2 items-center">
                  <span className="text-slate-500 font-medium">Lojas Atendidas:</span>
                  <span className="font-bold text-slate-800 text-right max-w-[240px] truncate" title={finalizedShipment.destinations.map(d => d.storeName).join(', ')}>
                    {finalizedShipment.destinations.map(d => d.storeName).join(', ')} ({finalizedShipment.destinations.length})
                  </span>
                </div>
                <div className="flex justify-between py-2 items-center">
                  <span className="text-slate-500 font-medium">Total de Caixas:</span>
                  <span className="font-bold text-blue-700 font-mono text-sm">
                    {finalizedShipment.totalBoxes} cx
                  </span>
                </div>
                <div className="flex justify-between py-2 items-center">
                  <span className="text-slate-500 font-medium">Peso Total Aferido:</span>
                  <span className="font-bold text-slate-800 font-mono text-sm">
                    {finalizedShipment.totalWeightKg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
                  </span>
                </div>
                <div className="flex justify-between py-2.5 items-center bg-emerald-50/80 -mx-4 px-4 rounded-b-xl border-t border-emerald-200">
                  <div>
                    <span className="text-emerald-950 font-extrabold uppercase tracking-wider text-[11px] block">
                      Valor Total a Pagar:
                    </span>
                    <span className="text-[10px] text-emerald-700 font-medium">
                      Preço puxado do produto × kg informado
                    </span>
                  </div>
                  <span className="font-black text-emerald-800 font-mono text-xl">
                    {formatBRL(finalizedShipment.totalPrice)}
                  </span>
                </div>
              </div>

              {/* Botões de Ação com Destaque para REIMPRIMIR DOCUMENTO */}
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const toPrint = finalizedShipment;
                    setFinalizedShipment(null);
                    handleOpenPrint(toPrint, true);
                  }}
                  className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-black text-sm rounded-xl transition shadow-lg flex items-center justify-center gap-2 cursor-pointer hover:shadow-xl"
                >
                  <Printer className="w-5 h-5" />
                  IMPRIMIR O ROMANEIO (Ctrl + P / Google Chrome)
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const toView = finalizedShipment;
                    setFinalizedShipment(null);
                    setViewingShipment(toView);
                    setActiveMainTab('finalized');
                  }}
                  className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Eye className="w-4 h-4 text-blue-600" />
                  Visualizar Detalhes do Romaneio Finalizado
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const toView = finalizedShipment;
                    setFinalizedShipment(null);
                    setViewingShipment(toView);
                    setIsEditingWeights(true);
                    setActiveMainTab('finalized');
                  }}
                  className="w-full py-2.5 px-4 bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
                >
                  <Scale className="w-4 h-4 text-amber-600" />
                  Conferir e Alterar Pesos deste Romaneio
                </button>

                <button
                  type="button"
                  onClick={() => setFinalizedShipment(null)}
                  className="w-full py-2 px-4 text-slate-500 hover:text-slate-800 font-semibold text-xs rounded-xl transition text-center cursor-pointer"
                >
                  Fechar (X) e Criar Novo Romaneio
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Aba / Modal para Visualizar o Romaneio que já foi finalizado - Requisito: X para fechar e Botão para reimprimir documento e Alterar Peso */}
      {viewingShipment && (() => {
        const activeViewingDestinations = isEditingWeights ? tempDestinations : (viewingShipment.destinations || []);
        const activeTotalWeight = activeViewingDestinations.reduce((acc, d) => acc + (d.subtotalWeightKg || 0), 0);
        const activeTotalBoxes = activeViewingDestinations.reduce((acc, d) => acc + (d.subtotalBoxes || 0), 0);
        const activeTotalPrice = activeViewingDestinations.reduce((acc, d) => acc + (d.subtotalPrice || d.items.reduce((s, it) => s + (it.totalPrice || 0), 0)), 0);
        const activeTotalCostPrice = activeViewingDestinations.reduce((acc, d) => {
          return acc + (d.subtotalCostPrice || d.items.reduce((s, it) => s + (it.totalCostPrice || 0), 0));
        }, 0);
        const activeProfit = activeTotalPrice - activeTotalCostPrice;
        const activeProfitMargin = activeTotalPrice > 0 ? (activeProfit / activeTotalPrice) * 100 : 0;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/75 backdrop-blur-xs overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl border border-slate-200 my-auto overflow-hidden flex flex-col max-h-[92vh]">
              {/* Header com X para fechar, Botão Alterar Peso e Botão para reimprimir documento */}
              <div className="p-5 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-xs">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-base sm:text-lg text-white">
                        Romaneio Finalizado Nº {viewingShipment.romaneioNumber}
                      </h3>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        viewingShipment.status === 'CONFIRMED'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      }`}>
                        {viewingShipment.status === 'CONFIRMED' ? 'FINALIZADO / CONFIRMADO' : 'CANCELADO'}
                      </span>
                      {isEditingWeights && (
                        <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-500 text-slate-950 uppercase tracking-wider animate-pulse">
                          EDIÇÃO DE PESO, VENDA E CUSTO
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Data: {viewingShipment.date} • Emitido por: {viewingShipment.userName} • {viewingShipment.destinations?.length || 0} loja(s) atendida(s)
                    </p>
                  </div>
                </div>

                {/* Controles do Topo: Botão Alterar Peso + Botão Reimprimir Documento + X para fechar */}
                <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap justify-end">
                  {!isEditingWeights ? (
                    <button
                      type="button"
                      onClick={() => setIsEditingWeights(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-500 active:scale-98 text-white font-bold text-xs sm:text-sm rounded-xl transition shadow-md cursor-pointer"
                      title="Alterar peso, valor de venda e custo dos produtos deste romaneio"
                    >
                      <Scale className="w-4 h-4" />
                      <span>Alterar Pesos e Valores</span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={handleSaveWeights}
                        disabled={isSavingWeights}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs sm:text-sm rounded-xl transition shadow-md cursor-pointer active:scale-98"
                        title="Salvar alterações de peso, venda e custos no romaneio"
                      >
                        <Save className="w-4 h-4" />
                        <span>{isSavingWeights ? 'Salvando...' : 'Salvar Alterações'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingWeights(false);
                          setTempDestinations(JSON.parse(JSON.stringify(viewingShipment.destinations || [])));
                        }}
                        className="inline-flex items-center gap-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer"
                        title="Cancelar alterações"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Cancelar</span>
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      handleOpenPrint(viewingShipment, true);
                    }}
                    className="inline-flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm rounded-xl transition shadow-md cursor-pointer active:scale-98"
                    title="Imprimir Romaneio (Ctrl+P / Google Chrome)"
                  >
                    <Printer className="w-4 h-4" />
                    <span className="hidden sm:inline">IMPRIMIR (Ctrl + P)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setViewingShipment(null);
                      setIsEditingWeights(false);
                    }}
                    className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
                    title="Fechar (X)"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {/* Conteúdo com Detalhes do Romaneio e Cálculos de Valor a Pagar */}
              <div className="p-6 overflow-y-auto space-y-5 flex-1 bg-slate-50/50">
                {/* Feedback notifications */}
                {weightEditSuccess && (
                  <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-800 text-xs sm:text-sm font-bold flex items-center gap-2.5 animate-in fade-in">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <span>{weightEditSuccess}</span>
                  </div>
                )}

                {weightEditError && (
                  <div className="p-4 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 text-xs sm:text-sm font-bold flex items-center gap-2.5 animate-in fade-in">
                    <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                    <span>{weightEditError}</span>
                  </div>
                )}

                {/* Edit Weight Information Banner */}
                {isEditingWeights ? (
                  <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-xl text-slate-800 space-y-3 animate-in fade-in">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-1 border-b border-amber-200">
                      <div className="flex items-center gap-2 text-amber-950 font-black text-xs uppercase tracking-wide">
                        <Scale className="w-4 h-4 text-amber-600" />
                        <span>Modo de Alteração de Peso, Preço de Venda e Custo Ativado</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-blue-900 font-extrabold bg-blue-100 px-2 py-0.5 rounded-full border border-blue-200">
                          📄 Venda: Sai no Romaneio
                        </span>
                        <span className="text-[10px] text-amber-950 font-extrabold bg-amber-200 px-2.5 py-0.5 rounded-full border border-amber-300 flex items-center gap-1">
                          <Lock className="w-3 h-3 text-amber-700" />
                          Custo: NÃO sai no Romaneio
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-amber-950 font-medium leading-relaxed">
                      Altere o <strong>Peso (kg)</strong> aferido na balança, o <strong>Preço de Venda</strong> cobrado da loja (que sai no Romaneio impresso) e o <strong>Valor de Custo de Compra</strong> pago pela empresa. <strong className="text-amber-900">O Custo de Compra é exclusivo para controle interno e NUNCA aparece no Romaneio nem para as lojas.</strong>
                    </p>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1 border-t border-amber-200/80">
                      <label className="text-xs font-bold text-slate-700 shrink-0">Justificativa / Motivo da Alteração:</label>
                      <input
                        type="text"
                        value={weightEditReason}
                        onChange={(e) => setWeightEditReason(e.target.value)}
                        placeholder="Ex: Ajuste de pesagem e alinhamento de custos/preços de saída"
                        className="flex-1 px-3 py-1.5 text-xs border border-amber-300 rounded-lg bg-white focus:ring-2 focus:ring-amber-500 outline-none text-slate-800 font-medium"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs animate-in fade-in">
                    <div className="flex items-center gap-2 text-blue-900">
                      <Scale className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>
                        <strong>Conferência de Pesos e Valores:</strong> Você pode alterar o peso aferido na balança, os preços de venda para as lojas e os custos de compra a qualquer momento.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsEditingWeights(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition shadow-xs cursor-pointer shrink-0 self-start sm:self-auto"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Alterar Pesos e Valores
                    </button>
                  </div>
                )}

                {/* Cards de Resumo */}
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                  <div className="bg-white p-3 rounded-xl border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Lojas</span>
                    <span className="text-base font-black text-slate-800">{activeViewingDestinations.length} lojas</span>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Caixas</span>
                    <span className="text-base font-black font-mono text-blue-700">{activeTotalBoxes} cx</span>
                  </div>
                  <div className={`p-3 rounded-xl border transition ${
                    isEditingWeights 
                      ? 'bg-amber-50/80 border-2 border-amber-400 shadow-xs' 
                      : 'bg-white border-slate-200'
                  }`}>
                    <span className="text-[10px] uppercase font-bold text-slate-500 flex items-center justify-between">
                      <span>Peso Total</span>
                      {isEditingWeights && <span className="text-amber-700 font-black text-[9px]">EDIÇÃO</span>}
                    </span>
                    <span className={`text-base font-black font-mono ${isEditingWeights ? 'text-amber-900' : 'text-emerald-700'}`}>
                      {activeTotalWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
                    </span>
                  </div>
                  <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-3 rounded-xl border border-emerald-300">
                    <span className="text-[10px] uppercase font-bold text-emerald-800 block">Total Venda (Loja)</span>
                    <span className="text-base font-black font-mono text-emerald-800">{formatBRL(activeTotalPrice)}</span>
                  </div>
                  <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-300">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-amber-900 block">Custo Total Compra</span>
                      <span title="Somente Controle Interno">
                        <Lock className="w-2.5 h-2.5 text-amber-700" />
                      </span>
                    </div>
                    <span className="text-base font-black font-mono text-amber-950">{formatBRL(activeTotalCostPrice)}</span>
                  </div>
                  <div className={`p-3 rounded-xl border ${activeProfit >= 0 ? 'bg-emerald-50/60 border-emerald-300' : 'bg-rose-50/60 border-rose-300'}`}>
                    <span className={`text-[10px] uppercase font-bold block ${activeProfit >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
                      Lucro Interno
                    </span>
                    <span className={`text-base font-black font-mono ${activeProfit >= 0 ? 'text-emerald-900' : 'text-rose-900'}`}>
                      {formatBRL(activeProfit)}
                    </span>
                    {activeTotalPrice > 0 && activeTotalCostPrice > 0 && (
                      <span className={`text-[10px] font-bold block ${activeProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {activeProfitMargin.toFixed(1)}% margem
                      </span>
                    )}
                  </div>
                </div>

                {/* Lojas e Itens */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Detalhamento de Mercadorias por Loja
                    </h4>
                    {isEditingWeights && (
                      <span className="text-xs font-bold text-amber-700 flex items-center gap-1.5">
                        <Edit3 className="w-3.5 h-3.5" />
                        Edite o peso, valor de venda ou custo nos campos abaixo
                      </span>
                    )}
                  </div>

                  {activeViewingDestinations.map((dest, dIdx) => (
                    <div key={dest.id || dIdx} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                      <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <StoreIcon className="w-4 h-4 text-blue-600" />
                          <span className="font-black text-slate-900 text-sm uppercase">{dest.storeName}</span>
                          <span className="text-xs text-slate-500 font-mono">({dest.items.length} produto(s))</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs font-mono">
                          <span className="text-blue-700 font-bold">{dest.subtotalBoxes} cx</span>
                          <span className="text-slate-400">•</span>
                          <span className="text-emerald-700 font-bold">{dest.subtotalWeightKg.toFixed(2)} kg</span>
                          <span className="text-slate-400">•</span>
                          <span className="bg-emerald-100 text-emerald-900 font-bold px-2 py-0.5 rounded border border-emerald-300">
                            Venda: {formatBRL(dest.subtotalPrice || dest.items.reduce((s, it) => s + (it.totalPrice || 0), 0))}
                          </span>
                          <span className="bg-amber-100 text-amber-950 font-bold px-2 py-0.5 rounded border border-amber-300 flex items-center gap-1">
                            <Lock className="w-3 h-3 text-amber-700" />
                            Custo: {formatBRL(dest.subtotalCostPrice || dest.items.reduce((s, it) => s + (it.totalCostPrice || 0), 0))}
                          </span>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 text-[10px] uppercase text-slate-500 border-b border-slate-200 font-semibold">
                            <tr>
                              <th className="px-3 py-2">Código</th>
                              <th className="px-3 py-2">Produto</th>
                              <th className="px-3 py-2">Fornecedor</th>
                              <th className="px-3 py-2 text-right">Qtd (cx)</th>
                              <th className="px-3 py-2 text-right">
                                {isEditingWeights ? 'Peso (kg)' : 'Peso (kg)'}
                              </th>
                              <th className="px-3 py-2 text-right bg-blue-50/40 text-blue-900">
                                Preço Venda p/ Loja
                                <span className="block text-[8px] font-normal text-blue-700">📄 Sai no Romaneio</span>
                              </th>
                              <th className="px-3 py-2 text-right bg-amber-50/70 text-amber-950">
                                <span className="flex items-center justify-end gap-1 font-bold">
                                  <Lock className="w-2.5 h-2.5 text-amber-700" />
                                  Custo Compra (Empresa)
                                </span>
                                <span className="block text-[8px] font-normal text-amber-800">🔒 NÃO sai no Romaneio</span>
                              </th>
                              <th className="px-3 py-2 text-right">Lucro Estimado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {dest.items.map((it) => {
                              const bxs = Number(it.quantityBoxes) || 0;
                              const wt = Number(it.weightKg) || 0;
                              const isSalePerUnit = it.priceType === 'POR_UNIDADE';
                              const currentSaleTotal = typeof it.totalPrice === 'number' && it.totalPrice > 0
                                ? it.totalPrice
                                : (isSalePerUnit ? bxs * (Number(it.unitPrice) || 0) : wt * (Number(it.unitPrice) || 0));

                              const isCostPerKg = it.costPriceType === 'POR_KG';
                              const currentCostTotal = typeof it.totalCostPrice === 'number' && it.totalCostPrice > 0
                                ? it.totalCostPrice
                                : (isCostPerKg ? wt * (Number(it.unitCostPrice) || 0) : bxs * (Number(it.unitCostPrice) || 0));

                              const itemProfit = currentSaleTotal - currentCostTotal;
                              const itemMargin = currentSaleTotal > 0 ? (itemProfit / currentSaleTotal) * 100 : 0;

                              return (
                                <tr key={it.id} className="hover:bg-slate-50/60">
                                  <td className="px-3 py-2 font-mono font-bold text-blue-700">{it.productCode}</td>
                                  <td className="px-3 py-2 font-medium text-slate-900">{it.productName}</td>
                                  <td className="px-3 py-2 text-slate-700 font-medium uppercase">{it.supplierName || productsMap.get(it.productId)?.supplierName || '—'}</td>
                                  <td className="px-3 py-2 text-right font-mono text-slate-800">{it.quantityBoxes}</td>
                                  
                                  {/* Coluna de Peso */}
                                  <td className="px-3 py-2 text-right font-mono font-bold">
                                    {isEditingWeights ? (
                                      <div className="flex items-center justify-end gap-1">
                                        <input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={it.weightKg}
                                          onChange={(e) => handleUpdateItemValue(dest.id || String(dIdx), it.id, 'weightKg', e.target.value)}
                                          className="w-20 px-2 py-1 text-right font-mono font-black text-xs bg-amber-50 border-2 border-amber-500 rounded-lg focus:ring-2 focus:ring-amber-500 text-slate-900 outline-none shadow-xs"
                                          title="Digite o novo peso aferido na balança"
                                        />
                                        <span className="text-[11px] font-bold text-slate-500">kg</span>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setIsEditingWeights(true)}
                                        className="inline-flex items-center gap-1.5 px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold transition cursor-pointer group shadow-2xs"
                                        title="Clique para alterar pesos e valores deste produto"
                                      >
                                        <span className="text-emerald-800 font-mono">{it.weightKg.toFixed(2)} kg</span>
                                        <Edit3 className="w-3.5 h-3.5 text-amber-600 group-hover:scale-110 transition-transform" />
                                      </button>
                                    )}
                                  </td>

                                  {/* Coluna Preço de Venda (Saída para Loja) */}
                                  <td className="px-3 py-2 text-right bg-blue-50/20 font-mono">
                                    {isEditingWeights ? (
                                      <div className="space-y-1">
                                        <div className="flex items-center justify-end gap-1">
                                          <span className="text-[10px] font-bold text-slate-400">R$</span>
                                          <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={it.unitPrice !== undefined ? it.unitPrice : ''}
                                            onChange={(e) => handleUpdateItemValue(dest.id || String(dIdx), it.id, 'unitPrice', e.target.value)}
                                            placeholder="0.00"
                                            className="w-16 px-1.5 py-1 text-right font-mono font-bold text-xs bg-white border border-blue-300 rounded focus:border-blue-500 text-blue-900 outline-none"
                                            title="Preço unitário de venda cobrado da loja"
                                          />
                                          <select
                                            value={it.priceType || 'POR_KG'}
                                            onChange={(e) => handleUpdateItemValue(dest.id || String(dIdx), it.id, 'priceType', e.target.value)}
                                            className="text-[10px] bg-white border border-blue-300 rounded px-1 py-1 font-bold text-blue-800 cursor-pointer"
                                            title="Base do preço de venda"
                                          >
                                            <option value="POR_KG">/kg</option>
                                            <option value="POR_UNIDADE">/cx</option>
                                          </select>
                                        </div>
                                        <div className="text-[10px] text-slate-600 font-medium text-right">
                                          Total: <strong className="text-blue-900">{formatBRL(currentSaleTotal)}</strong>
                                        </div>
                                      </div>
                                    ) : (
                                      <div>
                                        <div className="font-bold text-slate-900">
                                          {it.unitPrice ? `${formatBRL(it.unitPrice)}${isSalePerUnit ? '/cx' : '/kg'}` : '—'}
                                        </div>
                                        <div className="text-[10px] text-emerald-800 font-bold">
                                          Total: {formatBRL(currentSaleTotal)}
                                        </div>
                                      </div>
                                    )}
                                  </td>

                                  {/* Coluna Valor de Custo de Compra (SOMENTE CONTROLE INTERNO) */}
                                  <td className="px-3 py-2 text-right bg-amber-50/50 font-mono">
                                    {isEditingWeights ? (
                                      <div className="space-y-1">
                                        <div className="flex items-center justify-end gap-1">
                                          <span className="text-[10px] font-bold text-slate-400">R$</span>
                                          <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={it.unitCostPrice !== undefined ? it.unitCostPrice : ''}
                                            onChange={(e) => handleUpdateItemValue(dest.id || String(dIdx), it.id, 'unitCostPrice', e.target.value)}
                                            placeholder="0.00"
                                            className="w-16 px-1.5 py-1 text-right font-mono font-bold text-xs bg-white border border-amber-400 rounded focus:border-amber-500 text-amber-950 outline-none"
                                            title="Valor de custo pago pela empresa (controle interno)"
                                          />
                                          <select
                                            value={it.costPriceType || 'POR_UNIDADE'}
                                            onChange={(e) => handleUpdateItemValue(dest.id || String(dIdx), it.id, 'costPriceType', e.target.value)}
                                            className="text-[10px] bg-white border border-amber-400 rounded px-1 py-1 font-bold text-amber-950 cursor-pointer"
                                            title="Base do custo de compra"
                                          >
                                            <option value="POR_UNIDADE">/cx</option>
                                            <option value="POR_KG">/kg</option>
                                          </select>
                                        </div>
                                        <div className="text-[10px] text-amber-900 font-medium text-right">
                                          Custo: <strong className="text-amber-950">{formatBRL(currentCostTotal)}</strong>
                                        </div>
                                      </div>
                                    ) : (
                                      <div>
                                        <div className="font-bold text-amber-950 flex items-center justify-end gap-1">
                                          <Lock className="w-2.5 h-2.5 text-amber-600" />
                                          {it.unitCostPrice ? `${formatBRL(it.unitCostPrice)}${isCostPerKg ? '/kg' : '/cx'}` : '—'}
                                        </div>
                                        <div className="text-[10px] text-amber-800 font-semibold">
                                          Custo Total: {formatBRL(currentCostTotal)}
                                        </div>
                                      </div>
                                    )}
                                  </td>

                                  {/* Coluna Lucro Estimado */}
                                  <td className="px-3 py-2 text-right font-mono">
                                    {currentCostTotal > 0 ? (
                                      <div>
                                        <span className={`font-black text-xs block ${itemProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                                          {formatBRL(itemProfit)}
                                        </span>
                                        <span className={`text-[10px] font-bold ${itemProfit >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                          {itemMargin.toFixed(1)}%
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="text-[10px] text-slate-400 italic">Sem custo</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>

                {viewingShipment.notes && (
                  <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs">
                    <span className="font-bold text-amber-900 block mb-1">Observações do Romaneio:</span>
                    <p className="text-amber-800 whitespace-pre-wrap">{viewingShipment.notes}</p>
                  </div>
                )}
              </div>

              {/* Footer com Ações: Salvar Novo Peso, Reimprimir Documento e Fechar */}
              <div className="p-4 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setViewingShipment(null);
                    setIsEditingWeights(false);
                  }}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  Fechar (X)
                </button>

                <div className="flex items-center gap-2">
                  {isEditingWeights ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingWeights(false);
                          setTempDestinations(JSON.parse(JSON.stringify(viewingShipment.destinations || [])));
                        }}
                        className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
                      >
                        Cancelar Edição
                      </button>

                      <button
                        type="button"
                        onClick={handleSaveWeights}
                        disabled={isSavingWeights}
                        className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition shadow-md flex items-center gap-2 cursor-pointer active:scale-98"
                      >
                        <Save className="w-4 h-4" />
                        {isSavingWeights ? 'Salvando...' : 'Salvar Alterações (Peso, Venda e Custo)'}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setIsEditingWeights(true)}
                        className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <Scale className="w-4 h-4" />
                        Alterar Peso e Valores deste Romaneio
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          handleOpenPrint(viewingShipment, true);
                        }}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition shadow-md flex items-center gap-2 cursor-pointer active:scale-98"
                      >
                        <Printer className="w-4 h-4" />
                        IMPRIMIR ROMANEIO (Ctrl + P)
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Print Romaneio Modal */}
      {printedShipment && (
        <RomaneioPrintModal
          shipment={printedShipment}
          settings={settings}
          products={products}
          autoPrint={autoPrintRomaneio}
          onEditWeights={(ship) => {
            setPrintedShipment(null);
            setAutoPrintRomaneio(false);
            setViewingShipment(ship);
            setIsEditingWeights(true);
          }}
          onClose={() => {
            setPrintedShipment(null);
            setAutoPrintRomaneio(false);
          }}
        />
      )}

      {/* Cancel Shipment Modal */}
      {cancellingShipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-200 overflow-hidden">
            <div className="p-5 bg-rose-50 border-b border-rose-200 flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-rose-600" />
              <div>
                <h3 className="font-bold text-rose-950 text-base">
                  Cancelar Romaneio Nº {cancellingShipment.romaneioNumber}?
                </h3>
                <p className="text-xs text-rose-700">
                  Esta ação irá estornar as mercadorias de volta ao estoque e registrar a auditoria.
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
                placeholder="Ex: Cancelamento da rota pelo cliente ou divergência de carga..."
                className="w-full p-2.5 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-rose-500"
                rows={3}
                required
              />
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => {
                  setCancellingShipment(null);
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
