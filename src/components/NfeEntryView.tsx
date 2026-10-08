import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Barcode, 
  Search, 
  Upload, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  Lock, 
  Package, 
  Layers, 
  ArrowRight, 
  Plus, 
  RotateCcw, 
  FileText, 
  Scale, 
  Box, 
  Info, 
  ExternalLink, 
  Copy, 
  Check, 
  ChevronDown, 
  ChevronUp, 
  Sparkles,
  Link as LinkIcon,
  ShieldCheck,
  ShieldAlert,
  Save,
  X,
  Building2,
  Calendar,
  FileCheck,
  Activity,
  Key,
  RefreshCw,
  FileCode,
  Settings,
  HelpCircle,
  Shield,
  Server,
  Eye,
  EyeOff
} from 'lucide-react';
import { Product, Supplier, UserAccount, Invoice } from '../types';
import { NfeParsedData, NfeProductItem, NfeDiagnosticTrace, NfeServerStatus } from '../types/nfe';
import { 
  validateNfeKey, 
  formatNfeKeyBlocks, 
  fetchNfeByAccessKey, 
  parseNfeXml, 
  cleanNfeKey, 
  mapCommercialUnitToSystem,
  fetchNfeDiagnostic,
  getNfeServerStatus,
  saveCertificateToBackend,
  saveGatewayToBackend,
  removeCertificateFromBackend,
  formatCnpj
} from '../services/nfeService';
import { registerInvoiceEntry, findInvoiceByAccessKey } from '../services/inventoryService';
import { createProduct } from '../services/productService';
import { isAdminGeral } from '../services/authPermissions';

const formatBRL = (val?: number | null) => {
  return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

interface NfeEntryViewProps {
  products: Product[];
  invoices: Invoice[];
  suppliers: Supplier[];
  currentUser: UserAccount;
  onNavigateToStock?: () => void;
  onNavigateToEntries?: () => void;
}

export const NfeEntryView: React.FC<NfeEntryViewProps> = ({
  products,
  invoices,
  suppliers,
  currentUser,
  onNavigateToStock,
  onNavigateToEntries
}) => {
  const isUserAdmin = isAdminGeral(currentUser);

  // Input states
  const [accessKeyInput, setAccessKeyInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Result NF-e data
  const [parsedNfe, setParsedNfe] = useState<NfeParsedData | null>(null);
  const [nfeItems, setNfeItems] = useState<NfeProductItem[]>([]);
  const [entryNotes, setEntryNotes] = useState('');
  const [saveCostsToCatalog, setSaveCostsToCatalog] = useState(true);

  // Weight input strings state to allow seamless typing of decimals (e.g. "98,5", "99.75")
  const [weightInputs, setWeightInputs] = useState<Record<number, string>>({});

  const initWeightInputs = (items: NfeProductItem[]) => {
    const map: Record<number, string> = {};
    items.forEach(it => {
      const wt = typeof it.receivedWeightKg === 'number' 
        ? it.receivedWeightKg 
        : (typeof it.nfeOriginalWeightKg === 'number' ? it.nfeOriginalWeightKg : (Number(it.weightKg) || 0));
      map[it.itemIndex] = wt > 0 ? wt.toFixed(2) : '';
    });
    setWeightInputs(map);
  };

  // Duplicate prevention states
  const [existingDuplicateInvoice, setExistingDuplicateInvoice] = useState<Invoice | null>(null);
  const [forceDuplicateAdmin, setForceDuplicateAdmin] = useState(false);
  const [adminJustification, setAdminJustification] = useState('');

  // UI accordion for API technical info
  const [showApiInfo, setShowApiInfo] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  // Modal for registering new product directly from NF-e item
  const [registeringItem, setRegisteringItem] = useState<NfeProductItem | null>(null);
  const [newProdCode, setNewProdCode] = useState('');
  const [newProdName, setNewProdName] = useState('');
  const [newProdUnit, setNewProdUnit] = useState<'CAIXA' | 'KG' | 'PECA' | 'UNIDADE'>('CAIXA');
  const [newProdWeight, setNewProdWeight] = useState(20);
  const [isSavingNewProduct, setIsSavingNewProduct] = useState(false);
  const [newProdError, setNewProdError] = useState<string | null>(null);

  // Submission state
  const [isConfirmingEntry, setIsConfirmingEntry] = useState(false);

  // Server & Certificate Status
  const [serverStatus, setServerStatus] = useState<NfeServerStatus | null>(null);

  // Diagnostic Modal States
  const [isDiagnosticModalOpen, setIsDiagnosticModalOpen] = useState(false);
  const [diagnosticTrace, setDiagnosticTrace] = useState<NfeDiagnosticTrace | null>(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosticError, setDiagnosticError] = useState<string | null>(null);
  const [diagnosticKeyInput, setDiagnosticKeyInput] = useState('');

  // Certificate Modal States
  const [isCertModalOpen, setIsCertModalOpen] = useState(false);
  const [certTab, setCertTab] = useState<'A1' | 'GATEWAY'>('A1');
  const [pfxFileName, setPfxFileName] = useState<string | null>(null);
  const [pfxBase64, setPfxBase64] = useState<string | null>(null);
  const [certPassphrase, setCertPassphrase] = useState('');
  const [showCertPassphrase, setShowCertPassphrase] = useState(false);
  const [certCnpj, setCertCnpj] = useState('');
  const [certUf, setCertUf] = useState('35');
  const [isSavingCert, setIsSavingCert] = useState(false);
  const [certMessage, setCertMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [gatewayUrlInput, setGatewayUrlInput] = useState('');
  const [gatewayTokenInput, setGatewayTokenInput] = useState('');
  const [isSavingGateway, setIsSavingGateway] = useState(false);

  // File input ref for XML upload
  const xmlFileInputRef = useRef<HTMLInputElement>(null);
  const certFileInputRef = useRef<HTMLInputElement>(null);
  const keyInputRef = useRef<HTMLInputElement>(null);

  // Load server status on mount
  useEffect(() => {
    getNfeServerStatus()
      .then(st => {
        setServerStatus(st);
        if (st.cnpj) setCertCnpj(st.cnpj);
        if (st.gatewayUrl) setGatewayUrlInput(st.gatewayUrl);
      })
      .catch(err => console.warn('Status do backend de NF-e indisponível:', err));
  }, []);

  // Focus key input on mount
  useEffect(() => {
    keyInputRef.current?.focus();
  }, []);

  // Live key validation feedback
  const keyValidation = useMemo(() => {
    if (!accessKeyInput.trim()) return null;
    return validateNfeKey(accessKeyInput);
  }, [accessKeyInput]);

  // Check duplicate key whenever input changes
  useEffect(() => {
    const clean = cleanNfeKey(accessKeyInput);
    if (clean.length === 44) {
      const found = findInvoiceByAccessKey(clean, invoices);
      if (found) {
        setExistingDuplicateInvoice(found);
      } else {
        setExistingDuplicateInvoice(null);
        setForceDuplicateAdmin(false);
      }
    } else {
      setExistingDuplicateInvoice(null);
      setForceDuplicateAdmin(false);
    }
  }, [accessKeyInput, invoices]);

  // Handle Search NF-e by Key
  const handleSearchNfe = async (overrideKey?: string) => {
    const keyToQuery = overrideKey || accessKeyInput;
    setErrorMessage(null);
    setSuccessMessage(null);

    const validation = validateNfeKey(keyToQuery);
    if (!validation.isValid || !validation.cleanKey) {
      setErrorMessage(validation.error || 'Chave de acesso inválida. Confira os 44 dígitos.');
      return;
    }

    // Check duplicate
    const duplicate = findInvoiceByAccessKey(validation.cleanKey, invoices);
    if (duplicate && !isUserAdmin) {
      setExistingDuplicateInvoice(duplicate);
      setErrorMessage(`Esta NF-e já foi registrada no sistema em ${duplicate.date} (NF nº ${duplicate.invoiceNumber}). Para evitar duplicidade de estoque, a reimportação é bloqueada.`);
      return;
    }

    setIsSearching(true);
    try {
      const data = await fetchNfeByAccessKey(validation.cleanKey, products, suppliers);
      setParsedNfe(data);
      setNfeItems(data.items);
      initWeightInputs(data.items);
      setEntryNotes(`Entrada oficial via Chave NF-e: ${formatNfeKeyBlocks(data.accessKey)} • Fornecedor: ${data.supplierName}`);
    } catch (err: any) {
      console.error('Erro ao consultar NF-e:', err);
      setErrorMessage(err.message || 'Não foi possível validar a NF-e correspondente a esta chave. Nenhum dado aproximado será utilizado.');
      setParsedNfe(null);
      setNfeItems([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Executa o teste de diagnóstico da chave de acesso e serviços
  const handleOpenDiagnostic = async (customKey?: string) => {
    const key = cleanNfeKey(customKey || accessKeyInput || diagnosticKeyInput);
    setDiagnosticKeyInput(key);
    setIsDiagnosticModalOpen(true);
    setIsDiagnosing(true);
    setDiagnosticError(null);
    setDiagnosticTrace(null);

    try {
      const res = await fetchNfeDiagnostic(key);
      setDiagnosticTrace(res.diagnostic);
    } catch (err: any) {
      setDiagnosticError(err.message || 'Erro ao executar teste de diagnóstico no servidor.');
    } finally {
      setIsDiagnosing(false);
    }
  };

  // Manipula seleção do arquivo PFX do certificado
  const handlePfxFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPfxFileName(file.name);
    setCertMessage(null);

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || result;
      setPfxBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  // Salva o Certificado Digital no backend seguro
  const handleSaveCertificate = async () => {
    if (!pfxBase64) {
      setCertMessage({ type: 'error', text: 'Selecione o arquivo do Certificado Digital (.pfx ou .p12).' });
      return;
    }
    if (!certPassphrase) {
      setCertMessage({ type: 'error', text: 'Informe a senha do Certificado Digital.' });
      return;
    }

    const cleanCnpj = certCnpj ? cleanNfeKey(certCnpj) : '';
    setIsSavingCert(true);
    setCertMessage(null);
    try {
      const res = await saveCertificateToBackend(pfxBase64, certPassphrase, cleanCnpj, certUf);
      setCertMessage({ type: 'success', text: res.message || 'Certificado configurado e testado com sucesso no servidor!' });
      const updated = await getNfeServerStatus();
      setServerStatus(updated);
      if (res.certInfo?.cnpj) {
        setCertCnpj(formatCnpj(res.certInfo.cnpj));
      }
      setTimeout(() => {
        setPfxBase64(null);
        setPfxFileName(null);
        setCertPassphrase('');
      }, 2500);
    } catch (err: any) {
      setCertMessage({ type: 'error', text: err.message || 'Erro ao validar certificado no servidor.' });
    } finally {
      setIsSavingCert(false);
    }
  };

  // Remove o Certificado do backend
  const handleRemoveCert = async () => {
    if (!confirm('Deseja realmente remover o Certificado Digital do servidor?')) return;
    try {
      await removeCertificateFromBackend();
      const updated = await getNfeServerStatus();
      setServerStatus(updated);
      setCertMessage({ type: 'success', text: 'Certificado removido do servidor com sucesso.' });
    } catch (err: any) {
      setCertMessage({ type: 'error', text: err.message || 'Erro ao remover certificado.' });
    }
  };

  // Salva configurações do Gateway DF-e
  const handleSaveGateway = async () => {
    if (!gatewayUrlInput.trim()) {
      setCertMessage({ type: 'error', text: 'Informe a URL do Gateway DF-e.' });
      return;
    }
    setIsSavingGateway(true);
    setCertMessage(null);
    try {
      const res = await saveGatewayToBackend(gatewayUrlInput.trim(), gatewayTokenInput.trim());
      setCertMessage({ type: 'success', text: res.message || 'Gateway configurado com sucesso!' });
      const updated = await getNfeServerStatus();
      setServerStatus(updated);
    } catch (err: any) {
      setCertMessage({ type: 'error', text: err.message || 'Erro ao salvar configuração do Gateway.' });
    } finally {
      setIsSavingGateway(false);
    }
  };

  // Handle Barcode Scanner 'Enter' key press
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearchNfe();
    }
  };

  // Handle XML File Upload
  const handleXmlUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const xmlContent = event.target?.result as string;
        const data = parseNfeXml(xmlContent, products);
        
        // Update input
        setAccessKeyInput(data.accessKey);
        setParsedNfe(data);
        setNfeItems(data.items);
        initWeightInputs(data.items);
        setEntryNotes(`Importação de arquivo XML da NF-e nº ${data.invoiceNumber} • Fornecedor: ${data.supplierName}`);

        // Check duplicate
        const duplicate = findInvoiceByAccessKey(data.accessKey, invoices);
        if (duplicate) {
          setExistingDuplicateInvoice(duplicate);
        } else {
          setExistingDuplicateInvoice(null);
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Erro ao processar arquivo XML.');
      }
    };

    reader.readAsText(file);
    // Reset file input
    if (e.target) e.target.value = '';
  };

  // Manual link product selector
  const handleManualLinkProduct = (itemIndex: number, productId: string) => {
    const prod = products.find(p => p.id === productId);
    if (!prod) return;

    setNfeItems(prev => prev.map(it => {
      if (it.itemIndex === itemIndex) {
        return {
          ...it,
          matchedProductId: prod.id,
          matchedProductCode: prod.code,
          matchedProductName: prod.name,
          matchedUnit: prod.unit,
          matchStatus: 'MANUAL_MATCHED',
          matchConfidence: 'Vínculo Manual pelo Operador'
        };
      }
      return it;
    }));
  };

  // Toggle item exclusion
  const handleToggleExcludeItem = (itemIndex: number) => {
    setNfeItems(prev => prev.map(it => {
      if (it.itemIndex === itemIndex) {
        return { ...it, isExcluded: !it.isExcluded };
      }
      return it;
    }));
  };

  // Handler to alter the received weight of an item (preserves original NF-e weight strictly)
  const handleUpdateItemReceivedWeight = (itemIndex: number, newWeightStr: string) => {
    // Keep raw typed value in local input map so typing decimals with comma/dot is smooth
    setWeightInputs(prev => ({ ...prev, [itemIndex]: newWeightStr }));

    const cleanStr = newWeightStr.replace(',', '.').trim();
    const parsed = parseFloat(cleanStr);

    setNfeItems(prev => prev.map(it => {
      if (it.itemIndex === itemIndex) {
        const origWt = typeof it.nfeOriginalWeightKg === 'number' ? it.nfeOriginalWeightKg : (Number(it.weightKg) || 0);
        const receivedWt = isNaN(parsed) || parsed < 0 ? 0 : Math.round(parsed * 100) / 100;
        const diff = Math.round((receivedWt - origWt) * 100) / 100;

        // If pricing is per KG, calculate cost total based on received weight
        let updatedTotalVal = it.totalValue;
        if (it.commercialUnit.toUpperCase() === 'KG' && it.unitValue > 0) {
          updatedTotalVal = Math.round(receivedWt * it.unitValue * 100) / 100;
        }

        return {
          ...it,
          receivedWeightKg: receivedWt,
          weightKg: receivedWt, // Weight that will enter the stock
          nfeOriginalWeightKg: origWt, // Permanent original reference, never overwritten
          weightDiffKg: diff,
          totalValue: updatedTotalVal
        };
      }
      return it;
    }));
  };

  // Handler onBlur to format decimal numbers nicely to 2 decimal places
  const handleItemWeightBlur = (itemIndex: number) => {
    const raw = weightInputs[itemIndex];
    if (raw === undefined) return;
    const cleanStr = raw.replace(',', '.').trim();
    const parsed = parseFloat(cleanStr);
    if (!isNaN(parsed) && parsed >= 0) {
      const formatted = parsed.toFixed(2);
      setWeightInputs(prev => ({ ...prev, [itemIndex]: formatted }));
      handleUpdateItemReceivedWeight(itemIndex, formatted);
    } else {
      const item = nfeItems.find(it => it.itemIndex === itemIndex);
      const fallback = item?.nfeOriginalWeightKg ?? 0;
      setWeightInputs(prev => ({ ...prev, [itemIndex]: fallback.toFixed(2) }));
      handleUpdateItemReceivedWeight(itemIndex, fallback.toFixed(2));
    }
  };

  // Handler to reset item weight back to the original NF-e weight
  const handleResetItemWeight = (itemIndex: number) => {
    const item = nfeItems.find(it => it.itemIndex === itemIndex);
    if (!item) return;
    const origWt = typeof item.nfeOriginalWeightKg === 'number' ? item.nfeOriginalWeightKg : (Number(item.weightKg) || 0);

    setWeightInputs(prev => ({ ...prev, [itemIndex]: origWt.toFixed(2) }));

    setNfeItems(prev => prev.map(it => {
      if (it.itemIndex === itemIndex) {
        let updatedTotalVal = it.totalValue;
        if (it.commercialUnit.toUpperCase() === 'KG' && it.unitValue > 0) {
          updatedTotalVal = Math.round(origWt * it.unitValue * 100) / 100;
        }
        return {
          ...it,
          receivedWeightKg: origWt,
          weightKg: origWt,
          weightDiffKg: 0,
          totalValue: updatedTotalVal
        };
      }
      return it;
    }));
  };

  // Open inline modal to create new product from NF-e item
  const openNewProductModal = (item: NfeProductItem) => {
    setRegisteringItem(item);
    setNewProdError(null);
    
    // Auto-generate next 3-digit code
    const codes = products
      .map(p => parseInt(p.code, 10))
      .filter(n => !isNaN(n) && n >= 100);
    const nextCode = codes.length > 0 ? String(Math.max(...codes) + 1) : '101';
    
    setNewProdCode(nextCode);
    setNewProdName(item.description.toUpperCase());
    setNewProdUnit(mapCommercialUnitToSystem(item.commercialUnit) as any);
    const itemWeight = item.receivedWeightKg ?? item.weightKg;
    setNewProdWeight(itemWeight && item.quantity > 0 ? Math.round((itemWeight / item.quantity) * 100) / 100 : 20);
  };

  // Save new product and link to item
  const handleSaveNewProduct = async () => {
    if (!registeringItem || !currentUser) return;
    if (!newProdCode.trim()) {
      setNewProdError('Informe o código interno do produto (2 a 4 dígitos).');
      return;
    }
    if (!newProdName.trim()) {
      setNewProdError('Informe o nome do produto.');
      return;
    }

    // Verify code not already taken
    const existing = products.find(p => p.code === newProdCode.trim());
    if (existing) {
      setNewProdError(`Código ${newProdCode} já está em uso pelo produto "${existing.name}". Escolha outro código.`);
      return;
    }

    setIsSavingNewProduct(true);
    try {
      const createdId = await createProduct({
        code: newProdCode.trim(),
        name: newProdName.trim().toUpperCase(),
        unit: newProdUnit,
        defaultWeightKg: newProdWeight || 20,
        supplierName: parsedNfe?.supplierName,
        supplierProductCode: registeringItem.supplierProductCode,
        ncm: registeringItem.ncm,
        costPrice: registeringItem.unitValue,
        costPriceType: registeringItem.commercialUnit.toUpperCase() === 'KG' ? 'POR_KG' : 'POR_UNIDADE',
        active: true
      }, currentUser);

      const savedCode = newProdCode.trim();
      const savedName = newProdName.trim().toUpperCase();

      // Link immediately
      setNfeItems(prev => prev.map(it => {
        if (it.itemIndex === registeringItem.itemIndex) {
          return {
            ...it,
            matchedProductId: createdId,
            matchedProductCode: savedCode,
            matchedProductName: savedName,
            matchedUnit: newProdUnit,
            matchStatus: 'MANUAL_MATCHED',
            matchConfidence: 'Recém-Cadastrado no Sistema'
          };
        }
        return it;
      }));

      setRegisteringItem(null);
      setSuccessMessage(`Produto "${savedCode} - ${savedName}" cadastrado e vinculado com sucesso!`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setNewProdError(err.message || 'Erro ao cadastrar produto.');
    } finally {
      setIsSavingNewProduct(false);
    }
  };

  // Compute active items and validation status
  const activeItems = useMemo(() => {
    return nfeItems.filter(it => !it.isExcluded);
  }, [nfeItems]);

  const unlinkedItems = useMemo(() => {
    return activeItems.filter(it => it.matchStatus === 'NOT_FOUND' || !it.matchedProductId);
  }, [activeItems]);

  const canConfirmEntry = useMemo(() => {
    if (!parsedNfe || activeItems.length === 0) return false;
    if (unlinkedItems.length > 0) return false;
    if (existingDuplicateInvoice && (!isUserAdmin || !forceDuplicateAdmin)) return false;
    return true;
  }, [parsedNfe, activeItems, unlinkedItems, existingDuplicateInvoice, isUserAdmin, forceDuplicateAdmin]);

  // Totals for conference with separated original vs received weights
  const conferenceTotals = useMemo(() => {
    let boxes = 0;
    let nfeOriginalWeight = 0;
    let receivedWeight = 0;
    let cost = 0;
    for (const it of activeItems) {
      boxes += Number(it.quantity) || 0;
      const orig = typeof it.nfeOriginalWeightKg === 'number' ? it.nfeOriginalWeightKg : (Number(it.weightKg) || 0);
      const rec = typeof it.receivedWeightKg === 'number' ? it.receivedWeightKg : (Number(it.weightKg) || 0);
      nfeOriginalWeight += orig;
      receivedWeight += rec;
      cost += Number(it.totalValue) || 0;
    }
    const diff = Math.round((receivedWeight - nfeOriginalWeight) * 100) / 100;
    const finalRecWeight = Math.round(receivedWeight * 100) / 100;
    return {
      boxes: Math.round(boxes * 100) / 100,
      nfeOriginalWeight: Math.round(nfeOriginalWeight * 100) / 100,
      receivedWeight: finalRecWeight,
      weight: finalRecWeight,
      diff,
      hasDiff: Math.abs(diff) >= 0.01,
      cost: Math.round(cost * 100) / 100
    };
  }, [activeItems]);

  // Handle Confirm Stock Entry
  const handleConfirmStockEntry = async () => {
    if (!parsedNfe || !currentUser) return;
    if (unlinkedItems.length > 0) {
      setErrorMessage(`Existem ${unlinkedItems.length} produto(s) não vinculados. Faça o vínculo ou cadastre-os antes de confirmar.`);
      return;
    }

    if (existingDuplicateInvoice && (!isUserAdmin || !forceDuplicateAdmin)) {
      setErrorMessage('Esta NF-e já foi importada anteriormente. Reimportação bloqueada para evitar duplicidade de estoque.');
      return;
    }

    setIsConfirmingEntry(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      // Map NfeProductItem to InvoiceItem with both original and received weights
      const invoiceItems = activeItems.map(it => {
        const prod = products.find(p => p.id === it.matchedProductId);
        const isCostPerKg = it.commercialUnit.toUpperCase() === 'KG';
        const origWt = typeof it.nfeOriginalWeightKg === 'number' ? it.nfeOriginalWeightKg : (Number(it.weightKg) || 0);
        const recWt = typeof it.receivedWeightKg === 'number' ? it.receivedWeightKg : (Number(it.weightKg) || 0);
        const diffWt = typeof it.weightDiffKg === 'number' ? it.weightDiffKg : Math.round((recWt - origWt) * 100) / 100;

        return {
          id: Math.random().toString(36).substring(2, 8),
          productId: it.matchedProductId || '',
          productCode: it.matchedProductCode || prod?.code || '',
          productName: it.matchedProductName || prod?.name || '',
          unit: (it.matchedUnit || prod?.unit || 'CAIXA') as any,
          quantityBoxes: Number(it.quantity) || 0,
          weightKg: recWt, // Peso efetivamente recebido (vai para o estoque)
          nfeOriginalWeightKg: origWt, // Peso original declarado na NF-e (referência permanente)
          receivedWeightKg: recWt,
          weightDiffKg: diffWt, // Diferença
          mode: (it.commercialUnit.toUpperCase() === 'KG' ? 'by_weight' : 'by_unit') as any,
          unitCostPrice: it.unitValue > 0 ? it.unitValue : undefined,
          costPriceType: (isCostPerKg ? 'POR_KG' : 'POR_UNIDADE') as any,
          totalCostPrice: it.totalValue > 0 ? it.totalValue : undefined,
          supplierProductCode: it.supplierProductCode,
          supplierProductName: it.description,
          ncm: it.ncm,
          commercialUnit: it.commercialUnit
        };
      });

      const weightDiffNote = conferenceTotals.hasDiff
        ? `[Divergência de Pesagem na Balança]: NF-e declarou ${conferenceTotals.nfeOriginalWeight.toFixed(2)} kg, recebido fisicamente ${conferenceTotals.receivedWeight.toFixed(2)} kg (Diferença: ${conferenceTotals.diff > 0 ? '+' : ''}${conferenceTotals.diff.toFixed(2)} kg).`
        : `[Pesagem na Balança]: ${conferenceTotals.receivedWeight.toFixed(2)} kg (conferência exata com a NF-e).`;

      const fullNotes = [
        entryNotes.trim(),
        weightDiffNote,
        forceDuplicateAdmin ? `[REIMPORTAÇÃO ADMINISTRATIVA]: ${adminJustification.trim() || 'Autorizada por Admin'}` : ''
      ].filter(Boolean).join('\n');

      const invoiceId = await registerInvoiceEntry({
        invoiceNumber: parsedNfe.invoiceNumber,
        supplierName: parsedNfe.supplierName,
        date: parsedNfe.emissionDate || new Date().toISOString().split('T')[0],
        notes: fullNotes,
        items: invoiceItems,
        user: currentUser,
        saveCostsToProducts: saveCostsToCatalog,
        accessKey: parsedNfe.accessKey,
        series: parsedNfe.series,
        supplierCnpj: parsedNfe.supplierCnpj,
        entryType: 'NFE_CHAVE',
        emissionDate: parsedNfe.emissionDate,
        originalNfeData: {
          accessKey: parsedNfe.accessKey,
          invoiceNumber: parsedNfe.invoiceNumber,
          series: parsedNfe.series,
          supplierName: parsedNfe.supplierName,
          supplierCnpj: parsedNfe.supplierCnpj,
          itemsCount: parsedNfe.items.length,
          totalBoxes: conferenceTotals.boxes,
          totalNfeOriginalWeightKg: conferenceTotals.nfeOriginalWeight,
          totalReceivedWeightKg: conferenceTotals.receivedWeight,
          totalWeightDiffKg: conferenceTotals.diff,
          hasWeightAdjustment: conferenceTotals.hasDiff,
          totalCostPrice: conferenceTotals.cost,
          source: parsedNfe.source
        }
      });

      const weightSuccessText = conferenceTotals.hasDiff
        ? `${conferenceTotals.boxes} caixas (${conferenceTotals.receivedWeight.toFixed(2)} kg recebidos na balança) lançadas no estoque geral. [NF-e Original: ${conferenceTotals.nfeOriginalWeight.toFixed(2)} kg • Dif: ${conferenceTotals.diff > 0 ? '+' : ''}${conferenceTotals.diff.toFixed(2)} kg]`
        : `${conferenceTotals.boxes} caixas (${conferenceTotals.receivedWeight.toFixed(2)} kg) lançadas no estoque geral.`;

      setSuccessMessage(
        `✅ Entrada de NF-e Nº ${parsedNfe.invoiceNumber} confirmada com sucesso! ${weightSuccessText}`
      );

      // Clear search
      setTimeout(() => {
        setParsedNfe(null);
        setNfeItems([]);
        setAccessKeyInput('');
        setExistingDuplicateInvoice(null);
        setForceDuplicateAdmin(false);
      }, 3500);

    } catch (err: any) {
      console.error('Erro ao dar entrada no estoque:', err);
      setErrorMessage(err.message || 'Erro ao registrar entrada de mercadorias.');
    } finally {
      setIsConfirmingEntry(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner / Explicação Institucional */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-6 shadow-xl border border-slate-700/60">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <Barcode className="w-6 h-6" />
              </span>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight">
                Entrada Automática por Chave de NF-e
              </h2>
              <span className="text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <Lock className="w-3 h-3" />
                Controle Interno de Estoque
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 max-w-3xl leading-relaxed">
              Bipe a chave de 44 dígitos com leitor de código de barras ou digite para carregar os produtos, pesos e custos automaticamente.
              <strong className="text-amber-300 ml-1">
                Finalidade exclusiva para controle de estoque interno e margem. Não realiza escrituração fiscal na SEFAZ e os custos de compra NUNCA saem no romaneio.
              </strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start lg:self-center shrink-0">
            {/* Indicador de Status do Certificado / Conexão */}
            <button
              type="button"
              onClick={() => setIsCertModalOpen(true)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                serverStatus?.hasCertificate
                  ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40'
                  : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40'
              }`}
              title="Gerenciar Certificado Digital A1 (.pfx) e Gateway de Consulta DF-e"
            >
              {serverStatus?.hasCertificate ? (
                <>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Certificado A1 Conectado</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  <span>Configurar Certificado A1</span>
                </>
              )}
            </button>

            {/* Botão de Diagnóstico Técnico */}
            <button
              type="button"
              onClick={() => handleOpenDiagnostic()}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-600/70 transition cursor-pointer"
              title="Diagnóstico em tempo real da consulta SEFAZ, chave de acesso e validações"
            >
              <Activity className="w-4 h-4 text-blue-400" />
              <span>Diagnóstico</span>
            </button>

            <button
              type="button"
              onClick={() => setShowApiInfo(!showApiInfo)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-600/60 transition cursor-pointer"
            >
              <Info className="w-4 h-4 text-blue-400" />
              <span>Arquitetura</span>
              {showApiInfo ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            <input
              type="file"
              ref={xmlFileInputRef}
              onChange={handleXmlUpload}
              accept=".xml"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => xmlFileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition shadow-md cursor-pointer"
              title="Carregar arquivo XML da NF-e baixado no Portal Nacional da SEFAZ"
            >
              <Upload className="w-4 h-4" />
              <span>Importar XML</span>
            </button>
          </div>
        </div>

        {/* Accordion Técnico de Explicação das APIs e Credenciais */}
        {showApiInfo && (
          <div className="mt-5 pt-4 border-t border-slate-700/80 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-300">
            <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700">
              <span className="font-bold text-emerald-400 block mb-1">Arquitetura Segura com Certificado A1</span>
              <p className="leading-relaxed">
                Por restrições de sandbox dos navegadores web, o JavaScript client-side não acessa certificados do Windows/Mac. A consulta oficial SEFAZ é realizada via <strong>Backend Node.js mTLS</strong> com o arquivo <code>.pfx</code> do destinatário, protegendo a chave privada.
              </p>
            </div>
            <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700">
              <span className="font-bold text-amber-400 block mb-1">Regra Fundamental: Zero Dados Aproximados</span>
              <p className="leading-relaxed">
                O sistema consulta exclusivamente o documento oficial emitido para a chave informada. Se não localizar a NF-e ou se houver divergência, a consulta é <strong>abortada com erro</strong>, sem criar notas fictícias nem estimar produtos.
              </p>
            </div>
            <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700">
              <span className="font-bold text-blue-400 block mb-1">Conferência Exclusivamente Interna</span>
              <p className="leading-relaxed">
                A operação serve apenas para conferir fisicamente a carga e lançar o estoque interno com o peso aferido na balança. Não realiza escrituração fiscal e não altera nada na SEFAZ.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Mensagens de Sucesso e Erro */}
      {errorMessage && (
        <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-xl text-rose-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in shadow-xs">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-xs sm:text-sm font-medium">
              <strong className="block text-rose-950 font-bold mb-0.5">Falha na Validação da NF-e:</strong>
              {errorMessage}
              <span className="block mt-1 text-[11px] text-rose-700 font-semibold">
                🛡️ Nenhum dado aproximado ou fictício foi inserido no sistema.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <button
              type="button"
              onClick={() => handleOpenDiagnostic(accessKeyInput)}
              className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-300 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <Activity className="w-3.5 h-3.5 text-rose-700" />
              <span>Ver Diagnóstico</span>
            </button>
            <button
              type="button"
              onClick={() => setIsCertModalOpen(true)}
              className="px-3 py-1.5 bg-white hover:bg-rose-50 text-slate-800 border border-slate-300 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Key className="w-3.5 h-3.5 text-slate-600" />
              <span>Configurar Certificado</span>
            </button>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-50 border-2 border-emerald-300 rounded-xl text-emerald-900 flex items-start gap-3 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm font-semibold">
            {successMessage}
          </div>
        </div>
      )}

      {/* Caixa de Entrada Principal (Bipar ou Digitar) */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <label className="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-wide flex items-center gap-2">
            <Barcode className="w-5 h-5 text-blue-600" />
            <span>Bipe ou informe a chave de acesso da NF-e</span>
          </label>
          <span className="text-[11px] font-mono font-bold text-slate-400">
            {cleanNfeKey(accessKeyInput).length} / 44 dígitos
          </span>
        </div>

        <div className="relative flex flex-col sm:flex-row items-stretch gap-2.5">
          <div className="relative flex-1">
            <input
              ref={keyInputRef}
              type="text"
              value={accessKeyInput}
              onChange={(e) => setAccessKeyInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ex: 35260302916265000100550010000458921184920391 (44 dígitos)"
              maxLength={60}
              className={`w-full pl-4 pr-10 py-3.5 text-xs sm:text-sm font-mono font-bold rounded-xl border-2 outline-none transition shadow-inner ${
                keyValidation?.isValid
                  ? 'border-emerald-500 bg-emerald-50/30 text-slate-900 focus:ring-2 focus:ring-emerald-500'
                  : keyValidation && !keyValidation.isValid
                  ? 'border-rose-400 bg-rose-50/20 text-slate-900 focus:ring-2 focus:ring-rose-400'
                  : 'border-slate-300 bg-slate-50/60 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500'
              }`}
            />
            {accessKeyInput && (
              <button
                type="button"
                onClick={() => {
                  setAccessKeyInput('');
                  setParsedNfe(null);
                  setNfeItems([]);
                  setExistingDuplicateInvoice(null);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                title="Limpar campo"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => handleSearchNfe()}
            disabled={isSearching || cleanNfeKey(accessKeyInput).length !== 44}
            className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs sm:text-sm rounded-xl transition shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-98 shrink-0"
          >
            {isSearching ? (
              <>
                <RotateCcw className="w-4 h-4 animate-spin" />
                <span>Consultando NF-e...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Buscar Dados da NF-e</span>
              </>
            )}
          </button>
        </div>

        {/* Feedback visual dos 44 dígitos */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          {keyValidation ? (
            keyValidation.isValid ? (
              <span className="text-emerald-700 font-bold flex items-center gap-1.5 bg-emerald-100/60 px-3 py-1 rounded-lg">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Chave válida: {keyValidation.decoded?.ufState} • Emissão: {keyValidation.decoded?.formattedDate} • CNPJ: {keyValidation.decoded?.formattedCnpj} • NF-e Nº {keyValidation.decoded?.invoiceNumber}
              </span>
            ) : (
              <span className="text-rose-700 font-bold flex items-center gap-1.5 bg-rose-100/60 px-3 py-1 rounded-lg">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                {keyValidation.error}
              </span>
            )
          ) : (
            <span className="text-slate-500 italic">
              💡 Aponte o leitor de código de barras para o código do DANFE impresso. O leitor preenche os 44 dígitos automaticamente.
            </span>
          )}

          {/* Ação rápida de diagnóstico */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleOpenDiagnostic(accessKeyInput)}
              className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 rounded-lg text-[10px] font-bold border border-slate-300 transition cursor-pointer flex items-center gap-1"
              title="Executar verificação detalhada da chave e conectividade SEFAZ"
            >
              <Activity className="w-3 h-3 text-blue-600" />
              <span>Diagnóstico Técnico</span>
            </button>
          </div>
        </div>

        {/* Alerta de Duplicidade */}
        {existingDuplicateInvoice && (
          <div className="mt-3 p-4 bg-amber-50 border-2 border-amber-300 rounded-xl text-amber-950 space-y-2 animate-in fade-in">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs sm:text-sm">
                <strong className="font-black text-amber-900">Esta NF-e já foi registrada no sistema:</strong>
                <p className="mt-1">
                  Nota Fiscal <strong>Nº {existingDuplicateInvoice.invoiceNumber}</strong> do fornecedor <strong>{existingDuplicateInvoice.supplierName}</strong> cadastrada em <strong>{existingDuplicateInvoice.date}</strong> por <strong>{existingDuplicateInvoice.userName}</strong> ({existingDuplicateInvoice.totalBoxes} caixas, {existingDuplicateInvoice.totalWeightKg.toFixed(2)} kg).
                </p>
              </div>
            </div>

            {isUserAdmin ? (
              <div className="pt-2 border-t border-amber-200 text-xs">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-amber-900">
                  <input
                    type="checkbox"
                    checked={forceDuplicateAdmin}
                    onChange={(e) => setForceDuplicateAdmin(e.target.checked)}
                    className="w-4 h-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                  <span>⚠️ Permitir reimportação excepcional (Apenas Administrador Geral)</span>
                </label>
                {forceDuplicateAdmin && (
                  <div className="mt-2 pl-6">
                    <input
                      type="text"
                      value={adminJustification}
                      onChange={(e) => setAdminJustification(e.target.value)}
                      placeholder="Motivo da reimportação (será gravado na auditoria)..."
                      className="w-full px-3 py-1.5 text-xs border border-amber-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-rose-700 font-bold pl-7">
                ⛔ Como você não é Administrador Geral, a reimportação é bloqueada para evitar duplicidade de estoque.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Tela de Conferência da NF-e Encontrada */}
      {parsedNfe && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden space-y-6">
          {/* Header da Conferência */}
          <div className="p-5 bg-gradient-to-r from-blue-900 via-slate-900 to-indigo-900 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-blue-500 text-white uppercase tracking-wider">
                  NF-e Nº {parsedNfe.invoiceNumber}
                </span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                  Série: {parsedNfe.series}
                </span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-blue-400" />
                  Emissão: {parsedNfe.emissionDate}
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-black tracking-tight">
                {parsedNfe.supplierName}
              </h3>
              <p className="text-xs text-slate-300 font-mono">
                CNPJ: {parsedNfe.supplierCnpj} {parsedNfe.supplierUf ? `• UF: ${parsedNfe.supplierUf}` : ''}
              </p>
            </div>

            {/* Chave de Acesso & Ação de Copiar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 bg-slate-800/80 p-3 rounded-xl border border-slate-700 text-xs">
              <div className="font-mono text-slate-200 font-semibold select-all text-[11px]">
                {formatNfeKeyBlocks(parsedNfe.accessKey)}
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(parsedNfe.accessKey);
                  setCopiedKey(true);
                  setTimeout(() => setCopiedKey(false), 2500);
                }}
                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer transition shrink-0"
              >
                {copiedKey ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedKey ? 'Copiado!' : 'Copiar'}</span>
              </button>
            </div>
          </div>

          {/* Cards de Resumo da Conferência */}
          <div className="px-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Itens na Nota</span>
              <span className="text-lg font-black font-mono text-slate-900">
                {activeItems.length} <span className="text-xs font-normal text-slate-500">produtos</span>
              </span>
            </div>
            <div className="bg-blue-50/60 p-3.5 rounded-xl border border-blue-200">
              <span className="text-[10px] uppercase font-bold text-blue-800 block">Total Caixas / Volumes</span>
              <span className="text-lg font-black font-mono text-blue-900">{conferenceTotals.boxes} cx</span>
            </div>
            <div className="bg-emerald-50/80 p-3.5 rounded-xl border border-emerald-300 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-emerald-900 flex items-center gap-1">
                  <Scale className="w-3.5 h-3.5 text-emerald-700" />
                  Peso Recebido (Estoque)
                </span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-200 text-emerald-900">
                  Balança
                </span>
              </div>
              <span className="text-lg font-black font-mono text-emerald-950 block mt-0.5">
                {conferenceTotals.receivedWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} kg
              </span>
              <div className="mt-1 pt-1 border-t border-emerald-200/80 flex items-center justify-between text-[10px]">
                <span className="text-emerald-800 font-medium">
                  NF-e: <strong className="font-mono">{conferenceTotals.nfeOriginalWeight.toFixed(2)} kg</strong>
                </span>
                {conferenceTotals.hasDiff ? (
                  <span className={`font-mono font-bold px-1.5 py-0.2 rounded text-[10px] ${
                    conferenceTotals.diff < 0 
                      ? 'bg-rose-100 text-rose-800 border border-rose-200' 
                      : 'bg-blue-100 text-blue-800 border border-blue-200'
                  }`}>
                    {conferenceTotals.diff > 0 ? '+' : ''}{conferenceTotals.diff.toFixed(2)} kg
                  </span>
                ) : (
                  <span className="text-emerald-700 text-[9px] font-semibold">Exato</span>
                )}
              </div>
            </div>
            <div className="bg-amber-50/70 p-3.5 rounded-xl border border-amber-300">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-amber-900 block">Custo Total Compra</span>
                <span title="Somente Controle Interno">
                  <Lock className="w-3 h-3 text-amber-700" />
                </span>
              </div>
              <span className="text-lg font-black font-mono text-amber-950">{formatBRL(conferenceTotals.cost)}</span>
              <span className="block text-[9px] text-amber-800 mt-1">🔒 Não sai no romaneio da loja</span>
            </div>
          </div>

          {/* Componentes Oficiais de Valor da NF-e (Conforme SEFAZ) */}
          <div className="mx-6 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="font-bold text-slate-800 uppercase text-[11px] flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-blue-600" />
                Totais Oficiais da NF-e Consultada:
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                Canal Oficial: <strong className="text-slate-800">{parsedNfe.apiProvider || parsedNfe.source}</strong>
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 pt-1 border-t border-slate-200 font-mono">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                <span className="text-[9px] uppercase font-sans font-semibold text-slate-400 block">Valor Produtos</span>
                <span className="font-bold text-slate-900 text-xs">{formatBRL(parsedNfe.totalProductsValue)}</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                <span className="text-[9px] uppercase font-sans font-semibold text-slate-400 block">Desconto</span>
                <span className="font-bold text-slate-700 text-xs">{parsedNfe.totalDiscount > 0 ? `-${formatBRL(parsedNfe.totalDiscount)}` : 'R$ 0,00'}</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                <span className="text-[9px] uppercase font-sans font-semibold text-slate-400 block">Frete</span>
                <span className="font-bold text-slate-700 text-xs">{formatBRL(parsedNfe.totalFreight)}</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                <span className="text-[9px] uppercase font-sans font-semibold text-slate-400 block">Seguro</span>
                <span className="font-bold text-slate-700 text-xs">{formatBRL(parsedNfe.totalInsurance)}</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                <span className="text-[9px] uppercase font-sans font-semibold text-slate-400 block">Outras Desp.</span>
                <span className="font-bold text-slate-700 text-xs">{formatBRL(parsedNfe.totalOtherExpenses)}</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                <span className="text-[9px] uppercase font-sans font-semibold text-slate-400 block">Impostos (ST/IPI)</span>
                <span className="font-bold text-slate-700 text-xs">{formatBRL(parsedNfe.totalTaxes || 0)}</span>
              </div>
              <div className="bg-blue-50/80 p-2.5 rounded-lg border border-blue-300 shadow-2xs">
                <span className="text-[9px] uppercase font-sans font-bold text-blue-800 block">Total da NF-e</span>
                <span className="font-black text-blue-950 text-xs">{formatBRL(parsedNfe.totalInvoiceValue)}</span>
              </div>
            </div>
          </div>

          {/* Status do Vínculo de Produtos */}
          <div className="px-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
              <div>
                <h4 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                  Conferência e Vínculo de Produtos com o Cadastro Interno
                </h4>
                <p className="text-xs text-slate-500">
                  O sistema identificou os produtos e os pesos originais da NF-e. Se necessário, ajuste o <strong>Peso Recebido</strong> na balança física antes de confirmar a entrada.
                </p>
              </div>

              {unlinkedItems.length > 0 ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-900 border border-amber-300 rounded-full text-xs font-bold animate-pulse">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  {unlinkedItems.length} produto(s) precisam de vínculo
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-full text-xs font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Todos os produtos vinculados com sucesso!
                </span>
              )}
            </div>
          </div>

          {/* Tabela de Produtos com Peso da NF-e e Peso Recebido Separados */}
          <div className="px-6 overflow-x-auto">
            <table className="w-full text-left text-xs border border-slate-200 rounded-xl overflow-hidden">
              <thead className="bg-slate-100 text-[10px] uppercase text-slate-600 border-b border-slate-200 font-bold">
                <tr>
                  <th className="px-3 py-2.5 text-center">Status Vínculo</th>
                  <th className="px-3 py-2.5">Código / Descrição na NF-e</th>
                  <th className="px-3 py-2.5">Produto no Cadastro Interno</th>
                  <th className="px-2.5 py-2.5 text-right">Qtd (cx)</th>
                  <th className="px-3 py-2.5 text-right bg-slate-200/60 text-slate-700">
                    <span className="block">Peso NF-e</span>
                    <span className="block text-[8px] font-normal text-slate-500 normal-case">Ref. Original</span>
                  </th>
                  <th className="px-3 py-2.5 text-right bg-emerald-50 text-emerald-950 border-x border-emerald-200">
                    <span className="flex items-center justify-end gap-1 font-bold">
                      <Scale className="w-3 h-3 text-emerald-700" />
                      Peso Recebido (kg)
                    </span>
                    <span className="block text-[8px] font-semibold text-emerald-700 normal-case">✏️ Editável • Vai p/ Estoque</span>
                  </th>
                  <th className="px-2.5 py-2.5 text-center">
                    <span className="block">Diferença</span>
                    <span className="block text-[8px] font-normal text-slate-500 normal-case">Recebido - NF-e</span>
                  </th>
                  <th className="px-3 py-2.5 text-right bg-amber-50/70 text-amber-950">
                    <span className="flex items-center justify-end gap-1 font-bold">
                      <Lock className="w-2.5 h-2.5 text-amber-700" />
                      Custo Unit.
                    </span>
                    <span className="block text-[8px] font-normal text-amber-800 normal-case">🔒 Controle interno</span>
                  </th>
                  <th className="px-3 py-2.5 text-right bg-amber-50/70 text-amber-950 font-bold">Total Item (R$)</th>
                  <th className="px-2.5 py-2.5 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {nfeItems.map((item) => {
                  const isLinked = !!item.matchedProductId;
                  const isExcluded = !!item.isExcluded;

                  const origWt = typeof item.nfeOriginalWeightKg === 'number' ? item.nfeOriginalWeightKg : (Number(item.weightKg) || 0);
                  const recWt = typeof item.receivedWeightKg === 'number' ? item.receivedWeightKg : (Number(item.weightKg) || 0);
                  const itemDiff = typeof item.weightDiffKg === 'number' ? item.weightDiffKg : Math.round((recWt - origWt) * 100) / 100;
                  const isModified = Math.abs(itemDiff) >= 0.01;
                  const weightInputValue = weightInputs[item.itemIndex] !== undefined 
                    ? weightInputs[item.itemIndex] 
                    : (recWt > 0 ? recWt.toFixed(2) : '');

                  return (
                    <tr
                      key={item.itemIndex}
                      className={`transition ${
                        isExcluded 
                          ? 'opacity-40 bg-slate-50' 
                          : !isLinked 
                          ? 'bg-amber-50/40 hover:bg-amber-50/70' 
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      {/* Status de Vínculo */}
                      <td className="px-3 py-3 text-center shrink-0">
                        {isExcluded ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                            IGNORADO
                          </span>
                        ) : isLinked ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <Check className="w-3 h-3 text-emerald-600" />
                            VINCULADO
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            NÃO ENCONTRADO
                          </span>
                        )}
                      </td>

                      {/* Dados Originais da NF-e */}
                      <td className="px-3 py-3">
                        <div className="font-mono text-slate-500 text-[11px]">
                          Cód: <strong className="text-slate-800">{item.supplierProductCode}</strong>
                          {item.ncm && <span className="ml-1.5 text-slate-400">NCM: {item.ncm}</span>}
                        </div>
                        <div className="font-bold text-slate-900 text-xs">
                          {item.description}
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">
                          Unidade NF-e: {item.commercialUnit}
                        </span>
                      </td>

                      {/* Vínculo no Cadastro Interno */}
                      <td className="px-3 py-3">
                        {isLinked ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-black text-xs text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                {item.matchedProductCode}
                              </span>
                              <strong className="text-slate-900 text-xs">{item.matchedProductName}</strong>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-500">
                                Confiança: <strong className="text-emerald-700">{item.matchConfidence || 'Confirmado'}</strong>
                              </span>
                              <select
                                value={item.matchedProductId || ''}
                                onChange={(e) => handleManualLinkProduct(item.itemIndex, e.target.value)}
                                className="text-[10px] text-blue-700 underline bg-transparent border-0 cursor-pointer font-bold outline-none"
                                title="Trocar vínculo para outro produto do catálogo"
                              >
                                <option value={item.matchedProductId}>Trocar vínculo...</option>
                                {products.map(p => (
                                  <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-bold text-amber-900">
                              Produto não encontrado no cadastro interno.
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {/* Dropdown para vincular a existente */}
                              <select
                                defaultValue=""
                                onChange={(e) => {
                                  if (e.target.value) handleManualLinkProduct(item.itemIndex, e.target.value);
                                }}
                                className="px-2 py-1 text-[11px] bg-white border border-amber-300 rounded-lg text-slate-800 font-bold outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                              >
                                <option value="" disabled>🔗 Vincular a Produto Existente...</option>
                                {products.map(p => (
                                  <option key={p.id} value={p.id}>{p.code} - {p.name} ({p.unit})</option>
                                ))}
                              </select>

                              {/* Botão para cadastrar novo */}
                              <button
                                type="button"
                                onClick={() => openNewProductModal(item)}
                                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer shadow-xs active:scale-98"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Cadastrar Novo Produto</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Quantidade (Caixas) */}
                      <td className="px-2.5 py-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                        {item.quantity} {item.commercialUnit}
                      </td>

                      {/* Peso Informado na NF-e (Referência Original - NUNCA SOBRESCRITO) */}
                      <td className="px-3 py-3 text-right bg-slate-50/60 font-mono text-slate-600 font-bold whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <FileText className="w-3 h-3 text-slate-400" />
                          <span>{origWt.toFixed(2)} kg</span>
                        </div>
                        <span className="block text-[8px] text-slate-400 font-sans font-medium uppercase">
                          NF-e Original
                        </span>
                      </td>

                      {/* Peso Recebido (Efetivamente aferido na balança - VAI PARA O ESTOQUE) */}
                      <td className="px-3 py-3 text-right bg-emerald-50/30 border-x border-emerald-100 whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="relative inline-flex items-center">
                            <input
                              type="text"
                              inputMode="decimal"
                              disabled={isExcluded}
                              value={weightInputValue}
                              onChange={(e) => handleUpdateItemReceivedWeight(item.itemIndex, e.target.value)}
                              onBlur={() => handleItemWeightBlur(item.itemIndex)}
                              placeholder="0,00"
                              title="Informe o peso efetivamente aferido na balança física"
                              className={`w-24 px-2 py-1.5 text-right text-xs font-mono font-bold rounded-lg border shadow-2xs outline-none transition focus:ring-2 focus:ring-emerald-500 ${
                                isModified
                                  ? 'bg-amber-50 border-amber-400 text-amber-950 font-black ring-1 ring-amber-300'
                                  : 'bg-white border-emerald-300 text-emerald-950 hover:border-emerald-400 font-bold'
                              } ${isExcluded ? 'opacity-50 cursor-not-allowed' : ''}`}
                            />
                            <span className="absolute right-2 pointer-events-none text-[10px] font-bold text-slate-400 font-mono">
                              kg
                            </span>
                          </div>

                          {/* Botão de reset rápido para o peso original da NF-e */}
                          {isModified && !isExcluded && (
                            <button
                              type="button"
                              onClick={() => handleResetItemWeight(item.itemIndex)}
                              title={`Restaurar para o peso original da NF-e (${origWt.toFixed(2)} kg)`}
                              className="p-1 rounded text-slate-400 hover:text-amber-700 hover:bg-amber-100 transition cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        {isModified && (
                          <span className="block text-[8px] font-bold text-amber-800 mt-0.5">
                            ✏️ Aferido na balança
                          </span>
                        )}
                      </td>

                      {/* Diferença entre Peso Recebido e Peso da NF-e */}
                      <td className="px-2.5 py-3 text-center whitespace-nowrap">
                        {Math.abs(itemDiff) >= 0.01 ? (
                          <span className={`inline-flex items-center gap-1 font-mono font-bold text-[10px] px-2 py-0.5 rounded-full border ${
                            itemDiff < 0
                              ? 'bg-rose-50 text-rose-700 border-rose-300'
                              : 'bg-blue-50 text-blue-700 border-blue-300'
                          }`}>
                            {itemDiff > 0 ? '+' : ''}{itemDiff.toFixed(2)} kg
                          </span>
                        ) : (
                          <span className="font-mono text-slate-400 text-[10px] font-medium">
                            0,00 kg
                          </span>
                        )}
                      </td>

                      {/* Custo Unitário */}
                      <td className="px-3 py-3 text-right font-mono font-bold bg-amber-50/50 text-amber-950 whitespace-nowrap">
                        {formatBRL(item.unitValue)}
                        <span className="text-[9px] text-amber-800 block">
                          /{item.commercialUnit.toUpperCase() === 'KG' ? 'kg' : 'cx'}
                        </span>
                      </td>

                      {/* Custo Total */}
                      <td className="px-3 py-3 text-right font-mono font-black bg-amber-50/50 text-amber-950 whitespace-nowrap">
                        {formatBRL(item.totalValue)}
                      </td>

                      {/* Ações */}
                      <td className="px-2.5 py-3 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleToggleExcludeItem(item.itemIndex)}
                          className={`px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer ${
                            isExcluded
                              ? 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                              : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                          }`}
                          title={isExcluded ? 'Incluir este produto na entrada' : 'Ignorar este produto da nota fiscal'}
                        >
                          {isExcluded ? 'Incluir' : 'Ignorar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-100 font-bold border-t border-slate-300 text-xs">
                <tr>
                  <td colSpan={3} className="px-3 py-2.5 text-right uppercase text-[10px] text-slate-600">
                    Totais da Carga:
                  </td>
                  <td className="px-2.5 py-2.5 text-right font-mono text-blue-900">
                    {conferenceTotals.boxes} cx
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-600 bg-slate-200/50">
                    <span title="Total do peso declarado na NF-e">{conferenceTotals.nfeOriginalWeight.toFixed(2)} kg</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-950 font-black bg-emerald-100/50 border-x border-emerald-200">
                    <span title="Total do peso conferido na balança que entrará no estoque">{conferenceTotals.receivedWeight.toFixed(2)} kg</span>
                  </td>
                  <td className="px-2.5 py-2.5 text-center font-mono">
                    {conferenceTotals.hasDiff ? (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        conferenceTotals.diff < 0 ? 'bg-rose-100 text-rose-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {conferenceTotals.diff > 0 ? '+' : ''}{conferenceTotals.diff.toFixed(2)} kg
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[10px]">0,00 kg</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right bg-amber-100/50 text-amber-950 text-[10px] uppercase font-bold">
                    Custo Total:
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-black bg-amber-100/50 text-amber-950">
                    {formatBRL(conferenceTotals.cost)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Opções e Botão de Confirmação */}
          <div className="p-6 bg-slate-50 border-t border-slate-200 space-y-4">
            {/* Box Informativo de Pesagem Física vs NF-e */}
            <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg shrink-0">
                  <Scale className="w-5 h-5" />
                </div>
                <div>
                  <h5 className="font-bold text-emerald-950">
                    Controle de Pesagem Física do Recebimento
                  </h5>
                  <p className="text-[11px] text-emerald-800">
                    O estoque interno será atualizado exclusivamente pelo <strong>Peso Recebido</strong> ({conferenceTotals.receivedWeight.toFixed(2)} kg). O <strong>Peso Original da NF-e</strong> ({conferenceTotals.nfeOriginalWeight.toFixed(2)} kg) permanece intacto para histórico e auditoria.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white px-3 py-2 rounded-lg border border-emerald-200/80 shadow-2xs self-end sm:self-center font-mono">
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 block uppercase font-sans font-semibold">Peso NF-e</span>
                  <span className="font-bold text-slate-700 text-xs">{conferenceTotals.nfeOriginalWeight.toFixed(2)} kg</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <div className="text-right">
                  <span className="text-[10px] text-emerald-700 block uppercase font-sans font-bold">Recebido</span>
                  <span className="font-black text-emerald-900 text-xs">{conferenceTotals.receivedWeight.toFixed(2)} kg</span>
                </div>
                {conferenceTotals.hasDiff && (
                  <div className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                    conferenceTotals.diff < 0 ? 'bg-rose-100 text-rose-800' : 'bg-blue-100 text-blue-800'
                  }`}>
                    {conferenceTotals.diff > 0 ? '+' : ''}{conferenceTotals.diff.toFixed(2)} kg
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-slate-800">
                  <input
                    type="checkbox"
                    checked={saveCostsToCatalog}
                    onChange={(e) => setSaveCostsToCatalog(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span>Atualizar preço de custo padrão no cadastro dos produtos vinculados</span>
                </label>
                <p className="text-[11px] text-slate-500 pl-6">
                  Se marcado, o sistema salva o valor de custo desta nota no cadastro geral para sugerir nas próximas compras.
                </p>
              </div>

              <div className="text-right">
                <span className="text-xs uppercase font-bold text-slate-500 block">Total a ser Lançado no Estoque:</span>
                <span className="text-base font-black font-mono text-emerald-800">
                  {conferenceTotals.boxes} caixas • {conferenceTotals.receivedWeight.toFixed(2)} kg
                </span>
                {conferenceTotals.hasDiff && (
                  <span className="block text-[11px] text-amber-800 font-semibold">
                    (Diferença da NF-e: {conferenceTotals.diff > 0 ? '+' : ''}{conferenceTotals.diff.toFixed(2)} kg)
                  </span>
                )}
              </div>
            </div>

            {/* Justificativa / Observações da Entrada */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Observações Internas da Entrada (Opcional):
              </label>
              <input
                type="text"
                value={entryNotes}
                onChange={(e) => setEntryNotes(e.target.value)}
                placeholder="Ex: Entrada conferida na balança do galpão pelo conferente..."
                className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-medium"
              />
            </div>

            {/* Aviso se houver itens não vinculados */}
            {unlinkedItems.length > 0 && (
              <div className="p-3 bg-amber-100 border border-amber-300 rounded-xl text-amber-900 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>
                  <strong>Atenção:</strong> Existem <strong>{unlinkedItems.length} produto(s)</strong> sem vínculo com o cadastro interno. Faça o vínculo ou cadastre-os na tabela acima antes de confirmar.
                </span>
              </div>
            )}

            {/* Botões de Ação Final */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setParsedNfe(null);
                  setNfeItems([]);
                }}
                className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Cancelar Conferência
              </button>

              <button
                type="button"
                onClick={handleConfirmStockEntry}
                disabled={!canConfirmEntry || isConfirmingEntry}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-xs sm:text-sm rounded-xl transition shadow-lg flex items-center gap-2 cursor-pointer active:scale-98"
              >
                {isConfirmingEntry ? (
                  <>
                    <RotateCcw className="w-4 h-4 animate-spin" />
                    <span>Confirmando Entrada no Estoque...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirmar Entrada no Estoque ({activeItems.length} produtos)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Rápido de Cadastro de Novo Produto */}
      {registeringItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-amber-100 text-amber-800">
                  <Package className="w-5 h-5" />
                </span>
                <h3 className="font-black text-base text-slate-900">
                  Cadastrar Novo Produto no Sistema
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRegisteringItem(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Preencha os dados abaixo para cadastrar o produto no catálogo interno e vinculá-lo imediatamente a esta NF-e.
            </p>

            {newProdError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold">
                {newProdError}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Código Interno:</label>
                  <input
                    type="text"
                    value={newProdCode}
                    onChange={(e) => setNewProdCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="Ex: 107"
                    maxLength={4}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold text-blue-700 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-[10px] text-slate-400">2 a 4 dígitos</span>
                </div>

                <div className="col-span-2">
                  <label className="font-bold text-slate-700 block mb-1">Nome / Descrição Interna:</label>
                  <input
                    type="text"
                    value={newProdName}
                    onChange={(e) => setNewProdName(e.target.value.toUpperCase())}
                    placeholder="Ex: PICANHA BOVINA"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold text-slate-900 uppercase outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Unidade Padrão:</label>
                  <select
                    value={newProdUnit}
                    onChange={(e) => setNewProdUnit(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="CAIXA">CAIXA</option>
                    <option value="KG">KG</option>
                    <option value="PECA">PEÇA</option>
                    <option value="UNIDADE">UNIDADE</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Peso Médio por Caixa (kg):</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.1"
                    value={newProdWeight}
                    onChange={(e) => setNewProdWeight(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-600 space-y-1">
                <div className="flex justify-between">
                  <span>Código no Fornecedor (cProd):</span>
                  <strong className="font-mono text-slate-900">{registeringItem.supplierProductCode}</strong>
                </div>
                {registeringItem.ncm && (
                  <div className="flex justify-between">
                    <span>NCM da NF-e:</span>
                    <strong className="font-mono text-slate-900">{registeringItem.ncm}</strong>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Preço de Custo na NF-e:</span>
                  <strong className="font-mono text-amber-950">{formatBRL(registeringItem.unitValue)}</strong>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setRegisteringItem(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveNewProduct}
                disabled={isSavingNewProduct}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-md"
              >
                {isSavingNewProduct ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Salvar e Vincular</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 1: Diagnóstico Técnico da NF-e */}
      {isDiagnosticModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8">
            <div className="p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  <Activity className="w-5 h-5" />
                </span>
                <div>
                  <h4 className="text-base font-black">Diagnóstico Técnico de Consulta NF-e</h4>
                  <p className="text-xs text-slate-300">Auditoria em tempo real de requisição, resposta e validação da chave</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDiagnosticModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {/* Caixa de Entrada para Testar Chave */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Chave de Acesso a ser Diagnosticada (44 dígitos):</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={diagnosticKeyInput}
                    onChange={(e) => setDiagnosticKeyInput(e.target.value)}
                    placeholder="Informe a chave de 44 dígitos para testar..."
                    className="flex-1 px-3.5 py-2 font-mono font-bold text-xs border border-slate-300 rounded-xl bg-slate-50 focus:bg-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleOpenDiagnostic(diagnosticKeyInput)}
                    disabled={isDiagnosing || cleanNfeKey(diagnosticKeyInput).length !== 44}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl transition flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    {isDiagnosing ? (
                      <>
                        <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                        <span>Testando...</span>
                      </>
                    ) : (
                      <>
                        <Activity className="w-3.5 h-3.5" />
                        <span>Executar Teste</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {diagnosticError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 space-y-1">
                  <strong className="block font-bold">Erro no Teste de Diagnóstico:</strong>
                  <p>{diagnosticError}</p>
                </div>
              )}

              {diagnosticTrace && (
                <div className="space-y-4 animate-in fade-in">
                  {/* Grid de Informações Técnicas */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-mono text-[11px]">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="text-[10px] uppercase font-sans text-slate-400 font-bold block">Chave Enviada:</span>
                      <strong className="text-slate-800 break-all select-all font-mono">
                        {formatNfeKeyBlocks(diagnosticTrace.accessKeySent)}
                      </strong>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="text-[10px] uppercase font-sans text-slate-400 font-bold block">Serviço Consultado:</span>
                      <strong className="text-slate-800 font-sans">{diagnosticTrace.serviceQueried}</strong>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="text-[10px] uppercase font-sans text-slate-400 font-bold block">Status da Resposta:</span>
                      <strong className={`font-sans ${diagnosticTrace.cStat === '138' ? 'text-emerald-700' : 'text-slate-700'}`}>
                        {diagnosticTrace.responseStatus} {diagnosticTrace.cStat ? `(cStat: ${diagnosticTrace.cStat})` : ''}
                      </strong>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="text-[10px] uppercase font-sans text-slate-400 font-bold block">Motivo / Retorno:</span>
                      <strong className="text-slate-800 font-sans">{diagnosticTrace.xMotivo || diagnosticTrace.errorMessage || 'Processado'}</strong>
                    </div>

                    {diagnosticTrace.returnedKey && (
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-[10px] uppercase font-sans text-slate-400 font-bold block">Chave Retornada:</span>
                        <strong className="text-slate-800 break-all font-mono">
                          {formatNfeKeyBlocks(diagnosticTrace.returnedKey)}
                        </strong>
                      </div>
                    )}

                    {diagnosticTrace.returnedCnpj && (
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-[10px] uppercase font-sans text-slate-400 font-bold block">CNPJ Retornado:</span>
                        <strong className="text-slate-800 font-mono">{formatCnpj(diagnosticTrace.returnedCnpj)}</strong>
                      </div>
                    )}

                    {diagnosticTrace.returnedInvoiceNumber && (
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-[10px] uppercase font-sans text-slate-400 font-bold block">NF-e Nº / Série:</span>
                        <strong className="text-slate-800 font-mono">Nº {diagnosticTrace.returnedInvoiceNumber} (Série {diagnosticTrace.returnedSeries || '1'})</strong>
                      </div>
                    )}

                    {diagnosticTrace.itemsCount !== undefined && (
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-[10px] uppercase font-sans text-slate-400 font-bold block">Itens / Valor Total:</span>
                        <strong className="text-slate-800 font-mono">
                          {diagnosticTrace.itemsCount} itens • {formatBRL(diagnosticTrace.totalInvoiceValue)}
                        </strong>
                      </div>
                    )}
                  </div>

                  {/* Tabela de Validações Obrigatórias */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-100 p-2.5 font-bold text-slate-800 text-xs border-b border-slate-200">
                      Checagens de Validação Obrigatória (Regra: Chave = Documento Exato)
                    </div>
                    <div className="divide-y divide-slate-100">
                      <div className="p-2.5 flex items-center justify-between">
                        <span>Chave de 44 dígitos coincide 100% com o documento retornado:</span>
                        {diagnosticTrace.validationChecks?.keyMatches ? (
                          <span className="font-bold text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Coincide</span>
                        ) : (
                          <span className="font-bold text-rose-700 flex items-center gap-1"><X className="w-3.5 h-3.5" /> Divergência / Não Retornado</span>
                        )}
                      </div>

                      <div className="p-2.5 flex items-center justify-between">
                        <span>CNPJ do emitente coincide com os dígitos 6-19 da chave:</span>
                        {diagnosticTrace.validationChecks?.cnpjMatches ? (
                          <span className="font-bold text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Coincide</span>
                        ) : (
                          <span className="font-bold text-rose-700 flex items-center gap-1"><X className="w-3.5 h-3.5" /> Divergência / Não Retornado</span>
                        )}
                      </div>

                      <div className="p-2.5 flex items-center justify-between">
                        <span>Número da NF-e coincide com os dígitos 25-33 da chave:</span>
                        {diagnosticTrace.validationChecks?.numberMatches ? (
                          <span className="font-bold text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Coincide</span>
                        ) : (
                          <span className="font-bold text-rose-700 flex items-center gap-1"><X className="w-3.5 h-3.5" /> Divergência / Não Retornado</span>
                        )}
                      </div>

                      <div className="p-2.5 flex items-center justify-between">
                        <span>Série da NF-e coincide com os dígitos 22-24 da chave:</span>
                        {diagnosticTrace.validationChecks?.seriesMatches ? (
                          <span className="font-bold text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Coincide</span>
                        ) : (
                          <span className="font-bold text-rose-700 flex items-center gap-1"><X className="w-3.5 h-3.5" /> Divergência / Não Retornado</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-[11px] space-y-1">
                <span className="font-bold block">🔒 Sigilo e Segurança Criptográfica:</span>
                <p>
                  Informações sensíveis do certificado digital, chaves privadas e senhas nunca são exibidas nesta tela de diagnóstico nem enviadas ao cliente web.
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setIsDiagnosticModalOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold text-xs cursor-pointer"
              >
                Fechar Diagnóstico
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Configuração do Certificado Digital & SEFAZ */}
      {isCertModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8">
            <div className="p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <Shield className="w-5 h-5" />
                </span>
                <div>
                  <h4 className="text-base font-black">Certificado Digital & Conexão SEFAZ</h4>
                  <p className="text-xs text-slate-300">Autenticação mTLS oficial para consulta pontual de NF-e</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCertModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {/* Abas */}
              <div className="flex border-b border-slate-200">
                <button
                  type="button"
                  onClick={() => setCertTab('A1')}
                  className={`px-4 py-2 font-bold text-xs border-b-2 -mb-px transition cursor-pointer ${
                    certTab === 'A1'
                      ? 'border-emerald-600 text-emerald-800'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Certificado A1 (.pfx / .p12)
                </button>
                <button
                  type="button"
                  onClick={() => setCertTab('GATEWAY')}
                  className={`px-4 py-2 font-bold text-xs border-b-2 -mb-px transition cursor-pointer ${
                    certTab === 'GATEWAY'
                      ? 'border-blue-600 text-blue-800'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Gateway DF-e (Nuvem Fiscal / Focus)
                </button>
              </div>

              {/* Mensagem de Feedback */}
              {certMessage && (
                <div className={`p-3 rounded-xl border text-xs font-semibold ${
                  certMessage.type === 'success'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-rose-50 border-rose-300 text-rose-900'
                }`}>
                  {certMessage.text}
                </div>
              )}

              {certTab === 'A1' ? (
                <div className="space-y-3.5">
                  {/* Status atual do certificado */}
                  {serverStatus?.hasCertificate ? (
                    <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-emerald-950 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          Certificado Digital A1 Ativo no Servidor
                        </span>
                        <button
                          type="button"
                          onClick={handleRemoveCert}
                          className="px-2.5 py-1 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-[10px] font-bold transition cursor-pointer"
                        >
                          Remover
                        </button>
                      </div>
                      <div className="text-[11px] text-emerald-900 font-mono space-y-1">
                        <div>Titular: <strong>{serverStatus.certSubject || 'Certificado ICP-Brasil'}</strong></div>
                        <div>CNPJ Vinculado: <strong>{serverStatus.cnpj ? formatCnpj(serverStatus.cnpj) : 'Detectado no Certificado'}</strong></div>
                        {serverStatus.certIssuer && <div>Emissor: <strong>{serverStatus.certIssuer}</strong></div>}
                        {serverStatus.certValidTo && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>Validade: <strong>{serverStatus.certValidTo}</strong></span>
                            {serverStatus.certDaysRemaining !== undefined && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                serverStatus.isExpired 
                                  ? 'bg-rose-100 text-rose-700 border border-rose-300' 
                                  : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              }`}>
                                {serverStatus.isExpired ? 'EXPIRADO' : `${serverStatus.certDaysRemaining} dias restantes`}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[11px]">
                      Nenhum Certificado Digital A1 está configurado no servidor atualmente. Carregue o arquivo abaixo para habilitar a consulta direta à SEFAZ Nacional via mTLS.
                    </div>
                  )}

                  {/* Formulário de Upload do Certificado */}
                  <div className="space-y-3">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">
                        Arquivo do Certificado Digital A1 (.pfx ou .p12):
                      </label>
                      <input
                        type="file"
                        ref={certFileInputRef}
                        onChange={handlePfxFileSelect}
                        accept=".pfx,.p12"
                        className="hidden"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => certFileInputRef.current?.click()}
                          className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold border border-slate-300 transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>{pfxFileName ? 'Trocar Arquivo' : 'Selecionar .pfx / .p12'}</span>
                        </button>
                        <span className="font-mono text-slate-600 text-[11px] truncate max-w-xs">
                          {pfxFileName || 'Nenhum arquivo selecionado'}
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-bold text-slate-700">
                          Senha do Certificado Digital:
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowCertPassphrase(!showCertPassphrase)}
                          className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer transition"
                        >
                          {showCertPassphrase ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          <span>{showCertPassphrase ? 'Ocultar senha' : 'Ver senha digitada'}</span>
                        </button>
                      </div>
                      <input
                        type={showCertPassphrase ? 'text' : 'password'}
                        value={certPassphrase}
                        onChange={(e) => setCertPassphrase(e.target.value)}
                        placeholder="Digite a senha do arquivo .pfx"
                        className="w-full px-3.5 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-sm"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        Dica: confira maiúsculas/minúsculas e verifique se não há espaços adicionais ao colar.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          CNPJ da Empresa:
                          <span className="text-[10px] text-slate-500 font-normal ml-1">(Opcional)</span>
                        </label>
                        <input
                          type="text"
                          value={certCnpj}
                          onChange={(e) => setCertCnpj(e.target.value)}
                          placeholder="00.000.000/0000-00 (ou auto-detectar)"
                          maxLength={18}
                          className="w-full px-3.5 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          UF do Autor:
                        </label>
                        <select
                          value={certUf}
                          onChange={(e) => setCertUf(e.target.value)}
                          className="w-full px-3.5 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white outline-none focus:ring-2 focus:ring-emerald-500 font-bold cursor-pointer"
                        >
                          <option value="35">35 - São Paulo (SP)</option>
                          <option value="31">31 - Minas Gerais (MG)</option>
                          <option value="33">33 - Rio de Janeiro (RJ)</option>
                          <option value="41">41 - Paraná (PR)</option>
                          <option value="42">42 - Santa Catarina (SC)</option>
                          <option value="43">43 - Rio Grande do Sul (RS)</option>
                          <option value="52">52 - Goiás (GO)</option>
                          <option value="51">51 - Mato Grosso (MT)</option>
                          <option value="50">50 - Mato Grosso do Sul (MS)</option>
                          <option value="29">29 - Bahia (BA)</option>
                        </select>
                      </div>
                    </div>

                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={handleSaveCertificate}
                        disabled={isSavingCert || !pfxBase64 || !certPassphrase}
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-md"
                      >
                        {isSavingCert ? (
                          <>
                            <RotateCcw className="w-4 h-4 animate-spin" />
                            <span>Validando e Testando na SEFAZ...</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-4 h-4" />
                            <span>Salvar e Testar Certificado</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-slate-600 leading-relaxed">
                    Se a sua empresa já utiliza um Gateway Homologado de DF-e (como Nuvem Fiscal, Focus NFe, SpeedNFe ou Webmania), informe o endpoint e token abaixo:
                  </p>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">URL Base da API do Gateway:</label>
                    <input
                      type="text"
                      value={gatewayUrlInput}
                      onChange={(e) => setGatewayUrlInput(e.target.value)}
                      placeholder="Ex: https://api.nuvemfiscal.com.br/v2"
                      className="w-full px-3.5 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Token de Autorização Bearer:</label>
                    <input
                      type="password"
                      value={gatewayTokenInput}
                      onChange={(e) => setGatewayTokenInput(e.target.value)}
                      placeholder="Token seguro do Gateway"
                      className="w-full px-3.5 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleSaveGateway}
                      disabled={isSavingGateway || !gatewayUrlInput}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-md"
                    >
                      {isSavingGateway ? (
                        <>
                          <RotateCcw className="w-4 h-4 animate-spin" />
                          <span>Salvando...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          <span>Salvar Gateway DF-e</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Explicação da Arquitetura Segura */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-600 space-y-1.5">
                <span className="font-bold text-slate-800 block">Arquitetura de Segurança mTLS:</span>
                <p className="leading-relaxed text-[11px]">
                  O navegador web (JavaScript) opera em sandbox e não pode acessar o repositório de certificados do sistema operacional. O certificado A1 é gerenciado pelo backend Node.js com TLS mútuo, mantendo a chave privada e a senha estritamente protegidas no servidor.
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setIsCertModalOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold text-xs cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
